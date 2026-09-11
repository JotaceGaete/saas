/**
 * suppliers/index.jsx — render/interacción real (React Testing Library).
 * Cubre PROVEEDORES-CORE-3 escenarios 10, 11, 12, 15 del pedido de tests.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('components/ui/BusinessSidebar', () => ({ default: () => <div data-testid="sidebar-stub" /> }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null } }),
}));

// Se mockea el módulo COMPLETO, incluidas las funciones legacy -- así el
// escenario 15 puede probar en serio que nunca se invocan, no solo que
// index.jsx no las importa (eso ya lo confirma que el módulo compile).
const getSuppliersMock = vi.fn();
const createSupplierMock = vi.fn();
const updateSupplierMock = vi.fn();
const deleteSupplierMock = vi.fn();
const getSupplierDebtsMock = vi.fn();
const getAllBusinessDebtsMock = vi.fn();
const createSupplierDebtMock = vi.fn();
const updateSupplierDebtMock = vi.fn();
const addDebtPaymentMock = vi.fn();
const markDebtAsPaidMock = vi.fn();
const deleteSupplierDebtMock = vi.fn();

vi.mock('../../services/waBusinessService', () => ({
  getSuppliers: (...a) => getSuppliersMock(...a),
  createSupplier: (...a) => createSupplierMock(...a),
  updateSupplier: (...a) => updateSupplierMock(...a),
  deleteSupplier: (...a) => deleteSupplierMock(...a),
  getEffectivePlanSlug: () => 'business',
  // legacy -- deben quedar sin uso desde esta página (PROVEEDORES-CORE-3 §11)
  getSupplierDebts: (...a) => getSupplierDebtsMock(...a),
  getAllBusinessDebts: (...a) => getAllBusinessDebtsMock(...a),
  createSupplierDebt: (...a) => createSupplierDebtMock(...a),
  updateSupplierDebt: (...a) => updateSupplierDebtMock(...a),
  addDebtPayment: (...a) => addDebtPaymentMock(...a),
  markDebtAsPaid: (...a) => markDebtAsPaidMock(...a),
  deleteSupplierDebt: (...a) => deleteSupplierDebtMock(...a),
}));

const getSupplierInvoicesMock = vi.fn();
const getBusinessSupplierPaymentsMock = vi.fn();
const registerSupplierPaymentMock = vi.fn();

vi.mock('../../services/supplierInvoiceService', () => ({
  getSupplierInvoices: (...a) => getSupplierInvoicesMock(...a),
  getBusinessSupplierPayments: (...a) => getBusinessSupplierPaymentsMock(...a),
  registerSupplierPayment: (...a) => registerSupplierPaymentMock(...a),
}));

import SuppliersPage from './index';

const SUPPLIER_HEALTHY = { id: 's-healthy', businessId: 'biz1', name: 'Proveedor Al Día', supplierType: 'otros' };
const SUPPLIER_PENDING = { id: 's-pending', businessId: 'biz1', name: 'Proveedor Con Deuda', supplierType: 'otros' };
const SUPPLIER_CRITICAL = { id: 's-critical', businessId: 'biz1', name: 'Proveedor Vencido', supplierType: 'otros' };

beforeEach(() => {
  [getSuppliersMock, createSupplierMock, updateSupplierMock, deleteSupplierMock,
    getSupplierDebtsMock, getAllBusinessDebtsMock, createSupplierDebtMock, updateSupplierDebtMock,
    addDebtPaymentMock, markDebtAsPaidMock, deleteSupplierDebtMock,
    getSupplierInvoicesMock, getBusinessSupplierPaymentsMock, registerSupplierPaymentMock].forEach((m) => m.mockReset());

  getSuppliersMock.mockResolvedValue({ data: [SUPPLIER_HEALTHY, SUPPLIER_PENDING, SUPPLIER_CRITICAL], error: null });
  getSupplierInvoicesMock.mockResolvedValue({
    data: [
      // healthy: sin facturas pendientes
      { id: 'inv-h1', supplierId: 's-healthy', totalAmount: 10000, balance: 0, paymentStatus: 'paid', isOverdue: false, dueDate: null },
      // pending: con deuda, sin vencer
      { id: 'inv-p1', supplierId: 's-pending', totalAmount: 50000, balance: 50000, paymentStatus: 'pending', isOverdue: false, dueDate: '2099-01-01' },
      // critical: con deuda vencida
      { id: 'inv-c1', supplierId: 's-critical', totalAmount: 30000, balance: 30000, paymentStatus: 'pending', isOverdue: true, dueDate: '2020-01-01' },
    ],
    error: null,
  });
  getBusinessSupplierPaymentsMock.mockResolvedValue({ data: [], error: null });
});

afterEach(() => cleanup());

function renderPage() {
  return render(<MemoryRouter initialEntries={['/proveedores']}><SuppliersPage /></MemoryRouter>);
}

describe('Escenarios 10/11/12 — estado del proveedor derivado (Al día / Con deuda / Vencido)', () => {
  it('un proveedor sin facturas con balance>0 muestra "Al día"', async () => {
    renderPage();
    const card = (await screen.findByText('Proveedor Al Día')).closest('div.group');
    expect(card).toHaveTextContent('Al día');
  });

  it('un proveedor con balance>0 y ninguna factura vencida muestra "Con deuda"', async () => {
    renderPage();
    const card = (await screen.findByText('Proveedor Con Deuda')).closest('div.group');
    expect(card).toHaveTextContent('Con deuda');
  });

  it('un proveedor con alguna factura balance>0 e isOverdue=true muestra "Vencido"', async () => {
    renderPage();
    const card = (await screen.findByText('Proveedor Vencido')).closest('div.group');
    expect(card).toHaveTextContent('Vencido');
  });
});

describe('Escenario 15 — /proveedores ya no llama a ninguna función legacy de wa_supplier_debts', () => {
  it('tras montar y cargar la lista, ninguna función legacy fue invocada; sí lo fueron las canónicas', async () => {
    renderPage();
    await screen.findByText('Proveedor Al Día');
    await screen.findByText('Proveedor Con Deuda');
    await screen.findByText('Proveedor Vencido');

    expect(getSupplierDebtsMock).not.toHaveBeenCalled();
    expect(getAllBusinessDebtsMock).not.toHaveBeenCalled();
    expect(createSupplierDebtMock).not.toHaveBeenCalled();
    expect(updateSupplierDebtMock).not.toHaveBeenCalled();
    expect(addDebtPaymentMock).not.toHaveBeenCalled();
    expect(markDebtAsPaidMock).not.toHaveBeenCalled();
    expect(deleteSupplierDebtMock).not.toHaveBeenCalled();

    expect(getSuppliersMock).toHaveBeenCalledWith('biz1');
    expect(getSupplierInvoicesMock).toHaveBeenCalledWith('biz1');
    expect(getBusinessSupplierPaymentsMock).toHaveBeenCalledWith('biz1');
  });
});
