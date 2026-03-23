import { COUNTRY_CONFIG, getCountryConfig } from '../../config/countryConfig';
import { getCountryCode } from '../../config/country';

const COUNTRY_NAME_TO_CODE = Object.freeze({
  CHILE: 'CL',
  ARGENTINA: 'AR',
  COLOMBIA: 'CO',
  PERU: 'PE',
  MEXICO: 'MX',
});

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolveCountryCodeFromBusiness(business) {
  const fromCode = normalizeText(business?.countryCode ?? business?.country_code);
  if (fromCode && COUNTRY_CONFIG[fromCode]) return fromCode;

  const fromCountryName = COUNTRY_NAME_TO_CODE[normalizeText(business?.country)];
  if (fromCountryName && COUNTRY_CONFIG[fromCountryName]) return fromCountryName;

  return null;
}

/**
 * Fuente de verdad de locale del negocio.
 * Prioriza country_code del negocio; solo usa hostname como sugerencia inicial si no hay negocio.
 */
export function getBusinessLocale(business, options = {}) {
  const fromBusiness = resolveCountryCodeFromBusiness(business);
  const preferredCountryCode = normalizeText(options?.preferredCountryCode);
  const hostnameCountryCode = normalizeText(getCountryCode());
  const fallbackCountryCode = normalizeText(options?.fallbackCountryCode || 'CL');

  const countryCode =
    fromBusiness ||
    (preferredCountryCode && COUNTRY_CONFIG[preferredCountryCode] ? preferredCountryCode : null) ||
    (hostnameCountryCode && COUNTRY_CONFIG[hostnameCountryCode] ? hostnameCountryCode : null) ||
    (COUNTRY_CONFIG[fallbackCountryCode] ? fallbackCountryCode : 'CL');

  const config = getCountryConfig(countryCode);

  return {
    countryCode,
    countryName: config?.name || countryCode,
    currencyCode: config?.currency || 'CLP',
    phonePrefix: config?.phonePrefix || '',
    config,
  };
}
