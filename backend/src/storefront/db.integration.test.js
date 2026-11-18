/**
 * Pruebas de integración contra PostgreSQL (réplica local): aislamiento entre comercios,
 * banners, empates y desempate por id, límites y permisos reales de los roles públicos.
 * Requiere: node --import /home/claude/storefront-integration/preload.mjs --test ...
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStorefrontHandlerFromEnv } from './handler.js';
import { createPgRpc } from './sqlSelect.js';
import { createCursorCodec } from './cursor.js';

const hasDb = typeof globalThis.__WALINKA_PG_POOL__ === 'object';
const SKIP = hasDb ? false : 'requiere PostgreSQL (preload de la réplica)';
const SECRET = 'parity-test-secret-0123456789';
const pool = globalThis.__WALINKA_PG_POOL__;
const q = (text, values) => pool.query(text, values);
const TIE_BIZ = '00000000-0000-5000-8000-00000000f00d';

const handler = hasDb
  ? createStorefrontHandlerFromEnv({ rpc: createPgRpc(q), env: { WALINKA_CURSOR_SECRET: SECRET } })
  : null;
const call = async (path) => {
  const res = await handler(new Request(`http://localhost${path}`));
  return { status: res.status, body: await res.json() };
};
const idsOf = (rows) => rows.map((r) => r.id);

/** Recorre todas las páginas de un listado (no confiar en un único límite). */
async function allPages(path) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 500; i++) {
    const r = await call(`${path}${path.includes('?') ? '&' : '?'}limit=60${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    assert.equal(r.status, 200);
    out.push(...r.body.data);
    cursor = r.body.meta.nextCursor;
    if (!cursor) return out;
  }
  throw new Error('paginación sin fin');
}

async function bizId(slug) {
  return (await q('select id from wa_businesses where slug = $1', [slug])).rows[0].id;
}

before(async () => {
  if (!hasDb) return;
  await q('delete from wa_businesses where slug = $1', ['tie-demo']);
  await q(`insert into wa_businesses (id, slug, name, is_active, design_settings) values ($1, 'tie-demo', 'Tie demo', true, '{}')`, [TIE_BIZ]);
  // 70 productos: precios repetidos y nombres que difieren solo en tildes y mayúsculas.
  const names = ['Cafe', 'café', 'CAFE', 'Pastel', 'pastél'];
  const rows = [];
  for (let i = 0; i < 70; i++) {
    const id = `00000000-0000-5000-8000-${String(i).padStart(12, '0').replace(/^/, '')}`;
    rows.push([id, `p${i}`, names[i % names.length], 100 + (i % 3) * 50, i]);
  }
  for (const [id, slug, name, price, order] of rows) {
    await q(`insert into wa_products (id, business_id, slug, name, category, price, is_active, status, is_draft, sort_order, show_price, on_sale, featured, is_main_featured, is_sold_out, stock_actual, stock_minimo)
             values ($1, $2, $3, $4, 'Tie', $5, true, 'active', false, $6, true, false, false, false, false, null, null)`,
      [id, TIE_BIZ, slug, name, price, order]);
  }
  // Un producto oculto del mismo comercio no debe aparecer.
  await q(`insert into wa_products (id, business_id, slug, name, category, price, is_active, status, is_draft, sort_order, show_price, on_sale, featured, is_main_featured, is_sold_out)
           values ('00000000-0000-5000-8000-0000000000ff', $1, 'oculto', 'Oculto', 'Tie', 1, true, 'archived', false, 999, true, false, false, false, false)`, [TIE_BIZ]);
});

after(async () => {
  if (!hasDb) return;
  await q('delete from wa_storefront_banners where business_id in (select id from wa_businesses where slug in (\'tie-demo\'))');
  await q('delete from wa_products where business_id in (select id from wa_businesses where slug = $1)', ['tie-demo']);
  await q('delete from wa_businesses where slug = $1', ['tie-demo']);
  await q("delete from wa_storefront_banners where alt_text like 'prueba-%'");
  await globalThis.__WALINKA_PG_POOL_END__?.();
});

test('aislamiento: producto de otro comercio no es visible por slug ajeno', { skip: SKIP }, async () => {
  const r = await call('/v1/stores/ropa-demo/products/cafe-espresso');
  assert.equal(r.status, 404);
});

test('aislamiento: el listado de un comercio no contiene productos de otro', { skip: SKIP }, async () => {
  const cafe = await call('/v1/stores/cafe-demo/products?limit=60');
  const ropa = await call('/v1/stores/ropa-demo/products?limit=60');
  const cafeIds = new Set(idsOf(cafe.body.data));
  for (const id of idsOf(ropa.body.data)) assert.ok(!cafeIds.has(id), 'ids de ropa no deben aparecer en cafe');
  assert.ok(ropa.body.data.length > 0);
});

test('aislamiento: cursor de un comercio es inválido en otro', { skip: SKIP }, async () => {
  const first = await call('/v1/stores/cafe-demo/products?limit=1');
  assert.ok(first.body.meta.nextCursor);
  const r = await call(`/v1/stores/ropa-demo/products?limit=1&cursor=${encodeURIComponent(first.body.meta.nextCursor)}`);
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'INVALID_CURSOR');
});

test('cursor firmado con id que no es uuid se rechaza aunque la firma sea válida', { skip: SKIP }, async () => {
  const codec = createCursorCodec({ secret: SECRET });
  const forged = codec.encode({ sort: 'manual', key: 1, id: "x'; drop table wa_products;--", scope: 'cafe-demo|products|*|*|' });
  const r = await call(`/v1/stores/cafe-demo/products?limit=1&cursor=${encodeURIComponent(forged)}`);
  assert.equal(r.status, 400);
});

test('banners: solo activos, vigentes y del comercio, en orden por posición', { skip: SKIP }, async () => {
  const cafe = await bizId('cafe-demo');
  const ropa = await bizId('ropa-demo');
  const ins = (biz, status, pos, extra = '') => q(
    `insert into wa_storefront_banners (business_id, placement, position, desktop_image_url, alt_text, status, link_url, starts_at, ends_at)
     values ($1, 'home_hero', $2, 'https://img.example.test/d.jpg', $3, $4, ${extra || 'null, null, null'})`,
    [biz, pos, `prueba-${status}-${pos}`, status]);
  await ins(cafe, 'active', 2, "'/cafe', null, null");
  await ins(cafe, 'active', 1, "'https://ejemplo.test/oferta', now() - interval '1 day', now() + interval '1 day'");
  await ins(cafe, 'draft', 0);
  await ins(cafe, 'paused', 0);
  await ins(cafe, 'active', 0, "null, now() - interval '3 days', now() - interval '1 day'");
  await ins(cafe, 'active', 0, "null, now() + interval '1 day', null");
  await ins(ropa, 'active', 0, "null, null, null");

  const r = await call('/v1/stores/cafe-demo/banners?placement=home_hero');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.map((b) => b.altText), ['prueba-active-1', 'prueba-active-2']);
  assert.equal(r.body.data[0].linkUrl, 'https://ejemplo.test/oferta');
  assert.equal(r.body.data[1].linkUrl, '/cafe');
  assert.ok(r.body.data.every((b) => b.desktopImageUrl.startsWith('https://')));

  const ropaBanners = await call('/v1/stores/ropa-demo/banners?placement=home_hero');
  assert.ok(ropaBanners.body.data.every((b) => !b.altText.startsWith('prueba-') || b.altText.startsWith('prueba-active-0')));
  assert.ok(!ropaBanners.body.data.some((b) => b.altText === 'prueba-active-1'), 'banner de cafe no debe verse en ropa');
});

test('banners: enlace javascript: o http no se puede guardar', { skip: SKIP }, async () => {
  const cafe = await bizId('cafe-demo');
  await assert.rejects(q(
    `insert into wa_storefront_banners (business_id, placement, desktop_image_url, alt_text, link_url, status)
     values ($1, 'catalog_top', 'https://img.example.test/d.jpg', 'prueba-js', 'javascript:alert(1)', 'active')`, [cafe]));
  await assert.rejects(q(
    `insert into wa_storefront_banners (business_id, placement, desktop_image_url, alt_text, link_url, status)
     values ($1, 'catalog_top', 'https://img.example.test/d.jpg', 'prueba-http', 'http://inseguro.test', 'active')`, [cafe]));
});

test('empates: orden determinista con id como desempate, también al paginar de a uno', { skip: SKIP }, async () => {
  for (const sort of ['price_asc', 'price_desc', 'name_asc', 'manual']) {
    const full = await allPages(`/v1/stores/tie-demo/products?sort=${sort}`);
    const walked = [];
    let cursor = null;
    for (let i = 0; i < 200; i++) {
      const path = `/v1/stores/tie-demo/products?sort=${sort}&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const r = await call(path);
      assert.equal(r.status, 200, `${sort} paso ${i}`);
      walked.push(...r.body.data);
      cursor = r.body.meta.nextCursor;
      if (!cursor) break;
    }
    assert.equal(walked.length, 70, `${sort}: 70 productos públicos, el oculto no entra`);
    assert.deepEqual(walked.map((p) => p.id), idsOf(full), `${sort}: paginación igual al listado`);
    assert.ok(!walked.some((p) => p.slug === 'oculto'));
  }
  // Precios iguales: el desempate es por id ascendente.
  const asc = await allPages('/v1/stores/tie-demo/products?sort=price_asc');
  const at100 = asc.filter((p) => p.price === 100).map((p) => p.id);
  assert.deepEqual(at100, [...at100].sort());
});

test('límites: limit enorme se acota a 60 y la página siguiente existe', { skip: SKIP }, async () => {
  const r = await call('/v1/stores/tie-demo/products?limit=100000');
  assert.equal(r.body.meta.limit, 60);
  assert.equal(r.body.data.length, 60);
  assert.ok(r.body.meta.nextCursor);
});

test('límites: la función SQL también acota p_limit y rechaza sort o filter inválidos', { skip: SKIP }, async () => {
  const biz = await bizId('tie-demo');
  const r0 = await q('select id from storefront_list_products($1, $2, null, null, null, null, null, $3)', [biz, 'manual', 0]);
  assert.equal(r0.rowCount, 1);
  const rBig = await q('select id from storefront_list_products($1, $2, null, null, null, null, null, $3)', [biz, 'manual', 1000]);
  assert.equal(rBig.rowCount, 61);
  await assert.rejects(q('select * from storefront_list_products($1, $2)', [biz, 'orden_raro']), /sort inválido/);
  await assert.rejects(q('select * from storefront_list_products($1, $2, $3)', [biz, 'manual', 'nuevo']), /filter inválido/);
});

test('búsqueda insensible a tildes y mayúsculas en PostgreSQL', { skip: SKIP }, async () => {
  const r = await call('/v1/stores/tie-demo/search?q=CAFE&sort=name_asc&limit=60');
  // 70 productos: 42 llevan Cafe/café/CAFE y 28 llevan Pastel/pastél.
  assert.equal(r.body.data.length, 42, 'Cafe, café y CAFE coinciden entre sí');
  const acento = await call('/v1/stores/tie-demo/search?q=pastel&sort=name_asc&limit=60');
  assert.equal(acento.body.data.length, 28, 'pastel encuentra pastél');
  assert.ok(acento.body.data.every((p) => /past[eé]l/i.test(p.name)));
});

test('permisos: anon y authenticated no leen la vista, la tabla de banners ni ejecutan funciones', { skip: SKIP }, async () => {
  const client = await pool.connect();
  try {
    const denied = async (role, sql, params = []) => {
      await client.query(`set role ${role}`);
      try {
        await client.query(sql, params);
        assert.fail(`${role} no debería poder: ${sql}`);
      } catch (e) {
        assert.equal(e.code, '42501', `${role}: ${sql} → ${e.message}`);
      } finally {
        await client.query('reset role');
      }
    };
    for (const role of ['anon', 'authenticated']) {
      await denied(role, 'select * from wa_storefront_products_v limit 1');
      await denied(role, 'select * from wa_storefront_banners limit 1');
      await denied(role, 'select * from storefront_business($1)', ['cafe-demo']);
      await denied(role, 'select * from storefront_list_products($1, $2)', [await bizId('cafe-demo'), 'manual']);
    }
  } finally {
    client.release();
  }
});
