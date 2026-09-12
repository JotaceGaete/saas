import { describe, expect, it } from 'vitest';
import { rgbaToGrayscale, ditherFloydSteinberg, buildRasterCommand } from './escPosImage';

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
