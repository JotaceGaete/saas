/**
 * CrmCostCenter.jsx — PROVEEDORES-CORE-4B: migración a la función canónica
 * getSupplierPurchaseTotalsForPeriod/getSupplierInvoicesForPeriod
 * (services/supplierInvoiceService.js), retirando el uso de
 * crmService.getPurchaseTotalsForPeriod/getPurchaseInvoices (crm_purchase_invoices).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/PanelHeader', () => ({ default: ({ title, subtitle }) => <div>{title}{subtitle}</div> }));
vi.mock('components/business-status-avatar/BusinessStatusAvatar', () => ({ default: () => <div data-testid="avatar-stub" /> }));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null } }),
}));

vi.mock('config/planFeatures', () => ({ canUseFeature: () => true }));
vi.mock('services/waBusinessService', () => ({ getEffectivePlanSlug: () => 'business' }));

const getCostCenterMock = vi.fn();
const upsertCostCenterMock = vi.fn();
const getCostItemsMock = vi.fn();
const getCrmSalesTotalsForPeriodMock = vi.fn();
const getCrmDailySalesForPeriodMock = vi.fn();
// legacy -- PROVEEDORES-CORE-4B: no deben volver a invocarse desde esta página
const getPurchaseTotalsForPeriodMock = vi.fn();
const getPurchaseInvoicesMock = vi.fn();

vi.mock('services/crmService', () => ({
  getCostCenter: (...a) => getCostCenterMock(...a),
  upsertCostCenter: (...a) => upsertCostCenterMock(...a),
  getCostItems: (...a) => getCostItemsMock(...a),
  getCrmSalesTotalsForPeriod: (...a) => getCrmSalesTotalsForPeriodMock(...a),
  getCrmDailySalesForPeriod: (...a) => getCrmDailySalesForPeriodMock(...a),
  getPurchaseTotalsForPeriod: (...a) => getPurchaseTotalsForPeriodMock(...a),
  getPurchaseInvoices: (...a) => getPurchaseInvoicesMock(...a),
}));

const getSupplierPurchaseTotalsForPeriodMock = vi.fn();
const getSupplierInvoicesForPeriodMock = vi.fn();

vi.mock('services/supplierInvoiceService', () => ({
  getSupplierPurchaseTotalsForPeriod: (...a) => getSupplierPurchaseTotalsForPeriodMock(...a),
  getSupplierInvoicesForPeriod: (...a) => getSupplierInvoicesForPeriodMock(...a),
}));

import CrmCostCenter from './CrmCostCenter';

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
  [getCostCenterMock, upsertCostCenterMock, getCostItemsMock, getCrmSalesTotalsForPeriodMock,
    getCrmDailySalesForPeriodMock, getPurchaseTotalsForPeriodMock, getPurchaseInvoicesMock,
    getSupplierPurchaseTotalsForPeriodMock, getSupplierInvoicesForPeriodMock].forEach((m) => m.mockReset());

  getCostCenterMock.mockResolvedValue({ open_days: 22, vat_rate: 19 });
  getCostItemsMock.mockResolvedValue([]);
  getCrmSalesTotalsForPeriodMock.mockResolvedValue({ salesMonth: 200000, salesToday: 10000 });
  getCrmDailySalesForPeriodMock.mockResolvedValue({});
  getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue(OK_TOTALS);
  getSupplierInvoicesForPeriodMock.mockResolvedValue({ data: [], error: null });
});

afterEach(() => cleanup());

function renderPage() {
  return render(<MemoryRouter><CrmCostCenter /></MemoryRouter>);
}

describe('1. CrmCostCenter usa la función canónica de compras', () => {
  it('llama a getSupplierPurchaseTotalsForPeriod/getSupplierInvoicesForPeriod y nunca a las funciones legacy de crmService', async () => {
    renderPage();
    await waitFor(() => expect(getSupplierPurchaseTotalsForPeriodMock).toHaveBeenCalledWith('biz1', expect.any(String), expect.any(String)));
    expect(getSupplierInvoicesForPeriodMock).toHaveBeenCalledWith('biz1', expect.any(String), expect.any(String));
    expect(getPurchaseTotalsForPeriodMock).not.toHaveBeenCalled();
    expect(getPurchaseInvoicesMock).not.toHaveBeenCalled();
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
  it('muestra "Otros / Servicios" cuando other.total > 0, y Gastos sigue mostrando solo totalOperational', async () => {
    getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue({
      totals: {
        mercaderia: { net: 0, tax: 0, total: 0 },
        gasto_con_iva: { net: 0, tax: 0, total: 50000 },
        gasto_sin_iva: { net: 0, tax: 0, total: 0 },
        other: { net: 0, tax: 190000, total: 300000 },
      },
      totalTaxCredit: 8000,       // NO incluye el tax_amount de `other` (190000)
      totalOperational: 50000,    // NO incluye el total de `other` (300000)
      totalAmountAll: 350000,
      error: null,
    });
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/Otros \/ Servicios/i).length).toBeGreaterThan(0));
    // "Gastos" (ComprasWidget) refleja únicamente totalOperational, nunca el total de `other`.
    expect(screen.getByText(/Gastos:/i)).toBeInTheDocument();
  });

  it('no muestra la línea "Otros / Servicios" cuando other.total es 0', async () => {
    renderPage();
    await waitFor(() => expect(getSupplierPurchaseTotalsForPeriodMock).toHaveBeenCalled());
    expect(screen.queryByText(/Otros \/ Servicios/i)).not.toBeInTheDocument();
  });
});
