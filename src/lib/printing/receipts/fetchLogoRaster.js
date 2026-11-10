// PRINT-4 — orquestación de navegador para el logo del ticket (Image +
// canvas + fetch implícito vía <img>). Todo lo que es JS puro (escala de
// grises, dithering, empaquetado del comando raster) vive en
// escPosImage.js y se testea con datos fijos; este archivo es la única
// pieza que necesita el DOM real, así que se testea mockeando
// `Image`/`document.createElement('canvas')` en vez de renderizar de
// verdad (jsdom no trae un canvas 2D real por defecto).
//
// Contrato: fetchLogoRaster nunca lanza. Cualquier fallo (logo ausente,
// URL rota, imagen corrupta, canvas no soportado) resuelve `null`, y
// quien llama debe imprimir el ticket igual, sin logo.

import { rgbaToGrayscale, ditherFloydSteinberg, applyEscStarVerticalCorrection } from './escPosImage';
import { getGraphicsStrategy, GRAPHICS_STRATEGIES } from './escPosCapabilities';

const DEFAULT_MAX_HEIGHT_DOTS = 220;

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el logo'));
    img.src = url;
  });
}

function rasterizeImage(img, targetWidth, targetHeight, box = null) {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Fondo blanco explícito: un PNG con transparencia no debe imprimirse
  // como si el área transparente fuera negra.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  if (box) ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, targetWidth, targetHeight);
  else ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return ctx.getImageData(0, 0, targetWidth, targetHeight);
}

/**
 * Caja del contenido visible de una imagen RGBA: ignora los bordes blancos o
 * transparentes. Un logo con más blanco a un lado que al otro salía corrido al
 * centrarlo (boleta 25007, XP-80C). null si la imagen está vacía.
 */
export function findContentBox(rgba, width, height, { threshold = 235 } = {}) {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3];
      if (a < 16) continue;
      const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      // Sobre fondo blanco: un píxel semitransparente se ve más claro.
      const shown = 255 - (255 - lum) * (a / 255);
      if (shown >= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// Mejor esfuerzo: si el canvas no permite leer la imagen, se usa entera.
function contentBoxOf(img, naturalWidth, naturalHeight) {
  try {
    const data = rasterizeImage(img, naturalWidth, naturalHeight);
    if (!data) return null;
    const box = findContentBox(data.data, naturalWidth, naturalHeight);
    if (!box || (box.width === naturalWidth && box.height === naturalHeight)) return null;
    return box;
  } catch {
    return null;
  }
}

// Ajusta manteniendo proporción dentro de una caja máxima -- nunca
// distorsiona el logo.
export function computeFitSize(naturalWidth, naturalHeight, maxWidth, maxHeight) {
  let width = Math.min(maxWidth, naturalWidth);
  let height = Math.round(naturalHeight * (width / naturalWidth));
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(naturalWidth * (height / naturalHeight));
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

/**
 * @param {string} logoUrl
 * @param {Object} [options]
 * @param {number} options.maxWidthDots
 * @param {number} [options.maxHeightDots]
 * @param {string} [options.graphicsStrategyId] - PRINT-4-BUG3: id de
 *   escPosCapabilities.GRAPHICS_STRATEGIES (p. ej. 'bitImageEscStar' o
 *   'rasterGsV0'). Decide qué comando ESC/POS arma el logo -- por
 *   defecto, la variante confirmada en el hardware de validación (ver
 *   escPosCapabilities.DEFAULT_GRAPHICS_STRATEGY_ID). Este módulo no
 *   sabe ni le importa qué impresora hay detrás de ese id.
 * @param {number} [options.effectivePrintableWidthDots=0] - PRINT-4-BUG10:
 *   ancho REAL calibrado físicamente (ver printerProfile.js#buildLayout)
 *   dentro del cual el logo se centra. El bitmap enviado a la impresora
 *   contiene EXCLUSIVAMENTE los píxeles reales del logo -- nunca padding
 *   horizontal (abandonado tras la prueba física de PRINT-4-BUG8, que
 *   demostró que cientos de columnas en blanco no son "gratis" en esta
 *   impresora); la posición se fija en cambio con `ESC $` (ver
 *   escPosImage.js#buildAbsolutePositionCommand), validado físicamente en
 *   PRINT-4-BUG9.
 *
 * PRINT-4-BUG13: cuando la estrategia resuelta es `bitImageEscStar` (ESC *,
 * el default), el alto real del raster se corrige con
 * `escPosImage.js#applyEscStarVerticalCorrection` antes de rasterizar --
 * `result.height` refleja ese alto YA corregido, nunca el alto "natural"
 * ajustado solo por `computeFitSize`. `result.width` no se toca.
 */
export async function fetchLogoRaster(logoUrl, {
  maxWidthDots, maxHeightDots = DEFAULT_MAX_HEIGHT_DOTS, graphicsStrategyId, effectivePrintableWidthDots = 0,
  // false: sin ESC $; la imagen la centra la impresora con ESC a 1 (como el
  // timbre de la boleta). Solo tiene sentido con GS v 0.
  absolutePosition = true,
} = {}) {
  if (!logoUrl || !maxWidthDots) return null;
  const strategy = getGraphicsStrategy(graphicsStrategyId);
  // PRINT-5 — perfil `textOnly80` (estrategia 'none'): ni siquiera intenta
  // cargar/rasterizar la imagen -- cero fetch de red, cero canvas, cero
  // riesgo de que un logo roto/lento interfiera con este perfil. En la
  // práctica `buildSaleReceipt` ya nunca emite la línea `logo` cuando
  // `printLogo` es `false` (el valor por defecto de este perfil), así que
  // este chequeo es una segunda capa de seguridad, no el único mecanismo.
  if (strategy.id === GRAPHICS_STRATEGIES.none.id) return null;
  try {
    const img = await loadImageElement(logoUrl);
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!naturalWidth || !naturalHeight) return null;

    // Sin bordes blancos: se centra y se escala solo el dibujo.
    const box = contentBoxOf(img, naturalWidth, naturalHeight);
    const srcWidth = box ? box.width : naturalWidth;
    const srcHeight = box ? box.height : naturalHeight;
    const { width, height: fitHeight } = computeFitSize(srcWidth, srcHeight, maxWidthDots, maxHeightDots);
    // PRINT-4-BUG13 — la conversión a bandas ESC * (buildTiledColumnBitImageCommand)
    // distorsiona verticalmente el resultado físico (ver escPosImage.js#
    // ESC_STAR_VERTICAL_CORRECTION_FACTOR); se compensa acá, ANTES de
    // rasterizar, reduciendo únicamente el alto -- el ancho, el centrado vía
    // `ESC $` (calculado más abajo sobre este mismo `width`) y la propia
    // estrategia ESC * quedan intactos. `fitHeight` sale siempre de las
    // dimensiones naturales de la imagen recién cargada (nunca de un alto ya
    // corregido en una llamada previa), así que reimpresiones sucesivas no
    // acumulan la compensación.
    const height = strategy.id === GRAPHICS_STRATEGIES.bitImageEscStar.id
      ? applyEscStarVerticalCorrection(fitHeight)
      : fitHeight;
    const imageData = rasterizeImage(img, width, height, box);
    if (!imageData) return null;

    const grayscale = rgbaToGrayscale(imageData.data, width, height);
    const bits = ditherFloydSteinberg(grayscale, width, height);
    // PRINT-4-BUG10 — centrado real: x se calcula sobre el ancho REAL del
    // logo ya ajustado por relación de aspecto (puede ser más angosto que
    // `maxWidthDots`), nunca sobre la caja máxima -- así el logo queda
    // centrado en la impresora, no solo centrado dentro de una caja que a
    // su vez no está centrada. `bits`/`width` van SIN modificar a la
    // estrategia de gráficos -- el posicionamiento lo aplica ella misma
    // vía `ESC $`, no un padding previo.
    const xDots = absolutePosition === false
      ? undefined
      : Math.max(0, Math.floor((Math.max(0, effectivePrintableWidthDots) - width) / 2));
    return {
      command: strategy.build(bits, width, height, xDots), width, height, xDots,
    };
  } catch {
    return null;
  }
}
