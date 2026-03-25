/**
 * Configuración por país según el dominio o la selección del usuario (go.ventalink.app).
 * cl.ventalink.app → Chile. ar.ventalink.app → Argentina.
 * go.ventalink.app → país desde selección (localStorage); sin selección → null (nunca Chile por defecto).
 */

import { getStoredCountryCode, getCountryConfig, COUNTRY_CODES } from './countryConfig';

const COUNTRY_AR = 'AR';
const COUNTRY_CL = 'CL';

/**
 * Detecta el país según el hostname o la selección guardada.
 * Si se pasa el objeto `business` (negocio cargado), usa primero su país persistido (routingCountryCode / countryCode).
 * cl.ventalink.app → CL. ar.ventalink.app → AR.
 * go.ventalink.app → getStoredCountryCode() o null si no hay selección (neutral, sin asumir Chile).
 * Otros hosts → mismo criterio que go (localStorage) o null; nunca forzar Chile por defecto.
 * @param {object|null} [business] - Opcional: negocio con routingCountryCode / countryCode.
 * @returns {string|null} Código ISO o null en go.ventalink.app cuando el usuario no ha elegido país.
 */
export function getCountryCode(business) {
  if (business && typeof business === 'object') {
    const fromBiz = business.routingCountryCode ?? business.countryCode;
    const n = String(fromBiz || '').trim().toUpperCase();
    if (n && COUNTRY_CODES.includes(n)) return n;
  }
  if (typeof window === 'undefined') return null;
  const host = (window.location?.hostname || '').toLowerCase();
  if (/(^|\.)cl\.ventalink\.app$/.test(host)) return COUNTRY_CL;
  if (/(^|\.)ar\.ventalink\.app$/.test(host)) return COUNTRY_AR;
  if (/(^|\.)go\.ventalink\.app$/.test(host)) return getStoredCountryCode();
  return getStoredCountryCode();
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
    whatsappHint: 'Formato Chile: 9 dígitos comenzando con 9. Ej: 912345678',
    whatsappErrorPrefix: 'Número móvil Chile',
    testimonialCities: ['Santiago', 'Valparaíso', 'Concepción'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Chile',
    benefitsTitle: 'Hecho para Chile',
    benefitsDescription: 'Diseñado para emprendedores chilenos. Precios en pesos, WhatsApp local y soporte en español.',
  },
  MX: {
    countryName: 'México',
    flag: '🇲🇽',
    currency: 'MXN',
    currencyName: 'Peso mexicano',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: Ciudad de México, Guadalajara, Monterrey',
    regionLabel: 'Estado',
    regionPlaceholder: 'Ej: CDMX, Jalisco, Nuevo León',
    addressPlaceholder: 'Ej: Av. de los Insurgentes Sur 1234, Depto 52',
    bankPlaceholder: 'Ej: BBVA, Banamex, Santander, Banorte...',
    idNumberLabel: 'RFC',
    idNumberPlaceholder: 'Ej: ABCD010203XYZ',
    bankAccountTypes: [
      { value: 'cuenta_clabe', label: 'CLABE' },
      { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
      { value: 'cuenta_corriente', label: 'Cuenta' },
    ],
    whatsappHint: 'Formato México: 10 dígitos (lada + número). Ej: 55 1234 5678',
    whatsappErrorPrefix: 'Número móvil México',
    testimonialCities: ['CDMX', 'Guadalajara', 'Monterrey'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en México',
    benefitsTitle: 'Hecho para México',
    benefitsDescription: 'Diseñado para emprendedores en México. Precios en MXN, WhatsApp local y soporte en español.',
  },
  CO: {
    countryName: 'Colombia',
    flag: '🇨🇴',
    currency: 'COP',
    currencyName: 'Peso colombiano',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: Bogotá, Medellín, Cali',
    regionLabel: 'Departamento',
    regionPlaceholder: 'Ej: Cundinamarca, Antioquia, Valle del Cauca',
    addressPlaceholder: 'Ej: Cra 7 # 72-41, Apto 301',
    bankPlaceholder: 'Ej: Bancolombia, Davivienda, BBVA, Banco de Bogotá...',
    idNumberLabel: 'Cédula/NIT',
    idNumberPlaceholder: 'Ej: 1234567890',
    bankAccountTypes: [
      { value: 'cuenta_ahorros', label: 'Cuenta de Ahorros' },
      { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
      { value: 'nequi_daviplata', label: 'Billetera (Nequi/Daviplata)' },
    ],
    whatsappHint: 'Formato Colombia: 10 dígitos (3xx xxx xxxx). Ej: 300 123 4567',
    whatsappErrorPrefix: 'Número móvil Colombia',
    testimonialCities: ['Bogotá', 'Medellín', 'Cali'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Colombia',
    benefitsTitle: 'Hecho para Colombia',
    benefitsDescription: 'Diseñado para emprendedores colombianos. Precios en COP, WhatsApp local y soporte en español.',
  },
  PE: {
    countryName: 'Perú',
    flag: '🇵🇪',
    currency: 'PEN',
    currencyName: 'Sol peruano',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: Lima, Arequipa, Trujillo',
    regionLabel: 'Región',
    regionPlaceholder: 'Ej: Lima, Arequipa, La Libertad',
    addressPlaceholder: 'Ej: Av. Javier Prado 1234, Dpto 502',
    bankPlaceholder: 'Ej: BCP, Interbank, BBVA, Scotiabank...',
    idNumberLabel: 'DNI/RUC',
    idNumberPlaceholder: 'Ej: 12345678',
    bankAccountTypes: [
      { value: 'cuenta_ahorros', label: 'Cuenta de Ahorros' },
      { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
      { value: 'cuenta_cts', label: 'CTS' },
    ],
    whatsappHint: 'Formato Perú: 9 dígitos (9xx xxx xxx). Ej: 912 345 678',
    whatsappErrorPrefix: 'Número móvil Perú',
    testimonialCities: ['Lima', 'Arequipa', 'Trujillo'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Perú',
    benefitsTitle: 'Hecho para Perú',
    benefitsDescription: 'Diseñado para emprendedores peruanos. Precios en PEN, WhatsApp local y soporte en español.',
  },
  BO: {
    countryName: 'Bolivia',
    flag: '🇧🇴',
    currency: 'BOB',
    currencyName: 'Boliviano',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: La Paz, Santa Cruz, Cochabamba',
    regionLabel: 'Departamento',
    regionPlaceholder: 'Ej: La Paz, Santa Cruz, Cochabamba',
    addressPlaceholder: 'Ej: Av. 16 de Julio 1234, Piso 2',
    bankPlaceholder: 'Ej: Banco Unión, BNB, Banco Bisa...',
    idNumberLabel: 'CI/NIT',
    idNumberPlaceholder: 'Ej: 12345678',
    bankAccountTypes: [
      { value: 'caja_ahorro', label: 'Caja de Ahorro' },
      { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
    ],
    whatsappHint: 'Formato Bolivia: 8 dígitos. Ej: 70123456',
    whatsappErrorPrefix: 'Número móvil Bolivia',
    testimonialCities: ['La Paz', 'Santa Cruz', 'Cochabamba'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Bolivia',
    benefitsTitle: 'Hecho para Bolivia',
    benefitsDescription: 'Precios en BOB, WhatsApp local y soporte en español.',
  },
  CR: {
    countryName: 'Costa Rica',
    flag: '🇨🇷',
    currency: 'CRC',
    currencyName: 'Colón costarricense',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: San José, Alajuela, Heredia',
    regionLabel: 'Provincia',
    regionPlaceholder: 'Ej: San José, Alajuela, Cartago',
    addressPlaceholder: 'Ej: Calle 1, Av. 2, Casa 123',
    bankPlaceholder: 'Ej: BAC, Banco Nacional, BCR...',
    idNumberLabel: 'Cédula',
    idNumberPlaceholder: 'Ej: 1-2345-6789',
    bankAccountTypes: [
      { value: 'cuenta_iban', label: 'Cuenta IBAN' },
      { value: 'cuenta_ahorros', label: 'Cuenta de Ahorros' },
    ],
    whatsappHint: 'Formato Costa Rica: 8 dígitos. Ej: 8888 7777',
    whatsappErrorPrefix: 'Número móvil Costa Rica',
    testimonialCities: ['San José', 'Alajuela', 'Heredia'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Costa Rica',
    benefitsTitle: 'Hecho para Costa Rica',
    benefitsDescription: 'Precios en CRC, WhatsApp local y soporte en español.',
  },
  EC: {
    countryName: 'Ecuador',
    flag: '🇪🇨',
    currency: 'USD',
    currencyName: 'Dólar estadounidense',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: Quito, Guayaquil, Cuenca',
    regionLabel: 'Provincia',
    regionPlaceholder: 'Ej: Pichincha, Guayas, Azuay',
    addressPlaceholder: 'Ej: Av. Amazonas 1234 y Naciones Unidas',
    bankPlaceholder: 'Ej: Banco Pichincha, Banco Guayaquil, Produbanco...',
    idNumberLabel: 'Cédula/RUC',
    idNumberPlaceholder: 'Ej: 0912345678',
    bankAccountTypes: [
      { value: 'cuenta_ahorros', label: 'Cuenta de Ahorros' },
      { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
    ],
    whatsappHint: 'Formato Ecuador: 9 dígitos (9xx xxx xxx). Ej: 099 123 4567',
    whatsappErrorPrefix: 'Número móvil Ecuador',
    testimonialCities: ['Quito', 'Guayaquil', 'Cuenca'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Ecuador',
    benefitsTitle: 'Hecho para Ecuador',
    benefitsDescription: 'Precios en USD, WhatsApp local y soporte en español.',
  },
  GT: {
    countryName: 'Guatemala',
    flag: '🇬🇹',
    currency: 'GTQ',
    currencyName: 'Quetzal',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: Ciudad de Guatemala, Quetzaltenango',
    regionLabel: 'Departamento',
    regionPlaceholder: 'Ej: Guatemala, Sacatepéquez, Quetzaltenango',
    addressPlaceholder: 'Ej: 6a Avenida 10-20, Zona 10',
    bankPlaceholder: 'Ej: Banrural, BI, BAC, G&T Continental...',
    idNumberLabel: 'DPI/NIT',
    idNumberPlaceholder: 'Ej: 1234 56789 0101',
    bankAccountTypes: [
      { value: 'cuenta_ahorros', label: 'Cuenta de Ahorros' },
      { value: 'cuenta_monetaria', label: 'Cuenta Monetaria' },
    ],
    whatsappHint: 'Formato Guatemala: 8 dígitos. Ej: 5512 3456',
    whatsappErrorPrefix: 'Número móvil Guatemala',
    testimonialCities: ['Guatemala', 'Quetzaltenango', 'Antigua'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Guatemala',
    benefitsTitle: 'Hecho para Guatemala',
    benefitsDescription: 'Precios en GTQ, WhatsApp local y soporte en español.',
  },
  PA: {
    countryName: 'Panamá',
    flag: '🇵🇦',
    currency: 'USD',
    currencyName: 'Dólar estadounidense',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: Ciudad de Panamá, San Miguelito',
    regionLabel: 'Provincia',
    regionPlaceholder: 'Ej: Panamá, Chiriquí, Colón',
    addressPlaceholder: 'Ej: Vía España, Edif. 123, Apto 4B',
    bankPlaceholder: 'Ej: Banco General, Banistmo, Caja de Ahorros...',
    idNumberLabel: 'Cédula/RUC',
    idNumberPlaceholder: 'Ej: 8-123-456',
    bankAccountTypes: [
      { value: 'cuenta_ahorros', label: 'Cuenta de Ahorros' },
      { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
    ],
    whatsappHint: 'Formato Panamá: 8 dígitos. Ej: 6123 4567',
    whatsappErrorPrefix: 'Número móvil Panamá',
    testimonialCities: ['Panamá', 'David', 'Colón'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Panamá',
    benefitsTitle: 'Hecho para Panamá',
    benefitsDescription: 'Precios en USD, WhatsApp local y soporte en español.',
  },
  PY: {
    countryName: 'Paraguay',
    flag: '🇵🇾',
    currency: 'PYG',
    currencyName: 'Guaraní',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: Asunción, Ciudad del Este',
    regionLabel: 'Departamento',
    regionPlaceholder: 'Ej: Central, Alto Paraná, Itapúa',
    addressPlaceholder: 'Ej: Av. Mariscal López 1234, Piso 3',
    bankPlaceholder: 'Ej: Banco Itaú, Continental, Visión Banco...',
    idNumberLabel: 'CI/RUC',
    idNumberPlaceholder: 'Ej: 1234567',
    bankAccountTypes: [
      { value: 'caja_ahorro', label: 'Caja de Ahorro' },
      { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
    ],
    whatsappHint: 'Formato Paraguay: 9 dígitos (9xx xxx xxx). Ej: 0981 123 456',
    whatsappErrorPrefix: 'Número móvil Paraguay',
    testimonialCities: ['Asunción', 'CDE', 'Encarnación'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Paraguay',
    benefitsTitle: 'Hecho para Paraguay',
    benefitsDescription: 'Precios en PYG, WhatsApp local y soporte en español.',
  },
  UY: {
    countryName: 'Uruguay',
    flag: '🇺🇾',
    currency: 'UYU',
    currencyName: 'Peso uruguayo',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: Montevideo, Punta del Este, Salto',
    regionLabel: 'Departamento',
    regionPlaceholder: 'Ej: Montevideo, Maldonado, Salto',
    addressPlaceholder: 'Ej: Av. 18 de Julio 1234, Apto 502',
    bankPlaceholder: 'Ej: BROU, Santander, Itaú, Scotiabank...',
    idNumberLabel: 'CI/RUT',
    idNumberPlaceholder: 'Ej: 1234567-8',
    bankAccountTypes: [
      { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
      { value: 'caja_ahorro', label: 'Caja de Ahorro' },
    ],
    whatsappHint: 'Formato Uruguay: 8 dígitos. Ej: 091 234 567',
    whatsappErrorPrefix: 'Número móvil Uruguay',
    testimonialCities: ['Montevideo', 'Maldonado', 'Salto'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en Uruguay',
    benefitsTitle: 'Hecho para Uruguay',
    benefitsDescription: 'Precios en UYU, WhatsApp local y soporte en español.',
  },
  ES: {
    countryName: 'España',
    flag: '🇪🇸',
    currency: 'EUR',
    currencyName: 'Euro',
    cityLabel: 'Ciudad',
    cityPlaceholder: 'Ej: Madrid, Barcelona, Valencia',
    regionLabel: 'Provincia',
    regionPlaceholder: 'Ej: Madrid, Barcelona, Valencia',
    addressPlaceholder: 'Ej: Calle Gran Vía 123, Piso 4',
    bankPlaceholder: 'Ej: CaixaBank, Santander, BBVA, Sabadell...',
    idNumberLabel: 'DNI/NIE',
    idNumberPlaceholder: 'Ej: 12345678Z',
    bankAccountTypes: [
      { value: 'iban', label: 'IBAN' },
      { value: 'cuenta_corriente', label: 'Cuenta Corriente' },
    ],
    whatsappHint: 'Formato España: 9 dígitos. Ej: 612 345 678',
    whatsappErrorPrefix: 'Número móvil España',
    testimonialCities: ['Madrid', 'Barcelona', 'Valencia'],
    heroSubtitle: 'Hecho para negocios que venden por WhatsApp en España',
    benefitsTitle: 'Hecho para España',
    benefitsDescription: 'Precios en EUR, WhatsApp local y soporte en español.',
  },
  US: {
    countryName: 'Estados Unidos',
    flag: '🇺🇸',
    currency: 'USD',
    currencyName: 'Dólar estadounidense',
    cityLabel: 'City',
    cityPlaceholder: 'e.g., Miami, Los Angeles, New York',
    regionLabel: 'State',
    regionPlaceholder: 'e.g., Florida, California, New York',
    addressPlaceholder: 'e.g., 1234 Main St, Apt 5B',
    bankPlaceholder: 'e.g., Chase, Bank of America, Wells Fargo...',
    idNumberLabel: 'ID',
    idNumberPlaceholder: 'e.g., 123-45-6789',
    bankAccountTypes: [
      { value: 'checking', label: 'Checking' },
      { value: 'savings', label: 'Savings' },
    ],
    whatsappHint: 'US format: 10 digits. e.g., 305 123 4567',
    whatsappErrorPrefix: 'US mobile number',
    testimonialCities: ['Miami', 'Los Angeles', 'New York'],
    heroSubtitle: 'Built for businesses selling via WhatsApp',
    benefitsTitle: 'Multi-country',
    benefitsDescription: 'Local pricing and WhatsApp according to your country.',
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
