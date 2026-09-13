// PRINT-5 — capa de perfiles de compatibilidad para impresoras térmicas
// ESC/POS de 80mm. Walinka sigue atado a 80mm únicamente (ver
// printerProfile.js#PRINTER_PROFILES) -- esto NO es un sistema de papel
// de distintos anchos, es una forma de que un negocio con una impresora
// que no interpreta bien imagen y/o corte pueda seguir imprimiendo SIN
// tocar código, eligiendo un modo en /crm/impresion.
//
// Cada perfil es solo una COMBINACIÓN NOMBRADA de capacidades que ya
// existen y ya están validadas por separado (ver escPosCapabilities.js
// para las estrategias de imagen/corte, printerProfile.js para el ancho
// físico): elegir un perfil nunca ejecuta lógica nueva, solo materializa
// esos ids en la config guardada (ver printerConfigStorage.js) que
// buildSaleReceipt/renderEscPosReceipt ya sabían leer desde PRINT-4.
//
// Deliberadamente SIN nombres de marca/modelo (ver PRINT-5, sección 9):
// la compatibilidad se resuelve por capacidades declaradas, no
// detectando qué impresora es. Si en el futuro se conocen impresoras
// concretas, un preset adicional puede mapear a estos mismos ids sin
// tocar el renderer ni el flujo de venta.

/**
 * @typedef {Object} CompatibilityProfile
 * @property {string} id
 * @property {string} label - nombre SIN jerga ESC/POS, pensado para mostrarse tal cual en la UI.
 * @property {string} description - explicación breve, también sin jerga técnica.
 * @property {number} paperWidthMm - siempre 80 hoy (Walinka no soporta 58mm en la UI).
 * @property {string} imageMode - id de escPosCapabilities.GRAPHICS_STRATEGIES.
 * @property {string} cutStrategyId - id de escPosCapabilities.CUT_STRATEGIES.
 * @property {boolean} printLogo
 * @property {boolean} autoCut
 * @property {number|null} effectivePrintableWidthDots - override opcional (ver printerProfile.js#buildLayout); `null` = usar el valor validado del perfil físico de 80mm, sin tocarlo.
 */

const PAPER_WIDTH_MM = 80;

/** @type {Record<string, CompatibilityProfile>} */
export const COMPATIBILITY_PROFILES = {
  // PRINT-5 — "Recomendado": el comportamiento por defecto YA validado
  // físicamente en PRINT-4 (ESC * + corte moderno + logo activo + ancho
  // efectivo calibrado). Elegir este perfil en una instalación nueva
  // produce EXACTAMENTE el mismo ticket que imprimía Walinka antes de
  // que existiera esta capa de perfiles.
  generic80: {
    id: 'generic80',
    label: 'Recomendado',
    description: 'Logo, texto e imagen con el corte automático. Funciona en la mayoría de las impresoras térmicas de 80mm.',
    paperWidthMm: PAPER_WIDTH_MM,
    imageMode: 'bitImageEscStar',
    cutStrategyId: 'gs-v-modern',
    printLogo: true,
    autoCut: true,
    effectivePrintableWidthDots: null,
  },
  // PRINT-5 — "Compatibilidad": para una impresora que no interpreta
  // `ESC *`/el corte moderno pero sí el raster estándar `GS v 0` y el
  // corte legacy de 1 byte -- ambos ya existían como estrategias
  // probadas, solo no estaban combinadas como una opción de un click.
  compatibility80: {
    id: 'compatibility80',
    label: 'Compatibilidad',
    description: 'Usa comandos de imagen y corte alternativos. Prueba este modo si el logo o el corte no funcionan con el modo Recomendado.',
    paperWidthMm: PAPER_WIDTH_MM,
    imageMode: 'rasterGsV0',
    cutStrategyId: 'gs-v-legacy',
    printLogo: true,
    autoCut: true,
    effectivePrintableWidthDots: null,
  },
  // PRINT-5 — "Solo texto": para una impresora que no imprime ninguna
  // imagen de forma legible. El corte queda configurable (no forzado a
  // "none"): una impresora puede no soportar imágenes y sí cortar bien.
  textOnly80: {
    id: 'textOnly80',
    label: 'Solo texto',
    description: 'No intenta imprimir el logo. Usa este modo si el logo sale como símbolos o basura en cualquiera de los otros dos.',
    paperWidthMm: PAPER_WIDTH_MM,
    imageMode: 'none',
    cutStrategyId: 'gs-v-modern',
    printLogo: false,
    autoCut: true,
    effectivePrintableWidthDots: null,
  },
};

export const DEFAULT_COMPATIBILITY_PROFILE_ID = 'generic80';

/** Perfil por id; cae al recomendado si el id no es uno conocido -- nunca lanza. */
export function getCompatibilityProfile(id) {
  return COMPATIBILITY_PROFILES[id] || COMPATIBILITY_PROFILES[DEFAULT_COMPATIBILITY_PROFILE_ID];
}

/** Lista de perfiles en el orden en que deben mostrarse en la UI. */
export function listCompatibilityProfiles() {
  return [
    COMPATIBILITY_PROFILES.generic80,
    COMPATIBILITY_PROFILES.compatibility80,
    COMPATIBILITY_PROFILES.textOnly80,
  ];
}

/**
 * PRINT-5 — una config guardada ANTES de esta capa (PRINT-1 a PRINT-4)
 * nunca tuvo `profileId`. Esta función infiere, solo para MOSTRAR algo
 * razonable en el selector de modo, cuál de los tres perfiles se parece
 * más a los campos concretos ya guardados -- nunca escribe nada, nunca
 * decide qué imprimir (eso siempre lo deciden los campos concretos de la
 * config, no este resultado). Basada en capacidades declaradas
 * (imageMode/printLogo), nunca en el nombre de la impresora.
 */
export function matchCompatibilityProfileId(config) {
  if (!config) return DEFAULT_COMPATIBILITY_PROFILE_ID;
  if (config.printLogo === false) return 'textOnly80';
  if (config.imageMode === 'rasterGsV0') return 'compatibility80';
  return DEFAULT_COMPATIBILITY_PROFILE_ID;
}
