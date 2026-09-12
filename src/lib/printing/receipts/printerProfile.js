// PRINT-4-BUG4 — perfil físico de impresora: ancho de papel vs. ancho
// REALMENTE imprimible. La prueba física mostró logo cortado, columnas
// de importes desbordadas y separadores pegados al borde -- todo
// síntoma de una misma causa: el resto del renderer asumía que "papel de
// 80mm" significaba disponer de la totalidad de un ancho de línea
// nominal de 576 dots (72mm, la cifra de hoja de datos genérica de
// impresoras térmicas ESC/POS), sin ningún margen de seguridad, y el
// logo usaba un número de dots totalmente independiente y sin relación
// con las columnas de texto. Este archivo es la ÚNICA fuente de verdad
// para "cuánto espacio hay de verdad": todo lo demás (columnas de texto,
// ancho máximo del logo) se deriva de acá.
//
// PRINT-4-BUG5 (preparación) — esto NO es un perfil de Star: son
// numeros conservadores para "impresora térmica ESC/POS genérica de
// 80mm/58mm". El día que exista un sistema real de perfiles de
// compatibilidad por impresora, ese sistema debe poder construir un
// objeto con esta misma forma ({ paperWidthMm, printableWidthDots,
// safeMarginDots, dotsPerChar, logoMaxWidthFraction }) y pasarlo en vez
// de usar getPrinterProfile() -- por eso todas las funciones de acá
// reciben/devuelven ese objeto explícito en vez de funciones que solo
// aceptan paperWidthMm.

/**
 * @typedef {Object} PrinterProfile
 * @property {number} paperWidthMm
 * @property {number} printableWidthDots - ancho de línea nominal del cabezal, en dots (a 203dpi/8 dots por mm).
 * @property {number} safeMarginDots - margen de seguridad POR LADO, restado del ancho nominal antes de calcular cualquier layout. Cubre tolerancia mecánica/de calibración -- no es decorativo.
 * @property {number} dotsPerChar - ancho de un carácter de Fuente A en dots (12 es el valor estándar ESC/POS de 12x24 dots/carácter, no específico de marca).
 * @property {number} logoMaxWidthFraction - fracción (0-1) del ancho EFECTIVO que el logo puede ocupar como máximo, dejando margen visible a los costados.
 */

const DOTS_PER_CHAR_FONT_A = 12;
const LOGO_MAX_WIDTH_FRACTION = 0.82; // dentro del rango pedido (80-85%)

// PRINT-4-BUG4 — valores conservadores para el perfil físico
// ACTUALMENTE VALIDADO: la hoja de datos genérica de impresoras
// térmicas ESC/POS de 80mm cita 576 dots (72mm) de ancho de línea
// nominal, pero la prueba física mostró desborde incluso con contenido
// dimensionado para ese nominal -- así que además del margen de
// seguridad explícito, el propio nominal usado acá es más chico que esa
// cifra de hoja de datos, deliberadamente. Mismo criterio para 58mm.
export const PRINTER_PROFILES = {
  80: {
    paperWidthMm: 80,
    printableWidthDots: 512,
    safeMarginDots: 24,
    dotsPerChar: DOTS_PER_CHAR_FONT_A,
    logoMaxWidthFraction: LOGO_MAX_WIDTH_FRACTION,
  },
  58: {
    paperWidthMm: 58,
    printableWidthDots: 360,
    safeMarginDots: 16,
    dotsPerChar: DOTS_PER_CHAR_FONT_A,
    logoMaxWidthFraction: LOGO_MAX_WIDTH_FRACTION,
  },
};

/** Perfil por ancho de papel; cae al de 80mm si el valor no es uno conocido. */
export function getPrinterProfile(paperWidthMm) {
  return PRINTER_PROFILES[paperWidthMm] || PRINTER_PROFILES[80];
}

/** Ancho realmente disponible tras descontar el margen de seguridad de AMBOS lados. */
export function getEffectivePrintableWidthDots(profile) {
  const safeMargin = Math.max(0, profile.safeMarginDots || 0);
  return Math.max(1, Math.round(profile.printableWidthDots - safeMargin * 2));
}

/** Columnas de texto (Fuente A) que caben en el ancho efectivo -- reemplaza cualquier tabla fija de columnas por ancho de papel. */
export function getColumnsForProfile(profile) {
  const dotsPerChar = profile.dotsPerChar || DOTS_PER_CHAR_FONT_A;
  return Math.max(1, Math.floor(getEffectivePrintableWidthDots(profile) / dotsPerChar));
}

/** Ancho máximo del logo en dots: una fracción del ancho efectivo, nunca el 100% -- deja margen visible a los costados. */
export function getLogoMaxWidthDots(profile) {
  const fraction = Math.min(1, Math.max(0, profile.logoMaxWidthFraction ?? LOGO_MAX_WIDTH_FRACTION));
  return Math.max(1, Math.round(getEffectivePrintableWidthDots(profile) * fraction));
}
