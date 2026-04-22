/**
 * SEO compartido para catálogos públicos (/catalogo/:slug).
 * Usado en cliente (Helmet) y en funciones serverless (meta, JSON-LD).
 */

import { getCountryConfig } from '../config/countryConfig';
import { resolveCatalogSeoContent } from './catalogDynamicSeo';

/** Texto fijo para Open Graph / vista previa en redes (WhatsApp, etc.). */
export const CATALOG_OG_DESCRIPTION =
  'Mira nuestros productos y haz tu pedido por WhatsApp.';

/** Descripción por defecto cuando el negocio no tiene `description` (previews server-side / share). */
export const CATALOG_SHARE_DESCRIPTION_FALLBACK =
  'Mira mi catálogo y haz tu pedido por WhatsApp.';

/**
 * Parsea `design_settings` desde fila Supabase (objeto o JSON string).
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function parseDesignSettingsFromDb(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return /** @type {Record<string, unknown>} */ (value);
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

/**
 * URL absoluta HTTPS para crawlers (WhatsApp, etc.). `origin` sin barra final.
 * @param {string|null|undefined} url
 * @param {string} originBase
 */
export function toAbsoluteCatalogUrl(url, originBase) {
  const base = String(originBase || '').replace(/\/$/, '');
  if (!url || typeof url !== 'string') return '';
  const t = url.trim();
  if (!t) return '';
  if (t.startsWith('https://')) return t;
  if (t.startsWith('http://')) return t.replace(/^http:\/\//i, 'https://');
  if (!base) return '';
  return `${base}${t.startsWith('/') ? '' : '/'}${t}`;
}

/**
 * Origen público para `/api/og-catalog` (mismo host que el catálogo en prod).
 * Override: `OG_CATALOG_PUBLIC_ORIGIN` o `VITE_APP_URL`; fallback canónico go.
 */
function readOgCatalogPublicOrigin() {
  if (typeof process !== 'undefined' && process.env?.OG_CATALOG_PUBLIC_ORIGIN) {
    return String(process.env.OG_CATALOG_PUBLIC_ORIGIN).replace(/\/$/, '');
  }
  if (typeof process !== 'undefined' && process.env?.VITE_APP_URL) {
    return String(process.env.VITE_APP_URL).replace(/\/$/, '');
  }
  return 'https://go.ventalink.app';
}

/**
 * PNG 1200×630 vía Vercel Serverless (`/api/og-catalog`). No usar portada cruda como og:image.
 * @param {string} slug
 * @param {string|null|undefined} [cacheBust] - ej. updated_at
 * @param {string} [catalogOrigin] - mismo host que `resolveCatalogOgImageUrl(..., origin)` (p. ej. https://go.ventalink.app)
 * @returns {string}
 */
export function getOgCatalogShareImageUrl(slug, cacheBust, catalogOrigin) {
  const base = String(catalogOrigin || readOgCatalogPublicOrigin()).replace(/\/$/, '');
  const s = String(slug || '').trim();
  if (!base || !s) return '';
  let u = `${base}/api/og-catalog?slug=${encodeURIComponent(s)}`;
  if (cacheBust != null && String(cacheBust).trim() !== '') {
    u += `&v=${encodeURIComponent(String(cacheBust))}`;
  }
  return u;
}

/**
 * URL única de og:image para catálogos públicos: siempre `/api/og-catalog?slug=…` (opcional `&v=`).
 * Usar en Helmet (SPA), `api/seo`, worker (bots) — misma cadena en todas las capas.
 *
 * @param {string} origin - Origen del request (ej. https://miralatienda.de), sin barra final
 * @param {string} slug
 * @param {string|null|undefined} cacheBust - típicamente `updated_at` (ISO)
 */
export function getCatalogOpenGraphImageUrl(origin, slug, cacheBust) {
  const base = normalizeOriginForOpenGraph(origin);
  const s = String(slug || '').trim();
  if (!base || !s) return '';
  return getOgCatalogShareImageUrl(s, cacheBust ?? null, base);
}

/** HTTPS para og:image en dominios públicos (WhatsApp); conserva http en localhost. */
function normalizeOriginForOpenGraph(origin) {
  let o = String(origin || '').trim().replace(/\/$/, '');
  if (!o) return '';
  if (o.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o)) {
    o = `https://${o.slice(7)}`;
  }
  return o;
}

/**
 * Normaliza a https para meta og:image / Twitter.
 * @param {string} abs
 */
function toHttpsOgImage(abs) {
  if (!abs || typeof abs !== 'string') return '';
  const t = abs.trim();
  if (!t) return '';
  if (t.startsWith('https://')) return t;
  if (t.startsWith('http://')) return `https://${t.slice(7)}`;
  return t;
}

/**
 * Resolución de URL de imagen para contextos sin catálogo con slug, o previews internos.
 * Si `row.slug` existe, la og:image pública es **siempre** `/api/og-catalog?slug=…` (única fuente, alineada con api/seo y worker).
 *
 * @param {Record<string, unknown>|null|undefined} row
 * @param {string} origin - Origen público (https://dominio) sin barra final
 * @param {{ cacheBust?: string|null }} [options]
 */
export function resolveCatalogOgImageUrl(row, origin, options = {}) {
  const base = String(origin || '').replace(/\/$/, '');
  const slug = row?.slug != null ? String(row.slug).trim() : '';
  const ds = parseDesignSettingsFromDb(row?.design_settings);

  /** Convierte un candidato crudo a URL https absoluta o retorna ''. */
  function toAbs(raw) {
    if (raw == null || raw === '') return '';
    const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
    if (!s) return '';
    const a = toHttpsOgImage(toAbsoluteCatalogUrl(s, base));
    return /^https:\/\//i.test(a) ? a : '';
  }

  // Only the explicitly-uploaded WhatsApp share image is valid for OG.
  // Cover image, header image and logo must NOT be used as og:image — they are
  // visual elements for the catalog UI only, not guaranteed to be crawlable or
  // correctly sized for WhatsApp / Facebook previews.

  const generatedOg = toAbs(row?.og_image_url);
  if (generatedOg) return generatedOg;

  // Direct fallback: the raw shareImageUrl before og_image_url has been committed.
  const shareImage = toAbs(ds?.shareImageUrl);
  if (shareImage) return shareImage;

  // No WhatsApp image configured → static system fallback.
  return base ? `${base}/logo-ventalink.png` : 'https://go.ventalink.app/logo-ventalink.png';
}

/** Título del documento / og:title = nombre del catálogo (sin sufijo de marketing). */
export function getCatalogShareDocumentTitle(storeName) {
  const n = (storeName || '').trim();
  return n || 'Catálogo';
}

/**
 * Meta description para compartir: descripción del negocio o fallback corto.
 * @param {Record<string, unknown>|null|undefined} row
 */
export function getCatalogShareDescription(row) {
  const hasSeoSignals =
    !!row &&
    Boolean(
      row?.name ||
      row?.description ||
      row?.seo_content_override ||
      row?.seo_content_ai ||
      row?.seoContentOverride ||
      row?.seoContentAi
    );
  if (!hasSeoSignals) return CATALOG_SHARE_DESCRIPTION_FALLBACK;
  const content = resolveCatalogSeoContent({ business: row || {} });
  const resolved = content?.metaDescription || '';
  if (resolved) return resolved;
  const raw = row && typeof row.description === 'string' ? row.description.trim() : '';
  if (raw) {
    return raw.length > 320 ? `${raw.slice(0, 317)}...` : raw;
  }
  return CATALOG_SHARE_DESCRIPTION_FALLBACK;
}

/**
 * Título corto para og:title / Twitter (marca Ventalink).
 * @param {string} [storeName]
 */
export function getCatalogOgSocialTitle(storeName) {
  const name = (storeName || 'Catálogo').trim() || 'Catálogo';
  return `Catálogo de ${name} - Walinka`;
}

/**
 * og:image del catálogo: con `slug` siempre {@link getCatalogOpenGraphImageUrl} (`/api/og-catalog`).
 *
 * @param {object | null} business — objeto de negocio (camelCase) con slug, updatedAt, etc.
 * @param {string} [baseUrl] — origen público (p. ej. CATALOG_ORIGIN)
 */
export function getCatalogOgImageUrl(business, baseUrl, options = {}) {
  const origin = (
    baseUrl ||
    (typeof window !== 'undefined' ? window.location?.origin : '') ||
    ''
  ).replace(/\/$/, '');
  const ds = business?.designSettings || {};
  const rowLike = {
    slug: business?.slug,
    design_settings: ds,
    og_image_url: business?.ogImageUrl,
  };
  const bust = options.cacheBust !== undefined ? options.cacheBust : business?.updatedAt ?? null;
  return resolveCatalogOgImageUrl(rowLike, origin, { cacheBust: bust });
}

/**
 * @typedef {{ key: 'cl'|'ar'|'intl', countryLabel: string, currencyLabel: string, ogLocale: string }} CatalogRegion
 */

/**
 * @param {{ host?: string, currency?: string, country?: string }} input
 * @returns {CatalogRegion}
 */
export function detectCatalogRegion({ host, currency, country, countryCode } = {}) {
  const hRaw = (host || '').toLowerCase();
  const h = hRaw.split(':')[0];
  const cur = (currency || '').toUpperCase();
  const co = (country || '').toLowerCase();
  const code = String(countryCode || '').trim().toUpperCase();
  const onArHost = /(^|\.)ar\.ventalink\.app$/.test(h);
  const onClHost = /(^|\.)cl\.ventalink\.app$/.test(h);
  const onGoHost = /(^|\.)go\.ventalink\.app$/.test(h);

  if (
    code === 'AR' ||
    cur === 'ARS' ||
    onArHost ||
    h.endsWith('.com.ar') ||
    co.includes('argentina')
  ) {
    return { key: 'ar', countryLabel: 'Argentina', currencyLabel: 'ARS', ogLocale: 'es_AR' };
  }
  if (
    code === 'CL' ||
    cur === 'CLP' ||
    onClHost ||
    co.includes('chile')
  ) {
    return { key: 'cl', countryLabel: 'Chile', currencyLabel: 'CLP', ogLocale: 'es_CL' };
  }
  if (code && code !== 'CL' && code !== 'AR') {
    const cfg = getCountryConfig(code);
    const label = cfg?.name || code;
    const ccy = cur || (cfg?.currency && String(cfg.currency)) || 'USD';
    const loc = (cfg?.locale || 'es').replace('-', '_');
    return { key: 'intl', countryLabel: label, currencyLabel: ccy, ogLocale: loc };
  }
  if (onGoHost) {
    const ccy = cur || 'USD';
    return {
      key: 'intl',
      countryLabel: (country && String(country).trim()) || 'Internacional',
      currencyLabel: ccy,
      ogLocale: 'es',
    };
  }
  return {
    key: 'intl',
    countryLabel: (country && String(country).trim()) || 'Internacional',
    currencyLabel: cur || 'USD',
    ogLocale: 'es',
  };
}

/**
 * @param {string} [city]
 * @param {string} [region]
 * @param {CatalogRegion} regionInfo
 */
export function getLocationLabel(city, region, regionInfo) {
  const c = (city || '').trim();
  if (c) return c;
  const r = (region || '').trim();
  if (r) return r;
  return regionInfo.countryLabel;
}

/**
 * @param {{ storeName?: string, city?: string, region?: string, country?: string, currency?: string, host?: string }} p
 */
export function getCatalogPageTitle(p) {
  const name = (p.storeName || 'Catálogo').trim() || 'Catálogo';
  const ri = detectCatalogRegion(p);
  const loc = getLocationLabel(p.city, p.region, ri);
  return `Catálogo de ${name} en ${loc} | Compra por WhatsApp`;
}

/**
 * @param {{ storeName?: string, city?: string, region?: string, country?: string, currency?: string, host?: string }} p
 */
export function getCatalogMetaDescription(p) {
  const name = (p.storeName || 'Catálogo').trim() || 'Catálogo';
  const ri = detectCatalogRegion(p);
  const loc = getLocationLabel(p.city, p.region, ri);
  return `Compra productos de ${name} en ${loc}. Catálogo online con pedidos por WhatsApp. Fácil, rápido y sin página web.`;
}

/**
 * @param {{
 *   name: string,
 *   imageUrl?: string,
 *   city?: string,
 *   region?: string,
 *   country?: string,
 *   countryCode?: string,
 *   telephone?: string,
 *   url: string,
 *   currency?: string,
 *   host?: string,
 * }} p
 * @returns {Record<string, unknown>}
 */
export function buildLocalBusinessJsonLd(p) {
  const ri = detectCatalogRegion({
    host: p.host,
    currency: p.currency,
    country: p.country,
    countryCode: p.countryCode,
  });
  const locality = getLocationLabel(p.city, p.region, ri);
  const cc =
    (p.countryCode || '').trim().toUpperCase() ||
    (ri.key === 'ar' ? 'AR' : ri.key === 'cl' ? 'CL' : '');

  const postal = {
    '@type': 'PostalAddress',
    addressLocality: locality,
    ...(cc ? { addressCountry: cc } : {}),
  };

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: p.name,
    url: p.url,
    image: p.imageUrl || undefined,
    telephone: p.telephone || undefined,
    address: postal,
  };

  if (!schema.image) delete schema.image;
  if (!schema.telephone) delete schema.telephone;

  return schema;
}

/**
 * @param {Record<string, unknown>} obj
 */
export function stringifyJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

