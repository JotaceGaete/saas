/**
 * SupplierDetail.jsx — render/interacción real (React Testing Library).
 * Cubre PROVEEDORES-CORE-3 escenarios 9 y 16 del pedido de tests.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('components/ui/BusinessSidebar', () => ({ default: () => <div data-testid="sidebar-stub" /> }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', currency: 'CLP' } }),
}));

const getSupplierMock = vi.fn();
const updateSupplierMock = vi.fn();
const getSupplierDebtsMock = vi.fn();
const getAllBusinessDebtsMock = vi.fn();
const createSupplierDebtMock = vi.fn();
const updateSupplierDebtMock = vi.fn();
const addDebtPaymentMock = vi.fn();
const markDebtAsPaidMock = vi.fn();
const deleteSupplierDebtMock = vi.fn();

vi.mock('../../services/waBusinessService', () => ({
  getSupplier: (...a) => getSupplierMock(...a),
  updateSupplier: (...a) => updateSupplierMock(...a),
  // legacy -- deben quedar sin uso desde esta página (PROVEEDORES-CORE-3 §11)
  getSupplierDebts: (...a) => getSupplierDebtsMock(...a),
  getAllBusinessDebts: (...a) => getAllBusinessDebtsMock(...a),
  createSupplierDebt: (...a) => createSupplierDebtMock(...a),
  updateSupplierDebt: (...a) => updateSupplierDebtMock(...a),
  addDebtPayment: (...a) => addDebtPaymentMock(...a),
  markDebtAsPaid: (...a) => markDebtAsPaidMock(...a),
  deleteSupplierDebt: (...a) => deleteSupplierDebtMock(...a),
}));

const getSupplierInvoicesBySupplierMock = vi.fn();
const getSupplierPaymentsMock = vi.fn();
const createSupplierInvoiceMock = vi.fn();
const updateSupplierInvoiceMock = vi.fn();
const deleteSupplierInvoiceMock = vi.fn();
const registerSupplierPaymentMock = vi.fn();

vi.mock('../../services/supplierInvoiceService', () => ({
  getSupplierInvoicesBySupplier: (...a) => getSupplierInvoicesBySupplierMock(...a),
  getSupplierPayments: (...a) => getSupplierPaymentsMock(...a),
  createSupplierInvoice: (...a) => createSupplierInvoiceMock(...a),
  updateSupplierInvoice: (...a) => updateSupplierInvoiceMock(...a),
  deleteSupplierInvoice: (...a) => deleteSupplierInvoiceMock(...a),
  registerSupplierPayment: (...a) => registerSupplierPaymentMock(...a),
}));

import SupplierDetail from './SupplierDetail';

const SUPPLIER = { id: 'sup1', businessId: 'biz1', name: 'Distribuidora Continental', supplierType: 'mercaderia' };
const INVOICE_UNPAID = { id: 'inv-unpaid', supplierId: 'sup1', documentType: 'factura', documentNumber: '1', issueDate: '2026-09-01', dueDate: null, totalAmount: 50000, paidAmount: 0, balance: 50000, paymentStatus: 'pending', isOverdue: false, notes: null, purchaseType: null };
const INVOICE_PAID = { id: 'inv-paid', supplierId: 'sup1', documentType: 'factura', documentNumber: '2', issueDate: '2026-08-01', dueDate: null, totalAmount: 30000, paidAmount: 30000, balance: 0, paymentStatus: 'paid', isOverdue: false, notes: null, purchaseType: null };

beforeEach(() => {
  [getSupplierMock, updateSupplierMock, getSupplierDebtsMock, getAllBusinessDebtsMock, createSupplierDebtMock,
    updateSupplierDebtMock, addDebtPaymentMock, markDebtAsPaidMock, deleteSupplierDebtMock,
    getSupplierInvoicesBySupplierMock, getSupplierPaymentsMock, createSupplierInvoiceMock,
    updateSupplierInvoiceMock, deleteSupplierInvoiceMock, registerSupplierPaymentMock].forEach((m) => m.mockReset());

  getSupplierMock.mockResolvedValue({ data: SUPPLIER, error: null });
  getSupplierInvoicesBySupplierMock.mockResolvedValue({ data: [INVOICE_UNPAID, INVOICE_PAID], error: null });
  getSupplierPaymentsMock.mockResolvedValue({ data: [{ id: 'pay1', supplierId: 'sup1', amount: 30000, paymentMethod: 'cash', paymentDate: '2026-08-15', reference: null, notes: null }], error: null });
});

afterEach(() => cleanup());

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/proveedores/sup1']}>
      <Routes><Route path="/proveedores/:supplierId" element={<SupplierDetail />} /></Routes>
    </MemoryRouter>,
  );
}

describe('Escenario 9 — factura pagada no ofrece eliminación', () => {
  it('el menú de la factura con paidAmount>0 (pagada) no muestra la opción "Eliminar"; la factura sin pagos sí la muestra', async () => {
    renderDetail();
    await screen.findByText('Distribuidora Continental');

    const unpaidRow = (await screen.findByText('Factura 1')).closest('.group');
    const paidRow = (await screen.findByText('Factura 2')).closest('.group');

    // Abrir el menú de cada fila (el botón "Opciones" es el único button
    // sin texto visible dentro de cada fila, identificado por su aria-label).
    const { getByLabelText: getByLabelInUnpaid } = within(unpaidRow);
    const { getByLabelText: getByLabelInPaid } = within(paidRow);

    fireEvent.click(getByLabelInUnpaid('Opciones'));
    expect(within(unpaidRow).getByText('Eliminar')).toBeInTheDocument();

    fireEvent.click(getByLabelInPaid('Opciones'));
    expect(within(paidRow).queryByText('Eliminar')).not.toBeInTheDocument();
  });
});

describe('Escenario 16 — SupplierDetail ya no llama a ninguna función legacy de wa_supplier_debts', () => {
  it('tras montar y cargar factura/pagos, ninguna función legacy fue invocada; sí lo fueron las canónicas', async () => {
    renderDetail();
    await screen.findByText('Distribuidora Continental');
    await screen.findByText('Factura 1');

    expect(getSupplierDebtsMock).not.toHaveBeenCalled();
    expect(getAllBusinessDebtsMock).not.toHaveBeenCalled();
    expect(createSupplierDebtMock).not.toHaveBeenCalled();
    expect(updateSupplierDebtMock).not.toHaveBeenCalled();
    expect(addDebtPaymentMock).not.toHaveBeenCalled();
    expect(markDebtAsPaidMock).not.toHaveBeenCalled();
    expect(deleteSupplierDebtMock).not.toHaveBeenCalled();

    expect(getSupplierMock).toHaveBeenCalledWith('sup1');
    expect(getSupplierInvoicesBySupplierMock).toHaveBeenCalledWith('sup1');
    expect(getSupplierPaymentsMock).toHaveBeenCalledWith('sup1');
  });
});
