const VENTALINK_URL = 'https://ventalink.app';

function normalizePlanSlug(businessOrPlanSlug) {
  const raw = typeof businessOrPlanSlug === 'string'
    ? businessOrPlanSlug
    : businessOrPlanSlug?.planSlug ?? businessOrPlanSlug?.plan_slug;
  const slug = (raw || '').toString().trim().toLowerCase();
  if (slug === 'full') return 'business';
  return slug || 'starter';
}

/**
 * Branding dinámico por plan:
 * - starter/free: branding comercial completo
 * - pro: branding discreto
 * - business/full: sin branding
 */
export function getBrandingMessage(businessOrPlanSlug) {
  const plan = normalizePlanSlug(businessOrPlanSlug);
  if (plan === 'business') return '';
  if (plan === 'pro') {
    return [
      'Powered by Ventalink',
      VENTALINK_URL,
    ].join('\n');
  }
  return [
    '🚀 Catálogo creado con Ventalink',
    'Crea el tuyo gratis',
    VENTALINK_URL,
  ].join('\n');
}

export function appendBranding(message, businessOrPlanSlug) {
  const branding = getBrandingMessage(businessOrPlanSlug);
  if (!branding) return message;
  return `${message}\n\n${branding}`;
}

export function getCatalogShareMessage({ businessName, catalogUrl, plan }) {
  const base = `Ver catálogo de ${businessName || 'mi tienda'}: ${catalogUrl || ''}`.trim();
  return appendBranding(base, plan);
}

export function hasViralBranding(businessOrPlanSlug) {
  return !!getBrandingMessage(businessOrPlanSlug);
}

export function getOrderMessageBrandingSuffix(businessOrPlanSlug) {
  return getBrandingMessage(businessOrPlanSlug);
}

export { VENTALINK_URL };
