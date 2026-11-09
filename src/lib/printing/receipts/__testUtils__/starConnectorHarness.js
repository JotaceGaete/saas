// Utilidades de prueba compartidas: lo que hace el Walinka Print Connector con
// los bytes (validador) y lo que dibuja la Star (ESC $ + ESC * 32/33), para
// decodificar el PDF417 desde los bytes reales del trabajo.
import {
  RGBLuminanceSource, BinaryBitmap, HybridBinarizer, PDF417Reader, DecodeHintType,
} from '@zxing/library';

// Copia en JS de tools/walinka-print-connector/EscPosStreamValidator.cs.
export function validateLikeConnector(data) {
  if (data.length > 256 * 1024) return 'too-large';
  if (data[0] !== 0x1b || data[1] !== 0x40) return 'no-init';
  let i = 0;
  while (i < data.length) {
    const b = data[i];
    if (b === 0x0a || (b >= 0x20 && b <= 0x7e) || b >= 0x80) { i++; continue; }
    if (b === 0x1b) {
      const c = data[i + 1];
      if (c === 0x40 || c === 0x32) { i += 2; continue; }
      if (c === 0x70) return 'drawer';
      if (c === 0x61) { if (data[i + 2] > 2) return 'bad-param'; i += 3; continue; }
      if (c === 0x45) { if (data[i + 2] > 1) return 'bad-param'; i += 3; continue; }
      if (c === 0x33 || c === 0x64) { i += 3; continue; }
      if (c === 0x24) { i += 4; continue; }
      if (c === 0x2a) {
        const m = data[i + 2];
        const per = (m === 0 || m === 1) ? 1 : (m === 0x20 || m === 0x21) ? 3 : -1;
        if (per < 0) return 'bad-param';
        const cols = data[i + 3] | (data[i + 4] << 8);
        if (i + 5 + cols * per > data.length) return 'truncated';
        i += 5 + cols * per; continue;
      }
      return `unknown ESC ${c}`;
    }
    if (b === 0x1d) {
      const c = data[i + 1];
      if (c === 0x21) { i += 3; continue; }
      if (c === 0x56) { const m = data[i + 2]; i += (m === 0x41 || m === 0x42) ? 4 : 3; continue; }
      if (c === 0x76) return 'gs-v-0'; // válido para el conector, pero prohibido para la Star
      return `unknown GS ${c}`;
    }
    return `control ${b}`;
  }
  return null;
}

// Reconstruye el bitmap que la Star dibujaría con ESC $ + ESC * 32/33: cada
// franja ocupa 24 dots físicos y empieza en la x de ESC $. En ESC * 32
// (densidad simple) cada columna ocupa 2 dots físicos de ancho.
export function rasterizeStarImage(bytes) {
  const bands = [];
  let x = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x1b && bytes[i + 1] === 0x24) { x = bytes[i + 2] | (bytes[i + 3] << 8); i += 3; continue; }
    if (bytes[i] === 0x1b && bytes[i + 1] === 0x2a && (bytes[i + 2] === 0x20 || bytes[i + 2] === 0x21)) {
      const m = bytes[i + 2];
      const nH = bytes[i + 4];
      const cols = bytes[i + 3] | (nH << 8);
      const scale = m === 0x20 ? 2 : 1;
      bands.push({ x, m, nH, cols, scale, physicalWidth: cols * scale, data: bytes.slice(i + 5, i + 5 + cols * 3) });
      i += 4 + cols * 3;
    }
  }
  const width = Math.max(...bands.map((band) => band.x + band.physicalWidth)) + 20;
  const height = bands.length * 24 + 20;
  const lum = new Uint8ClampedArray(width * height).fill(255);
  bands.forEach((band, n) => {
    for (let c = 0; c < band.cols; c++) {
      for (let k = 0; k < 3; k++) {
        const v = band.data[c * 3 + k];
        for (let bit = 0; bit < 8; bit++) {
          if (!(v & (0x80 >> bit))) continue;
          for (let d = 0; d < band.scale; d++) lum[(10 + n * 24 + k * 8 + bit) * width + band.x + c * band.scale + d] = 0;
        }
      }
    }
  });
  return { lum, width, height, bands };
}

export function decodePdf417({ lum, width, height }) {
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, width, height)));
  return new PDF417Reader().decode(bitmap, new Map([[DecodeHintType.CHARACTER_SET, 'ISO-8859-1']])).getText();
}

export function hasGsV0(bytes) {
  return bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x76);
}

