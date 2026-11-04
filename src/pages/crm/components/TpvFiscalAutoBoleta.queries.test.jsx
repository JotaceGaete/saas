// Botones de consulta del panel de boleta (modo real): nunca emiten.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } } }));

const { default: TpvFiscalAutoBoleta } = await import('./TpvFiscalAutoBoleta');
const { createFiscalSaleFlow, createFlowMarks } = await import('../../../services/fiscalSaleFlow');

afterEach(() => cleanup());

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function liveDeps(statusData) {
  const emitter = { mode: 'live', status: vi.fn(async () => ({ ok: true, data: statusData })), emit: vi.fn(), loadDte: vi.fn(async () => new Uint8Array([1])) };
  const print = vi.fn(async () => ({ ok: true }));
  const flow = createFiscalSaleFlow({ businessId: 'b1', emitter, print, marks: createFlowMarks({ businessId: 'b1', storage: memStorage(), mode: 'live' }) });
  return { deps: { emitter, flow, printBlocker: () => null }, emitter, print };
}

const sale = { id: 's1' };
const ctx = { items: [], payments: [], total: 1190, discountAmount: 0, pendingBalance: 0 };

describe('consultas desde el panel', () => {
  it('resultado desconocido: «Consultar en DTE Core» informa el folio y no emite', async () => {
    const { deps, emitter } = liveDeps({ state: 'unknown', folio: null, errorCode: 'PROVIDER_TIMEOUT' });
    const lookup = vi.fn(async () => ({ ok: true, data: { result: 'found', folio: 4321, documents: 'valid', state: 'unknown' } }));
    render(<TpvFiscalAutoBoleta businessId="b1" sale={sale} saleContext={ctx} mode="live" preview={false} deps={deps} queries={{ lookup, siiStatus: vi.fn() }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar en DTE Core' }));
    expect(await screen.findByTestId('fiscal-query-note')).toHaveTextContent('folio 4321');
    expect(screen.getByTestId('fiscal-query-note')).toHaveTextContent('no se emitió otra');
    expect(lookup).toHaveBeenCalledWith('s1');
    expect(emitter.emit).not.toHaveBeenCalled();
    // Sigue sin botón de emitir de nuevo.
    expect(screen.queryByRole('button', { name: /emitir/i })).toBeNull();
  });

  it('boleta emitida: «Consultar estado SII» muestra el estado y no emite', async () => {
    const { deps, emitter } = liveDeps({ state: 'issued', folio: 51200, siiStatus: 'unverified' });
    const siiStatus = vi.fn(async () => ({ ok: true, data: { folio: 51200, siiStatus: 'accepted', updated: true } }));
    render(<TpvFiscalAutoBoleta businessId="b1" sale={sale} saleContext={ctx} mode="live" preview={false} deps={deps} queries={{ lookup: vi.fn(), siiStatus }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar estado SII' }));
    expect(await screen.findByTestId('fiscal-query-note')).toHaveTextContent('Aceptada por el SII');
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('simulación: no aparecen las consultas reales', async () => {
    const { deps } = liveDeps({ state: 'unknown' });
    deps.emitter.mode = 'simulated';
    render(<TpvFiscalAutoBoleta businessId="b1" sale={sale} saleContext={ctx} mode="simulated" deps={deps} />);
    await screen.findByTestId('fiscal-auto-boleta');
    expect(screen.queryByRole('button', { name: 'Consultar en DTE Core' })).toBeNull();
  });
});
