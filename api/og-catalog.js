/**
 * GET /api/og-catalog?slug= — PNG 1200×630 para og:image (Vercel Node; @resvg/resvg-js).
 * HEAD — mismos headers que GET, sin cuerpo (probes de crawlers / WhatsApp).
 *
 * Determinismo: sin bitmaps remotos, el PNG depende solo de datos en BD (nombre, etc.).
 * Portada/logo se cargan en serie (no Promise.all), con timeout + magic bytes; si fallan o resvg
 * falla, se reintenta con layout solo vectorial (sin URLs externas). Para máxima estabilidad
 * entre requests: OG_CATALOG_VECTOR_ONLY=true (solo SVG interno, mismo slug → mismo resultado).
 */

import { createClient } from '@supabase/supabase-js';
import { Resvg } from '@resvg/resvg-js';

const OG_W = 1200;
const OG_H = 630;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Mismo timeout en cada request (sin carreras entre cover/logo). */
const REMOTE_IMAGE_FETCH_MS = 10_000;
const OG_CATALOG_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

function logOgCatalog(event, payload) {
  try {
    console.log(
      `[og-catalog] ${event}`,
      JSON.stringify({
        t: new Date().toISOString(),
        ...payload,
      }),
    );
  } catch {
    console.log(`[og-catalog] ${event}`, payload);
  }
}

/** JPEG / PNG / GIF / WebP — evita data: inválidos que rompen resvg de forma intermitente. */
function isSupportedRasterBuffer(ab) {
  if (!ab || ab.byteLength < 12) return false;
  const u = new Uint8Array(ab);
  if (u[0] === 0xff && u[1] === 0xd8) return true;
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) return true;
  if (u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46) return true;
  if (
    u[0] === 0x52 &&
    u[1] === 0x49 &&
    u[2] === 0x46 &&
    u[3] === 0x46 &&
    u[8] === 0x57 &&
    u[9] === 0x45 &&
    u[10] === 0x42 &&
    u[11] === 0x50
  ) {
    return true;
  }
  return false;
}

function escapeXml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseDesignSettings(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const p = JSON.parse(value);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

function wrapStoreName(name, maxChars = 26, maxLines = 2) {
  const clean = (name || 'Tu tienda').trim().replace(/\s+/g, ' ');
  if (!clean) return ['Tu tienda'];
  const words = clean.split(' ');
  const lines = [];
  let current = '';
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
    const consumed = lines.join(' ').length;
    if (clean.length > consumed) {
      lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 1))}…`;
    }
  }
  return lines;
}

function pickCoverUrl(row, ds) {
  const a = typeof row?.cover_image_url === 'string' ? row.cover_image_url.trim() : '';
  if (a) return a;
  const b = typeof ds?.coverImageUrl === 'string' ? String(ds.coverImageUrl).trim() : '';
  if (b) return b;
  const c = typeof ds?.headerImageUrl === 'string' ? String(ds.headerImageUrl).trim() : '';
  return c || null;
}

function pickLogoUrl(row, ds) {
  const direct = typeof row?.logo_url === 'string' ? row.logo_url : null;
  const dsLogo = typeof ds?.logoUrl === 'string' ? ds.logoUrl : null;
  return direct || dsLogo || null;
}

/**
 * Imagen de vista previa de WhatsApp cargada explícitamente por el negocio.
 * Prioridad 1: campo og_image_url en wa_businesses.
 * Prioridad 2: design_settings.shareImageUrl (campo transitorio antes de og_image_url).
 * Solo acepta URLs https absolutas — evita redirecciones a URLs relativas o http.
 * @returns {string | null}
 */
function pickOgPreviewUrl(row, ds) {
  const fromField = typeof row?.og_image_url === 'string' ? row.og_image_url.trim() : '';
  if (fromField && /^https:\/\//i.test(fromField)) return fromField;
  const fromDs = typeof ds?.shareImageUrl === 'string' ? ds.shareImageUrl.trim() : '';
  if (fromDs && /^https:\/\//i.test(fromDs)) return fromDs;
  return null;
}

/**
 * Carga una imagen remota de forma validada. Sin esto, resvg puede fallar o rasterizar mal con bytes corruptos.
 * @returns {{ ok: boolean, dataUri: string | null, reason?: string }}
 */
async function loadImageDataUriValidated(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, dataUri: null, reason: 'invalid_or_missing_url' };
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REMOTE_IMAGE_FETCH_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif,*/*;q=0.8' },
    });
    if (!res.ok) {
      return { ok: false, dataUri: null, reason: `http_${res.status}` };
    }
    const len = res.headers.get('content-length');
    if (len && Number(len) > MAX_IMAGE_BYTES) {
      return { ok: false, dataUri: null, reason: 'content_length_too_large' };
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES || ab.byteLength === 0) {
      return { ok: false, dataUri: null, reason: 'body_size_invalid' };
    }
    if (!isSupportedRasterBuffer(ab)) {
      return { ok: false, dataUri: null, reason: 'unsupported_or_corrupt_image_magic' };
    }
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    if (!ct.startsWith('image/')) {
      return { ok: false, dataUri: null, reason: 'not_image_content_type' };
    }
    const b64 = Buffer.from(ab).toString('base64');
    return { ok: true, dataUri: `data:${ct};base64,${b64}`, reason: 'ok' };
  } catch (e) {
    const name = e?.name === 'AbortError' ? 'timeout' : 'fetch_error';
    return { ok: false, dataUri: null, reason: name };
  } finally {
    clearTimeout(t);
  }
}

/**
 * V-Check gradient def reusable por id.
 * Geometría idéntica a `src/components/branding/VCheckIsotype.jsx`.
 */
function ogVcheckGradientDef(gradId = 'ogVcheckGrad') {
  return `<linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7C3AED" />
      <stop offset="100%" stop-color="#6D28D9" />
    </linearGradient>`;
}

/** Icono V-Check a una posición y escala dadas. */
function ogVcheckIcon({ x, y, size, gradId = 'ogVcheckGrad' }) {
  const scale = size / 64;
  return `<g transform="translate(${x},${y}) scale(${scale})">
      <rect width="64" height="64" rx="14" fill="url(#${gradId})" />
      <path d="M18 34 L28 44 L46 22" fill="none" stroke="rgba(255,255,255,0.80)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M26 34 L36 44 L54 22" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    </g>`;
}

/**
 * Genera el SVG 1200×630 con dos variantes:
 *
 * CON PORTADA  → imagen full-bleed (xMidYMid slice) + degradado izquierda→derecha
 *               → texto sobre el área izquierda oscura
 *               → logo/icono en esquina superior derecha
 *
 * SIN PORTADA  → fondo degradado violeta
 *               → logo grande en círculo centrado a la derecha
 *               → V-Check si no hay logo
 */
function buildCatalogOgSvg({ storeName, logoDataUri, coverDataUri }) {
  const lines = wrapStoreName(storeName, 20, 2);
  const line1 = escapeXml(lines[0] ?? 'Tu tienda');
  const line2 = lines[1] ? escapeXml(lines[1]) : null;

  /* Posiciones verticales del texto según número de líneas */
  const titleY1 = line2 ? 228 : 288;
  const titleY2 = 324;   /* titleY1 + 96 px (80 px font * 1.2 line-height) */
  const subtitleY = line2 ? 414 : 374;

  /* ── VARIANTE CON PORTADA ─────────────────────────────────────────────── */
  if (coverDataUri) {
    const hasLogo = Boolean(logoDataUri);
    const logoDefs = hasLogo
      ? `<clipPath id="ogLogoClip"><circle cx="1096" cy="84" r="60" /></clipPath>`
      : ogVcheckGradientDef('ogVG');

    const logoEl = hasLogo
      ? `<circle cx="1096" cy="84" r="68" fill="rgba(255,255,255,0.13)" stroke="rgba(255,255,255,0.24)" stroke-width="1.5" />
    <image href="${logoDataUri}" x="1036" y="24" width="120" height="120"
           preserveAspectRatio="xMidYMid meet" clip-path="url(#ogLogoClip)" />`
      : `<circle cx="1096" cy="84" r="68" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.20)" stroke-width="1.5" />
    ${ogVcheckIcon({ x: 1064, y: 52, size: 64, gradId: 'ogVG' })}`;

    return `<svg width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Degradado horizontal: oscuro a la izquierda para legibilidad del texto -->
    <linearGradient id="ogLeftDark" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="rgba(0,0,0,0.86)" />
      <stop offset="52%"  stop-color="rgba(0,0,0,0.46)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.10)" />
    </linearGradient>
    <!-- Vignette inferior para branding -->
    <linearGradient id="ogBottomDark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="rgba(0,0,0,0.00)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.62)" />
    </linearGradient>
    <clipPath id="ogImgClip"><rect width="${OG_W}" height="${OG_H}" /></clipPath>
    ${logoDefs}
  </defs>

  <!-- Fondo oscuro de seguridad (si la imagen falla) -->
  <rect width="${OG_W}" height="${OG_H}" fill="#0f172a" />

  <!-- Portada full-bleed: recorta para llenar 1200×630 sin barras negras -->
  <image href="${coverDataUri}" x="0" y="0" width="${OG_W}" height="${OG_H}"
         preserveAspectRatio="xMidYMid slice" clip-path="url(#ogImgClip)" />

  <!-- Overlay izquierda→derecha para zona de texto -->
  <rect width="${OG_W}" height="${OG_H}" fill="url(#ogLeftDark)" />

  <!-- Vignette inferior -->
  <rect y="400" width="${OG_W}" height="230" fill="url(#ogBottomDark)" />

  <!-- Nombre del negocio -->
  <text x="72" y="${titleY1}" fill="#ffffff"
        font-size="80" font-family="Inter, Segoe UI, Arial, sans-serif"
        font-weight="800" letter-spacing="-1.2">${line1}</text>
  ${line2 ? `<text x="72" y="${titleY2}" fill="#ffffff"
        font-size="80" font-family="Inter, Segoe UI, Arial, sans-serif"
        font-weight="800" letter-spacing="-1.2">${line2}</text>` : ''}

  <!-- Subtítulo -->
  <text x="72" y="${subtitleY}" fill="rgba(255,255,255,0.78)"
        font-size="32" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="500">
    Catálogo por WhatsApp
  </text>

  <!-- Branding inferior -->
  <text x="72" y="596" fill="rgba(255,255,255,0.50)"
        font-size="24" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="500">
    Walinka
  </text>

  <!-- Logo / V-Check (esquina superior derecha) -->
  ${logoEl}
</svg>`;
  }

  /* ── VARIANTE SIN PORTADA (fondo degradado) ───────────────────────────── */
  const hasLogo = Boolean(logoDataUri);

  /* Logo grande centrado a la derecha, o V-Check si no hay logo */
  const rightEl = hasLogo
    ? `<clipPath id="ogLogoClip"><circle cx="952" cy="315" r="166" /></clipPath>
  <circle cx="952" cy="315" r="192" fill="rgba(255,255,255,0.07)" />
  <circle cx="952" cy="315" r="178" fill="rgba(255,255,255,0.92)" />
  <image href="${logoDataUri}" x="786" y="149" width="332" height="332"
         preserveAspectRatio="xMidYMid meet" clip-path="url(#ogLogoClip)" />`
    : `${ogVcheckGradientDef('ogVG')}
  <circle cx="952" cy="315" r="192" fill="rgba(255,255,255,0.07)" />
  <circle cx="952" cy="315" r="166" fill="rgba(255,255,255,0.10)" />
  ${ogVcheckIcon({ x: 884, y: 247, size: 136, gradId: 'ogVG' })}`;

  const logoDefs2 = hasLogo
    ? `<clipPath id="ogLogoClip"><circle cx="952" cy="315" r="166" /></clipPath>`
    : '';

  return `<svg width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ogBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#3B0764" />
      <stop offset="50%"  stop-color="#6D28D9" />
      <stop offset="100%" stop-color="#8B5CF6" />
    </linearGradient>
    <linearGradient id="ogShine" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%"   stop-color="rgba(255,255,255,0.07)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.00)" />
    </linearGradient>
    ${logoDefs2}
  </defs>

  <!-- Fondo degradado violeta -->
  <rect width="${OG_W}" height="${OG_H}" fill="url(#ogBg)" />
  <rect width="${OG_W}" height="${OG_H}" fill="url(#ogShine)" />

  <!-- Decoración geométrica sutil (derecha) -->
  <circle cx="1080" cy="-40" r="280" fill="rgba(255,255,255,0.04)" />
  <circle cx="1060" cy="700" r="320" fill="rgba(255,255,255,0.03)" />

  <!-- Nombre del negocio -->
  <text x="72" y="${titleY1}" fill="#ffffff"
        font-size="80" font-family="Inter, Segoe UI, Arial, sans-serif"
        font-weight="800" letter-spacing="-1.2">${line1}</text>
  ${line2 ? `<text x="72" y="${titleY2}" fill="#ffffff"
        font-size="80" font-family="Inter, Segoe UI, Arial, sans-serif"
        font-weight="800" letter-spacing="-1.2">${line2}</text>` : ''}

  <!-- Subtítulo -->
  <text x="72" y="${subtitleY}" fill="rgba(255,255,255,0.78)"
        font-size="32" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="500">
    Catálogo por WhatsApp
  </text>

  <!-- Branding inferior -->
  <text x="72" y="596" fill="rgba(255,255,255,0.50)"
        font-size="24" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="500">
    Walinka
  </text>

  <!-- Logo / V-Check (derecha centrado) -->
  ${rightEl}
</svg>`;
}

/** Mínimo válido: fondo sólido + nombre. Siempre retorna 200. */
function buildFallbackSvg(storeName) {
  const line1 = escapeXml(wrapStoreName(storeName, 26, 1)[0] || 'Catálogo');
  return `<svg width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ogFbBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#3730a3" />
    </linearGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#ogFbBg)" />
  <text x="80" y="330" fill="#f8fafc"
        font-size="72" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800"
        letter-spacing="-1">${line1}</text>
  <text x="80" y="420" fill="rgba(255,255,255,0.60)"
        font-size="32" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="500">
    Catálogo por WhatsApp
  </text>
  <text x="80" y="590" fill="rgba(255,255,255,0.40)"
        font-size="24" font-family="Inter, Segoe UI, Arial, sans-serif">
    Walinka
  </text>
</svg>`;
}

function svgToPng(svg) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_W },
  });
  return Buffer.from(resvg.render().asPng());
}

/**
 * Renderiza PNG: primero con bitmaps opcionales; si resvg falla, solo vectores (mismo slug → mismo layout estable sin URLs rotas).
 */
function pngFromOgPipeline(storeName, coverDataUri, logoDataUri, slug, logContext = {}) {
  const tryVectorOnly = () => {
    const svg = buildCatalogOgSvg({
      storeName,
      logoDataUri: null,
      coverDataUri: null,
    });
    return svgToPng(svg);
  };

  try {
    const svg = buildCatalogOgSvg({ storeName, logoDataUri, coverDataUri });
    try {
      return { png: svgToPng(svg), mode: 'primary' };
    } catch (resvgErr) {
      logOgCatalog('resvg_retry_vector_only', {
        slug,
        ...logContext,
        error: String(resvgErr?.message || resvgErr),
      });
      return { png: tryVectorOnly(), mode: 'vector_only_after_resvg' };
    }
  } catch (buildErr) {
    logOgCatalog('svg_build_retry', {
      slug,
      ...logContext,
      error: String(buildErr?.message || buildErr),
    });
    try {
      return { png: tryVectorOnly(), mode: 'vector_only_after_build' };
    } catch {
      return { png: svgToPng(buildFallbackSvg(storeName)), mode: 'minimal_svg_fallback' };
    }
  }
}

export async function GET(request) {
  let svgFallbackName = 'Catálogo';
  try {
    const url = new URL(request.url);
    const slug = (url.searchParams.get('slug') || '').trim();
    if (!slug || slug.length > 200) {
      logOgCatalog('render', {
        slug: slug || '(empty)',
        renderMode: 'reject_bad_slug',
        coverUrl: null,
        logoUrl: null,
        coverOk: false,
        logoOk: false,
        coverReason: null,
        logoReason: null,
      });
      const png = svgToPng(buildFallbackSvg('Catálogo'));
      return new Response(png, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': OG_CATALOG_CACHE_CONTROL,
        },
      });
    }

    const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceKey) {
      console.error('[og-catalog] missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      logOgCatalog('render', {
        slug,
        renderMode: 'missing_env',
        coverUrl: null,
        logoUrl: null,
        coverOk: false,
        logoOk: false,
        coverReason: null,
        logoReason: null,
      });
      const png = svgToPng(buildFallbackSvg('Catálogo'));
      return new Response(png, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': OG_CATALOG_CACHE_CONTROL,
        },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: row, error } = await supabase
      .from('wa_businesses')
      .select('id, name, slug, logo_url, cover_image_url, og_image_url, design_settings, updated_at')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !row) {
      logOgCatalog('render', {
        slug,
        renderMode: 'business_not_found',
        dbError: error?.message || null,
        coverUrl: null,
        logoUrl: null,
        coverOk: false,
        logoOk: false,
        coverReason: null,
        logoReason: null,
      });
      const png = svgToPng(buildFallbackSvg(slug));
      return new Response(png, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': OG_CATALOG_CACHE_CONTROL,
        },
      });
    }

    svgFallbackName = row.name || 'Catálogo';
    const ds = parseDesignSettings(row.design_settings);

    // Diagnóstico temporal: loggear todos los campos de imagen para debug.
    logOgCatalog('db_row', {
      slug,
      businessId: row.id,
      og_image_url: row.og_image_url ?? '(not in row)',
      cover_image_url: row.cover_image_url ?? null,
      logo_url: row.logo_url ?? null,
      design_settings_keys: Object.keys(ds),
      ds_shareImageUrl: ds?.shareImageUrl ?? null,
      ds_coverImageUrl: ds?.coverImageUrl ?? null,
      ds_headerImageUrl: ds?.headerImageUrl ?? null,
      ds_logoUrl: ds?.logoUrl ?? null,
    });

    // Prioridad 1: imagen de vista previa de WhatsApp cargada explícitamente.
    // Si existe, se devuelve como redirect 302 en lugar de generar el SVG.
    const ogPreviewUrl = pickOgPreviewUrl(row, ds);
    if (ogPreviewUrl) {
      logOgCatalog('render', {
        slug,
        businessId: row.id,
        storeName: row.name,
        renderMode: 'og_preview_redirect',
        ogPreviewUrl,
        coverUrl: null,
        logoUrl: null,
        coverOk: false,
        logoOk: false,
        coverReason: null,
        logoReason: null,
      });
      return new Response(null, {
        status: 302,
        headers: {
          Location: ogPreviewUrl,
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
          'X-OG-Source': 'og_image_url',
        },
      });
    }

    const storeName = String(row.name || 'Tu tienda');
    const coverUrl = pickCoverUrl(row, ds);
    const logoUrl = pickLogoUrl(row, ds);

    const vectorOnly =
      process.env.OG_CATALOG_VECTOR_ONLY === '1' || process.env.OG_CATALOG_VECTOR_ONLY === 'true';

    let coverDataUri = null;
    let logoDataUri = null;
    let coverMeta = { ok: false, reason: vectorOnly ? 'vector_only_env' : 'no_url' };
    let logoMeta = { ok: false, reason: vectorOnly ? 'vector_only_env' : 'no_url' };

    if (!vectorOnly) {
      if (coverUrl) {
        coverMeta = await loadImageDataUriValidated(coverUrl);
        if (coverMeta.ok) coverDataUri = coverMeta.dataUri;
      } else {
        coverMeta = { ok: false, reason: 'no_url' };
      }
      if (logoUrl) {
        logoMeta = await loadImageDataUriValidated(logoUrl);
        if (logoMeta.ok) logoDataUri = logoMeta.dataUri;
      } else {
        logoMeta = { ok: false, reason: 'no_url' };
      }
    }

    const { png, mode } = pngFromOgPipeline(storeName, coverDataUri, logoDataUri, slug, {
      coverUrl: coverUrl || null,
      logoUrl: logoUrl || null,
    });

    logOgCatalog('render', {
      slug,
      businessId: row.id,
      storeName,
      vectorOnlyEnv: vectorOnly,
      coverUrl: coverUrl || null,
      logoUrl: logoUrl || null,
      coverOk: !!coverDataUri,
      logoOk: !!logoDataUri,
      coverReason: coverMeta.reason ?? null,
      logoReason: logoMeta.reason ?? null,
      renderMode: mode,
    });

    return new Response(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': OG_CATALOG_CACHE_CONTROL,
      },
    });
  } catch (e) {
    console.error('[og-catalog] unhandled', e?.message || e);
    logOgCatalog('render', {
      slug: '(error)',
      renderMode: 'unhandled_exception',
      error: String(e?.message || e),
      coverOk: false,
      logoOk: false,
    });
    try {
      const png = svgToPng(buildFallbackSvg(svgFallbackName));
      return new Response(png, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': OG_CATALOG_CACHE_CONTROL,
        },
      });
    } catch {
      return new Response('Internal error', { status: 500 });
    }
  }
}

/**
 * Sin generar PNG: validación ligera + headers alineados con GET (200 siempre salvo error irrecuperable).
 */
export async function HEAD(request) {
  try {
    const url = new URL(request.url);
    const slug = (url.searchParams.get('slug') || '').trim();

    if (!slug || slug.length > 200) {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': OG_CATALOG_CACHE_CONTROL,
        },
      });
    }

    const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceKey) {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': OG_CATALOG_CACHE_CONTROL,
        },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: row, error } = await supabase
      .from('wa_businesses')
      .select('updated_at')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !row) {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': OG_CATALOG_CACHE_CONTROL,
        },
      });
    }

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': OG_CATALOG_CACHE_CONTROL,
      },
    });
  } catch (e) {
    console.error('[og-catalog] HEAD', e?.message || e);
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': OG_CATALOG_CACHE_CONTROL,
      },
    });
  }
}
