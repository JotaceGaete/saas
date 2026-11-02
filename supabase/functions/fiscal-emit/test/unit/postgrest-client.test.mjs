// El cliente PostgREST de prueba debe replicar las reglas de supabase-js que usa store-supabase.
// Se verifica con un fetch falso; la prueba contra PostgREST real está en test/contract/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createPostgrestClient, signRoleJwt } from '../helpers/postgrest-client.mjs';

const SECRET = 'secreto-de-prueba-de-al-menos-32-caracteres-xx';
const URL_ = 'http://localhost:3999';

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const { status = 200, body = null, text } = handler(String(url), init);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (text !== undefined ? text : body == null ? '' : JSON.stringify(body)),
    };
  };
  return { fn, calls };
}

test('rpc: POST /rpc/<fn> con JSON y la clave en apikey y Authorization', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: 'fiscal_owner' }));
  const c = createPostgrestClient({ url: URL_, key: 'k'.repeat(30), fetchImpl: fn });
  const r = await c.rpc('crm_fiscal_actor_role', { p_business_id: 'b', p_user_id: 'u' });
  assert.deepEqual(r, { data: 'fiscal_owner', error: null });
  assert.equal(calls[0].url, `${URL_}/rpc/crm_fiscal_actor_role`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.apikey, 'k'.repeat(30));
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${'k'.repeat(30)}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_business_id: 'b', p_user_id: 'u' });
});

test('rpc con error de PostgREST: { data: null, error } con code y message intactos', async () => {
  const err = { code: '42501', message: 'permission denied for function crm_fiscal_actor_role' };
  const { fn } = fakeFetch(() => ({ status: 401, body: err }));
  const c = createPostgrestClient({ url: URL_, key: 'k'.repeat(30), fetchImpl: fn });
  assert.deepEqual(await c.rpc('crm_fiscal_actor_role', {}), { data: null, error: err });
});

test('rpc que responde vacío -> data null, sin error', async () => {
  const { fn } = fakeFetch(() => ({ status: 204, text: '' }));
  const c = createPostgrestClient({ url: URL_, key: 'k'.repeat(30), fetchImpl: fn });
  assert.deepEqual(await c.rpc('crm_x', {}), { data: null, error: null });
});

test('maybeSingle: GET con select, filtros eq. y Accept object+json', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: { id: 'x' } }));
  const c = createPostgrestClient({ url: URL_, key: 'k'.repeat(30), fetchImpl: fn });
  const r = await c.from('crm_invoices').select('id, total').eq('id', 'abc').eq('business_id', 'biz').maybeSingle();
  assert.deepEqual(r, { data: { id: 'x' }, error: null });
  const u = new URL(calls[0].url);
  assert.equal(u.pathname, '/crm_invoices');
  assert.equal(u.searchParams.get('select'), 'id, total');
  assert.equal(u.searchParams.get('id'), 'eq.abc');
  assert.equal(u.searchParams.get('business_id'), 'eq.biz');
  assert.equal(calls[0].init.headers.Accept, 'application/vnd.pgrst.object+json');
});

test('maybeSingle sin filas (406 PGRST116) -> data null y error null, como supabase-js', async () => {
  const { fn } = fakeFetch(() => ({ status: 406, body: { code: 'PGRST116', message: 'no rows' } }));
  const c = createPostgrestClient({ url: URL_, key: 'k'.repeat(30), fetchImpl: fn });
  assert.deepEqual(await c.from('t').select('*').eq('id', 'z').maybeSingle(), { data: null, error: null });
});

test('maybeSingle con otro error de PostgREST -> error, no null silencioso', async () => {
  const { fn } = fakeFetch(() => ({ status: 401, body: { code: 'PGRST301', message: 'JWT expired' } }));
  const c = createPostgrestClient({ url: URL_, key: 'k'.repeat(30), fetchImpl: fn });
  const r = await c.from('t').select('*').eq('id', 'z').maybeSingle();
  assert.equal(r.data, null);
  assert.equal(r.error.code, 'PGRST301');
});

test('fallo de red: la promesa se rechaza (no se convierte en error de PostgREST)', async () => {
  const fn = async () => { throw new TypeError('fetch failed'); };
  const c = createPostgrestClient({ url: URL_, key: 'k'.repeat(30), fetchImpl: fn });
  await assert.rejects(c.rpc('crm_x', {}), TypeError);
  await assert.rejects(c.from('t').select('*').eq('id', 'z').maybeSingle(), TypeError);
});

test('constructor rechaza URL no http o clave ausente', () => {
  assert.throws(() => createPostgrestClient({ url: 'ftp://x', key: 'k'.repeat(30) }), /url/);
  assert.throws(() => createPostgrestClient({ url: URL_, key: '' }), /key/);
});

test('signRoleJwt produce HS256 verificable con el secreto y el rol indicado', () => {
  const token = signRoleJwt('service_role', SECRET, { now: 1_700_000_000_000 });
  const [h, p, s] = token.split('.');
  const expected = createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  assert.equal(s, expected);
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  assert.equal(payload.role, 'service_role');
  assert.equal(payload.exp - payload.iat, 3600);
});
