import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLogoRaster, computeFitSize } from './fetchLogoRaster';

// PRINT-4 — este módulo es la única pieza que toca Image/canvas de verdad;
// jsdom no trae un canvas 2D real por defecto, así que se prueba mockeando
// esos dos puntos de entrada en vez de intentar rasterizar de verdad.

function installImageMock({ shouldError = false, naturalWidth = 100, naturalHeight = 50 } = {}) {
  class MockImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.naturalWidth = naturalWidth;
      this.naturalHeight = naturalHeight;
    }

    set src(_value) {
      queueMicrotask(() => {
        if (shouldError) this.onerror?.(new Error('boom'));
        else this.onload?.();
      });
    }
  }
  vi.stubGlobal('Image', MockImage);
}

function installCanvasMock({ getContextReturnsNull = false, imageData } = {}) {
  const fakeCtx = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => imageData || { data: new Uint8ClampedArray(4) }),
  };
  const fakeCanvas = { width: 0, height: 0, getContext: vi.fn(() => (getContextReturnsNull ? null : fakeCtx)) };
  vi.spyOn(document, 'createElement').mockReturnValue(fakeCanvas);
  return { fakeCtx, fakeCanvas };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fetchLogoRaster', () => {
  it('devuelve null si no hay logoUrl (negocio sin logo -- caso normal, no un error)', async () => {
    expect(await fetchLogoRaster(null, { maxWidthDots: 480 })).toBeNull();
    expect(await fetchLogoRaster(undefined, { maxWidthDots: 480 })).toBeNull();
  });

  it('devuelve null si no se indica maxWidthDots', async () => {
    expect(await fetchLogoRaster('https://cdn.example.com/logo.png')).toBeNull();
  });

  it('carga, rasteriza y ditherea el logo en un comando raster válido (graphicsStrategyId: rasterGsV0)', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 50 });
    const pixelCount = 100 * 50;
    const data = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) data[i * 4 + 3] = 255; // opaco, RGB en 0 (negro)
    installCanvasMock({ imageData: { data } });

    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 480, graphicsStrategyId: 'rasterGsV0',
    });

    expect(result).not.toBeNull();
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(result.command).toBeInstanceOf(Uint8Array);
    // PRINT-4-BUG10: siempre antepone ESC $ xDots (acá 0, sin
    // effectivePrintableWidthDots) -- explícito incluso en x=0, nunca
    // implícito -- antes del header GS v 0.
    expect(Array.from(result.command.slice(0, 4))).toEqual([0x1B, 0x24, 0, 0]); // ESC $ 0 0
    expect(result.command[4]).toBe(0x1D); // GS
    expect(result.command[5]).toBe(0x76); // v
    expect(result.command[6]).toBe(0x30); // 0
  });

  it('PRINT-4-BUG3: sin graphicsStrategyId, usa el default confirmado físicamente (ESC * / bitImageEscStar)', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 50 });
    const pixelCount = 100 * 50;
    const data = new Uint8ClampedArray(pixelCount * 4);
    for (let i = 0; i < pixelCount; i++) data[i * 4 + 3] = 255;
    installCanvasMock({ imageData: { data } });

    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', { maxWidthDots: 480 });

    expect(result).not.toBeNull();
    expect(result.command).toBeInstanceOf(Uint8Array);
    expect(result.command[0]).toBe(0x1B); // ESC 3 n -- inicio del envoltorio de franjas ESC *
    expect(result.command[1]).toBe(0x33);
  });

  it('un graphicsStrategyId desconocido no lanza -- cae al default', async () => {
    installImageMock({ naturalWidth: 20, naturalHeight: 20 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(20 * 20 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 480, graphicsStrategyId: 'no-existe',
    });
    expect(result).not.toBeNull();
    expect(result.command[0]).toBe(0x1B);
    expect(result.command[1]).toBe(0x33);
  });

  it('nunca distorsiona: reduce manteniendo proporción cuando el logo excede el ancho máximo', async () => {
    installImageMock({ naturalWidth: 1000, naturalHeight: 500 });
    const data = new Uint8ClampedArray(1000 * 500 * 4);
    installCanvasMock({ imageData: { data } });

    const result = await fetchLogoRaster('https://cdn.example.com/logo-ancho.png', { maxWidthDots: 480, maxHeightDots: 220 });

    expect(result.width).toBeLessThanOrEqual(480);
    expect(result.height).toBeLessThanOrEqual(220);
    // proporción preservada (2:1 original)
    expect(Math.round(result.width / result.height)).toBe(2);
  });

  it('devuelve null (nunca lanza) si la imagen falla al cargar', async () => {
    installImageMock({ shouldError: true });
    installCanvasMock({});
    const result = await fetchLogoRaster('https://cdn.example.com/roto.png', { maxWidthDots: 480 });
    expect(result).toBeNull();
  });

  it('devuelve null (nunca lanza) si el canvas 2D no está disponible', async () => {
    installImageMock({ naturalWidth: 50, naturalHeight: 50 });
    installCanvasMock({ getContextReturnsNull: true });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', { maxWidthDots: 480 });
    expect(result).toBeNull();
  });

  it('devuelve null si la imagen reporta tamaño natural cero', async () => {
    installImageMock({ naturalWidth: 0, naturalHeight: 0 });
    installCanvasMock({});
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', { maxWidthDots: 480 });
    expect(result).toBeNull();
  });
});

// PRINT-4-BUG10 — la prueba física de BUG8 confirmó que el margen
// horneado en píxeles (BUG6, leftMarginDots/padBitsLeft) NO funciona como
// mecanismo de posicionamiento en esta impresora. Se reemplaza por
// `ESC $` (posición absoluta, validado físicamente en BUG9): el bitmap
// enviado a la estrategia de gráficos es SIEMPRE el contenido real del
// logo, sin ninguna columna agregada -- `xDots` (centrado real sobre
// `effectivePrintableWidthDots`, el ancho REAL calibrado) se aplica
// dentro de la estrategia misma.
describe('fetchLogoRaster — PRINT-4-BUG10 (ESC $ para centrar, sin padding en el bitmap)', () => {
  it('sin effectivePrintableWidthDots (default 0), xDots queda en 0 -- nunca negativo', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 100 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', { maxWidthDots: 480, maxHeightDots: 100 });
    expect(result.xDots).toBe(0);
  });

  it('centra el logo real (no la caja maxWidthDots) sobre effectivePrintableWidthDots: xDots = floor((effectivePrintableWidthDots - width) / 2)', async () => {
    // Logo cuadrado 100x100 dentro de una caja de 480 -> el ancho real
    // ajustado sigue siendo 100 (no lo agranda). Centrado sobre un ancho
    // REAL calibrado de 286 (el valor de BUG10 a 80mm): floor((286-100)/2) = 93.
    installImageMock({ naturalWidth: 100, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 100 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 480, maxHeightDots: 100, effectivePrintableWidthDots: 286,
    });
    expect(result.xDots).toBe(93);
  });

  it('cuando el logo real ocupa TODO el effectivePrintableWidthDots, xDots queda en 0 (sin espacio para centrar)', async () => {
    installImageMock({ naturalWidth: 200, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(200 * 100 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 480, maxHeightDots: 100, effectivePrintableWidthDots: 200,
    });
    expect(result.width).toBe(200);
    expect(result.xDots).toBe(0);
  });

  it('el comando final NO lleva ningún padding: el ancho de datos ESC * es EXACTAMENTE el ancho real del logo, y ESC $ lleva xDots calculado', async () => {
    installImageMock({ naturalWidth: 8, naturalHeight: 8 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(8 * 8 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 8, maxHeightDots: 8, effectivePrintableWidthDots: 18, graphicsStrategyId: 'bitImageEscStar',
    });
    // xDots = floor((18-8)/2) = 5
    expect(result.xDots).toBe(5);
    const cmd = Array.from(result.command);
    const posIdx = cmd.findIndex((b, i) => b === 0x1B && cmd[i + 1] === 0x24);
    expect(cmd.slice(posIdx, posIdx + 4)).toEqual([0x1B, 0x24, 5, 0]); // ESC $ 5 0
    const escStarIdx = cmd.findIndex((b, i) => b === 0x1B && cmd[i + 1] === 0x2A);
    expect(cmd[escStarIdx + 3]).toBe(8); // nL -- SOLO el ancho real (8), no 8+5
    expect(cmd[escStarIdx + 4]).toBe(0); // nH
  });

  it('no altera result.width/result.height (siguen siendo las dimensiones REALES del logo)', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 50 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 50 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 480, maxHeightDots: 220, effectivePrintableWidthDots: 300,
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });
});

describe('computeFitSize', () => {
  it('reduce una imagen ancha para caber en la caja máxima preservando proporción', () => {
    expect(computeFitSize(1000, 500, 480, 220)).toEqual({ width: 440, height: 220 });
  });

  it('no agranda un logo más chico que el ancho máximo', () => {
    expect(computeFitSize(50, 25, 480, 220)).toEqual({ width: 50, height: 25 });
  });

  it('nunca produce dimensiones menores a 1px', () => {
    const { width, height } = computeFitSize(1, 1000, 480, 220);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});
