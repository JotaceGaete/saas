/**
 * crmService.js — closeCashSessionReconciled() / isCashSessionAlreadyClosedError()
 * / getCashSessionStatus() — CAJA-CIERRE-IDEMPOTENTE-1.
 *
 * El wrapper del RPC crm_close_cash_session debe distinguir tres casos para
 * que CrmCash.jsx nunca sugiera reintentar a ciegas un cierre que pudo
 * haberse confirmado en el servidor:
 *   - éxito (incluida la repetición idempotente, data.already_closed=true);
 *   - error de dominio con respuesta del servidor (networkError=false);
 *   - sin respuesta del servidor (status 0 de postgrest-js o excepción de
 *     fetch) -> networkError=true.
 *
 * Archivo nuevo y acotado a propósito, mismo criterio que
 * crmService.createCashMovementCreatedBy.test.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

import {
  CASH_CLOSE_ERROR_HINTS,
  closeCashSessionReconciled,
  getCashSessionStatus,
  isCashSessionAlreadyClosedError,
} from './crmService';

function queryResult(result, calls) {
  const proxy = new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return (...args) => { calls.push([prop, ...args]); return proxy; };
    },
  });
  return proxy;
}

const RECONCILIATIONS = [{ payment_method: 'cash', reconciled_amount: 1000, notes: null }];

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe('closeCashSessionReconciled', () => {
  it('llama al RPC con la misma firma de siempre (p_session_id, p_reconciliations, p_closing_notes)', async () => {
    rpcMock.mockResolvedValue({ data: { already_closed: false }, error: null, status: 200 });
    await closeCashSessionReconciled('sess1', { reconciliations: RECONCILIATIONS, closingNotes: 'ok' });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('crm_close_cash_session', {
      p_session_id: 'sess1',
      p_reconciliations: RECONCILIATIONS,
      p_closing_notes: 'ok',
    });
  });

  it('una repetición idempotente (already_closed=true) es éxito, no error', async () => {
    const data = { session: { id: 'sess1', status: 'closed' }, reconciliations: [], already_closed: true };
    rpcMock.mockResolvedValue({ data, error: null, status: 200 });
    const res = await closeCashSessionReconciled('sess1', { reconciliations: RECONCILIATIONS });
    expect(res).toEqual({ data, error: null, networkError: false });
  });

  it('un error de dominio con respuesta del servidor NO es error de red', async () => {
    const error = { message: 'Esta caja ya fue cerrada…', hint: CASH_CLOSE_ERROR_HINTS.ALREADY_CLOSED_DIFFERENT, code: 'P0001' };
    rpcMock.mockResolvedValue({ data: null, error, status: 400 });
    const res = await closeCashSessionReconciled('sess1', { reconciliations: RECONCILIATIONS });
    expect(res).toEqual({ data: null, error, networkError: false });
  });

  it('status 0 (postgrest-js no obtuvo respuesta) se marca como networkError', async () => {
    const error = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' };
    rpcMock.mockResolvedValue({ data: null, error, status: 0 });
    const res = await closeCashSessionReconciled('sess1', { reconciliations: RECONCILIATIONS });
    expect(res.networkError).toBe(true);
    expect(res.error).toBe(error);
  });

  it('una excepción de fetch se captura y se marca como networkError (nunca rompe el caller)', async () => {
    rpcMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await closeCashSessionReconciled('sess1', { reconciliations: RECONCILIATIONS });
    expect(res.networkError).toBe(true);
    expect(res.data).toBeNull();
    expect(res.error).toBeInstanceOf(Error);
  });

  it('no reintenta por su cuenta: una sola llamada aunque falle', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'x', code: '' }, status: 0 });
    await closeCashSessionReconciled('sess1', { reconciliations: RECONCILIATIONS });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe('isCashSessionAlreadyClosedError', () => {
  it('reconoce los dos HINTs de "caja ya cerrada"', () => {
    expect(isCashSessionAlreadyClosedError({ hint: 'CASH_SESSION_ALREADY_CLOSED' })).toBe(true);
    expect(isCashSessionAlreadyClosedError({ hint: 'CASH_SESSION_ALREADY_CLOSED_DIFFERENT' })).toBe(true);
  });

  it('no confunde otros errores (caja reabierta con arqueo, validaciones, red, null)', () => {
    expect(isCashSessionAlreadyClosedError({ hint: 'CASH_SESSION_REOPENED_WITH_RECONCILIATION' })).toBe(false);
    expect(isCashSessionAlreadyClosedError({ message: 'Falta conciliar cash', code: '23514' })).toBe(false);
    expect(isCashSessionAlreadyClosedError({ message: 'TypeError: Failed to fetch', hint: '' })).toBe(false);
    expect(isCashSessionAlreadyClosedError(null)).toBe(false);
  });
});

describe('getCashSessionStatus', () => {
  it('lee solo id/status/closed_at de la sesión indicada', async () => {
    const calls = [];
    fromMock.mockReturnValue(queryResult({ data: { id: 'sess1', status: 'closed', closed_at: 'x' }, error: null }, calls));
    const res = await getCashSessionStatus('sess1');
    expect(fromMock).toHaveBeenCalledWith('crm_cash_sessions');
    expect(calls).toContainEqual(['select', 'id, status, closed_at']);
    expect(calls).toContainEqual(['eq', 'id', 'sess1']);
    expect(res).toEqual({ data: { id: 'sess1', status: 'closed', closed_at: 'x' }, error: null });
  });

  it('propaga el error sin inventar un estado', async () => {
    const calls = [];
    fromMock.mockReturnValue(queryResult({ data: null, error: { message: 'offline' } }, calls));
    const res = await getCashSessionStatus('sess1');
    expect(res).toEqual({ data: null, error: { message: 'offline' } });
  });
});
