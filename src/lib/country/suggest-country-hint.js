import { COUNTRY_CODES } from '../../config/countryConfig';

const TZ_HINT = Object.freeze({
  'America/Santiago': 'CL',
  'America/Punta_Arenas': 'CL',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Argentina/Cordoba': 'AR',
  'America/Argentina/Mendoza': 'AR',
  'America/Costa_Rica': 'CR',
  'America/Mexico_City': 'MX',
  'America/Bogota': 'CO',
  'America/Lima': 'PE',
  'America/La_Paz': 'BO',
  'America/Guatemala': 'GT',
  'America/Asuncion': 'PY',
  'America/Montevideo': 'UY',
  'America/Caracas': 'VE',
  'America/Panama': 'PA',
  'America/Guayaquil': 'EC',
  'America/El_Salvador': 'SV',
  'America/Tegucigalpa': 'HN',
  'America/Managua': 'NI',
  'America/Havana': 'CU',
  'America/New_York': 'US',
  'America/Los_Angeles': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'Europe/Madrid': 'ES',
});

/**
 * Heurística solo para UX (no persistir). Orden: metadata usuario → locale del navegador → zona horaria.
 * No usa hostname (no es valor guardado).
 */
export function suggestCountryCodeHint({ user } = {}) {
  if (typeof window === 'undefined') return null;

  const meta =
    user?.user_metadata?.country_code ??
    user?.user_metadata?.country ??
    user?.user_metadata?.countryCode ??
    null;
  const fromMeta = String(meta || '')
    .trim()
    .toUpperCase();
  if (fromMeta && COUNTRY_CODES.includes(fromMeta)) return fromMeta;

  const lang = navigator.language || navigator.languages?.[0] || '';
  const m = String(lang).match(/^[a-z]{2}-([A-Z]{2})$/i);
  if (m) {
    const code = m[1].toUpperCase();
    if (COUNTRY_CODES.includes(code)) return code;
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_HINT[tz]) return TZ_HINT[tz];
  } catch {
    /* ignore */
  }

  return null;
}
