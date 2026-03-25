import { MARKET_CODES, getMarketConfig } from './markets';
import { getCountryPricingRow } from '../../config/countryPricing';

const SUPPORTED_COUNTRIES = new Set(['CL', 'AR', 'BO', 'BR', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY', 'US', 'ES']);

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return null;
  return SUPPORTED_COUNTRIES.has(code) ? code : null;
}

/**
 * Resuelve mercado para UI/checkout.
 * Si existe `businessCountryCode`, solo se usa ese valor (precios y moneda del negocio).
 * Sin negocio: sugerencias de usuario/host para landing o páginas públicas.
 */
export function resolveMarket({
  businessCountryCode,
  userCountryCode,
  hostnameCountryCode,
  fallbackMarketCode = MARKET_CODES.INTL,
}) {
  const business = normalizeCountryCode(businessCountryCode);
  if (business) {
    const row = getCountryPricingRow(business);
    const legacy =
      row.legacyMarketCode === 'CL'
        ? MARKET_CODES.CL
        : row.legacyMarketCode === 'AR'
          ? MARKET_CODES.AR
          : MARKET_CODES.INTL;
    const config = getMarketConfig(legacy);
    return {
      marketCode: legacy,
      countryCode: row.countryCode,
      currency: row.currency,
      locale: row.locale,
      defaultProvider: config.defaultProvider,
      config,
    };
  }

  const user = normalizeCountryCode(userCountryCode);
  const host = normalizeCountryCode(hostnameCountryCode);
  const countryCode = user || host || null;
  const marketLegacy = countryCode
    ? countryCode === 'CL'
      ? MARKET_CODES.CL
      : countryCode === 'AR'
        ? MARKET_CODES.AR
        : MARKET_CODES.INTL
    : fallbackMarketCode;
  const config = getMarketConfig(marketLegacy);
  return {
    marketCode: marketLegacy,
    countryCode:
      countryCode || (marketLegacy === MARKET_CODES.CL ? 'CL' : marketLegacy === MARKET_CODES.AR ? 'AR' : 'US'),
    currency: config.currency,
    locale: config.locale,
    defaultProvider: config.defaultProvider,
    config,
  };
}
