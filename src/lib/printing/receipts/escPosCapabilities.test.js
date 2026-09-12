import { describe, expect, it } from 'vitest';
import { GRAPHICS_STRATEGIES, CUT_STRATEGIES } from './escPosCapabilities';

// PRINT-4-BUG2 — esta capa solo define QUÉ variantes de comando ESC/POS
// existen como candidatas; no decide todavía cuál usar en producción (eso
// depende de la prueba física de diagnóstico). Los tests solo confirman
// que cada estrategia es autoconsistente y produce bytes válidos.

describe('GRAPHICS_STRATEGIES', () => {
  it('rasterGsV0 produce un comando que empieza con GS v 0', () => {
    const bits = new Uint8Array(64);
    const command = GRAPHICS_STRATEGIES.rasterGsV0.build(bits, 8, 8);
    expect(Array.from(command.slice(0, 3))).toEqual([0x1D, 0x76, 0x30]);
  });

  it('bitImageEscStar produce un comando que empieza con ESC *', () => {
    const bits = new Uint8Array(64);
    const command = GRAPHICS_STRATEGIES.bitImageEscStar.build(bits, 8, 8);
    expect(Array.from(command.slice(0, 2))).toEqual([0x1B, 0x2A]);
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
