import { describe, expect, it } from 'vitest';
import {
  GRAPHICS_STRATEGIES, CUT_STRATEGIES, DEFAULT_GRAPHICS_STRATEGY_ID, getGraphicsStrategy,
} from './escPosCapabilities';

// PRINT-4-BUG2/BUG3 — esta capa define QUÉ variantes de comando ESC/POS
// existen. PRINT-4-BUG3 confirmó físicamente cuál usar por defecto
// (bitImageEscStar); rasterGsV0 NO se elimina -- queda disponible para
// perfiles de otras impresoras que sí lo soporten.

describe('GRAPHICS_STRATEGIES', () => {
  it('rasterGsV0 produce un comando que empieza con GS v 0', () => {
    const bits = new Uint8Array(64);
    const command = GRAPHICS_STRATEGIES.rasterGsV0.build(bits, 8, 8);
    expect(Array.from(command.slice(0, 3))).toEqual([0x1D, 0x76, 0x30]);
  });

  it('bitImageEscStar produce un comando envuelto en ESC 3 n (fine feed) con ESC * adentro', () => {
    const bits = new Uint8Array(64);
    const command = GRAPHICS_STRATEGIES.bitImageEscStar.build(bits, 8, 8);
    expect(Array.from(command.slice(0, 2))).toEqual([0x1B, 0x33]); // ESC 3 n
    expect(Array.from(command.slice(3, 5))).toEqual([0x1B, 0x2A]); // ESC * adentro
  });

  it('las dos estrategias producen comandos DISTINTOS para el mismo patrón (no son el mismo comando con otro nombre)', () => {
    const bits = new Uint8Array(64).fill(1);
    const a = GRAPHICS_STRATEGIES.rasterGsV0.build(bits, 8, 8);
    const b = GRAPHICS_STRATEGIES.bitImageEscStar.build(bits, 8, 8);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('cada estrategia tiene un id y una etiqueta legible (para identificarla en el ticket de diagnóstico)', () => {
    for (const strategy of Object.values(GRAPHICS_STRATEGIES)) {
      expect(typeof strategy.id).toBe('string');
      expect(strategy.id.length).toBeGreaterThan(0);
      expect(typeof strategy.label).toBe('string');
      expect(strategy.label.length).toBeGreaterThan(0);
    }
  });

  it('ninguna etiqueta menciona una marca/modelo de impresora (son comandos ESC/POS estándar, no de Star)', () => {
    for (const strategy of Object.values(GRAPHICS_STRATEGIES)) {
      expect(strategy.label.toLowerCase()).not.toContain('star');
      expect(strategy.label.toLowerCase()).not.toContain('tsp100');
      expect(strategy.label.toLowerCase()).not.toContain('epson');
    }
  });

  it('bitImageEscStar soporta alturas mayores a 8 dots (un logo real) sin lanzar -- ver buildTiledColumnBitImageCommand', () => {
    const bits = new Uint8Array(8 * 100);
    expect(() => GRAPHICS_STRATEGIES.bitImageEscStar.build(bits, 8, 100)).not.toThrow();
  });
});

describe('DEFAULT_GRAPHICS_STRATEGY_ID / getGraphicsStrategy — PRINT-4-BUG3', () => {
  it('el default es bitImageEscStar (confirmado físicamente en el hardware de validación)', () => {
    expect(DEFAULT_GRAPHICS_STRATEGY_ID).toBe('bitImageEscStar');
    expect(getGraphicsStrategy(undefined)).toBe(GRAPHICS_STRATEGIES.bitImageEscStar);
  });

  it('un id conocido devuelve esa estrategia exacta (rasterGsV0 sigue disponible)', () => {
    expect(getGraphicsStrategy('rasterGsV0')).toBe(GRAPHICS_STRATEGIES.rasterGsV0);
  });

  it('un id desconocido/inválido cae al default en vez de lanzar', () => {
    expect(getGraphicsStrategy('algo-que-no-existe')).toBe(GRAPHICS_STRATEGIES.bitImageEscStar);
    expect(getGraphicsStrategy(null)).toBe(GRAPHICS_STRATEGIES.bitImageEscStar);
  });
});

describe('CUT_STRATEGIES', () => {
  it('partialFunctionB es el comando GS V 66 0 (2 bytes de parámetro)', () => {
    expect(CUT_STRATEGIES.partialFunctionB.bytes).toEqual([0x1D, 0x56, 0x42, 0x00]);
  });

  it('partialFunctionALegacy es el comando GS V 1 (1 byte, legacy)', () => {
    expect(CUT_STRATEGIES.partialFunctionALegacy.bytes).toEqual([0x1D, 0x56, 0x01]);
  });

  it('las dos variantes de corte son distintas entre sí', () => {
    expect(CUT_STRATEGIES.partialFunctionB.bytes).not.toEqual(CUT_STRATEGIES.partialFunctionALegacy.bytes);
  });

  it('ninguna etiqueta menciona una marca/modelo de impresora', () => {
    for (const strategy of Object.values(CUT_STRATEGIES)) {
      expect(strategy.label.toLowerCase()).not.toContain('star');
      expect(strategy.label.toLowerCase()).not.toContain('tsp100');
    }
  });
});
