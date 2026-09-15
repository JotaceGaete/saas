/**
 * CrmCostos.jsx — PROVEEDORES-CORE-4B: migración a la función canónica
 * getSupplierPurchaseTotalsForPeriod (services/supplierInvoiceService.js),
 * retirando el uso de crmService.getPurchaseTotalsForPeriod (crm_purchase_invoices).
 *
 * Rediseño UI/UX (dashboard financiero ancho): estos tests además cubren
 * que agregar/editar/eliminar un costo fijo, navegar de período y navegar
 * a Compras/Termómetro siguen funcionando igual que antes del rediseño --
 * solo cambió la presentación.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));

vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/PanelHeader', () => ({
  default: ({ title, subtitle, children, mobileActions }) => <div>{title}{subtitle}{children}{mobileActions}</div>,
}));

let business = { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null };

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ business }),
}));

vi.mock('config/planFeatures', () => ({ canUseFeature: () => true }));
vi.mock('services/waBusinessService', () => ({ getEffectivePlanSlug: () => 'business' }));

const getCostItemsMock = vi.fn();
const createCostItemMock = vi.fn();
const updateCostItemMock = vi.fn();
const deleteCostItemMock = vi.fn();
// legacy -- PROVEEDORES-CORE-4B: no debe volver a invocarse desde esta página
const getPurchaseTotalsForPeriodMock = vi.fn();
// TAX-SUMMARY-1 — Ventas + IVA del mes
const getSalesTaxSummaryForPeriodMock = vi.fn();

vi.mock('services/crmService', () => ({
  getCostItems: (...a) => getCostItemsMock(...a),
  createCostItem: (...a) => createCostItemMock(...a),
  updateCostItem: (...a) => updateCostItemMock(...a),
  deleteCostItem: (...a) => deleteCostItemMock(...a),
  getPurchaseTotalsForPeriod: (...a) => getPurchaseTotalsForPeriodMock(...a),
  getSalesTaxSummaryForPeriod: (...a) => getSalesTaxSummaryForPeriodMock(...a),
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

const FIXED_ITEM = { id: 'cost1', category: 'rent', name: 'Arriendo Local', amount: 400000, type: 'fixed', source: null };
// CAJA-COSTOS-1 — un ítem cash_outflow SIEMPRE es type='variable' (ver
// create_cash_movement_with_purpose/create_cash_movement_with_expense),
// nunca 'fixed'.
const CASH_ITEM = { id: 'cost2', category: 'utilities', name: 'Luz', amount: 60000, type: 'variable', source: 'cash_outflow' };

// TAX-SUMMARY-1 — mismos montos del reporte real que mandó el contador,
// para que el test cuadre exactamente con el caso que motivó el ticket.
const SALES_SUMMARY_OK = {
  boleta: 117000,
  factura: 23000,
  pagoElectronico: 269000,
  total: 409000,
  incompatibleCurrencyRows: 0,
  errors: { crm: null, catalog: null },
};
const SALES_SUMMARY_EMPTY = {
  boleta: 0, factura: 0, pagoElectronico: 0, total: 0,
  incompatibleCurrencyRows: 0, errors: { crm: null, catalog: null },
};

beforeEach(() => {
  navigateMock.mockReset();
  [getCostItemsMock, createCostItemMock, updateCostItemMock, deleteCostItemMock,
    getPurchaseTotalsForPeriodMock, getSupplierPurchaseTotalsForPeriodMock,
    getSalesTaxSummaryForPeriodMock].forEach((m) => m.mockReset());
  getCostItemsMock.mockResolvedValue([]);
  getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue(OK_TOTALS);
  getSalesTaxSummaryForPeriodMock.mockResolvedValue(SALES_SUMMARY_EMPTY);
  business = { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null };
});

afterEach(() => cleanup());

function renderPage() {
  return render(<CrmCostos />);
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

describe('Rediseño — hero financiero', () => {
  it('muestra el total del mes (fijos + compras) y el desglose', async () => {
    getCostItemsMock.mockResolvedValue([FIXED_ITEM]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Total costos del mes')).toBeInTheDocument());
    // total = 400.000 (fijos) + 50.000 (operacional) = 450.000
    expect(screen.getByText('$450.000')).toBeInTheDocument();
  });

  it('el botón "Ver Termómetro del Negocio" navega a /crm/cost-center', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Ver Termómetro del Negocio')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ver Termómetro del Negocio'));
    expect(navigateMock).toHaveBeenCalledWith('/crm/cost-center');
  });
});

describe('Rediseño — selector de período', () => {
  it('muestra el mes y año como un solo control legible (sin overlap)', async () => {
    renderPage();
    await waitFor(() => expect(getSupplierPurchaseTotalsForPeriodMock).toHaveBeenCalled());
    const now = new Date();
    const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    expect(screen.getAllByText(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`).length).toBeGreaterThan(0);
  });

  it('el botón "Mes siguiente" avanza el período y recarga costos/compras con el nuevo mes/año', async () => {
    renderPage();
    await waitFor(() => expect(getCostItemsMock).toHaveBeenCalledTimes(1));
    const now = new Date();
    let expectedMonth = now.getMonth() + 2;
    let expectedYear = now.getFullYear();
    if (expectedMonth > 12) { expectedMonth = 1; expectedYear += 1; }

    fireEvent.click(screen.getAllByLabelText('Mes siguiente')[0]);

    await waitFor(() => expect(getCostItemsMock).toHaveBeenCalledWith('biz1', expectedMonth, expectedYear));
    expect(getSupplierPurchaseTotalsForPeriodMock).toHaveBeenCalledWith('biz1', expect.any(String), expect.any(String));
  });

  it('el botón "Mes anterior" retrocede el período', async () => {
    renderPage();
    await waitFor(() => expect(getCostItemsMock).toHaveBeenCalledTimes(1));
    const now = new Date();
    let expectedMonth = now.getMonth();
    let expectedYear = now.getFullYear();
    if (expectedMonth < 1) { expectedMonth = 12; expectedYear -= 1; }

    fireEvent.click(screen.getAllByLabelText('Mes anterior')[0]);

    await waitFor(() => expect(getCostItemsMock).toHaveBeenCalledWith('biz1', expectedMonth, expectedYear));
  });
});

describe('Rediseño — costos fijos: agregar/editar/eliminar sigue funcionando', () => {
  it('agregar un costo abre el modal, y guardar llama a createCostItem con businessId/month/year/fields', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Costos fijos mensuales')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Agregar costo'));
    expect(screen.getByText('Agregar costo fijo')).toBeInTheDocument();

    const amountInput = screen.getByPlaceholderText('0');
    fireEvent.change(amountInput, { target: { value: '150000' } });
    fireEvent.click(screen.getByText('Agregar'));

    const now = new Date();
    await waitFor(() => expect(createCostItemMock).toHaveBeenCalledWith(
      'biz1', now.getMonth() + 1, now.getFullYear(),
      expect.objectContaining({ category: 'rent', amount: 150000 }),
    ));
  });

  it('editar un costo existente precarga el modal y llama a updateCostItem con su id', async () => {
    getCostItemsMock.mockResolvedValue([FIXED_ITEM]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Arriendo Local')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Editar Arriendo Local'));
    expect(screen.getByText('Editar costo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('400000')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('400000'), { target: { value: '420000' } });
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() => expect(updateCostItemMock).toHaveBeenCalledWith('cost1', expect.objectContaining({ amount: 420000 })));
  });

  it('eliminar requiere una segunda confirmación antes de llamar a deleteCostItem', async () => {
    getCostItemsMock.mockResolvedValue([FIXED_ITEM]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Arriendo Local')).toBeInTheDocument());

    const deleteButton = screen.getByLabelText('Eliminar Arriendo Local');
    fireEvent.click(deleteButton);
    expect(deleteCostItemMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Confirmar eliminar'));
    await waitFor(() => expect(deleteCostItemMock).toHaveBeenCalledWith('cost1'));
  });

  it('un costo con source: cash_outflow no muestra editar/eliminar (candado) y se identifica como "Desde caja"', async () => {
    getCostItemsMock.mockResolvedValue([CASH_ITEM]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Luz')).toBeInTheDocument());
    expect(screen.getByText('Desde caja')).toBeInTheDocument();
    expect(screen.queryByLabelText('Editar Luz')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Eliminar Luz')).not.toBeInTheDocument();
  });

  it('CAJA-COSTOS-1: el footer "Total costos fijos" suma SOLO type=fixed -- $400.000, nunca $460.000', async () => {
    getCostItemsMock.mockResolvedValue([FIXED_ITEM, CASH_ITEM]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Total costos fijos')).toBeInTheDocument());
    // 400.000 (FIXED_ITEM) -- CASH_ITEM (60.000, type='variable') NO debe sumarse aquí.
    // Puede repetirse en el hero (desglose "Costos fijos"), por eso se busca
    // específicamente en la fila del footer de la tarjeta.
    const footerLabel = screen.getByText('Total costos fijos');
    expect(within(footerLabel.parentElement.parentElement).getByText('$400.000')).toBeInTheDocument();
    expect(screen.queryByText('$460.000')).not.toBeInTheDocument();
    // El monto variable sigue visible (no se ocultan datos), solo excluido del total fijo.
    expect(screen.getByText(/No incluye \$60\.000 en gastos variables desde Caja/)).toBeInTheDocument();
    expect(screen.getByText('Luz')).toBeInTheDocument();
  });

  it('sin costos fijos, muestra un empty state en vez de una lista vacía', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Sin costos fijos registrados')).toBeInTheDocument());
    expect(screen.queryByText('Total costos fijos')).not.toBeInTheDocument();
  });
});

describe('Rediseño — compras y facturas: empty state y navegación', () => {
  it('sin compras, muestra un empty state con botón NO rojo (bg-blue-600) que navega a /proveedores', async () => {
    getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue(EMPTY_TOTALS);
    renderPage();
    await waitFor(() => expect(screen.getByText(/No has registrado compras o facturas en/i)).toBeInTheDocument());

    const cta = screen.getByText('Registrar compra o factura');
    expect(cta.closest('button').className).not.toMatch(/bg-red|bg-rose/);
    fireEvent.click(cta);
    expect(navigateMock).toHaveBeenCalledWith('/proveedores');
  });

  it('con compras, el botón dice "Ir a Compras y Facturas" y navega a /proveedores', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Ir a Compras y Facturas')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Ir a Compras y Facturas'));
    expect(navigateMock).toHaveBeenCalledWith('/proveedores');
  });

  it('con compras, muestra el total "Compras del mes" (totalAmountAll)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Compras del mes')).toBeInTheDocument());
    expect(screen.getByText('$150.000')).toBeInTheDocument();
  });
});

describe('Rediseño — layout ancho (sin columna angosta centrada)', () => {
  it('el contenido principal usa el grid de 3 columnas en desktop (xl:grid-cols-3)', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('Costos fijos mensuales')).toBeInTheDocument());
    expect(container.querySelector('.xl\\:grid-cols-3')).not.toBeNull();
    // el viejo layout comprimía todo en max-w-lg mx-auto -- no debe quedar rastro de eso
    expect(container.querySelector('.max-w-lg')).toBeNull();
  });
});

describe('OPERATING-CALENDAR-1 — costo fijo por día operativo (dentro del hero rediseñado)', () => {
  // Septiembre 2026 (mes actual en estas pruebas): 30 días calendario,
  // lunes-sábado -> 26 días operativos (4 domingos: 6, 13, 20, 27).
  const MON_SAT_SCHEDULE = {
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false,
  };

  it('sin costos fijos registrados, no muestra el bloque de costo fijo diario', async () => {
    renderPage();
    await waitFor(() => expect(getSupplierPurchaseTotalsForPeriodMock).toHaveBeenCalled());
    expect(screen.queryByText('Costo fijo por día operativo')).not.toBeInTheDocument();
  });

  it('sin operatingDays configurado (legacy), usa días calendario del mes -- nunca /20 -- y muestra el aviso de estimación', async () => {
    getCostItemsMock.mockResolvedValue([{ id: 'c1', category: 'rent', name: 'Arriendo', amount: 300000, type: 'fixed' }]);
    renderPage();
    expect(await screen.findByText('Costo fijo por día operativo')).toBeInTheDocument();
    expect(screen.queryByText('Costo fijo diario estimado')).not.toBeInTheDocument();
    expect(screen.getByText('Basado en 30 días operativos en Septiembre.')).toBeInTheDocument();
    expect(screen.getByText(/Estimación basada en todos los días del mes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configura tus días de operación' })).toBeInTheDocument();
  });

  it('con operatingDays configurado, usa días operativos (no calendario, no /20) y no muestra el aviso de estimación', async () => {
    business = { ...business, operatingDays: MON_SAT_SCHEDULE };
    getCostItemsMock.mockResolvedValue([{ id: 'c1', category: 'rent', name: 'Arriendo', amount: 26000, type: 'fixed' }]);
    renderPage();
    expect(await screen.findByText('Costo fijo por día operativo')).toBeInTheDocument();
    expect(screen.getByText('Basado en 26 días operativos en Septiembre.')).toBeInTheDocument();
    expect(screen.getByText('$1.000')).toBeInTheDocument();
    expect(screen.queryByText(/Estimación basada en todos los días del mes/)).not.toBeInTheDocument();
  });

  it('el botón "Configura tus días de operación" navega a /business-configuration?tab=operations', async () => {
    getCostItemsMock.mockResolvedValue([{ id: 'c1', category: 'rent', name: 'Arriendo', amount: 300000, type: 'fixed' }]);
    renderPage();
    const button = await screen.findByRole('button', { name: 'Configura tus días de operación' });
    fireEvent.click(button);
    expect(navigateMock).toHaveBeenCalledWith('/business-configuration?tab=operations');
  });
});

describe('CAJA-COSTOS-1 — CASO 6: un costo variable desde Caja no infla el costo fijo diario', () => {
  it('con fijos $900.000 (sueldo + arriendo) + 1 variable cash_outflow $40.000, el costo fijo diario se calcula sobre $900.000, no $940.000', async () => {
    getCostItemsMock.mockResolvedValue([
      { id: 'sueldo',   category: 'salaries', name: 'Sueldo Juan', amount: 600000, type: 'fixed' },
      { id: 'arriendo', category: 'rent',     name: 'Arriendo',    amount: 300000, type: 'fixed' },
      { id: 'reparacion', category: 'other', name: 'Reparación', amount: 40000, type: 'variable', source: 'cash_outflow' },
    ]);
    renderPage();

    // "Costos fijos mensuales" (footer de la tarjeta) = 900.000, nunca 940.000.
    const footerLabel = await screen.findByText('Total costos fijos');
    expect(within(footerLabel.parentElement.parentElement).getByText('$900.000')).toBeInTheDocument();
    expect(screen.queryByText('$940.000')).not.toBeInTheDocument();

    // Costo fijo por día operativo: 900.000 / 30 días calendario (septiembre 2026, sin operatingDays) = 30.000.
    expect(await screen.findByText('Costo fijo por día operativo')).toBeInTheDocument();
    expect(screen.getByText('$30.000')).toBeInTheDocument();

    // El gasto variable sigue visible en la lista de costos (no se ocultan datos).
    expect(screen.getByText('Reparación')).toBeInTheDocument();
  });
});

/**
 * TAX-SUMMARY-1 — tarjeta "Ventas e IVA del mes". IVA de ventas SIEMPRE
 * calculado (nunca persistido); IVA de compras es el dato real ya
 * capturado por getSupplierPurchaseTotalsForPeriod (totalTaxCredit), no
 * se recalcula acá.
 */
describe('TAX-SUMMARY-1 — tarjeta "Ventas e IVA del mes"', () => {
  it('llama a getSalesTaxSummaryForPeriod(businessId, month, year, currency) para el período visible', async () => {
    renderPage();
    await waitFor(() => expect(getSalesTaxSummaryForPeriodMock).toHaveBeenCalledWith(
      'biz1', expect.any(Number), expect.any(Number), 'CLP',
    ));
  });

  it('con datos reales del reporte del contador: muestra Ventas del mes y el desglose Factura/Boleta/Pago electrónico', async () => {
    getSalesTaxSummaryForPeriodMock.mockResolvedValue(SALES_SUMMARY_OK);
    renderPage();

    expect(await screen.findByText('Ventas e IVA del mes')).toBeInTheDocument();
    const card = screen.getByText('Ventas e IVA del mes').closest('div').parentElement.parentElement;
    expect(within(card).getByText('$409.000')).toBeInTheDocument(); // total ventas
    expect(within(card).getByText('Factura')).toBeInTheDocument();
    expect(within(card).getByText('$23.000')).toBeInTheDocument();
    expect(within(card).getByText('Boleta electrónica')).toBeInTheDocument();
    expect(within(card).getByText('$117.000')).toBeInTheDocument();
    expect(within(card).getByText('Pago electrónico')).toBeInTheDocument();
    expect(within(card).getByText('$269.000')).toBeInTheDocument();
  });

  it('muestra el IVA crédito de compras usando el dato REAL de getSupplierPurchaseTotalsForPeriod (totalTaxCredit), sin recalcularlo', async () => {
    getSalesTaxSummaryForPeriodMock.mockResolvedValue(SALES_SUMMARY_OK);
    getSupplierPurchaseTotalsForPeriodMock.mockResolvedValue({ ...OK_TOTALS, totalTaxCredit: 8000 });
    renderPage();

    expect(await screen.findByText(/IVA crédito \(compras registradas\)/)).toBeInTheDocument();
    const row = screen.getByText(/IVA crédito \(compras registradas\)/).closest('div');
    expect(within(row).getByText('$8.000')).toBeInTheDocument();
  });

  it('etiqueta el IVA de ventas como estimado, con la tasa del país (19% cuando no hay country_code, default Chile)', async () => {
    getSalesTaxSummaryForPeriodMock.mockResolvedValue(SALES_SUMMARY_OK);
    renderPage();
    expect(await screen.findByText(/IVA débito \(ventas, 19% estimado\)/)).toBeInTheDocument();
  });

  it('siempre muestra el aviso de que las cifras son referenciales, no un documento tributario oficial', async () => {
    getSalesTaxSummaryForPeriodMock.mockResolvedValue(SALES_SUMMARY_OK);
    renderPage();
    expect(await screen.findByText(/no reemplazan tu declaración de IVA ni documentos tributarios oficiales/i)).toBeInTheDocument();
  });

  it('sin ventas en el período, muestra el estado vacío en vez de $0 desglosados', async () => {
    getSalesTaxSummaryForPeriodMock.mockResolvedValue(SALES_SUMMARY_EMPTY);
    renderPage();
    expect(await screen.findByText(/No hay ventas registradas en/)).toBeInTheDocument();
    expect(screen.queryByText('Factura')).not.toBeInTheDocument();
  });

  it('si getSalesTaxSummaryForPeriod falla, avisa que las cifras pueden estar incompletas en vez de mostrar ceros silenciosos', async () => {
    getSalesTaxSummaryForPeriodMock.mockResolvedValue({
      boleta: 0, factura: 0, pagoElectronico: 0, total: 0, incompatibleCurrencyRows: 0,
      errors: { crm: { message: 'boom' }, catalog: null },
    });
    renderPage();
    expect(await screen.findByText(/No se pudieron cargar todas las ventas del período/)).toBeInTheDocument();
  });
});
