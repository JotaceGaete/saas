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
    { value: 'new_expense',          label: 'Gasto nuevo del día',                    helper: 'Esta salida se registrará como un nuevo gasto y afectará el resultado del día.' },
    { value: 'cost_payment',         label: 'Pago de costo o factura ya registrada',  helper: 'El dinero saldrá de caja, pero no se creará un nuevo gasto.' },
    { value: 'inventory_purchase',   label: 'Compra de mercadería',                   helper: 'Se registrará la salida de dinero sin descontarla como gasto operativo inmediato.' },
    { value: 'owner_withdrawal',     label: 'Retiro del dueño',                       helper: 'Se registrará la salida de caja sin afectar el resultado del negocio.' },
    { value: 'other_non_operating',  label: 'Otro movimiento',                        helper: 'Se registrará únicamente el movimiento de caja.' },
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
  getCrmInvoice: vi.fn(),
  getLocalDateString: () => '2026-09-13',
  getOpenCashSession: (...a) => getOpenCashSessionMock(...a),
  openCashSession: vi.fn(),
  reopenCashSession: vi.fn(),
  updateCrmPayment: vi.fn(),
  updateCashSession: vi.fn(),
  voidCashMovement: vi.fn(),
  voidCrmPayment: vi.fn(),
}));

import CrmCash from './CrmCash';

const openSession = {
  id: 'sess1', status: 'open', initial_amount: 0,
  opened_at: '2026-09-13T10:00:00Z', opened_by: 'user1',
  date: '2026-09-13', notes: null,
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
    createCashMovementMock, getCostItemsMock,
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

  it('nunca preselecciona "Gasto nuevo del día" -- el selector arranca vacío', async () => {
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

describe('CashMovementModal — "Pago de costo o factura ya registrada"', () => {
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

  it('para otros propósitos (p. ej. Gasto nuevo del día) NO muestra el selector de costo relacionado', async () => {
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

  it('CASO B (factura de proveedor ya registrada, sin costo relacionado): cost_payment sin related_cost_item_id envía igual, sin bloquear el envío', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '200000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Pago factura proveedor X' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'services' } });
    fireEvent.change(screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select'), { target: { value: 'cost_payment' } });

    // "Costo relacionado (opcional)" aparece, pero no se toca -- una
    // factura de proveedor ya registrada puede no tener vínculo directo
    // con crm_cost_items todavía.
    await screen.findByText('Costo relacionado (opcional)');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    const [, payload] = createCashMovementMock.mock.calls[0];
    expect(payload).toMatchObject({ movementPurpose: 'cost_payment', relatedCostItemId: null, category: 'services' });
  });
});

describe('CashMovementModal — categoría y propósito son cosas distintas (sección 6)', () => {
  it('Sueldos / Comisiones + "Pago de costo o factura ya registrada" -> no crea costo nuevo', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '600000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Pago sueldo Juan' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'salaries' } });
    fireEvent.change(screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select'), { target: { value: 'cost_payment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    expect(createCashMovementMock.mock.calls[0][1]).toMatchObject({ category: 'salaries', movementPurpose: 'cost_payment' });
  });

  it('Arriendo + "Pago de costo o factura ya registrada" -> no crea costo nuevo', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '450000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Pago arriendo' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'rent' } });
    fireEvent.change(screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select'), { target: { value: 'cost_payment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    expect(createCashMovementMock.mock.calls[0][1]).toMatchObject({ category: 'rent', movementPurpose: 'cost_payment' });
  });

  it('Servicios + "Gasto nuevo del día" -> SÍ afecta el resultado (movementPurpose=new_expense)', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '35000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Internet no presupuestado' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'services' } });
    fireEvent.change(screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select'), { target: { value: 'new_expense' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    expect(createCashMovementMock.mock.calls[0][1]).toMatchObject({ category: 'services', movementPurpose: 'new_expense' });
  });

  it('Servicios + "Pago de costo o factura ya registrada" -> NO afecta el resultado -- la MISMA categoría, distinto propósito', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '35000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Internet ya presupuestado' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'services' } });
    fireEvent.change(screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select'), { target: { value: 'cost_payment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    expect(createCashMovementMock.mock.calls[0][1]).toMatchObject({ category: 'services', movementPurpose: 'cost_payment' });
  });
});

describe('CashMovementModal — "Gasto nuevo del día" nunca se ofrece para categorías que por definición no son gasto', () => {
  it('Depósito bancario: no ofrece "Gasto nuevo del día" como opción', async () => {
    await openMovementModal();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'bank_deposit' } });
    const purposeSelect = screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select');
    expect(within(purposeSelect).queryByRole('option', { name: 'Gasto nuevo del día' })).not.toBeInTheDocument();
    // Las 4 opciones no generadoras de costo siguen disponibles.
    expect(within(purposeSelect).getByRole('option', { name: 'Pago de costo o factura ya registrada' })).toBeInTheDocument();
    expect(within(purposeSelect).getByRole('option', { name: 'Otro movimiento' })).toBeInTheDocument();
  });

  it('Retiro del dueño: no ofrece "Gasto nuevo del día" como opción', async () => {
    await openMovementModal();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'owner_withdrawal' } });
    const purposeSelect = screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select');
    expect(within(purposeSelect).queryByRole('option', { name: 'Gasto nuevo del día' })).not.toBeInTheDocument();
  });

  it('si el usuario tenía "Gasto nuevo del día" elegido y cambia a Depósito bancario, el propósito se limpia (no queda una combinación inválida en silencio)', async () => {
    await openMovementModal();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'services' } });
    const purposeSelect = screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select');
    fireEvent.change(purposeSelect, { target: { value: 'new_expense' } });
    expect(purposeSelect.value).toBe('new_expense');

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'bank_deposit' } });
    expect(purposeSelect.value).toBe('');
  });

  it('Depósito bancario nunca puede enviarse con movementPurpose=new_expense (imposible de seleccionar en la UI)', async () => {
    await openMovementModal();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '300000' } });
    fireEvent.change(screen.getByPlaceholderText(/Ej: Rollos térmicos/), { target: { value: 'Depósito banco' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'bank_deposit' } });
    fireEvent.change(screen.getByText('¿Qué tipo de salida es?').closest('div').querySelector('select'), { target: { value: 'other_non_operating' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar salida' }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    const [, payload] = createCashMovementMock.mock.calls[0];
    expect(payload.movementPurpose).not.toBe('new_expense');
    expect(payload).toMatchObject({ category: 'bank_deposit', movementPurpose: 'other_non_operating' });
  });
});
