import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAvailability } from './availability.js';
import { pickProductImage } from './images.js';
import { createCursorCodec, cursorSecretFromEnv, InvalidCursorError } from './cursor.js';
import { canUseCustomDomain, assertCustomDomainAllowed } from './domainPolicy.js';
import { mapAddOns, mapCombo, toInternalProductRow, isPubliclyVisible } from './mapping.js';
import { parseListParams, ParamError, createStorefrontService, normalizeText } from './service.js';
import { createStorefrontHandler } from './handler.js';
import { createStorefrontRepository } from './repository.js';

const SECRET = 'unit-test-secret-0123456789';

test('disponibilidad sigue el orden fijo de la regla', () => {
  assert.deepEqual(computeAvailability({ isSoldOut: true, stockActual: 50, stockMinimo: 1 }),
    { availability: 'sold_out', inventoryControlled: true });
  assert.equal(computeAvailability({ isSoldOut: false, stockActual: 0, stockMinimo: null }).availability, 'sold_out');
  assert.equal(computeAvailability({ isSoldOut: false, stockActual: 3, stockMinimo: 5 }).availability, 'low_stock');
  assert.equal(computeAvailability({ isSoldOut: false, stockActual: 5, stockMinimo: 5 }).availability, 'low_stock');
  assert.deepEqual(computeAvailability({ isSoldOut: false, stockActual: null, stockMinimo: null }),
    { availability: 'available', inventoryControlled: false });
});

test('imagen: card → thumbnail → image → images[0]', () => {
  assert.equal(pickProductImage({ card_image_url: 'a', thumbnail_url: 'b', image_url: 'c', images: ['d'] }), 'a');
  assert.equal(pickProductImage({ card_image_url: ' ', thumbnail_url: 'b' }), 'b');
  assert.equal(pickProductImage({ images: ['d'] }), 'd');
  assert.equal(pickProductImage({ images: [] }), null);
});

test('cursor: firma válida, rechaza alteración, otro orden, otro alcance y secreto distinto', () => {
  const c = createCursorCodec({ secret: SECRET });
  const tok = c.encode({ sort: 'price_asc', key: 100, id: 'p1', scope: 'tienda|products|*|*|' });
  assert.equal(c.decode(tok, { sort: 'price_asc', scope: 'tienda|products|*|*|' }).id, 'p1');
  assert.throws(() => c.decode(tok.slice(0, -2) + 'xx', { sort: 'price_asc', scope: 'tienda|products|*|*|' }), InvalidCursorError);
  assert.throws(() => c.decode(tok, { sort: 'name_asc', scope: 'tienda|products|*|*|' }), InvalidCursorError);
  assert.throws(() => c.decode(tok, { sort: 'price_asc', scope: 'otra|products|*|*|' }), InvalidCursorError);
  const otro = createCursorCodec({ secret: 'otro-secreto-0123456789' });
  assert.throws(() => otro.decode(tok, { sort: 'price_asc', scope: 'tienda|products|*|*|' }), InvalidCursorError);
  assert.throws(() => c.decode('no-es-cursor', { sort: 'manual', scope: 'x' }), InvalidCursorError);
});

test('secreto del cursor: fail-closed en producción, mínimo 16 caracteres', () => {
  assert.throws(() => cursorSecretFromEnv({ NODE_ENV: 'production' }));
  assert.throws(() => cursorSecretFromEnv({ VERCEL_ENV: 'production', WALINKA_CURSOR_SECRET: 'corto' }));
  assert.equal(cursorSecretFromEnv({ WALINKA_CURSOR_SECRET: SECRET }), SECRET);
  assert.throws(() => createCursorCodec({ secret: 'corto' }));
});

test('dominios personalizados: comportamiento actual (starter 0, pro 1, business 5)', () => {
  assert.equal(canUseCustomDomain('pro'), true);
  assert.equal(canUseCustomDomain('BUSINESS '), true);
  assert.equal(canUseCustomDomain('starter'), false);
  assert.equal(canUseCustomDomain(undefined), false);
  assert.deepEqual(assertCustomDomainAllowed('pro', 0), { allowed: true, limit: 1 });
  assert.equal(assertCustomDomainAllowed('pro', 1).code, 'DOMAIN_LIMIT_REACHED');
  assert.equal(assertCustomDomainAllowed('business', 4).allowed, true);
  assert.equal(assertCustomDomainAllowed('starter', 0).code, 'PLAN_NO_CUSTOM_DOMAIN');
});

test('complementos: se omiten inactivos, propios y productos no públicos; precio del producto relacionado', () => {
  const visible = new Map([['p2', { id: 'p2', slug: 'otro', name: 'Otro', price: 900.4 }]]);
  const out = mapAddOns([
    { type: 'product', productId: 'p2', active: true },
    { type: 'product', productId: 'p2', active: false },
    { type: 'product', productId: 'p9', active: true },
    { type: 'product', productId: 'p1', active: true },
    { type: 'manual', label: 'Extra', price: null, active: true },
    { type: 'manual', label: '', price: 5, active: true },
    { type: 'manual', label: 'Pan', price: 300, active: true },
  ], 'p1', visible);
  assert.deepEqual(out, [
    { type: 'product', productSlug: 'otro', label: 'Otro', price: 900 },
    { type: 'manual', label: 'Extra', price: null },
    { type: 'manual', label: 'Pan', price: 300 },
  ]);
});

test('combo: solo con enabled true y grupos con ítems', () => {
  assert.equal(mapCombo({ enabled: false, groups: [{ id: 'g', label: 'x', items: [{ id: 'i', label: 'y', price: 1 }] }] }), null);
  assert.equal(mapCombo({ enabled: true, groups: [] }), null);
  assert.equal(mapCombo(null), null);
  assert.deepEqual(mapCombo({ enabled: true, groups: [{ id: 'g', label: 'Tamaño', items: [{ id: 'i1', label: 'Chico', price: null }, { id: 'i2', label: 'Grande', price: 8000 }] }] }),
    [{ id: 'g', label: 'Tamaño', items: [{ id: 'i1', label: 'Chico', price: null }, { id: 'i2', label: 'Grande', price: 8000 }] }]);
});

test('visibilidad pública: activo, status active, no borrador', () => {
  assert.equal(isPubliclyVisible({ is_active: true, status: 'active', is_draft: false }), true);
  assert.equal(isPubliclyVisible({ is_active: true, status: 'inactive', is_draft: false }), false);
  assert.equal(isPubliclyVisible({ is_active: true, status: 'archived', is_draft: false }), false);
  assert.equal(isPubliclyVisible({ is_active: true, status: 'active', is_draft: true }), false);
});

test('categoría por nombre: slug de la tabla si existe, si no derivado del nombre', () => {
  const m = new Map([['Café', 'cafe-tabla']]);
  const a = toInternalProductRow({ id: '1', slug: 's', name: 'n', category: 'Café', price: 1, status: 'active', is_active: true, is_draft: false, sort_order: 0 }, m);
  assert.equal(a.category_slug, 'cafe-tabla');
  const b = toInternalProductRow({ id: '2', slug: 's2', name: 'n', category: 'Pastelería Fina', price: 1, status: 'active', is_active: true, is_draft: false, sort_order: 0 }, m);
  assert.equal(b.category_slug, 'pasteleria-fina');
  assert.equal(b.category_name, 'Pastelería Fina');
});

test('parámetros de listado: inválidos → error; límite acotado', () => {
  assert.throws(() => parseListParams(new URLSearchParams('sort=random')), ParamError);
  assert.throws(() => parseListParams(new URLSearchParams('filter=nuevo')), ParamError);
  assert.throws(() => parseListParams(new URLSearchParams('category=../x')), ParamError);
  assert.equal(parseListParams(new URLSearchParams('limit=0')).limit, 24);
  assert.equal(parseListParams(new URLSearchParams('limit=9999')).limit, 60);
  assert.equal(parseListParams(new URLSearchParams('limit=-4')).limit, 1);
  assert.equal(parseListParams(new URLSearchParams('limit=abc')).limit, 24);
  assert.equal(parseListParams(new URLSearchParams('')).sort, 'manual');
  assert.equal(parseListParams(new URLSearchParams(''), 'name_asc').sort, 'name_asc');
});

test('búsqueda: insensible a tildes y mayúsculas', () => {
  assert.equal(normalizeText('CAFÉ'), 'cafe');
  assert.equal(normalizeText('Pastelería'), normalizeText('pasteleria'));
  assert.equal(normalizeText('Ñandú'), 'nandu');
});

// --- Handler sobre datos mínimos ---
const businesses = [
  { id: 'b1', slug: 'tienda', name: 'Tienda', is_active: true, design_settings: {} },
  { id: 'b2', slug: 'otra', name: 'Otra', is_active: true, design_settings: {} },
];
const products = [
  { id: 'p1', business_id: 'b1', slug: 'uno', name: 'Uno', category: 'Cat', price: 100, sort_order: 1, status: 'active', is_active: true, is_draft: false, stock_actual: 2, stock_minimo: 5 },
  { id: 'p2', business_id: 'b1', slug: 'dos', name: 'Dos', category: 'Cat', price: 200, sort_order: 2, status: 'active', is_active: true, is_draft: false },
  { id: 'p3', business_id: 'b1', slug: 'oculto', name: 'Oculto', category: 'Cat', price: 300, sort_order: 3, status: 'archived', is_active: true, is_draft: false },
];
const fakeSelect = async ({ table, columns, eq = {}, limit }) => {
  const src = { wa_businesses: businesses, wa_products: products, wa_business_categories: [] }[table];
  const rows = src.filter((r) => Object.entries(eq).every(([k, v]) => r[k] === v));
  const picked = rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])));
  return limit ? picked.slice(0, limit) : picked;
};
const handler = createStorefrontHandler({
  service: createStorefrontService({
    repository: createStorefrontRepository({ select: fakeSelect }),
    cursorCodec: createCursorCodec({ secret: SECRET }),
  }),
});
const get = (path, init) => handler(new Request(`http://localhost${path}`, init));

test('rutas: GET únicamente, 405 con Allow', async () => {
  const r = await get('/v1/stores/tienda', { method: 'POST' });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get('allow'), 'GET');
});

test('rutas: tienda inexistente o inactiva → 404; ruta desconocida → 404', async () => {
  assert.equal((await get('/v1/stores/nadie')).status, 404);
  assert.equal((await get('/v1/stores/..%2Fx')).status, 404);
  assert.equal((await get('/v1/stores/tienda/banners')).status, 404, 'banners no expuestos');
  assert.equal((await get('/v1/stores/tienda/pages/menu')).status, 404, 'páginas no expuestas');
});

test('producto oculto o archivado no es público', async () => {
  assert.equal((await get('/v1/stores/tienda/products/oculto')).status, 404);
  assert.equal((await get('/v1/stores/tienda/products/uno')).status, 200);
});

test('la API nunca expone stock numérico ni sku', async () => {
  const body = await (await get('/v1/stores/tienda/products')).json();
  const text = JSON.stringify(body);
  assert.ok(!/"(stock_|stockActual|stockMinimo|stock_actual|stock_minimo)/.test(text), 'sin stock numérico');
  assert.ok(!text.includes('sku'), 'sin sku');
  assert.equal(body.data.find((p) => p.slug === 'uno').availability, 'low_stock');
});

test('cursor de otra tienda o alterado → 400 INVALID_CURSOR', async () => {
  const first = await (await get('/v1/stores/tienda/products?limit=1')).json();
  const tok = first.meta.nextCursor;
  assert.ok(tok, 'hay página siguiente');
  const r = await get(`/v1/stores/otra/products?limit=1&cursor=${encodeURIComponent(tok)}`);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'INVALID_CURSOR');
});

test('parámetro inválido → 400 INVALID_PARAM; búsqueda vacía → lista vacía', async () => {
  const r = await get('/v1/stores/tienda/products?sort=nope');
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'INVALID_PARAM');
  const s = await (await get('/v1/stores/tienda/search?q=')).json();
  assert.deepEqual(s.data, []);
});

test('error interno → 500 genérico sin detalle', async () => {
  const failing = createStorefrontHandler({
    service: { getStore: async () => { throw new Error('secreto de la base'); } },
  });
  const origErr = console.error;
  console.error = () => {};
  try {
    const r = await failing(new Request('http://localhost/v1/stores/tienda'));
    assert.equal(r.status, 500);
    const text = await r.text();
    assert.ok(!text.includes('secreto'));
  } finally {
    console.error = origErr;
  }
});
