import { MARKET_CODES, getMarketConfig } from './markets';

const SUPPORTED_COUNTRIES = new Set(['CL', 'AR', 'BO', 'BR', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY', 'US', 'ES']);

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return null;
  return SUPPORTED_COUNTRIES.has(code) ? code : null;
}

function getMarketByCountry(countryCode) {
  if (countryCode === 'CL') return MARKET_CODES.CL;
  if (countryCode === 'AR') return MARKET_CODES.AR;
  return MARKET_CODES.INTL;
}

export function resolveMarket({
  businessCountryCode,
  userCountryCode,
  hostnameCountryCode,
  fallbackMarketCode = MARKET_CODES.CL,
}) {
  const business = normalizeCountryCode(businessCountryCode);
  const user = normalizeCountryCode(userCountryCode);
  const host = normalizeCountryCode(hostnameCountryCode);

  const countryCode = business || user || host || null;
  const marketCode = countryCode ? getMarketByCountry(countryCode) : fallbackMarketCode;
  const config = getMarketConfig(marketCode);

  return {
    marketCode,
    countryCode: countryCode || (marketCode === MARKET_CODES.CL ? 'CL' : marketCode === MARKET_CODES.AR ? 'AR' : 'US'),
    currency: config.currency,
    locale: config.locale,
    defaultProvider: config.defaultProvider,
    config,
  };
}
