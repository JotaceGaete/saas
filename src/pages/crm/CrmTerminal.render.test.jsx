/**
 * CrmTerminal.jsx — test de RENDER/MONTAJE REAL (React Testing Library),
 * a diferencia de CrmTerminal.test.js (100% source-scan vía ?raw).
 *
 * Motivación (PR #47 — blocker "Vercel Preview renderiza pantalla en
 * blanco"): la suite existente pasaba 1403/1403 sin detectar el problema
 * reportado porque nunca monta React de verdad -- solo audita el texto
 * fuente. Este archivo cierra ese hueco: monta <CrmTerminal /> con
 * @testing-library/react sobre jsdom, con las dependencias externas
 * (AuthContext, crmService, waBusinessService, BusinessSidebar) mockeadas
 * -- igual que el patrón ya usado en AdminAffiliatePayoutsPage.test.jsx --
 * y verifica que:
 *
 *   1. React monta sin lanzar (render() no arroja);
 *   2. CrmTerminalBoundary (el ErrorBoundary propio del componente) NO
 *      atrapó un error de render -- si lo atrapara, render() no lanzaría
 *      igual (el boundary se traga el error), así que se verifica
 *      explícitamente que NO aparece su fallback ("El terminal encontró
 *      un problema") y que SÍ aparece contenido real de la pantalla.
 *   3. Los flujos nuevos de TPV-CORE-4/4B (expandir carrito, pasar a
 *      payment, expandir Pagos, "+ Agregar producto") se pueden ejercitar
 *      sin que el boundary los atrape.
 *
 * Igual que el resto de tests de este repo: esto prueba que React monta
 * y no crashea en jsdom -- no reemplaza una verificación manual en un
 * navegador real ni contra el Vercel Preview real (inalcanzable desde
 * este entorno por política de red -- ver el reporte de la investigación
 * del blocker).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('components/ui/BusinessSidebar', () => ({
  default: () => <div data-testid="sidebar-stub" />,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    business: {
      id: 'biz1',
      currency: 'CLP',
      planSlug: 'business',
      planExpiresAt: null,
      trialExpiresAt: null,
    },
  }),
}));

vi.mock('hooks/useMediaQuery', () => ({
  useIsDesktop: () => true,
}));

vi.mock('../../services/waBusinessService', () => ({
  getEffectivePlanSlug: () => 'business',
}));

const PRODUCT_A = {
  id: 'p-a',
  name: 'TRAXX 9012',
  price: 18000,
  category: 'General',
  stock_actual: 5,
  stock_minimo: 0,
  is_active: true,
  is_sold_out: false,
  public_code: null,
  slug: null,
  sku: null,
  barcode: null,
  show_in_pos: true,
  pos_sort_order: 0,
  image_url: null,
  thumbnail_url: null,
  card_image_url: null,
  images: null,
};

const getPosProductsMock = vi.fn();
const getAllActiveProductsMock = vi.fn();
const getCrmCustomersMock = vi.fn();
const createPosInvoiceMock = vi.fn();
const getOpenCashSessionMock = vi.fn();
const createCrmCustomerMock = vi.fn();

vi.mock('../../services/crmService', () => ({
  getCrmCustomers: (...args) => getCrmCustomersMock(...args),
  getPosProducts: (...args) => getPosProductsMock(...args),
  getAllActiveProducts: (...args) => getAllActiveProductsMock(...args),
  createPosInvoice: (...args) => createPosInvoiceMock(...args),
  getOpenCashSession: (...args) => getOpenCashSessionMock(...args),
  createCrmCustomer: (...args) => createCrmCustomerMock(...args),
}));

import CrmTerminal from './CrmTerminal';

beforeEach(() => {
  getPosProductsMock.mockReset().mockResolvedValue({ data: [PRODUCT_A], _fallback: false });
  getAllActiveProductsMock.mockReset().mockResolvedValue({ data: [PRODUCT_A], error: null });
  getCrmCustomersMock.mockReset().mockResolvedValue({ data: [] });
  createPosInvoiceMock.mockReset().mockResolvedValue({ data: { id: 'inv1', status: 'pagada' }, error: null });
  getOpenCashSessionMock.mockReset().mockResolvedValue({ data: { id: 'cash1' } });
  createCrmCustomerMock.mockReset().mockResolvedValue({ data: null, error: null });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function renderTerminal() {
  return render(
    <MemoryRouter initialEntries={['/crm/terminal']}>
      <CrmTerminal />
    </MemoryRouter>,
  );
}

describe('CrmTerminal — monta de verdad sin que su propio ErrorBoundary lo atrape', () => {
  it('render() no lanza, y NO se ve el fallback "El terminal encontró un problema"', async () => {
    expect(() => renderTerminal()).not.toThrow();
    // Deja que los efectos (getPosProducts/getAllActiveProducts/getCrmCustomers)
    // resuelvan antes de inspeccionar el DOM.
    await screen.findByText('Terminal de ventas');
    expect(screen.queryByText('El terminal encontró un problema')).not.toBeInTheDocument();
  });

  it('muestra contenido real de la pantalla (búsqueda, producto cargado, carrito vacío)', async () => {
    renderTerminal();
    await screen.findByPlaceholderText(/Buscar por nombre, SKU o código de barras/);
    expect(await screen.findByText('TRAXX 9012')).toBeInTheDocument();
    expect(screen.getByText('Toca un producto para agregarlo')).toBeInTheDocument();
  });

  it('CrmTerminalBoundary nunca logueó "error capturado por boundary"', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderTerminal();
    await screen.findByText('Terminal de ventas');
    const boundaryLogged = errorSpy.mock.calls.some((call) =>
      String(call[0] || '').includes('[CrmTerminal] error capturado por boundary'),
    );
    expect(boundaryLogged).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('CrmTerminal — los flujos nuevos de TPV-CORE-4/4B se pueden ejercitar sin crashear', () => {
  it('agregar producto, pasar a Cobrar, expandir Pagos, volver a expandir el carrito y usar "+ Agregar producto" -- todo sin que el boundary lo atrape', async () => {
    renderTerminal();
    await screen.findByText('Terminal de ventas');

    // Agrega el único producto cargado -- pasa de carrito vacío a 1 ítem
    // (genera la idempotency key eager, TPV-CORE-2/STOCK-UX-1 intactos).
    fireEvent.click(await screen.findByText('TRAXX 9012'));
    expect(screen.queryByText('El terminal encontró un problema')).not.toBeInTheDocument();

    // "Cobrar $..." -- checkoutStep: sale -> payment (TPV-CORE-3),
    // cartExpanded pasa a false y paymentsExpanded a true (TPV-CORE-4).
    const cobrarBtn = await screen.findByRole('button', { name: /Cobrar \$/ });
    fireEvent.click(cobrarBtn);
    expect(screen.queryByText('El terminal encontró un problema')).not.toBeInTheDocument();
    // Sin pago ingresado todavía, queda pendiente y exige cliente (regla
    // de negocio existente, no un bug) -- se ve "Falta pagar $18.000".
    expect(await screen.findByText(/Falta pagar/)).toBeInTheDocument();

    // Completa el pago en efectivo por el total -- deja de faltar saldo,
    // aparece "Confirmar venta".
    const montoInput = screen.getByPlaceholderText('Monto');
    fireEvent.change(montoInput, { target: { value: '18000' } });
    expect(screen.queryByText('El terminal encontró un problema')).not.toBeInTheDocument();
    expect(await screen.findByText('Confirmar venta')).toBeInTheDocument();

    // Pagos ya viene expandido por default al entrar a payment -- colapsarlo
    // no debe crashear (paymentSummaryGrid en la vista colapsada).
    const pagosToggle = screen.getByRole('button', { name: /Pagado.*Pendiente/ });
    fireEvent.click(pagosToggle);
    expect(screen.queryByText('El terminal encontró un problema')).not.toBeInTheDocument();
    fireEvent.click(pagosToggle);
    expect(screen.queryByText('El terminal encontró un problema')).not.toBeInTheDocument();

    // El carrito arranca colapsado en payment (resumen compacto) -- lo
    // expandimos por su cabecera clickeable (TPV-CORE-4).
    const cartToggle = screen.getByRole('button', { name: /Carrito/ });
    fireEvent.click(cartToggle);
    expect(screen.queryByText('El terminal encontró un problema')).not.toBeInTheDocument();

    // "+ Agregar producto" (TPV-CORE-4B) -- scroll+focus al buscador
    // existente sin abandonar payment. jsdom no implementa scrollIntoView
    // por defecto -- se stubea para que el click no explote por eso.
    Element.prototype.scrollIntoView = vi.fn();
    const addProductBtn = await screen.findByRole('button', { name: /Agregar producto/ });
    fireEvent.click(addProductBtn);
    expect(screen.queryByText('El terminal encontró un problema')).not.toBeInTheDocument();
    // Sigue en payment -- "+ Agregar producto" nunca debe forzar 'sale'.
    expect(screen.getByText('Confirmar venta')).toBeInTheDocument();
  });
});
