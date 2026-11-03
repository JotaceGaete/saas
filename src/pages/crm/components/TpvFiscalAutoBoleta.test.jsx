import React, { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } } }));

import TpvFiscalAutoBoleta, { AUTO_PRINT_RETRY_DELAYS_MS, isTransientPrintFailure } from './TpvFiscalAutoBoleta';
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

  it('venta Point confirmada (forma de NV-0056): emite la boleta sola y no imprime el ticket comercial', async () => {
    // Igual que finishPointUi del TPV tras la confirmación de Mercado Pago.
    const pointCtx = {
      items: [{ product_id: 'p-1', name: 'Producto', quantity: 2, unit_price: 500 }],
      payments: [{ method: 'mercado_pago', amount: 1000 }],
      total: 1000, discountAmount: 0, pendingBalance: 0, saleNumber: 56,
    };
    const onPlainTicket = vi.fn();
    const d = deps({ printOk: () => true });
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: '452df3d4-37cc-406f-a4ea-d118ecdce2e7', invoice_number: 56 }}
      saleContext={pointCtx} deps={d} onPlainTicket={onPlainTicket} />);
    await screen.findByText(/Boleta 900001 emitida y enviada a la impresora/);
    expect(d.emitter.providerCalls).toBe(1);
    expect(d.print).toHaveBeenCalledTimes(1);
    expect(d.print.mock.calls[0][0]).toMatchObject({ saleNumber: 56, reprint: false });
    expect(onPlainTicket).not.toHaveBeenCalled();
  });
});

describe('TpvFiscalAutoBoleta — sin intervención del cajero', () => {
  beforeEach(() => localStorage.clear());

  it('el conector todavía no responde: reintenta solo con la misma clave y no emite otra boleta', async () => {
    let fails = 2;
    const emitter = createSimulatedEmitter({ businessId: BIZ, storage: localStorage, scenario: () => 'ok' });
    const print = vi.fn(async () => (fails-- > 0 ? { ok: false, code: 'connector_unreachable', message: 'No se encontró el conector.' } : { ok: true, simulation: true }));
    const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print, marks: createFlowMarks({ businessId: BIZ, storage: localStorage }) });
    const onPlainTicket = vi.fn();
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 'auto-1' }} saleContext={ctx} deps={{ emitter, flow }} onPlainTicket={onPlainTicket} />);
    await screen.findByText(/no se imprimió/);
    expect(screen.getByTestId('fiscal-auto-retry')).toBeInTheDocument();
    await screen.findByText(/Boleta 900001 emitida y enviada a la impresora/, {}, { timeout: AUTO_PRINT_RETRY_DELAYS_MS[0] + AUTO_PRINT_RETRY_DELAYS_MS[1] + 3000 });
    expect(print).toHaveBeenCalledTimes(3);
    expect(new Set(print.mock.calls.map(([p]) => p.idempotencyKey)).size).toBe(1);
    expect(print.mock.calls.every(([p]) => p.reprint === false)).toBe(true);
    expect(emitter.providerCalls).toBe(1);
    expect(onPlainTicket).not.toHaveBeenCalled();
  }, 15000);

  it('sin conector configurado al cobrar: emite e imprime sola en cuanto queda listo', async () => {
    let blocker = 'CONNECTOR_REQUIRED';
    const emitter = createSimulatedEmitter({ businessId: BIZ, storage: localStorage, scenario: () => 'ok' });
    const print = vi.fn(async () => ({ ok: true, simulation: true }));
    const printBlocker = () => blocker;
    const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print, printBlocker, marks: createFlowMarks({ businessId: BIZ, storage: localStorage }) });
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 'auto-2' }} saleContext={ctx} deps={{ emitter, flow, printBlocker }} />);
    await screen.findByText(/no está activo y emparejado/);
    expect(emitter.providerCalls).toBe(0);
    blocker = null; // el cajero empareja el conector en Impresión
    await screen.findByText(/Boleta 900001 emitida y enviada a la impresora/, {}, { timeout: 6000 });
    expect(emitter.providerCalls).toBe(1);
    expect(print).toHaveBeenCalledTimes(1);
  }, 10000);

  it('un error que no se arregla solo no reintenta en bucle', async () => {
    expect(isTransientPrintFailure('connector_unreachable')).toBe(true);
    expect(isTransientPrintFailure('http_503')).toBe(true);
    expect(isTransientPrintFailure('TED_NOT_VERIFIED')).toBe(false);
    expect(isTransientPrintFailure('escpos_drawer_blocked')).toBe(false);
    expect(isTransientPrintFailure('printer_not_found')).toBe(false);
  });
});

