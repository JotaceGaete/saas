// PRINT-4 — capacidades genéricas de imagen ESC/POS (comando raster
// estándar GS v 0, no específico de marca/modelo). Todo acá es JS puro
// sobre arrays de píxeles ya decodificados -- ninguna función de este
// archivo toca `Image`/`canvas`/`fetch` (eso vive en fetchLogoRaster.js,
// la única pieza que necesita el navegador de verdad). Por eso todo esto
// es testeable con datos fijos, sin mockear el DOM.

const GS = 0x1D;

/**
 * RGBA (Uint8ClampedArray de un canvas, 4 bytes/píxel) -> escala de
 * grises (1 byte/píxel, 0-255). Los píxeles con transparencia se
 * mezclan sobre blanco -- el papel térmico es blanco, así que un logo
 * PNG con fondo transparente debe imprimirse como si tuviera fondo
 * blanco, no negro.
 */
export function rgbaToGrayscale(rgba, width, height) {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = (luminance * a + 255 * (255 - a)) / 255;
  }
  return gray;
}

/**
 * Dithering Floyd–Steinberg: escala de grises -> 1 bit/píxel (1 = negro
 * imprime, 0 = blanco no imprime). Da mucha mejor calidad visual que un
 * umbral plano para logos con degradados/antialiasing -- es el mismo
 * algoritmo que usan la mayoría de las librerías ESC/POS de imagen.
 */
export function ditherFloydSteinberg(grayscale, width, height) {
  const buffer = Float32Array.from(grayscale);
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldValue = buffer[idx];
      const newValue = oldValue < 128 ? 0 : 255;
      bits[idx] = newValue === 0 ? 1 : 0;
      const error = oldValue - newValue;
      if (x + 1 < width) buffer[idx + 1] += (error * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) buffer[idx + width - 1] += (error * 3) / 16;
        buffer[idx + width] += (error * 5) / 16;
        if (x + 1 < width) buffer[idx + width + 1] += (error * 1) / 16;
      }
    }
  }
  return bits;
}

/**
 * Bits monocromos (1=negro) -> comando ESC/POS `GS v 0` (raster bit
 * image), formato estándar soportado por la enorme mayoría de
 * impresoras térmicas ESC/POS -- no solo Star/Epson.
 * `GS v 0 m xL xH yL yH d1..dk`, m=0 (normal), xL/xH = ancho en BYTES
 * (no píxeles), yL/yH = alto en píxeles, d = bitmap MSB-first.
 */
export function buildRasterCommand(bits, width, height) {
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x]) {
        data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  const header = [
    GS, 0x76, 0x30, 0x00,
    bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
    height & 0xFF, (height >> 8) & 0xFF,
  ];
  return new Uint8Array([...header, ...data]);
}
