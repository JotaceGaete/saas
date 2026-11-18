/**
 * Paridad: el read model en PostgreSQL, alimentado con la semilla real, debe devolver lo mismo
 * que el adaptador demo del starter. Única diferencia permitida: isDemo (live nunca es demo).
 * Requiere la réplica local: node --import /home/claude/storefront-integration/preload.mjs --test ...
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStorefrontHandlerFromEnv } from './handler.js';
import { createPgRpc } from './sqlSelect.js';

const here = dirname(fileURLToPath(import.meta.url));
const expected = JSON.parse(readFileSync(join(here, '__fixtures__/parity-expected.json'), 'utf8'));
const hasDb = typeof globalThis.__WALINKA_PG_QUERY__ === 'function';
const SKIP = hasDb ? false : 'requiere PostgreSQL (preload de la réplica)';
after(() => globalThis.__WALINKA_PG_POOL_END__?.());

const handler = hasDb
  ? createStorefrontHandlerFromEnv({
    rpc: createPgRpc(globalThis.__WALINKA_PG_QUERY__),
    env: { WALINKA_CURSOR_SECRET: 'parity-test-secret-0123456789' },
  })
  : null;

const call = async (path) => {
  const res = await handler(new Request(`http://localhost${path}`));
  return { status: res.status, body: await res.json() };
};

async function collectAll(path) {
  const out = [];
  let url = path;
  for (let i = 0; i < 1000; i++) {
    const { status, body } = await call(url);
    assert.equal(status, 200, `${path} → ${status}`);
    out.push(...body.data);
    if (!body.meta.nextCursor) return out;
    url = `${path}&cursor=${encodeURIComponent(body.meta.nextCursor)}`;
  }
  throw new Error('paginación sin fin');
}

for (const slug of Object.keys(expected)) {
  test(`paridad tienda ${slug}`, { skip: SKIP }, async (t) => {
    const exp = expected[slug];

    await t.test('perfil de tienda', async () => {
      const { status, body } = await call(`/v1/stores/${slug}`);
      assert.equal(status, 200);
      assert.equal(body.data.isDemo, false, 'live nunca es demo');
      const { isDemo, ...rest } = exp.store;
      assert.equal(isDemo, true);
      const { isDemo: _a, ...apiRest } = body.data;
      assert.deepEqual(apiRest, rest);
    });

    await t.test('categorías', async () => {
      const { status, body } = await call(`/v1/stores/${slug}/categories`);
      assert.equal(status, 200);
      assert.deepEqual(body.data, exp.categories);
    });

    await t.test('listados por orden, filtro y categoría (paginados completos)', async () => {
      for (const [key, expectedRows] of Object.entries(exp.listings)) {
        const [sort, filter, category] = key.split('|');
        const params = new URLSearchParams({ sort, limit: '60' });
        if (filter !== '*') params.set('filter', filter);
        if (category !== '*') params.set('category', category);
        const got = await collectAll(`/v1/stores/${slug}/products?${params}`);
        assert.deepEqual(got, expectedRows, `listado ${key}`);
      }
    });

    await t.test('búsquedas (insensibles a tildes)', async () => {
      for (const [q, expectedRows] of Object.entries(exp.searches)) {
        const got = await collectAll(`/v1/stores/${slug}/search?q=${encodeURIComponent(q)}&sort=name_asc&limit=60`);
        assert.deepEqual(got, expectedRows, `búsqueda "${q}"`);
      }
    });

    await t.test('detalle de producto', async () => {
      for (const [productSlug, expectedDetail] of Object.entries(exp.details)) {
        const { status, body } = await call(`/v1/stores/${slug}/products/${productSlug}`);
        if (expectedDetail === null) {
          assert.equal(status, 404, `${productSlug} no debe ser público`);
          continue;
        }
        assert.equal(status, 200, productSlug);
        assert.deepEqual(body.data, expectedDetail, `detalle ${productSlug}`);
      }
    });
  });
}

test('paginación con límite 1 recorre el mismo orden que el listado completo', { skip: SKIP }, async () => {
  const slug = Object.keys(expected)[0];
  const full = expected[slug].listings['manual|*|*'];
  const walked = [];
  let cursor = null;
  for (let i = 0; i < 100; i++) {
    const q = `/v1/stores/${slug}/products?sort=manual&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { body } = await call(q);
    walked.push(...body.data);
    cursor = body.meta.nextCursor;
    if (!cursor) break;
  }
  assert.deepEqual(walked, full);
});
