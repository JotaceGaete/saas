// TPV completo (CrmTerminal real, pointClient real) en una Preview: con Point
// REAL seleccionado, el cobro debe ir a la integración de Mercado Pago
// (crmService.mp-point-*), nunca al simulador. Aquí crmService es una
// grabadora: registra cada llamada y no hace red. Nadie cobra.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const BIZ = '85e80cd0-7242-492f-951d-b17893e84283';
const REAL_TERMINAL = 'NEWLAND_N950__N950NCB000000001';
const calls = [];
const rec = (name, result) => vi.fn(async (...args) => { calls.push({ name, args }); return typeof result === 'function' ? result(...args) : result; });

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ business: { id: BIZ, name: 'Negocio', currency: 'CLP', plan: 'pro' }, user: { id: 'u1' } }) }));
vi.mock('hooks/useMediaQuery', () => ({ useIsDesktop: () => true }));
vi.mock('components/ui/BusinessSidebar', () => ({ default: () => null }));
vi.mock('components/ui/PanelHeader', () => ({ default: () => null }));
vi.mock('components/ui/CrmBreadcrumb', () => ({ default: () => null }));
vi.mock('components/AppIcon', () => ({ default: () => null }));
vi.mock('../../services/waBusinessService', () => ({ getEffectivePlanSlug: () => 'pro' }));
vi.mock('../../config/planFeatures', () => ({ canUseFeature: () => true }));
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() }, from: vi.fn() } }));
vi.mock('../../services/crmService', () => ({
  getCrmCustomers: rec('getCrmCustomers', { data: [] }),
  getPosProducts: rec('getPosProducts', { data: [{ id: 'p1', name: 'Prueba Point', price: 1000, unit_price: 1000, show_in_pos: true, stock_actual: null }] }),
  getAllActiveProducts: rec('getAllActiveProducts', { data: [] }),
  createPosInvoice: rec('createPosInvoice', { data: null, error: { message: 'no usado' } }),
  getOpenCashSession: rec('getOpenCashSession', { data: { id: 'cash-1' } }),
  createCrmCustomer: rec('createCrmCustomer', { data: null }),
  holdPosSale: rec('holdPosSale', { data: null }),
  listHeldPosSales: rec('listHeldPosSales', { data: [] }),
  claimHeldPosSale: rec('claimHeldPosSale', { data: null }),
  releaseClaimedPosSale: rec('releaseClaimedPosSale', { data: null }),
  consumeClaimedPosSale: rec('consumeClaimedPosSale', { data: null }),
  discardHeldPosSale: rec('discardHeldPosSale', { data: null }),
  getSaleNumber: rec('getSaleNumber', 61),
  formatInvoiceNumber: (n) => `NV-${String(n).padStart(4, '0')}`,
  // Integración real de Mercado Pago Point (mp-point-*), grabada:
  startPointOauth: rec('startPointOauth', { data: null, error: null }),
  getPointConnection: rec('getPointConnection', { data: { connection: { provider_user_id: 'cuenta-real' } }, error: null }),
  disconnectPointConnection: rec('disconnectPointConnection', { data: null, error: null }),
  getPointTerminals: rec('getPointTerminals', { data: { terminals: [{ id: REAL_TERMINAL, pos_id: '1', store_id: '1', operating_mode: 'PDV' }] }, error: null }),
  getPointTerminalPreference: rec('getPointTerminalPreference', { data: { preference: { terminal_id: REAL_TERMINAL, verification_status: 'verified' } }, error: null }),
  selectPointTerminal: rec('selectPointTerminal', { data: null, error: null }),
  unlinkPointTerminal: rec('unlinkPointTerminal', { data: null, error: null }),
  verifyPointTerminal: rec('verifyPointTerminal', { data: null, error: null }),
  setupPointTerminal: rec('setupPointTerminal', { data: null, error: null }),
  createPointOrder: rec('createPointOrder', { data: { ok: true, operation_id: '11111111-1111-4111-8111-111111111111', status: 'at_terminal' }, error: null }),
  getPointOrder: rec('getPointOrder', { data: { ok: true, operation_id: '11111111-1111-4111-8111-111111111111', status: 'at_terminal' }, error: null }),
  cancelPointOrder: rec('cancelPointOrder', { data: null, error: null }),
}));

const { default: CrmTerminal } = await import('./CrmTerminal');
const pointNames = new Set(['getPointConnection', 'getPointTerminals', 'getPointTerminalPreference', 'createPointOrder', 'getPointOrder']);
const realPointCalls = () => calls.filter((c) => pointNames.has(c.name));

async function goToPayment() {
  render(<MemoryRouter><CrmTerminal /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Prueba Point'));
  const cobrar = await screen.findAllByRole('button', { name: /Cobrar/ });
  fireEvent.click(cobrar[0]);
  await screen.findByTestId('payment-method-picker');
}

async function goToPoint() {
  await goToPayment();
  fireEvent.click(screen.getByTestId('pay-point'));
  await screen.findByText('Mercado Pago Point');
}

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TPV en Preview: Point REAL usa Mercado Pago', () => {
  it('por defecto la Preview usa Point REAL: terminales y cobro van a Mercado Pago con el importe exacto', async () => {
    await goToPoint();
    expect(await screen.findByTestId('point-real-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('point-sim-banner')).toBeNull();
    await waitFor(() => expect(calls.some((c) => c.name === 'getPointTerminals')).toBe(true));
    expect((await screen.findAllByText(REAL_TERMINAL)).length).toBeGreaterThan(0);

    const send = await screen.findByRole('button', { name: /Enviar \$?1\.000 a la Point/ });
    await waitFor(() => expect(send).not.toBeDisabled());
    fireEvent.click(send);
    await waitFor(() => expect(calls.some((c) => c.name === 'createPointOrder')).toBe(true));
    const order = calls.find((c) => c.name === 'createPointOrder').args[0];
    expect(order.terminalId).toBe(REAL_TERMINAL);
    expect(order.items).toEqual([expect.objectContaining({ product_id: 'p1', unit_price: 1000, quantity: 1 })]);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('modo DEMO: rotulado como simulación, el botón no dice «a la Point» y no llama a Mercado Pago', async () => {
    await goToPoint();
    fireEvent.click(await screen.findByTestId('point-demo-enable'));
    expect(await screen.findByTestId('point-sim-banner')).toHaveTextContent(/MODO DEMO/);
    expect(screen.queryByTestId('point-real-banner')).toBeNull();
    calls.length = 0;
    const [demo] = await screen.findAllByRole('button', { name: /DEMO: simular cobro/ });
    expect(screen.queryByRole('button', { name: /a la Point$/ })).toBeNull();
    await waitFor(() => expect(demo).not.toBeDisabled());
    fireEvent.click(demo);
    await new Promise((r) => setTimeout(r, 50));
    expect(realPointCalls()).toHaveLength(0);
  });

  it('volver de DEMO a REAL usa otra vez Mercado Pago', async () => {
    await goToPoint();
    fireEvent.click(await screen.findByTestId('point-demo-enable'));
    await screen.findByTestId('point-sim-banner');
    calls.length = 0;
    fireEvent.click(await screen.findByTestId('point-real-enable'));
    expect(await screen.findByTestId('point-real-banner')).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.name === 'getPointTerminals')).toBe(true));
  });
});

describe('TPV — interfaz de cobro simplificada', () => {
  it('opciones principales: Point, Efectivo, Tarjeta externa y Transferencia; el resto en «Más medios»', async () => {
    await goToPayment();
    for (const key of ['point', 'cash', 'card', 'transfer']) expect(screen.getByTestId(`pay-${key}`)).toBeInTheDocument();
    expect(screen.queryByTestId('pay-check')).toBeNull();
    expect(screen.queryByTestId('pay-split')).toBeNull();
    fireEvent.click(screen.getByTestId('pay-more-toggle'));
    for (const key of ['check', 'mercado_pago', 'other', 'split']) expect(screen.getByTestId(`pay-${key}`)).toBeInTheDocument();
    expect(screen.getByTestId('pay-credit')).toBeInTheDocument();
  });

  it('efectivo por defecto: solo «Efectivo recibido» y vuelto; sin panel Point ni campos de tarjeta', async () => {
    await goToPayment();
    expect(screen.getByTestId('pay-cash')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Efectivo recibido')).toBeInTheDocument();
    expect(screen.queryByTestId('point-panel')).toBeNull();
    expect(screen.queryByTestId('card-details')).toBeNull();
    expect(realPointCalls().filter((c) => c.name === 'createPointOrder')).toHaveLength(0);
  });

  it('tarjeta externa: un botón, con Débito/Crédito para la contabilidad y la venta registrada con ese medio', async () => {
    await goToPayment();
    fireEvent.click(screen.getByTestId('pay-card'));
    const details = screen.getByTestId('card-details');
    expect(within(details).getByRole('radio', { name: 'Débito' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(details).getByRole('radio', { name: 'Crédito' }));
    expect(within(screen.getByTestId('card-details')).getByRole('radio', { name: 'Crédito' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText('Efectivo recibido')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar/ })[0]);
    await waitFor(() => expect(calls.some((c) => c.name === 'createPosInvoice')).toBe(true));
    const sale = calls.find((c) => c.name === 'createPosInvoice').args[1];
    expect(sale.payments).toEqual([expect.objectContaining({ method: 'credit_card', amount: 1000 })]);
  });

  it('transferencia: sin campos extra; se registra el total con bank_transfer', async () => {
    await goToPayment();
    fireEvent.click(screen.getByTestId('pay-transfer'));
    expect(screen.getByTestId('simple-method-details')).toHaveTextContent('Transferencia');
    expect(screen.queryByLabelText('Efectivo recibido')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar/ })[0]);
    await waitFor(() => expect(calls.some((c) => c.name === 'createPosInvoice')).toBe(true));
    expect(calls.find((c) => c.name === 'createPosInvoice').args[1].payments).toEqual([expect.objectContaining({ method: 'bank_transfer', amount: 1000 })]);
  });

  it('cuenta corriente: exige cliente registrado antes de confirmar', async () => {
    await goToPayment();
    fireEvent.click(screen.getByTestId('pay-credit'));
    expect(screen.getByTestId('credit-details')).toBeInTheDocument();
    expect(screen.getByLabelText('Cliente de la cuenta corriente')).toHaveValue('');
    expect(screen.queryAllByRole('button', { name: /Confirmar/ })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /Falta pagar/ })[0]).toBeDisabled();
    expect(calls.some((c) => c.name === 'createPosInvoice')).toBe(false);
  });

  it('Point con terminal lista: configuración colapsada (terminal activa + cambiar) y el cobro en la barra inferior', async () => {
    await goToPoint();
    const active = await screen.findByTestId('point-active-terminal');
    expect(active).toHaveTextContent(REAL_TERMINAL);
    expect(screen.queryByText('Cuenta Point conectada')).toBeNull();
    expect(screen.queryByText(/Actualizar/)).toBeNull();
    expect(screen.queryByTestId('payment-details')).toBeNull();
    const bar = screen.getByTestId('checkout-action-bar');
    expect(within(bar).getByRole('button', { name: /Enviar \$?1\.000 a la Point/ })).toBeInTheDocument();
    fireEvent.click(within(active).getByRole('button', { name: 'Cambiar terminal' }));
    expect(await screen.findByText('Cuenta Point conectada')).toBeInTheDocument();
    expect(screen.queryByTestId('point-active-terminal')).toBeNull();
  });
});
