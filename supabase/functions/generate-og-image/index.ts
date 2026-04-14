// generate-og-image — commits design_settings.shareImageUrl as og_image_url in wa_businesses.
// Only the explicit WhatsApp share image is a valid OG source; cover/logo are not used.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseDesignSettingsSafe } from "../_shared/catalogOgRender.ts";

const ALLOWED_ORIGINS = [
  "https://ventalink.app",
  "https://www.ventalink.app",
  "https://go.ventalink.app",
  "https://app.gong.cl",
  "http://localhost:4028",
  "http://localhost:3000",
  "http://127.0.0.1:4028",
  "http://127.0.0.1:3000",
];

function isAllowedOriginHost(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (
      u.origin === origin &&
      (u.hostname === "ventalink.app" ||
        u.hostname.endsWith(".ventalink.app") ||
        u.hostname === "app.gong.cl")
    );
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = (req.headers.get("origin") ?? "").trim();
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : isAllowedOriginHost(origin)
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  // Declared outside try so the catch block can reference it for error logging.
  // (const inside try {} is block-scoped and not accessible in catch {}.)
  let _logBusinessId = "unknown";

  try {
    const authHeader = (req.headers.get("authorization") ?? "").trim();
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "User not authenticated" }, 401, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration error" }, 500, corsHeaders);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user ?? null;
    if (!user?.id) return jsonResponse({ error: "User not authenticated" }, 401, corsHeaders);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const businessId = typeof body?.businessId === "string" ? body.businessId.trim() : "";
    if (!businessId) return jsonResponse({ error: "businessId is required" }, 400, corsHeaders);
    _logBusinessId = businessId;

    // ── 1. start ─────────────────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "generate-og-image:start",
      businessId,
      userId: user.id,
      force: body?.force === true,
    }));

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: biz, error: bizErr } = await adminClient
      .from("wa_businesses")
      .select("id, user_id, name, description, slug, updated_at, logo_url, cover_image_url, design_settings, og_image_url")
      .eq("id", businessId)
      .maybeSingle();

    if (bizErr || !biz?.id || (biz as { user_id?: string }).user_id !== user.id) {
      console.warn(JSON.stringify({
        event: "generate-og-image:error",
        error: "business_not_found_or_forbidden",
        businessId,
        userId: user.id,
        bizErr: bizErr?.message ?? null,
        bizFound: !!biz?.id,
        userIdMatch: biz ? (biz as { user_id?: string }).user_id === user.id : null,
      }));
      return jsonResponse({ error: "Business not found or access denied" }, 403, corsHeaders);
    }

    // ── 2. business loaded ────────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "generate-og-image:business_loaded",
      businessId,
      slug: (biz as Record<string, unknown>).slug,
      hasOgImageUrl: !!(biz as Record<string, unknown>).og_image_url,
      hasCoverCol: !!(biz as Record<string, unknown>).cover_image_url,
      hasDesignSettings: !!(biz as Record<string, unknown>).design_settings,
    }));

    const r = biz as Record<string, unknown>;
    const ds = parseDesignSettingsSafe(r.design_settings);

    // ── Guard 1: no shareImageUrl ────────────────────────────────────────────
    // Only the explicitly-uploaded WhatsApp image is a valid OG source.
    // Cover, logo and header images must not be used for og:image.
    const shareImageUrl = typeof ds?.shareImageUrl === "string" ? ds.shareImageUrl.trim() : "";
    if (!shareImageUrl) {
      console.log(JSON.stringify({
        event: "generate-og-image:skip",
        skip_reason: "no_share_image",
        businessId,
      }));
      return jsonResponse({ skipped: true, reason: "no_share_image" }, 200, corsHeaders);
    }

    // ── Guard 2: og_image_url already matches shareImageUrl, no force ────────
    const forceRegen = body?.force === true;
    const currentOgUrl = typeof r.og_image_url === "string" ? r.og_image_url.trim() : "";
    if (!forceRegen && currentOgUrl === shareImageUrl) {
      console.log(JSON.stringify({
        event: "generate-og-image:skip",
        skip_reason: "og_image_url_current",
        businessId,
        ogImageUrl: currentOgUrl,
      }));
      return jsonResponse({ skipped: true, reason: "og_image_url_current", ogImageUrl: currentOgUrl }, 200, corsHeaders);
    }

    // ── Persist — commit shareImageUrl as og_image_url ───────────────────────
    // shareImageUrl is already a user-supplied 1200×630 image; no render needed.
    console.log(JSON.stringify({
      event: "generate-og-image:db_update_start",
      businessId,
      ogImageUrl: shareImageUrl,
      force: forceRegen,
    }));

    const { error: updateErr } = await adminClient
      .from("wa_businesses")
      .update({ og_image_url: shareImageUrl })
      .eq("id", businessId)
      .eq("user_id", user.id);

    if (updateErr) {
      console.error(JSON.stringify({
        event: "generate-og-image:error",
        error: "db_update_failed",
        businessId,
        ogImageUrl: shareImageUrl,
        message: updateErr.message,
      }));
      return jsonResponse({ error: "Failed to update business og_image_url" }, 500, corsHeaders);
    }

    console.log(JSON.stringify({
      event: "generate-og-image:generated",
      businessId,
      ogImageUrl: shareImageUrl,
      force: forceRegen,
    }));

    return jsonResponse({ ok: true, businessId, ogImageUrl: shareImageUrl }, 200, corsHeaders);
  } catch (err) {
    console.error(JSON.stringify({
      event: "generate-og-image:error",
      error: "unhandled",
      businessId: _logBusinessId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5).join(" | ") : undefined,
    }));
    return jsonResponse(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      500,
      corsHeaders,
    );
  }
});
