/**
 * Consolidado: sitemap.xml, HTML OG catálogo, HTML go.ventalink.app (Vercel Hobby: una sola Serverless Function).
 */

import { createClient } from '@supabase/supabase-js';
import {
  buildLocalBusinessJsonLd,
  detectCatalogRegion,
  getCatalogMetaDescription,
  getCatalogPageTitle,
  stringifyJsonLd,
} from '../src/utils/catalogSeo.js';
import {
  GO_INTERNATIONAL_DESCRIPTION,
  GO_INTERNATIONAL_TITLE,
  buildGoInternationalJsonLd,
  getGoInternationalCanonical,
  getGoInternationalOgImage,
  stringifyJsonLd as stringifyJsonLdGo,
} from '../src/utils/goInternationalSeo.js';

// --- Catálogo (antes catalog-html.js) ---

function escapeHtmlCatalog(str) {
  if (str == null || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getOriginCatalog(request) {
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

async function handleCatalogHtml(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug')?.trim();
  if (!slug) {
    return new Response('Slug required', { status: 400 });
  }

  const origin = getOriginCatalog(request);
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
    countryCode: row.country_code,
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
    `<meta property="og:url" content="${escapeHtmlCatalog(catalogUrl)}" />`,
    `<meta property="og:title" content="${escapeHtmlCatalog(pageTitle)}" />`,
    `<meta property="og:description" content="${escapeHtmlCatalog(metaDescription)}" />`,
    `<meta property="og:image" content="${escapeHtmlCatalog(ogImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${escapeHtmlCatalog(ri.ogLocale)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtmlCatalog(pageTitle)}" />`,
    `<meta name="twitter:description" content="${escapeHtmlCatalog(metaDescription)}" />`,
    `<meta name="twitter:image" content="${escapeHtmlCatalog(ogImage)}" />`,
    `<meta name="description" content="${escapeHtmlCatalog(metaDescription)}" />`,
    `<link rel="canonical" href="${escapeHtmlCatalog(catalogUrl)}" />`,
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

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlCatalog(pageTitle)}</title>`);

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

// --- go.ventalink.app (antes go-html.js) ---

function escapeHtmlGo(str) {
  if (str == null || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getOriginGo(request) {
  const proto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return '';
}

async function handleGoHtml(request) {
  const origin = getOriginGo(request);
  if (!origin) {
    return new Response('Origin unknown', { status: 500 });
  }

  const canonicalUrl = getGoInternationalCanonical(origin);
  const ogImage = getGoInternationalOgImage(origin);
  const title = GO_INTERNATIONAL_TITLE;
  const description = GO_INTERNATIONAL_DESCRIPTION;

  const jsonLd = buildGoInternationalJsonLd({ url: canonicalUrl });
  const jsonLdScript = `<script type="application/ld+json">${stringifyJsonLdGo(jsonLd)}</script>`;

  const metaTags = [
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtmlGo(canonicalUrl)}" />`,
    `<meta property="og:title" content="${escapeHtmlGo(title)}" />`,
    `<meta property="og:description" content="${escapeHtmlGo(description)}" />`,
    `<meta property="og:image" content="${escapeHtmlGo(ogImage)}" />`,
    `<meta property="og:locale" content="es" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtmlGo(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtmlGo(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtmlGo(ogImage)}" />`,
    `<meta name="description" content="${escapeHtmlGo(description)}" />`,
    `<link rel="canonical" href="${escapeHtmlGo(canonicalUrl)}" />`,
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

  html = html.replace(/<html[^>]*>/i, '<html lang="es">');
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlGo(title)}</title>`);

  const injectBefore = '</head>';
  const insertIndex = html.indexOf(injectBefore);
  const injected =
    insertIndex !== -1
      ? html.slice(0, insertIndex) + '\n  ' + metaTags + '\n  ' + html.slice(insertIndex)
      : html;

  return new Response(injected, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
    },
  });
}

// --- Sitemap (antes sitemap.js) ---

function getHostSitemap(request) {
  return request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
}

function getOriginSitemap(request) {
  const proto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || 'https';
  const host = getHostSitemap(request);
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return (process.env.VITE_APP_URL || '').replace(/\/$/, '') || '';
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function handleSitemap(request) {
  const origin = getOriginSitemap(request);
  if (!origin) {
    return new Response('Origin unknown', { status: 500 });
  }

  const host = getHostSitemap(request);
  const isGoIntl = /(^|\.)go\.ventalink\.app$/i.test(host);

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Missing Supabase config', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: rows, error } = await supabase
    .from('wa_businesses')
    .select('slug, updated_at')
    .eq('is_active', true)
    .not('slug', 'is', null);

  if (error) {
    return new Response(`Sitemap error: ${error.message}`, { status: 500 });
  }

  const urls = (rows || [])
    .map((r) => {
      const slug = (r.slug || '').trim();
      if (!slug) return null;
      const loc = `${origin}/catalogo/${slug}`;
      let lastmod = '';
      if (r.updated_at) {
        try {
          lastmod = new Date(r.updated_at).toISOString().split('T')[0];
        } catch (_) {
          lastmod = '';
        }
      }
      return { loc, lastmod };
    })
    .filter(Boolean);

  const catalogUrls = urls
    .map(({ loc, lastmod }) => {
      const lm = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : '';
      return `  <url>
    <loc>${escapeXml(loc)}</loc>${lm}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join('\n');

  const homeUrl = isGoIntl
    ? `  <url>
    <loc>${escapeXml(`${origin}/`)}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`
    : '';

  const blocks = [homeUrl, catalogUrls].filter(Boolean).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${blocks}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

// --- Router (mode= en rewrites; slug= para catálogo) ---

export async function GET(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const slug = url.searchParams.get('slug')?.trim();
  const mode = url.searchParams.get('mode');

  if (slug) {
    return handleCatalogHtml(request);
  }
  if (mode === 'sitemap') {
    return handleSitemap(request);
  }
  if (mode === 'go') {
    return handleGoHtml(request);
  }
  if (path === '/api/go-html' || path.endsWith('/api/go-html')) {
    return handleGoHtml(request);
  }
  if (path === '/api/catalog-html' || path.endsWith('/api/catalog-html')) {
    return handleCatalogHtml(request);
  }
  if (path === '/api/sitemap' || path.endsWith('/api/sitemap')) {
    return handleSitemap(request);
  }
  return new Response('Not found', { status: 404 });
}
