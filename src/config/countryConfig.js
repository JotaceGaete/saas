/**
 * Configuración global de países para go.ventalink.app.
 * Usado para: prefijo WhatsApp, moneda, locale BCP 47 (Intl), símbolo y formato de precios.
 * CL/AR también están soportados, pero no se usan subdominios por mercado: todo vive en go.ventalink.app.
 */

export const COUNTRY_CONFIG = Object.freeze({
  CL: {
    code: 'CL',
    name: 'Chile',
    flag: '🇨🇱',
    currency: 'CLP',
    symbol: '$',
    /** Locale para Intl.NumberFormat (moneda y números). */
    locale: 'es-CL',
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
    locale: 'es-AR',
    phonePrefix: '+54',
    phoneLocalLength: 10,
    phoneLocalPrefix: null,
  },
  BO: {
    code: 'BO',
    name: 'Bolivia',
    flag: '🇧🇴',
    currency: 'BOB',
    symbol: 'Bs',
    locale: 'es-BO',
    phonePrefix: '+591',
    phoneLocalLength: 8,
    phoneLocalPrefix: null,
  },
  CR: {
    code: 'CR',
    name: 'Costa Rica',
    flag: '🇨🇷',
    currency: 'CRC',
    symbol: '₡',
    locale: 'es-CR',
    phonePrefix: '+506',
    phoneLocalLength: 8,
    phoneLocalPrefix: null,
  },
  EC: {
    code: 'EC',
    name: 'Ecuador',
    flag: '🇪🇨',
    currency: 'USD',
    symbol: 'US$',
    locale: 'es-EC',
    phonePrefix: '+593',
    phoneLocalLength: 9,
    phoneLocalPrefix: '9',
  },
  GT: {
    code: 'GT',
    name: 'Guatemala',
    flag: '🇬🇹',
    currency: 'GTQ',
    symbol: 'Q',
    locale: 'es-GT',
    phonePrefix: '+502',
    phoneLocalLength: 8,
    phoneLocalPrefix: null,
  },
  MX: {
    code: 'MX',
    name: 'México',
    flag: '🇲🇽',
    currency: 'MXN',
    symbol: '$',
    locale: 'es-MX',
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
    locale: 'es-PE',
    phonePrefix: '+51',
    phoneLocalLength: 9,
    phoneLocalPrefix: '9',
  },
  PA: {
    code: 'PA',
    name: 'Panamá',
    flag: '🇵🇦',
    currency: 'USD',
    symbol: 'US$',
    phonePrefix: '+507',
    phoneLocalLength: 8,
    phoneLocalPrefix: null,
  },
  PY: {
    code: 'PY',
    name: 'Paraguay',
    flag: '🇵🇾',
    currency: 'PYG',
    symbol: '₲',
    locale: 'es-PY',
    phonePrefix: '+595',
    phoneLocalLength: 9,
    phoneLocalPrefix: '9',
  },
  UY: {
    code: 'UY',
    name: 'Uruguay',
    flag: '🇺🇾',
    currency: 'UYU',
    symbol: '$U',
    locale: 'es-UY',
    phonePrefix: '+598',
    phoneLocalLength: 8,
    phoneLocalPrefix: null,
  },
  CO: {
    code: 'CO',
    name: 'Colombia',
    flag: '🇨🇴',
    currency: 'COP',
    symbol: '$',
    locale: 'es-CO',
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
    locale: 'es-ES',
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
    locale: 'en-US',
    phonePrefix: '+1',
    phoneLocalLength: 10,
    phoneLocalPrefix: null,
  },
});

/** Códigos de país soportados (orden para selector). */
export const COUNTRY_CODES = Object.freeze([
  'CL', 'AR',
  'BO', 'CO', 'CR', 'EC', 'GT', 'PA', 'PE', 'PY', 'UY',
  'MX', 'ES', 'US',
]);

const STORAGE_KEY = 'ventalink_country';

/** Mercado elegido explícitamente en landing (CL / AR / GLOBAL). Tiene prioridad sobre geo y país sugerido. */
const MANUAL_MARKET_KEY = 'ventalink_manual_market';

export const MANUAL_MARKET = Object.freeze({
  CL: 'CL',
  AR: 'AR',
  GLOBAL: 'GLOBAL',
});

/**
 * Normaliza valores guardados: cl|ar|go (minúsculas) o CL|AR|GLOBAL legacy.
 * @returns {'CL'|'AR'|'GLOBAL'|null}
 */
export function getManualMarketChoice() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MANUAL_MARKET_KEY);
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'cl') return 'CL';
    if (s === 'ar') return 'AR';
    if (s === 'go' || s === 'global') return 'GLOBAL';
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Persiste la elección de mercado (landing).
 * Valores en localStorage: "cl" | "ar" | "go" (Repositorio / consistencia con specs).
 * GLOBAL limpia país guardado en go para no arrastrar CL.
 * @param {'CL'|'AR'|'GLOBAL'|'cl'|'ar'|'go'|'go'} market
 */
export function setManualMarketChoice(market) {
  if (typeof window === 'undefined') return;
  try {
    const u = String(market || '').trim().toUpperCase();
    let store = null;
    if (u === 'CL') store = 'cl';
    else if (u === 'AR') store = 'ar';
    else if (u === 'GLOBAL' || u === 'GO') {
      clearStoredCountryCode();
      store = 'go';
    }
    if (store) localStorage.setItem(MANUAL_MARKET_KEY, store);
  } catch (e) {
    console.warn('[countryConfig] setManualMarketChoice failed', e);
  }
}

export function clearManualMarketChoice() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(MANUAL_MARKET_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Captura elección manual cross-domain desde URL (ej. ?manual_market=go),
 * la persiste en localStorage del host actual y limpia el parámetro.
 * Se ejecuta al bootstrap para que los guards de redirect la vean desde el primer render.
 */
export function bootstrapManualMarketChoiceFromUrl() {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('manual_market');
    if (!raw) return getManualMarketChoice();
    const key = String(raw).trim().toLowerCase();
    if (key === 'cl') setManualMarketChoice('CL');
    else if (key === 'ar') setManualMarketChoice('AR');
    else if (key === 'go' || key === 'global') setManualMarketChoice('GLOBAL');
    else return getManualMarketChoice();

    url.searchParams.delete('manual_market');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next);
    return getManualMarketChoice();
  } catch {
    return getManualMarketChoice();
  }
}

/**
 * Quita solo ventalink_country (p. ej. antes de GLOBAL).
 */
export function clearStoredCountryCode() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

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
  locale: 'en-US',
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

/**
 * Fuente única país → moneda + locale para formato de precios (catálogo, panel, checkout público).
 * No depende del hostname; el caller debe pasar el país persistido del negocio cuando exista.
 * @param {string|null|undefined} countryCode
 * @returns {{ countryCode: string|null, currency: string, locale: string, symbol: string }}
 */
export function getCountryMoneyFormat(countryCode) {
  const cfg = getCountryConfig(countryCode);
  return {
    countryCode: cfg?.code ?? null,
    currency: cfg?.currency || 'USD',
    locale: cfg?.locale || 'en-US',
    symbol: cfg?.symbol || '$',
  };
}
