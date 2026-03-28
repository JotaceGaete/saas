/**
 * SEO compartido para catálogos públicos (/catalogo/:slug).
 * Usado en cliente (Helmet) y en funciones serverless (meta, JSON-LD).
 */

import { getCountryConfig } from '../config/countryConfig';

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
 * Imagen OG desde fila `wa_businesses` (REST) o middleware/worker.
 * Prioridad: portada y header en diseño → cover en BD → cover_url legacy → logos → og_image_url → asset Ventalink.
 * Último fallback: `{origin}/logo-ventalink.png`.
 *
 * @param {Record<string, unknown>|null|undefined} row
 * @param {string} origin - Origen público (https://dominio) sin barra final
 * @param {{ cacheBust?: string|null }} [options]
 */
export function resolveCatalogOgImageUrl(row, origin, options = {}) {
  const base = String(origin || '').replace(/\/$/, '');
  const ds = parseDesignSettingsFromDb(row?.design_settings);
  const candidates = [
    ds?.coverImageUrl,
    ds?.headerImageUrl,
    row?.cover_image_url,
    row?.cover_url,
    row?.logo_url,
    ds?.logoUrl,
    row?.og_image_url,
  ];
  let chosen = '';
  for (const c of candidates) {
    const abs = toAbsoluteCatalogUrl(typeof c === 'string' ? c : c != null ? String(c) : '', base);
    if (abs) {
      chosen = abs;
      break;
    }
  }
  if (!chosen) {
    chosen = base ? `${base}/logo-ventalink.png` : 'https://go.ventalink.app/logo-ventalink.png';
  }
  const bust = options.cacheBust;
  if (bust && chosen && !chosen.includes('ui-avatars.com')) {
    const sep = chosen.includes('?') ? '&' : '?';
    chosen = `${chosen}${sep}ogv=${encodeURIComponent(String(bust))}`;
  }
  return chosen;
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
  return `Catálogo de ${name} - Ventalink`;
}

/**
 * URL absoluta para og:image: opcional API de imagen OG, si no portada → og → logo → fallback.
 * No usar /cdn-cgi/image/ aquí: los crawlers (WhatsApp) deben recibir JPEG/PNG originales.
 *
 * @param {object | null} business — objeto de negocio (camelCase) con id, coverImageUrl, etc.
 * @param {string} [baseUrl] — origen para URLs relativas
 */
/**
 * Base URL para generate-og-image (opcional). En Node (Vercel/api) usa process.env;
 * en el navegador Vite puede inyectar process.env.VITE_OG_IMAGE_API_BASE vía define (vite.config.mjs).
 * No usar import.meta: este archivo se importa desde handlers CommonJS.
 */
function readOgImageApiBaseEnv() {
  if (typeof process !== 'undefined' && process.env && typeof process.env.VITE_OG_IMAGE_API_BASE === 'string') {
    const v = process.env.VITE_OG_IMAGE_API_BASE.trim();
    return v || '';
  }
  return '';
}

export function getCatalogOgImageUrl(business, baseUrl, options = {}) {
  const ogApi =
    (options.ogImageApiBase && String(options.ogImageApiBase).trim()) || readOgImageApiBaseEnv();
  if (ogApi && business?.id) {
    return `${ogApi.replace(/\/$/, '')}/api/og-image?store=${encodeURIComponent(business.id)}`;
  }

  const origin = (
    baseUrl ||
    (typeof window !== 'undefined' ? window.location?.origin : '') ||
    ''
  ).replace(/\/$/, '');
  const ds = business?.designSettings || {};
  const rowLike = {
    design_settings: ds,
    cover_image_url: business?.coverImageUrl,
    logo_url: business?.logoUrl,
    og_image_url: business?.ogImageUrl,
  };
  const coverFirst =
    (ds?.coverImageUrl || ds?.headerImageUrl || business?.coverImageUrl || '').trim() || '';
  const og = (business?.ogImageUrl)?.trim();
  const logo = (business?.logoUrl || ds?.logoUrl)?.trim();

  const toAbsolute = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  if (coverFirst) return toAbsolute(coverFirst);
  if (og) return toAbsolute(og);
  if (logo) return toAbsolute(logo);
  return resolveCatalogOgImageUrl(rowLike, origin);
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
