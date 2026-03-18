/**
 * Configuración por país (Argentina / Chile) según el dominio.
 * ar.ventalink.app → Argentina (ciudades, provincias, ARS, +54).
 * cl.ventalink.app (u otro) → Chile (comunas, regiones, CLP, +56).
 */

const COUNTRY_AR = 'AR';
const COUNTRY_CL = 'CL';

/**
 * Detecta el país según el hostname.
 * ar.ventalink.app → AR. go.ventalink.app → AR (internacional, LemonSqueezy USD). cl.ventalink.app u otro → CL.
 * @returns {'AR'|'CL'}
 */
export function getCountryCode() {
  if (typeof window === 'undefined') return COUNTRY_CL;
  const host = (window.location?.hostname || '').toLowerCase();
  if (/(^|\.)ar\.ventalink\.app$/.test(host)) return COUNTRY_AR;
  if (/(^|\.)go\.ventalink\.app$/.test(host)) return COUNTRY_AR; // internacional → LemonSqueezy (USD)
  return COUNTRY_CL;
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
 * @param {'AR'|'CL'} [countryCode] - Si no se pasa, se usa getCountryCode().
 * @returns {typeof COUNTRY_LABELS.AR}
 */
export function getCountryLabels(countryCode) {
  const code = countryCode ?? getCountryCode();
  return COUNTRY_LABELS[code] ?? COUNTRY_LABELS[COUNTRY_CL];
}

/**
 * Moneda del país actual (o del código pasado).
 * @param {'AR'|'CL'} [countryCode]
 * @returns {'ARS'|'CLP'}
 */
export function getCurrency(countryCode) {
  return getCountryLabels(countryCode).currency;
}

export { COUNTRY_AR, COUNTRY_CL };
