import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const navigateMock = vi.fn();
const getOperatingSalesMock = vi.fn();
const getOperatingCostsMock = vi.fn();
const getSupplierInvoicesMock = vi.fn();
let business = { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null };

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children, innerClassName }) => <main className={innerClassName}>{children}</main> }));
vi.mock('components/ui/PanelHeader', () => ({ default: ({ title, subtitle, children }) => <header>{title}{subtitle}{children}</header> }));
vi.mock('contexts/AuthContext', () => ({ useAuth: () => ({ business }) }));
vi.mock('config/planFeatures', () => ({ canUseFeature: () => true }));
vi.mock('services/waBusinessService', () => ({ getEffectivePlanSlug: () => 'business' }));
vi.mock('services/crmService', () => ({
  getOperatingSalesForPeriod: (...args) => getOperatingSalesMock(...args),
  getOperatingCostItemsForPeriod: (...args) => getOperatingCostsMock(...args),
}));
vi.mock('services/supplierInvoiceService', () => ({
  getSupplierInvoicesForPeriod: (...args) => getSupplierInvoicesMock(...args),
}));

import CrmCostCenter, { calculateOperatingSnapshot, classifyDailyResult, monetaryTolerance } from './CrmCostCenter';

const salesOk = {
  salesMonth: 300000, dailySales: { 1: 20000 }, crmTotal: 200000, catalogTotal: 100000,
  legacyCatalogRows: 0, incompatibleCurrencyRows: 0, errors: { crm: null, catalog: null },
};

beforeEach(() => {
  navigateMock.mockReset();
  business = { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null };
  getOperatingSalesMock.mockReset().mockResolvedValue(salesOk);
  getOperatingCostsMock.mockReset().mockResolvedValue({ data: [], error: null });
  getSupplierInvoicesMock.mockReset().mockResolvedValue({ data: [], error: null });
});
afterEach(cleanup);

describe('cálculo operativo', () => {
  const base = { month: 9, year: 2026, dailySales: { 5: 1000 } };

  it('separa costos fijos y variables', () => {
    const result = calculateOperatingSnapshot({ ...base, costItems: [
      { type: 'fixed', amount: 300 }, { type: 'variable', amount: 70, economicDate: '2026-09-05' },
    ] });
    expect(result.fixedCosts).toBe(300);
    expect(result.variableExpenses).toBe(70);
    expect(result.directExpenses).toBe(70);
    expect(result.daily(5)).toMatchObject({ sales: 1000, variable: 70, fixed: 10, result: 920 });
  });

  it('mercadería se muestra pero no reduce el resultado', () => {
    const result = calculateOperatingSnapshot({ ...base, purchases: [{ purchaseType: 'mercaderia', documentType: 'factura', totalAmount: 800, issueDate: '2026-09-05' }] });
    expect(result.merchandise).toBe(800);
    expect(result.directExpenses).toBe(0);
    expect(result.daily(5).result).toBe(1000);
  });

  it.each(['gasto_con_iva', 'gasto_sin_iva'])('%s reduce el resultado', purchaseType => {
    const result = calculateOperatingSnapshot({ ...base, purchases: [{ purchaseType, documentType: 'factura', totalAmount: 250, issueDate: '2026-09-05' }] });
    expect(result.supplierExpenses).toBe(250);
    expect(result.daily(5).result).toBe(750);
  });

  it('servicios, otros, NULL y notas de crédito quedan pendientes', () => {
    const purchases = [
      { purchaseType: 'servicio', documentType: 'factura', totalAmount: 10 },
      { purchaseType: 'otros', documentType: 'factura', totalAmount: 20 },
      { purchaseType: null, documentType: 'factura', totalAmount: 30 },
      { purchaseType: 'gasto_con_iva', documentType: 'nota_credito', totalAmount: 40 },
    ];
    const result = calculateOperatingSnapshot({ ...base, purchases });
    expect(result.pendingClassification).toBe(100);
    expect(result.supplierExpenses).toBe(0);
  });

  it('no suma pagos de proveedor ni movimientos de caja sin crm_cost_item', () => {
    const result = calculateOperatingSnapshot({ ...base, supplierPayments: [{ amount: 900 }], cashMovements: [{ amount: 700, isExpense: true }] });
    expect(result.fixedCosts).toBe(0);
    expect(result.directExpenses).toBe(0);
  });

  it('un gasto variable normal se cuenta una sola vez', () => {
    const result = calculateOperatingSnapshot({ ...base, costItems: [{ id: 'v1', type: 'variable', amount: 70, economicDate: '2026-09-05' }] });
    expect(result.variableExpenses).toBe(70);
    expect(result.directExpenses).toBe(70);
    expect(result.daily(5).variable).toBe(70);
  });

  it('una factura de proveedor y su pago reducen el resultado una sola vez', () => {
    const result = calculateOperatingSnapshot({
      ...base,
      purchases: [{ purchaseType: 'gasto_con_iva', documentType: 'factura', totalAmount: 250, issueDate: '2026-09-05' }],
      supplierPayments: [{ invoiceId: 'invoice-1', amount: 250 }],
    });
    expect(result.supplierExpenses).toBe(250);
    expect(result.directExpenses).toBe(250);
    expect(result.daily(5).result).toBe(750);
  });

  it('clasifica ganancia, equilibrio y pérdida con tolerancia monetaria', () => {
    expect(classifyDailyResult({ result: 2, tolerance: 1 })).toBe('winning');
    expect(classifyDailyResult({ result: 1, tolerance: 1 })).toBe('breaking');
    expect(classifyDailyResult({ result: -2, tolerance: 1 })).toBe('losing');
    expect(monetaryTolerance('CLP')).toBe(1);
    expect(monetaryTolerance('USD')).toBe(0.01);
  });

  it('día pasado sin ventas, sin gastos y sin costo fijo queda sin actividad', () => {
    expect(classifyDailyResult({ result: 0, tolerance: 1, future: false, calculable: true, hasData: false })).toBe('inactive');
  });

  it('día futuro nunca es "Sin datos", se marca como próximo', () => {
    expect(classifyDailyResult({ result: 100, tolerance: 1, future: true })).toBe('future');
    expect(classifyDailyResult({ result: 100, tolerance: 1, future: true, hasData: false })).toBe('future');
  });

  it('un error real de carga es "Sin datos"', () => {
    expect(classifyDailyResult({ result: 0, tolerance: 1, calculable: false })).toBe('nodata');
    expect(classifyDailyResult({ result: 0, tolerance: 1, calculable: false, hasData: false })).toBe('nodata');
  });

  it('día pasado sin ventas y con costo fijo es pérdida (rojo)', () => {
    const result = calculateOperatingSnapshot({ month: 9, year: 2026, dailySales: {}, costItems: [{ type: 'fixed', amount: 300 }] });
    expect(classifyDailyResult({ result: result.daily(2).result, tolerance: 1, hasData: true })).toBe('losing');
  });
});

describe('pantalla', () => {
  it('muestra los cuatro KPI, diseño amplio y fuentes CRM/TPV + catálogo', async () => {
    render(<CrmCostCenter />);
    const kpis = await screen.findByRole('region', { name: 'Indicadores del período' });
    for (const label of ['Ventas del mes', 'Costos fijos', 'Gastos directos', 'Resultado operativo estimado']) expect(within(kpis).getByText(label)).toBeInTheDocument();
    expect(within(kpis).getByText(/CRM\/TPV/)).toHaveTextContent('Catálogo');
    expect(screen.getByRole('main')).toHaveClass('lg:max-w-7xl');
    expect(kpis).toHaveClass('sm:grid-cols-2', 'xl:grid-cols-4');
  });

  it('usa business.currency al consultar y formatear', async () => {
    business = { ...business, currency: 'USD' };
    render(<CrmCostCenter />);
    await waitFor(() => expect(getOperatingSalesMock).toHaveBeenCalledWith('biz1', expect.any(Number), expect.any(Number), 'USD'));
    expect(screen.getAllByText(/\$300,000\.00/).length).toBeGreaterThan(0);
  });

  it('acciones superiores reutilizan Costos y Proveedores', async () => {
    render(<CrmCostCenter />); await screen.findByRole('region', { name: 'Indicadores del período' });
    fireEvent.click(screen.getByText('Configurar costos fijos'));
    fireEvent.click(screen.getByText('Registrar gasto / compra'));
    expect(navigateMock.mock.calls).toEqual([['/crm/costos'], ['/proveedores']]);
  });

  it('el detalle diario muestra los cinco componentes', async () => {
    getOperatingCostsMock.mockResolvedValue({ data: [{ type: 'fixed', amount: 31000 }], error: null });
    render(<CrmCostCenter />);
    fireEvent.click(await screen.findByRole('button', { name: /1: Rentable/ }));
    for (const label of ['Ventas', 'Gastos directos de proveedor', 'Otros gastos variables', 'Costo fijo prorrateado', 'Resultado operativo estimado']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it('un error de ventas muestra No disponible y no un cero real', async () => {
    getOperatingSalesMock.mockResolvedValue({ ...salesOk, salesMonth: 0, errors: { crm: { message: 'boom' }, catalog: null } });
    render(<CrmCostCenter />);
    expect(await screen.findByText('No se pudieron cargar las ventas CRM/TPV.')).toBeInTheDocument();
    const kpis = screen.getByRole('region', { name: 'Indicadores del período' });
    expect(within(kpis).getAllByText('No disponible').length).toBeGreaterThanOrEqual(2);
  });

  it('una moneda incompatible se excluye y deja el resultado sin calcular', async () => {
    getOperatingSalesMock.mockResolvedValue({ ...salesOk, incompatibleCurrencyRows: 1 });
    getOperatingCostsMock.mockResolvedValue({ data: [{ type: 'fixed', amount: 300 }], error: null });
    getSupplierInvoicesMock.mockResolvedValue({ data: [{ purchaseType: 'gasto_sin_iva', documentType: 'factura', totalAmount: 20, issueDate: '2026-09-01' }], error: null });
    render(<CrmCostCenter />);
    expect(await screen.findByText(/moneda distinta/)).toBeInTheDocument();
    expect(screen.getByText(/resultado queda sin calcular/)).toBeInTheDocument();
    const kpis = screen.getByRole('region', { name: 'Indicadores del período' });
    expect(within(kpis).getByText('$300')).toBeInTheDocument();
    expect(within(kpis).getByText('$20')).toBeInTheDocument();
    expect(within(kpis).getAllByText('No disponible')).toHaveLength(2);
  });

  it('un error real de carga marca el resultado del período como "Sin datos"', async () => {
    getOperatingSalesMock.mockResolvedValue({ ...salesOk, salesMonth: 0, errors: { crm: { message: 'boom' }, catalog: null } });
    render(<CrmCostCenter />);
    await screen.findByText('No se pudieron cargar las ventas CRM/TPV.');
    const kpis = screen.getByRole('region', { name: 'Indicadores del período' });
    expect(within(kpis).getByText('Sin datos')).toBeInTheDocument();
  });

  it('un día pasado sin ventas, gastos ni costo fijo se marca "Sin actividad"', async () => {
    render(<CrmCostCenter />);
    await screen.findByRole('region', { name: 'Indicadores del período' });
    expect(await screen.findByRole('button', { name: '2: Sin actividad' })).toBeInTheDocument();
  });

  it('un día futuro nunca se marca "Sin datos": se marca "Próximo" y queda deshabilitado', async () => {
    render(<CrmCostCenter />);
    await screen.findByRole('region', { name: 'Indicadores del período' });
    const futureButtons = screen.getAllByRole('button', { name: /: Próximo$/ });
    expect(futureButtons.length).toBeGreaterThan(0);
    expect(futureButtons[0]).toBeDisabled();
    expect(screen.queryAllByRole('button', { name: /: Sin datos$/ })).toHaveLength(0);
  });

  it('con costo fijo, un día pasado sin ventas queda en rojo (bajo equilibrio)', async () => {
    getOperatingCostsMock.mockResolvedValue({ data: [{ type: 'fixed', amount: 3000 }], error: null });
    render(<CrmCostCenter />);
    const button = await screen.findByRole('button', { name: '2: Bajo equilibrio' });
    expect(button.className).toMatch(/border-rose/);
  });

  it('con ventas y cero costos registrados, el KPI advierte en vez de mostrar sólo "Rentable"', async () => {
    render(<CrmCostCenter />);
    const kpis = await screen.findByRole('region', { name: 'Indicadores del período' });
    expect(within(kpis).getByText('Sin costos registrados este mes')).toBeInTheDocument();
    expect(within(kpis).queryByText('Rentable')).not.toBeInTheDocument();
    expect(within(kpis).getByText(/\+\$300\.000/)).toBeInTheDocument();
  });

  it('con ventas, costos registrados y resultado positivo, el KPI muestra "Rentable"', async () => {
    getOperatingCostsMock.mockResolvedValue({ data: [{ type: 'fixed', amount: 1000 }], error: null });
    render(<CrmCostCenter />);
    const kpis = await screen.findByRole('region', { name: 'Indicadores del período' });
    expect(within(kpis).getByText('Rentable')).toBeInTheDocument();
    expect(within(kpis).queryByText('Sin costos registrados este mes')).not.toBeInTheDocument();
  });
});
