/**
 * Branding viral para plan Free (Starter).
 * Un único punto de verdad: si el negocio debe mostrar branding "Creado con Ventalink".
 */

const FREE_PLAN_SLUG = 'starter';
const VENTALINK_URL = 'https://ventalink.app';

/**
 * Indica si el negocio debe mostrar el branding viral (solo plan Free/Starter).
 * @param {Object|string} businessOrPlanSlug - Objeto con { planSlug } o string con el slug del plan
 * @returns {boolean}
 */
export function hasViralBranding(businessOrPlanSlug) {
  const slug =
    typeof businessOrPlanSlug === 'string'
      ? businessOrPlanSlug
      : businessOrPlanSlug?.planSlug ?? businessOrPlanSlug?.plan_slug;
  return slug === FREE_PLAN_SLUG;
}

/**
 * Texto a añadir al final del mensaje de pedido por WhatsApp cuando el negocio es Free.
 * @returns {string}
 */
export function getOrderMessageBrandingSuffix() {
  return [
    'Pedido enviado desde Ventalink',
    'Crea tu catálogo gratis:',
    VENTALINK_URL,
  ].join('\n');
}

export { VENTALINK_URL };
