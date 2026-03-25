import { COUNTRY_CONFIG, getCountryConfig } from '../../config/countryConfig';
import { getCountryCode } from '../../config/country';

const COUNTRY_NAME_TO_CODE = Object.freeze({
  CHILE: 'CL',
  ARGENTINA: 'AR',
  COLOMBIA: 'CO',
  PERU: 'PE',
  MEXICO: 'MX',
  BOLIVIA: 'BO',
  'COSTA RICA': 'CR',
  ECUADOR: 'EC',
  GUATEMALA: 'GT',
  PANAMA: 'PA',
  PARAGUAY: 'PY',
  URUGUAY: 'UY',
  SPAIN: 'ES',
  ESPAÑA: 'ES',
  'UNITED STATES': 'US',
  'ESTADOS UNIDOS': 'US',
});

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolveCountryCodeFromBusiness(business) {
  const fromCode = normalizeText(business?.routingCountryCode ?? business?.countryCode ?? business?.country_code);
  if (fromCode && COUNTRY_CONFIG[fromCode]) return fromCode;

  const fromCountryName = COUNTRY_NAME_TO_CODE[normalizeText(business?.country)];
  if (fromCountryName && COUNTRY_CONFIG[fromCountryName]) return fromCountryName;

  return null;
}

/**
 * Locale del negocio: si hay negocio cargado, solo `country_code` persistido (onboarding).
 * Sin negocio: sugerencia de hostname/localStorage vía getCountryCode(null).
 */
export function getBusinessLocale(business, options = {}) {
  const fromBusiness = resolveCountryCodeFromBusiness(business);
  if (fromBusiness) {
    const config = getCountryConfig(fromBusiness);
    return {
      countryCode: fromBusiness,
      countryName: config?.name || fromBusiness,
      currencyCode: config?.currency || 'USD',
      locale: config?.locale || 'en-US',
      phonePrefix: config?.phonePrefix || '',
      config,
    };
  }

  const preferredCountryCode = normalizeText(options?.preferredCountryCode);
  const hostnameCountryCode = normalizeText(getCountryCode(business));
  const fallbackCountryCode = normalizeText(options?.fallbackCountryCode || 'US');

  const countryCode =
    (preferredCountryCode && COUNTRY_CONFIG[preferredCountryCode] ? preferredCountryCode : null) ||
    (hostnameCountryCode && COUNTRY_CONFIG[hostnameCountryCode] ? hostnameCountryCode : null) ||
    (COUNTRY_CONFIG[fallbackCountryCode] ? fallbackCountryCode : 'US');

  const config = getCountryConfig(countryCode);

  return {
    countryCode,
    countryName: config?.name || countryCode,
    currencyCode: config?.currency || 'USD',
    locale: config?.locale || 'en-US',
    phonePrefix: config?.phonePrefix || '',
    config,
  };
}
