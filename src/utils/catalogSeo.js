/**
 * SEO compartido para catálogos públicos (/catalogo/:slug).
 * Usado en cliente (Helmet) y en funciones serverless (meta, JSON-LD).
 */

import { getCountryConfig } from '../config/countryConfig';

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
