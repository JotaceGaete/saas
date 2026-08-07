import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../../components/ui/Toast';
import { buildProductDraftKey, getDraftImageBlob } from '../../lib/productDraftStorage';

const mocks = vi.hoisted(() => ({
  auth: { current: null },
  getProduct: vi.fn(),
  createProduct: vi.fn(),
  createProductDraft: vi.fn(),
  updateProduct: vi.fn(),
  deleteTemporaryProductDraft: vi.fn(),
  uploadProductImage: vi.fn(),
  uploadProductMainImage: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => mocks.auth.current }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../../services/crmService', () => ({
  generateUniqueBarcode: async () => ({ barcode: '2000000000000', error: null }),
  saveProductBarcode: async () => ({ data: null, error: null }),
}));
vi.mock('../../utils/imageUploadUtils', () => ({
  convertUnsupportedImageToJpeg: async (file) => file,
  generateCardThumbnail: async () => null,
}));
vi.mock('../../services/mediaUploadService', () => ({
  appendCacheBust: (url) => url,
  uploadToMediaService: async () => ({ url: 'https://cdn/thumb.jpg' }),
  getProductImageMaxBytes: () => 10 * 1024 * 1024,
  validateProductImageFile: () => '',
}));
vi.mock('../../services/waBusinessService', () => ({
  getProduct: (...args) => mocks.getProduct(...args),
  createProduct: (...args) => mocks.createProduct(...args),
  createProductDraft: (...args) => mocks.createProductDraft(...args),
  deleteTemporaryProductDraft: (...args) => mocks.deleteTemporaryProductDraft(...args),
  updateProduct: (...args) => mocks.updateProduct(...args),
  uploadProductImage: (...args) => mocks.uploadProductImage(...args),
  uploadProductMainImage: (...args) => mocks.uploadProductMainImage(...args),
  getProducts: async () => ({ data: [] }),
  getMyBusiness: async () => ({ data: null }),
  getCategoriesByRubroId: async () => ({ data: [] }),
  getBusinessCategories: async () => ({ data: [] }),
  getEffectivePlanSlug: (slug) => slug || 'starter',
  slugifyProductName: (value) => String(value || 'producto').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
}));

const { default: ProductEditor } = await import('./index');

const NAME_PLACEHOLDER = 'Ej: Camiseta de algodón premium';
const PRICE_PLACEHOLDER = 'Ej: precio en entero';
let objectUrlSequence = 0;

function setBusiness(id = 'biz-1') {
  mocks.auth.current = {
    user: { id: 'user-1', user_metadata: {} },
    business: { id, slug: id, planSlug: 'business', designSettings: {} },
    businessLoading: false,
    refreshBusiness: vi.fn(),
  };
}

function renderEditor(search = '') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/product-editor${search}`]}>
        <Routes>
          <Route path="/product-editor" element={<ProductEditor />} />
          <Route path="/product-management" element={<div>Productos</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function ready() {
  await waitFor(() => expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toBeInTheDocument());
}

function typeRequired(name = 'Producto draft', price = '1000') {
  fireEvent.change(screen.getByPlaceholderText(NAME_PLACEHOLDER), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText(PRICE_PLACEHOLDER), { target: { value: price } });
}

function selectImages(container, files) {
  const input = container.querySelector('input[type="file"][multiple]');
  fireEvent.change(input, { target: { files } });
}

beforeEach(() => {
  localStorage.clear();
  objectUrlSequence = 0;
  URL.createObjectURL = vi.fn(() => `blob:test-${++objectUrlSequence}`);
  URL.revokeObjectURL = vi.fn();
  window.matchMedia = vi.fn(() => ({
    matches: false, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
  window.scrollTo = vi.fn();
  window.confirm = vi.fn(() => true);
  setBusiness();
  mocks.getProduct.mockReset();
  mocks.createProduct.mockReset().mockResolvedValue({ data: { id: 'created-product', slug: 'created' }, error: null });
  mocks.createProductDraft.mockReset().mockResolvedValue({ data: { id: 'temporary-1', name: 'Temporal', isActive: false }, error: null });
  mocks.updateProduct.mockReset().mockResolvedValue({ data: { id: 'temporary-1', name: 'Saved', slug: 'saved' }, error: null });
  mocks.deleteTemporaryProductDraft.mockReset().mockResolvedValue({ deleted: true, error: null });
  mocks.uploadProductImage.mockReset().mockResolvedValue({ url: 'https://cdn/gallery.jpg', error: null });
  mocks.uploadProductMainImage.mockReset().mockResolvedValue({ url: 'https://cdn/main.jpg', thumbnailUrl: 'https://cdn/main-thumb.jpg', thumbnailPath: 'thumb-key' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProductEditor draft lifecycle', () => {
  it('texto sobrevive a navegación antes del debounce y se restaura automáticamente en producto nuevo', async () => {
    const first = renderEditor();
    await ready();
    fireEvent.change(screen.getByPlaceholderText(NAME_PLACEHOLDER), { target: { value: 'Antes del debounce' } });
    expect(localStorage.getItem(buildProductDraftKey('biz-1', null))).toBeNull();
    first.unmount();
    expect(JSON.parse(localStorage.getItem(buildProductDraftKey('biz-1', null))).formData.nombre).toBe('Antes del debounce');
    renderEditor();
    await ready();
    await waitFor(() => expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toHaveValue('Antes del debounce'));
  });

  it('texto después del debounce y refresh/remount conserva el borrador', async () => {
    const first = renderEditor();
    await ready();
    fireEvent.change(screen.getByPlaceholderText(NAME_PLACEHOLDER), { target: { value: 'Después del debounce' } });
    await waitFor(() => expect(localStorage.getItem(buildProductDraftKey('biz-1', null))).not.toBeNull(), { timeout: 1500 });
    first.unmount();
    renderEditor();
    await ready();
    await waitFor(() => expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toHaveValue('Después del debounce'));
  });

  it('imagen aún local, varias imágenes, orden y currentProductId temporal sobreviven; guardar reutiliza el draft y limpia ambos stores', async () => {
    mocks.uploadProductMainImage.mockImplementation(() => new Promise(() => {}));
    mocks.uploadProductImage.mockImplementation(() => new Promise(() => {}));
    const first = renderEditor();
    await ready();
    typeRequired();
    const files = [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ];
    selectImages(first.container, files);
    await waitFor(() => expect(mocks.createProductDraft).toHaveBeenCalledOnce());
    await waitFor(() => {
      const draft = JSON.parse(localStorage.getItem(buildProductDraftKey('biz-1', null)));
      expect(draft.currentProductId).toBe('temporary-1');
      expect(draft.temporaryProductDraft).toBe(true);
      expect(draft.images.map((image) => image.name)).toEqual(['one.png', 'two.png']);
    });
    const storedBefore = JSON.parse(localStorage.getItem(buildProductDraftKey('biz-1', null)));
    expect(await getDraftImageBlob(storedBefore.images[0].blobKey)).toBeInstanceOf(Blob);
    first.unmount();

    mocks.uploadProductMainImage.mockResolvedValue({ url: 'https://cdn/retried-main.jpg', thumbnailUrl: null, thumbnailPath: null });
    mocks.uploadProductImage.mockResolvedValue({ url: 'https://cdn/retried-gallery.jpg', error: null });
    const restored = renderEditor();
    await ready();
    await waitFor(() => expect(restored.container.querySelectorAll('img[alt*="Imagen de producto"]').length).toBeGreaterThanOrEqual(2));
    const saveButton = screen.getByRole('button', { name: /Guardar (producto|cambios)/ });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    fireEvent.click(saveButton);
    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledOnce());
    expect(mocks.createProduct).not.toHaveBeenCalled();
    await waitFor(() => expect(localStorage.getItem(buildProductDraftKey('biz-1', null))).toBeNull());
    expect(await getDraftImageBlob(storedBefore.images[0].blobKey)).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('imagen cuyo upload terminó queda como URL remota y sobrevive sin depender del blob URL', async () => {
    const first = renderEditor();
    await ready();
    selectImages(first.container, [new File(['image'], 'remote.png', { type: 'image/png' })]);
    await waitFor(() => {
      const draft = JSON.parse(localStorage.getItem(buildProductDraftKey('biz-1', null)));
      expect(draft.images[0].persistedUrl).toBe('https://cdn/main.jpg');
    });
    first.unmount();
    const second = renderEditor();
    await ready();
    await waitFor(() => expect(second.container.querySelector('img[src="https://cdn/main.jpg"]')).toBeTruthy());
  });

  it('guardado fallido conserva localStorage e IndexedDB', async () => {
    mocks.updateProduct.mockResolvedValue({ data: null, error: { message: 'fallo' } });
    const view = renderEditor();
    await ready();
    typeRequired();
    selectImages(view.container, [new File(['image'], 'failure.png', { type: 'image/png' })]);
    await waitFor(() => expect(mocks.createProductDraft).toHaveBeenCalled());
    const key = buildProductDraftKey('biz-1', null);
    await waitFor(() => expect(localStorage.getItem(key)).not.toBeNull());
    const blobKey = JSON.parse(localStorage.getItem(key)).images[0].blobKey;
    fireEvent.click(screen.getByRole('button', { name: /Guardar (producto|cambios)/ }));
    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalled());
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(await getDraftImageBlob(blobKey)).toBeInstanceOf(Blob);
  });

  it('descarte explícito confirmado limpia stores y solo solicita borrar el draft temporal seguro', async () => {
    const view = renderEditor();
    await ready();
    typeRequired();
    selectImages(view.container, [new File(['image'], 'discard.png', { type: 'image/png' })]);
    const key = buildProductDraftKey('biz-1', null);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)).currentProductId).toBe('temporary-1'));
    const blobKey = JSON.parse(localStorage.getItem(key)).images[0].blobKey;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador' }));
      await waitFor(() => expect(mocks.deleteTemporaryProductDraft).toHaveBeenCalledWith('temporary-1', 'biz-1'));
    });
    expect(localStorage.getItem(key)).toBeNull();
    expect(await getDraftImageBlob(blobKey)).toBeNull();
  });

  it('borradores de negocios distintos no se mezclan', async () => {
    const first = renderEditor();
    await ready();
    fireEvent.change(screen.getByPlaceholderText(NAME_PLACEHOLDER), { target: { value: 'Solo negocio uno' } });
    first.unmount();
    setBusiness('biz-2');
    renderEditor();
    await ready();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toHaveValue('');
  });

  it('borradores de productos distintos no se mezclan y uno antiguo no pisa servidor nuevo', async () => {
    const oldServerTime = new Date(Date.now() - 60_000).toISOString();
    mocks.getProduct.mockResolvedValue({ data: { id: 'p-1', name: 'Servidor P1', price: 1000, updatedAt: oldServerTime }, error: null });
    const first = renderEditor('?id=p-1');
    await ready();
    fireEvent.change(screen.getByPlaceholderText(NAME_PLACEHOLDER), { target: { value: 'Draft P1' } });
    first.unmount();

    mocks.getProduct.mockResolvedValue({ data: { id: 'p-2', name: 'Servidor P2', price: 2000, updatedAt: new Date().toISOString() }, error: null });
    renderEditor('?id=p-2');
    await ready();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toHaveValue('Servidor P2');
    expect(screen.queryByText(/cambios sin guardar recuperados/i)).toBeNull();

    cleanup();
    mocks.getProduct.mockResolvedValue({ data: { id: 'p-1', name: 'Servidor P1 más nuevo', price: 3000, updatedAt: new Date(Date.now() + 60_000).toISOString() }, error: null });
    renderEditor('?id=p-1');
    await ready();
    expect(screen.getByPlaceholderText(NAME_PLACEHOLDER)).toHaveValue('Servidor P1 más nuevo');
    expect(screen.queryByText(/cambios sin guardar recuperados/i)).toBeNull();
  });
});
