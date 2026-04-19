/**
 * SEO fijo para la landing internacional (go.ventalink.app /).
 */

export const GO_INTERNATIONAL_TITLE =
  'Vende por WhatsApp con tu catálogo online | Walinka';

export const GO_INTERNATIONAL_DESCRIPTION =
  'Crea tu catálogo, comparte tu link y recibe pedidos ordenados por WhatsApp sin complicaciones.';

/**
 * @param {string} origin - Origen sin barra final (ej. https://go.ventalink.app)
 */
export function getGoInternationalCanonical(origin) {
  const base = (origin || '').replace(/\/$/, '');
  return base ? `${base}/` : '';
}

/**
 * @param {string} origin
 */
export function getGoInternationalOgImage(origin) {
  const base = (origin || '').replace(/\/$/, '');
  return base ? `${base}/logo-ventalink.png` : '/logo-ventalink.png';
}

/**
 * JSON-LD WebSite para la landing principal.
 * @param {{ url: string }} p
 */
export function buildGoInternationalJsonLd(p) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Walinka',
    url: p.url,
    description: GO_INTERNATIONAL_DESCRIPTION,
    inLanguage: 'es',
  };
}

export function stringifyJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
