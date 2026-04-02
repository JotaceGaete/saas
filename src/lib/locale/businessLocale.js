import { COUNTRY_CONFIG, getCountryConfig, NEUTRAL_COUNTRY_CONFIG } from '../../config/countryConfig';
import { getCountryCode } from '../../config/country';

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolveCountryCodeFromBusiness(business) {
  const fromDb = normalizeText(
    business?.countryCodeDb ?? business?.country_code ?? business?.countryCode ?? business?.routingCountryCode,
  );
  if (fromDb && COUNTRY_CONFIG[fromDb]) return fromDb;
  return null;
}

/**
 * Locale del negocio: solo si existe `country_code` en BD.
 * Sin país configurado: modo neutro (sin moneda fija ni Chile por hostname persistido).
 * `hostnameSuggestion` es solo UX, no sustituye al país del negocio.
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
      isNeutral: false,
      hostnameSuggestion: null,
    };
  }

  const hostnameSuggestion = normalizeText(
    options?.hostnameSuggestion ?? options?.preferredCountryCode ?? getCountryCode(business),
  );

  return {
    countryCode: null,
    countryName: null,
    currencyCode: null,
    locale: 'es',
    phonePrefix: '',
    config: NEUTRAL_COUNTRY_CONFIG,
    isNeutral: true,
    hostnameSuggestion: hostnameSuggestion && COUNTRY_CONFIG[hostnameSuggestion] ? hostnameSuggestion : null,
  };
}
