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
// PRINT-4-BUG10 — BUG6/BUG7/BUG8 intentaron resolver el corte del logo
// reduciendo `logoMaxWidthFraction` y horneando un margen izquierdo en el
// bitmap (`padBitsLeft`). La prueba física de BUG8 fue concluyente: ese
// margen horneado NO funciona como mecanismo de posicionamiento en esta
// impresora -- cientos de columnas en blanco no son "gratis", consumen o
// corrompen el mismo presupuesto de ancho que el contenido real. BUG9
// confirmó que `ESC $` (posición absoluta) SÍ funciona, y también reveló
// que el ancho nominal `printableWidthDots` (512 a 80mm) NO representa el
// área horizontal realmente utilizable: un bloque en x=452 ya no cabe
// completo. Por eso este archivo distingue TRES conceptos de ancho, no
// dos:
//   1. `printableWidthDots` -- ancho de línea NOMINAL de hoja de datos.
//   2. `contentWidthDots` (vía getEffectivePrintableWidthDots) -- ancho
//      para TEXTO tras descontar el margen de seguridad de ambos lados.
//   3. `effectivePrintableWidthDots` -- ancho REAL calibrado físicamente
//      dentro del cual una imagen (ESC */GS v 0) puede posicionarse con
//      `ESC $` sin recortarse. Es un concepto DISTINTO de (2): el texto
//      nunca mostró este problema (siempre se imprime con el motor de
//      texto normal, no con comandos de imagen posicionados
//      explícitamente), así que no hay razón para asumir que comparte el
//      mismo límite. Ver PRINT-4-BUG10 en el historial de commits para el
//      diagnóstico de calibración que determina su valor real por
//      impresora -- HASTA tener ese resultado, el valor de acá es un
//      placeholder conservador basado en la evidencia física disponible
//      (ver comentario en PRINTER_PROFILES).
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
 * @property {number} safeMarginDots - margen de seguridad POR LADO, restado del ancho nominal antes de calcular el ancho de CONTENIDO DE TEXTO. Cubre tolerancia mecánica/de calibración -- no es decorativo.
 * @property {number} effectivePrintableWidthDots - PRINT-4-BUG10: ancho REAL calibrado físicamente dentro del cual una imagen posicionada con `ESC $` no se recorta. Concepto DISTINTO de `contentWidthDots` (ese es para texto) -- ver comentario de archivo.
 * @property {number} dotsPerChar - ancho de un carácter de Fuente A en dots (12 es el valor estándar ESC/POS de 12x24 dots/carácter, no específico de marca).
 * @property {number} logoMaxWidthFraction - fracción (0-1) de `effectivePrintableWidthDots` que el logo puede ocupar como máximo, dejando margen visible a los costados.
 */

/**
 * @typedef {Object} PrintLayout
 * @property {number} paperWidthMm
 * @property {number} printableWidthDots
 * @property {number} safeMarginDots
 * @property {number} contentWidthDots - printableWidthDots - 2*safeMarginDots. Ancho de CONTENIDO DE TEXTO (columnas) -- no usar para imágenes, ver `effectivePrintableWidthDots`.
 * @property {number} normalCharsPerLine - columnas de texto en tamaño normal. TODO helper de layout (wrap/separator/filas) usa este mismo número.
 * @property {number} doubleWidthCharsPerLine - floor(normalCharsPerLine / 2). El TOTAL en doble ancho se construye con ESTE número, nunca con normalCharsPerLine.
 * @property {number} effectivePrintableWidthDots - PRINT-4-BUG10: ancho REAL calibrado dentro del cual una imagen puede posicionarse con `ESC $` sin recortarse. El centrado del logo se calcula como `floor((effectivePrintableWidthDots - logoWidthDots) / 2)`, medido desde la posición física 0 del cabezal -- nunca horneado como padding en el bitmap (ver escPosImage.js#buildAbsolutePositionCommand).
 * @property {number} logoMaxWidthDots - ancho máximo del logo en dots (fracción de `effectivePrintableWidthDots`, NO de contentWidthDots), ya listo para pasarle a fetchLogoRaster.
 */

const DOTS_PER_CHAR_FONT_A = 12;
// PRINT-4-BUG6/BUG10 — este valor en sí NO cambia por BUG10 ("no seguir
// modificando porcentajes del logo para compensar el desplazamiento" --
// el problema físico real era el mecanismo de posicionamiento, no el
// tamaño). Lo que SÍ cambia en BUG10 es la base sobre la que se aplica:
// antes era `contentWidthDots` (ancho de texto), ahora es
// `effectivePrintableWidthDots` (ancho real calibrado para imágenes) --
// ver getLogoMaxWidthDots.
const LOGO_MAX_WIDTH_FRACTION = 0.70;

// PRINT-4-BUG4/BUG5 — valores conservadores para el perfil físico
// ACTUALMENTE VALIDADO: la hoja de datos genérica de impresoras
// térmicas ESC/POS de 80mm cita 576 dots (72mm) de ancho de línea
// nominal, pero la prueba física mostró desborde incluso con contenido
// dimensionado para ese nominal -- así que además del margen de
// seguridad explícito, el propio nominal usado acá es más chico que esa
// cifra de hoja de datos, deliberadamente ("prefiero perder milímetros
// de ancho antes que cortar el logo o romper columnas"). Mismo criterio
// para 58mm.
//
// PRINT-4-BUG10/BUG11 — `effectivePrintableWidthDots` a 80mm: el
// diagnóstico de geometría de BUG8/BUG9 confirmó físicamente que x=226
// con un bloque de 60 dots (hasta la columna 286) imprime completo. La
// calibración gruesa de BUG10 (x=400/420/440/460/480) acotó el límite
// real más precisamente: 420 completo, 440 parcial/cortado, y 460/480
// (más allá del límite) producen "wrap" -- el bloque reaparece desde el
// extremo izquierdo en vez de cortarse (ver clampXDotsToPrintableArea).
// BUG11 agrega una calibración FINA (420/424/428/432/436/440) para
// ubicar la última coordenada exacta -- pendiente de su resultado físico,
// este valor SIGUE en 286 (el último límite confirmado con margen de
// sobra, nunca un valor optimista sin probar). Actualizar en cuanto la
// calibración fina confirme el límite real:
// `effectivePrintableWidthDots = physicalRightEdgeDots - margen`, donde
// `physicalRightEdgeDots = lastCompleteX + 20` (ancho del bloque de
// calibración).
const EFFECTIVE_PRINTABLE_WIDTH_DOTS_80MM_PENDING_CALIBRATION = 286;

// PRINT-4-BUG10 — a 58mm no existe NINGUNA prueba física todavía (ni de
// este bug ni de ninguno anterior): no se sabe si esta impresora sufre el
// mismo problema de posicionamiento a este ancho de papel. Como
// placeholder conservador -- y para no inventar un número por
// extrapolación sin evidencia -- se usa el mismo `contentWidthDots`
// nominal (360 - 2*16 = 328) que ya se usaba para texto en este perfil.
// Requiere su propio diagnóstico de calibración física antes de confiar
// en él para un logo real en papel de 58mm.
const EFFECTIVE_PRINTABLE_WIDTH_DOTS_58MM_UNCALIBRATED = 328;

export const PRINTER_PROFILES = {
  80: {
    paperWidthMm: 80,
    printableWidthDots: 512,
    safeMarginDots: 24,
    effectivePrintableWidthDots: EFFECTIVE_PRINTABLE_WIDTH_DOTS_80MM_PENDING_CALIBRATION,
    dotsPerChar: DOTS_PER_CHAR_FONT_A,
    logoMaxWidthFraction: LOGO_MAX_WIDTH_FRACTION,
  },
  58: {
    paperWidthMm: 58,
    printableWidthDots: 360,
    safeMarginDots: 16,
    effectivePrintableWidthDots: EFFECTIVE_PRINTABLE_WIDTH_DOTS_58MM_UNCALIBRATED,
    dotsPerChar: DOTS_PER_CHAR_FONT_A,
    logoMaxWidthFraction: LOGO_MAX_WIDTH_FRACTION,
  },
};

/** Perfil por ancho de papel; cae al de 80mm si el valor no es uno conocido. */
export function getPrinterProfile(paperWidthMm) {
  return PRINTER_PROFILES[paperWidthMm] || PRINTER_PROFILES[80];
}

/**
 * Ancho de CONTENIDO DE TEXTO tras descontar el margen de seguridad de
 * AMBOS lados -- usado para columnas de texto/tabla de ítems/separadores.
 * PRINT-4-BUG10: NO usar este valor para imágenes -- ver
 * `effectivePrintableWidthDots` en PRINTER_PROFILES/buildLayout, un
 * concepto distinto calibrado físicamente para ESC * y GS v 0.
 */
export function getEffectivePrintableWidthDots(profile) {
  const safeMargin = Math.max(0, profile.safeMarginDots || 0);
  return Math.max(1, Math.round(profile.printableWidthDots - safeMargin * 2));
}

/** Columnas de texto (Fuente A) que caben en el ancho efectivo. Uso directo desaconsejado fuera de buildLayout -- ver PrintLayout.normalCharsPerLine. */
export function getColumnsForProfile(profile) {
  const dotsPerChar = profile.dotsPerChar || DOTS_PER_CHAR_FONT_A;
  return Math.max(1, Math.floor(getEffectivePrintableWidthDots(profile) / dotsPerChar));
}

/**
 * Ancho máximo del logo en dots: una fracción de `effectivePrintableWidthDots`
 * (PRINT-4-BUG10 -- el ancho REAL calibrado para imágenes, no el de
 * contenido de texto), nunca el 100% -- deja margen visible a los
 * costados dentro del área que sí se confirmó imprimible.
 */
export function getLogoMaxWidthDots(profile) {
  const fraction = Math.min(1, Math.max(0, profile.logoMaxWidthFraction ?? LOGO_MAX_WIDTH_FRACTION));
  const base = profile.effectivePrintableWidthDots || getEffectivePrintableWidthDots(profile);
  return Math.max(1, Math.round(base * fraction));
}

// PRINT-4-BUG11 — la calibración gruesa de borde derecho (BUG10) mostró
// algo más grave que un simple recorte: coordenadas más allá del límite
// real (x=460/480 con printableWidthDots=512 asumido) NO se cortan
// silenciosamente -- el bloque REAPARECE desde el extremo izquierdo del
// papel ("wrap", probablemente la impresora interpreta la posición
// módulo algún ancho de línea interno). Esto significa que un `xDots`
// fuera de rango no es solo "un poco de contenido perdido": es contenido
// impreso en una posición completamente distinta a la pedida, que puede
// además superponerse con otro contenido ya impreso ahí. Por eso esta
// guardia vive acá (perfil/capacidad de impresión), no dispersa en el
// renderer: es la ÚNICA fuente de verdad sobre "qué coordenada x es
// segura", y cualquier código que calcule un `xDots` para `ESC $` debe
// pasar por acá antes de usarlo.
/**
 * Ajusta `xDots` para que NUNCA entre en la zona de wrap confirmada
 * físicamente en PRINT-4-BUG11: garantiza `x >= 0` y
 * `x + widthDots <= effectivePrintableWidthDots`. Si `widthDots` ya
 * excede `effectivePrintableWidthDots` (no debería pasar -- ver
 * `getLogoMaxWidthDots`, que ya lo acota --, pero esta función no confía
 * en eso), prioriza `x = 0` (nunca negativo) antes que una coordenada
 * dentro del rango de wrap.
 * @param {number} effectivePrintableWidthDots - ancho REAL calibrado (ver PRINTER_PROFILES).
 * @param {number} widthDots - ancho real del contenido a posicionar (p. ej. el logo ya ajustado por relación de aspecto).
 * @param {number} xDots - x propuesto (p. ej. el resultado de centrar).
 * @returns {number} x seguro, nunca fuera de [0, effectivePrintableWidthDots - widthDots] cuando ese rango es válido.
 */
export function clampXDotsToPrintableArea(effectivePrintableWidthDots, widthDots, xDots) {
  const maxX = Math.max(0, (effectivePrintableWidthDots || 0) - (widthDots || 0));
  const safeX = Math.max(0, xDots | 0);
  return Math.min(maxX, safeX);
}

/**
 * PRINT-4-BUG5/BUG10 — ÚNICA función que el renderer debe llamar. Devuelve
 * un objeto {@link PrintLayout} completo y ya resuelto: ninguna sección
 * del ticket (texto, tabla de ítems, TOTAL en doble ancho, logo,
 * separador) vuelve a calcular su propio ancho -- todas leen de este
 * mismo objeto. `doubleWidthCharsPerLine` se deriva de
 * `normalCharsPerLine` DESPUÉS de calcularlo, nunca al revés (nunca se
 * arma una línea con el ancho normal para recién ahí activar doble
 * ancho). `effectivePrintableWidthDots` (BUG10) es el ancho que el logo
 * debe usar para centrarse con `ESC $` -- nunca `contentWidthDots` (ese
 * es para texto) ni un margen horneado en píxeles (abandonado en BUG10).
 * @param {number} paperWidthMm
 * @returns {PrintLayout}
 */
export function buildLayout(paperWidthMm) {
  const profile = getPrinterProfile(paperWidthMm);
  const contentWidthDots = getEffectivePrintableWidthDots(profile);
  const normalCharsPerLine = Math.max(1, Math.floor(contentWidthDots / (profile.dotsPerChar || DOTS_PER_CHAR_FONT_A)));
  const doubleWidthCharsPerLine = Math.max(1, Math.floor(normalCharsPerLine / 2));
  const effectivePrintableWidthDots = Math.max(1, profile.effectivePrintableWidthDots || contentWidthDots);
  const logoMaxWidthDots = getLogoMaxWidthDots(profile);
  const safeMarginDots = Math.max(0, profile.safeMarginDots || 0);

  return {
    paperWidthMm: profile.paperWidthMm,
    printableWidthDots: profile.printableWidthDots,
    safeMarginDots,
    contentWidthDots,
    normalCharsPerLine,
    doubleWidthCharsPerLine,
    effectivePrintableWidthDots,
    logoMaxWidthDots,
  };
}
