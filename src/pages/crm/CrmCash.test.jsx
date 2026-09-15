/**
 * CrmCash.jsx — modal "Registrar movimiento de caja" — CAJA-COSTOS-1.
 *
 * Cubre el selector de propósito que reemplaza al checkbox ambiguo
 * "Registrar también como gasto del negocio": las 5 opciones, su texto de
 * ayuda, el selector opcional de costo relacionado para "Pago de un costo
 * registrado", y el payload final enviado a createCashMovement.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { formatMoney } from 'utils/formatMoney';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/PanelHeader', () => ({ default: ({ title, subtitle }) => <div>{title}{subtitle}</div> }));
vi.mock('components/ui/CrmBreadcrumb', () => ({ default: () => <span /> }));
vi.mock('config/planFeatures', () => ({ canUseFeature: () => true }));
vi.mock('services/waBusinessService', () => ({ getEffectivePlanSlug: () => 'business' }));

const business = { id: 'biz1', currency: 'CLP', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null };
const user = { id: 'user1', email: 'owner@test.com' };
vi.mock('contexts/AuthContext', () => ({ useAuth: () => ({ business, user }) }));

const {
  PAYMENT_METHOD_LABELS, CASH_MOVEMENT_CATEGORIES_OUT, CASH_MOVEMENT_CATEGORIES_IN, CASH_MOVEMENT_PURPOSES,
} = vi.hoisted(() => ({
  PAYMENT_METHOD_LABELS: {
    cash: 'Efectivo', card: 'Tarjeta', bank_transfer: 'Transferencia', check: 'Cheque', credit: 'Cuenta corriente', other: 'Otro',
  },
  CASH_MOVEMENT_CATEGORIES_OUT: [
    { value: 'owner_withdrawal', label: 'Retiro del dueño',    isExpense: false },
    { value: 'bank_deposit',     label: 'Depósito bancario',    isExpense: false },
    { value: 'supplies',         label: 'Suministros',          isExpense: true },
    { value: 'utilities',        label: 'Servicios básicos',    isExpense: true },
    { value: 'rent',             label: 'Arriendo',             isExpense: true },
    { value: 'services',         label: 'Servicios',            isExpense: true },
    { value: 'taxes',            label: 'Impuestos',            isExpense: true },
    { value: 'salaries',         label: 'Sueldos / Comisiones', isExpense: true },
    { value: 'other_expense',    label: 'Otro gasto',           isExpense: true },
    { value: 'other',            label: 'Otro',                 isExpense: false },
  ],
  CASH_MOVEMENT_CATEGORIES_IN: [
    { value: 'cash_fund',  label: 'Fondo de caja adicional', isExpense: false },
    { value: 'correction', label: 'Corrección / Ajuste',     isExpense: false },
    { value: 'other',      label: 'Otro',                    isExpense: false },
  ],
  CASH_MOVEMENT_PURPOSES: [
    { value: 'new_expense',          label: 'Gasto del negocio',              helper: 'Esta salida también se registrará como un nuevo gasto.' },
    { value: 'cost_payment',         label: 'Pago de un costo registrado',    helper: 'El dinero saldrá de caja, pero no se creará un nuevo costo.' },
    { value: 'inventory_purchase',   label: 'Compra de mercadería',           helper: 'Se registrará la salida de dinero. La compra no se descontará como gasto operativo inmediato.' },
    { value: 'owner_withdrawal',     label: 'Retiro del dueño',               helper: 'Se registrará la salida de caja sin afectar el resultado del negocio.' },
    { value: 'other_non_operating',  label: 'Otro movimiento',                helper: 'Se registrará únicamente el movimiento de caja.' },
  ],
}));

const getOpenCashSessionMock = vi.fn();
const getCashSessionsForDateMock = vi.fn();
const getCashDayPaymentsMock = vi.fn();
const getCashDayMovementsMock = vi.fn();
const getCashRecentSessionsMock = vi.fn();
const getCashSessionPaymentsMock = vi.fn();
const getCashSessionMovementsMock = vi.fn();
const createCashMovementMock = vi.fn();
const getCostItemsMock = vi.fn();
const reopenCashSessionMock = vi.fn();
const updateCashSessionMock = vi.fn();
const getCrmInvoiceMock = vi.fn();
const getInvoicePaymentSummaryMock = vi.fn();

vi.mock('services/crmService', () => ({
  PAYMENT_METHOD_LABELS,
  CASH_MOVEMENT_CATEGORIES_OUT,
  CASH_MOVEMENT_CATEGORIES_IN,
  CASH_MOVEMENT_PURPOSES,
  getCashMovementCategoryLabel: (value) => [...CASH_MOVEMENT_CATEGORIES_OUT, ...CASH_MOVEMENT_CATEGORIES_IN].find(c => c.value === value)?.label ?? value,
  closeCashSession: vi.fn(),
  createCashMovement: (...a) => createCashMovementMock(...a),
  getCostItems: (...a) => getCostItemsMock(...a),
  getCashDayMovements: (...a) => getCashDayMovementsMock(...a),
  getCashDayPayments: (...a) => getCashDayPaymentsMock(...a),
  getCashSessionMovements: (...a) => getCashSessionMovementsMock(...a),
  getCashSessionPayments: (...a) => getCashSessionPaymentsMock(...a),
  getCashRecentSessions: (...a) => getCashRecentSessionsMock(...a),
  getCashSessionsForDate: (...a) => getCashSessionsForDateMock(...a),
  getCrmInvoice: (...a) => getCrmInvoiceMock(...a),
  getInvoicePaymentSummary: (...a) => getInvoicePaymentSummaryMock(...a),
  getLocalDateString: () => '2026-09-13',
  getOpenCashSession: (...a) => getOpenCashSessionMock(...a),
  openCashSession: vi.fn(),
  reopenCashSession: (...a) => reopenCashSessionMock(...a),
  updateCrmPayment: vi.fn(),
  updateCashSession: (...a) => updateCashSessionMock(...a),
  voidCashMovement: vi.fn(),
  voidCrmPayment: vi.fn(),
}));

// CASH-DETAIL-HISTORICAL-ACTIONS — "Reimprimir" reutiliza exactamente la
// misma infraestructura de impresión ya probada en CrmTerminal (printService
// + buildSaleReceipt + printerConfigStorage), mockeada acá solo para
// verificar que CrmCash la invoca con los datos correctos -- sin duplicar
// las pruebas de renderizado ESC/POS, que ya viven en sus propios archivos.
const printReceiptMock = vi.fn();
vi.mock('lib/printing/printService', () => ({
  printService: { printReceipt: (...a) => printReceiptMock(...a) },
}));

const buildSaleReceiptMock = vi.fn(() => ({ lines: [] }));
vi.mock('lib/printing/receipts/buildSaleReceipt', () => ({
  buildSaleReceipt: (...a) => buildSaleReceiptMock(...a),
}));

const readPrinterConfigMock = vi.fn();
vi.mock('lib/printing/printerConfigStorage', () => ({
  buildPrinterConfigKey: (businessId) => (businessId ? `walinka:printing:${businessId}` : null),
  readPrinterConfig: (...a) => readPrinterConfigMock(...a),
}));

import CrmCash from './CrmCash';

const openSession = {
  id: 'sess1', status: 'open', initial_amount: 0,
  opened_at: '2026-09-13T10:00:00Z', opened_by: 'user1',
  date: '2026-09-13', notes: null,
};

// CAJA-TURNOS-UI-REFRESH — caja cerrada de un día anterior, para probar la
// tabla de Historial de Cajas (horario, fecha sin duplicar, monto en negrita,
// acciones agrupadas en el menú "...").
const closedSession = {
  id: 'sess0', status: 'closed', initial_amount: 10000,
  opened_at: '2026-09-12T08:22:00Z', closed_at: '2026-09-12T17:17:00Z', opened_by: 'user1',
  date: '2026-09-12', notes: null,
};

const FIXED_COST_ITEMS = [
  { id: 'cost-sueldo', name: 'Sueldo Juan', amount: 600000, type: 'fixed', category: 'salaries' },
  { id: 'cost-arriendo', name: 'Arriendo', amount: 450000, type: 'fixed', category: 'rent' },
  { id: 'cost-reparacion', name: 'Reparación', amount: 40000, type: 'variable', category: 'other', source: 'cash_outflow' },
];

beforeEach(() => {
  [
    getOpenCashSessionMock, getCashSessionsForDateMock, getCashDayPaymentsMock, getCashDayMovementsMock,
    getCashRecentSessionsMock, getCashSessionPaymentsMock, getCashSessionMovementsMock,
    createCashMovementMock, getCostItemsMock, reopenCashSessionMock, updateCashSessionMock,
    getCrmInvoiceMock, getInvoicePaymentSummaryMock, printReceiptMock, buildSaleReceiptMock, readPrinterConfigMock,
  ].forEach(m => m.mockReset());

  getOpenCashSessionMock.mockResolvedValue({ data: openSession, error: null });
  getCashSessionsForDateMock.mockResolvedValue({ data: [openSession], error: null });
  getCashDayPaymentsMock.mockResolvedValue({ data: [], error: null });
  getCashDayMovementsMock.mockResolvedValue({ data: [], error: null });
  getCashRecentSessionsMock.mockResolvedValue({ data: [openSession], error: null });
  getCashSessionPaymentsMock.mockResolvedValue({ data: [], error: null });
  getCashSessionMovementsMock.mockResolvedValue({ data: [], error: null });
  createCashMovementMock.mockResolvedValue({ data: { movement_id: 'mv1', cost_item_id: null }, error: null });
  getCostItemsMock.mockResolvedValue(FIXED_COST_ITEMS);
  reopenCashSessionMock.mockResolvedValue({ data: { ...closedSession, status: 'open' }, error: null });
  updateCashSessionMock.mockResolvedValue({ data: closedSession, error: null });
  getCrmInvoiceMock.mockResolvedValue({ data: null, error: null });
  getInvoicePaymentSummaryMock.mockResolvedValue({ data: null, error: null });
  buildSaleReceiptMock.mockReturnValue({ lines: [] });
  readPrinterConfigMock.mockReturnValue({
    printerName: 'EPSON-TM-T20', paperWidthMm: 80, autoCut: true, printLogo: true,
    imageMode: 'bitImageEscStar', cutStrategyId: 'gs-v-modern', effectivePrintableWidthDots: null,
  });
});

afterEach(cleanup);

async function openMovementModal() {
  render(<CrmCash />);
  const trigger = await screen.findByRole('button', { name: /Registrar movimiento/i });
  fireEvent.click(trigger);
  return screen.findByText('Registrar movimiento de caja');
}

describe('CashMovementModal — selector de propósito (Salida)', () => {
  it('para Entrada, no muestra el selector de propósito', async () => {
    await openMovementModal();
    fireEvent.click(screen.getByRole('button', { name: 'Entrada' }));
    expect(screen.queryByText('¿Qué tipo de salida es?')).not.toBeInTheDocument();
  });

  it('para Salida (dirección por defecto), muestra el selector con las 5 opciones', async () => {
    await openMovementModal();
    expect(screen.getByText('¿Qué tipo de salida es?')).toBeInTheDocument();
    const purposeSelect = screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select');
    for (const purpose of CASH_MOVEMENT_PURPOSES) {
      expect(within(purposeSelect).getByRole('option', { name: purpose.label })).toBeInTheDocument();
    }
  });

  it('nunca preselecciona "Gasto del negocio" -- el selector arranca vacío', async () => {
    await openMovementModal();
    const select = screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select');
    expect(select.value).toBe('');
  });

  it.each(CASH_MOVEMENT_PURPOSES)('al elegir "$label" muestra su explicación en lenguaje simple', async ({ value, helper }) => {
    await openMovementModal();
    const select = screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select');
    fireEvent.change(select, { target: { value } });
    expect(screen.getByText(helper)).toBeInTheDocument();
  });

  it('no muestra jerga contable (movement_purpose, COGS, resultado económico, imputación contable)', async () => {
    await openMovementModal();
    for (const jargon of ['movement_purpose', 'COGS', 'resultado económico', 'imputación contable']) {
      expect(screen.queryByText(new RegExp(jargon, 'i'))).not.toBeInTheDocument();
    }
  });

  it('sin seleccionar propósito, no permite enviar el formulario', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '40000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Reparación' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'other_expense' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));
    expect(screen.getByText('Selecciona qué tipo de salida es.')).toBeInTheDocument();
    expect(createCashMovementMock).not.toHaveBeenCalled();
  });
});

describe('CashMovementModal — "Pago de un costo registrado"', () => {
  it('al elegir esta opción, muestra el selector de costo relacionado cargando solo type=fixed', async () => {
    await openMovementModal();
    const purposeSelect = screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select');
    fireEvent.change(purposeSelect, { target: { value: 'cost_payment' } });

    const relatedLabel = await screen.findByText('Costo relacionado (opcional)');
    const relatedSelect = relatedLabel.closest('div').querySelector('select');
    await waitFor(() => expect(getCostItemsMock).toHaveBeenCalledWith('biz1', expect.any(Number), expect.any(Number)));
    expect(await within(relatedSelect).findByRole('option', { name: /Sueldo Juan/ })).toBeInTheDocument();
    expect(within(relatedSelect).getByRole('option', { name: /Arriendo/ })).toBeInTheDocument();
    // El costo variable (source cash_outflow) no debe ofrecerse como "costo registrado" -- solo type='fixed'.
    expect(within(relatedSelect).queryByRole('option', { name: /Reparación/ })).not.toBeInTheDocument();
  });

  it('para otros propósitos (p. ej. Gasto del negocio) NO muestra el selector de costo relacionado', async () => {
    await openMovementModal();
    const purposeSelect = screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select');
    fireEvent.change(purposeSelect, { target: { value: 'new_expense' } });
    expect(screen.queryByText('Costo relacionado (opcional)')).not.toBeInTheDocument();
  });

  it('para "Compra de mercadería" NO ofrece crear un gasto ni el selector de costo relacionado', async () => {
    await openMovementModal();
    const purposeSelect = screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select');
    fireEvent.change(purposeSelect, { target: { value: 'inventory_purchase' } });
    expect(screen.queryByText('Costo relacionado (opcional)')).not.toBeInTheDocument();
    expect(screen.queryByText(/registrar también como gasto/i)).not.toBeInTheDocument();
  });
});

describe('CashMovementModal — payload enviado a createCashMovement', () => {
  it('CASO 1 (adelanto de sueldo): cost_payment + related_cost_item_id vinculado a Sueldo Juan, sin crear gasto nuevo', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '200000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Adelanto Juan' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'salaries' } });

    const purposeSelect = screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select');
    fireEvent.change(purposeSelect, { target: { value: 'cost_payment' } });
    const relatedSelect = await screen.findByText('Costo relacionado (opcional)');
    fireEvent.change(relatedSelect.closest('div').querySelector('select'), { target: { value: 'cost-sueldo' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    const [, payload] = createCashMovementMock.mock.calls[0];
    expect(payload).toMatchObject({
      direction: 'out',
      amount: 200000,
      category: 'salaries',
      movementPurpose: 'cost_payment',
      relatedCostItemId: 'cost-sueldo',
    });
  });

  it('CASO 2 (gasto nuevo): new_expense, sin costo relacionado', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '40000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Reparación' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'other_expense' } });
    fireEvent.change(screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select'), { target: { value: 'new_expense' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    const [, payload] = createCashMovementMock.mock.calls[0];
    expect(payload).toMatchObject({ movementPurpose: 'new_expense', relatedCostItemId: null });
  });

  it('CASO 3 (compra de mercadería): inventory_purchase, sin costo relacionado ni gasto', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '150000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Compra mercadería' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'supplies' } });
    fireEvent.change(screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select'), { target: { value: 'inventory_purchase' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    const [, payload] = createCashMovementMock.mock.calls[0];
    expect(payload).toMatchObject({ movementPurpose: 'inventory_purchase', relatedCostItemId: null });
  });

  it('CASO 4 (retiro del dueño): owner_withdrawal, sin costo relacionado ni gasto', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '100000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Retiro Juan' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'owner_withdrawal' } });
    fireEvent.change(screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select'), { target: { value: 'owner_withdrawal' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    const [, payload] = createCashMovementMock.mock.calls[0];
    expect(payload).toMatchObject({ movementPurpose: 'owner_withdrawal', relatedCostItemId: null });
  });
});

/**
 * CAJA-TURNOS-UI-REFRESH — rediseño visual de la pantalla de Caja: hero de
 * estado activo, panel de KPIs, tabs (Movimientos/Resumen/Historial) y tabla
 * de historial simplificada. Puramente presentacional: no cambia handlers,
 * cálculos ni el modal de movimiento (ya cubierto arriba).
 */
describe('CAJA-TURNOS-UI-REFRESH — hero, KPIs y tabs', () => {
  it('no expone código técnico de entorno en el frontend (banner de debug eliminado)', async () => {
    render(<CrmCash />);
    await screen.findByText('CAJA ABIERTA');
    expect(screen.queryByText(/PROD CAJA/)).not.toBeInTheDocument();
  });

  it('el hero muestra el badge "CAJA ABIERTA" cuando hay una caja abierta', async () => {
    render(<CrmCash />);
    expect(await screen.findByText('CAJA ABIERTA')).toBeInTheDocument();
  });

  it('sin caja abierta ni cerrada hoy, el badge indica "SIN CAJA ABIERTA HOY"', async () => {
    getOpenCashSessionMock.mockResolvedValue({ data: null, error: null });
    getCashSessionsForDateMock.mockResolvedValue({ data: [], error: null });
    getCashRecentSessionsMock.mockResolvedValue({ data: [], error: null });
    render(<CrmCash />);
    expect(await screen.findByText('SIN CAJA ABIERTA HOY')).toBeInTheDocument();
  });

  it('el panel de KPIs muestra las 4 tarjetas: Fondo inicial, Cobros de la caja, Salidas / Gastos, Saldo en caja', async () => {
    render(<CrmCash />);
    await screen.findByText('CAJA ABIERTA');
    expect(screen.getByText('Fondo inicial')).toBeInTheDocument();
    expect(screen.getByText('Cobros de la caja')).toBeInTheDocument();
    expect(screen.getByText('Salidas / Gastos')).toBeInTheDocument();
    expect(screen.getByText('Saldo en caja')).toBeInTheDocument();
  });

  it('las tabs muestran una sola sección a la vez -- Movimientos por defecto, Resumen al cambiar de tab', async () => {
    render(<CrmCash />);
    await screen.findByText('CAJA ABIERTA');
    expect(screen.queryByText(/Resumen del día — por método de pago/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Resumen del día/ }));
    expect(await screen.findByText(/Resumen del día — por método de pago/)).toBeInTheDocument();
    // Al cambiar de tab, la caja de "Movimientos" (única sección con "· Saldo:") deja de estar montada.
    expect(screen.queryByText(/· Saldo:/)).not.toBeInTheDocument();
  });

  it('el botón "Registrar movimiento / gasto" sigue abriendo el modal de movimiento', async () => {
    await openMovementModal();
    expect(screen.getByText('Registrar movimiento de caja')).toBeInTheDocument();
  });
});

describe('CAJA-TURNOS-UI-REFRESH — tabla de Historial de Cajas', () => {
  beforeEach(() => {
    getCashRecentSessionsMock.mockResolvedValue({ data: [openSession, closedSession], error: null });
  });

  async function openHistoryTab() {
    render(<CrmCash />);
    fireEvent.click(await screen.findByRole('button', { name: /Historial de cajas/ }));
    return screen.findByText(/12 de septiembre de 2026/i);
  }

  it('no duplica la fecha -- no muestra el tag crudo AAAA-MM-DD junto al formato largo', async () => {
    await openHistoryTab();
    expect(screen.queryByText('2026-09-12')).not.toBeInTheDocument();
  });

  it('muestra el horario del turno en texto tenue (formato "hh:mm a./p. m. - hh:mm a./p. m.")', async () => {
    await openHistoryTab();
    expect(screen.getByText(/08:22.*05:17/)).toBeInTheDocument();
  });

  it('muestra el saldo final en negrita', async () => {
    await openHistoryTab();
    const row = (await screen.findByText(/12 de septiembre de 2026/i)).closest('div').parentElement.parentElement;
    const amount = within(row).getByText(/\$/);
    expect(amount.className).toMatch(/font-black/);
  });

  it('deja "Ver detalle" como acción principal visible y agrupa Editar/Reabrir en un menú "..."', async () => {
    await openHistoryTab();

    expect(screen.getAllByRole('button', { name: 'Ver detalle' }).length).toBe(2);
    // Editar/Reabrir de cada fila no son botones sueltos -- viven dentro del menú "...".
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reabrir' })).not.toBeInTheDocument();

    const menuButtons = screen.getAllByRole('button', { name: 'Más acciones' });
    expect(menuButtons.length).toBe(2);

    // Fila de la caja cerrada (sess0, índice 1 en [openSession, closedSession]) -- ofrece "Reabrir".
    fireEvent.click(menuButtons[1]);
    expect(await screen.findByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reabrir' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Cerrar caja' })).not.toBeInTheDocument();
  });

  it('en la fila de una caja abierta, el menú "..." ofrece "Cerrar caja" en vez de "Reabrir"', async () => {
    await openHistoryTab();
    const menuButtons = screen.getAllByRole('button', { name: 'Más acciones' });
    fireEvent.click(menuButtons[0]);
    expect(await screen.findByRole('menuitem', { name: 'Cerrar caja' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Reabrir' })).not.toBeInTheDocument();
  });

  it('"Ver detalle" abre el modal de detalle de la caja seleccionada', async () => {
    await openHistoryTab();
    const detailButtons = screen.getAllByRole('button', { name: 'Ver detalle' });
    fireEvent.click(detailButtons[1]);
    expect(await screen.findByRole('button', { name: 'Cerrar detalle' })).toBeInTheDocument();
  });
});

/**
 * CASH-SESSION-DETAIL-MODAL — modal de detalle histórico de una caja
 * (CrmCash.jsx). Cubre exactamente lo pedido en la auditoría: selección
 * correcta de caja, apertura/cierre del modal, datos del turno seleccionado,
 * movimientos pertenecientes exclusivamente a ese turno, y aislamiento
 * respecto de la caja actualmente activa (currentSession).
 */
describe('CASH-SESSION-DETAIL-MODAL', () => {
  const CLOSED_PAYMENT = {
    id: 'pay-closed', amount: 8000, payment_method: 'card', reference: null,
    notes: 'Venta ayer', created_at: '2026-09-12T10:00:00Z', currency: 'CLP',
    voided_at: null, invoice_id: null,
  };
  const CLOSED_MOVEMENT_IN = {
    id: 'mv-closed', direction: 'in', amount: 2000, reason: 'Deposito ayer',
    category: 'cash_fund', notes: null, created_at: '2026-09-12T09:00:00Z', voided_at: null,
  };
  const OPEN_PAYMENT = {
    id: 'pay-open', amount: 5000, payment_method: 'cash', reference: null,
    notes: 'Venta hoy', created_at: '2026-09-13T11:00:00Z', currency: 'CLP',
    voided_at: null, invoice_id: null,
  };
  const OPEN_MOVEMENT_OUT = {
    id: 'mv-open', direction: 'out', amount: 1000, reason: 'Retiro hoy',
    category: 'owner_withdrawal', notes: null, created_at: '2026-09-13T12:00:00Z', voided_at: null,
  };

  beforeEach(() => {
    getCashRecentSessionsMock.mockResolvedValue({ data: [openSession, closedSession], error: null });
    // Cada sesión trae SUS PROPIOS pagos/movimientos -- exactamente lo que
    // hace CrmCash.jsx en producción (getCashSessionPayments/Movements por
    // session.id), para poder probar que el modal no los mezcla.
    getCashSessionPaymentsMock.mockImplementation((_bizId, session) => {
      if (session.id === 'sess0') return Promise.resolve({ data: [CLOSED_PAYMENT], error: null });
      if (session.id === 'sess1') return Promise.resolve({ data: [OPEN_PAYMENT], error: null });
      return Promise.resolve({ data: [], error: null });
    });
    getCashSessionMovementsMock.mockImplementation((_bizId, sessionId) => {
      if (sessionId === 'sess0') return Promise.resolve({ data: [CLOSED_MOVEMENT_IN], error: null });
      if (sessionId === 'sess1') return Promise.resolve({ data: [OPEN_MOVEMENT_OUT], error: null });
      return Promise.resolve({ data: [], error: null });
    });
  });

  // Devuelve el contenedor raíz del modal (no screen entero) -- el historial
  // de fondo sigue montado detrás del overlay y repite textos como
  // "Abierta"/"Cerrada" en sus propias filas, así que las aserciones de
  // cabecera/resumen se hacen con `within(modal)` para no ambigüar contra
  // esas filas ni contra el hero de la caja activa (que también puede
  // repetir el mismo turnLabel cuando la fila elegida es la caja abierta).
  async function openDetailFor(rowIndex) {
    render(<CrmCash />);
    fireEvent.click(await screen.findByRole('button', { name: /Historial de cajas/ }));
    await screen.findByText(/12 de septiembre de 2026/i);
    const detailButtons = screen.getAllByRole('button', { name: 'Ver detalle' });
    fireEvent.click(detailButtons[rowIndex]);
    const closeBtn = await screen.findByRole('button', { name: 'Cerrar detalle' });
    const modal = closeBtn.closest('.fixed');
    return { closeBtn, modal };
  }

  it('apertura y cierre: el modal se abre al hacer click en "Ver detalle" y se cierra con el botón X', async () => {
    const { closeBtn, modal } = await openDetailFor(1);
    expect(within(modal).getByText('Resumen')).toBeInTheDocument();
    fireEvent.click(closeBtn);
    await waitFor(() => expect(screen.queryByText('Resumen')).not.toBeInTheDocument());
  });

  it('también se cierra con el botón "Cerrar" del pie del modal', async () => {
    const { modal } = await openDetailFor(1);
    fireEvent.click(within(modal).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByText('Resumen')).not.toBeInTheDocument());
  });

  it('selección correcta de caja: "Ver detalle" en la fila de la caja CERRADA muestra los datos de esa caja (sess0), no los de la abierta', async () => {
    const { modal } = await openDetailFor(1); // fila 1 = closedSession (sess0)
    expect(within(modal).getByText(/^Caja #\d/)).toBeInTheDocument();
    expect(within(modal).getByText('Cerrada')).toBeInTheDocument();
  });

  it('selección correcta de caja: "Ver detalle" en la fila de la caja ABIERTA muestra los datos de esa caja (sess1), no los de la cerrada', async () => {
    const { modal } = await openDetailFor(0); // fila 0 = openSession (sess1)
    expect(within(modal).getByText(/^Caja #\d/)).toBeInTheDocument();
    expect(within(modal).getByText('Abierta')).toBeInTheDocument();
  });

  it('datos del turno seleccionado: cabecera muestra estado, fecha, responsable, apertura y cierre de esa caja puntual', async () => {
    const { modal } = await openDetailFor(1);
    expect(within(modal).getByText('Cerrada')).toBeInTheDocument();
    expect(within(modal).getByText(/12 de septiembre de 2026/i)).toBeInTheDocument();
    expect(within(modal).getByText('owner@test.com')).toBeInTheDocument(); // opened_by === user.id -> nombre/email del usuario actual
    expect(within(modal).getByText('08:22 a. m.')).toBeInTheDocument();
    expect(within(modal).getByText('05:17 p. m.')).toBeInTheDocument();
  });

  it('resumen: fondo inicial, cobros, entradas manuales, salidas y saldo final se calculan solo con los datos de esa caja', async () => {
    const { modal } = await openDetailFor(1); // closedSession: inicial 10000, +8000 cobros, +2000 entrada manual, saldo 20000
    // Se acota al bloque "Resumen" -- el mismo monto ($8.000) también aparece
    // en la tabla de movimientos de abajo, dentro del mismo modal.
    const summary = within(modal).getByText('Resumen').closest('div');
    expect(within(summary).getByText(formatMoney(10000, 'CLP'))).toBeInTheDocument();
    expect(within(summary).getByText(`+${formatMoney(8000, 'CLP')}`)).toBeInTheDocument();
    expect(within(summary).getByText(`+${formatMoney(2000, 'CLP')}`)).toBeInTheDocument();
    expect(within(summary).getByText('Saldo final')).toBeInTheDocument();
    expect(within(summary).getByText(formatMoney(20000, 'CLP'))).toBeInTheDocument();
  });

  it('sin diferencia de caja registrada en el modelo (cash_difference null), el modal no muestra un bloque de arqueo inventado', async () => {
    const { modal } = await openDetailFor(1);
    expect(within(modal).queryByText('Arqueo de cierre')).not.toBeInTheDocument();
    expect(within(modal).queryByText('Diferencia')).not.toBeInTheDocument();
  });

  it('movimientos pertenecientes exclusivamente al turno: el detalle de la caja cerrada muestra su propio pago/movimiento y NO los de la caja abierta', async () => {
    const { modal } = await openDetailFor(1); // closedSession
    expect(within(modal).getByText('Venta ayer')).toBeInTheDocument();
    expect(within(modal).getByText('Deposito ayer')).toBeInTheDocument();
    expect(within(modal).queryByText('Venta hoy')).not.toBeInTheDocument();
    expect(within(modal).queryByText('Retiro hoy')).not.toBeInTheDocument();
  });

  it('aislamiento respecto de la caja activa: el detalle de una caja cerrada no depende de currentSession ni mezcla sus datos', async () => {
    const { modal } = await openDetailFor(1); // closedSession -- currentSession sigue siendo openSession (sess1) de fondo
    // El resumen del modal (caja cerrada, fondo 10000) coexiste con el hero de
    // la caja activa (fondo 0, visible detrás del overlay) sin que ninguno
    // contamine al otro.
    expect(within(modal).getByText(formatMoney(10000, 'CLP'))).toBeInTheDocument();
    // El KPI "Cobros de la caja" del hero (de la caja activa, sess1) sigue
    // reflejando SU PROPIO cobro ($5.000), no el de la caja cerrada ($8.000).
    expect(screen.getByText(`+${formatMoney(5000, 'CLP')}`)).toBeInTheDocument();
    // El pago/movimiento de la caja activa (sess1) no se filtra al modal de sess0.
    expect(within(modal).queryByText('Venta hoy')).not.toBeInTheDocument();
    expect(within(modal).queryByText('Retiro hoy')).not.toBeInTheDocument();
  });

  it('en una caja todavía abierta, la etiqueta del saldo dice "esperado" en vez de "final"', async () => {
    const { modal } = await openDetailFor(0); // openSession sigue abierta
    expect(within(modal).getByText('Saldo esperado')).toBeInTheDocument();
    expect(within(modal).queryByText('Saldo final')).not.toBeInTheDocument();
  });

  it('el desglose por método de pago pertenece exclusivamente a la sesión seleccionada', async () => {
    const { modal } = await openDetailFor(1); // closedSession: CLOSED_PAYMENT es 'card' $8.000, nada en efectivo
    // "Tarjeta"/"Efectivo" también aparecen como detalle del pago en la tabla
    // de movimientos del mismo modal -- se acota al bloque del desglose.
    const breakdown = within(modal).getByText('Cobros por método de pago').closest('div');
    const cardRow = within(breakdown).getByText('Tarjeta').closest('div');
    expect(within(cardRow).getByText(formatMoney(8000, 'CLP'))).toBeInTheDocument();
    const cashRow = within(breakdown).getByText('Efectivo').closest('div');
    expect(within(cashRow).getByText(formatMoney(0, 'CLP'))).toBeInTheDocument();
  });

  it('abrir sucesivamente dos cajas distintas actualiza todos los datos del modal, sin dejar rastro de la anterior', async () => {
    render(<CrmCash />);
    fireEvent.click(await screen.findByRole('button', { name: /Historial de cajas/ }));
    await screen.findByText(/12 de septiembre de 2026/i);

    // 1) Abrir el detalle de la caja CERRADA (sess0).
    let detailButtons = screen.getAllByRole('button', { name: 'Ver detalle' });
    fireEvent.click(detailButtons[1]);
    let closeBtn = await screen.findByRole('button', { name: 'Cerrar detalle' });
    let modal = closeBtn.closest('.fixed');
    expect(within(modal).getByText('Venta ayer')).toBeInTheDocument();
    expect(within(modal).getByText(formatMoney(10000, 'CLP'))).toBeInTheDocument();

    // 2) Cerrarlo y abrir el detalle de la caja ABIERTA (sess1), sin recargar la página.
    fireEvent.click(closeBtn);
    await waitFor(() => expect(screen.queryByText('Resumen')).not.toBeInTheDocument());
    detailButtons = screen.getAllByRole('button', { name: 'Ver detalle' });
    fireEvent.click(detailButtons[0]);
    closeBtn = await screen.findByRole('button', { name: 'Cerrar detalle' });
    modal = closeBtn.closest('.fixed');

    // Los datos son 100% los de sess1 -- nada de sess0 sobrevive al cambio.
    expect(within(modal).getByText('Venta hoy')).toBeInTheDocument();
    expect(within(modal).queryByText('Venta ayer')).not.toBeInTheDocument();
    expect(within(modal).queryByText(formatMoney(10000, 'CLP'))).not.toBeInTheDocument();
  });

  it('cerrar el modal y volver a abrir el detalle de la MISMA caja no arrastra estado ni duplica el contenido', async () => {
    render(<CrmCash />);
    fireEvent.click(await screen.findByRole('button', { name: /Historial de cajas/ }));
    await screen.findByText(/12 de septiembre de 2026/i);

    let detailButtons = screen.getAllByRole('button', { name: 'Ver detalle' });
    fireEvent.click(detailButtons[1]);
    let closeBtn = await screen.findByRole('button', { name: 'Cerrar detalle' });
    fireEvent.click(closeBtn);
    await waitFor(() => expect(screen.queryByText('Resumen')).not.toBeInTheDocument());

    detailButtons = screen.getAllByRole('button', { name: 'Ver detalle' });
    fireEvent.click(detailButtons[1]);
    closeBtn = await screen.findByRole('button', { name: 'Cerrar detalle' });
    const modal = closeBtn.closest('.fixed');

    // Un solo modal montado, con los mismos datos correctos -- no quedaron
    // dos copias superpuestas del contenido anterior.
    expect(within(modal).getAllByText('Venta ayer').length).toBe(1);
    expect(within(modal).getByText(formatMoney(10000, 'CLP'))).toBeInTheDocument();
  });
});

/**
 * CASH-DETAIL-HISTORICAL-ACTIONS — una caja cerrada es histórica/auditable:
 * su detalle nunca debe permitir modificar un movimiento pasado. "Editar"/
 * "Anular" desaparecen por completo (no solo deshabilitados) y, para un
 * cobro con invoice_id real (la relación nunca se infiere del texto de
 * `reference`, p. ej. "TPV NV-0580"), se ofrecen "Ver venta" (navega a la
 * Nota de Venta real) y "Reimprimir" (reconstruye el comprobante ya emitido
 * reutilizando getCrmInvoice/getInvoicePaymentSummary + buildSaleReceipt/
 * printService, sin crear ninguna venta/pago/movimiento nuevo). Un
 * movimiento manual (o un pago sin invoice_id) no tiene ninguna acción
 * válida en este contexto.
 */
describe('CASH-DETAIL-HISTORICAL-ACTIONS — caja cerrada = histórica/auditable', () => {
  // CASH-DETAIL-REPRINT-SCOPE — invoice.source distingue si alguna vez
  // existió un comprobante real impreso (solo 'pos', vía crm_create_pos_sale
  // + CrmTerminal.jsx). "Ver venta" no depende del origen -- cualquier
  // invoice_id real navega a la Nota de Venta.
  const TPV_PAYMENT = {
    id: 'pay-tpv', amount: 12000, payment_method: 'card', reference: 'TPV NV-0580',
    notes: null, created_at: '2026-09-12T11:00:00Z', currency: 'CLP',
    voided_at: null, invoice_id: 'inv-580', invoice: { source: 'pos' },
  };
  const ABONO_PAYMENT_CRM_SOURCE = {
    id: 'pay-abono', amount: 3000, payment_method: 'cash', reference: 'Abono cuenta corriente',
    notes: null, created_at: '2026-09-12T08:45:00Z', currency: 'CLP',
    voided_at: null, invoice_id: 'inv-901', invoice: { source: 'crm' },
  };
  const MANUAL_PAYMENT_NO_INVOICE = {
    id: 'pay-manual', amount: 3000, payment_method: 'cash', reference: null,
    notes: 'Abono directo en caja', created_at: '2026-09-12T09:30:00Z', currency: 'CLP',
    voided_at: null, invoice_id: null,
  };
  const MANUAL_MOVEMENT_OUT = {
    id: 'mv-gasto', direction: 'out', amount: 5000, reason: 'Compra de insumos',
    category: 'supplies', notes: null, created_at: '2026-09-12T10:00:00Z', voided_at: null,
  };
  const INVOICE_580 = {
    id: 'inv-580', invoice_number: 580, subtotal: 12000, discount_amount: 0, total: 12000,
    notes: null, issue_date: '2026-09-12', source: 'pos',
    wa_customers: { id: 'cust1', name: 'Cliente TPV' },
    crm_invoice_items: [
      { id: 'item1', name: 'Producto A', description: null, unit_price: 12000, quantity: 1, sort_order: 1 },
    ],
  };
  const INVOICE_901_CRM_SOURCE = {
    id: 'inv-901', invoice_number: 901, subtotal: 3000, discount_amount: 0, total: 3000,
    notes: null, issue_date: '2026-09-10', source: 'crm',
    wa_customers: { id: 'cust2', name: 'Cliente cuenta corriente' },
    crm_invoice_items: [
      { id: 'item2', name: 'Servicio', description: null, unit_price: 3000, quantity: 1, sort_order: 1 },
    ],
  };

  beforeEach(() => {
    getCashRecentSessionsMock.mockResolvedValue({ data: [openSession, closedSession], error: null });
    getCashSessionPaymentsMock.mockImplementation((_bizId, session) => {
      if (session.id === 'sess0') return Promise.resolve({ data: [TPV_PAYMENT, ABONO_PAYMENT_CRM_SOURCE, MANUAL_PAYMENT_NO_INVOICE], error: null });
      return Promise.resolve({ data: [], error: null });
    });
    getCashSessionMovementsMock.mockImplementation((_bizId, sessionId) => {
      if (sessionId === 'sess0') return Promise.resolve({ data: [MANUAL_MOVEMENT_OUT], error: null });
      return Promise.resolve({ data: [], error: null });
    });
    getCrmInvoiceMock.mockImplementation((invoiceId) => {
      if (invoiceId === 'inv-901') return Promise.resolve({ data: INVOICE_901_CRM_SOURCE, error: null });
      return Promise.resolve({ data: INVOICE_580, error: null });
    });
    getInvoicePaymentSummaryMock.mockResolvedValue({
      data: {
        invoice: { id: 'inv-580', total: 12000 }, total: 12000, paid: 12000, pending: 0,
        status: 'pagada', payments: [{ amount: 12000, payment_method: 'card' }],
      },
      error: null,
    });
  });

  async function openClosedSessionDetail() {
    render(<CrmCash />);
    fireEvent.click(await screen.findByRole('button', { name: /Historial de cajas/ }));
    await screen.findByText(/12 de septiembre de 2026/i);
    const detailButtons = screen.getAllByRole('button', { name: 'Ver detalle' });
    fireEvent.click(detailButtons[1]); // fila 1 = closedSession (sess0)
    const closeBtn = await screen.findByRole('button', { name: 'Cerrar detalle' });
    const modal = closeBtn.closest('.fixed');
    return { modal, closeBtn };
  }

  it('no muestra "Editar" ni "Anular" (ni deshabilitado) para ningún movimiento del detalle histórico', async () => {
    const { modal } = await openClosedSessionDetail();
    await within(modal).findByText('TPV NV-0580');
    expect(within(modal).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(modal).queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument();
    expect(within(modal).queryByText('Anular')).not.toBeInTheDocument();
  });

  it('un cobro con invoice_id real (TPV, invoice.source === "pos") muestra "Ver venta" y "Reimprimir"', async () => {
    const { modal } = await openClosedSessionDetail();
    const row = (await within(modal).findByText('TPV NV-0580')).closest('tr');
    expect(within(row).getByRole('button', { name: 'Ver venta' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Reimprimir' })).toBeInTheDocument();
  });

  it('"Ver venta" navega usando el invoice_id real de la venta, no el texto de la referencia', async () => {
    const { modal } = await openClosedSessionDetail();
    const row = (await within(modal).findByText('TPV NV-0580')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Ver venta' }));
    expect(navigateMock).toHaveBeenCalledWith('/crm/facturas/inv-580');
  });

  it('un abono a cuenta corriente (invoice.source === "crm") muestra "Ver venta" pero NO "Reimprimir" -- nunca existió un comprobante original que reimprimir', async () => {
    const { modal } = await openClosedSessionDetail();
    const row = (await within(modal).findByText('Abono cuenta corriente')).closest('tr');
    expect(within(row).getByRole('button', { name: 'Ver venta' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Reimprimir' })).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Ver venta' }));
    expect(navigateMock).toHaveBeenCalledWith('/crm/facturas/inv-901');
  });

  it('un movimiento manual (o un pago sin invoice_id) no muestra ninguna acción en el detalle histórico', async () => {
    const { modal } = await openClosedSessionDetail();
    await within(modal).findByText('Compra de insumos');

    const manualPaymentRow = within(modal).getByText('Abono directo en caja').closest('tr');
    expect(within(manualPaymentRow).queryByRole('button')).not.toBeInTheDocument();

    const manualExpenseRow = within(modal).getByText('Compra de insumos').closest('tr');
    expect(within(manualExpenseRow).queryByRole('button')).not.toBeInTheDocument();
  });

  it('"Reimprimir" reconstruye el comprobante desde la venta guardada y solo imprime -- no crea ninguna venta/pago/movimiento nuevo', async () => {
    const { modal } = await openClosedSessionDetail();
    await within(modal).findByText('TPV NV-0580');
    fireEvent.click(within(modal).getByRole('button', { name: 'Reimprimir' }));

    await waitFor(() => expect(printReceiptMock).toHaveBeenCalledTimes(1));
    expect(getCrmInvoiceMock).toHaveBeenCalledWith('inv-580');
    expect(getInvoicePaymentSummaryMock).toHaveBeenCalledWith('inv-580');
    expect(buildSaleReceiptMock).toHaveBeenCalledTimes(1);
    const receiptArgs = buildSaleReceiptMock.mock.calls[0][0];
    expect(receiptArgs.sale).toBe(INVOICE_580);
    expect(receiptArgs.total).toBe(12000);
    expect(printReceiptMock).toHaveBeenCalledWith({ lines: [] }, { printerName: 'EPSON-TM-T20' });
    // Nunca crea un movimiento nuevo ni toca la caja.
    expect(createCashMovementMock).not.toHaveBeenCalled();
  });

  it('si no hay impresora configurada, "Reimprimir" muestra un aviso y no llama a printService', async () => {
    readPrinterConfigMock.mockReturnValue({
      printerName: null, paperWidthMm: 80, autoCut: true, printLogo: true,
      imageMode: 'bitImageEscStar', cutStrategyId: 'gs-v-modern', effectivePrintableWidthDots: null,
    });
    const { modal } = await openClosedSessionDetail();
    await within(modal).findByText('TPV NV-0580');
    fireEvent.click(within(modal).getByRole('button', { name: 'Reimprimir' }));

    expect(await within(modal).findByText(/No se pudo reimprimir el comprobante/)).toBeInTheDocument();
    expect(within(modal).getByText(/No hay una impresora configurada/)).toBeInTheDocument();
    expect(printReceiptMock).not.toHaveBeenCalled();
    expect(getCrmInvoiceMock).not.toHaveBeenCalled();
  });
});

/**
 * CASH-DETAIL-HISTORICAL-ACTIONS-REGRESSION — la pestaña "Movimientos" (caja
 * abierta operativa) nunca pasa `readOnly`: Editar/Anular siguen
 * funcionando exactamente igual que antes de este trabajo. Este trabajo
 * solo cambia el detalle histórico de una caja cerrada.
 */
describe('CASH-DETAIL-HISTORICAL-ACTIONS-REGRESSION — pestaña Movimientos sin cambios', () => {
  const OPEN_PAYMENT = {
    id: 'pay-open-reg', amount: 4000, payment_method: 'cash', reference: null,
    notes: 'Venta mostrador', created_at: '2026-09-13T09:00:00Z', currency: 'CLP',
    voided_at: null, invoice_id: 'inv-999',
  };

  beforeEach(() => {
    getCashSessionPaymentsMock.mockImplementation((_bizId, session) => {
      if (session.id === 'sess1') return Promise.resolve({ data: [OPEN_PAYMENT], error: null });
      return Promise.resolve({ data: [], error: null });
    });
  });

  it('un cobro de la caja abierta sigue mostrando "Editar" y "Anular" activo (no "Ver venta"/"Reimprimir")', async () => {
    render(<CrmCash />);
    const detailCell = await screen.findByText('Venta mostrador');
    // Se acota a la fila del movimiento: la tarjeta hero de la caja activa
    // también tiene su propio botón "Editar" (para editar la caja, no el
    // movimiento), fuera del alcance de este trabajo.
    const row = detailCell.closest('tr');
    expect(within(row).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Anular' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Ver venta' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Reimprimir' })).not.toBeInTheDocument();
  });
});

/**
 * CASH-SESSION-ROW-ACTIONS — confirma que "Editar" y "Reabrir" del menú
 * "..." siguen funcionando de verdad (llaman a los servicios reales), no
 * solo que el botón exista. Comportamiento sin cambios en este trabajo --
 * solo se agrega la prueba que faltaba.
 */
describe('CASH-SESSION-ROW-ACTIONS — Editar y Reabrir siguen funcionando', () => {
  beforeEach(() => {
    getCashRecentSessionsMock.mockResolvedValue({ data: [openSession, closedSession], error: null });
  });

  it('"Reabrir" en el menú "..." de una caja cerrada llama a reopenCashSession con su id', async () => {
    // handleReopen bloquea reabrir si ya hay OTRA caja abierta (regla real de
    // negocio) -- para probar que el llamado realmente ocurre, no debe haber
    // ninguna caja abierta en este escenario.
    getOpenCashSessionMock.mockResolvedValue({ data: null, error: null });
    render(<CrmCash />);
    fireEvent.click(await screen.findByRole('button', { name: /Historial de cajas/ }));
    await screen.findByText(/12 de septiembre de 2026/i);
    const menuButtons = screen.getAllByRole('button', { name: 'Más acciones' });
    fireEvent.click(menuButtons[1]); // fila de closedSession (sess0)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reabrir' }));
    await waitFor(() => expect(reopenCashSessionMock).toHaveBeenCalledWith('sess0'));
  });

  it('"Editar" en el menú "..." abre el formulario y guardar llama a updateCashSession con el id y los valores nuevos', async () => {
    render(<CrmCash />);
    fireEvent.click(await screen.findByRole('button', { name: /Historial de cajas/ }));
    await screen.findByText(/12 de septiembre de 2026/i);
    const menuButtons = screen.getAllByRole('button', { name: 'Más acciones' });
    fireEvent.click(menuButtons[1]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }));

    await screen.findByText('Editar caja');
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(updateCashSessionMock).toHaveBeenCalledWith(
      'sess0', expect.objectContaining({ initial_amount: 15000 }),
    ));
  });
});
