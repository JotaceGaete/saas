/**
 * GET /api/og-catalog?slug= — PNG 1200×630 para og:image (Vercel Node; @resvg/resvg-js).
 * HEAD — mismos headers que GET, sin cuerpo (probes de crawlers / WhatsApp).
 */

import { createClient } from '@supabase/supabase-js';
import { Resvg } from '@resvg/resvg-js';

const OG_W = 1200;
const OG_H = 630;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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

async function loadImageDataUri(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*;q=0.8' },
    });
    if (!res.ok) return null;
    const len = res.headers.get('content-length');
    if (len && Number(len) > MAX_IMAGE_BYTES) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) return null;
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!ct.startsWith('image/')) return null;
    const b64 = Buffer.from(ab).toString('base64');
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

function buildCatalogOgSvg({ storeName, logoDataUri, coverDataUri }) {
  const lines = wrapStoreName(storeName, 26, 2);
  const line1 = escapeXml(lines[0] ?? 'Tu tienda');
  const line2 = lines[1] ? escapeXml(lines[1]) : null;

  const logoBlock = logoDataUri
    ? `
    <g>
      <rect x="1000" y="36" width="164" height="164" rx="22" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
      <clipPath id="ogLogoClip"><rect x="1012" y="48" width="140" height="140" rx="18" /></clipPath>
      <image href="${logoDataUri}" x="1012" y="48" width="140" height="140" preserveAspectRatio="xMidYMid meet" clip-path="url(#ogLogoClip)" />
    </g>`
    : '';

  if (coverDataUri) {
    const yTitle1 = line2 ? 498 : 532;
    const yTitle2 = line2 ? 562 : null;
    const ySub = line2 ? 612 : 578;
    return `
<svg width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ogBottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(15,23,42,0)" />
      <stop offset="55%" stop-color="rgba(15,23,42,0.55)" />
      <stop offset="100%" stop-color="rgba(15,23,42,0.97)" />
    </linearGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="#0f172a" />
  <rect x="36" y="36" width="1128" height="468" rx="20" fill="#1e293b" />
  <image href="${coverDataUri}" x="44" y="44" width="1112" height="452" preserveAspectRatio="xMidYMid meet" />
  <rect x="0" y="280" width="${OG_W}" height="350" fill="url(#ogBottomFade)" />
  <text x="56" y="${yTitle1}" fill="#f8fafc" font-size="52" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" letter-spacing="-0.5">
    ${line1}
  </text>
  ${line2 && yTitle2 ? `<text x="56" y="${yTitle2}" fill="#f8fafc" font-size="52" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" letter-spacing="-0.5">${line2}</text>` : ''}
  <text x="56" y="${ySub}" fill="#94a3b8" font-size="26" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="500">
    Catálogo por WhatsApp · Ventalink
  </text>
  ${logoBlock}
</svg>`;
  }

  return `
<svg width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" xmlns="http://www.w3.org/2000/svg">
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
  <rect width="${OG_W}" height="${OG_H}" fill="url(#bg)" />
  <rect x="0" y="0" width="${OG_W}" height="${OG_H}" fill="url(#overlay)" />
  <text x="96" y="255" fill="#F8FAFC" font-size="72" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" letter-spacing="-1.2">${line1}</text>
  ${line2 ? `<text x="96" y="338" fill="#F8FAFC" font-size="72" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800" letter-spacing="-1.2">${line2}</text>` : ''}
  <text x="96" y="430" fill="#EDE9FE" font-size="38" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="600">Catálogo por WhatsApp</text>
  <text x="96" y="560" fill="rgba(248,250,252,0.78)" font-size="24" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="500">Creado con Ventalink</text>
  ${
    logoDataUri
      ? `<g>
      <rect x="860" y="160" width="220" height="220" rx="28" fill="rgba(255,255,255,0.96)" />
      <clipPath id="logoClip"><rect x="886" y="186" width="168" height="168" rx="20" /></clipPath>
      <rect x="886" y="186" width="168" height="168" rx="20" fill="#ffffff" />
      <image href="${logoDataUri}" x="886" y="186" width="168" height="168" preserveAspectRatio="xMidYMid meet" clip-path="url(#logoClip)" />
    </g>`
      : ''
  }
</svg>`;
}

/** Mínimo válido: fondo sólido + nombre (siempre 200). */
function buildFallbackSvg(storeName) {
  const line1 = escapeXml(wrapStoreName(storeName, 32, 1)[0] || 'Catálogo');
  return `
<svg width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${OG_W}" height="${OG_H}" fill="#1e1b4b" />
  <text x="80" y="340" fill="#f8fafc" font-size="64" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="800">${line1}</text>
  <text x="80" y="420" fill="#94a3b8" font-size="28" font-family="Inter, Segoe UI, Arial, sans-serif">Ventalink</text>
</svg>`;
}

function svgToPng(svg) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_W },
  });
  return Buffer.from(resvg.render().asPng());
}

export async function GET(request) {
  let svgFallbackName = 'Catálogo';
  try {
    const url = new URL(request.url);
    const slug = (url.searchParams.get('slug') || '').trim();
    if (!slug || slug.length > 200) {
      const png = svgToPng(buildFallbackSvg('Catálogo'));
      return new Response(png, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceKey) {
      console.error('[og-catalog] missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      const png = svgToPng(buildFallbackSvg('Catálogo'));
      return new Response(png, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: row, error } = await supabase
      .from('wa_businesses')
      .select('id, name, slug, logo_url, cover_image_url, design_settings, updated_at')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !row) {
      const png = svgToPng(buildFallbackSvg(slug));
      return new Response(png, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=120',
        },
      });
    }

    svgFallbackName = row.name || 'Catálogo';
    const ds = parseDesignSettings(row.design_settings);
    const storeName = String(row.name || 'Tu tienda');
    const coverUrl = pickCoverUrl(row, ds);
    const logoUrl = pickLogoUrl(row, ds);

    let coverDataUri = null;
    let logoDataUri = null;
    try {
      [coverDataUri, logoDataUri] = await Promise.all([
        loadImageDataUri(coverUrl),
        loadImageDataUri(logoUrl),
      ]);
    } catch {
      coverDataUri = null;
      logoDataUri = null;
    }

    let svg;
    try {
      svg = buildCatalogOgSvg({
        storeName,
        logoDataUri,
        coverDataUri,
      });
    } catch {
      svg = buildFallbackSvg(storeName);
    }

    let png;
    try {
      png = svgToPng(svg);
    } catch (e) {
      console.error('[og-catalog] resvg failed', e?.message || e);
      png = svgToPng(buildFallbackSvg(svgFallbackName));
    }

    const v = row.updated_at ? encodeURIComponent(String(row.updated_at)) : '';
    const cache = `public, max-age=3600, s-maxage=86400${v ? `, stale-while-revalidate=604800` : ''}`;

    return new Response(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': cache,
      },
    });
  } catch (e) {
    console.error('[og-catalog] unhandled', e?.message || e);
    try {
      const png = svgToPng(buildFallbackSvg(svgFallbackName));
      return new Response(png, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=60',
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
          'Cache-Control': 'public, max-age=60',
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
          'Cache-Control': 'public, max-age=60',
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
          'Cache-Control': 'public, max-age=120',
        },
      });
    }

    const cache = row.updated_at
      ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
      : 'public, max-age=3600, s-maxage=86400';

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': cache,
      },
    });
  } catch (e) {
    console.error('[og-catalog] HEAD', e?.message || e);
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }
}
