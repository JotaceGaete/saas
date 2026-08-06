// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from '../../components/ui/Toast';

// ProductEditor (y BusinessSidebar/MobileBottomNav dentro de DashboardAppShell,
// y productMediaService/getValidToken usados por VideoUploadSection) importan
// AuthContext y lib/supabase, que revientan al evaluarse sin credenciales reales
// (mismo problema documentado en RequireBusinessCountry.test.js). Ninguna de
// estas pruebas ejercita autenticación ni Supabase real, así que se mockean
// para poder montar el componente. vi.mock resuelve por módulo absoluto, así
// que un solo mock por módulo cubre todos los specifiers (relativos o bare)
// que distintos archivos usan para importarlo.
let authState = { user: { id: 'user-1' }, business: null, businessLoading: false, refreshBusiness: () => {} };
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
vi.mock('../../services/crmService', () => ({
  generateUniqueBarcode: async () => ({ data: '0000000000000', error: null }),
  saveProductBarcode: async () => ({ data: null, error: null }),
}));

const mockGetProduct = vi.fn();
const mockCreateProduct = vi.fn();
const mockUpdateProduct = vi.fn();
vi.mock('../../services/waBusinessService', () => ({
  getProduct: (...args) => mockGetProduct(...args),
  createProduct: (...args) => mockCreateProduct(...args),
  updateProduct: (...args) => mockUpdateProduct(...args),
  createProductDraft: async () => ({ data: null, error: { message: 'no usado' } }),
  deleteProduct: async () => ({ data: null, error: null }),
  uploadProductImage: async () => ({ url: null, error: { message: 'no usado' } }),
  uploadProductMainImage: async () => ({ url: null, error: { message: 'no usado' } }),
  getProducts: async () => ({ data: [] }),
  getMyBusiness: async () => ({ data: null }),
  getCategoriesByRubroId: async () => ({ data: [] }),
  getBusinessCategories: async () => ({ data: [] }),
  createBusinessCategory: async () => ({ data: null, error: { message: 'no usado' } }),
  getEffectivePlanSlug: (planSlug) => planSlug || 'starter',
  slugifyProductName: (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'producto',
}));

const { default: ProductEditor } = await import('./index');

const NAME_PLACEHOLDER = 'Ej: Camiseta de algodón premium';
const DRAFT_BANNER_TEXT = 'Hay cambios sin guardar recuperados de una sesión anterior.';

function draftKeyFor(businessId, productId) {
  return `product-editor:${businessId}:${productId || 'new'}`;
}

function setBusiness(overrides = {}) {
  authState = {
    user: { id: 'user-1' },
    business: { id: 'biz-1', slug: 'tienda', planSlug: 'business', designSettings: {} },
    businessLoading: false,
    refreshBusiness: () => {},
    ...overrides,
  };
}

function renderEditor(search = '') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/product-editor${search}`]}>
        <Routes>
          <Route path="/product-editor" element={<ProductEditor />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function waitForFormReady() {
  await waitFor(() => expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toBeTruthy());
}

async function typeName(value) {
  const input = screen.getByPlaceholderText(NAME_PLACEHOLDER);
  fireEvent.change(input, { target: { value } });
}

function stubMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  stubMatchMedia();
  setBusiness();
  mockGetProduct.mockReset();
  mockCreateProduct.mockReset().mockResolvedValue({ data: { id: 'new-id', slug: 'nuevo' }, error: null });
  mockUpdateProduct.mockReset().mockResolvedValue({ data: { id: 'prod-1', slug: 'actualizado' }, error: null });
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('product-editor: navegación interna antes/después del debounce (causa raíz: cancel() vs flush() al desmontar)', () => {
  it('desmontar ANTES de que pasen los 500ms del debounce igual persiste el borrador (flush, no cancel)', async () => {
    mockGetProduct.mockResolvedValue({
      data: { id: 'prod-1', name: 'Original', price: 1000, updatedAt: new Date(Date.now() - 3600_000).toISOString() },
      error: null,
    });
    const { unmount } = renderEditor('?id=prod-1');
    await waitForFormReady();

    await typeName('Editado sin esperar el debounce');
    // Ningún avance de reloj: el debounce de 500ms no ha disparado todavía.
    expect(localStorage.getItem(draftKeyFor('biz-1', 'prod-1'))).toBeNull();

    unmount(); // simula el desmontaje por navegación interna de React Router

    const stored = localStorage.getItem(draftKeyFor('biz-1', 'prod-1'));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored).formData.nombre).toBe('Editado sin esperar el debounce');
  });

  it('desmontar DESPUÉS de que el debounce ya escribió no pierde ni duplica el borrador', async () => {
    mockGetProduct.mockResolvedValue({
      data: { id: 'prod-2', name: 'Original 2', price: 1000, updatedAt: new Date(Date.now() - 3600_000).toISOString() },
      error: null,
    });
    const { unmount } = renderEditor('?id=prod-2');
    await waitForFormReady();

    await typeName('Editado, espero el debounce');
    vi.advanceTimersByTime(600);
    const storedBeforeUnmount = localStorage.getItem(draftKeyFor('biz-1', 'prod-2'));
    expect(JSON.parse(storedBeforeUnmount).formData.nombre).toBe('Editado, espero el debounce');

    unmount();
    const storedAfterUnmount = localStorage.getItem(draftKeyFor('biz-1', 'prod-2'));
    expect(JSON.parse(storedAfterUnmount).formData.nombre).toBe('Editado, espero el debounce');
  });
});

describe('product-editor: producto nuevo vs producto existente', () => {
  it('producto nuevo: el borrador se auto-restaura en el campo (formulario seguía vacío)', async () => {
    const { unmount } = renderEditor();
    await waitForFormReady();
    await typeName('Producto nuevo sin guardar');
    unmount();

    renderEditor();
    await waitForFormReady();
    // Caso seguro (formulario vacío): el valor se auto-aplica de inmediato al campo,
    // aunque el banner igual se ofrece para poder descartar el borrador explícitamente.
    await waitFor(() => expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).value).toBe('Producto nuevo sin guardar'));
  });

  it('producto existente: NO se auto-restaura; requiere el banner y el clic en "Restaurar"', async () => {
    mockGetProduct.mockResolvedValue({
      data: { id: 'prod-4', name: 'Producto existente', price: 1000, updatedAt: new Date(Date.now() - 3600_000).toISOString() },
      error: null,
    });
    const { unmount } = renderEditor('?id=prod-4');
    await waitForFormReady();
    await typeName('Producto existente MODIFICADO');
    unmount();

    renderEditor('?id=prod-4');
    await waitForFormReady();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).value).toBe('Producto existente');
    expect(screen.getByText(DRAFT_BANNER_TEXT)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).value).toBe('Producto existente MODIFICADO');
  });
});

describe('product-editor: recarga de página', () => {
  it('recargar (nuevo montaje con el mismo localStorage) recupera el borrador vía el banner', async () => {
    mockGetProduct.mockResolvedValue({
      data: { id: 'prod-5', name: 'Antes de recargar', price: 1000, updatedAt: new Date(Date.now() - 3600_000).toISOString() },
      error: null,
    });
    const { unmount } = renderEditor('?id=prod-5');
    await waitForFormReady();
    await typeName('Editado antes de recargar');
    vi.advanceTimersByTime(600);
    unmount(); // localStorage sobrevive a una recarga real; un remontaje la simula fielmente

    renderEditor('?id=prod-5');
    await waitForFormReady();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).value).toBe('Editado antes de recargar');
  });
});

describe('product-editor: staleness — comparación contra el updatedAt real del servidor', () => {
  it('respuesta del servidor más nueva que el borrador: no se ofrece y se descarta', async () => {
    const key = draftKeyFor('biz-1', 'prod-6');
    localStorage.setItem(key, JSON.stringify({
      formData: { nombre: 'Borrador viejo' },
      images: [], hasUnpersistedImages: false,
      savedAt: Date.now() - 3600_000, // hace 1 hora
    }));
    mockGetProduct.mockResolvedValue({
      data: { id: 'prod-6', name: 'Servidor más nuevo', price: 1000, updatedAt: new Date().toISOString() }, // actualizado ahora
      error: null,
    });

    renderEditor('?id=prod-6');
    await waitForFormReady();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).value).toBe('Servidor más nuevo');
    expect(screen.queryByText(DRAFT_BANNER_TEXT)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('borrador más nuevo que el servidor: sí se ofrece', async () => {
    const key = draftKeyFor('biz-1', 'prod-7');
    localStorage.setItem(key, JSON.stringify({
      formData: { nombre: 'Borrador más nuevo' },
      images: [], hasUnpersistedImages: false,
      savedAt: Date.now(),
    }));
    mockGetProduct.mockResolvedValue({
      data: { id: 'prod-7', name: 'Servidor viejo', price: 1000, updatedAt: new Date(Date.now() - 3600_000).toISOString() },
      error: null,
    });

    renderEditor('?id=prod-7');
    await waitForFormReady();
    expect(screen.getByText(DRAFT_BANNER_TEXT)).toBeTruthy();
  });

  it('borrador con savedAt inválido: se trata como no confiable, no se ofrece', async () => {
    const key = draftKeyFor('biz-1', 'prod-8');
    localStorage.setItem(key, JSON.stringify({
      formData: { nombre: 'Borrador con timestamp roto' },
      images: [], hasUnpersistedImages: false,
      savedAt: 'no-es-un-numero',
    }));
    mockGetProduct.mockResolvedValue({
      data: { id: 'prod-8', name: 'Servidor válido', price: 1000, updatedAt: new Date().toISOString() },
      error: null,
    });

    renderEditor('?id=prod-8');
    await waitForFormReady();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).value).toBe('Servidor válido');
    expect(screen.queryByText(DRAFT_BANNER_TEXT)).toBeNull();
  });

  it('producto nuevo: sin updatedAt del servidor con qué comparar, el borrador siempre es elegible aunque sea antiguo', async () => {
    const key = draftKeyFor('biz-1', 'new');
    localStorage.setItem(key, JSON.stringify({
      formData: { nombre: 'Borrador nuevo antiguo' },
      images: [], hasUnpersistedImages: false,
      savedAt: Date.now() - 30 * 24 * 3600_000, // 30 días
    }));

    renderEditor();
    await waitForFormReady();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).value).toBe('Borrador nuevo antiguo');
  });
});

describe('product-editor: aislamiento entre productos y entre negocios', () => {
  it('el borrador de un producto nunca aparece al abrir otro producto distinto', async () => {
    mockGetProduct.mockImplementation(async (id) => ({
      data: { id, name: id === 'prod-A' ? 'Producto A' : 'Producto B', price: 1, updatedAt: new Date(Date.now() - 3600_000).toISOString() },
      error: null,
    }));

    const { unmount } = renderEditor('?id=prod-A');
    await waitForFormReady();
    await typeName('Edición exclusiva de A');
    unmount();

    renderEditor('?id=prod-B');
    await waitForFormReady();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).value).toBe('Producto B');
    expect(screen.queryByText(DRAFT_BANNER_TEXT)).toBeNull();
  });

  it('el borrador de un negocio nunca aparece en otro negocio, aun con el mismo id de producto', async () => {
    mockGetProduct.mockResolvedValue({
      data: { id: 'prod-shared', name: 'Mismo id de producto', price: 1, updatedAt: new Date(Date.now() - 3600_000).toISOString() },
      error: null,
    });

    setBusiness({ business: { id: 'biz-X', slug: 'x', planSlug: 'business', designSettings: {} } });
    const { unmount } = renderEditor('?id=prod-shared');
    await waitForFormReady();
    await typeName('Edición exclusiva del negocio X');
    unmount();

    setBusiness({ business: { id: 'biz-Y', slug: 'y', planSlug: 'business', designSettings: {} } });
    renderEditor('?id=prod-shared');
    await waitForFormReady();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER).value).toBe('Mismo id de producto');
    expect(screen.queryByText(DRAFT_BANNER_TEXT)).toBeNull();
  });
});

describe('product-editor: guardado exitoso limpia el borrador, guardado fallido lo conserva', () => {
  it('guardado exitoso en Supabase elimina el borrador local', async () => {
    mockGetProduct.mockResolvedValue({
      data: { id: 'prod-11', name: 'Original', price: 1000, updatedAt: new Date(Date.now() - 3600_000).toISOString() },
      error: null,
    });
    renderEditor('?id=prod-11');
    await waitForFormReady();
    await typeName('Voy a guardar esto');
    vi.advanceTimersByTime(600);
    expect(localStorage.getItem(draftKeyFor('biz-1', 'prod-11'))).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockUpdateProduct).toHaveBeenCalled());
    await waitFor(() => expect(localStorage.getItem(draftKeyFor('biz-1', 'prod-11'))).toBeNull());
  });

  it('guardado fallido en Supabase conserva el borrador local', async () => {
    mockUpdateProduct.mockResolvedValue({ data: null, error: { message: 'Fallo simulado' } });
    mockGetProduct.mockResolvedValue({
      data: { id: 'prod-12', name: 'Original', price: 1000, updatedAt: new Date(Date.now() - 3600_000).toISOString() },
      error: null,
    });
    renderEditor('?id=prod-12');
    await waitForFormReady();
    await typeName('Esto no se va a guardar');
    vi.advanceTimersByTime(600);
    expect(localStorage.getItem(draftKeyFor('biz-1', 'prod-12'))).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockUpdateProduct).toHaveBeenCalled());
    expect(localStorage.getItem(draftKeyFor('biz-1', 'prod-12'))).not.toBeNull();
  });
});
