// TPV — cierre del ticket con la X después de cobrar.
//
// Error corregido: la X solo ocultaba el ticket; el carrito y la clave de
// idempotencia de la venta ya registrada seguían vivos. El siguiente cobro
// reusaba la clave y la RPC (idempotente por clave) devolvía la venta
// anterior en vez de registrar la nueva (caso NV-0064). Ahora la X, con un
// ticket recién cobrado, hace lo mismo que «Nueva venta»; con un ticket
// reabierto desde «Recuperar boleta» no toca el carrito en curso. Las
// boletas pendientes se conservan siempre.
//
// crmService es una grabadora (sin red). No se cobra ni se emite nada.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const BIZ = '85e80cd0-7242-492f-951d-b17893e84283';
const REAL_TERMINAL = 'NEWLAND_N950__N950NCB000000001';
const calls = [];
let saleSeq = 0;
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
  // Cada cobro devuelve una venta nueva (como la RPC con una clave nueva).
  createPosInvoice: rec('createPosInvoice', () => { saleSeq += 1; return { data: { id: `sale-${saleSeq}`, invoice_number: 100 + saleSeq }, error: null }; }),
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

// Flujo de boleta activo (para que exista la lista de boletas pendientes) pero
// sin emisión: el componente de boleta automática queda inerte.
vi.mock('../../services/fiscalAutoMode', () => ({ FISCAL_AUTO_MODE: 'simulated', isPreviewLike: () => true, resolveFiscalAutoMode: () => 'simulated' }));
vi.mock('./components/TpvFiscalAutoBoleta', () => ({ default: () => null }));

const { default: CrmTerminal } = await import('./CrmTerminal');
const PENDING_KEY = `walinka:fiscal-pending:${BIZ}`;
const invoiceCalls = () => calls.filter((c) => c.name === 'createPosInvoice');
const pendingIds = () => (JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')).map((p) => p.saleId);

async function addProduct(times = 1) {
  const product = await screen.findByText('Prueba Point');
  for (let i = 0; i < times; i += 1) fireEvent.click(product);
}

async function payCash() {
  const cobrar = await screen.findAllByRole('button', { name: /Cobrar/ });
  fireEvent.click(cobrar[0]);
  await screen.findByTestId('payment-method-picker');
  expect(screen.getByTestId('pay-cash')).toHaveAttribute('aria-checked', 'true');
  const before = invoiceCalls().length;
  fireEvent.click(screen.getAllByRole('button', { name: /Confirmar/ })[0]);
  await waitFor(() => expect(invoiceCalls()).toHaveLength(before + 1));
  await screen.findByRole('button', { name: 'Cerrar' });
  return invoiceCalls()[before].args[1];
}

const cobrarButtons = () => screen.queryAllByRole('button', { name: /Cobrar/ });

beforeEach(() => {
  calls.length = 0;
  saleSeq = 0;
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<MemoryRouter><CrmTerminal /></MemoryRouter>);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TPV — cerrar el ticket con la X', () => {
  it('después de cobrar, la X vacía el carrito y el siguiente cobro usa otra clave y registra otra venta', async () => {
    await addProduct(2);
    const first = await payCash();
    expect(first.items).toEqual([expect.objectContaining({ quantity: 2 })]);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull());
    // Carrito vacío: no hay nada que cobrar.
    await waitFor(() => expect(cobrarButtons().every((b) => b.disabled)).toBe(true));

    await addProduct(1);
    const second = await payCash();
    expect(second.items).toEqual([expect.objectContaining({ quantity: 1 })]);
    expect(typeof first.idempotencyKey).toBe('string');
    expect(typeof second.idempotencyKey).toBe('string');
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('la X no pierde la boleta pendiente de la venta cobrada', async () => {
    await addProduct(1);
    await payCash();
    await waitFor(() => expect(pendingIds()).toEqual(['sale-1']));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    const banner = await screen.findByTestId('fiscal-pending-banner');
    expect(within(banner).getByRole('button', { name: /Recuperar boleta/ })).toBeInTheDocument();
    expect(pendingIds()).toEqual(['sale-1']);
  });

  it('«Nueva venta» sigue igual: vacía el carrito y renueva la clave', async () => {
    await addProduct(1);
    const first = await payCash();
    fireEvent.click(screen.getByRole('button', { name: /Nueva venta/ }));
    await waitFor(() => expect(cobrarButtons().every((b) => b.disabled)).toBe(true));
    await addProduct(1);
    const second = await payCash();
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('cerrar con la X una boleta recuperada no vacía el carrito en curso ni cambia su clave', async () => {
    await addProduct(1);
    const first = await payCash();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    const banner = await screen.findByTestId('fiscal-pending-banner');

    // Nueva venta en curso: 3 unidades en el carrito.
    await addProduct(3);
    await waitFor(() => expect(cobrarButtons().some((b) => !b.disabled)).toBe(true));

    fireEvent.click(within(banner).getByRole('button', { name: /Recuperar boleta/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull());
    expect(pendingIds()).toEqual(['sale-1']);

    // El carrito sigue ahí y se cobra con su propia clave (no la de la venta 1).
    const second = await payCash();
    expect(second.items).toEqual([expect.objectContaining({ quantity: 3 })]);
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('salir del TPV con el ticket recién cobrado no guarda un borrador con la clave de esa venta', async () => {
    await addProduct(1);
    const first = await payCash();
    // Ocultar la pestaña y salir del TPV (desmontar) sin pulsar «Nueva venta» ni la X.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    cleanup();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    const raw = localStorage.getItem(`pos-terminal-draft:${BIZ}`);
    expect(raw === null || !raw.includes(first.idempotencyKey)).toBe(true);
  });
});


describe('TPV — la RPC devuelve una venta anterior (clave repetida)', () => {
  it('no la muestra como registrada: avisa, descarta la clave y el siguiente Confirmar usa otra', async () => {
    const { createPosInvoice } = await import('../../services/crmService');
    createPosInvoice.mockImplementationOnce(async (...args) => {
      calls.push({ name: 'createPosInvoice', args });
      return { data: { id: 'old-67', invoice_number: 67, total: 1000, created_at: '2026-11-09T21:03:35Z' }, error: null };
    });
    await addProduct(1);
    const cobrar = await screen.findAllByRole('button', { name: /Cobrar/ });
    fireEvent.click(cobrar[0]);
    await screen.findByTestId('payment-method-picker');
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar/ })[0]);
    expect(await screen.findByText(/todavía no se registró.*NV-0067/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
    const firstKey = invoiceCalls()[0].args[1].idempotencyKey;
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar/ })[0]);
    await waitFor(() => expect(invoiceCalls()).toHaveLength(2));
    expect(invoiceCalls()[1].args[1].idempotencyKey).not.toBe(firstKey);
    await screen.findByRole('button', { name: 'Cerrar' });
  });
});
