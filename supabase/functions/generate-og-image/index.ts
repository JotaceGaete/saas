// generate-og-image — genera imagen Open Graph (1200x630) por negocio y sube a R2.
// Mismo layout que api/og-catalog.js en Vercel (portada centrada + branding).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildCatalogOgSvg,
  loadImageDataUri,
  parseDesignSettingsSafe,
  pickCoverUrl,
  pickLogoUrl,
  renderSvgToPng,
} from "../_shared/catalogOgRender.ts";

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

    // ── Guard 1: shareImageUrl set ───────────────────────────────────────────
    // resolveCatalogOgImageUrl gives shareImageUrl absolute priority, so any
    // og_image_url we'd generate here would never be served. Skip unconditionally.
    // ── Guard 2: og_image_url already exists, no force ───────────────────────
    // Avoid WASM + R2 churn on every minor design save (color, font, etc.).
    // Callers pass force=true only when cover or logo explicitly changed.
    const forceRegen = body?.force === true;
    if (!forceRegen && (r.og_image_url as string)?.trim()) {
      console.log(JSON.stringify({
        event: "generate-og-image:skip",
        skip_reason: "og_image_url_exists",
        businessId,
        ogImageUrl: r.og_image_url,
      }));
      return jsonResponse({ skipped: true, reason: "og_image_url_exists", ogImageUrl: r.og_image_url }, 200, corsHeaders);
    }

    // ── Guard 3: no visual inputs ────────────────────────────────────────────
    // If there is no cover and no logo, generating a text-only gradient is wasteful:
    // /api/og-catalog already renders the same result on demand and is the preferred
    // fallback in resolveCatalogOgImageUrl. Skip and let the dynamic endpoint serve.
    const storeName = String(r.name || "Tu tienda");
    const coverUrl = pickCoverUrl(r, ds);
    const logoUrl = pickLogoUrl(r, ds);

    // ── 3. visual inputs resolved ────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "generate-og-image:visual_inputs_resolved",
      businessId,
      hasCoverUrl: !!coverUrl,
      hasLogoUrl: !!logoUrl,
      coverUrl: coverUrl ?? null,
      logoUrl: logoUrl ?? null,
    }));

    if (!coverUrl && !logoUrl) {
      console.log(JSON.stringify({
        event: "generate-og-image:skip",
        skip_reason: "no_visual_inputs",
        businessId,
        storeName,
      }));
      return jsonResponse({ skipped: true, reason: "no_visual_inputs" }, 200, corsHeaders);
    }

    // ── 4. render start ──────────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "generate-og-image:render_start",
      businessId,
    }));

    // ── Render ───────────────────────────────────────────────────────────────
    const [coverDataUri, logoDataUri] = await Promise.all([
      loadImageDataUri(coverUrl),
      loadImageDataUri(logoUrl),
    ]);

    const svg = buildCatalogOgSvg({
      storeName,
      logoDataUri,
      coverDataUri,
    });

    // ── 4b. images loaded ────────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "generate-og-image:images_loaded",
      businessId,
      hasCoverDataUri: !!coverDataUri,
      hasLogoDataUri: !!logoDataUri,
    }));

    let pngBytes: Uint8Array;
    try {
      pngBytes = await renderSvgToPng(svg);
    } catch (err) {
      console.error(JSON.stringify({
        event: "generate-og-image:error",
        error: "render_failed",
        businessId,
        message: err instanceof Error ? err.message : String(err),
      }));
      return jsonResponse(
        { error: "Render failed", message: err instanceof Error ? err.message : String(err) },
        500,
        corsHeaders,
      );
    }

    // ── 5. render success ────────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "generate-og-image:render_success",
      businessId,
      pngBytes: pngBytes.length,
    }));

    const accountId = Deno.env.get("R2_ACCOUNT_ID") ?? "";
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
    const bucket = Deno.env.get("R2_BUCKET_NAME") ?? "";
    const publicBaseUrl = (Deno.env.get("R2_PUBLIC_URL") ?? "").replace(/\/$/, "");

    const missingR2: string[] = [];
    if (!accountId) missingR2.push("R2_ACCOUNT_ID");
    if (!accessKeyId) missingR2.push("R2_ACCESS_KEY_ID");
    if (!secretAccessKey) missingR2.push("R2_SECRET_ACCESS_KEY");
    if (!bucket) missingR2.push("R2_BUCKET_NAME");
    if (!publicBaseUrl) missingR2.push("R2_PUBLIC_URL");
    if (missingR2.length) {
      return jsonResponse({ error: "Storage not configured", missing: missingR2 }, 500, corsHeaders);
    }

    const versionSeed = String(r.updated_at ?? Date.now()).replace(/[^0-9A-Za-z_-]/g, "");
    const slugPart = String(r.slug ?? businessId).trim().replace(/[^0-9A-Za-z_-]/g, "-") || businessId;
    const key = `businesses/${businessId}/og/${slugPart}-${versionSeed}.png`;
    let S3ClientCtor: unknown | null = null;
    let PutObjectCommandCtor: unknown | null = null;
    try {
      const mod = await import("npm:@aws-sdk/client-s3@3.700.0");
      S3ClientCtor = (mod as any).S3Client ?? (mod as any).default ?? null;
      PutObjectCommandCtor = (mod as any).PutObjectCommand ?? null;
    } catch (err) {
      console.error("[generate-og-image] AWS S3 import failed", err);
      return jsonResponse({ error: "S3 import failed", message: err instanceof Error ? err.message : String(err) }, 500, corsHeaders);
    }
    if (!S3ClientCtor || typeof (S3ClientCtor as any) !== "function" || !PutObjectCommandCtor) {
      return jsonResponse({ error: "S3 not available" }, 500, corsHeaders);
    }

    const s3 = new (S3ClientCtor as any)({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    // ── 6. upload start ──────────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "generate-og-image:upload_start",
      businessId,
      bucket,
      key,
    }));

    await s3.send(new (PutObjectCommandCtor as any)({
      Bucket: bucket,
      Key: key,
      Body: pngBytes,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    }));

    const ogImageUrl = `${publicBaseUrl}/${key}`;

    // ── 7. upload success ────────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "generate-og-image:upload_success",
      businessId,
      ogImageUrl,
    }));

    // ── 8. db update start ───────────────────────────────────────────────────
    console.log(JSON.stringify({
      event: "generate-og-image:db_update_start",
      businessId,
      ogImageUrl,
    }));

    // ── Persist — only reached if render + upload both succeeded ─────────────
    const { error: updateErr } = await adminClient
      .from("wa_businesses")
      .update({ og_image_url: ogImageUrl })
      .eq("id", businessId)
      .eq("user_id", user.id);

    if (updateErr) {
      console.error(JSON.stringify({
        event: "generate-og-image:error",
        error: "db_update_failed",
        businessId,
        ogImageUrl,
        message: updateErr.message,
      }));
      return jsonResponse({ error: "Failed to update business og_image_url" }, 500, corsHeaders);
    }

    console.log(JSON.stringify({
      event: "generate-og-image:generated",
      businessId,
      ogImageUrl,
      hasCover: !!coverDataUri,
      hasLogo: !!logoDataUri,
      force: forceRegen,
    }));

    return jsonResponse({ ok: true, businessId, ogImageUrl }, 200, corsHeaders);
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
