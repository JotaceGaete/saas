/**
 * SEO compartido para catálogos públicos (/catalogo/:slug).
 * Usado en cliente (Helmet) y en funciones serverless (meta, JSON-LD).
 */

import { getCountryConfig } from '../config/countryConfig';

/** Texto fijo para Open Graph / vista previa en redes (WhatsApp, etc.). */
export const CATALOG_OG_DESCRIPTION =
  'Mira nuestros productos y haz tu pedido por WhatsApp.';

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
export function getCatalogOgImageUrl(business, baseUrl, options = {}) {
  const ogApi =
    (options.ogImageApiBase && String(options.ogImageApiBase).trim()) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OG_IMAGE_API_BASE?.trim()) ||
    '';
  if (ogApi && business?.id) {
    return `${ogApi.replace(/\/$/, '')}/api/og-image?store=${encodeURIComponent(business.id)}`;
  }

  const origin = (
    baseUrl ||
    (typeof window !== 'undefined' ? window.location?.origin : '') ||
    ''
  ).replace(/\/$/, '');
  const ds = business?.designSettings || {};
  const og = (business?.ogImageUrl)?.trim();
  const logo = (business?.logoUrl || ds?.logoUrl)?.trim();
  const cover = (business?.coverImageUrl || ds?.headerImageUrl || ds?.coverImageUrl)?.trim();

  const toAbsolute = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  if (cover) return toAbsolute(cover);
  if (og) return toAbsolute(og);
  if (logo) return toAbsolute(logo);
  const name = (business?.name || 'Catálogo').replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Catalogo';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7C3AED&color=fff&size=1200&format=png`;
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
