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
    expect(result.command[0]).toBe(0x1D); // GS
    expect(result.command[1]).toBe(0x76); // v
    expect(result.command[2]).toBe(0x30); // 0
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

// PRINT-4-BUG6 — el logo seguía cortándose en la prueba física de BUG5
// pese a un ancho lógico ya conservador: en vez de confiar en que la
// impresora centre `ESC */GS v 0` (vía `ESC a 1`), el margen izquierdo se
// hornea directamente en el bitmap (ver escPosImage.js#padBitsLeft),
// recentrado dentro de la caja reservada (`maxWidthDots`) si el logo real
// terminó más angosto por su relación de aspecto.
describe('fetchLogoRaster — PRINT-4-BUG6 (leftMarginDots horneado en el bitmap, no en ESC a)', () => {
  it('sin leftMarginDots (default 0), igual centra el logo real dentro de la caja de maxWidthDots si quedó más angosto por relación de aspecto', async () => {
    // Logo cuadrado 100x100 dentro de una caja de 480 dots de ancho -> el
    // ancho real ajustado sigue siendo 100 (no lo agranda), así que debe
    // quedar centrado: leftMarginDots = floor((480-100)/2) = 190.
    installImageMock({ naturalWidth: 100, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 100 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', { maxWidthDots: 480, maxHeightDots: 100 });
    expect(result.leftMarginDots).toBe(190);
  });

  it('con leftMarginDots explícito, lo suma al recentrado dentro de la caja (no lo reemplaza)', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 100 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 480, maxHeightDots: 100, leftMarginDots: 24,
    });
    expect(result.leftMarginDots).toBe(24 + 190);
  });

  it('cuando el logo real ocupa TODO el maxWidthDots, leftMarginDots queda exactamente en el valor pedido (sin recentrado adicional)', async () => {
    installImageMock({ naturalWidth: 480, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(480 * 100 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 480, maxHeightDots: 100, leftMarginDots: 24,
    });
    expect(result.width).toBe(480);
    expect(result.leftMarginDots).toBe(24);
  });

  it('el comando final incluye el margen horneado -- su ancho total en columnas crece exactamente leftMarginDots respecto del ancho real del logo (estrategia ESC *)', async () => {
    installImageMock({ naturalWidth: 8, naturalHeight: 8 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(8 * 8 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 8, maxHeightDots: 8, leftMarginDots: 5, graphicsStrategyId: 'bitImageEscStar',
    });
    // ESC * header: [ESC,0x2A,0x00,nL,nH] -- nL debe ser leftMarginDots + width real (5+8=13)
    const escStarIndex = Array.from(result.command).findIndex((b, i) => b === 0x1B && result.command[i + 1] === 0x2A);
    expect(result.command[escStarIndex + 3]).toBe(13); // nL
    expect(result.command[escStarIndex + 4]).toBe(0); // nH
  });

  it('no altera result.width/result.height (siguen siendo las dimensiones REALES del logo, no las del bitmap con margen)', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 50 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 50 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 480, maxHeightDots: 220, leftMarginDots: 30,
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
