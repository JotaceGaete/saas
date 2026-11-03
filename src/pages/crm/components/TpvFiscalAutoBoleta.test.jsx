import React, { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } } }));

import TpvFiscalAutoBoleta from './TpvFiscalAutoBoleta';
import { createSimulatedEmitter } from '../../../services/fiscalEmitters';
import { createFiscalSaleFlow, createFlowMarks } from '../../../services/fiscalSaleFlow';

const BIZ = 'biz-ui';
const ctx = { items: [{ name: 'Pan', quantity: 1, unit_price: 100 }], payments: [{ method: 'cash', amount: 100 }], total: 100, discountAmount: 0, pendingBalance: 0 };

function deps({ printOk = true, scenario = 'ok' } = {}) {
  const emitter = createSimulatedEmitter({ businessId: BIZ, storage: localStorage, scenario: () => scenario });
  const print = vi.fn(async () => (printOk() ? { ok: true, simulation: true } : { ok: false, code: 'x', message: 'Conector no encontrado.' }));
  const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print, marks: createFlowMarks({ businessId: BIZ, storage: localStorage }) });
  return { emitter, flow, print };
}

describe('TpvFiscalAutoBoleta', () => {
  beforeEach(() => localStorage.clear());

  it('emite e imprime sola al montar, una sola vez aun en StrictMode', async () => {
    const d = deps({ printOk: () => true });
    render(<StrictMode><TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 's1' }} saleContext={ctx} deps={d} /></StrictMode>);
    await screen.findByText(/Boleta 900001 emitida y enviada a la impresora/);
    expect(d.emitter.providerCalls).toBe(1);
    expect(d.print).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/SIMULACIÓN/)).toBeInTheDocument();
  });

  it('venta sin boleta: pide el ticket normal', async () => {
    const onPlainTicket = vi.fn();
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 's2' }} saleContext={{ ...ctx, pendingBalance: 10 }} deps={deps({ printOk: () => true })} onPlainTicket={onPlainTicket} />);
    await screen.findByText(/Sin boleta electrónica/);
    expect(onPlainTicket).toHaveBeenCalledTimes(1);
  });

  it('impresión fallida: reintentar y reimprimir no emiten otra boleta', async () => {
    let ok = false;
    const d = deps({ printOk: () => ok });
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 's3' }} saleContext={ctx} deps={d} />);
    await screen.findByText(/no se imprimió/);
    ok = true;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar impresión' }));
    await screen.findByText(/Boleta 900001 emitida y enviada/);
    fireEvent.click(screen.getByRole('button', { name: 'Reimprimir boleta' }));
    await screen.findByText(/rotulada REIMPRESION, mismo folio/);
    expect(d.emitter.providerCalls).toBe(1);
    expect(d.print).toHaveBeenCalledTimes(3);
  });

  it('respuesta perdida: bloquea y se recupera conciliando, con el mismo folio', async () => {
    const d = deps({ printOk: () => true, scenario: 'unknown' });
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 's4' }} saleContext={ctx} deps={d} />);
    await screen.findByText(/No se reintenta sola/);
    fireEvent.click(screen.getByRole('button', { name: 'Conciliar (simulado)' }));
    await waitFor(() => expect(screen.getByTestId('fiscal-auto-boleta').dataset.phase).toBe('printed'));
    expect(d.emitter.providerCalls).toBe(1);
  });
});
