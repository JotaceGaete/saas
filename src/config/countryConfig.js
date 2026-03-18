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

/**
 * Devuelve la config de un país.
 * @param {string} [code] - Código ISO. Si no se pasa, se usa el país actual (dominio o guardado).
 * @returns {typeof COUNTRY_CONFIG.CL}
 */
export function getCountryConfig(code) {
  const c = (code || '').toUpperCase().trim();
  return COUNTRY_CONFIG[c] ?? COUNTRY_CONFIG.CL;
}
