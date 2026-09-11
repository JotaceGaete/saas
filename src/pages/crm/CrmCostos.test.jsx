/**
 * CrmCostos.jsx — PROVEEDORES-CORE-4B: migración a la función canónica
 * getSupplierPurchaseTotalsForPeriod (services/supplierInvoiceService.js),
 * retirando el uso de crmService.getPurchaseTotalsForPeriod (crm_purchase_invoices).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/PanelHeader', () => ({ default: ({ title, subtitle }) => <div>{title}{subtitle}</div> }));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null } }),
}));

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

beforeEach(() => {
  [getCostItemsMock, createCostItemMock, updateCostItemMock, deleteCostItemMock,
    getPurchaseTotalsForPeriodMock, getSupplierPurchaseTotalsForPeriodMock].forEach((m) => m.mockReset());
  getCostItemsMock.mockResolvedValue([]);
  getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue(OK_TOTALS);
});

afterEach(() => cleanup());

function renderPage() {
  return render(<MemoryRouter><CrmCostos /></MemoryRouter>);
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
    getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue({
      totals: { mercaderia: { net: 0, tax: 0, total: 0 }, gasto_con_iva: { net: 0, tax: 0, total: 0 }, gasto_sin_iva: { net: 0, tax: 0, total: 0 }, other: { net: 0, tax: 0, total: 0 } },
      totalTaxCredit: 0, totalOperational: 0, totalAmountAll: 0,
      error: { message: 'boom' },
    });
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
