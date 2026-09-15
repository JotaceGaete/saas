/**
 * CrmTerminal.jsx — TPV-CATEGORY-QUICK-FILTERS: tests de render/interacción
 * REALES (React Testing Library), no source-scan.
 *
 * El resto de CrmTerminal.test.js es deliberadamente source-scan (ver su
 * propio comment header: el componente es grande y con demasiadas
 * dependencias para un render completo sin mocks extensos). Este archivo
 * SÍ monta el componente real con mocks mínimos de sus dependencias
 * externas (servicios, sidebar, impresión, media query) para probar con
 * DOM real -- no solo con regex sobre el source -- que:
 *   - con productos categorizados, los chips de categoría aparecen;
 *   - "Todos" siempre aparece y es el estado inicial;
 *   - seleccionar una categoría oculta productos de otras categorías;
 *   - categoría + búsqueda se combinan (AND);
 *   - productos sin categoría no rompen nada;
 *   - sin ningún producto categorizado, no aparece una barra vacía;
 *   - el código de barras (match exacto + Enter) sigue agregando el
 *     producto aunque pertenezca a otra categoría que la activa;
 *   - cambiar de categoría no vacía el carrito.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));

vi.mock('hooks/useMediaQuery', () => ({ useIsDesktop: () => true }));
vi.mock('components/ui/BusinessSidebar', () => ({ default: () => null }));
vi.mock('components/ui/PanelHeader', () => ({
  default: ({ title, children, mobileActions }) => <div>{title}{children}{mobileActions}</div>,
}));
vi.mock('components/ui/CrmBreadcrumb', () => ({ default: () => null }));
vi.mock('./components/CrmThermalTicket', () => ({ default: () => null }));
vi.mock('./components/QuickCustomerModal', () => ({ QuickCustomerModal: () => null }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', currency: 'CLP', planSlug: 'business' } }),
}));

const getCrmCustomersMock = vi.fn();
const getPosProductsMock = vi.fn();
const getAllActiveProductsMock = vi.fn();
const createPosInvoiceMock = vi.fn();
const getOpenCashSessionMock = vi.fn();
const createCrmCustomerMock = vi.fn();

vi.mock('../../services/crmService', () => ({
  getCrmCustomers: (...a) => getCrmCustomersMock(...a),
  getPosProducts: (...a) => getPosProductsMock(...a),
  getAllActiveProducts: (...a) => getAllActiveProductsMock(...a),
  createPosInvoice: (...a) => createPosInvoiceMock(...a),
  getOpenCashSession: (...a) => getOpenCashSessionMock(...a),
  createCrmCustomer: (...a) => createCrmCustomerMock(...a),
}));

vi.mock('../../services/waBusinessService', () => ({
  getEffectivePlanSlug: () => 'business',
}));

vi.mock('../../config/planFeatures', () => ({
  canUseFeature: () => true,
}));

vi.mock('lib/printing/printService', () => ({
  printService: { printReceipt: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('lib/printing/receipts/buildSaleReceipt', () => ({ buildSaleReceipt: () => ({}) }));
vi.mock('lib/printing/printerConfigStorage', () => ({
  buildPrinterConfigKey: () => 'printer-config-key',
  readPrinterConfig: () => ({ printerName: null }),
}));

import CrmTerminal from './CrmTerminal';

const LECHE = {
  id: 'p1', name: 'Leche Entera', price: 1200, category: 'Lácteos',
  is_active: true, show_in_pos: true, stock_actual: null,
  barcode: '7801234567890', sku: 'LEC-1', public_code: null,
  image_url: null, thumbnail_url: null, card_image_url: null, images: null,
};
const YOGURT = {
  id: 'p2', name: 'Yogurt Natural', price: 900, category: 'Lácteos',
  is_active: true, show_in_pos: true, stock_actual: null,
  barcode: null, sku: null, public_code: null,
  image_url: null, thumbnail_url: null, card_image_url: null, images: null,
};
const BEBIDA = {
  id: 'p3', name: 'Bebida Cola', price: 1500, category: 'Bebidas',
  is_active: true, show_in_pos: true, stock_actual: null,
  barcode: '7809876543210', sku: null, public_code: null,
  image_url: null, thumbnail_url: null, card_image_url: null, images: null,
};
const SIN_CATEGORIA = {
  id: 'p4', name: 'Producto Suelto', price: 500, category: null,
  is_active: true, show_in_pos: true, stock_actual: null,
  barcode: null, sku: null, public_code: null,
  image_url: null, thumbnail_url: null, card_image_url: null, images: null,
};

function mockProducts(list) {
  getPosProductsMock.mockResolvedValue({ data: list, error: null, _fallback: false });
  getAllActiveProductsMock.mockResolvedValue({ data: list, error: null });
}

beforeEach(() => {
  [
    getCrmCustomersMock, getPosProductsMock, getAllActiveProductsMock,
    createPosInvoiceMock, getOpenCashSessionMock, createCrmCustomerMock,
  ].forEach((m) => m.mockReset());
  getCrmCustomersMock.mockResolvedValue({ data: [] });
  getOpenCashSessionMock.mockResolvedValue({ data: null });
  window.localStorage.clear();
});

afterEach(() => cleanup());

async function renderTpv(products) {
  mockProducts(products);
  const utils = render(<CrmTerminal />);
  // Espera a que termine de cargar (el spinner "Cargando productos…" desaparece).
  await waitFor(() => expect(screen.queryByText('Cargando productos…')).not.toBeInTheDocument());
  return utils;
}

describe('TPV-CATEGORY-QUICK-FILTERS — render real con productos categorizados', () => {
  it('con productos de Lácteos y Bebidas, aparecen los chips "Todos", "Lácteos" y "Bebidas"', async () => {
    await renderTpv([LECHE, YOGURT, BEBIDA]);
    expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lácteos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bebidas' })).toBeInTheDocument();
  });

  it('"Todos" es el estado inicial -- todos los productos (de ambas categorías) están visibles', async () => {
    await renderTpv([LECHE, YOGURT, BEBIDA]);
    expect(screen.getByText('Leche Entera')).toBeInTheDocument();
    expect(screen.getByText('Yogurt Natural')).toBeInTheDocument();
    expect(screen.getByText('Bebida Cola')).toBeInTheDocument();
  });

  it('CASO B: seleccionar "Lácteos" oculta los productos de "Bebidas"', async () => {
    await renderTpv([LECHE, YOGURT, BEBIDA]);
    fireEvent.click(screen.getByRole('button', { name: 'Lácteos' }));

    expect(screen.getByText('Leche Entera')).toBeInTheDocument();
    expect(screen.getByText('Yogurt Natural')).toBeInTheDocument();
    expect(screen.queryByText('Bebida Cola')).not.toBeInTheDocument();
  });

  it('CASO D: categoría + búsqueda se combinan -- "Lácteos" + "yog" solo muestra Yogurt (no Leche, no Bebida)', async () => {
    await renderTpv([LECHE, YOGURT, BEBIDA]);
    fireEvent.click(screen.getByRole('button', { name: 'Lácteos' }));

    const searchInput = screen.getByPlaceholderText(/Buscar por nombre, SKU o código de barras/i);
    fireEvent.change(searchInput, { target: { value: 'yog' } });

    await waitFor(() => expect(screen.queryByText('Leche Entera')).not.toBeInTheDocument(), { timeout: 1000 });
    expect(screen.getByText('Yogurt Natural')).toBeInTheDocument();
    expect(screen.queryByText('Bebida Cola')).not.toBeInTheDocument();
  });

  it('con categoría "Todos" (sin seleccionar ninguna) la búsqueda sigue cubriendo todo el catálogo', async () => {
    await renderTpv([LECHE, YOGURT, BEBIDA]);
    const searchInput = screen.getByPlaceholderText(/Buscar por nombre, SKU o código de barras/i);
    fireEvent.change(searchInput, { target: { value: 'a' } }); // matchea "Leche", "Cola", "Lácteos", "Bebidas"...

    await waitFor(() => expect(screen.queryByText('Cargando productos…')).not.toBeInTheDocument());
    // Con "Todos" activo, los 3 productos siguen siendo alcanzables por texto.
    expect(screen.getByText('Bebida Cola')).toBeInTheDocument();
  });

  it('productos sin categoría no rompen el render y siguen visibles en "Todos"', async () => {
    await renderTpv([LECHE, SIN_CATEGORIA]);
    expect(screen.getByText('Producto Suelto')).toBeInTheDocument();
    // Solo Lácteos genera chip -- el producto sin categoría no agrega un
    // chip vacío/"null"/"undefined".
    expect(screen.getByRole('button', { name: 'Lácteos' })).toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('sin ningún producto categorizado, NO aparece una barra de categorías vacía', async () => {
    await renderTpv([SIN_CATEGORIA]);
    expect(screen.queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument();
  });
});

describe('TPV-CATEGORY-QUICK-FILTERS — código de barras nunca bloqueado por categoría (CASO G, render real)', () => {
  it('con "Lácteos" activo, escanear (Enter) el código de barras de un producto de Bebidas igual lo agrega al carrito', async () => {
    await renderTpv([LECHE, YOGURT, BEBIDA]);
    fireEvent.click(screen.getByRole('button', { name: 'Lácteos' }));
    // La grilla, filtrada por Lácteos, ya no muestra Bebida Cola.
    expect(screen.queryByText('Bebida Cola')).not.toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Buscar por nombre, SKU o código de barras/i);
    fireEvent.change(searchInput, { target: { value: BEBIDA.barcode } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    // La grilla (filtrada por Lácteos) no muestra "Bebida Cola" -- si el
    // texto aparece en la página después del escaneo, solo puede venir del
    // carrito, que sí debe haberla agregado.
    await waitFor(() => {
      expect(screen.getByText(/Bebida Cola/)).toBeInTheDocument();
    });
    // La categoría activa no cambió por el escaneo.
    expect(screen.getByRole('button', { name: 'Lácteos' })).toHaveClass('bg-gray-900');
  });
});

describe('TPV-CATEGORY-QUICK-FILTERS — persistencia de categoría con carrito (CASOS C, E, render real)', () => {
  it('agregar un producto (con Lácteos activo) no vacía la categoría ni el carrito al cambiar a Bebidas', async () => {
    await renderTpv([LECHE, YOGURT, BEBIDA]);
    fireEvent.click(screen.getByRole('button', { name: 'Lácteos' }));
    fireEvent.click(screen.getByRole('button', { name: /Leche Entera/ }));

    // Cambiar de categoría -- el carrito debe seguir teniendo Leche Entera.
    fireEvent.click(screen.getByRole('button', { name: 'Bebidas' }));

    await waitFor(() => {
      expect(screen.getByText('Bebida Cola')).toBeInTheDocument(); // grilla cambió
    });
    expect(screen.getByText('1 artículo')).toBeInTheDocument(); // el carrito conserva la línea agregada
  });
});
