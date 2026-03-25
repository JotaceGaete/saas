import { getManualMarketChoice } from '../../config/countryConfig';

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return code || null;
}

export function getMarketCodeByCountry(countryCode) {
  const country = normalizeCountryCode(countryCode);
  if (country === 'CL') return 'CL';
  if (country === 'AR') return 'AR';
  return 'GLOBAL';
}

/** Toda la app vive en go.ventalink.app (sin subdominios por país). */
export function getDefaultDomainByMarket(_marketCode) {
  return 'https://go.ventalink.app';
}

/**
 * URL absoluta de registro en el dominio del mercado (producción).
 * @param {'CL'|'AR'|'GLOBAL'} marketCode
 */
export function getMarketBusinessRegistrationUrl(marketCode) {
  const m = String(marketCode || '').trim().toUpperCase();
  const code = m === 'CL' || m === 'AR' ? m : 'GLOBAL';
  const domain = getDefaultDomainByMarket(code).replace(/\/$/, '');
  const manualParam = code === 'GLOBAL' ? 'go' : code.toLowerCase();
  return `${domain}/business-registration?manual_market=${manualParam}`;
}

/**
 * Navegación completa al flujo de registro en el dominio correcto (evita SPA en host equivocado).
 * En localhost mantiene el mismo origen.
 */
export function navigateToMarketRegistration(marketCode) {
  if (typeof window === 'undefined') return;
  const host = (window.location?.hostname || '').toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  if (isLocal) {
    const origin = window.location.origin.replace(/\/$/, '');
    window.location.href = `${origin}/business-registration`;
    return;
  }
  window.location.href = getMarketBusinessRegistrationUrl(marketCode);
}

export function detectCurrentMarketByHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return 'GLOBAL';
  if (/(^|\.)cl\.ventalink\.app$/.test(host)) return 'CL';
  if (/(^|\.)ar\.ventalink\.app$/.test(host)) return 'AR';
  if (/(^|\.)go\.ventalink\.app$/.test(host)) return 'GLOBAL';
  return 'GLOBAL';
}

/**
 * Bloquea redirecciones automáticas de mercado post-login cuando el usuario eligió mercado en landing.
 * GLOBAL/go: no forzar paso a cl/ar aunque el negocio sugiera otro dominio.
 */
export function shouldSkipAutoMarketRedirect(decision) {
  if (typeof window === 'undefined' || !decision?.redirect || !decision?.redirectUrl) return false;
  const manual = getManualMarketChoice();
  if (!manual) return false;

  const targetMarket = decision.marketCode;

  if (manual === 'GLOBAL') {
    return targetMarket === 'CL' || targetMarket === 'AR';
  }
  if (manual === 'CL' && targetMarket === 'AR') return true;
  if (manual === 'AR' && targetMarket === 'CL') return true;
  return false;
}

/**
 * Solo CL y AR tienen dominio dedicado. Resto de países (BO, CR, etc.) → GLOBAL (go. u host actual).
 * `businessCountryCode` debe ser el código persistido en wa_businesses.country_code (sin inferir por moneda).
 */
export function resolveMarketRouting({ businessCountryCode, hostname, path = '/dashboard' }) {
  const targetMarketCode = getMarketCodeByCountry(businessCountryCode);
  const currentMarketCode = detectCurrentMarketByHostname(hostname);
  const defaultDomain = getDefaultDomainByMarket(targetMarketCode);
  const shouldRedirect =
    targetMarketCode !== 'GLOBAL' &&
    currentMarketCode !== 'GLOBAL' &&
    currentMarketCode !== targetMarketCode;
  const shouldRedirectFromGo = currentMarketCode === 'GLOBAL' && targetMarketCode !== 'GLOBAL';
  const redirect = shouldRedirect || shouldRedirectFromGo;
  return {
    marketCode: targetMarketCode,
    defaultDomain,
    redirect,
    redirectUrl: redirect ? `${defaultDomain.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}` : null,
    message: redirect
      ? `Tu cuenta está registrada en Ventalink ${targetMarketCode === 'CL' ? 'Chile' : 'Argentina'}. Te llevaremos al acceso correcto.`
      : null,
  };
}
