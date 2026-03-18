// lemonsqueezy-webhook — recibe eventos de LemonSqueezy (order_created, subscription_*, etc.).
// Público: verify_jwt = false. Validación por X-Signature (HMAC-SHA256 del raw body).
// Eventos: order_created, subscription_created, subscription_updated, subscription_cancelled,
//          subscription_payment_success, subscription_payment_failed.
// Actualiza wa_subscriptions, wa_businesses, wa_payments y registra wa_subscription_events.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_PLANS = ['starter', 'control', 'pro', 'business'];
const PLAN_DURATION_DAYS = 30;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function verifyLemonSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !rawBody) return false;
  try {
    const key = new TextEncoder().encode(secret);
    const msg = new TextEncoder().encode(rawBody);
    const alg = { name: 'HMAC', hash: 'SHA-256' };
    const cryptoKey = await crypto.subtle.importKey('raw', key, alg, false, ['sign']);
    const sig = await crypto.subtle.sign(alg, cryptoKey, msg);
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return timingSafeEqual(computed.toLowerCase(), signature.toLowerCase());
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Mapea variant_id de LemonSqueezy a plan_slug interno.
 */
function mapVariantToPlan(variantId: string | number | undefined): string | null {
  if (variantId == null) return null;
  const v = String(variantId).trim();
  const proId = Deno.env.get('LEMONSQUEEZY_VARIANT_PRO_ID') ?? '';
  const fullId = Deno.env.get('LEMONSQUEEZY_VARIANT_FULL_ID') ?? Deno.env.get('LEMONSQUEEZY_VARIANT_BUSINESS_ID') ?? '';
  if (v === proId) return 'pro';
  if (v === fullId) return 'business';
  return null;
}

type EventPayload = {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> };
  data?: {
    type?: string;
    id?: string;
    attributes?: Record<string, unknown>;
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-signature') ?? req.headers.get('X-Signature') ?? null;
  const eventName = req.headers.get('x-event-name') ?? req.headers.get('X-Event-Name') ?? null;

  const signingSecret = Deno.env.get('LEMONSQUEEZY_SIGNING_SECRET') ?? '';
  if (signingSecret && !verifyLemonSignature(rawBody, signature, signingSecret)) {
    console.warn('[lemonsqueezy-webhook] invalid signature');
    return jsonResponse({ ok: false, error: 'Invalid signature' }, 401);
  }

  let body: EventPayload = {};
  try {
    body = rawBody ? (JSON.parse(rawBody) as EventPayload) : {};
  } catch {
    console.log('[lemonsqueezy-webhook] bad payload: invalid JSON');
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const resolvedEventName = (body?.meta?.event_name ?? eventName ?? '').toString();
  const customData = (body?.meta?.custom_data ?? {}) as Record<string, unknown>;
  const data = body?.data;
  const dataType = data?.type ?? '';
  const dataId = data?.id != null ? String(data.id) : '';
  const attrs = (data?.attributes ?? {}) as Record<string, unknown>;

  console.log('[lemonsqueezy-webhook] received', {
    event_name: resolvedEventName,
    data_type: dataType,
    data_id: dataId,
  });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[lemonsqueezy-webhook] env: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados');
    return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  const subIdForEvent =
    dataType === 'subscriptions' ? dataId
    : dataType === 'subscription-invoices' ? (attrs.subscription_id != null ? String(attrs.subscription_id) : null)
    : (attrs.subscription_id != null ? String(attrs.subscription_id) : null);

  await db.from('wa_subscription_events').insert({
    provider: 'lemonsqueezy',
    event_name: resolvedEventName,
    provider_event_id: dataId,
    provider_subscription_id: subIdForEvent,
    payload: body as Record<string, unknown>,
  });

  const email = (attrs.user_email ?? '').toString().trim();
  const customerId = attrs.customer_id != null ? String(attrs.customer_id) : null;
  const subscriptionId =
    dataType === 'subscriptions' ? dataId
    : dataType === 'subscription-invoices' ? (attrs.subscription_id != null ? String(attrs.subscription_id) : null)
    : (attrs.subscription_id != null ? String(attrs.subscription_id) : null);
  const orderId = dataType === 'orders' ? dataId : (attrs.order_id != null ? String(attrs.order_id) : null);
  const variantId = attrs.variant_id ?? (attrs.first_order_item as { variant_id?: number })?.variant_id;
  const planSlug = mapVariantToPlan(variantId);
  const status = (attrs.status ?? '').toString();
  const renewsAt = (attrs.renews_at ?? null) as string | null;
  const endsAt = (attrs.ends_at ?? null) as string | null;
  const trialEndsAt = (attrs.trial_ends_at ?? null) as string | null;

  const paymentId = customData?.payment_id as string | undefined;
  const businessId = customData?.business_id as string | undefined;
  const userId = customData?.user_id as string | undefined;

  if (!email) {
    console.log('[lemonsqueezy-webhook] skipped: no email in payload');
    return jsonResponse({ ok: true, ignored: true, reason: 'no_email' }, 200);
  }

  if (planSlug && !ALLOWED_PLANS.includes(planSlug)) {
    console.log('[lemonsqueezy-webhook] skipped: unknown plan_slug', planSlug);
    return jsonResponse({ ok: true, ignored: true, reason: 'unknown_plan' }, 200);
  }

  let targetBusinessId = businessId ?? null;
  let targetUserId = userId ?? null;

  if (!targetUserId || !targetBusinessId) {
    const { data: listData } = await db.auth.admin.listUsers({ perPage: 1000 });
    const match = listData?.users?.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
    if (match) targetUserId = match?.id ?? null;
    if (!targetBusinessId && targetUserId) {
      const { data: biz } = await db
        .from('wa_businesses')
        .select('id')
        .eq('user_id', targetUserId)
        .limit(1)
        .maybeSingle();
      targetBusinessId = biz?.id ?? null;
    }
  }

  let effectivePlanSlugForSub = planSlug ?? 'pro';
  if (!planSlug && subscriptionId) {
    const { data: existing } = await db
      .from('wa_subscriptions')
      .select('plan_slug')
      .eq('provider_subscription_id', subscriptionId)
      .maybeSingle();
    effectivePlanSlugForSub = existing?.plan_slug ?? 'pro';
  }

  const subRecord = {
    user_id: targetUserId,
    business_id: targetBusinessId,
    email,
    provider: 'lemonsqueezy',
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    provider_order_id: orderId,
    provider_variant_id: variantId != null ? String(variantId) : null,
    plan_slug: effectivePlanSlugForSub,
    status: status || 'active',
    currency: 'USD',
    amount: null as number | null,
    interval: 'month',
    current_period_end: renewsAt ?? null,
    trial_ends_at: trialEndsAt,
    cancel_at: endsAt,
    cancelled_at: status === 'cancelled' || status === 'expired' ? new Date().toISOString() : null,
    metadata: { last_event: resolvedEventName, raw_attrs: attrs },
    updated_at: new Date().toISOString(),
  };

  if (subscriptionId) {
    const { error: upsertSubErr } = await db
      .from('wa_subscriptions')
      .upsert(
        { ...subRecord },
        { onConflict: 'provider_subscription_id', ignoreDuplicates: false },
      );
    if (upsertSubErr) {
      console.error('[lemonsqueezy-webhook] wa_subscriptions upsert error:', upsertSubErr.message);
    }
  }

  const effectivePlanSlug = effectivePlanSlugForSub;
  const isActivation =
    ['order_created', 'subscription_created', 'subscription_payment_success'].includes(resolvedEventName) &&
    ['paid', 'active'].includes(status);

  if (isActivation && targetBusinessId && effectivePlanSlug) {
    const planExpiresAt = renewsAt ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() + PLAN_DURATION_DAYS);
      return d.toISOString();
    })();

    const { error: bizUpdateErr } = await db
      .from('wa_businesses')
      .update({
        plan_slug: effectivePlanSlug,
        plan_expires_at: planExpiresAt,
      })
      .eq('id', targetBusinessId);

    if (bizUpdateErr) {
      console.error('[lemonsqueezy-webhook] wa_businesses update error:', bizUpdateErr.message);
    } else {
      console.log('[lemonsqueezy-webhook] business plan updated', {
        business_id: targetBusinessId,
        plan_slug: effectivePlanSlug,
        plan_expires_at: planExpiresAt,
      });
    }

    if (paymentId && targetUserId) {
      const { error: paymentUpdateErr } = await db
        .from('wa_payments')
        .update({
          status: 'approved',
          plan_activated_at: new Date().toISOString(),
          plan_expires_at: planExpiresAt,
          provider_payment_id: subscriptionId ?? orderId ?? paymentId,
        })
        .eq('id', paymentId)
        .eq('provider', 'lemonsqueezy');

      if (paymentUpdateErr) {
        console.warn('[lemonsqueezy-webhook] wa_payments update (optional):', paymentUpdateErr.message);
      }
    }
  }

  if (['subscription_cancelled', 'subscription_expired'].includes(resolvedEventName) || status === 'cancelled' || status === 'expired') {
    if (targetBusinessId) {
      const { data: sub } = await db
        .from('wa_subscriptions')
        .select('plan_slug')
        .eq('business_id', targetBusinessId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const fallbackPlan = sub?.plan_slug ?? 'starter';
      const { error: bizDowngradeErr } = await db
        .from('wa_businesses')
        .update({
          plan_slug: 'starter',
          plan_expires_at: endsAt ?? new Date().toISOString(),
        })
        .eq('id', targetBusinessId);
      if (!bizDowngradeErr) {
        console.log('[lemonsqueezy-webhook] business downgraded to starter', { business_id: targetBusinessId });
      }
    }
  }

  return jsonResponse({ ok: true }, 200);
});
