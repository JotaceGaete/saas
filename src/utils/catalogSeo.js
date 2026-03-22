/**
 * SEO compartido para catálogos públicos (/catalogo/:slug).
 * Usado en cliente (Helmet) y en funciones serverless (meta, JSON-LD).
 */

/**
 * @typedef {{ key: 'cl'|'ar', countryLabel: string, currencyLabel: string, ogLocale: string }} CatalogRegion
 */

/**
 * @param {{ host?: string, currency?: string, country?: string }} input
 * @returns {CatalogRegion}
 */
export function detectCatalogRegion({ host, currency, country }) {
  const h = (host || '').toLowerCase();
  const cur = (currency || '').toUpperCase();
  const co = (country || '').toLowerCase();
  if (
    cur === 'ARS' ||
    h.includes('ar.') ||
    h.endsWith('.com.ar') ||
    co.includes('argentina')
  ) {
    return { key: 'ar', countryLabel: 'Argentina', currencyLabel: 'ARS', ogLocale: 'es_AR' };
  }
  return { key: 'cl', countryLabel: 'Chile', currencyLabel: 'CLP', ogLocale: 'es_CL' };
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
 * Párrafos largos para bloque SEO (≥200 palabras) con palabras clave naturales.
 * @param {{ storeName?: string, city?: string, region?: string, country?: string, currency?: string, host?: string }} p
 */
export function buildCatalogSeoLongText(p) {
  const name = (p.storeName || 'este negocio').trim() || 'este negocio';
  const ri = detectCatalogRegion(p);
  const loc = getLocationLabel(p.city, p.region, ri);
  const money = ri.currencyLabel;

  return [
    `En este catálogo online de ${name}, ubicado en ${loc}, puedes ver los productos disponibles y armar tu pedido con claridad. Es un catálogo digital pensado para no depender de una página web compleja: precios en ${money}, información ordenada y un flujo directo para comprar por WhatsApp, ideal si buscas una tienda online simple que funcione bien en el móvil.`,
    `Aquí se concentra la oferta del negocio en un solo lugar. Explora categorías o el listado, revisa cada producto y envía el pedido por el canal que ya usas. Comprar por WhatsApp reduce fricción: escribes, confirmas y listo, sin formularios largos ni cuentas obligatorias.`,
    `Si buscas un catálogo online veloz y fácil de compartir, esta página actúa como vitrina las 24 horas y refuerza la presencia en ${loc}. Términos como catálogo digital, catálogo online, comprar por WhatsApp o tienda online simple describen justamente este tipo de experiencia: claridad, respuesta por mensaje y confianza en un comercio real. Elige productos, revisa tu selección y contacta al comercio en segundos, para pedidos del día a día o encargos puntuales.`,
  ].join('\n\n');
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
  });
  const locality = getLocationLabel(p.city, p.region, ri);
  const cc =
    (p.countryCode || '').trim().toUpperCase() ||
    (ri.key === 'ar' ? 'AR' : 'CL');

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: p.name,
    url: p.url,
    image: p.imageUrl || undefined,
    telephone: p.telephone || undefined,
    address: {
      '@type': 'PostalAddress',
      addressLocality: locality,
      addressCountry: cc,
    },
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
