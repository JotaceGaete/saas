// PRINT-4-BUG4/BUG5 — perfil físico de impresora: ancho de papel vs.
// ancho REALMENTE imprimible. La prueba física de BUG4 mostró logo
// cortado, columnas de importes desbordadas y separadores pegados al
// borde. BUG5 encontró que, aun corregido el ancho, distintas secciones
// del renderer seguían calculando su propio ancho por separado (texto
// normal, doble ancho del TOTAL, logo) -- cada una a partir del perfil,
// pero cada una haciendo su propia cuenta. Este archivo pasa a exportar
// un único objeto `layout` (buildLayout) con TODO lo que el renderer
// necesita ya calculado una sola vez: nadie más vuelve a calcular un
// ancho de columnas o de logo por su cuenta.
//
// Esto NO es un perfil de Star: son números conservadores para
// "impresora térmica ESC/POS genérica de 80mm/58mm". El día que exista
// un sistema real de perfiles de compatibilidad por impresora, ese
// sistema debe poder construir un PRINTER_PROFILES/paperWidthMm propio y
// pasarlo por buildLayout() -- ningún llamador necesita cambiar.

/**
 * @typedef {Object} PrinterProfile
 * @property {number} paperWidthMm
 * @property {number} printableWidthDots - ancho de línea nominal del cabezal, en dots (a 203dpi/8 dots por mm).
 * @property {number} safeMarginDots - margen de seguridad POR LADO, restado del ancho nominal antes de calcular cualquier layout. Cubre tolerancia mecánica/de calibración -- no es decorativo.
 * @property {number} dotsPerChar - ancho de un carácter de Fuente A en dots (12 es el valor estándar ESC/POS de 12x24 dots/carácter, no específico de marca).
 * @property {number} logoMaxWidthFraction - fracción (0-1) del ancho de CONTENIDO que el logo puede ocupar como máximo, dejando margen visible a los costados.
 */

/**
 * @typedef {Object} PrintLayout
 * @property {number} paperWidthMm
 * @property {number} printableWidthDots
 * @property {number} safeMarginDots
 * @property {number} contentWidthDots - printableWidthDots - 2*safeMarginDots. Único ancho útil real.
 * @property {number} normalCharsPerLine - columnas de texto en tamaño normal. TODO helper de layout (wrap/separator/filas) usa este mismo número.
 * @property {number} doubleWidthCharsPerLine - floor(normalCharsPerLine / 2). El TOTAL en doble ancho se construye con ESTE número, nunca con normalCharsPerLine.
 * @property {number} logoMaxWidthDots - ancho máximo del logo en dots (fracción de contentWidthDots), ya listo para pasarle a fetchLogoRaster.
 */

const DOTS_PER_CHAR_FONT_A = 12;
// PRINT-4-BUG5 — bajado de 0.82 (BUG4) a 0.78: margen visible más
// generoso a ambos lados del logo, explícitamente pedido ("no usar el
// ancho completo del papel").
const LOGO_MAX_WIDTH_FRACTION = 0.78;

// PRINT-4-BUG4/BUG5 — valores conservadores para el perfil físico
// ACTUALMENTE VALIDADO: la hoja de datos genérica de impresoras
// térmicas ESC/POS de 80mm cita 576 dots (72mm) de ancho de línea
// nominal, pero la prueba física mostró desborde incluso con contenido
// dimensionado para ese nominal -- así que además del margen de
// seguridad explícito, el propio nominal usado acá es más chico que esa
// cifra de hoja de datos, deliberadamente ("prefiero perder milímetros
// de ancho antes que cortar el logo o romper columnas"). Mismo criterio
// para 58mm.
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

/** Columnas de texto (Fuente A) que caben en el ancho efectivo. Uso directo desaconsejado fuera de buildLayout -- ver PrintLayout.normalCharsPerLine. */
export function getColumnsForProfile(profile) {
  const dotsPerChar = profile.dotsPerChar || DOTS_PER_CHAR_FONT_A;
  return Math.max(1, Math.floor(getEffectivePrintableWidthDots(profile) / dotsPerChar));
}

/** Ancho máximo del logo en dots: una fracción del ancho de contenido, nunca el 100% -- deja margen visible a los costados. */
export function getLogoMaxWidthDots(profile) {
  const fraction = Math.min(1, Math.max(0, profile.logoMaxWidthFraction ?? LOGO_MAX_WIDTH_FRACTION));
  return Math.max(1, Math.round(getEffectivePrintableWidthDots(profile) * fraction));
}

/**
 * PRINT-4-BUG5 — ÚNICA función que el renderer debe llamar. Devuelve un
 * objeto {@link PrintLayout} completo y ya resuelto: ninguna sección del
 * ticket (texto, tabla de ítems, TOTAL en doble ancho, logo, separador)
 * vuelve a calcular su propio ancho -- todas leen de este mismo objeto.
 * `doubleWidthCharsPerLine` se deriva de `normalCharsPerLine` DESPUÉS de
 * calcularlo, nunca al revés (nunca se arma una línea con el ancho
 * normal para recién ahí activar doble ancho).
 * @param {number} paperWidthMm
 * @returns {PrintLayout}
 */
export function buildLayout(paperWidthMm) {
  const profile = getPrinterProfile(paperWidthMm);
  const contentWidthDots = getEffectivePrintableWidthDots(profile);
  const normalCharsPerLine = Math.max(1, Math.floor(contentWidthDots / (profile.dotsPerChar || DOTS_PER_CHAR_FONT_A)));
  const doubleWidthCharsPerLine = Math.max(1, Math.floor(normalCharsPerLine / 2));
  const logoMaxWidthDots = getLogoMaxWidthDots(profile);

  return {
    paperWidthMm: profile.paperWidthMm,
    printableWidthDots: profile.printableWidthDots,
    safeMarginDots: profile.safeMarginDots,
    contentWidthDots,
    normalCharsPerLine,
    doubleWidthCharsPerLine,
    logoMaxWidthDots,
  };
}
