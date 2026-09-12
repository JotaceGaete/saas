import { describe, expect, it } from 'vitest';
import {
  rgbaToGrayscale, ditherFloydSteinberg, buildRasterCommand, buildColumnBitImageCommand,
  buildTiledColumnBitImageCommand,
} from './escPosImage';

// Todo este archivo trabaja sobre arrays de píxeles fijos -- ninguna de
// estas funciones toca Image/canvas/fetch (eso vive en
// fetchLogoRaster.js), así que se puede probar con datos deterministas.

describe('rgbaToGrayscale', () => {
  it('convierte blanco opaco a 255 y negro opaco a 0', () => {
    // 1x2: primer píxel blanco opaco, segundo negro opaco
    const rgba = Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255]);
    const gray = rgbaToGrayscale(rgba, 1, 2);
    expect(gray[0]).toBe(255);
    expect(gray[1]).toBe(0);
  });

  it('mezcla píxeles transparentes sobre fondo blanco (nunca los deja negros)', () => {
    // negro pero totalmente transparente -> debe dar blanco (255), no negro
    const rgba = Uint8ClampedArray.from([0, 0, 0, 0]);
    const gray = rgbaToGrayscale(rgba, 1, 1);
    expect(gray[0]).toBe(255);
  });

  it('semi-transparente queda entre el color y el blanco', () => {
    const rgba = Uint8ClampedArray.from([0, 0, 0, 128]);
    const gray = rgbaToGrayscale(rgba, 1, 1);
    expect(gray[0]).toBeGreaterThan(0);
    expect(gray[0]).toBeLessThan(255);
  });
});

describe('ditherFloydSteinberg', () => {
  it('todo blanco (255) produce todo ceros (nada imprime)', () => {
    const gray = new Uint8ClampedArray(4).fill(255);
    const bits = ditherFloydSteinberg(gray, 2, 2);
    expect(Array.from(bits)).toEqual([0, 0, 0, 0]);
  });

  it('todo negro (0) produce todo unos (todo imprime)', () => {
    const gray = new Uint8ClampedArray(4).fill(0);
    const bits = ditherFloydSteinberg(gray, 2, 2);
    expect(Array.from(bits)).toEqual([1, 1, 1, 1]);
  });

  it('gris intermedio produce una mezcla de 0 y 1 (no todo igual)', () => {
    const gray = new Uint8ClampedArray(16).fill(128);
    const bits = ditherFloydSteinberg(gray, 4, 4);
    const ones = Array.from(bits).filter((b) => b === 1).length;
    expect(ones).toBeGreaterThan(0);
    expect(ones).toBeLessThan(16);
  });

  it('no lanza en bordes (1x1)', () => {
    expect(() => ditherFloydSteinberg(new Uint8ClampedArray([200]), 1, 1)).not.toThrow();
  });
});

describe('buildRasterCommand', () => {
  it('arma el header GS v 0 con m=0 y xL/xH/yL/yH correctos', () => {
    const bits = new Uint8Array(8 * 3); // 8 px de ancho (1 byte/fila), 3 filas
    const command = buildRasterCommand(bits, 8, 3);
    expect(Array.from(command.slice(0, 8))).toEqual([0x1D, 0x76, 0x30, 0x00, 1, 0, 3, 0]);
  });

  it('redondea el ancho en bytes hacia arriba (9 px -> 2 bytes/fila)', () => {
    const bits = new Uint8Array(9 * 1);
    const command = buildRasterCommand(bits, 9, 1);
    expect(command[4]).toBe(2); // bytesPerRow (xL)
    expect(command[5]).toBe(0); // xH
    expect(command.length).toBe(8 + 2 * 1);
  });

  it('empaqueta los bits en MSB-first dentro de cada byte', () => {
    // fila de 8 px: 1,0,0,0,0,0,0,0 -> byte 0x80
    const bits = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
    const command = buildRasterCommand(bits, 8, 1);
    expect(command[8]).toBe(0x80);
  });

  it('un píxel negro en la última posición de la fila enciende el bit menos significativo', () => {
    const bits = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 1]);
    const command = buildRasterCommand(bits, 8, 1);
    expect(command[8]).toBe(0x01);
  });

  it('sin píxeles negros produce solo ceros en la data', () => {
    const bits = new Uint8Array(16);
    const command = buildRasterCommand(bits, 8, 2);
    expect(Array.from(command.slice(8))).toEqual([0, 0]);
  });
});

describe('buildColumnBitImageCommand — PRINT-4-BUG2 (alternativa ESC * al raster GS v 0)', () => {
  const ESC = 0x1B;

  it('arma el header ESC * m nL nH con m=0 (8-dot single density) y ancho correcto', () => {
    const bits = new Uint8Array(8 * 3); // 8 columnas, 3 dots de alto
    const command = buildColumnBitImageCommand(bits, 8, 3);
    expect(Array.from(command.slice(0, 5))).toEqual([ESC, 0x2A, 0x00, 8, 0]);
    expect(command.length).toBe(5 + 8); // header + 1 byte por columna
  });

  it('empaqueta cada columna en un byte vertical, MSB = dot superior', () => {
    // columna 0: dot superior (y=0) negro, resto blanco -> bit7 = 1 -> 0x80
    const bits = Uint8Array.from([
      1, 0, // y=0
      0, 0, // y=1
      0, 0, // y=2
    ]);
    const command = buildColumnBitImageCommand(bits, 2, 3);
    expect(command[5]).toBe(0x80); // columna 0
    expect(command[6]).toBe(0x00); // columna 1
  });

  it('el dot inferior de una columna de 8 enciende el bit menos significativo', () => {
    const width = 1;
    const height = 8;
    const bits = new Uint8Array(width * height);
    bits[7 * width] = 1; // y=7 (última fila), única columna
    const command = buildColumnBitImageCommand(bits, width, height);
    expect(command[5]).toBe(0x01);
  });

  it('lanza si se pide una altura mayor a 8 dots (modo de 24 dots no implementado)', () => {
    expect(() => buildColumnBitImageCommand(new Uint8Array(9), 1, 9)).toThrow(/8 dots/);
  });

  it('nunca depende de UTF-8: solo produce bytes 0-255 puros', () => {
    const bits = new Uint8Array(64).fill(1);
    const command = buildColumnBitImageCommand(bits, 8, 8);
    expect(command.every((b) => b >= 0 && b <= 255)).toBe(true);
  });
});

describe('buildTiledColumnBitImageCommand — PRINT-4-BUG3 (logo real vía ESC *, en franjas de 8 dots)', () => {
  const ESC = 0x1B;
  const LF = 0x0A;

  it('para una altura de exactamente 8 dots, produce UNA sola franja envuelta en ESC 3 8 ... LF ... ESC 2', () => {
    const bits = new Uint8Array(8 * 8);
    const command = buildTiledColumnBitImageCommand(bits, 8, 8);
    // ESC 3 8
    expect(Array.from(command.slice(0, 3))).toEqual([ESC, 0x33, 8]);
    // el comando ESC * validado (m=0, ancho=8) arranca justo después
    expect(Array.from(command.slice(3, 8))).toEqual([ESC, 0x2A, 0x00, 8, 0]);
    // LF tras los 8 bytes de datos de la franja
    expect(command[3 + 5 + 8]).toBe(LF);
    // ESC 2 al final
    expect(Array.from(command.slice(-2))).toEqual([ESC, 0x32]);
  });

  it('para una altura mayor a 8 dots, la divide en varias franjas de hasta 8 dots cada una', () => {
    const width = 4;
    const height = 20; // 3 franjas: 8 + 8 + 4
    const bits = new Uint8Array(width * height);
    const command = Array.from(buildTiledColumnBitImageCommand(bits, width, height));

    // Cada franja arranca con ESC * (0x1B, 0x2A) -- deben aparecer exactamente 3 veces
    let count = 0;
    for (let i = 0; i < command.length - 1; i++) {
      if (command[i] === ESC && command[i + 1] === 0x2A) count++;
    }
    expect(count).toBe(3);
  });

  it('la última franja parcial (altura no múltiplo de 8) no lanza y usa su altura real, no 8 fija', () => {
    const width = 2;
    const height = 3; // una sola franja parcial
    const bits = new Uint8Array(width * height);
    expect(() => buildTiledColumnBitImageCommand(bits, width, height)).not.toThrow();
  });

  it('reutiliza EXACTAMENTE buildColumnBitImageCommand por franja (mismos bytes de datos ya validados físicamente)', () => {
    const width = 8;
    const height = 8;
    const bits = Uint8Array.from({ length: 64 }, (_, i) => (i % 5 === 0 ? 1 : 0));
    const tiled = Array.from(buildTiledColumnBitImageCommand(bits, width, height));
    const single = Array.from(buildColumnBitImageCommand(bits, width, height));
    // El comando de la única franja debe ser un subconjunto contiguo idéntico
    const startIndex = tiled.findIndex((b, i) => b === ESC && tiled[i + 1] === 0x2A);
    expect(tiled.slice(startIndex, startIndex + single.length)).toEqual(single);
  });

  it('nunca produce bytes fuera de rango 0-255', () => {
    const bits = new Uint8Array(6 * 17).fill(1);
    const command = buildTiledColumnBitImageCommand(bits, 6, 17);
    expect(command.every((b) => b >= 0 && b <= 255)).toBe(true);
  });
});
