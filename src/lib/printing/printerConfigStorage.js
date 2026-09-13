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

// PRINT-5: v1 (printerName/paperWidthMm/autoCut/printLogo/imageMode) pasa
// a v2 (+ profileId/cutStrategyId/effectivePrintableWidthDots) -- ver
// sanitizeConfig más abajo. El número en sí no gatilla ninguna migración
// especial (sanitizeConfig ya rellena campo por campo con defaults
// seguros, nunca lee `raw.schemaVersion`): existe solo como metadata
// legible en el propio JSON guardado.
export const PRINTER_CONFIG_SCHEMA_VERSION = 2;
const DEFAULT_PAPER_WIDTH_MM = 80;
// PRINT-4-BUG3/PRINT-5: ids de estrategia de escPosCapabilities.
// GRAPHICS_STRATEGIES/CUT_STRATEGIES y de
// printerCompatibilityProfiles.COMPATIBILITY_PROFILES. Deliberadamente NO
// se importa ninguno de esos módulos acá -- este archivo es localStorage
// puro, sin lógica de impresión, así que solo conoce los ids como
// strings; esas otras capas son quienes deciden qué hacer con ellos.
const DEFAULT_IMAGE_MODE = 'bitImageEscStar';
const KNOWN_IMAGE_MODES = new Set(['bitImageEscStar', 'rasterGsV0', 'none']);
// PRINT-5 — mismo comando que este archivo ya asumía como el único corte
// posible antes de que existiera `cutStrategyId` (ver renderEscPosReceipt.js
// CMD.CUT_PARTIAL, histórico): una config sin este campo (v1) debe seguir
// produciendo el mismo ticket.
const DEFAULT_CUT_STRATEGY_ID = 'gs-v-modern';
const KNOWN_CUT_STRATEGY_IDS = new Set(['gs-v-modern', 'gs-v-legacy', 'none']);
const DEFAULT_PROFILE_ID = 'generic80';
const KNOWN_PROFILE_IDS = new Set(['generic80', 'compatibility80', 'textOnly80']);

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
    // PRINT-4-BUG1/BUG2/BUG3: la primera prueba física de PRINT-4 con logo
    // salió con símbolos/basura -- se rastreó al comando raster `GS v 0`,
    // no interpretado por el hardware de validación (Star TSP100 Cutter /
    // TSP143), y el logo quedó apagado por defecto hasta confirmar una
    // alternativa. El diagnóstico A/B confirmó físicamente que `ESC *`
    // (bitImageEscStar) SÍ imprime correctamente en ese equipo, así que el
    // logo se reactiva usando esa estrategia -- `GS v 0` (rasterGsV0) NO
    // se elimina, queda disponible para perfiles de otras impresoras.
    printLogo: true,
    imageMode: DEFAULT_IMAGE_MODE,
    // PRINT-5 — estos tres campos son nuevos; sus defaults son
    // EXACTAMENTE el perfil "Recomendado" (generic80), que a su vez
    // reproduce el comportamiento validado en PRINT-4 -- una instalación
    // nueva imprime igual que antes de que existiera esta capa.
    profileId: DEFAULT_PROFILE_ID,
    cutStrategyId: DEFAULT_CUT_STRATEGY_ID,
    // `null` = sin override; usa el ancho efectivo calibrado del perfil
    // físico de 80mm (ver printerProfile.js#PRINTER_PROFILES), sin tocarlo.
    effectivePrintableWidthDots: null,
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
  const printLogo = raw.printLogo !== false;
  const imageMode = KNOWN_IMAGE_MODES.has(raw.imageMode) ? raw.imageMode : DEFAULT_IMAGE_MODE;
  // PRINT-5 — una config guardada por PRINT-1 a PRINT-4 (v1) nunca tuvo
  // estos tres campos: `raw.cutStrategyId`/`raw.profileId` llegan
  // `undefined`, y caen a sus defaults -- exactamente el corte y perfil
  // que esa config YA producía en la práctica (el renderer solo conocía
  // un comando de corte, `gs-v-modern`). `effectivePrintableWidthDots`
  // ausente/no numérico/`<= 0` se guarda como `null` (sin override).
  const cutStrategyId = KNOWN_CUT_STRATEGY_IDS.has(raw.cutStrategyId) ? raw.cutStrategyId : DEFAULT_CUT_STRATEGY_ID;
  const profileId = KNOWN_PROFILE_IDS.has(raw.profileId) ? raw.profileId : DEFAULT_PROFILE_ID;
  const effectivePrintableWidthDots = Number.isFinite(raw.effectivePrintableWidthDots) && raw.effectivePrintableWidthDots > 0
    ? raw.effectivePrintableWidthDots
    : null;
  return {
    schemaVersion: PRINTER_CONFIG_SCHEMA_VERSION,
    printerName,
    paperWidthMm,
    autoCut,
    printLogo,
    imageMode,
    profileId,
    cutStrategyId,
    effectivePrintableWidthDots,
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
