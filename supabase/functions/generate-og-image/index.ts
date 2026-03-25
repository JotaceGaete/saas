// generate-og-image — genera imagen Open Graph (1200x630) por negocio.
// Flujo: validar usuario -> cargar negocio -> render PNG -> subir a R2 -> guardar wa_businesses.og_image_url

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Importaciones pesadas (Resvg + AWS SDK) se cargan dinámicamente dentro del handler.
// Así evitamos que un fallo en el runtime/wasm impida responder a `OPTIONS` por CORS.

const WIDTH = 1200;
const HEIGHT = 630;

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

function escapeXml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseDesignSettingsSafe(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function wrapStoreName(name: string, maxChars = 26, maxLines = 2): string[] {
  const clean = (name || "Tu tienda").trim().replace(/\s+/g, " ");
  if (!clean) return ["Tu tienda"];

  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    if (lines.length >= maxLines - 1) break;
  }

  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === 0) lines.push(clean.slice(0, maxChars));
  if (lines.length > maxLines) return lines.slice(0, maxLines);

  if (lines.length === maxLines) {
    const consumed = lines.join(" ").length;
    if (clean.length > consumed) lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 1))}…`;
  }

  return lines;
}

async function loadLogoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "image/png").split(";")[0];
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    return `data:${contentType};base64,${b64}`;
  } catch {
    return null;
  }
}

function buildOgSvg(storeName: string, logoDataUri: string | null): string {
  const lines = wrapStoreName(storeName, 24, 2);
  const line1 = escapeXml(lines[0] ?? "Tu tienda");
  const line2 = lines[1] ? escapeXml(lines[1]) : null;

  const logoCard = logoDataUri
    ? `
    <g>
      <rect x="860" y="160" width="220" height="220" rx="28" fill="rgba(255,255,255,0.96)" />
      <rect x="860" y="160" width="220" height="220" rx="28" fill="url(#cardShadow)" />
      <clipPath id="logoClip">
        <rect x="886" y="186" width="168" height="168" rx="20" />
      </clipPath>
      <rect x="886" y="186" width="168" height="168" rx="20" fill="#ffffff" />
      <image href="${logoDataUri}" x="886" y="186" width="168" height="168" preserveAspectRatio="xMidYMid meet" clip-path="url(#logoClip)" />
    </g>`
    : "";

  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5B21B6" />
      <stop offset="45%" stop-color="#7C3AED" />
      <stop offset="100%" stop-color="#A78BFA" />
    </linearGradient>
    <linearGradient id="overlay" x1="0" y1="0" x2="0.9" y2="0.9">
      <stop offset="0%" stop-color="rgba(15,10,35,0.50)" />
      <stop offset="100%" stop-color="rgba(15,10,35,0.25)" />
    </linearGradient>
    <linearGradient id="cardShadow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.02)" />
      <stop offset="100%" stop-color="rgba(30,20,60,0.08)" />
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#overlay)" />

  <text x="96" y="255" fill="#F8FAFC" font-size="72" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" letter-spacing="-1.2">
    ${line1}
  </text>
  ${
    line2
      ? `<text x="96" y="338" fill="#F8FAFC" font-size="72" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" letter-spacing="-1.2">${line2}</text>`
      : ""
  }

  <text x="96" y="430" fill="#EDE9FE" font-size="38" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="600">
    Catálogo por WhatsApp
  </text>
  <text x="96" y="560" fill="rgba(248,250,252,0.78)" font-size="24" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="500">
    Creado con Ventalink
  </text>

  ${logoCard}
</svg>`;
}

function pickLogoUrl(
  row: Record<string, unknown>,
  ds: Record<string, unknown>,
): string | null {
  const direct = typeof row?.logo_url === "string" ? row.logo_url : null;
  const dsLogo = typeof ds?.logoUrl === "string" ? ds.logoUrl : null;
  return direct || dsLogo || null;
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

    const ds = parseDesignSettingsSafe((biz as Record<string, unknown>)?.design_settings);
    const storeName = String((biz as Record<string, unknown>)?.name || "Tu tienda");
    const logoUrl = pickLogoUrl(biz as Record<string, unknown>, ds);
    const logoDataUri = await loadLogoDataUri(logoUrl);

    const svg = buildOgSvg(storeName, logoDataUri);
    let ResvgCtor: unknown | null = null;
    try {
      const mod = await import("npm:@resvg/resvg-js@2.6.2");
      // Resvg puede exportarse como named o default según empaquetado.
      ResvgCtor = (mod as any).Resvg ?? (mod as any).default ?? null;
    } catch (err) {
      console.error("[generate-og-image] Resvg import failed", err);
      return jsonResponse({ error: "Resvg import failed", message: err instanceof Error ? err.message : String(err) }, 500, corsHeaders);
    }
    if (!ResvgCtor || typeof (ResvgCtor as any) !== "function") {
      return jsonResponse({ error: "Resvg not available" }, 500, corsHeaders);
    }

    const pngBytes = new (ResvgCtor as any)(svg, {
      fitTo: { mode: "width", value: WIDTH },
    }).render().asPng();

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

