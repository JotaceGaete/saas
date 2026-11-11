// P0 (11-11-2026): una falla de Mercado Pago Point no puede bloquear la caja.
//
// TPV real (CrmTerminal + pointClient real) con crmService como grabadora
// controlable: cada llamada mp-point-* puede quedar sin respuesta, fallar o
// responder tarde. Nadie cobra ni emite.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const BIZ = '85e80cd0-7242-492f-951d-b17893e84283';
const TERMINAL = 'NEWLAND_N950__N950NCB000000001';
const OP = '11111111-1111-4111-8111-111111111111';
const calls = [];
const handlers = {};
const rec = (name, fallback) => vi.fn(async (...args) => {
  calls.push({ name, args });
  const h = handlers[name];
  if (h) return h(...args);
  return typeof fallback === 'function' ? fallback(...args) : fallback;
});
const never = () => new Promise(() => {});

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ business: { id: BIZ, name: 'Negocio', currency: 'CLP', plan: 'pro' }, user: { id: 'u1' } }) }));
vi.mock('hooks/useMediaQuery', () => ({ useIsDesktop: () => true }));
vi.mock('components/ui/BusinessSidebar', () => ({ default: () => null }));
vi.mock('components/ui/PanelHeader', () => ({ default: () => null }));
vi.mock('components/ui/CrmBreadcrumb', () => ({ default: () => null }));
vi.mock('components/AppIcon', () => ({ default: () => null }));
vi.mock('../../services/waBusinessService', () => ({ getEffectivePlanSlug: () => 'pro' }));
vi.mock('../../config/planFeatures', () => ({ canUseFeature: () => true }));
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() }, from: vi.fn() } }));
vi.mock('../../services/fiscalAutoMode', () => ({ FISCAL_AUTO_MODE: 'live', isPreviewLike: () => true, resolveFiscalAutoMode: () => 'live' }));
vi.mock('./components/TpvFiscalAutoBoleta', () => ({ default: () => null }));
vi.mock('../../services/crmService', () => ({
  getCrmCustomers: rec('getCrmCustomers', { data: [] }),
  getPosProducts: rec('getPosProducts', { data: [{ id: 'p1', name: 'Prueba Point', price: 1000, unit_price: 1000, show_in_pos: true, stock_actual: null }] }),
  getAllActiveProducts: rec('getAllActiveProducts', { data: [] }),
  createPosInvoice: rec('createPosInvoice', () => ({ data: { id: `cash-${calls.filter((c) => c.name === 'createPosInvoice').length}`, invoice_number: 200 }, error: null })),
  getOpenCashSession: rec('getOpenCashSession', { data: { id: 'cash-1' } }),
  createCrmCustomer: rec('createCrmCustomer', { data: null }),
  holdPosSale: rec('holdPosSale', { data: null }),
  listHeldPosSales: rec('listHeldPosSales', { data: [] }),
  claimHeldPosSale: rec('claimHeldPosSale', { data: null }),
  releaseClaimedPosSale: rec('releaseClaimedPosSale', { data: null }),
  consumeClaimedPosSale: rec('consumeClaimedPosSale', { data: null }),
  discardHeldPosSale: rec('discardHeldPosSale', { data: null }),
  getSaleNumber: rec('getSaleNumber', 77),
  formatInvoiceNumber: (n) => `NV-${String(n).padStart(4, '0')}`,
  startPointOauth: rec('startPointOauth', { data: null, error: null }),
  getPointConnection: rec('getPointConnection', { data: { connection: { provider_user_id: 'cuenta' } }, error: null }),
  disconnectPointConnection: rec('disconnectPointConnection', { data: null, error: null }),
  getPointTerminals: rec('getPointTerminals', { data: { terminals: [{ id: TERMINAL, pos_id: '1', store_id: '1', operating_mode: 'PDV' }] }, error: null }),
  getPointTerminalPreference: rec('getPointTerminalPreference', { data: { preference: { terminal_id: TERMINAL, verification_status: 'verified' } }, error: null }),
  selectPointTerminal: rec('selectPointTerminal', { data: null, error: null }),
  unlinkPointTerminal: rec('unlinkPointTerminal', { data: null, error: null }),
  verifyPointTerminal: rec('verifyPointTerminal', { data: null, error: null }),
  setupPointTerminal: rec('setupPointTerminal', { data: null, error: null }),
  createPointOrder: rec('createPointOrder', { data: { ok: true, operation_id: OP, status: 'at_terminal' }, error: null }),
  getPointOrder: rec('getPointOrder', { data: { ok: true, operation_id: OP, status: 'at_terminal' }, error: null }),
  cancelPointOrder: rec('cancelPointOrder', { data: null, error: null }),
}));

const { default: CrmTerminal } = await import('./CrmTerminal');
const named = (name) => calls.filter((c) => c.name === name);

async function startPointCharge() {
  fireEvent.click(await screen.findByText('Prueba Point'));
  fireEvent.click((await screen.findAllByRole('button', { name: /Cobrar/ }))[0]);
  await screen.findByTestId('payment-method-picker');
  fireEvent.click(screen.getByTestId('pay-point'));
  const send = await screen.findByRole('button', { name: /Enviar \$?1\.000 a la Point/ });
  await waitFor(() => expect(send).not.toBeDisabled());
  return send;
}

async function payCashNow() {
  fireEvent.click(await screen.findByText('Prueba Point'));
  fireEvent.click((await screen.findAllByRole('button', { name: /Cobrar/ }))[0]);
  await screen.findByTestId('payment-method-picker');
  fireEvent.click(screen.getByTestId('pay-cash'));
  const before = named('createPosInvoice').length;
  fireEvent.click(screen.getAllByRole('button', { name: /Confirmar/ })[0]);
  await waitFor(() => expect(named('createPosInvoice')).toHaveLength(before + 1));
  return named('createPosInvoice')[before].args[1];
}

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(handlers)) delete handlers[k];
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<MemoryRouter><CrmTerminal /></MemoryRouter>);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TPV — Point no bloquea la caja', () => {
  it('1. pago aprobado normalmente: la venta del servidor abre el ticket, sin crear otra', async () => {
    handlers.getPointOrder = () => ({ data: { ok: true, operation_id: OP, status: 'processed', invoice_id: 'sale-pt', sale: { id: 'sale-pt', invoice_number: 77 } }, error: null });
    fireEvent.click(await startPointCharge());
    await screen.findByRole('button', { name: 'Cerrar' });
    expect(named('createPointOrder')).toHaveLength(1);
    expect(named('createPosInvoice')).toHaveLength(0);
  });

  it('2/3/10. Point desconectada o Mercado Pago sin respuesta: se puede dejar pendiente y vender en efectivo', async () => {
    handlers.getPointOrder = never;
    fireEvent.click(await startPointCharge());
    const park = await screen.findByTestId('point-park');
    expect(screen.getByTestId('point-wait-status')).toHaveTextContent(/0:0\d/);
    fireEvent.click(park);
    const banner = await screen.findByTestId('point-parked-banner');
    expect(within(banner).getAllByTestId('point-parked-item')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(`walinka:point-parked:${BIZ}`))[0]).toMatchObject({ operation_id: OP, amount: 1000 });
    expect(localStorage.getItem(`walinka:point-active:${BIZ}`)).toBeNull();
    // La caja sigue: otra venta en efectivo, con su propia clave.
    const cash = await payCashNow();
    const pointSaleKey = named('createPointOrder')[0].args[0].saleIdempotencyKey;
    expect(cash.idempotencyKey).not.toBe(pointSaleKey);
    expect(named('createPointOrder')).toHaveLength(1);
  });

  it('4. cancelar mientras se espera: la cancelación sin respuesta no bloquea; se puede dejar pendiente', async () => {
    handlers.getPointOrder = never;
    handlers.cancelPointOrder = never;
    fireEvent.click(await startPointCharge());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar cobro' }));
    expect(await screen.findByText(/Cancelando en la Point/)).toBeInTheDocument();
    const park = screen.getByTestId('point-park');
    expect(park).not.toBeDisabled();
    fireEvent.click(park);
    await screen.findByTestId('point-parked-banner');
    // No se interpretó como cancelado: la operación sigue por verificar.
    expect(screen.getByTestId('point-notice')).toHaveTextContent(/pendiente de verificación/);
  });

  it('5. cancelación remota fallida: se conserva la operación y se avisa', async () => {
    handlers.getPointOrder = never;
    handlers.cancelPointOrder = () => ({ data: null, error: { message: 'MP_GET_FAILED', reason: 'MP_GET_FAILED' } });
    fireEvent.click(await startPointCharge());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar cobro' }));
    expect(await screen.findByText('MP_GET_FAILED')).toBeInTheDocument();
    expect(screen.getByTestId('point-park')).toBeInTheDocument();
    expect(localStorage.getItem(`walinka:point-active:${BIZ}`)).toBe(OP);
  });

  it('6/9/12. aprobado después de dejarlo pendiente: se informa la venta del servidor y su boleta queda por emitir; nada se duplica', async () => {
    handlers.getPointOrder = never;
    fireEvent.click(await startPointCharge());
    fireEvent.click(await screen.findByTestId('point-park'));
    await screen.findByTestId('point-parked-banner');
    handlers.getPointOrder = () => ({ data: { ok: true, operation_id: OP, status: 'processed', invoice_id: 'sale-late' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar estado' }));
    expect(await screen.findByText(/aprobado: venta NV-0077 registrada/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryAllByTestId('point-parked-item')).toHaveLength(0));
    const pending = JSON.parse(localStorage.getItem(`walinka:fiscal-pending:${BIZ}`) || '[]');
    expect(pending.map((p) => p.saleId)).toEqual(['sale-late']);
    expect(pending[0].ticketData.total).toBe(1000);
    // Reintentar consultó la MISMA operación: ninguna order ni venta nueva.
    expect(named('createPointOrder')).toHaveLength(1);
    expect(named('createPosInvoice')).toHaveLength(0);
    expect(named('getPointOrder').every((c) => c.args[0] === OP)).toBe(true);
  });

  it('cancelado o vencido confirmado por Mercado Pago: se quita de la lista, sin venta', async () => {
    handlers.getPointOrder = never;
    fireEvent.click(await startPointCharge());
    fireEvent.click(await screen.findByTestId('point-park'));
    handlers.getPointOrder = () => ({ data: { ok: true, operation_id: OP, status: 'canceled' }, error: null });
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar estado' }));
    expect(await screen.findByText(/no se realizó \(canceled\)\. No hubo venta/)).toBeInTheDocument();
    expect(screen.queryAllByTestId('point-parked-item')).toHaveLength(0);
  });

  it('8. dos clics seguidos en «Enviar a la Point» crean una sola order', async () => {
    let release;
    handlers.createPointOrder = () => new Promise((r) => { release = r; });
    const send = await startPointCharge();
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(named('createPointOrder')).toHaveLength(1));
    await act(async () => { release({ data: { ok: true, operation_id: OP, status: 'at_terminal' }, error: null }); });
    expect(named('createPointOrder')).toHaveLength(1);
  });

  it('11. respuesta tardía de una operación ya dejada pendiente: no abre ticket ni toca la venta en curso', async () => {
    let late;
    handlers.getPointOrder = () => new Promise((r) => { late = r; });
    fireEvent.click(await startPointCharge());
    await waitFor(() => expect(late).toBeTypeOf('function'));
    fireEvent.click(await screen.findByTestId('point-park'));
    await act(async () => { late({ data: { ok: true, operation_id: OP, status: 'processed', invoice_id: 'sale-x' }, error: null }); });
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
    expect(screen.queryByTestId('point-park')).toBeNull();
  });
});

describe('TPV — recarga durante un cobro Point', () => {
  it('7. tras recargar se recupera la operación (sin crear otra) y se puede dejar pendiente', async () => {
    cleanup();
    localStorage.setItem(`walinka:point-active:${BIZ}`, OP);
    handlers.getPointOrder = never;
    render(<MemoryRouter><CrmTerminal /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Prueba Point'));
    fireEvent.click((await screen.findAllByRole('button', { name: /Cobrar/ }))[0]);
    await screen.findByTestId('payment-method-picker');
    expect(await screen.findByText(/Recuperando cobro/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('point-park'));
    await screen.findByTestId('point-parked-banner');
    expect(named('createPointOrder')).toHaveLength(0);
  });

  it('los cobros pendientes de verificación se recuperan al volver al TPV', async () => {
    cleanup();
    localStorage.setItem(`walinka:point-parked:${BIZ}`, JSON.stringify([{ operation_id: OP, amount: 1000, currency: 'CLP', status: 'at_terminal' }]));
    handlers.getPointOrder = never;
    render(<MemoryRouter><CrmTerminal /></MemoryRouter>);
    expect(await screen.findAllByTestId('point-parked-item')).toHaveLength(1);
  });
});
