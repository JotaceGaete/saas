// Contrato de store-supabase contra un PostgREST REAL (no simulado).
//
// Se salta si faltan POSTGREST_URL y POSTGREST_JWT_SECRET. Se niega a correr si la URL no es local
// o si menciona el proyecto de producción. Solo hace LECTURAS con UUID inexistentes: no escribe
// ni emite nada. Ver scripts/postgrest-contract/run.sh para levantar el servidor.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStore } from '../../lib/store-supabase.mjs';
import { StoreError } from '../../lib/store-common.mjs';
import { createPostgrestClient, signRoleJwt } from '../helpers/postgrest-client.mjs';

const PRODUCTION_REF = 'hxxdketymcntadffmajf';
const URL_ = process.env.POSTGREST_URL ?? '';
const SECRET = process.env.POSTGREST_JWT_SECRET ?? '';
const enabled = Boolean(URL_ && SECRET);
const NONEXISTENT = '00000000-0000-4000-8000-000000000000';

let service;
let anon;

before(() => {
  if (!enabled) return;
  const u = new URL(URL_);
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error('contract tests only run against a local PostgREST');
  if (URL_.includes(PRODUCTION_REF)) throw new Error('refusing to run contract tests against production');
  service = createPostgrestClient({ url: URL_, key: signRoleJwt('service_role', SECRET) });
  anon = createPostgrestClient({ url: URL_, key: signRoleJwt('anon', SECRET) });
});

const skip = enabled ? false : 'POSTGREST_URL y POSTGREST_JWT_SECRET no definidos (sin PostgREST real)';

test('lecturas puntuales devuelven null cuando no hay filas (maybeSingle, 406 PGRST116)', { skip }, async () => {
  const store = createSupabaseStore(service);
  assert.equal(await store.loadSaleById(NONEXISTENT), null);
  assert.equal(await store.loadBusiness(NONEXISTENT), null);
  assert.equal(await store.getIssuance(NONEXISTENT, NONEXISTENT), null);
});

test('RPC existentes responden con la forma esperada', { skip }, async () => {
  const store = createSupabaseStore(service);
  assert.equal(await store.loadActorRole(NONEXISTENT, NONEXISTENT), null);
  assert.equal(await store.hasRole(NONEXISTENT, NONEXISTENT, 'fiscal_reconciler'), false);
  assert.deepEqual(await store.listStaleSending(new Date(0)), []);
});

test('rol anon no puede ejecutar RPC fiscales -> STORE_PERMISSION_DENIED (sin detalles)', { skip }, async () => {
  const store = createSupabaseStore(anon);
  await assert.rejects(store.loadActorRole(NONEXISTENT, NONEXISTENT), (err) => {
    assert.ok(err instanceof StoreError);
    assert.equal(err.code, 'STORE_PERMISSION_DENIED');
    return true;
  });
});

test('token firmado con otro secreto es rechazado -> StoreError, nunca un rol falso', { skip }, async () => {
  const forged = createPostgrestClient({ url: URL_, key: signRoleJwt('service_role', 'otro-secreto-que-no-es-el-del-servidor-0000') });
  const store = createSupabaseStore(forged);
  await assert.rejects(store.loadActorRole(NONEXISTENT, NONEXISTENT), (err) => err instanceof StoreError);
});

test('RPC inexistente -> STORE_FUNCTION_MISSING (PGRST202)', { skip }, async () => {
  const res = await service.rpc('crm_fiscal_no_existe_esta_funcion', {});
  assert.equal(res.error?.code, 'PGRST202');
});
