const DB_KEY = 'walinka-e2e-products';
const readDb = () => { try { return JSON.parse(localStorage.getItem(DB_KEY) || '[]'); } catch { return []; } };
const writeDb = (rows) => localStorage.setItem(DB_KEY, JSON.stringify(rows));
const businessId = () => localStorage.getItem('walinka-e2e-business') || 'business-a';
const now = () => new Date().toISOString();
const id = () => `product-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const uploadDelay = () => new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('walinka-e2e-upload-delay') || 0)));
const map = (row) => row ? ({
  id: row.id, name: row.name, price: row.price, description: row.description, longDescription: row.longDescription,
  category: row.category, sku: row.sku, barcode: row.barcode, images: row.images || [], imageUrl: row.imageUrl || null,
  isActive: row.isActive !== false, isDraft: row.isDraft === true, updatedAt: row.updatedAt,
  featured: false, onSale: false, showPrice: true, showInPos: false, addOns: [], comboConfig: null,
}) : null;

export async function getProduct(productId) {
  const row = readDb().find((item) => item.id === productId && item.businessId === businessId());
  return row ? { data: map(row), error: null } : { data: null, error: { message: 'not found' } };
}

export async function createProduct(targetBusinessId, data) {
  if (localStorage.getItem('walinka-e2e-fail-save') === 'true' && data?.isDraft !== true) return { data: null, error: { message: 'Fallo E2E' } };
  const row = { ...data, id: id(), businessId: targetBusinessId, isDraft: data?.isDraft === true, updatedAt: now() };
  writeDb([...readDb(), row]);
  return { data: map(row), error: null };
}

export const createProductDraft = (targetBusinessId, data = {}) => createProduct(targetBusinessId, {
  name: data.name || 'Producto temporal', price: Number(data.price) || 1, description: data.description || null,
  category: data.category || null, images: [], imageUrl: null, isDraft: true, isActive: false,
});

export async function updateProduct(productId, data) {
  if (localStorage.getItem('walinka-e2e-fail-save') === 'true' && data?.isDraft !== true) return { data: null, error: { message: 'Fallo E2E' } };
  const rows = readDb();
  const index = rows.findIndex((row) => row.id === productId && row.businessId === businessId());
  if (index < 0) return { data: null, error: { message: 'not found' } };
  rows[index] = { ...rows[index], ...data, isDraft: data?.isDraft === true, updatedAt: now() };
  writeDb(rows);
  return { data: map(rows[index]), error: null };
}

export async function deleteTemporaryProductDraft(productId, targetBusinessId) {
  const rows = readDb();
  const matching = rows.find((row) => row.id === productId && row.businessId === targetBusinessId && row.isDraft === true);
  if (!matching) return { deleted: false, error: null };
  writeDb(rows.filter((row) => row !== matching));
  return { deleted: true, error: null };
}

const remoteUrl = (file, suffix) => `data:${file.type || 'image/png'};base64,${btoa(file.name + '-' + suffix)}`;
export async function uploadProductMainImage({ file }) { await uploadDelay(); return { url: remoteUrl(file, 'main'), thumbnailUrl: null, thumbnailPath: null }; }
export async function uploadProductImage(file) { await uploadDelay(); return { url: remoteUrl(file, 'gallery'), error: null }; }
export async function getProducts(targetBusinessId) { return { data: readDb().filter((row) => row.businessId === targetBusinessId && !row.isDraft).map(map) }; }
export async function getMyBusiness() { return { data: { id: businessId() }, error: null }; }
export async function getCategoriesByRubroId() { return { data: [] }; }
export async function getBusinessCategories() { return { data: [] }; }
export async function createBusinessCategory() { return { data: null, error: null }; }
export const getEffectivePlanSlug = (slug) => slug || 'business';
export const slugifyProductName = (value) => String(value || 'producto').toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const __e2e = {
  reset() { localStorage.removeItem(DB_KEY); localStorage.removeItem('walinka-e2e-fail-save'); localStorage.removeItem('walinka-e2e-upload-delay'); localStorage.setItem('walinka-e2e-business', 'business-a'); },
  rows() { return readDb(); },
  setBusiness(value) { localStorage.setItem('walinka-e2e-business', value); },
  failSave(value) { localStorage.setItem('walinka-e2e-fail-save', value ? 'true' : 'false'); },
  uploadDelay(ms) { localStorage.setItem('walinka-e2e-upload-delay', String(ms || 0)); },
  seed(row) { const seeded = { id: row.id || id(), businessId: row.businessId || businessId(), name: row.name || 'Seed', price: row.price || 1000, images: row.images || [], isDraft: false, isActive: true, updatedAt: row.updatedAt || now(), ...row }; writeDb([...readDb().filter((item) => item.id !== seeded.id), seeded]); return seeded; },
  updateServer(productId, patch) { const rows = readDb(); const index = rows.findIndex((row) => row.id === productId); rows[index] = { ...rows[index], ...patch, updatedAt: patch.updatedAt || now() }; writeDb(rows); },
};
