import { COUNTRY_CONFIG, COUNTRY_CODES } from '../../config/countryConfig';

/** Pares [dial sin +, código ISO], ordenados por longitud de prefijo descendente (evita 52 vs 506). */
const DIAL_TO_COUNTRY = (() => {
  const pairs = [];
  for (const code of COUNTRY_CODES) {
    const cfg = COUNTRY_CONFIG[code];
    const raw = cfg?.phonePrefix;
    if (!raw) continue;
    const dial = String(raw).replace(/\D/g, '');
    if (dial.length === 0) continue;
    pairs.push({ dial, code });
  }
  pairs.sort((a, b) => b.dial.length - a.dial.length);
  return pairs;
})();

const MIN_E164_DIGITS = 9;

/**
 * Infiere código ISO desde un valor en formato E.164 o solo dígitos (p. ej. +525512345678).
 * Solo países presentes en COUNTRY_CONFIG; prefijo más largo gana.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function inferCountryCodeFromE164(value) {
  if (value == null || value === '') return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < MIN_E164_DIGITS) return null;
  for (const { dial, code } of DIAL_TO_COUNTRY) {
    if (digits.startsWith(dial)) return code;
  }
  return null;
}
