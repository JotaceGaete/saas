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

export function getDefaultDomainByMarket(marketCode) {
  const market = String(marketCode || '').trim().toUpperCase();
  if (market === 'CL') return 'https://cl.ventalink.app';
  if (market === 'AR') return 'https://ar.ventalink.app';
  return 'https://go.ventalink.app';
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
