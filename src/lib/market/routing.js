import { getManualMarketChoice } from '../../config/countryConfig';
import { APP_ORIGIN } from '../../config/appUrl';

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

/** Toda la app vive en APP_ORIGIN (sin subdominios por país). */
export function getDefaultDomainByMarket(_marketCode) {
  return APP_ORIGIN;
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
export function resolveMarketRouting({ businessCountryCode, hostname: _h, path: _p = '/dashboard' }) {
  const targetMarketCode = getMarketCodeByCountry(businessCountryCode);
  const defaultDomain = getDefaultDomainByMarket(targetMarketCode);
  // Sin redirección cross-host: CL/AR/GL comparten APP_ORIGIN (go.ventalink.app).
  return {
    marketCode: targetMarketCode,
    defaultDomain,
    redirect: false,
    redirectUrl: null,
    message: null,
  };
}
