/**
 * Consolidado: sitemap.xml, HTML OG catálogo, HTML go.ventalink.app (Vercel Hobby: una sola Serverless Function).
 */

import { createClient } from '@supabase/supabase-js';
import {
  buildLocalBusinessJsonLd,
  detectCatalogRegion,
  getCatalogShareDescription,
  getCatalogShareDocumentTitle,
  resolveCatalogOgImageUrl,
  stringifyJsonLd,
} from '../src/utils/catalogSeo.js';
import { resolveCatalogSeoContent } from '../src/utils/catalogDynamicSeo.js';
import {
  GO_INTERNATIONAL_DESCRIPTION,
  GO_INTERNATIONAL_TITLE,
  buildGoInternationalJsonLd,
  getGoInternationalCanonical,
  getGoInternationalOgImage,
  stringifyJsonLd as stringifyJsonLdGo,
} from '../src/utils/goInternationalSeo.js';

// Dominio público canónico para catálogos. Debe coincidir con CATALOG_ORIGIN en appUrl.js.
// Override via env var CATALOG_ORIGIN si se requiere (staging, etc.).
// Se normaliza: sin trailing slash, sin www (ej. https://www.miralatienda.de → https://miralatienda.de).
const CATALOG_ORIGIN = (process.env.CATALOG_ORIGIN || 'https://miralatienda.de')
  .replace(/\/$/, '')
  .replace(/^(https?:\/\/)www\./, '$1');

// --- Catálogo (antes catalog-html.js) ---

/**
 * Texto plano para meta/title: una sola línea (sin saltos de línea en el atributo HTML).
 */
function normalizeMetaPlainText(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function escapeHtmlCatalog(str) {
  if (str == null || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Meta og:title, og:description, twitter:*, name=description, <title> */
function metaPlainTextAttr(str) {
  return escapeHtmlCatalog(normalizeMetaPlainText(str));
}

function getOriginCatalog(request) {
  const proto = request.headers.get('x-forwarded-proto') || request.headers.get('x-forwarded-protocol') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return '';
}

function getOfficialCatalogUrl(slug) {
  const safeSlug = encodeURIComponent(String(slug || '').trim());
  return `${CATALOG_ORIGIN}/catalogo/${safeSlug}`;
}

async function handleCatalogHtml(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug')?.trim();
  if (!slug) {
    return new Response('Slug required', { status: 400 });
  }
  /** Ruta de entrada: 'catalog', 'catalogo', o 'short' (URL corta /:slug).
   *  La URL pública oficial declarada es siempre CATALOG_ORIGIN/catalogo/:slug. */
  const publicPath = url.searchParams.get('publicPath') || 'catalogo';

  const origin = getOriginCatalog(request);
  if (!origin) {
    return new Response('Origin unknown', { status: 500 });
  }

  const host =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const ua = request.headers.get('user-agent') || '';

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Missing Supabase config', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: row, error } = await supabase
    .from('wa_businesses')
    .select(
      'id, name, description, slug, logo_url, cover_image_url, design_settings, og_image_url, city, region, country, country_code, currency, whatsapp, updated_at, rubro_id, seo_family_key, seo_content_override, seo_content_ai, wa_rubros(name, slug)'
    )
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !row) {
    // /:slug puede coincidir con una ruta de app que escapó al catch-all de
    // Vercel. Servimos index.html para que React Router lo maneje en cliente.
    if (publicPath === 'short') {
      try {
        const indexUrl = `${origin}/index.html`;
        const res = await fetch(indexUrl, { headers: { Accept: 'text/html' } });
        if (!res.ok) throw new Error(`index.html ${res.status}`);
        const html = await res.text();
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache',
          },
        });
      } catch (_) {
        return new Response(null, { status: 404 });
      }
    }
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

  const pageTitle = getCatalogShareDocumentTitle(row.name);
  const metaDescription = getCatalogShareDescription(row);
  const ogDescription = resolveCatalogSeoContent({ business: row }).ogDescription || metaDescription;
  const ri = detectCatalogRegion(seoInput);
  const ogImageHttps = resolveCatalogOgImageUrl(row, origin, {
    cacheBust: row.updated_at ?? null,
  });
  // URL pública oficial única para OG, Twitter y canonical.
  // `origin` se conserva para resolver imágenes relativas (og:image, portadas, etc.).
  const catalogUrl = getOfficialCatalogUrl(slug);
  const externalQueryParams = new URLSearchParams(url.searchParams);
  externalQueryParams.delete('slug');
  externalQueryParams.delete('publicPath');
  externalQueryParams.delete('mode');
  const queryStripped = externalQueryParams.toString().length > 0;
  // App ID numérico: https://developers.facebook.com/apps/ → Crear app → Configuración → Información básica → «ID de la aplicación». En Vercel: META_FB_APP_ID o FB_APP_ID.
  const fbAppId = String(process.env.META_FB_APP_ID || process.env.FB_APP_ID || '').trim();

  const metaTitle = metaPlainTextAttr(pageTitle);
  const metaDesc = metaPlainTextAttr(metaDescription);
  const metaOgDesc = metaPlainTextAttr(ogDescription);
  const metaOgLocale = metaPlainTextAttr(ri.ogLocale || '');

  console.log(
    '[og-preview]',
    JSON.stringify({
      slug,
      ua,
      requestUrl: request.url,
      canonical: catalogUrl,
      selectedImage: ogImageHttps,
      queryStripped,
      routeSegment: publicPath,
    }),
  );

  const jsonLd = buildLocalBusinessJsonLd({
    name: row.name || 'Catálogo',
    imageUrl: ogImageHttps,
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

  const ogImageSecure =
    typeof ogImageHttps === 'string' && ogImageHttps.startsWith('https://')
      ? `<meta property="og:image:secure_url" content="${escapeHtmlCatalog(ogImageHttps)}" />`
      : '';

  const fbAppIdContent = fbAppId || '0';
  const fbAppIdMeta = `<meta property="fb:app_id" content="${escapeHtmlCatalog(fbAppIdContent)}" />`;

  const metaTags = [
    fbAppIdMeta,
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtmlCatalog(catalogUrl)}" />`,
    `<meta property="og:title" content="${metaTitle}" />`,
    `<meta property="og:description" content="${metaOgDesc}" />`,
    `<meta property="og:image" content="${escapeHtmlCatalog(ogImageHttps)}" />`,
    ogImageSecure,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${metaOgLocale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:url" content="${escapeHtmlCatalog(catalogUrl)}" />`,
    `<meta name="twitter:title" content="${metaTitle}" />`,
    `<meta name="twitter:description" content="${metaOgDesc}" />`,
    `<meta name="twitter:image" content="${escapeHtmlCatalog(ogImageHttps)}" />`,
    `<meta name="description" content="${metaDesc}" />`,
    `<link rel="canonical" href="${escapeHtmlCatalog(catalogUrl)}" />`,
    jsonLdScript,
  ]
    .filter(Boolean)
    .join('\n  ');

  let html;
  try {
    const indexUrl = `${origin}/index.html`;
    const res = await fetch(indexUrl, { headers: { Accept: 'text/html' } });
    if (!res.ok) throw new Error(`index.html ${res.status}`);
    html = await res.text();
  } catch (e) {
    return new Response(`Failed to load template: ${e.message}`, { status: 502 });
  }

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${metaTitle}</title>`);

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
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
      'X-Catalog-Og-Source': 'seo-handler-v2',
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

/** HTML estático minimal (SEO / sin JS): mismo lenguaje visual que ventalink.app (violeta, Inter/Manrope, hero). */
function buildGoSeoFallbackHtml(origin) {
  const base = String(origin || '').replace(/\/$/, '');
  const title = escapeHtmlGo(GO_INTERNATIONAL_TITLE);
  const desc = escapeHtmlGo(GO_INTERNATIONAL_DESCRIPTION);
  const demoImg = escapeHtmlGo(`${base}/demo-dashboard.png`);
  const marketing = 'https://ventalink.app';
  return `<div id="go-seo-fallback" style="margin:0;padding:0;font-family:Inter,Manrope,system-ui,-apple-system,sans-serif;color:#0f172a;background:#fff;min-height:100vh">
  <div style="position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden" aria-hidden="true">
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 90% 70% at 50% -5%, rgba(124,58,237,0.09) 0%, transparent 65%)"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 85% 20%, rgba(139,92,246,0.07) 0%, transparent 50%)"></div>
  </div>
  <header style="position:relative;z-index:1;border-bottom:1px solid #e2e8f0;background:rgba(255,255,255,0.92);backdrop-filter:blur(12px);padding:14px 24px">
    <div style="max-width:1152px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#7C3AED 0%,#6D28D9 100%);box-shadow:0 2px 8px rgba(124,58,237,0.3)"></div>
        <span style="font-weight:800;font-size:14px;letter-spacing:-0.02em;font-family:Manrope,Inter,sans-serif">Walinka</span>
      </div>
      <a href="${marketing}" style="font-size:14px;font-weight:600;color:#7C3AED;text-decoration:none">Ir a ${escapeHtmlGo(marketing.replace(/^https?:\/\//, ''))} →</a>
    </div>
  </header>
  <main style="position:relative;z-index:1;max-width:1152px;margin:0 auto;padding:48px 24px 64px">
    <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:9999px;font-size:12px;font-weight:600;border:1px solid rgba(124,58,237,0.18);background:rgba(124,58,237,0.06);color:#7C3AED;margin-bottom:24px">Gratis para empezar · Sin tarjeta</div>
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:48px;justify-content:space-between">
      <div style="flex:1;min-width:280px;max-width:560px">
        <h1 style="margin:0 0 16px;font-size:clamp(1.75rem,4vw,3rem);font-weight:800;line-height:1.08;letter-spacing:-0.035em;font-family:Manrope,Inter,sans-serif">
          Crea tu catálogo y recibe pedidos por <span style="background:linear-gradient(135deg,#7C3AED 0%,#A78BFA 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">WhatsApp</span>
        </h1>
        <p style="margin:0 0 28px;font-size:1.05rem;line-height:1.65;color:#64748b;max-width:36rem">${desc}</p>
        <a href="${marketing}" style="display:inline-block;padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px;color:#fff;background:linear-gradient(135deg,#7C3AED,#6D28D9);text-decoration:none;box-shadow:0 4px 14px rgba(124,58,237,0.35)">Descubre Walinka en walinka.com</a>
      </div>
      <div style="flex:1;min-width:260px;max-width:380px;display:flex;flex-direction:column;align-items:center;gap:20px">
        <div style="display:flex;gap:14px;align-items:flex-end;justify-content:center">
          <div style="width:112px;height:224px;border-radius:28px;border:1px solid #e2e8f0;background:#fff;box-shadow:0 24px 48px rgba(124,58,237,0.15)"></div>
          <div style="width:112px;height:224px;border-radius:28px;border:1px solid #e2e8f0;background:#f8fafc;box-shadow:0 20px 40px rgba(124,58,237,0.12);margin-bottom:18px"></div>
        </div>
        <div style="width:100%;max-width:320px;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 20px 50px rgba(15,23,42,0.08)">
          <img src="${demoImg}" alt="Panel Walinka: catálogo y pedidos" width="640" height="400" style="display:block;width:100%;height:auto;vertical-align:middle" loading="eager" decoding="async" />
        </div>
        <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">Catálogo en el móvil · pedidos por WhatsApp</p>
      </div>
    </div>
  </main>
  <noscript>
    <p style="padding:16px 24px;text-align:center;font-size:14px;color:#64748b">${title} — <a href="${marketing}" style="color:#7C3AED;font-weight:600">walinka.com</a></p>
  </noscript>
</div>`;
}

const GO_FALLBACK_STYLES = `<style id="go-seo-fallback-css">html.vl-js #go-seo-fallback{display:none!important}#go-seo-fallback *{box-sizing:border-box}</style>`;

async function handleGoHtml(request) {
  const origin = getOriginGo(request);
  if (!origin) {
    return new Response('Origin unknown', { status: 500 });
  }

  const canonicalUrl = getGoInternationalCanonical(origin);
  const ogImage = getGoInternationalOgImage(origin);
  const title = GO_INTERNATIONAL_TITLE;
  const description = GO_INTERNATIONAL_DESCRIPTION;
  const metaTitleGo = metaPlainTextAttr(title);
  const metaDescGo = metaPlainTextAttr(description);

  const jsonLd = buildGoInternationalJsonLd({ url: canonicalUrl });
  const jsonLdScript = `<script type="application/ld+json">${stringifyJsonLdGo(jsonLd)}</script>`;

  const metaTags = [
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtmlGo(canonicalUrl)}" />`,
    `<meta property="og:title" content="${metaTitleGo}" />`,
    `<meta property="og:description" content="${metaDescGo}" />`,
    `<meta property="og:image" content="${escapeHtmlGo(ogImage)}" />`,
    `<meta property="og:locale" content="es" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${metaTitleGo}" />`,
    `<meta name="twitter:description" content="${metaDescGo}" />`,
    `<meta name="twitter:image" content="${escapeHtmlGo(ogImage)}" />`,
    `<meta name="description" content="${metaDescGo}" />`,
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
  html = html.replace(
    /<head[^>]*>/i,
    (m) =>
      `${m}\n  <script>document.documentElement.classList.add('vl-js');document.documentElement.setAttribute('lang','es');</script>`,
  );
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${metaTitleGo}</title>`);

  const injectBefore = '</head>';
  const insertIndex = html.indexOf(injectBefore);
  const injected =
    insertIndex !== -1
      ? html.slice(0, insertIndex) +
        '\n  ' +
        metaTags +
        '\n  ' +
        GO_FALLBACK_STYLES +
        '\n  ' +
        html.slice(insertIndex)
      : html;
  html = injected;

  const fallbackBlock = buildGoSeoFallbackHtml(origin);
  html = html.replace(/(<div[^>]*\bid="root"[^>]*><\/div>)/i, `${fallbackBlock}\n  $1`);

  return new Response(html, {
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
      const loc = `${CATALOG_ORIGIN}/${slug}`;
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
