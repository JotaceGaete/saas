// lemonsqueezy-webhook — recibe eventos de LemonSqueezy (order_created, subscription_*, etc.).
// Público: verify_jwt = false. Validación por X-Signature (HMAC-SHA256 del raw body).
// Usa custom_data (user_id, business_id, payment_id) como prioridad para actualizar el plan.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLAN_DURATION_DAYS = 30;
const ALLOWED_PLANS = ["starter", "pro", "business"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-event-name",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyLemonSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!secret || !signature || !rawBody) return false;
  try {
    const key = new TextEncoder().encode(secret);
    const msg = new TextEncoder().encode(rawBody);
    const alg = { name: "HMAC", hash: "SHA-256" };
    const cryptoKey = await crypto.subtle.importKey("raw", key, alg, false, ["sign"]);
    const sig = await crypto.subtle.sign(alg, cryptoKey, msg);
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return timingSafeEqual(computed.toLowerCase(), signature.toLowerCase());
  } catch (e) {
    console.error("[lemonsqueezy-webhook] verifyLemonSignature error:", e);
    return false;
  }
}

/** Mapea variant_id de LemonSqueezy a plan_slug. 1419355 => pro; VARIANT_FULL_ID / VARIANT_BUSINESS_ID => business. */
function mapVariantToPlan(variantId: string | number | undefined): string | null {
  if (variantId == null) return null;
  const v = String(variantId).trim();
  const proId = Deno.env.get("LEMONSQUEEZY_VARIANT_PRO_ID") ?? "";
  const fullId = Deno.env.get("LEMONSQUEEZY_VARIANT_FULL_ID") ?? Deno.env.get("LEMONSQUEEZY_VARIANT_BUSINESS_ID") ?? "";
  if (v === proId || v === "1419355") return "pro";
  if (v === fullId) return "business";
  return null;
}

type EventPayload = {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  data?: { type?: string; id?: string; attributes?: Record<string, unknown> };
};

function getRequiredEnv(): { ok: true; supabaseUrl: string; serviceRoleKey: string } | { ok: false; missing: string[] } {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const signingSecret = Deno.env.get("LEMONSQUEEZY_SIGNING_SECRET") ?? "";
  const variantProId = Deno.env.get("LEMONSQUEEZY_VARIANT_PRO_ID") ?? "";
  const variantFullId = Deno.env.get("LEMONSQUEEZY_VARIANT_FULL_ID") ?? Deno.env.get("LEMONSQUEEZY_VARIANT_BUSINESS_ID") ?? "";
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!signingSecret) missing.push("LEMONSQUEEZY_SIGNING_SECRET");
  if (!variantProId) missing.push("LEMONSQUEEZY_VARIANT_PRO_ID");
  if (!variantFullId) missing.push("LEMONSQUEEZY_VARIANT_FULL_ID o LEMONSQUEEZY_VARIANT_BUSINESS_ID");
  if (missing.length) return { ok: false, missing };
  return { ok: true, supabaseUrl, serviceRoleKey };
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    const envCheck = getRequiredEnv();
    if (!envCheck.ok) {
      console.error("[lemonsqueezy-webhook] Missing env:", envCheck.missing);
      return jsonResponse(
        { ok: false, error: "Server configuration error", missing: envCheck.missing },
        503
      );
    }
    const { supabaseUrl, serviceRoleKey } = envCheck;

    const rawBody = await req.text();
    const signature = req.headers.get("x-signature") ?? req.headers.get("X-Signature") ?? null;
    const eventName = req.headers.get("x-event-name") ?? req.headers.get("X-Event-Name") ?? null;
    const signingSecret = Deno.env.get("LEMONSQUEEZY_SIGNING_SECRET") ?? "";
    if (signingSecret && !(await verifyLemonSignature(rawBody, signature, signingSecret))) {
      console.warn("[lemonsqueezy-webhook] invalid signature");
      return jsonResponse({ ok: false, error: "Invalid signature" }, 401);
    }

    let body: EventPayload = {};
    try {
      body = rawBody ? (JSON.parse(rawBody) as EventPayload) : {};
    } catch {
      console.error("[lemonsqueezy-webhook] Invalid JSON payload");
      return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
    }

    const resolvedEventName = (body?.meta?.event_name ?? eventName ?? "").toString();
    const customData = (body?.meta?.custom_data ?? {}) as Record<string, unknown>;
    const data = body?.data;
    const dataType = data?.type ?? "";
    const dataId = data?.id != null ? String(data.id) : "";
    const attrs = (data?.attributes ?? {}) as Record<string, unknown>;

    const paymentId = customData?.payment_id as string | undefined;
    const businessId = customData?.business_id as string | undefined;
    const userId = customData?.user_id as string | undefined;

    console.log("[lemonsqueezy-webhook] received", {
      event_name: resolvedEventName,
      data_type: dataType,
      data_id: dataId,
      has_custom_data: !!(userId && businessId),
    });

    const db = createClient(supabaseUrl, serviceRoleKey);

    let targetBusinessId = businessId ?? null;
    let targetUserId = userId ?? null;
    const email = (attrs.user_email ?? "").toString().trim();

    if (!targetUserId || !targetBusinessId) {
      if (email) {
        const { data: listData } = await db.auth.admin.listUsers({ perPage: 1000 });
        const match = listData?.users?.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
        if (match) targetUserId = targetUserId ?? match?.id ?? null;
        if (!targetBusinessId && targetUserId) {
          const { data: biz } = await db
            .from("wa_businesses")
            .select("id")
            .eq("user_id", targetUserId)
            .limit(1)
            .maybeSingle();
          targetBusinessId = biz?.id ?? null;
        }
      }
    }

    const variantId = attrs.variant_id ?? (attrs.first_order_item as { variant_id?: number })?.variant_id;
    const planSlug = mapVariantToPlan(variantId);
    const status = (attrs.status ?? "").toString();
    const renewsAt = (attrs.renews_at ?? null) as string | null;
    const endsAt = (attrs.ends_at ?? null) as string | null;
    const trialEndsAt = (attrs.trial_ends_at ?? null) as string | null;
    const subscriptionId =
      dataType === "subscriptions"
        ? dataId
        : dataType === "subscription-invoices"
          ? (attrs.subscription_id != null ? String(attrs.subscription_id) : null)
          : (attrs.subscription_id != null ? String(attrs.subscription_id) : null);
    const orderId = dataType === "orders" ? dataId : (attrs.order_id != null ? String(attrs.order_id) : null);

    if (planSlug && !ALLOWED_PLANS.includes(planSlug)) {
      console.log("[lemonsqueezy-webhook] skipped: unknown plan_slug", planSlug);
      return jsonResponse({ ok: true, ignored: true, reason: "unknown_plan" }, 200);
    }

    const effectivePlanSlug = planSlug ?? "pro";
    const emailForSub = email || (targetUserId ? "webhook@custom" : "");

    if (subscriptionId || emailForSub) {
      try {
        const subIdForEvent =
          dataType === "subscriptions"
            ? dataId
            : dataType === "subscription-invoices"
              ? (attrs.subscription_id != null ? String(attrs.subscription_id) : null)
              : (attrs.subscription_id != null ? String(attrs.subscription_id) : null);
        await db.from("wa_subscription_events").insert({
          provider: "lemonsqueezy",
          event_name: resolvedEventName,
          provider_event_id: dataId,
          provider_subscription_id: subIdForEvent,
          payload: body as Record<string, unknown>,
        });
      } catch (e) {
        console.error("[lemonsqueezy-webhook] wa_subscription_events insert error:", e);
      }

      if (subscriptionId && emailForSub) {
        const subRecord = {
          user_id: targetUserId,
          business_id: targetBusinessId,
          email: emailForSub,
          provider: "lemonsqueezy",
          provider_customer_id: attrs.customer_id != null ? String(attrs.customer_id) : null,
          provider_subscription_id: subscriptionId,
          provider_order_id: orderId,
          provider_variant_id: variantId != null ? String(variantId) : null,
          plan_slug: effectivePlanSlug,
          status: status || "active",
          currency: "USD",
          amount: null as number | null,
          interval: "month",
          current_period_end: renewsAt ?? null,
          trial_ends_at: trialEndsAt,
          cancel_at: endsAt,
          cancelled_at: status === "cancelled" || status === "expired" ? new Date().toISOString() : null,
          metadata: { last_event: resolvedEventName, raw_attrs: attrs },
          updated_at: new Date().toISOString(),
        };
        try {
          await db
            .from("wa_subscriptions")
            .upsert(subRecord as Record<string, unknown>, {
              onConflict: "provider_subscription_id",
              ignoreDuplicates: false,
            });
        } catch (e) {
          console.error("[lemonsqueezy-webhook] wa_subscriptions upsert error:", e);
        }
      }
    }

    const isActivation =
      ["order_created", "subscription_created", "subscription_payment_success"].includes(resolvedEventName) &&
      ["paid", "active"].includes(status);

    if (isActivation && targetBusinessId && effectivePlanSlug) {
      const planExpiresAt =
        renewsAt ??
        (() => {
          const d = new Date();
          d.setDate(d.getDate() + PLAN_DURATION_DAYS);
          return d.toISOString();
        })();

      const { error: bizUpdateErr } = await db
        .from("wa_businesses")
        .update({
          plan_slug: effectivePlanSlug,
          plan_expires_at: planExpiresAt,
        })
        .eq("id", targetBusinessId);

      if (bizUpdateErr) {
        console.error("[lemonsqueezy-webhook] wa_businesses update error:", bizUpdateErr.message);
      } else {
        console.log("[lemonsqueezy-webhook] business plan updated", {
          business_id: targetBusinessId,
          plan_slug: effectivePlanSlug,
          plan_expires_at: planExpiresAt,
        });
      }

      if (paymentId && targetUserId) {
        const { error: paymentUpdateErr } = await db
          .from("wa_payments")
          .update({
            status: "approved",
            plan_activated_at: new Date().toISOString(),
            plan_expires_at: planExpiresAt,
            provider_payment_id: subscriptionId ?? orderId ?? paymentId,
          })
          .eq("id", paymentId)
          .eq("provider", "lemonsqueezy");
        if (paymentUpdateErr) {
          console.warn("[lemonsqueezy-webhook] wa_payments update (optional):", paymentUpdateErr.message);
        }
      }
    }

    if (
      ["subscription_cancelled", "subscription_expired"].includes(resolvedEventName) ||
      status === "cancelled" ||
      status === "expired"
    ) {
      if (targetBusinessId) {
        const { error: bizDowngradeErr } = await db
          .from("wa_businesses")
          .update({
            plan_slug: "starter",
            plan_expires_at: endsAt ?? new Date().toISOString(),
          })
          .eq("id", targetBusinessId);
        if (!bizDowngradeErr) {
          console.log("[lemonsqueezy-webhook] business downgraded to starter", {
            business_id: targetBusinessId,
          });
        }
      }
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    console.error("[lemonsqueezy-webhook] handler error:", err);
    return jsonResponse(
      { ok: false, error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
