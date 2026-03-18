/**
 * Configuración por país según el dominio o la selección del usuario (go.ventalink.app).
 * cl.ventalink.app → Chile. ar.ventalink.app → Argentina.
 * go.ventalink.app → país desde selección (localStorage); sin selección → null (nunca Chile por defecto).
 */

import { getStoredCountryCode, getCountryConfig } from './countryConfig';

const COUNTRY_AR = 'AR';
const COUNTRY_CL = 'CL';

/**
 * Detecta el país según el hostname o la selección guardada.
 * cl.ventalink.app → CL. ar.ventalink.app → AR.
 * go.ventalink.app → getStoredCountryCode() o null si no hay selección (neutral, sin asumir Chile).
 * Otros hosts → CL (fallback solo fuera de go).
 * @returns {string|null} Código ISO o null en go.ventalink.app cuando el usuario no ha elegido país.
 */
export function getCountryCode() {
  if (typeof window === 'undefined') return COUNTRY_CL;
  const host = (window.location?.hostname || '').toLowerCase();
  if (/(^|\.)cl\.ventalink\.app$/.test(host)) return COUNTRY_CL;
  if (/(^|\.)ar\.ventalink\.app$/.test(host)) return COUNTRY_AR;
  if (/(^|\.)go\.ventalink\.app$/.test(host)) return getStoredCountryCode();
  return COUNTRY_CL;
}

/**
 * Indica si estamos en go.ventalink.app sin país seleccionado (UI neutral).
 */
export function isGoWithoutCountry() {
  return getCountryCode() === null;
}

/**
 * Etiquetas y placeholders por país (dirección, banco, etc.).
 */
export const COUNTRY_LABELS = Object.freeze({
  [COUNTRY_AR]: {
    countryName: 'Argentina',
    flag: '🇦🇷',
    currency: 'ARS',
    currencyName: 'Peso argentino',
    /** Etiqueta del campo que en Chile es "Comuna" */
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: Buenos Aires, Córdoba, Rosario',
    /** Etiqueta del campo que en Chile es "Región" */
    regionLabel: 'Provincia',
    regionPlaceholder: 'Ej: Buenos Aires, Córdoba, Santa Fe',
    addressPlaceholder: 'Ej: Av. Corrientes 1234, piso 2',
    bankPlaceholder: 'Ej: Banco Nación, Galicia, Santander Río...',
    idNumberLabel: 'CUIT/CUIL',
    idNumberPlaceholder: 'Ej: 20-12345678-9',
    /** Tipos de cuenta típicos (sin Cuenta RUT) */
    bankAccountTypes: [
      { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
      { value: 'cuenta_ahorro', label: 'Caja de Ahorro' },
      { value: 'cuenta_vista', label: 'Cuenta Vista' },
    ],
    whatsappHint: 'Formato Argentina: 10 dígitos (código área + número). Ej: 11 1234-5678',
    whatsappErrorPrefix: 'Número móvil Argentina',
    testimonialCities: ['Buenos Aires', 'Córdoba', 'Mendoza'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Argentina',
    benefitsTitle: 'Hecho para Argentina',
    benefitsDescription: 'Diseñado para emprendedores argentinos. Precios en pesos, WhatsApp local y soporte en español.',
  },
  [COUNTRY_CL]: {
    countryName: 'Chile',
    flag: '🇨🇱',
    currency: 'CLP',
    currencyName: 'Peso chileno',
    cityLabel: 'Comuna',
    cityPlaceholder: 'Ej: Providencia, Las Condes',
    regionLabel: 'Región',
    regionPlaceholder: 'Ej: Metropolitana, Valparaíso',
    addressPlaceholder: 'Ej: Av. Providencia 1234, of. 56',
    bankPlaceholder: 'Ej: Banco de Chile, BancoEstado, Santander...',
    idNumberLabel: 'RUT',
    idNumberPlaceholder: 'Ej: 12.345.678-9',
    bankAccountTypes: [
      { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
      { value: 'cuenta_vista', label: 'Cuenta Vista' },
      { value: 'cuenta_ahorro', label: 'Cuenta de Ahorro' },
      { value: 'cuenta_rut', label: 'Cuenta RUT' },
    ],
    whatsappHint: 'Formato Chile: 9 dígitos comenzando con 9. Ej: 93443682',
    whatsappErrorPrefix: 'Número móvil Chile',
    testimonialCities: ['Santiago', 'Valparaíso', 'Concepción'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Chile',
    benefitsTitle: 'Hecho para Chile',
    benefitsDescription: 'Diseñado para emprendedores chilenos. Precios en pesos, WhatsApp local y soporte en español.',
  },
});

/**
 * @param {string} [countryCode] - Si no se pasa, se usa getCountryCode().
 * @returns {typeof COUNTRY_LABELS.AR & { countryName: string, flag: string, currency: string }}
 */
/** Labels neutros cuando no hay país (go.ventalink.app sin selección). Sin referencias a Chile/Argentina. */
const NEUTRAL_LABELS = Object.freeze({
  countryName: 'Tu país',
  flag: '🌐',
  currency: 'USD',
  currencyName: 'USD',
  cityLabel: 'Ciudad',
  cityPlaceholder: 'Ej: Ciudad',
  regionLabel: 'Región',
  regionPlaceholder: 'Ej: Región',
  addressPlaceholder: 'Ej: Dirección',
  bankPlaceholder: 'Ej: Banco...',
  idNumberLabel: 'ID',
  idNumberPlaceholder: 'Ej: Número',
  bankAccountTypes: [
    { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
    { value: 'cuenta_ahorro', label: 'Cuenta de Ahorro' },
  ],
  whatsappHint: 'Selecciona tu país y escribe tu número con código de área si aplica.',
  whatsappErrorPrefix: 'Número móvil',
  testimonialCities: [],
  heroSubtitle: 'Hecho para negocios que venden por WhatsApp',
  benefitsTitle: 'Multi-país',
  benefitsDescription: 'Precios y WhatsApp según tu país.',
});

export function getCountryLabels(countryCode) {
  const resolved = countryCode ?? getCountryCode();
  if (resolved === null || resolved === '') return NEUTRAL_LABELS;
  const code = String(resolved).toUpperCase().trim();
  if (COUNTRY_LABELS[code]) return COUNTRY_LABELS[code];
  const config = getCountryConfig(code);
  return {
    ...NEUTRAL_LABELS,
    countryName: config?.name ?? code,
    flag: config?.flag ?? '🌐',
    currency: config?.currency ?? 'USD',
    currencyName: config?.currency ?? 'USD',
    whatsappHint: `Formato: ${config?.phonePrefix ?? ''} y ${config?.phoneLocalLength ?? 9} dígitos`,
  };
}

/**
 * Moneda del país actual (o del código pasado).
 * @param {string} [countryCode]
 * @returns {string} Código de moneda (CLP, ARS, USD, MXN, etc.)
 */
export function getCurrency(countryCode) {
  const resolved = countryCode ?? getCountryCode();
  if (resolved === null || resolved === '') return NEUTRAL_LABELS.currency;
  const labels = getCountryLabels(resolved);
  return labels?.currency ?? getCountryConfig(resolved)?.currency ?? 'USD';
}

export { COUNTRY_AR, COUNTRY_CL };
