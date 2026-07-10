/**
 * Consolidado: sitemap.xml, HTML OG catálogo, HTML go.ventalink.app (Vercel Hobby: una sola Serverless Function).
 */

import { createClient } from '@supabase/supabase-js';
import {
  buildLocalBusinessJsonLd,
  detectCatalogRegion,
  getCatalogShareDescription,
  getCatalogShareDocumentTitle,
  getOgCatalogShareImageUrl,
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
function normalizeUrlOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/^(https?:\/\/)www\./i, '$1');
}

const CATALOG_ORIGIN = normalizeUrlOrigin(
  process.env.VITE_PUBLIC_CATALOG_URL || process.env.CATALOG_ORIGIN || 'https://miralatienda.de',
);

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

function getOfficialProductUrl(businessSlug, productSlug) {
  const safeBusinessSlug = encodeURIComponent(String(businessSlug || '').trim());
  const safeProductSlug = encodeURIComponent(String(productSlug || '').trim());
  return `${CATALOG_ORIGIN}/p/${safeBusinessSlug}/${safeProductSlug}`;
}

function slugifyProductName(value) {
  return (
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'producto'
  );
}

function parseDesignSettings(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getBusinessLogoUrl(row) {
  const ds = parseDesignSettings(row?.design_settings);
  return row?.logo_url || ds?.logoUrl || null;
}

function getBusinessCoverUrl(row) {
  const ds = parseDesignSettings(row?.design_settings);
  return ds?.headerImageUrl || ds?.coverImageUrl || row?.cover_image_url || null;
}

function getProductImages(row) {
  const images = Array.isArray(row?.images) ? row.images : [];
  return [row?.image_url, ...images].filter((value, index, arr) => {
    const str = typeof value === 'string' ? value.trim() : '';
    return str && arr.findIndex((item) => String(item || '').trim() === str) === index;
  });
}

function toAbsoluteUrl(value, origin) {
  const str = String(value || '').trim();
  if (!str) return '';
  if (/^https?:\/\//i.test(str)) return str;
  if (str.startsWith('//')) return `https:${str}`;
  if (str.startsWith('/')) return `${origin}${str}`;
  return str;
}

function assignFallbackProductSlugs(products = []) {
  const used = new Map();
  return (Array.isArray(products) ? products : []).map((product) => {
    const persistedSlug = String(product?.slug || '').trim();
    if (persistedSlug) {
      used.set(persistedSlug, Math.max(used.get(persistedSlug) || 0, 1));
      return { ...product, _slugSource: 'persisted', _generatedSlug: slugifyProductName(product?.name) };
    }

    const baseSlug = slugifyProductName(product?.name);
    const nextCount = (used.get(baseSlug) || 0) + 1;
    used.set(baseSlug, nextCount);
    const fallbackSlug = nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
    return { ...product, slug: fallbackSlug, _slugSource: 'generated', _generatedSlug: fallbackSlug };
  });
}

async function loadIndexHtml(request) {
  const origin = getOriginCatalog(request);
  if (!origin) throw new Error('Origin unknown');
  const res = await fetch(`${origin}/index.html`, { headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`index.html ${res.status}`);
  return res.text();
}

function injectSeoIntoHtml(html, { title, metaTags }) {
  const metaTitle = metaPlainTextAttr(title);
  let injected = html.replace(/<title>[^<]*<\/title>/i, `<title>${metaTitle}</title>`);
  const injectBefore = '</head>';
  const insertIndex = injected.indexOf(injectBefore);
  return insertIndex !== -1
    ? injected.slice(0, insertIndex) + '\n  ' + metaTags + '\n  ' + injected.slice(insertIndex)
    : injected;
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

  // Selección completa — incluye columnas que pueden no estar en las TypeScript types
  // (og_image_url, country_code, region, seo_family_key, seo_content_override, seo_content_ai).
  // Si el SELECT falla por columna inexistente, reintentamos con columnas mínimas garantizadas.
  const FULL_SELECT =
    'id, name, description, slug, logo_url, cover_image_url, design_settings, og_image_url, city, region, country, country_code, currency, whatsapp, updated_at, rubro_id, seo_family_key, seo_content_override, seo_content_ai, wa_rubros(name, slug)';
  const SAFE_SELECT =
    'id, name, description, slug, logo_url, cover_image_url, design_settings, city, country, currency, whatsapp, updated_at, rubro_id';

  let { data: row, error } = await supabase
    .from('wa_businesses')
    .select(FULL_SELECT)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[seo] full-select error — retrying with safe columns', {
      slug,
      code: error.code,
      message: error.message,
    });
    const retry = await supabase
      .from('wa_businesses')
      .select(SAFE_SELECT)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    row = retry.data;
    if (retry.error) {
      console.error('[seo] safe-select also failed', {
        slug,
        code: retry.error.code,
        message: retry.error.message,
      });
    }
  }

  if (!row) {
    console.log('[seo] no row found for slug:', slug, '— serving index.html');
    // Siempre servimos index.html con 200 explícito para evitar que Vercel haga
    // fall-through al catch-all /((?!api/).*) → index.html. Un cuerpo vacío con
    // 404 provoca ese fall-through y el usuario ve la SPA sin OG tags.
    // React Router maneja el caso "catálogo no encontrado" en cliente.
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
          'X-Catalog-Og-Source': 'seo-handler-fallback',
        },
      });
    } catch (_) {
      return new Response('Not found', { status: 404 });
    }
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
  // og:image apunta siempre a /api/og-catalog, que internamente aplica la
  // prioridad: og_image_url (WhatsApp preview) → portada → logo → fallback diseño.
  const ogImageHttps = getOgCatalogShareImageUrl(
    row.slug,
    row.updated_at ?? null,
    CATALOG_ORIGIN,
  );
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

  // Sin ID configurado, no se emite la etiqueta — "0" no es un App ID válido
  // y no hace falta tener una app de Facebook para que el OG funcione.
  const fbAppIdMeta = fbAppId ? `<meta property="fb:app_id" content="${escapeHtmlCatalog(fbAppId)}" />` : '';

  const metaTags = [
    fbAppIdMeta,
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtmlCatalog(catalogUrl)}" />`,
    `<meta property="og:title" content="${metaTitle}" />`,
    `<meta property="og:description" content="${metaOgDesc}" />`,
    `<meta property="og:image" content="${escapeHtmlCatalog(ogImageHttps)}" />`,
    ogImageSecure,
    `<meta property="og:image:type" content="image/png" />`,
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
      // Metadata social: prioriza frescura. Un s-maxage/SWR largo podía servir
      // og:image de una portada anterior por hasta ~10 min tras guardar cambios.
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
      'X-Catalog-Og-Source': 'seo-handler-v2',
      'X-Catalog-Slug': slug,
    },
  });
}

async function handleProductHtml(request) {
  const url = new URL(request.url);
  const businessSlug = url.searchParams.get('businessSlug')?.trim();
  const productSlug = url.searchParams.get('productSlug')?.trim();

  if (!businessSlug || !productSlug) {
    return new Response('Business and product slug required', { status: 400 });
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Missing Supabase config', { status: 500 });
  }

  const origin = getOriginCatalog(request);
  if (!origin) {
    return new Response('Origin unknown', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const businessSelect =
    'id, name, description, slug, logo_url, cover_image_url, design_settings, og_image_url, city, region, country, country_code, currency, whatsapp, updated_at, is_active';

  const { data: business, error: businessError } = await supabase
    .from('wa_businesses')
    .select(businessSelect)
    .eq('slug', businessSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (businessError) {
    console.error('[seo-product] business lookup failed', {
      businessSlug,
      code: businessError.code,
      message: businessError.message,
    });
  }

  let products = [];
  let product = null;
  if (business?.id) {
    const { data: productRows, error: productsError } = await supabase
      .from('wa_products')
      .select('*')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (productsError) {
      console.error('[seo-product] products lookup failed', {
        businessSlug,
        productSlug,
        businessId: business.id,
        code: productsError.code,
        message: productsError.message,
      });
    } else {
      products = assignFallbackProductSlugs(productRows || []);
      product =
        products.find((item) => {
          const persistedSlug = String(item?.slug || '').trim();
          if (persistedSlug === productSlug) return true;
          return slugifyProductName(item?.name) === productSlug;
        }) || null;
    }
  }

  const productName = product?.name || 'Producto';
  const businessName = business?.name || 'Catalogo';
  const pageTitle = product ? `${productName} | ${businessName}` : `${businessName} | Producto`;
  const descriptionSource =
    product?.long_description ||
    product?.description ||
    business?.description ||
    'Consulta este producto y pide por WhatsApp.';
  const metaDescription = normalizeMetaPlainText(descriptionSource).slice(0, 160);
  const resolvedProductSlug = product?.slug || productSlug;
  const productUrl = getOfficialProductUrl(businessSlug, resolvedProductSlug);
  const businessFallbackImage =
    business?.og_image_url ||
    getBusinessCoverUrl(business) ||
    getBusinessLogoUrl(business) ||
    (business?.slug ? getOgCatalogShareImageUrl(business.slug, business.updated_at ?? null, CATALOG_ORIGIN) : '');
  const selectedImage = product
    ? getProductImages(product)[0] || businessFallbackImage
    : businessFallbackImage;
  const ogImage = toAbsoluteUrl(selectedImage, origin);
  const metaTitle = metaPlainTextAttr(pageTitle);
  const metaDesc = metaPlainTextAttr(metaDescription);
  const ogImageMeta = ogImage
    ? [
        `<meta property="og:image" content="${escapeHtmlCatalog(ogImage)}" />`,
        ogImage.startsWith('https://')
          ? `<meta property="og:image:secure_url" content="${escapeHtmlCatalog(ogImage)}" />`
          : '',
        `<meta name="twitter:image" content="${escapeHtmlCatalog(ogImage)}" />`,
      ]
        .filter(Boolean)
        .join('\n  ')
    : '';

  const metaTags = [
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:url" content="${escapeHtmlCatalog(productUrl)}" />`,
    `<meta property="og:title" content="${metaTitle}" />`,
    `<meta property="og:description" content="${metaDesc}" />`,
    ogImageMeta,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:url" content="${escapeHtmlCatalog(productUrl)}" />`,
    `<meta name="twitter:title" content="${metaTitle}" />`,
    `<meta name="twitter:description" content="${metaDesc}" />`,
    `<meta name="description" content="${metaDesc}" />`,
    `<link rel="canonical" href="${escapeHtmlCatalog(productUrl)}" />`,
  ]
    .filter(Boolean)
    .join('\n  ');

  console.log(
    '[seo-product]',
    JSON.stringify({
      businessSlug,
      productSlug,
      businessFound: !!business?.id,
      productFound: !!product?.id,
      canonical: productUrl,
      selectedImage: ogImage || null,
    }),
  );

  let html;
  try {
    html = await loadIndexHtml(request);
  } catch (e) {
    return new Response(`Failed to load template: ${e.message}`, { status: 502 });
  }

  const injected = injectSeoIntoHtml(html, { title: pageTitle, metaTags });

  return new Response(injected, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Misma política que /catalogo/:slug — metadata social prioriza frescura.
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
      'X-Catalog-Og-Source': 'seo-product-handler-v1',
      'X-Catalog-Slug': businessSlug,
      'X-Product-Slug': productSlug,
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
      const loc = `${CATALOG_ORIGIN}/catalogo/${slug}`;
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

// --- domain-lookup: resuelve hostname personalizado → slug del negocio ---

async function handleDomainLookup(request) {
  const url = new URL(request.url);
  const domain = (url.searchParams.get('domain') || '').toLowerCase().split(':')[0].trim();

  const jsonResp = (data, status = 200, extra = {}) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
    });

  if (!domain) return jsonResp({ slug: null }, 400);

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) return jsonResp({ slug: null }, 503);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: dr, error } = await admin
    .from('business_domains')
    .select('business_id, status')
    .eq('domain', domain)
    .neq('status', 'error')
    .maybeSingle();

  if (error || !dr) return jsonResp({ slug: null }, 404);

  const { data: biz } = await admin
    .from('wa_businesses')
    .select('slug')
    .eq('id', dr.business_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!biz?.slug) return jsonResp({ slug: null }, 404);

  return jsonResp(
    { slug: biz.slug },
    200,
    { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  );
}

// --- Router (mode= en rewrites; slug= para catálogo) ---

async function routeSeoRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const slug = url.searchParams.get('slug')?.trim();
  const mode = url.searchParams.get('mode');
  const publicPath = url.searchParams.get('publicPath');

  if (mode === 'domain-lookup') {
    return handleDomainLookup(request);
  }
  if (publicPath === 'product') {
    return handleProductHtml(request);
  }
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

export async function GET(request) {
  return routeSeoRequest(request);
}

export async function HEAD(request) {
  const response = await routeSeoRequest(request);
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
}
