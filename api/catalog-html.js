/**
 * Serverless function: sirve HTML con meta tags Open Graph dinámicos para /catalogo/:slug.
 * WhatsApp y otros crawlers no ejecutan JS; los meta deben estar en el HTML inicial (SSR).
 * Requiere: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY en el proyecto (Vercel env).
 */

import { createClient } from '@supabase/supabase-js';
import {
  buildLocalBusinessJsonLd,
  detectCatalogRegion,
  getCatalogMetaDescription,
  getCatalogPageTitle,
  stringifyJsonLd,
} from '../src/utils/catalogSeo.js';

function escapeHtml(str) {
  if (str == null || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getOrigin(request) {
  const proto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return '';
}

function parseDesignSettingsSafe(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function toAbsoluteUrl(url, origin) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `${origin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function buildOgImageUrl(row, origin) {
  const ds = parseDesignSettingsSafe(row?.design_settings);
  const candidates = [
    row?.og_image_url,
    row?.cover_image_url,
    ds?.coverImageUrl,
    ds?.headerImageUrl,
    row?.logo_url,
    ds?.logoUrl,
  ];
  for (const candidate of candidates) {
    const absolute = toAbsoluteUrl(candidate, origin);
    if (absolute) return absolute;
  }
  const name = (row?.name || 'Catálogo').replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Catalogo';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff&size=1200&format=png`;
}

/** GET: devuelve HTML con meta OG para el catálogo del slug. */
export async function GET(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug')?.trim();
  if (!slug) {
    return new Response('Slug required', { status: 400 });
  }

  const origin = getOrigin(request);
  if (!origin) {
    return new Response('Origin unknown', { status: 500 });
  }

  const host =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || '';

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Missing Supabase config', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: row, error } = await supabase
    .from('wa_businesses')
    .select(
      'id, name, description, slug, logo_url, cover_image_url, design_settings, og_image_url, city, region, country, country_code, currency, whatsapp'
    )
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !row) {
    return new Response(null, { status: 404 });
  }

  const seoInput = {
    storeName: row.name,
    city: row.city,
    region: row.region,
    country: row.country,
    currency: row.currency,
    host,
  };

  const pageTitle = getCatalogPageTitle(seoInput);
  const metaDescription = getCatalogMetaDescription(seoInput);
  const ri = detectCatalogRegion(seoInput);
  const ogImage = buildOgImageUrl(row, origin);
  const catalogUrl = `${origin}/catalogo/${slug}`;

  const jsonLd = buildLocalBusinessJsonLd({
    name: row.name || 'Catálogo',
    imageUrl: ogImage,
    city: row.city,
    region: row.region,
    country: row.country,
    countryCode: row.country_code,
    telephone: row.whatsapp,
    url: catalogUrl,
    currency: row.currency,
    host,
  });

  const jsonLdScript = `<script type="application/ld+json">${stringifyJsonLd(jsonLd)}</script>`;

  const metaTags = [
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtml(catalogUrl)}" />`,
    `<meta property="og:title" content="${escapeHtml(pageTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(metaDescription)}" />`,
    `<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${escapeHtml(ri.ogLocale)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(pageTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metaDescription)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`,
    `<meta name="description" content="${escapeHtml(metaDescription)}" />`,
    `<link rel="canonical" href="${escapeHtml(catalogUrl)}" />`,
    jsonLdScript,
  ].join('\n  ');

  let html;
  try {
    const indexUrl = `${origin}/index.html`;
    const res = await fetch(indexUrl, { headers: { Accept: 'text/html' } });
    if (!res.ok) throw new Error(`index.html ${res.status}`);
    html = await res.text();
  } catch (e) {
    return new Response(`Failed to load template: ${e.message}`, { status: 502 });
  }

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(pageTitle)}</title>`);

  const injectBefore = '</head>';
  const insertIndex = html.indexOf(injectBefore);
  let injected =
    insertIndex !== -1
      ? html.slice(0, insertIndex) + '\n  ' + metaTags + '\n  ' + html.slice(insertIndex)
      : html;

  return new Response(injected, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
