/**
 * Configuración global de países para go.ventalink.app.
 * Usado para: prefijo WhatsApp, moneda, símbolo, formato de precios y método de pago.
 * CL/AR también usan esta config; en cl/ar.ventalink.app el país viene del dominio.
 */

export const COUNTRY_CONFIG = Object.freeze({
  CL: {
    code: 'CL',
    name: 'Chile',
    flag: '🇨🇱',
    currency: 'CLP',
    symbol: '$',
    phonePrefix: '+56',
    /** Longitud del número local (sin prefijo). Chile móvil: 9 dígitos (9xxxxxxxx). */
    phoneLocalLength: 9,
    /** Primer dígito del número local si es fijo (ej. Chile móvil empieza en 9). */
    phoneLocalPrefix: '9',
  },
  AR: {
    code: 'AR',
    name: 'Argentina',
    flag: '🇦🇷',
    currency: 'ARS',
    symbol: '$',
    phonePrefix: '+54',
    phoneLocalLength: 10,
    phoneLocalPrefix: null,
  },
  MX: {
    code: 'MX',
    name: 'México',
    flag: '🇲🇽',
    currency: 'MXN',
    symbol: '$',
    phonePrefix: '+52',
    phoneLocalLength: 10,
    phoneLocalPrefix: null,
  },
  PE: {
    code: 'PE',
    name: 'Perú',
    flag: '🇵🇪',
    currency: 'PEN',
    symbol: 'S/',
    phonePrefix: '+51',
    phoneLocalLength: 9,
    phoneLocalPrefix: '9',
  },
  CO: {
    code: 'CO',
    name: 'Colombia',
    flag: '🇨🇴',
    currency: 'COP',
    symbol: '$',
    phonePrefix: '+57',
    phoneLocalLength: 10,
    phoneLocalPrefix: '3',
  },
  ES: {
    code: 'ES',
    name: 'España',
    flag: '🇪🇸',
    currency: 'EUR',
    symbol: '€',
    phonePrefix: '+34',
    phoneLocalLength: 9,
    phoneLocalPrefix: null,
  },
  US: {
    code: 'US',
    name: 'Estados Unidos',
    flag: '🇺🇸',
    currency: 'USD',
    symbol: 'US$',
    phonePrefix: '+1',
    phoneLocalLength: 10,
    phoneLocalPrefix: null,
  },
});

/** Códigos de país soportados (orden para selector). */
export const COUNTRY_CODES = Object.freeze(['CL', 'AR', 'MX', 'PE', 'CO', 'ES', 'US']);

const STORAGE_KEY = 'ventalink_country';

/**
 * Lee el país guardado (solo relevante en go.ventalink.app).
 * @returns {string|null} Código ISO o null si no hay guardado.
 */
export function getStoredCountryCode() {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    const code = (v || '').toUpperCase().trim();
    return COUNTRY_CODES.includes(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * Guarda el código de país en localStorage.
 * @param {string} code - Código ISO (CL, AR, MX, etc.)
 */
export function setStoredCountryCode(code) {
  if (typeof window === 'undefined') return;
  try {
    const c = (code || '').toUpperCase().trim();
    if (COUNTRY_CODES.includes(c)) localStorage.setItem(STORAGE_KEY, c);
  } catch (e) {
    console.warn('[countryConfig] setStoredCountryCode failed', e);
  }
}

/** Config neutra cuando no hay país seleccionado (go.ventalink.app). Sin prefijo ni reglas de Chile. */
export const NEUTRAL_COUNTRY_CONFIG = Object.freeze({
  code: null,
  name: null,
  flag: '🌐',
  currency: 'USD',
  symbol: 'US$',
  phonePrefix: '',
  phoneLocalLength: 0,
  phoneLocalPrefix: null,
});

/**
 * Devuelve la config de un país. En go.ventalink.app sin selección (code null/empty) devuelve config neutra.
 * @param {string|null} [code] - Código ISO. null o '' en go = neutro (sin Chile por defecto).
 * @returns {typeof COUNTRY_CONFIG.CL | typeof NEUTRAL_COUNTRY_CONFIG}
 */
export function getCountryConfig(code) {
  if (code === null || code === undefined || String(code).trim() === '') return NEUTRAL_COUNTRY_CONFIG;
  const c = String(code).toUpperCase().trim();
  return COUNTRY_CONFIG[c] ?? NEUTRAL_COUNTRY_CONFIG;
}
