import { describe, it, expect, vi, afterEach } from 'vitest';
import { withPointTimeout, POINT_TIMEOUT_REASON } from './pointTimeout';
import {
  listParkedPointOperations, parkPointOperation, removeParkedPointOperation, updateParkedPointOperation,
} from './parkedPointOperations';

afterEach(() => vi.useRealTimers());

describe('withPointTimeout', () => {
  it('Mercado Pago no responde: termina con error CLIENT_TIMEOUT (nunca queda pendiente)', async () => {
    vi.useFakeTimers();
    const p = withPointTimeout(new Promise(() => {}), 12000, 'sin respuesta');
    vi.advanceTimersByTime(12000);
    await expect(p).resolves.toEqual({ data: null, error: { message: 'sin respuesta', reason: POINT_TIMEOUT_REASON, timeout: true } });
  });
  it('respuesta a tiempo pasa igual; un rechazo de red se convierte en { error }', async () => {
    await expect(withPointTimeout(Promise.resolve({ data: { status: 'processed' }, error: null }), 1000))
      .resolves.toEqual({ data: { status: 'processed' }, error: null });
    await expect(withPointTimeout(Promise.reject(new Error('offline')), 1000))
      .resolves.toMatchObject({ data: null, error: { message: 'offline', reason: 'CLIENT_NETWORK' } });
  });
});

describe('cobros Point pendientes de verificación (lista local)', () => {
  it('agrega, actualiza y quita sin duplicar; sobrevive a una recarga (localStorage)', () => {
    localStorage.clear();
    parkPointOperation('b1', { operation_id: 'op-1', amount: 1000 });
    parkPointOperation('b1', { operation_id: 'op-1', amount: 1000 });
    parkPointOperation('b1', { operation_id: 'op-2', amount: 500 });
    expect(listParkedPointOperations('b1').map((e) => e.operation_id)).toEqual(['op-1', 'op-2']);
    updateParkedPointOperation('b1', 'op-2', { status: 'at_terminal' });
    expect(listParkedPointOperations('b1')[1].status).toBe('at_terminal');
    removeParkedPointOperation('b1', 'op-1');
    expect(listParkedPointOperations('b1').map((e) => e.operation_id)).toEqual(['op-2']);
    expect(listParkedPointOperations('otro')).toEqual([]);
  });
});
