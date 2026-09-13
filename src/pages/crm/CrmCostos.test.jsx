/**
 * CrmCostos.jsx
 * - PROVEEDORES-CORE-4B: migración a la función canónica
 *   getSupplierPurchaseTotalsForPeriod (services/supplierInvoiceService.js),
 *   retirando el uso de crmService.getPurchaseTotalsForPeriod (crm_purchase_invoices).
 * - COSTOS-UI-1: rediseño visual alineado al Termómetro del negocio, sin
 *   tocar la lógica financiera ni las fuentes de datos.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));

vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/PanelHeader', () => ({
  default: ({ title, subtitle, children }) => <header>{title}{subtitle}{children}</header>,
}));

let business = { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null };
vi.mock('contexts/AuthContext', () => ({ useAuth: () => ({ business }) }));

vi.mock('config/planFeatures', () => ({ canUseFeature: () => true }));
vi.mock('services/waBusinessService', () => ({ getEffectivePlanSlug: () => 'business' }));

const getCostItemsMock = vi.fn();
const createCostItemMock = vi.fn();
const updateCostItemMock = vi.fn();
const deleteCostItemMock = vi.fn();
// legacy -- PROVEEDORES-CORE-4B: no debe volver a invocarse desde esta página
const getPurchaseTotalsForPeriodMock = vi.fn();

vi.mock('services/crmService', () => ({
  getCostItems: (...a) => getCostItemsMock(...a),
  createCostItem: (...a) => createCostItemMock(...a),
  updateCostItem: (...a) => updateCostItemMock(...a),
  deleteCostItem: (...a) => deleteCostItemMock(...a),
  getPurchaseTotalsForPeriod: (...a) => getPurchaseTotalsForPeriodMock(...a),
}));

const getSupplierPurchaseTotalsForPeriodMock = vi.fn();

vi.mock('services/supplierInvoiceService', () => ({
  getSupplierPurchaseTotalsForPeriod: (...a) => getSupplierPurchaseTotalsForPeriodMock(...a),
}));

import CrmCostos from './CrmCostos';

const OK_TOTALS = {
  totals: {
    mercaderia: { net: 0, tax: 0, total: 100000 },
    gasto_con_iva: { net: 0, tax: 0, total: 50000 },
    gasto_sin_iva: { net: 0, tax: 0, total: 0 },
    other: { net: 0, tax: 0, total: 0 },
  },
  totalTaxCredit: 8000,
  totalOperational: 50000,
  totalAmountAll: 150000,
  error: null,
};

const EMPTY_TOTALS = {
  totals: {
    mercaderia: { net: 0, tax: 0, total: 0 },
    gasto_con_iva: { net: 0, tax: 0, total: 0 },
    gasto_sin_iva: { net: 0, tax: 0, total: 0 },
    other: { net: 0, tax: 0, total: 0 },
  },
  totalTaxCredit: 0,
  totalOperational: 0,
  totalAmountAll: 0,
  error: null,
};

const FIXED_ITEM = { id: 'c1', type: 'fixed', category: 'rent', name: 'Arriendo local', amount: 500000 };
const FIXED_ITEM_2 = { id: 'c4', type: 'fixed', category: 'utilities', name: 'Servicios básicos', amount: 100000 };
const VARIABLE_ITEM = { id: 'c2', type: 'variable', category: 'supplies', name: 'Insumo variable', amount: 20000 };
const CASH_VARIABLE_ITEM = { id: 'c3', type: 'variable', source: 'cash_outflow', category: 'other', name: 'Gasto de caja', amount: 15000 };

beforeEach(() => {
  navigateMock.mockReset();
  business = { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null };
  [getCostItemsMock, createCostItemMock, updateCostItemMock, deleteCostItemMock,
    getPurchaseTotalsForPeriodMock, getSupplierPurchaseTotalsForPeriodMock].forEach((m) => m.mockReset());
  getCostItemsMock.mockResolvedValue([]);
  getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue(OK_TOTALS);
});

afterEach(() => cleanup());

function renderPage() {
  return render(<CrmCostos />);
}

async function renderReady() {
  renderPage();
  return {
    costos: await screen.findByRole('region', { name: 'Costos Fijos Mensuales' }),
    compras: await screen.findByRole('region', { name: 'Compras y Facturas' }),
  };
}

describe('2. CrmCostos usa la función canónica de compras', () => {
  it('llama a getSupplierPurchaseTotalsForPeriod y nunca a crmService.getPurchaseTotalsForPeriod', async () => {
    renderPage();
    await waitFor(() => expect(getSupplierPurchaseTotalsForPeriodMock).toHaveBeenCalledWith('biz1', expect.any(String), expect.any(String)));
    expect(getPurchaseTotalsForPeriodMock).not.toHaveBeenCalled();
  });
});

describe('4. error canónico no se convierte silenciosamente en ceros', () => {
  it('si getSupplierPurchaseTotalsForPeriod devuelve error, se muestra un estado de error en vez de "Sin compras"', async () => {
    getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue({ ...EMPTY_TOTALS, error: { message: 'boom' } });
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/No se pudieron cargar las compras del período/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Sin compras registradas este período/i)).not.toBeInTheDocument();
  });
});

describe('5/6/7. totals.other se muestra por separado y no infla totalTaxCredit/totalOperational', () => {
  it('muestra "Otros / Servicios" cuando other.total > 0', async () => {
    getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue({
      totals: {
        mercaderia: { net: 0, tax: 0, total: 0 },
        gasto_con_iva: { net: 0, tax: 0, total: 50000 },
        gasto_sin_iva: { net: 0, tax: 0, total: 0 },
        other: { net: 0, tax: 190000, total: 300000 },
      },
      totalTaxCredit: 8000,
      totalOperational: 50000,
      totalAmountAll: 350000,
      error: null,
    });
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/Otros \/ Servicios/i).length).toBeGreaterThan(0));
  });

  it('no muestra la línea "Otros / Servicios" cuando other.total es 0', async () => {
    renderPage();
    await waitFor(() => expect(getSupplierPurchaseTotalsForPeriodMock).toHaveBeenCalled());
    expect(screen.queryByText(/Otros \/ Servicios/i)).not.toBeInTheDocument();
  });
});

describe('COSTOS-UI-1: nuevo header', () => {
  it('muestra el título, subtítulo y los dos paneles', async () => {
    await renderReady();
    expect(screen.getByText('Centro de Costos y Egresos')).toBeInTheDocument();
    expect(screen.getByText('Gestión de gastos fijos y facturación de proveedores')).toBeInTheDocument();
  });

  it('botón "Ver Termómetro" navega a /crm/cost-center', async () => {
    await renderReady();
    fireEvent.click(screen.getByRole('button', { name: /Ver Termómetro/ }));
    expect(navigateMock).toHaveBeenCalledWith('/crm/cost-center');
  });

  it('mantiene el mecanismo de cambio de mes/año (no un texto estático)', async () => {
    await renderReady();
    expect(screen.getByRole('combobox', { name: 'Mes' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Año' })).toBeInTheDocument();
  });

  it('muestra el período actual correctamente (mes y año en curso)', async () => {
    await renderReady();
    const now = new Date();
    expect(screen.getByRole('combobox', { name: 'Mes' })).toHaveValue(String(now.getMonth() + 1));
    expect(screen.getByDisplayValue(MONTHS[now.getMonth()])).toBeInTheDocument();
    expect(screen.getByDisplayValue(String(now.getFullYear()))).toBeInTheDocument();
  });
});

describe('COSTOS-UI-1: Costos Fijos Mensuales', () => {
  it('costos fijos solo incluyen type=fixed', async () => {
    getCostItemsMock.mockResolvedValue([FIXED_ITEM]);
    const { costos } = await renderReady();
    expect(within(costos).getByText('Arriendo local')).toBeInTheDocument();
  });

  it('un ítem type=variable no aparece como costo fijo', async () => {
    getCostItemsMock.mockResolvedValue([FIXED_ITEM, VARIABLE_ITEM]);
    const { costos } = await renderReady();
    expect(within(costos).getByText('Arriendo local')).toBeInTheDocument();
    expect(within(costos).queryByText('Insumo variable')).not.toBeInTheDocument();
  });

  it('un gasto variable sincronizado desde Caja (cash_outflow) no aparece como costo fijo', async () => {
    getCostItemsMock.mockResolvedValue([FIXED_ITEM, CASH_VARIABLE_ITEM]);
    const { costos } = await renderReady();
    expect(within(costos).queryByText('Gasto de caja')).not.toBeInTheDocument();
  });

  it('el total presupuestado suma solo los costos fijos, ignorando variables y cash_outflow', async () => {
    getCostItemsMock.mockResolvedValue([FIXED_ITEM, FIXED_ITEM_2, VARIABLE_ITEM, CASH_VARIABLE_ITEM]);
    const { costos } = await renderReady();
    expect(within(costos).getByText('$600.000')).toBeInTheDocument();
    expect(within(costos).getByText('$500.000')).toBeInTheDocument();
    expect(within(costos).getByText('$100.000')).toBeInTheDocument();
    expect(within(costos).getByText('2 ítems')).toBeInTheDocument();
  });

  it('estado vacío: "Sin costos fijos configurados" y botón + Agregar', async () => {
    getCostItemsMock.mockResolvedValue([]);
    const { costos } = await renderReady();
    expect(within(costos).getByText('Sin costos fijos configurados')).toBeInTheDocument();
    expect(within(costos).getAllByRole('button', { name: /Agregar/ }).length).toBeGreaterThan(0);
  });
});

describe('COSTOS-UI-1: Compras y Facturas', () => {
  it('estado vacío: "Sin compras en este período"', async () => {
    getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue(EMPTY_TOTALS);
    const { compras } = await renderReady();
    expect(within(compras).getByText('Sin compras en este período')).toBeInTheDocument();
    expect(within(compras).getByText(/Ingresa tus facturas/)).toBeInTheDocument();
    expect(within(compras).queryByText(/actualizar stock/i)).not.toBeInTheDocument();
    expect(within(compras).queryByText(/deducir IVA/i)).not.toBeInTheDocument();
  });

  it('muestra la mercadería del período separada de otras categorías', async () => {
    const { compras } = await renderReady();
    expect(within(compras).getByText('Mercadería')).toBeInTheDocument();
    expect(within(compras).getByText('$100.000')).toBeInTheDocument();
  });

  it('muestra los gastos operativos por separado', async () => {
    const { compras } = await renderReady();
    expect(within(compras).getByText('Gastos operativos')).toBeInTheDocument();
    expect(within(compras).getByText('$50.000')).toBeInTheDocument();
  });

  it('muestra otros / servicios / pendientes por separado cuando existen', async () => {
    getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue({
      totals: {
        mercaderia: { net: 0, tax: 0, total: 10000 },
        gasto_con_iva: { net: 0, tax: 0, total: 0 },
        gasto_sin_iva: { net: 0, tax: 0, total: 0 },
        other: { net: 0, tax: 0, total: 40000 },
      },
      totalTaxCredit: 0,
      totalOperational: 0,
      totalAmountAll: 50000,
      error: null,
    });
    const { compras } = await renderReady();
    expect(within(compras).getByText(/Otros \/ Servicios \/ pendientes/)).toBeInTheDocument();
    expect(within(compras).getByText('$40.000')).toBeInTheDocument();
    expect(within(compras).getByText('$50.000')).toBeInTheDocument();
  });

  it('botón superior "+ Cargar" navega a /proveedores', async () => {
    const { compras } = await renderReady();
    fireEvent.click(within(compras).getByRole('button', { name: /Cargar/ }));
    expect(navigateMock).toHaveBeenCalledWith('/proveedores');
  });

  it('botón "Ir al módulo completo de Compras" navega a /proveedores', async () => {
    const { compras } = await renderReady();
    fireEvent.click(within(compras).getByRole('button', { name: /Ir al módulo completo de Compras/ }));
    expect(navigateMock).toHaveBeenCalledWith('/proveedores');
  });

  it('un error de carga no se representa como $0 real', async () => {
    getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue({ ...EMPTY_TOTALS, error: { message: 'boom' } });
    const { compras } = await renderReady();
    expect(within(compras).getByText(/No se pudieron cargar las compras del período/)).toBeInTheDocument();
    expect(within(compras).queryByText('$0')).not.toBeInTheDocument();
    expect(within(compras).queryByText('Total registrado en compras')).not.toBeInTheDocument();
  });
});

describe('COSTOS-UI-1: moneda del negocio', () => {
  it('usa business.currency en los montos de ambos paneles', async () => {
    business = { ...business, currency: 'USD' };
    getCostItemsMock.mockResolvedValue([
      { id: 'c1', type: 'fixed', category: 'rent', name: 'Rent', amount: 60 },
      { id: 'c2', type: 'fixed', category: 'utilities', name: 'Utilities', amount: 40 },
    ]);
    getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue({
      totals: {
        mercaderia: { net: 0, tax: 0, total: 50 },
        gasto_con_iva: { net: 0, tax: 0, total: 20 },
        gasto_sin_iva: { net: 0, tax: 0, total: 0 },
        other: { net: 0, tax: 0, total: 0 },
      },
      totalTaxCredit: 0,
      totalOperational: 20,
      totalAmountAll: 70,
      error: null,
    });
    const { costos, compras } = await renderReady();
    expect(within(costos).getByText('$100.00')).toBeInTheDocument();
    expect(within(compras).getByText('$70.00')).toBeInTheDocument();
    expect(within(compras).getByText('$50.00')).toBeInTheDocument();
    expect(within(compras).getByText('$20.00')).toBeInTheDocument();
  });
});

describe('COSTOS-UI-1: layout responsive', () => {
  it('mobile no pierde las acciones principales (agregar, cargar, ver termómetro, módulo completo)', async () => {
    const { costos, compras } = await renderReady();
    expect(screen.getByRole('button', { name: /Ver Termómetro/ })).toBeInTheDocument();
    expect(within(costos).getAllByRole('button', { name: /Agregar/ }).length).toBeGreaterThan(0);
    expect(within(compras).getByRole('button', { name: /Cargar/ })).toBeInTheDocument();
    expect(within(compras).getByRole('button', { name: /Ir al módulo completo de Compras/ })).toBeInTheDocument();
  });
});
