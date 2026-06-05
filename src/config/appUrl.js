/**
 * Origen canónico de la app autenticada (panel, login, registro, billing, admin).
 * NO usar para enlaces del catálogo público — usar CATALOG_ORIGIN.
 */
export const APP_ORIGIN = 'https://go.ventalink.app';

/**
 * Dominio público de catálogos: enlaces compartibles, QR, WhatsApp, og:url, canonical.
 * Fuente de verdad única para URLs de catálogo. Cambiar aquí propaga a toda la app.
 */
function normalizeUrlOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/^(https?:\/\/)www\./i, '$1');
}

export const CATALOG_ORIGIN = normalizeUrlOrigin(
  import.meta.env?.VITE_PUBLIC_CATALOG_URL || 'https://miralatienda.de',
);

const BASE_URL = import.meta.env?.VITE_APP_URL?.trim() || '';

function isLocalhostHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

/** Producción VentALink: cualquier host bajo ventalink.app (incl. go, apex, www) o walinka.com. */
function isVentalinkProductionHostname(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return false;
  return h === 'walinka.com' || h === 'www.walinka.com' || h.endsWith('.walinka.com') ||
    h === 'ventalink.app' || h === 'www.ventalink.app' || h.endsWith('.ventalink.app');
}

/**
 * Host canónico para la app autenticada: siempre APP_ORIGIN en prod VentALink,
 * salvo localhost y previews (Vercel).
 * @returns {string} URL base (sin trailing slash)
 */
export function getAppBaseUrl() {
  if (typeof window !== 'undefined') {
    const host = (window.location.hostname || '').toLowerCase();
    if (isLocalhostHostname(host)) {
      return String(window.location.origin || '').replace(/\/$/, '');
    }
    if (host.endsWith('.vercel.app')) {
      return String(window.location.origin || '').replace(/\/$/, '');
    }
  }
  if (BASE_URL) return BASE_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined' && isVentalinkProductionHostname(window.location.hostname)) {
    return APP_ORIGIN;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, '');
  }
  return APP_ORIGIN;
}

/**
 * @returns {boolean} true si el hostname es el subdominio de app (go.ventalink.app).
 */
export function isCanonicalAppHostname(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  return h === 'go.ventalink.app';
}

/**
 * Dominio canónico para catálogo público (compartir, WhatsApp, QR, SEO cliente).
 * Siempre CATALOG_ORIGIN — nunca localhost ni APP_ORIGIN.
 * @returns {string}
 */
export function getPublicCatalogBaseUrl() {
  return CATALOG_ORIGIN;
}

/**
 * Segmento interno de ruta para React Router y navegación SPA.
 * NO usar para URLs públicas compartibles — usar getPublicCatalogUrl.
 */
export const PUBLIC_CATALOG_SHARE_SEGMENT = 'catalogo';

/**
 * Ruta relativa interna del catálogo (para navigate() de React Router).
 * NO es una URL pública compartible.
 * @param {string} slug
 * @returns {string} p. ej. `/catalogo/mi-tienda` o ''
 */
export function getPublicCatalogRelativePath(slug) {
  const s = String(slug || '').trim();
  if (!s) return '';
  return `/${PUBLIC_CATALOG_SHARE_SEGMENT}/${s}`;
}

/**
 * Enlace compartible estándar del catálogo público.
 * Formato oficial: `https://miralatienda.de/catalogo/:slug`
 * getWhatsAppOrderCatalogUrl, QR y copiar-link delegan aquí.
 * @param {string} slug
 * @returns {string}
 */
export function getPublicCatalogUrl(slug) {
  const s = String(slug || '').trim();
  if (!s) return '';
  return `${CATALOG_ORIGIN}/catalogo/${s}`;
}

/**
 * Enlace compartible de la vista de ofertas del catálogo.
 * @param {string} slug
 * @returns {string}
 */
export function getPublicOffersUrl(slug) {
  const s = String(slug || '').trim();
  if (!s) return '';
  return `${CATALOG_ORIGIN}/catalogo/${s}/ofertas`;
}

/**
 * @param {string} businessSlug
 * @param {string} productSlug
 * @returns {string} p. ej. `https://miralatienda.de/p/tienda/producto-1`
 */
export function getPublicProductUrl(businessSlug, productSlug) {
  const b = String(businessSlug || '').trim();
  const p = String(productSlug || '').trim();
  if (!b || !p) return '';
  return `${CATALOG_ORIGIN}/p/${b}/${p}`;
}

/**
 * Enlace del catálogo para WhatsApp: URL totalmente canónica, sin query params
 * (el crawler de WhatsApp debe ver siempre la misma URL para OG / portada).
 * @param {string} slug
 */
export function getWhatsAppOrderCatalogUrl(slug) {
  return getPublicCatalogUrl(slug);
}

// ---------------------------------------------------------------------------
// Custom-domain helpers
// These are runtime-only and safe to call only from browser code.
// ---------------------------------------------------------------------------

const SAAS_HOST_RE = /^(localhost|127\.0\.0\.1|(.*\.)?go\.ventalink\.app|(.*\.)?ventalink\.app|(.*\.)?walinka\.com|(.*\.)?miralatienda\.de)$/i;

/**
 * Returns true when the current page is served from a merchant's custom domain
 * (e.g. catalogo.gong.cl), NOT from the standard SaaS hosts.
 */
export function isCustomDomainHost() {
  if (typeof window === 'undefined') return false;
  const h = (window.location.hostname || '').toLowerCase();
  return !!h && !SAAS_HOST_RE.test(h);
}

/**
 * Base URL to use for public catalog links when on a custom domain.
 * Returns the current origin (e.g. "https://catalogo.gong.cl") so all
 * generated URLs stay on the merchant's domain.
 * Falls back to CATALOG_ORIGIN on SaaS hosts or SSR.
 */
export function getEffectiveCatalogBaseUrl() {
  if (isCustomDomainHost()) {
    return String(window.location.origin || '').replace(/\/$/, '');
  }
  return CATALOG_ORIGIN;
}

/**
 * Shareable catalog URL respecting custom domains.
 * - Custom domain: https://catalogo.gong.cl/            (root — slug is implicit)
 * - SaaS host:     https://miralatienda.de/catalogo/slug
 */
export function getEffectiveCatalogUrl(slug) {
  if (isCustomDomainHost()) {
    return String(window.location.origin || '').replace(/\/$/, '') + '/';
  }
  return getPublicCatalogUrl(slug);
}

/**
 * Shareable offers URL respecting custom domains.
 */
export function getEffectiveOffersUrl(slug) {
  if (isCustomDomainHost()) {
    const s = String(slug || '').trim();
    return String(window.location.origin || '').replace(/\/$/, '') + `/catalogo/${s}/ofertas`;
  }
  return getPublicOffersUrl(slug);
}

/**
 * Shareable product URL respecting custom domains.
 */
export function getEffectiveProductUrl(businessSlug, productSlug) {
  if (isCustomDomainHost()) {
    const b = String(businessSlug || '').trim();
    const p = String(productSlug || '').trim();
    if (!b || !p) return '';
    return String(window.location.origin || '').replace(/\/$/, '') + `/p/${b}/${p}`;
  }
  return getPublicProductUrl(businessSlug, productSlug);
}

// ---------------------------------------------------------------------------

/**
 * URL de callback para OAuth (Google, etc.) y confirmación de email.
 * En producción VentALink siempre APP_ORIGIN (nunca apex/www).
 */
export function getAuthRedirectUrl() {
  if (typeof window === 'undefined' || !window?.location?.origin) {
    return `${APP_ORIGIN}/auth/callback`;
  }
  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  if (isLocalhostHostname(hostname)) {
    const origin = String(window.location.origin || '').replace(/\/$/, '');
    if (origin) return `${origin}/auth/callback`;
  }
  return `${APP_ORIGIN}/auth/callback`;
}

/**
 * URL de redirección para reset de contraseña (misma política que auth/callback).
 */
export function getResetPasswordRedirectUrl() {
  if (typeof window === 'undefined' || !window?.location?.origin) {
    return `${APP_ORIGIN}/auth/reset-password`;
  }
  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  if (isLocalhostHostname(hostname)) {
    const origin = String(window.location.origin || '').replace(/\/$/, '');
    if (origin) return `${origin}/auth/reset-password`;
  }
  return `${APP_ORIGIN}/auth/reset-password`;
}

export default getAppBaseUrl;
