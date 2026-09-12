// PRINT-1 — configuración local de impresión térmica del TPV, por negocio.
// Mismo patrón que src/lib/posTerminalDraftStorage.js: localStorage
// protegido con try/catch, versión de esquema, sanitización de lo leído,
// tolerante a localStorage corrupto o inaccesible (modo privado, cuota
// llena, etc.).
//
// La impresora física elegida es un dato POR DISPOSITIVO/NAVEGADOR (QZ
// Tray ve impresoras distintas en cada equipo), por eso vive acá y no en
// wa_businesses -- ver auditoría PRINT-0, sección E. Nunca se guarda nada
// sensible: solo el nombre de la impresora tal como lo reporta el sistema
// operativo y el ancho de papel configurado.

export const PRINTER_CONFIG_SCHEMA_VERSION = 1;
const DEFAULT_PAPER_WIDTH_MM = 80;

export function buildPrinterConfigKey(businessId) {
  const business = String(businessId || '').trim();
  if (!business) return null;
  return `walinka:printing:${business}`;
}

function getLocalStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Acceso a localStorage bloqueado (algunos modos privados lo lanzan
    // como excepción en vez de devolver null).
    return null;
  }
}

function defaultConfig() {
  return {
    schemaVersion: PRINTER_CONFIG_SCHEMA_VERSION,
    printerName: null,
    paperWidthMm: DEFAULT_PAPER_WIDTH_MM,
    // PRINT-4: corte automático al final del ticket. Se deja preparado
    // como flag simple (sin un sistema de perfiles de impresora) para
    // poder desactivarlo si alguna impresora/cuchilla no lo soporta bien,
    // sin bloquear nunca la venta si el corte falla o no está soportado.
    autoCut: true,
    // PRINT-4-BUG1: la primera prueba física de PRINT-4 con logo salió con
    // símbolos/basura en vez del ticket normal en el TSP100 probado -- la
    // hipótesis más sólida es que el comando raster GS v 0 (o algo en la
    // cadena de carga/rasterización) no es compatible con ese equipo, y
    // como el logo se imprime primero, arrastra el resto del ticket. Por
    // eso el logo queda APAGADO por defecto hasta validarlo con la prueba
    // de diagnóstico (ver buildRasterDiagnosticReceipt) -- el soporte de
    // imagen se conserva completo, listo para activarse por negocio una
    // vez confirmado que el hardware lo soporta.
    printLogo: false,
  };
}

function sanitizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const printerName = typeof raw.printerName === 'string' && raw.printerName.trim()
    ? raw.printerName.trim()
    : null;
  const paperWidthMm = Number.isFinite(raw.paperWidthMm) && raw.paperWidthMm > 0
    ? raw.paperWidthMm
    : DEFAULT_PAPER_WIDTH_MM;
  const autoCut = raw.autoCut !== false;
  const printLogo = raw.printLogo === true;
  return {
    schemaVersion: PRINTER_CONFIG_SCHEMA_VERSION, printerName, paperWidthMm, autoCut, printLogo,
  };
}

/** Lee la config de impresión local; nunca lanza, siempre devuelve una config válida. */
export function readPrinterConfig(key) {
  if (!key) return defaultConfig();
  const storage = getLocalStorage();
  if (!storage) return defaultConfig();
  try {
    const raw = storage.getItem(key);
    if (!raw) return defaultConfig();
    return sanitizeConfig(JSON.parse(raw)) || defaultConfig();
  } catch {
    // JSON corrupto u otro error de lectura -- se ignora silenciosamente,
    // nunca rompe la pantalla de impresión.
    return defaultConfig();
  }
}

/** Persiste la config de impresión local; nunca lanza. */
export function writePrinterConfig(key, config) {
  if (!key) return;
  const sanitized = sanitizeConfig(config);
  if (!sanitized) return;
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(sanitized));
  } catch {
    // Cuota de localStorage llena, modo privado, etc. -- la config
    // simplemente no persiste esta vez.
  }
}
