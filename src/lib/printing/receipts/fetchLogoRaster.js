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

import { rgbaToGrayscale, ditherFloydSteinberg } from './escPosImage';
import { getGraphicsStrategy } from './escPosCapabilities';

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

function rasterizeImage(img, targetWidth, targetHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Fondo blanco explícito: un PNG con transparencia no debe imprimirse
  // como si el área transparente fuera negra.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return ctx.getImageData(0, 0, targetWidth, targetHeight);
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
 */
export async function fetchLogoRaster(logoUrl, {
  maxWidthDots, maxHeightDots = DEFAULT_MAX_HEIGHT_DOTS, graphicsStrategyId, effectivePrintableWidthDots = 0,
} = {}) {
  if (!logoUrl || !maxWidthDots) return null;
  try {
    const img = await loadImageElement(logoUrl);
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!naturalWidth || !naturalHeight) return null;

    const { width, height } = computeFitSize(naturalWidth, naturalHeight, maxWidthDots, maxHeightDots);
    const imageData = rasterizeImage(img, width, height);
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
    const xDots = Math.max(0, Math.floor((Math.max(0, effectivePrintableWidthDots) - width) / 2));
    const strategy = getGraphicsStrategy(graphicsStrategyId);
    return {
      command: strategy.build(bits, width, height, xDots), width, height, xDots,
    };
  } catch {
    return null;
  }
}
