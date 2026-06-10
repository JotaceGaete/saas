/**
 * Ubicación referencial por país para catálogos sin dirección configurada.
 *
 * Nunca se persiste en wa_businesses: es solo presentación. El catálogo
 * público la usa para que la sección de mapa no se vea vacía, marcada
 * explícitamente como "Ubicación aproximada" hasta que el negocio configure
 * su dirección real en /business-configuration.
 */

const COUNTRY_REFERENCE_LOCATIONS = {
  CL: { city: 'Santiago', country: 'Chile', lat: -33.4372, lng: -70.6506 },
  AR: { city: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lng: -58.3816 },
  PE: { city: 'Lima', country: 'Perú', lat: -12.0464, lng: -77.0428 },
  CO: { city: 'Bogotá', country: 'Colombia', lat: 4.711, lng: -74.0721 },
  MX: { city: 'Ciudad de México', country: 'México', lat: 19.4326, lng: -99.1332 },
  UY: { city: 'Montevideo', country: 'Uruguay', lat: -34.9011, lng: -56.1645 },
};

/** Nombres legacy de wa_businesses.country → código ISO. */
const COUNTRY_NAME_TO_CODE = {
  'chile': 'CL',
  'argentina': 'AR',
  'peru': 'PE',
  'colombia': 'CO',
  'mexico': 'MX',
  'uruguay': 'UY',
};

function normalizeCountryInput(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Devuelve la ubicación referencial para un código ISO ("CL") o nombre de
 * país ("Chile"), o null si no hay referencia para ese país.
 *
 * @param {string} countryCodeOrName
 * @returns {{ city: string, country: string, label: string, subtitle: string, lat: number, lng: number }|null}
 */
export function getCountryReferenceLocation(countryCodeOrName) {
  const raw = String(countryCodeOrName || '').trim();
  if (!raw) return null;

  let code = raw.length === 2 ? raw.toUpperCase() : null;
  if (!code) code = COUNTRY_NAME_TO_CODE[normalizeCountryInput(raw)] || null;

  const base = code ? COUNTRY_REFERENCE_LOCATIONS[code] : null;
  if (!base) return null;

  return {
    ...base,
    label: 'Ubicación aproximada',
    subtitle: 'Configura tu dirección real para que tus clientes sepan dónde encontrarte',
  };
}
