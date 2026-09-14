/**
 * CrmInvoiceEditor.jsx — QUOTE-TO-SALE-1: precarga de una Nota de Venta
 * nueva desde un presupuesto aceptado (?quote=<quoteId>).
 *
 * Render/interacción real (React Testing Library), no source-scan.
 * Cubre el flujo completo pedido:
 *   - la precarga es SOLO lectura del presupuesto (getCrmQuote) -- nunca
 *     crea nada antes de que el usuario pulse Guardar;
 *   - cliente, ítems (con cargos manuales), cantidades, precios y
 *     condiciones comerciales quedan precargados;
 *   - todo sigue editable antes de guardar;
 *   - al guardar, createCrmInvoice recibe quoteId -- el vínculo hacia el
 *     presupuesto (converted_to_invoice_id) es responsabilidad del
 *     servicio, no de este componente (ver crmService.test.js);
 *   - el error amigable de "ya existe una NV para este presupuesto" se
 *     muestra tal cual, sin volver a intentar nada por su cuenta.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/PanelHeader', () => ({
  default: ({ title, children, mobileActions }) => <div>{title}{children}{mobileActions}</div>,
}));
vi.mock('./CrmDocumentPdf', () => ({ default: () => null }));
vi.mock('./components/CrmProductSearchModal', () => ({ CrmProductSearchModal: () => null }));
vi.mock('./components/QuickCustomerModal', () => ({ QuickCustomerModal: () => null }));
vi.mock('./components/ChileanDateInput', () => ({
  ChileanDateInput: ({ value, onChange, disabled }) => (
    <input aria-label="fecha" value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', currency: 'CLP', documentTitleType: 'presupuesto' } }),
}));

const getCrmInvoiceMock = vi.fn();
const createCrmInvoiceMock = vi.fn();
const updateCrmInvoiceMock = vi.fn();
const getCrmCustomersMock = vi.fn();
const createCrmCustomerMock = vi.fn();
const updateCrmInvoiceStatusMock = vi.fn();
const getCrmQuoteMock = vi.fn();

vi.mock('../../services/crmService', () => ({
  getCrmInvoice: (...a) => getCrmInvoiceMock(...a),
  createCrmInvoice: (...a) => createCrmInvoiceMock(...a),
  updateCrmInvoice: (...a) => updateCrmInvoiceMock(...a),
  getCrmCustomers: (...a) => getCrmCustomersMock(...a),
  createCrmCustomer: (...a) => createCrmCustomerMock(...a),
  formatInvoiceNumber: (n) => `NV-${String(n).padStart(4, '0')}`,
  updateCrmInvoiceStatus: (...a) => updateCrmInvoiceStatusMock(...a),
  getCrmQuote: (...a) => getCrmQuoteMock(...a),
  formatQuoteNumber: (n) => `PRES-${String(n).padStart(4, '0')}`,
}));

const getProductsMock = vi.fn();
vi.mock('../../services/waBusinessService', () => ({ getProducts: (...a) => getProductsMock(...a) }));

const listPaymentsByInvoiceMock = vi.fn();
const createPaymentMock = vi.fn();
vi.mock('../../services/crmPaymentsService', () => ({
  listPaymentsByInvoice: (...a) => listPaymentsByInvoiceMock(...a),
  createPayment: (...a) => createPaymentMock(...a),
}));

import CrmInvoiceEditor from './CrmInvoiceEditor';

const QUOTE = {
  id: 'q1',
  business_id: 'biz1',
  quote_number: 5,
  status: 'aceptado',
  customer_id: 'cust1',
  notes: 'Notas del presupuesto',
  payment_terms: '50% anticipo',
  delivery_days: '5 días hábiles',
  delivery_method: 'Retiro en tienda',
  commercial_notes: 'Precios no incluyen IVA',
  crm_quote_items: [
    { id: 'qi1', product_id: 'p1', name: 'Producto A', description: '', unit_price: 1000, quantity: 2, discount_pct: 0, discount_type: 'percentage', subtotal: 2000, sort_order: 0 },
    { id: 'qi2', product_id: null, name: 'Flete', description: '', unit_price: 500, quantity: 1, discount_pct: 0, discount_type: 'percentage', subtotal: 500, sort_order: 1 },
  ],
};

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/crm/facturas/:id" element={<CrmInvoiceEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  [getCrmInvoiceMock, createCrmInvoiceMock, updateCrmInvoiceMock, getCrmCustomersMock, createCrmCustomerMock,
    updateCrmInvoiceStatusMock, getCrmQuoteMock, getProductsMock, listPaymentsByInvoiceMock, createPaymentMock]
    .forEach((m) => m.mockReset());
  getCrmCustomersMock.mockResolvedValue({ data: [{ id: 'cust1', name: 'Cliente Uno', company: '' }], error: null });
  getProductsMock.mockResolvedValue({ data: [], error: null });
  getCrmQuoteMock.mockResolvedValue({ data: QUOTE, error: null });
  // Fallback para cuando un guardado exitoso navega a /crm/facturas/:id y
  // el editor recarga la NV ya creada -- irrelevante para lo que prueba
  // cada test, pero evita que ese efecto quede sin mockear.
  getCrmInvoiceMock.mockResolvedValue({
    data: { id: 'inv1', customer_id: null, status: 'pendiente', crm_invoice_items: [] },
    error: null,
  });
  listPaymentsByInvoiceMock.mockResolvedValue({ data: [], error: null });
});

afterEach(() => cleanup());

describe('CrmInvoiceEditor — QUOTE-TO-SALE-1: precarga desde presupuesto', () => {
  it('con ?quote=q1 llama a getCrmQuote y precarga cliente, ítems (incl. cargos manuales) y condiciones comerciales', async () => {
    renderAt('/crm/facturas/nueva?quote=q1');
    await waitFor(() => expect(getCrmQuoteMock).toHaveBeenCalledWith('q1'));
    await waitFor(() => expect(screen.getAllByDisplayValue('Producto A').length).toBeGreaterThan(0));

    // Cargo manual (product_id null) también se precarga.
    expect(screen.getAllByDisplayValue('Flete').length).toBeGreaterThan(0);

    // Condiciones comerciales, plazo/método de entrega y notas.
    expect(screen.getByDisplayValue('50% anticipo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5 días hábiles')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Retiro en tienda')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Precios no incluyen IVA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Notas del presupuesto')).toBeInTheDocument();

    // Cliente precargado en el <select>.
    expect(screen.getByDisplayValue('Cliente Uno').tagName).toBe('SELECT');

    // Regla obligatoria: antes de Guardar, ninguna fila nueva en crm_invoices.
    expect(createCrmInvoiceMock).not.toHaveBeenCalled();
  });

  it('todo queda editable antes de guardar: cambiar la cantidad se refleja en lo que se envía a createCrmInvoice', async () => {
    createCrmInvoiceMock.mockResolvedValue({ data: { id: 'inv1' }, error: null });
    renderAt('/crm/facturas/nueva?quote=q1');
    await waitFor(() => expect(screen.getAllByDisplayValue('Producto A').length).toBeGreaterThan(0));

    const qtyInputs = screen.getAllByDisplayValue('2'); // cantidad de "Producto A" (fila desktop + card mobile)
    fireEvent.change(qtyInputs[0], { target: { value: '5' } });

    fireEvent.click(screen.getAllByRole('button', { name: /crear factura/i })[0]);

    await waitFor(() => expect(createCrmInvoiceMock).toHaveBeenCalledTimes(1));
    const [, payload] = createCrmInvoiceMock.mock.calls[0];
    const productA = payload.items.find((i) => i.name === 'Producto A');
    expect(productA.quantity).toBe(5);
  });

  it('al guardar: createCrmInvoice recibe quoteId + todo lo precargado -- el vínculo con el presupuesto lo hace el servicio', async () => {
    createCrmInvoiceMock.mockResolvedValue({ data: { id: 'inv1' }, error: null });
    renderAt('/crm/facturas/nueva?quote=q1');
    await waitFor(() => expect(screen.getAllByDisplayValue('Producto A').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole('button', { name: /crear factura/i })[0]);

    await waitFor(() => expect(createCrmInvoiceMock).toHaveBeenCalledTimes(1));
    const [businessId, payload] = createCrmInvoiceMock.mock.calls[0];
    expect(businessId).toBe('biz1');
    expect(payload.quoteId).toBe('q1');
    expect(payload.customerId).toBe('cust1');
    expect(payload.paymentTerms).toBe('50% anticipo');
    expect(payload.deliveryDays).toBe('5 días hábiles');
    expect(payload.deliveryMethod).toBe('Retiro en tienda');
    expect(payload.commercialNotes).toBe('Precios no incluyen IVA');
    expect(payload.items).toHaveLength(2);
  });

  it('si el presupuesto ya tiene una NV vinculada, el error amigable de createCrmInvoice se muestra tal cual', async () => {
    createCrmInvoiceMock.mockResolvedValue({
      data: null,
      error: { message: 'Ya existe una nota de venta para este presupuesto.', code: 'QUOTE_ALREADY_CONVERTED' },
    });
    renderAt('/crm/facturas/nueva?quote=q1');
    await waitFor(() => expect(screen.getAllByDisplayValue('Producto A').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole('button', { name: /crear factura/i })[0]);

    await waitFor(() =>
      expect(screen.getAllByText('Ya existe una nota de venta para este presupuesto.').length).toBeGreaterThan(0),
    );
  });

  it('sin ?quote: "Nueva factura" se comporta como siempre -- nunca llama a getCrmQuote', async () => {
    renderAt('/crm/facturas/nueva');
    await waitFor(() => expect(getCrmCustomersMock).toHaveBeenCalled());
    expect(getCrmQuoteMock).not.toHaveBeenCalled();
  });

  it('editando una factura ya guardada (:id real, sin ?quote) tampoco toca getCrmQuote', async () => {
    getCrmInvoiceMock.mockResolvedValue({
      data: { id: 'inv9', customer_id: 'cust1', status: 'pendiente', crm_invoice_items: [] },
      error: null,
    });
    listPaymentsByInvoiceMock.mockResolvedValue({ data: [], error: null });
    renderAt('/crm/facturas/inv9');
    await waitFor(() => expect(getCrmInvoiceMock).toHaveBeenCalledWith('inv9'));
    expect(getCrmQuoteMock).not.toHaveBeenCalled();
  });
});
