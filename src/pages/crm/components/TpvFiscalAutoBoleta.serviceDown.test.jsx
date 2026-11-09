// Panel de boleta cuando fiscal-emit no responde o el resultado es incierto: muestra el estado
// fiscal real (desconocido ≠ no emitida), ofrece el comprobante interno sin cobrar ni emitir y
// no reintenta la emisión por su cuenta.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } } }));

import TpvFiscalAutoBoleta, { fiscalStateLabelFor } from './TpvFiscalAutoBoleta';
import { createFiscalSaleFlow, createFlowMarks, PHASE } from '../../../services/fiscalSaleFlow';

const BIZ = 'biz-down';
const ctx = { items: [{ name: 'Pan', quantity: 1, unit_price: 1000 }], payments: [{ method: 'cash', amount: 1000 }], total: 1000, discountAmount: 0, pendingBalance: 0 };

function deps({ status, emit } = {}) {
  const emitter = {
    mode: 'live',
    status: vi.fn(status ?? (async () => ({ ok: true, data: { state: 'none', canEmit: true } }))),
    emit: vi.fn(emit ?? (async () => ({ ok: true, status: 'issued', folio: 1 }))),
    loadDte: vi.fn(async () => new Uint8Array([1])),
  };
  const print = vi.fn(async () => ({ ok: true }));
  const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print, marks: createFlowMarks({ businessId: BIZ, storage: localStorage, mode: 'live' }), mode: 'live' });
  return { emitter, flow, print, printBlocker: () => null };
}

const down = async () => ({ ok: false, code: 'STATUS_UNAVAILABLE' });

function mount(d, props = {}) {
  const onInternalReceipt = vi.fn();
  const onPlainTicket = vi.fn();
  const onSettled = vi.fn();
  render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 'sale-1' }} saleContext={ctx} deps={d}
    onInternalReceipt={onInternalReceipt} onPlainTicket={onPlainTicket} onSettled={onSettled} {...props} />);
  return { onInternalReceipt, onPlainTicket, onSettled };
}

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('fiscal-emit no responde', () => {
  it('muestra «Estado fiscal: desconocido», el aviso y el botón de comprobante interno; no emite', async () => {
    const d = deps({ status: down });
    mount(d);
    const state = await screen.findByTestId('fiscal-state');
    expect(state.dataset.fiscalState).toBe('unknown');
    expect(state).toHaveTextContent(/desconocido/);
    expect(screen.getByTestId('fiscal-auto-boleta')).toHaveTextContent(/servicio fiscal no respondió/);
    expect(screen.getByTestId('fiscal-auto-boleta')).not.toHaveTextContent(/No se emitió ninguna boleta/);
    expect(screen.getByTestId('print-internal-receipt')).toHaveTextContent('Imprimir comprobante interno (no es boleta)');
    expect(d.emitter.emit).not.toHaveBeenCalled();
  });

  it('el comprobante interno se pide sin emitir ni cambiar el estado fiscal; se puede pedir otra copia', async () => {
    const d = deps({ status: down });
    const { onInternalReceipt, onPlainTicket } = mount(d);
    fireEvent.click(await screen.findByTestId('print-internal-receipt'));
    fireEvent.click(screen.getByTestId('print-internal-receipt'));
    expect(onInternalReceipt).toHaveBeenCalledTimes(2);
    expect(onPlainTicket).not.toHaveBeenCalled();
    expect(d.emitter.emit).not.toHaveBeenCalled();
    expect(screen.getByTestId('fiscal-auto-boleta').dataset.phase).toBe(PHASE.ERROR);
  });

  it('no marca la venta como resuelta: sigue en «boletas pendientes» para recuperarla', async () => {
    const d = deps({ status: down });
    const { onSettled } = mount(d);
    await screen.findByTestId('fiscal-state');
    for (const [, phase] of onSettled.mock.calls) expect([PHASE.PRINTED, PHASE.NOT_ELIGIBLE, PHASE.REJECTED]).not.toContain(phase);
  });

  it('no reintenta solo: sin acciones del cajero, el estado se consulta una vez en 5 minutos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const d = deps({ status: down });
    mount(d);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(d.emitter.status).toHaveBeenCalledTimes(1);
    expect(d.emitter.emit).not.toHaveBeenCalled();
  });
});

describe('emisión incierta', () => {
  it('respuesta perdida: estado desconocido, comprobante interno disponible y sin segunda emisión al consultar', async () => {
    const d = deps({ emit: async () => ({ ok: false, status: 'error', code: 'RESPONSE_LOST' }) });
    const { onInternalReceipt } = mount(d);
    const state = await screen.findByTestId('fiscal-state');
    expect(state.dataset.fiscalState).toBe('unknown');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar estado' }));
    await act(async () => {});
    fireEvent.click(screen.getByTestId('print-internal-receipt'));
    expect(onInternalReceipt).toHaveBeenCalledTimes(1);
    expect(d.emitter.emit).toHaveBeenCalledTimes(1);
  });

  it('folio duplicado tras el proveedor: desconocido (no «sin boleta»)', async () => {
    const d = deps({ emit: async () => ({ ok: false, status: 'error', code: 'FISCAL_FOLIO_DUPLICATE' }) });
    mount(d);
    expect((await screen.findByTestId('fiscal-state')).dataset.fiscalState).toBe('unknown');
  });
});

describe('estado fiscal mostrado', () => {
  it('desconocido solo sin confirmación; «sin boleta emitida» solo si está confirmado; nada si hay boleta', () => {
    expect(fiscalStateLabelFor(PHASE.ERROR).key).toBe('unknown');
    expect(fiscalStateLabelFor(PHASE.UNCERTAIN).key).toBe('unknown');
    expect(fiscalStateLabelFor(PHASE.BLOCKED).key).toBe('not_issued');
    expect(fiscalStateLabelFor(PHASE.REJECTED).key).toBe('not_issued');
    for (const p of [PHASE.PRINTED, PHASE.PRINT_FAILED, PHASE.NOT_ELIGIBLE, PHASE.CHECKING, PHASE.EMITTING]) expect(fiscalStateLabelFor(p)).toBeNull();
  });

  it('boleta emitida: no ofrece comprobante interno', async () => {
    const d = deps();
    mount(d);
    await screen.findByText(/Boleta 1 emitida/);
    expect(screen.queryByTestId('print-internal-receipt')).toBeNull();
    expect(screen.queryByTestId('fiscal-state')).toBeNull();
  });

  it('sin el prop onInternalReceipt no aparece el botón (otros usos del panel)', async () => {
    const d = deps({ status: down });
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 'sale-2' }} saleContext={ctx} deps={d} />);
    await screen.findByTestId('fiscal-state');
    expect(screen.queryByTestId('print-internal-receipt')).toBeNull();
  });
});
