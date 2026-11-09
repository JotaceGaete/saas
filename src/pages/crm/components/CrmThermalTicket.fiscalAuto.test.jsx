// Ticket del TPV con el flujo de boleta en modo simulado, por la ruta real de
// impresión (buildFlowForMode -> printIssuedBoleta -> conector). Al confirmarse
// el cobro (efectivo o Point) la boleta con PDF417 sale sola, una vez, y el
// ticket comercial no se imprime.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() }, from: vi.fn() } }));

import CrmThermalTicket from './CrmThermalTicket';
import { buildConnectorConfigKey, writeConnectorConfig } from '../../../lib/printing/connectorConfigStorage';

const BIZ = '85e80cd0-7242-492f-951d-b17893e84283';

function connector({ failFirst = 0 } = {}) {
  const jobs = [];
  let failures = failFirst;
  globalThis.fetch = vi.fn(async (url, init) => {
    if (!String(url).endsWith('/v1/print')) return { ok: false, status: 404, json: async () => ({}) };
    if (failures > 0) { failures -= 1; throw new TypeError('Failed to fetch'); } // conector aún sin permiso / no autorizado
    const body = JSON.parse(init.body);
    const duplicate = jobs.some((j) => j.key === body.idempotencyKey);
    if (!duplicate) jobs.push({ key: body.idempotencyKey, bytes: atob(body.dataBase64) });
    return { ok: true, status: 200, json: async () => ({ status: 'sent_to_spooler', duplicate }) };
  });
  return jobs;
}

function renderTicket({ saleId, number, payments, items }) {
  const total = items.reduce((a, it) => a + it.unit_price * it.quantity, 0);
  const ctx = { items, payments, total, discountAmount: 0, pendingBalance: 0, saleNumber: number };
  const onPlainTicket = vi.fn();
  render(<CrmThermalTicket business={{ id: BIZ, name: 'Negocio', currency: 'CLP' }} sale={{ id: saleId, invoice_number: number }}
    items={items} paymentMethod={payments[0].method} payments={payments} subtotal={total} total={total}
    onNewSale={() => {}} onClose={() => {}} onReprint={() => {}}
    fiscalAutoMode="simulated" fiscalSaleContext={ctx} onPlainTicket={onPlainTicket} />);
  return { onPlainTicket };
}

beforeEach(() => {
  localStorage.clear();
  writeConnectorConfig(buildConnectorConfigKey(BIZ), {
    enabled: true, token: 't'.repeat(40), baseUrl: 'http://127.0.0.1:47801', printerName: 'Star TSP100 Cutter (TSP143)',
  });
});
afterEach(() => cleanup());

describe('boleta automática al confirmar el cobro', () => {
  it('efectivo (forma de NV-0058): una boleta con PDF417, sin pulsar nada', async () => {
    const jobs = connector();
    const { onPlainTicket } = renderTicket({
      saleId: 'cash-58', number: 58, payments: [{ method: 'cash', amount: 500 }],
      items: [{ _key: 'a', product_id: 'p1', name: 'Producto', unit_price: 500, quantity: 1 }],
    });
    await screen.findByText(/Boleta 900001 emitida y enviada a la impresora/);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].key).toBe(`fiscal:${BIZ}:900001:boleta`);
    expect(jobs[0].bytes).toContain('BOLETA ELECTRONICA');
    expect(jobs[0].bytes).toContain('Timbre Electronico SII');
    expect(jobs[0].bytes).toContain('Ref. interna NV-0058');
    expect(onPlainTicket).not.toHaveBeenCalled();
  });

  it('Point (forma de NV-0056) con el conector sin responder al principio: sale sola tras reintentar, una vez', async () => {
    const jobs = connector({ failFirst: 1 });
    const { onPlainTicket } = renderTicket({
      saleId: 'point-56', number: 56, payments: [{ method: 'mercado_pago', amount: 1000 }],
      items: [{ _key: 'b', product_id: 'p1', name: 'Producto', unit_price: 500, quantity: 2 }],
    });
    await screen.findByText(/no se imprimió/);
    await screen.findByText(/Boleta 900001 emitida y enviada a la impresora/, {}, { timeout: 6000 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].bytes).toContain('Ref. interna NV-0056');
    expect(onPlainTicket).not.toHaveBeenCalled();
  }, 10000);
});
