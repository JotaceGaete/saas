import { describe, it, expect } from 'vitest';
import { encodeFiscalRaster } from './pdf80Raster';

function image(width, height, value = 255) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = rgba[i + 1] = rgba[i + 2] = value;
    rgba[i + 3] = 255;
  }
  return rgba;
}

describe('PDF80 raster → ESC/POS (sin emisión)', () => {
  it('produce inicialización, raster y corte', () => {
    const result = encodeFiscalRaster({ rgba: image(8, 8, 0), width: 8, height: 8 });
    expect(Array.from(result.slice(0, 10))).toEqual([27, 64, 29, 118, 48, 0, 1, 0, 8, 0]);
    expect(Array.from(result.slice(-4))).toEqual([29, 86, 66, 0]);
    expect(Array.from(result.slice(10, 18))).toEqual(Array(8).fill(255));
  });
  it('divide una página alta en franjas', () => {
    const result = encodeFiscalRaster({ rgba: image(8, 129), width: 8, height: 129, cut: false });
    const count = Array.from(result).filter((v, i, a) => v === 29 && a[i + 1] === 118 && a[i + 2] === 48).length;
    expect(count).toBe(2);
    expect(Array.from(result.slice(-3))).toEqual([27, 100, 3]);
  });
  it('rechaza dimensiones y píxeles incorrectos', () => {
    expect(() => encodeFiscalRaster({ rgba: image(8, 8), width: 577, height: 8 })).toThrow('RASTER_DIMENSIONS_INVALID');
    expect(() => encodeFiscalRaster({ rgba: image(8, 8), width: 8, height: 9 })).toThrow('RASTER_PIXELS_INVALID');
  });
  it('rechaza trabajos que superan el límite del conector', () => {
    expect(() => encodeFiscalRaster({ rgba: image(576, 4000), width: 576, height: 4000 })).toThrow('RASTER_PAYLOAD_TOO_LARGE');
  });
});


describe('Star TSP100 fiscal raster', () => {
  it('uses ESC * 33 rather than GS v 0', () => {
    const rgba = new Uint8ClampedArray(32 * 24 * 4).fill(255);
    const bytes = encodeFiscalRaster({ rgba, width: 32, height: 24, cut: false, profile: 'star-tsp100' });
    expect(Array.from(bytes).join(',')).toContain('27,42,33,32,0');
    expect(Array.from(bytes).join(',')).not.toContain('29,118,48,0');
  });
  it('rejects unknown printer profiles', () => {
    const rgba = new Uint8ClampedArray(8 * 8 * 4).fill(255);
    expect(() => encodeFiscalRaster({ rgba, width: 8, height: 8, profile: 'unknown' })).toThrow('RASTER_PROFILE_INVALID');
  });
});
