/**
 * Renderizado OG 1200×630 para catálogos: portada centrada + padding + nombre/logo.
 * Usado por generate-og-image (POST, guarda en R2); la versión GET pública vive en Vercel `api/og-catalog.js`.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function escapeXml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function parseDesignSettingsSafe(value: unknown): Record<string, unknown> {
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

export function wrapStoreName(name: string, maxChars = 28, maxLines = 2): string[] {
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

export async function loadImageDataUri(url: string | null): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "image/*,*/*;q=0.8" },
    });
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    if (len && Number(len) > MAX_IMAGE_BYTES) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) return null;
    const contentType = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return null;
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const b64 = btoa(binary);
    return `data:${contentType};base64,${b64}`;
  } catch {
    return null;
  }
}

export function pickCoverUrl(row: Record<string, unknown>, ds: Record<string, unknown>): string | null {
  const a = typeof row?.cover_image_url === "string" ? row.cover_image_url.trim() : "";
  if (a) return a;
  const b = typeof ds?.coverImageUrl === "string" ? String(ds.coverImageUrl).trim() : "";
  if (b) return b;
  const c = typeof ds?.headerImageUrl === "string" ? String(ds.headerImageUrl).trim() : "";
  return c || null;
}

export function pickLogoUrl(row: Record<string, unknown>, ds: Record<string, unknown>): string | null {
  const direct = typeof row?.logo_url === "string" ? row.logo_url : null;
  const dsLogo = typeof ds?.logoUrl === "string" ? ds.logoUrl : null;
  return (direct || dsLogo || null) as string | null;
}

export type CatalogOgSvgParams = {
  storeName: string;
  logoDataUri: string | null;
  coverDataUri: string | null;
};

/**
 * SVG 1200×630: con portada (centrada, meet) o plantilla gradiente si no hay portada.
 */
export function buildCatalogOgSvg(params: CatalogOgSvgParams): string {
  const { storeName, logoDataUri, coverDataUri } = params;
  const lines = wrapStoreName(storeName, 26, 2);
  const line1 = escapeXml(lines[0] ?? "Tu tienda");
  const line2 = lines[1] ? escapeXml(lines[1]) : null;

  const logoBlock = logoDataUri
    ? `
    <g>
      <rect x="1000" y="36" width="164" height="164" rx="22" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
      <clipPath id="ogLogoClip"><rect x="1012" y="48" width="140" height="140" rx="18" /></clipPath>
      <image href="${logoDataUri}" x="1012" y="48" width="140" height="140" preserveAspectRatio="xMidYMid meet" clip-path="url(#ogLogoClip)" />
    </g>`
    : "";

  if (coverDataUri) {
    const yTitle1 = line2 ? 498 : 532;
    const yTitle2 = line2 ? 562 : null;
    const ySub = line2 ? 612 : 578;
    return `
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ogBottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(15,23,42,0)" />
      <stop offset="55%" stop-color="rgba(15,23,42,0.55)" />
      <stop offset="100%" stop-color="rgba(15,23,42,0.97)" />
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#0f172a" />
  <rect x="36" y="36" width="1128" height="468" rx="20" fill="#1e293b" />
  <image href="${coverDataUri}" x="44" y="44" width="1112" height="452" preserveAspectRatio="xMidYMid meet" />
  <rect x="0" y="280" width="${OG_WIDTH}" height="350" fill="url(#ogBottomFade)" />
  <text x="56" y="${yTitle1}" fill="#f8fafc" font-size="52" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" letter-spacing="-0.5">
    ${line1}
  </text>
  ${line2 && yTitle2 ? `<text x="56" y="${yTitle2}" fill="#f8fafc" font-size="52" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" letter-spacing="-0.5">${line2}</text>` : ""}
  <text x="56" y="${ySub}" fill="#94a3b8" font-size="26" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="500">
    Catálogo por WhatsApp · Ventalink
  </text>
  ${logoBlock}
</svg>`;
  }

  return `
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
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

  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)" />
  <rect x="0" y="0" width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#overlay)" />

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

  ${
    logoDataUri
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
      : ""
  }
</svg>`;
}

// ── WASM renderer ────────────────────────────────────────────────────────────
//
// IMPORTANT: se importa desde esm.sh (URL ESM), NO desde "npm:@resvg/resvg-wasm".
// El especificador npm: hace que Deno resuelva las dependencias opcionales del
// paquete, lo que arrastra @resvg/resvg-js-linux-arm64-gnu (binding nativo) que
// no existe en el sandbox de Supabase Edge Functions y causa:
//   "Cannot find module '@resvg/resvg-js-linux-arm64-gnu'"
// La URL de esm.sh entrega el bundle ESM puro sin ningún binding nativo.
//
// Estado a nivel de módulo: se reutiliza en warm starts; se resetea completo
// si la inicialización falla para que el siguiente llamado pueda reintentar.
//
type ResvgConstructor = new (
  svg: string,
  opts?: Record<string, unknown>,
) => { render(): { asPng(): Uint8Array } };

let _wasmInitPromise: Promise<void> | null = null;
let _ResvgClass: ResvgConstructor | null = null;

export async function renderSvgToPng(svg: string): Promise<Uint8Array> {
  if (!_wasmInitPromise) {
    _wasmInitPromise = (async () => {
      // Named imports desde esm.sh — bundle ESM puro, sin dependencias nativas.
      const { initWasm, Resvg } = await import(
        "https://esm.sh/@resvg/resvg-wasm@2.6.0"
      ) as { initWasm: (src: Response) => Promise<void>; Resvg: ResvgConstructor };
      const wasmResponse = await fetch(
        "https://esm.sh/@resvg/resvg-wasm@2.6.0/index_bg.wasm",
      );
      if (!wasmResponse.ok) {
        throw new Error(`WASM fetch failed: ${wasmResponse.status} ${wasmResponse.statusText}`);
      }
      await initWasm(wasmResponse);
      _ResvgClass = Resvg;
      console.log(JSON.stringify({ event: "resvg-wasm:initialized" }));
    })();
  }

  try {
    await _wasmInitPromise;
  } catch (e) {
    // Resetear ambas variables para que el próximo llamado pueda reintentar
    // desde cero en vez de fallar permanentemente con la Promise rechazada.
    _wasmInitPromise = null;
    _ResvgClass = null;
    console.error(JSON.stringify({
      event: "resvg-wasm:init-failed",
      message: e instanceof Error ? e.message : String(e),
    }));
    throw e;
  }

  if (!_ResvgClass) throw new Error("Resvg WASM class unavailable after init");
  return new _ResvgClass(svg, { fitTo: { mode: "width", value: OG_WIDTH } })
    .render()
    .asPng();
}
