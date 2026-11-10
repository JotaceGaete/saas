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


describe('modo real: resolución SII del servidor', () => {
  it('printableResolucion convierte { numero, fecha } en { numero, anio }', async () => {
    const { printableResolucion } = await import('./TpvFiscalAutoBoleta');
    expect(printableResolucion({ numero: 80, fecha: '2014-08-22' })).toEqual({ numero: '80', anio: '2014', fecha: '2014-08-22' });
    expect(printableResolucion(null)).toEqual({ numero: '', anio: '' });
  });

  it('withServerResolucion recuerda la resolución que trae el estado de fiscal-emit', async () => {
    const { withServerResolucion } = await import('./TpvFiscalAutoBoleta');
    const base = { mode: 'live', status: async () => ({ ok: true, data: { state: 'none', resolucion: { numero: 80, fecha: '2014-08-22' } } }), emit: async () => ({}) };
    const e = withServerResolucion(base);
    expect(e.resolucion()).toBeNull();
    await e.status('s1');
    expect(e.resolucion()).toEqual({ numero: 80, fecha: '2014-08-22' });
    expect(e.mode).toBe('live');
  });
});

describe('facturación opcional y tratamiento tributario', () => {
  beforeEach(() => localStorage.clear());

  function statusOnlyDeps(blockedReason) {
    const emitter = {
      mode: 'live',
      status: vi.fn(async () => ({ ok: true, data: { state: 'none', canEmit: false, blockedReason } })),
      emit: vi.fn(async () => ({ ok: true, folio: 1 })),
      loadDte: vi.fn(),
    };
    const print = vi.fn(async () => ({ ok: true }));
    const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print, marks: createFlowMarks({ businessId: BIZ, storage: localStorage }) });
    return { emitter, flow, print };
  }

  it('comercio sin facturación electrónica: no muestra nada fiscal, imprime el comprobante interno y no emite', async () => {
    for (const code of ['FISCAL_ISSUER_NOT_ENABLED', 'FISCAL_EMISSION_DISABLED']) {
      const d = statusOnlyDeps(code);
      const onPlainTicket = vi.fn();
      const { container, unmount } = render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: `off-${code}` }} saleContext={ctx} deps={d} onPlainTicket={onPlainTicket} />);
      await waitFor(() => expect(onPlainTicket).toHaveBeenCalledTimes(1));
      expect(container.querySelector('[data-testid="fiscal-auto-boleta"]')).toBeNull();
      expect(d.emitter.emit).not.toHaveBeenCalled();
      unmount();
    }
  });

  it.each([
    ['FISCAL_NON_TAXABLE_NOT_SUPPORTED', /exentos o no afectos/],
    ['FISCAL_TAX_LINES_NOT_VERIFIED', /tratamiento tributario/],
    ['MIXED_PAYMENTS', /pago dividido/],
    ['DISCOUNT_NOT_SUPPORTED', /descuento/],
  ])('%s: sin boleta, comprobante interno rotulado, sin emitir ni reintentar', async (code, text) => {
    const d = statusOnlyDeps(code);
    const onPlainTicket = vi.fn();
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: `ne-${code}` }} saleContext={ctx} deps={d} onPlainTicket={onPlainTicket} />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByText(/no es un documento tributario/)).toBeInTheDocument();
    expect(onPlainTicket).toHaveBeenCalledTimes(1);
    expect(d.emitter.emit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('fiscal-auto-retry')).toBeNull();
  });

  it('simulación: una venta con un producto exento o no afecto no emite boleta', async () => {
    const onPlainTicket = vi.fn();
    const mixed = { ...ctx, items: [{ name: 'Pan', quantity: 1, unit_price: 50, tax_treatment: 'IVA_AFECTO_19' }, { name: 'Libro', quantity: 1, unit_price: 50, tax_treatment: 'EXENTO' }] };
    const d = deps({ printOk: () => true });
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 'sim-mixed' }} saleContext={mixed} deps={d} onPlainTicket={onPlainTicket} />);
    expect(await screen.findByText(/exentos o no afectos/)).toBeInTheDocument();
    expect(d.emitter.providerCalls).toBe(0);
    expect(onPlainTicket).toHaveBeenCalledTimes(1);
  });

  it('simulación: productos sin tratamiento usan «afecto» y la venta emite', async () => {
    const d = deps({ printOk: () => true });
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 'sim-default' }} saleContext={ctx} deps={d} />);
    await screen.findByText(/Boleta 900001 emitida/);
  });
});
