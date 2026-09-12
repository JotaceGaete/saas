/**
 * mp-point-terminals/lib.ts — batería de tests unitarios REALES
 * (lib.ts no referencia `Deno` a nivel de módulo, mismo criterio que
 * qz-sign/lib.ts y create-merchant-mp-checkout/lib.ts).
 * Ejecutar: npx vitest run supabase/functions/mp-point-terminals/lib.test.ts
 */
import { describe, expect, it } from 'vitest';
import { mapTerminal, parseTerminalsListResponse } from './lib';

describe('mapTerminal', () => {
  it('mapea exactamente los 5 campos pedidos, ignorando cualquier otro', () => {
    const dto = mapTerminal({
      id: 'PAX_A910__SMARTPOS1234567',
      pos_id: 123456789,
      store_id: '987654321',
      external_pos_id: 'CAJA1',
      operating_mode: 'PDV',
      qr: 'algo-irrelevante',
      collector_id: 999999,
    });
    expect(dto).toEqual({
      id: 'PAX_A910__SMARTPOS1234567',
      posId: '123456789',
      storeId: '987654321',
      externalPosId: 'CAJA1',
      operatingMode: 'PDV',
    });
    expect(dto).not.toHaveProperty('qr');
    expect(dto).not.toHaveProperty('collector_id');
  });

  it('campos ausentes/null se mapean a null, nunca undefined ni lanzan', () => {
    expect(mapTerminal({})).toEqual({
      id: null, posId: null, storeId: null, externalPosId: null, operatingMode: null,
    });
    expect(mapTerminal(null)).toEqual({
      id: null, posId: null, storeId: null, externalPosId: null, operatingMode: null,
    });
    expect(mapTerminal(undefined)).toEqual({
      id: null, posId: null, storeId: null, externalPosId: null, operatingMode: null,
    });
  });

  it('acepta pos_id/store_id numéricos o string indistintamente (normaliza a string)', () => {
    expect(mapTerminal({ pos_id: 42, store_id: 42 })).toMatchObject({ posId: '42', storeId: '42' });
    expect(mapTerminal({ pos_id: '42', store_id: '42' })).toMatchObject({ posId: '42', storeId: '42' });
  });

  it('operating_mode que no es string se descarta a null (nunca se inventa un valor)', () => {
    expect(mapTerminal({ operating_mode: 123 }).operatingMode).toBeNull();
    expect(mapTerminal({ operating_mode: null }).operatingMode).toBeNull();
  });

  it('preserva los 3 valores documentados de operating_mode tal cual vienen', () => {
    expect(mapTerminal({ operating_mode: 'STANDALONE' }).operatingMode).toBe('STANDALONE');
    expect(mapTerminal({ operating_mode: 'PDV' }).operatingMode).toBe('PDV');
    expect(mapTerminal({ operating_mode: 'UNDEFINED' }).operatingMode).toBe('UNDEFINED');
  });
});

describe('parseTerminalsListResponse', () => {
  it('caso principal MP-POINT-0: una terminal PAX en modo PDV con store_id/pos_id', () => {
    const parsed = parseTerminalsListResponse({
      data: [{
        id: 'PAX_A910__SMARTPOS1234567', pos_id: 111, store_id: '222', external_pos_id: 'CAJA1', operating_mode: 'PDV',
      }],
      paging: { total: 1, limit: 50, offset: 0 },
    });
    expect(parsed.terminals).toHaveLength(1);
    expect(parsed.terminals[0].id).toBe('PAX_A910__SMARTPOS1234567');
    expect(parsed.terminals[0].operatingMode).toBe('PDV');
    expect(parsed.total).toBe(1);
  });

  it('una terminal en modo STANDALONE (Point sin integración PDV)', () => {
    const parsed = parseTerminalsListResponse({
      data: [{ id: 'STANDALONE_TERMINAL', operating_mode: 'STANDALONE' }],
    });
    expect(parsed.terminals[0].operatingMode).toBe('STANDALONE');
    expect(parsed.terminals[0].storeId).toBeNull();
  });

  it('lista vacía -- cuenta sin terminales', () => {
    const parsed = parseTerminalsListResponse({ data: [], paging: { total: 0, limit: 50, offset: 0 } });
    expect(parsed.terminals).toEqual([]);
    expect(parsed.total).toBe(0);
  });

  it('acepta "results" como alternativa a "data" (algunas APIs de MP usan ese nombre)', () => {
    const parsed = parseTerminalsListResponse({ results: [{ id: 'x' }] });
    expect(parsed.terminals).toHaveLength(1);
  });

  it('acepta "terminals" como alternativa', () => {
    const parsed = parseTerminalsListResponse({ terminals: [{ id: 'x' }] });
    expect(parsed.terminals).toHaveLength(1);
  });

  it('respuesta inesperada (sin ningún campo de lista reconocible) no lanza -- lista vacía', () => {
    expect(() => parseTerminalsListResponse({ algo: 'inesperado' })).not.toThrow();
    expect(parseTerminalsListResponse({ algo: 'inesperado' }).terminals).toEqual([]);
    expect(parseTerminalsListResponse(null).terminals).toEqual([]);
    expect(parseTerminalsListResponse('no es un objeto').terminals).toEqual([]);
    expect(parseTerminalsListResponse(42).terminals).toEqual([]);
  });

  it('sin paging.total, usa el largo real de la lista', () => {
    const parsed = parseTerminalsListResponse({ data: [{ id: 'a' }, { id: 'b' }] });
    expect(parsed.total).toBe(2);
  });

  it('múltiples terminales se mapean todas, preservando el orden', () => {
    const parsed = parseTerminalsListResponse({
      data: [
        { id: 'T1', operating_mode: 'PDV' },
        { id: 'T2', operating_mode: 'STANDALONE' },
        { id: 'T3', operating_mode: 'UNDEFINED' },
      ],
    });
    expect(parsed.terminals.map((t) => t.id)).toEqual(['T1', 'T2', 'T3']);
  });
});
