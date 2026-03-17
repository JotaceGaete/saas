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
 * Branding dinámico por plan (solo texto, sin enlaces).
 * - starter/free: texto comercial
 * - pro: texto discreto
 * - business/full: sin branding
 */
export function getBrandingMessage(businessOrPlanSlug) {
  const plan = normalizePlanSlug(businessOrPlanSlug);
  if (plan === 'business') return '';
  if (plan === 'pro') return 'Powered by Ventalink';
  return '🚀 Catálogo creado con Ventalink\nCrea el tuyo gratis';
}

export function appendBranding(message, businessOrPlanSlug) {
  const branding = getBrandingMessage(businessOrPlanSlug);
  if (!branding) return message;
  return `${message}\n\n${branding}`;
}

/**
 * Mensaje para compartir catálogo por WhatsApp.
 * Un solo link: la URL del catálogo (al final). Sin enlaces a ventalink/dashboard/app.
 * Orden: nombre tienda, frase breve, link catálogo, opcional branding (solo texto).
 */
export function getCatalogShareMessage({ businessName, catalogUrl, plan }) {
  const name = businessName || 'Mi tienda';
  const phrase = 'Mira mi catálogo y haz tu pedido por WhatsApp.';
  const parts = [name, phrase, catalogUrl || ''].filter(Boolean);
  let msg = parts.join('\n\n');
  const branding = getBrandingMessage(plan);
  if (branding) msg += `\n\n${branding}`;
  return msg.trim();
}

export function hasViralBranding(businessOrPlanSlug) {
  return !!getBrandingMessage(businessOrPlanSlug);
}

export function getOrderMessageBrandingSuffix(businessOrPlanSlug) {
  return getBrandingMessage(businessOrPlanSlug);
}

export { VENTALINK_URL };
