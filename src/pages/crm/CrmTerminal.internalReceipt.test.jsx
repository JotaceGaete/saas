// TPV — comprobante interno de respaldo cuando la boleta electrónica no salió (fiscal-emit sin
// respuesta o resultado incierto). El botón del panel fiscal imprime el ticket de la venta YA
// cobrada rotulado «no válido como boleta»: no vuelve a cobrar, no crea otra venta y cada copia
// lleva su propia clave de impresión. crmService es una grabadora; la impresión está simulada.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
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

vi.mock('../../services/fiscalAutoMode', () => ({ FISCAL_AUTO_MODE: 'simulated', isPreviewLike: () => true, resolveFiscalAutoMode: () => 'simulated' }));
// Panel fiscal reemplazado por uno que simula «servicio fiscal sin respuesta» y expone el botón.
vi.mock('./components/TpvFiscalAutoBoleta', () => ({
  default: ({ onInternalReceipt }) => (
    <div data-testid="fiscal-auto-boleta" data-phase="error">
      <button type="button" onClick={() => onInternalReceipt()}>Imprimir comprobante interno (no es boleta)</button>
    </div>
  ),
}));
const printed = [];
vi.mock('lib/printing/printService', () => ({
  printService: { printReceipt: vi.fn(async (receipt, target) => { printed.push({ receipt, target }); return { ok: true }; }) },
}));

const { default: CrmTerminal } = await import('./CrmTerminal');
const { writePrinterConfig, buildPrinterConfigKey } = await import('lib/printing/printerConfigStorage');
const invoiceCalls = () => calls.filter((c) => c.name === 'createPosInvoice');
const texts = (receipt) => receipt.lines.map((l) => l.text).filter(Boolean);

beforeEach(() => {
  calls.length = 0;
  printed.length = 0;
  saleSeq = 0;
  localStorage.clear();
  writePrinterConfig(buildPrinterConfigKey(BIZ), { printerName: 'XP-80' });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<MemoryRouter><CrmTerminal /></MemoryRouter>);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TPV — comprobante interno sin volver a cobrar', () => {
  it('imprime el ticket de la venta cobrada con «NO VALIDO COMO BOLETA»; no cobra ni crea otra venta', async () => {
    fireEvent.click(await screen.findByText('Prueba Point'));
    fireEvent.click((await screen.findAllByRole('button', { name: /Cobrar/ }))[0]);
    await screen.findByTestId('payment-method-picker');
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar/ })[0]);
    await waitFor(() => expect(invoiceCalls()).toHaveLength(1));
    // Con el flujo de boleta activo, el TPV no imprime solo el ticket normal.
    await screen.findByTestId('fiscal-auto-boleta');
    expect(printed).toHaveLength(0);

    const button = screen.getByRole('button', { name: 'Imprimir comprobante interno (no es boleta)' });
    fireEvent.click(button);
    await waitFor(() => expect(printed).toHaveLength(1));
    expect(texts(printed[0].receipt)).toEqual(expect.arrayContaining(['COMPROBANTE INTERNO', 'NO VALIDO COMO BOLETA']));
    expect(printed[0].target.idempotencyKey).toBe('sale:sale-1:internal');

    // Otra copia: clave distinta (el conector no la descarta) y sigue sin cobrar.
    fireEvent.click(button);
    await waitFor(() => expect(printed).toHaveLength(2));
    expect(printed[1].target.idempotencyKey).toMatch(/^sale:sale-1:internal:/);
    expect(invoiceCalls()).toHaveLength(1);
  });

  it('«Ticket de venta» sigue imprimiendo el ticket de siempre, sin el aviso', async () => {
    fireEvent.click(await screen.findByText('Prueba Point'));
    fireEvent.click((await screen.findAllByRole('button', { name: /Cobrar/ }))[0]);
    await screen.findByTestId('payment-method-picker');
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar/ })[0]);
    await screen.findByTestId('fiscal-auto-boleta');
    fireEvent.click(screen.getByRole('button', { name: /Ticket de venta/ }));
    await waitFor(() => expect(printed).toHaveLength(1));
    expect(texts(printed[0].receipt)).not.toContain('NO VALIDO COMO BOLETA');
    expect(invoiceCalls()).toHaveLength(1);
  });
});
