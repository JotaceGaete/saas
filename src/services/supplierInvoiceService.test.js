/**
 * supplierInvoiceService.js — tests reales (mockean supabase, no source-scan).
 * Cubren el contrato del wrapper: forma del payload hacia cada tabla/RPC,
 * mapeo camelCase<->snake_case, y traducción de errores Postgres crudos a
 * mensajes legibles (PROVEEDORES-CORE-3 §4/§9).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock genérico de un query builder de Supabase: cualquier método de
// encadenado (select/insert/update/delete/eq/order) devuelve el mismo
// proxy; single()/maybeSingle() resuelven de inmediato; y el proxy en sí
// es "then-able" para el caso en que el código hace `await` directo sobre
// la cadena sin cerrar con .single() (ej. listados).
function chainable(result) {
  const proxy = new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(result);
      return () => proxy;
    },
    apply() { return proxy; },
  });
  return proxy;
}

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    rpc: (...args) => rpcMock(...args),
  },
}));

import {
  getSupplierInvoices,
  getSupplierInvoicesBySupplier,
  createSupplierInvoice,
  updateSupplierInvoice,
  deleteSupplierInvoice,
  registerSupplierPayment,
  getSupplierPayments,
  getBusinessSupplierPayments,
  getSupplierPurchaseTotalsForPeriod,
  getSupplierInvoicesForPeriod,
} from './supplierInvoiceService';

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe('getSupplierInvoices — fusiona wa_supplier_invoices con wa_supplier_invoice_balances, nunca recalcula', () => {
  it('cada factura sale con paidAmount/balance/paymentStatus/isOverdue tal cual los entrega la vista', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'wa_supplier_invoices') {
        return chainable({ data: [{ id: 'inv1', business_id: 'biz1', supplier_id: 'sup1', document_type: 'factura', total_amount: 450000, issue_date: '2026-09-10' }], error: null });
      }
      if (table === 'wa_supplier_invoice_balances') {
        return chainable({ data: [{ invoice_id: 'inv1', paid_amount: 100000, balance: 350000, payment_status: 'partial', is_overdue: true }], error: null });
      }
      throw new Error(`tabla inesperada: ${table}`);
    });
    const { data, error } = await getSupplierInvoices('biz1');
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({ id: 'inv1', paidAmount: 100000, balance: 350000, paymentStatus: 'partial', isOverdue: true }),
    ]);
  });

  it('una factura sin fila de balance (recién creada, sin allocations) cae a paidAmount=0 y balance=total_amount', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'wa_supplier_invoices') return chainable({ data: [{ id: 'inv2', total_amount: 50000 }], error: null });
      if (table === 'wa_supplier_invoice_balances') return chainable({ data: [], error: null });
      throw new Error('tabla inesperada');
    });
    const { data } = await getSupplierInvoices('biz1');
    expect(data[0]).toMatchObject({ paidAmount: 0, balance: 50000, paymentStatus: 'pending', isOverdue: false });
  });
});

describe('createSupplierInvoice — payload hacia wa_supplier_invoices', () => {
  it('mapea camelCase -> snake_case correctamente, incluido purchaseType null cuando no se especifica', async () => {
    let insertedPayload;
    fromMock.mockImplementation(() => {
      const builder = {
        insert: (payload) => { insertedPayload = payload; return builder; },
        select: () => builder,
        single: () => Promise.resolve({ data: { id: 'new1', ...insertedPayload }, error: null }),
      };
      return builder;
    });
    await createSupplierInvoice('biz1', 'sup1', {
      documentType: 'factura', documentNumber: '18452', issueDate: '2026-09-10', dueDate: '2026-10-10',
      purchaseType: 'mercaderia', netAmount: 378151, taxRate: 19, taxAmount: 71849, totalAmount: 450000, notes: 'obs',
    });
    expect(insertedPayload).toEqual({
      business_id: 'biz1', supplier_id: 'sup1', document_type: 'factura', document_number: '18452',
      issue_date: '2026-09-10', due_date: '2026-10-10', purchase_type: 'mercaderia',
      net_amount: 378151, tax_rate: 19, tax_included: true, tax_amount: 71849, total_amount: 450000, notes: 'obs',
    });
  });

  it('documento duplicado (23505) -- nunca muestra el error SQL crudo, siempre un mensaje amigable', async () => {
    fromMock.mockImplementation(() => {
      const builder = {
        insert: () => builder,
        select: () => builder,
        single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "wa_supplier_invoices_doc_uq"' } }),
      };
      return builder;
    });
    const { data, error } = await createSupplierInvoice('biz1', 'sup1', { documentType: 'factura', documentNumber: '1', issueDate: '2026-09-10', totalAmount: 1000 });
    expect(data).toBeNull();
    expect(error.message).not.toMatch(/constraint|duplicate key/i);
    expect(error.message).toMatch(/ya existe/i);
  });
});

describe('updateSupplierInvoice — solo envía los campos presentes en el payload', () => {
  it('un payload con solo {notes, dueDate} nunca toca net_amount/tax_rate/tax_amount/total_amount (base de la restricción de edición de §8)', async () => {
    let updatedPayload;
    fromMock.mockImplementation((table) => {
      if (table === 'wa_supplier_invoice_balances') return chainable({ data: { paid_amount: 0 }, error: null });
      const builder = {
        update: (payload) => { updatedPayload = payload; return builder; },
        eq: () => builder,
        select: () => builder,
        single: () => Promise.resolve({ data: { id: 'inv1', ...updatedPayload }, error: null }),
      };
      return builder;
    });
    await updateSupplierInvoice('inv1', { notes: 'nueva nota', dueDate: '2026-11-01' });
    expect(updatedPayload).toEqual({ notes: 'nueva nota', due_date: '2026-11-01' });
    expect(updatedPayload).not.toHaveProperty('net_amount');
    expect(updatedPayload).not.toHaveProperty('tax_rate');
    expect(updatedPayload).not.toHaveProperty('tax_amount');
    expect(updatedPayload).not.toHaveProperty('total_amount');
  });
});

describe('updateSupplierInvoice — hardening: la protección de campos financieros vive en el servicio, no solo en la UI', () => {
  // Helper: simula wa_supplier_invoice_balances devolviendo paid_amount, y
  // -- si el update llega a intentarse -- captura el payload real enviado
  // a wa_supplier_invoices para poder afirmar que nunca ocurrió.
  function mockInvoiceUpdateFlow(paidAmount) {
    let updateAttempted = false;
    let capturedPayload = null;
    fromMock.mockImplementation((table) => {
      if (table === 'wa_supplier_invoice_balances') {
        return chainable({ data: { paid_amount: paidAmount }, error: null });
      }
      const builder = {
        update: (payload) => { updateAttempted = true; capturedPayload = payload; return builder; },
        eq: () => builder,
        select: () => builder,
        single: () => Promise.resolve({ data: { id: 'inv1', ...capturedPayload }, error: null }),
      };
      return builder;
    });
    return { wasUpdateAttempted: () => updateAttempted, getCapturedPayload: () => capturedPayload };
  }

  describe('A. factura con paid_amount > 0', () => {
    it.each([
      ['netAmount', 100],
      ['taxRate', 19],
      ['taxAmount', 19],
      ['totalAmount', 119],
      ['documentType', 'boleta'],
      ['purchaseType', 'servicio'],
      ['issueDate', '2026-09-01'],
    ])('rechaza el intento de modificar %s con un error de dominio legible, y NUNCA llega a llamar UPDATE', async (field, value) => {
      const flow = mockInvoiceUpdateFlow(100000);
      const { data, error } = await updateSupplierInvoice('inv1', { [field]: value });
      expect(data).toBeNull();
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(/ya tiene pagos registrados/i);
      expect(flow.wasUpdateAttempted()).toBe(false);
    });

    it('permite documentNumber/dueDate/notes juntos, sin tocar ningún campo protegido', async () => {
      const flow = mockInvoiceUpdateFlow(50000);
      const { data, error } = await updateSupplierInvoice('inv1', {
        documentNumber: 'NEW-1', dueDate: '2026-12-01', notes: 'actualizado',
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      expect(flow.wasUpdateAttempted()).toBe(true);
      expect(flow.getCapturedPayload()).toEqual({ document_number: 'NEW-1', due_date: '2026-12-01', notes: 'actualizado' });
    });

    it('un payload mixto (un campo permitido + uno protegido) se rechaza completo -- no aplica parcialmente los permitidos', async () => {
      const flow = mockInvoiceUpdateFlow(1);
      const { error } = await updateSupplierInvoice('inv1', { notes: 'ok', totalAmount: 999 });
      expect(error.message).toMatch(/ya tiene pagos registrados/i);
      expect(flow.wasUpdateAttempted()).toBe(false);
    });
  });

  describe('B. factura con paid_amount = 0 (sin pagos)', () => {
    it('mantiene el comportamiento actual -- permite modificar campos financieros sin restricción', async () => {
      const flow = mockInvoiceUpdateFlow(0);
      const { error } = await updateSupplierInvoice('inv1', { totalAmount: 200000, taxRate: 19, netAmount: 168067, taxAmount: 31933 });
      expect(error).toBeNull();
      expect(flow.wasUpdateAttempted()).toBe(true);
      expect(flow.getCapturedPayload()).toEqual({ total_amount: 200000, tax_rate: 19, net_amount: 168067, tax_amount: 31933 });
    });
  });

  it('si falla la consulta a wa_supplier_invoice_balances, el error se propaga y el UPDATE nunca se intenta', async () => {
    let updateAttempted = false;
    fromMock.mockImplementation((table) => {
      if (table === 'wa_supplier_invoice_balances') return chainable({ data: null, error: { message: 'network error' } });
      const builder = { update: () => { updateAttempted = true; return builder; }, eq: () => builder, select: () => builder, single: () => Promise.resolve({ data: null, error: null }) };
      return builder;
    });
    const { data, error } = await updateSupplierInvoice('inv1', { notes: 'x' });
    expect(data).toBeNull();
    expect(error.message).toBe('network error');
    expect(updateAttempted).toBe(false);
  });

  it('una factura sin fila en wa_supplier_invoice_balances (maybeSingle -> null) se trata como paid_amount=0, no bloquea la edición', async () => {
    let updateAttempted = false;
    fromMock.mockImplementation((table) => {
      if (table === 'wa_supplier_invoice_balances') return chainable({ data: null, error: null });
      const builder = { update: () => { updateAttempted = true; return builder; }, eq: () => builder, select: () => builder, single: () => Promise.resolve({ data: { id: 'inv1' }, error: null }) };
      return builder;
    });
    const { error } = await updateSupplierInvoice('inv1', { totalAmount: 500 });
    expect(error).toBeNull();
    expect(updateAttempted).toBe(true);
  });
});

describe('deleteSupplierInvoice — factura con pagos', () => {
  it('FK RESTRICT (23503) se traduce a un mensaje legible, nunca el error de Postgres crudo', async () => {
    fromMock.mockImplementation(() => {
      const builder = { delete: () => builder, eq: () => Promise.resolve({ error: { code: '23503', message: 'update or delete on table "wa_supplier_invoices" violates foreign key constraint' } }) };
      return builder;
    });
    const { error } = await deleteSupplierInvoice('inv1');
    expect(error.message).not.toMatch(/foreign key|constraint/i);
    expect(error.message).toMatch(/pagos registrados/i);
  });

  it('sin pagos, el delete procede normalmente sin error', async () => {
    fromMock.mockImplementation(() => {
      const builder = { delete: () => builder, eq: () => Promise.resolve({ error: null }) };
      return builder;
    });
    const { error } = await deleteSupplierInvoice('inv2');
    expect(error).toBeNull();
  });
});

describe('registerSupplierPayment — única vía hacia wa_register_supplier_payment', () => {
  it('nunca hace INSERT directo -- siempre pasa por supabase.rpc', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'pay1', business_id: 'biz1', supplier_id: 'sup1', amount: 150000, payment_method: 'cash', payment_date: '2026-09-11' }], error: null });
    await registerSupplierPayment('biz1', 'sup1', {
      amount: 150000, paymentMethod: 'cash', paymentDate: '2026-09-11',
      allocations: [{ invoiceId: 'inv1', amount: 150000 }],
    });
    expect(fromMock).not.toHaveBeenCalledWith('wa_supplier_payments');
    expect(fromMock).not.toHaveBeenCalledWith('wa_supplier_payment_allocations');
    expect(rpcMock).toHaveBeenCalledWith('wa_register_supplier_payment', expect.objectContaining({
      p_business_id: 'biz1', p_supplier_id: 'sup1', p_amount: 150000, p_payment_method: 'cash',
      p_allocations: [{ invoice_id: 'inv1', amount: 150000 }],
    }));
  });

  it('mapea allocations con múltiples facturas correctamente (pago multi-factura)', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'pay2' }], error: null });
    await registerSupplierPayment('biz1', 'sup1', {
      amount: 250000, paymentMethod: 'card',
      allocations: [{ invoiceId: 'invA', amount: 200000 }, { invoiceId: 'invB', amount: 50000 }],
    });
    const [, params] = rpcMock.mock.calls[0];
    expect(params.p_allocations).toEqual([
      { invoice_id: 'invA', amount: 200000 },
      { invoice_id: 'invB', amount: 50000 },
    ]);
  });

  it('ALLOCATIONS_MUST_EQUAL_PAYMENT_AMOUNT se traduce a un mensaje legible sobre el invariante de CORE-2B', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'ALLOCATIONS_MUST_EQUAL_PAYMENT_AMOUNT' } });
    const { error } = await registerSupplierPayment('biz1', 'sup1', { amount: 100000, paymentMethod: 'cash', allocations: [] });
    expect(error.message).toMatch(/exactamente igual/i);
  });

  it('ALLOCATION_EXCEEDS_BALANCE se traduce a un mensaje legible', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'ALLOCATION_EXCEEDS_BALANCE' } });
    const { error } = await registerSupplierPayment('biz1', 'sup1', { amount: 100000, paymentMethod: 'cash', allocations: [{ invoiceId: 'i', amount: 100000 }] });
    expect(error.message).toMatch(/saldo pendiente/i);
  });

  it('un código de error desconocido nunca se muestra crudo -- cae al mensaje genérico', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'algo_no_mapeado_xyz' } });
    const { error } = await registerSupplierPayment('biz1', 'sup1', { amount: 1, paymentMethod: 'cash', allocations: [{ invoiceId: 'i', amount: 1 }] });
    expect(error.message).not.toMatch(/algo_no_mapeado_xyz/);
  });
});

describe('getSupplierPayments', () => {
  it('mapea las filas de wa_supplier_payments a camelCase', async () => {
    fromMock.mockImplementation((table) => {
      expect(table).toBe('wa_supplier_payments');
      return chainable({ data: [{ id: 'p1', amount: 5000, payment_method: 'transfer', payment_date: '2026-09-01' }], error: null });
    });
    const { data } = await getSupplierPayments('sup1');
    expect(data).toEqual([expect.objectContaining({ id: 'p1', amount: 5000, paymentMethod: 'transfer', paymentDate: '2026-09-01' })]);
  });
});

// ============================================================
// PROVEEDORES-CORE-4A — tax_included
// ============================================================

describe('mapInvoiceRow (vía getSupplierInvoices) — tax_included -> taxIncluded', () => {
  it('1. mapea tax_included=false correctamente (no se pisa con el default)', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'wa_supplier_invoices') return chainable({ data: [{ id: 'inv1', total_amount: 1000, tax_included: false }], error: null });
      if (table === 'wa_supplier_invoice_balances') return chainable({ data: [], error: null });
      throw new Error('tabla inesperada');
    });
    const { data } = await getSupplierInvoices('biz1');
    expect(data[0].taxIncluded).toBe(false);
  });

  it('una fila sin tax_included (columna NULL o ausente) cae al default true', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'wa_supplier_invoices') return chainable({ data: [{ id: 'inv2', total_amount: 1000 }], error: null });
      if (table === 'wa_supplier_invoice_balances') return chainable({ data: [], error: null });
      throw new Error('tabla inesperada');
    });
    const { data } = await getSupplierInvoices('biz1');
    expect(data[0].taxIncluded).toBe(true);
  });
});

describe('createSupplierInvoice — 2. persiste tax_included', () => {
  it('envía tax_included=false cuando el payload lo especifica', async () => {
    let insertedPayload;
    fromMock.mockImplementation(() => {
      const builder = {
        insert: (payload) => { insertedPayload = payload; return builder; },
        select: () => builder,
        single: () => Promise.resolve({ data: { id: 'new1', ...insertedPayload }, error: null }),
      };
      return builder;
    });
    await createSupplierInvoice('biz1', 'sup1', { documentType: 'factura', issueDate: '2026-09-10', totalAmount: 1000, taxIncluded: false });
    expect(insertedPayload.tax_included).toBe(false);
  });

  it('sin especificar taxIncluded, se envía true por default (mismo default que crm_purchase_invoices)', async () => {
    let insertedPayload;
    fromMock.mockImplementation(() => {
      const builder = {
        insert: (payload) => { insertedPayload = payload; return builder; },
        select: () => builder,
        single: () => Promise.resolve({ data: { id: 'new2', ...insertedPayload }, error: null }),
      };
      return builder;
    });
    await createSupplierInvoice('biz1', 'sup1', { documentType: 'factura', issueDate: '2026-09-10', totalAmount: 1000 });
    expect(insertedPayload.tax_included).toBe(true);
  });
});

describe('updateSupplierInvoice — taxIncluded como campo protegido (hardening CORE-3 extendido)', () => {
  function mockInvoiceUpdateFlow(paidAmount) {
    let updateAttempted = false;
    let capturedPayload = null;
    fromMock.mockImplementation((table) => {
      if (table === 'wa_supplier_invoice_balances') return chainable({ data: { paid_amount: paidAmount }, error: null });
      const builder = {
        update: (payload) => { updateAttempted = true; capturedPayload = payload; return builder; },
        eq: () => builder,
        select: () => builder,
        single: () => Promise.resolve({ data: { id: 'inv1', ...capturedPayload }, error: null }),
      };
      return builder;
    });
    return { wasUpdateAttempted: () => updateAttempted, getCapturedPayload: () => capturedPayload };
  }

  it('3. paid_amount=0 -- permite cambiar taxIncluded normalmente', async () => {
    const flow = mockInvoiceUpdateFlow(0);
    const { error } = await updateSupplierInvoice('inv1', { taxIncluded: false });
    expect(error).toBeNull();
    expect(flow.wasUpdateAttempted()).toBe(true);
    expect(flow.getCapturedPayload()).toEqual({ tax_included: false });
  });

  it('4. paid_amount>0 -- rechaza el intento de cambiar taxIncluded, con error de dominio legible, sin llegar a UPDATE', async () => {
    const flow = mockInvoiceUpdateFlow(50000);
    const { data, error } = await updateSupplierInvoice('inv1', { taxIncluded: false });
    expect(data).toBeNull();
    expect(error.message).toMatch(/ya tiene pagos registrados/i);
    expect(flow.wasUpdateAttempted()).toBe(false);
  });
});

describe('getSupplierPurchaseTotalsForPeriod — PROVEEDORES-CORE-4A', () => {
  it('5. consulta wa_supplier_invoices (no crm_purchase_invoices)', async () => {
    fromMock.mockImplementation((table) => chainable({ data: [], error: null }));
    await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(fromMock).toHaveBeenCalledWith('wa_supplier_invoices');
    expect(fromMock).not.toHaveBeenCalledWith('crm_purchase_invoices');
  });

  it('6. filtra por business_id', async () => {
    let capturedBusinessId;
    fromMock.mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: (col, val) => { if (col === 'business_id') capturedBusinessId = val; return builder; },
        gte: () => builder,
        lt: () => Promise.resolve({ data: [], error: null }),
      };
      return builder;
    });
    await getSupplierPurchaseTotalsForPeriod('biz-xyz', '2026-09-01', '2026-10-01');
    expect(capturedBusinessId).toBe('biz-xyz');
  });

  it('7. filtra por rango de fechas (issue_date >= startDate, < endDate)', async () => {
    let capturedGte, capturedLt;
    fromMock.mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        gte: (col, val) => { capturedGte = [col, val]; return builder; },
        lt: (col, val) => { capturedLt = [col, val]; return Promise.resolve({ data: [], error: null }); },
      };
      return builder;
    });
    await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(capturedGte).toEqual(['issue_date', '2026-09-01']);
    expect(capturedLt).toEqual(['issue_date', '2026-10-01']);
  });

  it('8. clasifica por purchase_type correctamente (mercaderia/gasto_con_iva/gasto_sin_iva); servicio/otros/null van al bucket "other", nunca se pierden', async () => {
    fromMock.mockImplementation(() => chainable({
      data: [
        { purchase_type: 'mercaderia', net_amount: 100, tax_amount: 19, total_amount: 119 },
        { purchase_type: 'mercaderia', net_amount: 50, tax_amount: 9.5, total_amount: 59.5 },
        { purchase_type: 'gasto_con_iva', net_amount: 200, tax_amount: 38, total_amount: 238 },
        { purchase_type: 'gasto_sin_iva', net_amount: 30, tax_amount: 0, total_amount: 30 },
        { purchase_type: 'servicio', net_amount: 500, tax_amount: 95, total_amount: 595 },
        { purchase_type: null, net_amount: 10, tax_amount: 0, total_amount: 10 },
      ],
      error: null,
    }));
    const result = await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(result.totals.mercaderia).toEqual({ net: 150, tax: 28.5, total: 178.5 });
    expect(result.totals.gasto_con_iva).toEqual({ net: 200, tax: 38, total: 238 });
    expect(result.totals.gasto_sin_iva).toEqual({ net: 30, tax: 0, total: 30 });
    // IVA recuperable = mercadería + gasto con IVA; gasto operativo = gasto con IVA + gasto sin IVA
    // -- fórmula EXACTA de la legacy, "other" nunca entra en ninguna de las dos.
    expect(result.totalTaxCredit).toBe(28.5 + 38);
    expect(result.totalOperational).toBe(238 + 30);
    expect(result.error).toBeNull();
  });

  it('9. un error de Supabase se propaga en el campo error (a diferencia de la legacy, que lo descartaba en silencio)', async () => {
    fromMock.mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        lt: () => Promise.resolve({ data: null, error: { message: 'network failure' } }),
      };
      return builder;
    });
    const result = await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(result.error).toEqual({ message: 'network failure' });
    // Aun con error, la forma sigue siendo compatible con los consumidores
    // actuales (totales en cero, nunca undefined) -- drop-in seguro.
    expect(result.totals).toEqual({
      mercaderia: { net: 0, tax: 0, total: 0 },
      gasto_con_iva: { net: 0, tax: 0, total: 0 },
      gasto_sin_iva: { net: 0, tax: 0, total: 0 },
      other: { net: 0, tax: 0, total: 0 },
    });
    expect(result.totalTaxCredit).toBe(0);
    expect(result.totalOperational).toBe(0);
    expect(result.totalAmountAll).toBe(0);
  });
});

describe('PROVEEDORES-CORE-4A review fix — servicio/otros/NULL nunca desaparecen de la agregación', () => {
  const MIXED_ROWS = [
    { purchase_type: 'mercaderia', net_amount: 100, tax_amount: 19, total_amount: 119 },
    { purchase_type: 'gasto_con_iva', net_amount: 200, tax_amount: 38, total_amount: 238 },
    { purchase_type: 'gasto_sin_iva', net_amount: 30, tax_amount: 0, total_amount: 30 },
    { purchase_type: 'servicio', net_amount: 500, tax_amount: 95, total_amount: 595 },
    { purchase_type: 'otros', net_amount: 40, tax_amount: 7.6, total_amount: 47.6 },
    { purchase_type: null, net_amount: 10, tax_amount: 0, total_amount: 10 },
  ];

  it('servicio no desaparece -- su importe queda en totals.other', async () => {
    fromMock.mockImplementation(() => chainable({ data: MIXED_ROWS, error: null }));
    const result = await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(result.totals.other.total).toBeGreaterThanOrEqual(595);
  });

  it('otros no desaparece -- su importe queda en totals.other', async () => {
    fromMock.mockImplementation(() => chainable({ data: MIXED_ROWS, error: null }));
    const result = await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(result.totals.other.total).toBeGreaterThanOrEqual(47.6);
  });

  it('purchase_type NULL no desaparece -- su importe queda en totals.other', async () => {
    fromMock.mockImplementation(() => chainable({ data: MIXED_ROWS, error: null }));
    const result = await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    // Único total exclusivamente de la fila NULL: net=10/tax=0/total=10, aislado
    // verificando que servicio(595)+otros(47.6)+null(10) = 652.6 en total.other.
    expect(result.totals.other).toEqual({ net: 500 + 40 + 10, tax: 95 + 7.6 + 0, total: 595 + 47.6 + 10 });
  });

  it('total general de las filas consultadas reconcilia con la suma de las 4 categorías retornadas (totalAmountAll)', async () => {
    fromMock.mockImplementation(() => chainable({ data: MIXED_ROWS, error: null }));
    const result = await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    const sumOfRawRows = MIXED_ROWS.reduce((s, r) => s + r.total_amount, 0);
    const sumOfBuckets = result.totals.mercaderia.total + result.totals.gasto_con_iva.total
      + result.totals.gasto_sin_iva.total + result.totals.other.total;
    expect(result.totalAmountAll).toBeCloseTo(sumOfRawRows, 6);
    expect(sumOfBuckets).toBeCloseTo(sumOfRawRows, 6);
    expect(result.totalAmountAll).toBeCloseTo(sumOfBuckets, 6);
  });

  it('no se inventa clasificación IVA por purchase_type -- el bucket "other" nunca se suma a totalTaxCredit ni a totalOperational, aunque tenga tax_amount > 0', async () => {
    fromMock.mockImplementation(() => chainable({
      data: [{ purchase_type: 'servicio', net_amount: 1000000, tax_amount: 190000, total_amount: 1190000 }],
      error: null,
    }));
    const result = await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(result.totals.other).toEqual({ net: 1000000, tax: 190000, total: 1190000 });
    // El IVA de 'servicio' es real (190000) pero NUNCA se asume crédito
    // fiscal ni gasto operativo solo por el nombre del tipo.
    expect(result.totalTaxCredit).toBe(0);
    expect(result.totalOperational).toBe(0);
  });

  it('los 3 buckets legacy siguen disponibles con sus mismas claves (compatibilidad con CrmCostCenter/CrmCostos)', async () => {
    fromMock.mockImplementation(() => chainable({ data: [], error: null }));
    const result = await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(Object.keys(result.totals).sort()).toEqual(['gasto_con_iva', 'gasto_sin_iva', 'mercaderia', 'other'].sort());
    expect(result.totals.mercaderia).toEqual({ net: 0, tax: 0, total: 0 });
    expect(result.totals.gasto_con_iva).toEqual({ net: 0, tax: 0, total: 0 });
    expect(result.totals.gasto_sin_iva).toEqual({ net: 0, tax: 0, total: 0 });
  });
});

describe('getSupplierInvoicesForPeriod — PROVEEDORES-CORE-4B (desglose por día del Termómetro)', () => {
  it('consulta wa_supplier_invoices (no crm_purchase_invoices)', async () => {
    fromMock.mockImplementation((table) => chainable({ data: [], error: null }));
    await getSupplierInvoicesForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(fromMock).toHaveBeenCalledWith('wa_supplier_invoices');
    expect(fromMock).not.toHaveBeenCalledWith('crm_purchase_invoices');
  });

  it('filtra por business_id', async () => {
    let capturedBusinessId;
    fromMock.mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: (col, val) => { if (col === 'business_id') capturedBusinessId = val; return builder; },
        gte: () => builder,
        lt: () => builder,
        order: () => Promise.resolve({ data: [], error: null }),
      };
      return builder;
    });
    await getSupplierInvoicesForPeriod('biz-xyz', '2026-09-01', '2026-10-01');
    expect(capturedBusinessId).toBe('biz-xyz');
  });

  it('filtra por rango de fechas (issue_date >= startDate, < endDate)', async () => {
    let capturedGte, capturedLt;
    fromMock.mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        gte: (col, val) => { capturedGte = [col, val]; return builder; },
        lt: (col, val) => { capturedLt = [col, val]; return builder; },
        order: () => Promise.resolve({ data: [], error: null }),
      };
      return builder;
    });
    await getSupplierInvoicesForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(capturedGte).toEqual(['issue_date', '2026-09-01']);
    expect(capturedLt).toEqual(['issue_date', '2026-10-01']);
  });

  it('mapea purchase_type/issue_date/total_amount a camelCase', async () => {
    fromMock.mockImplementation(() => chainable({
      data: [{ purchase_type: 'gasto_con_iva', issue_date: '2026-09-05', total_amount: 25000 }],
      error: null,
    }));
    const { data, error } = await getSupplierInvoicesForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(error).toBeNull();
    expect(data).toEqual([{ purchaseType: 'gasto_con_iva', issueDate: '2026-09-05', totalAmount: 25000 }]);
  });

  it('propaga el error de Supabase en vez de esconderlo detrás de una lista vacía', async () => {
    fromMock.mockImplementation(() => chainable({ data: null, error: { message: 'boom' } }));
    const { data, error } = await getSupplierInvoicesForPeriod('biz1', '2026-09-01', '2026-10-01');
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'boom' });
  });
});

describe('10. supplierInvoiceService.js nunca escribe en crm_purchase_invoices (tabla legacy congelada)', () => {
  it('ejercitando todas las funciones exportadas, fromMock nunca se llama con crm_purchase_invoices', async () => {
    fromMock.mockImplementation(() => chainable({ data: [], error: null }));
    rpcMock.mockResolvedValue({ data: [{ id: 'pay1' }], error: null });

    await getSupplierInvoices('biz1');
    await getSupplierInvoicesBySupplier('sup1');
    await createSupplierInvoice('biz1', 'sup1', { documentType: 'factura', issueDate: '2026-09-10', totalAmount: 1000 });
    await updateSupplierInvoice('inv1', { notes: 'x' });
    await deleteSupplierInvoice('inv1');
    await registerSupplierPayment('biz1', 'sup1', { amount: 1, paymentMethod: 'cash', allocations: [{ invoiceId: 'i', amount: 1 }] });
    await getSupplierPayments('sup1');
    await getBusinessSupplierPayments('biz1');
    await getSupplierPurchaseTotalsForPeriod('biz1', '2026-09-01', '2026-10-01');
    await getSupplierInvoicesForPeriod('biz1', '2026-09-01', '2026-10-01');

    for (const call of fromMock.mock.calls) {
      expect(call[0]).not.toBe('crm_purchase_invoices');
    }
  });
});
