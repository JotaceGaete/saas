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
        u.hostname === "app.gong.cl" ||
        u.hostname.endsWith(".vercel.app")) // preview deployments
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: biz, error: bizErr } = await adminClient
      .from("wa_businesses")
      .select("id, user_id, name, logo_url, cover_image_url, design_settings")
      .eq("id", businessId)
      .maybeSingle();

    if (bizErr || !biz?.id || (biz as { user_id?: string }).user_id !== user.id) {
      return jsonResponse({ error: "Business not found or access denied" }, 403, corsHeaders);
    }

    const r = biz as Record<string, unknown>;
    const ds = parseDesignSettingsSafe(r.design_settings);
    const storeName = String(r.name || "Tu tienda");
    const coverUrl = pickCoverUrl(r, ds);
    const logoUrl = pickLogoUrl(r, ds);

    const [coverDataUri, logoDataUri] = await Promise.all([
      loadImageDataUri(coverUrl),
      loadImageDataUri(logoUrl),
    ]);

    const svg = buildCatalogOgSvg({
      storeName,
      logoDataUri,
      coverDataUri,
    });

    let pngBytes: Uint8Array;
    try {
      pngBytes = await renderSvgToPng(svg);
    } catch (err) {
      console.error("[generate-og-image] render failed", err);
      return jsonResponse(
        { error: "Render failed", message: err instanceof Error ? err.message : String(err) },
        500,
        corsHeaders,
      );
    }

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

    const key = `businesses/${businessId}/og/og-${Date.now()}.png`;
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

    await s3.send(new (PutObjectCommandCtor as any)({
      Bucket: bucket,
      Key: key,
      Body: pngBytes,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    }));

    const ogImageUrl = `${publicBaseUrl}/${key}`;
    const { error: updateErr } = await adminClient
      .from("wa_businesses")
      .update({ og_image_url: ogImageUrl })
      .eq("id", businessId)
      .eq("user_id", user.id);

    if (updateErr) {
      return jsonResponse({ error: "Failed to update business og_image_url" }, 500, corsHeaders);
    }

    return jsonResponse({ ok: true, businessId, ogImageUrl }, 200, corsHeaders);
  } catch (err) {
    console.error("[generate-og-image] Unhandled error", err);
    return jsonResponse(
      { error: "Internal server error", message: err instanceof Error ? err.message : String(err) },
      500,
      corsHeaders,
    );
  }
});
