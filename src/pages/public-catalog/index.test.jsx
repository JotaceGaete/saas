// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// public-catalog/index.jsx importa AuthContext, que a su vez importa lib/supabase
// -- ese módulo revienta al evaluarse sin VITE_SUPABASE_URL/ANON_KEY reales (ver
// src/lib/supabase.js, mismo problema documentado en RequireBusinessCountry.test.js).
// Esta suite no ejercita ningún flujo de autenticación (siempre visitante anónimo),
// así que se mockea únicamente para poder montar el componente.
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, business: null }),
}));

// waBusinessService también importa lib/supabase. Se mockean únicamente las
// funciones que public-catalog/index.jsx usa, preservando el comportamiento real
// de getPublicProducts (incluido el `.limit(maxProducts)` que aplica el tope del
// plan) para poder probar que ese tope se sigue aplicando en la consulta, no en
// la visibilidad del frontend (condición 6 de esta tarea).
const mockGetBusinessBySlug = vi.fn();
const mockGetPublicProducts = vi.fn();
const mockGetCategoriesByRubroId = vi.fn().mockResolvedValue({ data: [] });
const mockGetBusinessCategories = vi.fn().mockResolvedValue({ data: [] });
const mockRecordCatalogVisit = vi.fn().mockResolvedValue({ recorded: true });
const mockRecordCatalogWhatsAppClick = vi.fn().mockResolvedValue({});
const mockCreateOrder = vi.fn().mockResolvedValue({ data: null, error: null });
// Devuelve el planSlug tal cual: aísla la prueba de la lógica de vencimiento de
// plan (no forma parte de esta regresión, condición 3: no tocar otras funciones).
const mockGetEffectivePlanSlug = vi.fn((planSlug) => planSlug);

vi.mock('../../services/waBusinessService', () => ({
  getBusinessBySlug: (...args) => mockGetBusinessBySlug(...args),
  getPublicProducts: (...args) => mockGetPublicProducts(...args),
  getCategoriesByRubroId: (...args) => mockGetCategoriesByRubroId(...args),
  getBusinessCategories: (...args) => mockGetBusinessCategories(...args),
  recordCatalogVisit: (...args) => mockRecordCatalogVisit(...args),
  recordCatalogWhatsAppClick: (...args) => mockRecordCatalogWhatsAppClick(...args),
  createOrder: (...args) => mockCreateOrder(...args),
  getEffectivePlanSlug: (...args) => mockGetEffectivePlanSlug(...args),
}));

const { default: PublicCatalog } = await import('./index');
const { getPlanLimits } = await import('../../constants/plans');

/** Genera N productos activos, ya en el orden de sort_order ascendente que devolvería Supabase. */
function makeProducts(count, { category } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `prod-${i + 1}`,
    name: `Producto ${i + 1}`,
    price: 1000 + i,
    sortOrder: i,
    isActive: true,
    showPrice: true,
    ...(category ? { category } : {}),
  }));
}

function makeBusiness(overrides = {}) {
  return {
    id: 'biz-1',
    slug: 'tienda-test',
    name: 'Tienda Test',
    planSlug: 'starter',
    planExpiresAt: null,
    trialExpiresAt: null,
    designSettings: {},
    rubroId: null,
    ...overrides,
  };
}

/**
 * Mock fiel del comportamiento real de getPublicProducts: aplica el mismo
 * `.limit(maxProducts)` que la consulta Supabase real (src/services/waBusinessService.js),
 * para poder verificar que el tope de plan se aplica ahí y no en la UI.
 */
function wirePublicProducts(allProducts) {
  mockGetPublicProducts.mockImplementation(async (_businessId, options = {}) => {
    const { maxProducts } = options;
    const capped = maxProducts != null && maxProducts > 0 ? allProducts.slice(0, maxProducts) : allProducts;
    return { data: capped, error: null };
  });
}

/** Controla useIsDesktop() (window.matchMedia('(min-width: 1024px)')) y el resto de matchMedia usados. */
function setViewport({ isDesktop }) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(min-width: 1024px)' ? isDesktop : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

async function renderCatalog({ business, products, isDesktop = true }) {
  mockGetBusinessBySlug.mockResolvedValue({ data: business, error: null });
  wirePublicProducts(products);
  setViewport({ isDesktop });

  render(
    <MemoryRouter initialEntries={[`/catalogo/${business.slug}`]}>
      <Routes>
        <Route path="/catalogo/:slug" element={<PublicCatalog />} />
      </Routes>
    </MemoryRouter>,
  );

  // Espera a que loadCatalog() resuelva y el conteo de productos esté en pantalla.
  await waitFor(() => {
    expect(mockGetPublicProducts).toHaveBeenCalled();
  });
}

function verMasButton() {
  return screen.queryByRole('button', { name: /ver más productos/i });
}

function visibleProductNames() {
  return screen.getAllByText(/^Producto \d+$/).map((el) => el.textContent);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCategoriesByRubroId.mockResolvedValue({ data: [] });
  mockGetBusinessCategories.mockResolvedValue({ data: [] });
  mockGetEffectivePlanSlug.mockImplementation((planSlug) => planSlug);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('public-catalog: paginación "Ver más productos" (regresión 7217cc3 → 0ed9525 → 2083b89)', () => {
  it('con 16 productos en escritorio no aparece "Ver más" (16 === visibleCount inicial)', async () => {
    const business = makeBusiness({ planSlug: 'business' }); // sin tope de plan
    await renderCatalog({ business, products: makeProducts(16), isDesktop: true });

    await waitFor(() => expect(screen.getByText(/^16 productos$/)).toBeTruthy());
    expect(visibleProductNames()).toHaveLength(16);
    expect(verMasButton()).toBeNull();
  });

  it('con 17 productos en escritorio SÍ aparece "Ver más", y al pulsarlo se muestra el producto 17', async () => {
    const business = makeBusiness({ planSlug: 'business' });
    await renderCatalog({ business, products: makeProducts(17), isDesktop: true });

    await waitFor(() => expect(screen.getByText(/^17 productos$/)).toBeTruthy());
    expect(visibleProductNames()).toHaveLength(16);
    expect(screen.queryByText('Producto 17')).toBeNull();

    const btn = verMasButton();
    expect(btn).not.toBeNull();
    expect(btn.textContent).toMatch(/1 restantes?/);

    fireEvent.click(btn);

    await waitFor(() => expect(screen.getByText('Producto 17')).toBeTruthy());
    expect(visibleProductNames()).toHaveLength(17);
    // Ya se reveló el último producto cargado: el botón debe desaparecer.
    expect(verMasButton()).toBeNull();
  });

  it('con 50 productos se puede avanzar a clics hasta mostrar el último', async () => {
    const business = makeBusiness({ planSlug: 'business' });
    await renderCatalog({ business, products: makeProducts(50), isDesktop: true });

    await waitFor(() => expect(screen.getByText(/^50 productos$/)).toBeTruthy());
    expect(visibleProductNames()).toHaveLength(16);

    let clicks = 0;
    while (verMasButton() && clicks < 10) {
      fireEvent.click(verMasButton());
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {});
      clicks += 1;
    }

    await waitFor(() => expect(screen.getByText('Producto 50')).toBeTruthy());
    expect(visibleProductNames()).toHaveLength(50);
    expect(verMasButton()).toBeNull(); // llegó al último: el botón desaparece
  });

  it('funciona igual para Starter (tope 20), Pro (tope 100) y Business (sin tope) cuando hay más productos cargados que visibleCount', async () => {
    const starterLimit = getPlanLimits('starter').maxProducts;
    const proLimit = getPlanLimits('pro').maxProducts;
    const businessLimit = getPlanLimits('business').maxProducts;
    expect(starterLimit).toBe(20);
    expect(proLimit).toBe(100);
    expect(businessLimit).toBeNull();

    for (const planSlug of ['starter', 'pro', 'business']) {
      // eslint-disable-next-line no-await-in-loop
      const { unmount } = await (async () => {
        const business = makeBusiness({ planSlug });
        mockGetBusinessBySlug.mockResolvedValue({ data: business, error: null });
        // 18 productos activos: menos que el tope de cualquiera de los 3 planes
        // (Starter=20, Pro=100, Business=ilimitado), así que los 18 llegan al
        // frontend en todos los casos (SQL no los recorta).
        wirePublicProducts(makeProducts(18));
        setViewport({ isDesktop: true });
        const utils = render(
          <MemoryRouter initialEntries={[`/catalogo/${business.slug}`]}>
            <Routes>
              <Route path="/catalogo/:slug" element={<PublicCatalog />} />
            </Routes>
          </MemoryRouter>,
        );
        await waitFor(() => expect(screen.getByText(/^18 productos$/)).toBeTruthy());
        return utils;
      })();

      expect(visibleProductNames()).toHaveLength(16);
      const btn = verMasButton();
      expect(btn).not.toBeNull();
      fireEvent.click(btn);
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(screen.getByText('Producto 18')).toBeTruthy());
      expect(visibleProductNames()).toHaveLength(18);
      expect(verMasButton()).toBeNull();

      unmount();
      vi.clearAllMocks();
      mockGetCategoriesByRubroId.mockResolvedValue({ data: [] });
      mockGetBusinessCategories.mockResolvedValue({ data: [] });
      mockGetEffectivePlanSlug.mockImplementation((slug) => slug);
    }
  });

  it('un cambio de categoría reinicia visibleCount, pero no deja productos cargados inaccesibles', async () => {
    const products = makeProducts(20).map((p, i) => ({
      ...p,
      category: i < 5 ? 'Zapatos' : 'Otros',
    }));
    const business = makeBusiness({
      planSlug: 'business',
      designSettings: { useCategories: true },
    });
    mockGetBusinessCategories.mockResolvedValue({ data: [{ name: 'Zapatos' }, { name: 'Otros' }] });

    await renderCatalog({ business, products, isDesktop: true });
    await waitFor(() => expect(screen.getByText(/^20 productos$/)).toBeTruthy());

    // Revela todo el catálogo completo ("Todos") antes de cambiar de categoría.
    const btnAll = verMasButton();
    expect(btnAll).not.toBeNull();
    fireEvent.click(btnAll);
    await waitFor(() => expect(verMasButton()).toBeNull());
    expect(visibleProductNames()).toHaveLength(20);

    // Cambia a la categoría "Zapatos" (5 productos): visibleCount se reinicia,
    // pero como solo hay 5 productos en esa categoría, no queda nada oculto.
    fireEvent.click(screen.getByRole('button', { name: 'Zapatos' }));
    await waitFor(() => expect(screen.getByText(/^5 productos$/)).toBeTruthy());
    expect(visibleProductNames()).toHaveLength(5);
    expect(verMasButton()).toBeNull();

    // Vuelve a "Todos": visibleCount se reinicia al default (16 en desktop), pero
    // los 20 productos siguen cargados y accesibles vía "Ver más" (no quedan
    // atascados por el filtro anterior).
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(screen.getByText(/^20 productos$/)).toBeTruthy());
    expect(visibleProductNames()).toHaveLength(16);
    const btnAgain = verMasButton();
    expect(btnAgain).not.toBeNull();
    fireEvent.click(btnAgain);
    await waitFor(() => expect(visibleProductNames()).toHaveLength(20));
    expect(verMasButton()).toBeNull();
  });

  it('el botón no aparece cuando no existen más productos cargados que los visibles', async () => {
    const business = makeBusiness({ planSlug: 'business' });
    await renderCatalog({ business, products: makeProducts(5), isDesktop: true });

    await waitFor(() => expect(screen.getByText(/^5 productos$/)).toBeTruthy());
    expect(visibleProductNames()).toHaveLength(5);
    expect(verMasButton()).toBeNull();
  });

  it('el límite comercial del plan se aplica en la consulta (getPublicProducts), no en la visibilidad del frontend', async () => {
    // Negocio Starter (tope = 20) con 30 productos activos en la base de datos:
    // el mock reproduce el `.limit(maxProducts)` real, así que solo 20 llegan al frontend.
    const business = makeBusiness({ planSlug: 'starter' });
    await renderCatalog({ business, products: makeProducts(30), isDesktop: true });

    expect(mockGetPublicProducts).toHaveBeenCalledWith(business.id, expect.objectContaining({ maxProducts: 20 }));

    await waitFor(() => expect(screen.getByText(/^20 productos$/)).toBeTruthy());
    // Los 20 permitidos por el plan deben poder verse todos (nunca deben quedar
    // ocultos por la paginación del frontend), pero nunca aparecen los 10 que el
    // plan no permite: el tope se aplicó en la consulta, no en la UI.
    let clicks = 0;
    while (verMasButton() && clicks < 10) {
      fireEvent.click(verMasButton());
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => {});
      clicks += 1;
    }
    expect(visibleProductNames()).toHaveLength(20);
    expect(screen.queryByText('Producto 21')).toBeNull();
    expect(verMasButton()).toBeNull();
  });
});
