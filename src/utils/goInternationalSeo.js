/**
 * SEO fijo para la landing internacional (go.ventalink.app /).
 */

export const GO_INTERNATIONAL_TITLE =
  'Crear catálogo digital y vender por WhatsApp | Internacional';

export const GO_INTERNATIONAL_DESCRIPTION =
  'Crea tu catálogo online y recibe pedidos por WhatsApp desde cualquier país. Plataforma simple para emprendedores.';

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
 * JSON-LD WebSite para la landing internacional.
 * @param {{ url: string }} p
 */
export function buildGoInternationalJsonLd(p) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'VentALink',
    url: p.url,
    description: GO_INTERNATIONAL_DESCRIPTION,
    inLanguage: 'es',
  };
}

export function stringifyJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
