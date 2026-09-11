/**
 * suppliers/index.jsx — render/interacción real (React Testing Library).
 * PROVEEDORES-UI-1: tabla lineal desktop simétrica con Clientes, cards en mobile.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('components/ui/BusinessSidebar', () => ({ default: () => <div data-testid="sidebar-stub" /> }));
vi.mock('../../components/UpcomingDueBanner', () => ({ default: () => <div data-testid="upcoming-due" /> }));
vi.mock('../../components/SupplierFormModal', () => ({
  default: ({ open, supplier }) => open ? <div data-testid="supplier-form">{supplier?.name || 'nuevo'}</div> : null,
}));
vi.mock('../../components/SupplierPaymentModal', () => ({
  default: ({ open, supplier }) => open ? <div data-testid="supplier-payment">{supplier?.name}</div> : null,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null } }),
}));

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

const SUPPLIER_HEALTHY = { id: 's-healthy', businessId: 'biz1', name: 'Proveedor Al Día', supplierType: 'otros', email: 'aldi@example.com' };
const SUPPLIER_PENDING = { id: 's-pending', businessId: 'biz1', name: 'Proveedor Con Deuda', supplierType: 'otros', phone: '+56 9 1234 5678' };
const SUPPLIER_CRITICAL = { id: 's-critical', businessId: 'biz1', name: 'Proveedor Vencido', supplierType: 'otros' };
const SUPPLIER_WITH_RUT = { id: 's-rut', businessId: 'biz1', name: 'Ferretería Andina', rut: '76.543.210-K', legalName: 'Ferretería Andina SpA', supplierType: 'otros' };

beforeEach(() => {
  navigateMock.mockReset();
  [getSuppliersMock, createSupplierMock, updateSupplierMock, deleteSupplierMock,
    getSupplierDebtsMock, getAllBusinessDebtsMock, createSupplierDebtMock, updateSupplierDebtMock,
    addDebtPaymentMock, markDebtAsPaidMock, deleteSupplierDebtMock,
    getSupplierInvoicesMock, getBusinessSupplierPaymentsMock, registerSupplierPaymentMock].forEach((m) => m.mockReset());

  getSuppliersMock.mockResolvedValue({ data: [SUPPLIER_HEALTHY, SUPPLIER_PENDING, SUPPLIER_CRITICAL], error: null });
  getSupplierInvoicesMock.mockResolvedValue({
    data: [
      { id: 'inv-h1', supplierId: 's-healthy', totalAmount: 10000, balance: 0, paymentStatus: 'paid', isOverdue: false, dueDate: null },
      { id: 'inv-p1', supplierId: 's-pending', totalAmount: 50000, balance: 50000, paymentStatus: 'pending', isOverdue: false, dueDate: '2099-01-01' },
      { id: 'inv-c1', supplierId: 's-critical', totalAmount: 30000, balance: 30000, paymentStatus: 'pending', isOverdue: true, dueDate: '2020-01-01' },
    ],
    error: null,
  });
  getBusinessSupplierPaymentsMock.mockResolvedValue({ data: [], error: null });
  deleteSupplierMock.mockResolvedValue({ error: null });
});

afterEach(() => cleanup());

function renderPage() {
  return render(<MemoryRouter initialEntries={['/proveedores']}><SuppliersPage /></MemoryRouter>);
}

async function getTable() {
  await screen.findAllByText('Proveedor Al Día');
  return screen.getByRole('table');
}

function getRowByName(table, name) {
  return within(table).getByText(name).closest('tr');
}

describe('PROVEEDORES-UI-1 — tabla lineal desktop y cards mobile', () => {
  it('renderiza las seis columnas esperadas', async () => {
    renderPage();
    const table = await getTable();
    ['Proveedor / Razón Social', 'Tipo / Identificación', 'Contacto', 'Estado Financiero', 'Saldo por Pagar', 'Acciones Rápidas']
      .forEach((label) => expect(within(table).getByText(label)).toBeInTheDocument());
  });

  it('mantiene cards mobile y tabla desktop en el mismo listado filtrado', async () => {
    renderPage();
    const table = await getTable();
    expect(table.parentElement).toHaveClass('hidden', 'lg:block');
    const cardsContainer = screen.getAllByText('Proveedor Al Día').map((node) => node.closest('.group')).find(Boolean)?.parentElement;
    expect(cardsContainer).toHaveClass('lg:hidden');
  });

  it('mapea healthy a Al día, pending a Con deuda y critical conserva señal Vencido', async () => {
    renderPage();
    const table = await getTable();
    expect(getRowByName(table, 'Proveedor Al Día')).toHaveTextContent('Al día');
    expect(getRowByName(table, 'Proveedor Con Deuda')).toHaveTextContent('Con deuda');
    expect(getRowByName(table, 'Proveedor Vencido')).toHaveTextContent('Con deuda');
    expect(getRowByName(table, 'Proveedor Vencido')).toHaveTextContent('Vencido');
  });

  it('Pagar abre el flujo existente y no navega a la ficha', async () => {
    renderPage();
    const table = await getTable();
    fireEvent.click(within(getRowByName(table, 'Proveedor Con Deuda')).getByRole('button', { name: 'Registrar pago' }));
    expect(screen.getByTestId('supplier-payment')).toHaveTextContent('Proveedor Con Deuda');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('WhatsApp mantiene wa.me y no navega a la ficha', async () => {
    renderPage();
    const table = await getTable();
    const link = within(getRowByName(table, 'Proveedor Con Deuda')).getByRole('link', { name: 'Enviar WhatsApp' });
    expect(link).toHaveAttribute('href', 'https://wa.me/56912345678');
    fireEvent.click(link);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('Ficha sí navega al detalle del proveedor', async () => {
    renderPage();
    const table = await getTable();
    fireEvent.click(within(getRowByName(table, 'Proveedor Con Deuda')).getByRole('button', { name: 'Ver ficha' }));
    expect(navigateMock).toHaveBeenCalledWith('/proveedores/s-pending');
  });

  it('click en la fila navega al detalle', async () => {
    renderPage();
    const table = await getTable();
    fireEvent.click(getRowByName(table, 'Proveedor Al Día'));
    expect(navigateMock).toHaveBeenCalledWith('/proveedores/s-healthy');
  });

  it('menú, Editar y Eliminar no propagan navegación de fila', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    const table = await getTable();
    const row = getRowByName(table, 'Proveedor Con Deuda');

    fireEvent.click(within(row).getByRole('button', { name: 'Más acciones' }));
    expect(navigateMock).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByText('Editar'));
    expect(screen.getByTestId('supplier-form')).toHaveTextContent('Proveedor Con Deuda');
    expect(navigateMock).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole('button', { name: 'Más acciones' }));
    fireEvent.click(within(row).getByText('Eliminar'));
    expect(deleteSupplierMock).toHaveBeenCalledWith('s-pending');
    expect(navigateMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('solo muestra Pagar cuando existe saldo pendiente', async () => {
    renderPage();
    const table = await getTable();
    expect(within(getRowByName(table, 'Proveedor Al Día')).queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument();
    expect(within(getRowByName(table, 'Proveedor Con Deuda')).getByRole('button', { name: 'Registrar pago' })).toBeInTheDocument();
  });

  it('proveedor sin identificación ni contacto muestra fallbacks neutrales', async () => {
    renderPage();
    const table = await getTable();
    const row = getRowByName(table, 'Proveedor Vencido');
    expect(row).toHaveTextContent('-');
    expect(row).toHaveTextContent('Sin contacto registrado');
  });

  it('conserva los cuatro KPIs superiores', async () => {
    renderPage();
    await getTable();
    ['Total pendiente', 'Deudas vencidas', 'Pagado este mes', 'Proveedores al día']
      .forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  });
});

describe('Estado canónico y servicios legacy', () => {
  it('no llama funciones legacy y sí usa las fuentes canónicas', async () => {
    renderPage();
    await getTable();
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

describe('Eliminar proveedor', () => {
  it('si deleteSupplier devuelve error, lo muestra y no recarga como éxito', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    deleteSupplierMock.mockResolvedValue({ error: new Error('No se puede eliminar este proveedor porque tiene facturas registradas.') });

    renderPage();
    const table = await getTable();
    const row = getRowByName(table, 'Proveedor Con Deuda');
    fireEvent.click(within(row).getByRole('button', { name: 'Más acciones' }));
    fireEvent.click(within(row).getByText('Eliminar'));

    expect(deleteSupplierMock).toHaveBeenCalledWith('s-pending');
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('No se puede eliminar este proveedor porque tiene facturas registradas.'));
    expect(getSuppliersMock).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });
});

describe('Búsqueda por RUT y razón social', () => {
  beforeEach(() => {
    getSuppliersMock.mockResolvedValue({ data: [SUPPLIER_HEALTHY, SUPPLIER_WITH_RUT], error: null });
    getSupplierInvoicesMock.mockResolvedValue({ data: [], error: null });
  });

  it('buscar por RUT encuentra al proveedor', async () => {
    renderPage();
    await screen.findAllByText('Proveedor Al Día');
    fireEvent.change(screen.getByPlaceholderText('Buscar proveedor...'), { target: { value: '76.543.210-k' } });
    expect(screen.getAllByText('Ferretería Andina').length).toBeGreaterThan(0);
    expect(screen.queryByText('Proveedor Al Día')).not.toBeInTheDocument();
  });

  it('buscar por razón social encuentra al proveedor', async () => {
    renderPage();
    await screen.findAllByText('Proveedor Al Día');
    fireEvent.change(screen.getByPlaceholderText('Buscar proveedor...'), { target: { value: 'andina spa' } });
    expect(screen.getAllByText('Ferretería Andina').length).toBeGreaterThan(0);
    expect(screen.queryByText('Proveedor Al Día')).not.toBeInTheDocument();
  });
});
