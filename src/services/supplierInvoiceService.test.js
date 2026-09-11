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
  createSupplierInvoice,
  updateSupplierInvoice,
  deleteSupplierInvoice,
  registerSupplierPayment,
  getSupplierPayments,
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
      net_amount: 378151, tax_rate: 19, tax_amount: 71849, total_amount: 450000, notes: 'obs',
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
