import { COUNTRY_CODES, getCountryConfig } from '../../config/countryConfig';
import { inferCountryCodeFromE164 } from '../phone/inferCountryFromE164';

const SUPPORTED_COUNTRY_CODES = new Set(COUNTRY_CODES);
const FALLBACK_COUNTRY = 'CL';

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return null;
  return SUPPORTED_COUNTRY_CODES.has(code) ? code : null;
}

export function resolveCountryCode({ business, user, phoneInput, explicitCountryCode } = {}) {
  const countryFromExplicit = normalizeCountryCode(explicitCountryCode);
  const countryFromBusiness = normalizeCountryCode(business?.country_code ?? business?.countryCode);
  const countryFromUser = normalizeCountryCode(user?.user_metadata?.country_code ?? user?.user_metadata?.country);
  const inferredFromPhone = inferCountryCodeFromE164(phoneInput);
  const countryFromPhone = normalizeCountryCode(inferredFromPhone);
  const countryFromSupportedList =
    countryFromExplicit ||
    countryFromBusiness ||
    countryFromUser ||
    countryFromPhone ||
    null;

  const finalCountry =
    countryFromSupportedList ||
    FALLBACK_COUNTRY;

  const currency = String(getCountryConfig(finalCountry)?.currency || 'USD').trim().toUpperCase();

  // Log temporal para depurar caídas de UY a fallback CL.
  if (
    String(explicitCountryCode || '').trim().toUpperCase() === 'UY' ||
    String(inferredFromPhone || '').trim().toUpperCase() === 'UY' ||
    String(phoneInput || '').replace(/\D/g, '').startsWith('598')
  ) {
    console.info('[UY_COUNTRY_DEBUG]', {
      phoneInput: phoneInput ?? null,
      explicitCountryCode: countryFromExplicit,
      inferredFromPhone: countryFromPhone,
      countryFromSupportedList,
      finalCountry,
    });
  }

  return {
    countryFromExplicit,
    countryFromBusiness,
    countryFromUser,
    countryFromPhone,
    finalCountry,
    currency,
  };
}
