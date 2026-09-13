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

  it('nunca distorsiona el ajuste de caja: reduce manteniendo proporción cuando el logo excede el ancho máximo (rasterGsV0, sin compensación ESC *)', async () => {
    installImageMock({ naturalWidth: 1000, naturalHeight: 500 });
    const data = new Uint8ClampedArray(1000 * 500 * 4);
    installCanvasMock({ imageData: { data } });

    // graphicsStrategyId explícito en 'rasterGsV0': esta ruta no pasa por
    // bandas ESC * (ver PRINT-4-BUG13 más abajo), así que computeFitSize es
    // la única transformación de tamaño -- debe preservar la proporción
    // matemáticamente, sin ningún ajuste posterior.
    const result = await fetchLogoRaster('https://cdn.example.com/logo-ancho.png', {
      maxWidthDots: 480, maxHeightDots: 220, graphicsStrategyId: 'rasterGsV0',
    });

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

  it('no altera result.width (sigue siendo el ancho REAL del logo); result.height, con la estrategia rasterGsV0, tampoco', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 50 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 50 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 480, maxHeightDots: 220, effectivePrintableWidthDots: 300, graphicsStrategyId: 'rasterGsV0',
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });
});

// PRINT-4-BUG13 — prueba física del diagnóstico de aspecto: un raster de
// 100x100 dots enviado por la ruta ESC * (bitImageEscStar, la estrategia
// por defecto) midió físicamente 25mm de ancho x 37mm de alto. Se compensa
// reduciendo SOLO el alto del raster (verticalCorrectionFactor = 25/37)
// antes de rasterizar -- ver escPosImage.js#applyEscStarVerticalCorrection.
describe('fetchLogoRaster — PRINT-4-BUG13 (compensación vertical para ESC *)', () => {
  it('un logo de 100x100 (estrategia ESC * por defecto) se corrige a ~100x68 antes de armar las bandas', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 100 });
    const { fakeCanvas } = installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 100 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo-circular.png', {
      maxWidthDots: 100, maxHeightDots: 100,
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(68);
    // el canvas se rasteriza YA con el alto corregido -- la compensación
    // ocurre antes de convertir a escala de grises/dither, no después.
    expect(fakeCanvas.height).toBe(68);
  });

  it('con graphicsStrategyId explícito en bitImageEscStar, aplica la misma compensación', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 100 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo-circular.png', {
      maxWidthDots: 100, maxHeightDots: 100, graphicsStrategyId: 'bitImageEscStar',
    });
    expect(result.height).toBe(68);
  });

  it('con graphicsStrategyId rasterGsV0, NO aplica la compensación (esa ruta no pasa por bandas ESC *)', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 100 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo-circular.png', {
      maxWidthDots: 100, maxHeightDots: 100, graphicsStrategyId: 'rasterGsV0',
    });
    expect(result.height).toBe(100);
  });

  it('nunca deforma el ancho: solo la dimensión vertical se ve afectada', async () => {
    installImageMock({ naturalWidth: 200, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(200 * 100 * 4) } });
    const result = await fetchLogoRaster('https://cdn.example.com/logo-rectangular.png', {
      maxWidthDots: 200, maxHeightDots: 100,
    });
    expect(result.width).toBe(200);
    expect(result.height).toBe(68);
  });

  it('cada llamada calcula la corrección desde el raster fuente: reimprimir el mismo logo no acumula la compensación', async () => {
    installImageMock({ naturalWidth: 100, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 100 * 4) } });
    const first = await fetchLogoRaster('https://cdn.example.com/logo-circular.png', { maxWidthDots: 100, maxHeightDots: 100 });

    installImageMock({ naturalWidth: 100, naturalHeight: 100 });
    installCanvasMock({ imageData: { data: new Uint8ClampedArray(100 * 100 * 4) } });
    const second = await fetchLogoRaster('https://cdn.example.com/logo-circular.png', { maxWidthDots: 100, maxHeightDots: 100 });

    expect(first.height).toBe(68);
    expect(second.height).toBe(68); // NO round(68 * 25/37) = 46 -- cada llamada parte de 100, no del resultado anterior
  });
});

// PRINT-5 — perfil `textOnly80`: para una impresora que no interpreta
// ningún comando de gráficos, fetchLogoRaster debe devolver null SIN
// intentar cargar ni rasterizar nada -- ni red (Image), ni canvas.
describe('fetchLogoRaster — PRINT-5 (graphicsStrategyId: \'none\', perfil textOnly80)', () => {
  it('devuelve null sin instanciar Image ni tocar el canvas', async () => {
    const imageConstructorSpy = vi.fn();
    class MockImage {
      constructor() {
        imageConstructorSpy();
        this.onload = null;
        this.onerror = null;
      }

      // eslint-disable-next-line class-methods-use-this -- necesita existir en el mock, no usa `this`
      set src(_value) {}
    }
    vi.stubGlobal('Image', MockImage);
    const createElementSpy = vi.spyOn(document, 'createElement');

    const result = await fetchLogoRaster('https://cdn.example.com/logo.png', {
      maxWidthDots: 100, maxHeightDots: 100, graphicsStrategyId: 'none',
    });

    expect(result).toBeNull();
    expect(imageConstructorSpy).not.toHaveBeenCalled();
    expect(createElementSpy).not.toHaveBeenCalledWith('canvas');
  });

  it('con logoUrl y maxWidthDots válidos igual devuelve null (no es el camino "sin logo configurado")', async () => {
    vi.stubGlobal('Image', class {
      set src(_value) {}
    });
    const result = await fetchLogoRaster('https://cdn.example.com/logo-real.png', {
      maxWidthDots: 480, graphicsStrategyId: 'none',
    });
    expect(result).toBeNull();
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
