// Vinculación fiscal (migración H): Walinka verifica con el proveedor a qué RUT pertenece la API key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createFiscalConnectionService } from './fiscal-connection.js';
import { seal } from '../../supabase/functions/fiscal-emit/lib/secrets.mjs';
import { parseAllowedIssuers } from '../../supabase/functions/fiscal-emit/lib/allowlist.mjs';
import { createSiisolutionsHttpProvider } from '../../supabase/functions/fiscal-emit/lib/providers/siisolutions-http.mjs';

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const ACTOR = '11111111-2222-4333-8444-555555555555';
const MASTER = randomBytes(32);
const RUT = '12345678-5';
const ALLOW = parseAllowedIssuers(`${BIZ}=${RUT}`);
const API_KEY = 'dtc_live_EXAMPLE_KEY_0123456789abcdef';

// Base falsa: guarda credenciales y calcula el resultado como crm_fiscal_record_identity_check.
function fakeAdmin({ contractVerified = true } = {}) {
  const calls = [];
  let stored = null;
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'crm_fiscal_save_credentials') {
        stored = { provider: 'dtecore', key_version: 1, ciphertext: Buffer.from(args.p_ciphertext.slice(2), 'hex').toString('base64'),
          iv: Buffer.from(args.p_iv.slice(2), 'hex').toString('base64'), auth_tag: Buffer.from(args.p_auth_tag.slice(2), 'hex').toString('base64'),
          rut: args.p_issuer_rut };
        return { data: true, error: null };
      }
      if (fn === 'crm_fiscal_get_credentials') return { data: stored, error: null };
      if (fn === 'crm_fiscal_record_identity_check') {
        if (!contractVerified) return { data: null, error: { message: 'FISCAL_IDENTITY_CONTRACT_PENDING' } };
        const o = args.p_observed_rut == null ? 'unavailable' : args.p_observed_rut === stored.rut ? 'match' : 'mismatch';
        return { data: { outcome: o, block_reason: o === 'match' ? null : `last_check_${o}` }, error: null };
      }
      if (fn === 'crm_fiscal_connection_status') return { data: { connected: Boolean(stored), issuerRut: stored?.rut }, error: null };
      if (fn === 'crm_fiscal_submit_application') return { data: true, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
  };
}

// Proveedor simulado: la API key pertenece a `owner` (o falla).
const providerFor = (owner, { fail = false } = {}) => {
  const seen = [];
  return {
    name: 'dtecore', identityContractVerified: true, seen,
    async verifyIdentity({ credentials }) {
      seen.push(credentials.apiKey);
      if (fail) throw Object.assign(new Error('x'), { code: 'ECONNRESET' });
      return { rut: owner };
    },
  };
};

const svcWith = (admin, identityProvider) => createFiscalConnectionService({ admin, masterKey: MASTER, allowedIssuers: ALLOW, identityProvider });
const connect = (svc, issuerRut = RUT) => svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut } });

test('vinculación: la key pertenece al RUT del comercio -> match registrado por la base', async () => {
  const admin = fakeAdmin();
  const p = providerFor('12.345.678-5');
  const r = await connect(svcWith(admin, p));
  assert.equal(r.status, 200);
  assert.equal(r.body.identity, 'match');
  assert.deepEqual(p.seen, [API_KEY], 'una sola consulta, con la key recién ingresada');
  const rec = admin.calls.find((c) => c.fn === 'crm_fiscal_record_identity_check');
  assert.equal(rec.args.p_observed_rut, RUT, 'el RUT del proveedor se normaliza antes de registrarlo');
  assert.equal(rec.args.p_business_id, BIZ);
  assert.equal(JSON.stringify(admin.calls).includes(API_KEY), false, 'la key nunca viaja a la base en claro');
});

test('vinculación: key de otro RUT -> IDENTITY_MISMATCH y la solicitud no se envía', async () => {
  const admin = fakeAdmin();
  const svc = svcWith(admin, providerFor('76123456-0'));
  assert.deepEqual(await connect(svc), { status: 409, body: { error: 'IDENTITY_MISMATCH' } });
  const sub = await svc.submit({ businessId: BIZ, actorId: ACTOR, body: {
    action: 'submit', issuerRut: RUT, apiKey: API_KEY, resolucionNumero: 80, resolucionFecha: '2014-08-22' } });
  assert.deepEqual(sub, { status: 409, body: { error: 'IDENTITY_MISMATCH' } });
  assert.equal(admin.calls.some((c) => c.fn === 'crm_fiscal_submit_application'), false);
});

test('vinculación: proveedor sin respuesta -> unavailable (no aprueba ni rechaza)', async () => {
  const admin = fakeAdmin();
  const r = await connect(svcWith(admin, providerFor(null, { fail: true })));
  assert.equal(r.status, 200);
  assert.equal(r.body.identity, 'unavailable');
  const rec = admin.calls.find((c) => c.fn === 'crm_fiscal_record_identity_check');
  assert.equal(rec.args.p_observed_rut, null);
  assert.deepEqual(rec.args.p_detail, { reason: 'ECONNRESET' });
});

test('vinculación: adaptador real sin contrato -> contract_pending, sin red y sin registro', async () => {
  const admin = fakeAdmin();
  let fetched = 0;
  const real = createSiisolutionsHttpProvider({ fetchImpl: () => { fetched += 1; throw new Error('no'); } });
  const r = await connect(svcWith(admin, real));
  assert.equal(r.status, 200);
  assert.equal(r.body.identity, 'contract_pending');
  assert.equal(fetched, 0, 'ninguna llamada de red');
  assert.equal(admin.calls.some((c) => c.fn === 'crm_fiscal_record_identity_check'), false);
});

test('vinculación: la base rechaza registrar sin contrato aunque el código lo intente', async () => {
  const admin = fakeAdmin({ contractVerified: false });
  const r = await connect(svcWith(admin, providerFor(RUT)));
  assert.equal(r.status, 200);
  assert.equal(r.body.identity, 'contract_pending');
});

test('verificar de nuevo: usa la key GUARDADA (descifrada en el servidor), sin pedirla al comercio', async () => {
  const admin = fakeAdmin();
  const p = providerFor(RUT, { fail: true });
  await connect(svcWith(admin, p));
  const p2 = providerFor(RUT);
  const svc = svcWith(admin, p2);
  const r = await svc.verify({ businessId: BIZ, actorId: ACTOR, body: { action: 'verify' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.identity, 'match');
  assert.deepEqual(p2.seen, [API_KEY]);
  assert.deepEqual(await svc.verify({ businessId: BIZ, actorId: ACTOR, body: { action: 'verify', issuerRut: RUT } }),
    { status: 400, body: { error: 'UNKNOWN_FIELD' } }, 'el cliente no puede proponer un RUT al verificar');
});

test('verificar de nuevo: sin key guardada -> API_KEY_REQUIRED; negocio fuera de la lista -> 403', async () => {
  const admin = fakeAdmin();
  const svc = svcWith(admin, providerFor(RUT));
  assert.deepEqual(await svc.verify({ businessId: BIZ, actorId: ACTOR, body: { action: 'verify' } }), { status: 409, body: { error: 'API_KEY_REQUIRED' } });
  const other = '0f0e0d0c-0b0a-4908-8706-050403020100';
  assert.equal((await svc.verify({ businessId: other, actorId: ACTOR, body: { action: 'verify' } })).status, 403);
});

test('verificar: una key sellada para OTRO negocio no se abre (AAD) -> error, sin consultar al proveedor', async () => {
  const admin = fakeAdmin();
  await connect(svcWith(admin, providerFor(RUT, { fail: true })));
  const foreign = seal({ apiKey: 'OTRA-KEY-0123456789abcdef' }, { key: MASTER, businessId: '0f0e0d0c-0b0a-4908-8706-050403020100' });
  const tampered = { ...admin, rpc: async (fn, args) => (fn === 'crm_fiscal_get_credentials'
    ? { data: { provider: 'dtecore', key_version: 1, ciphertext: foreign.ciphertext.toString('base64'), iv: foreign.iv.toString('base64'), auth_tag: foreign.authTag.toString('base64') }, error: null }
    : admin.rpc(fn, args)) };
  const p = providerFor(RUT);
  const r = await svcWith(tampered, p).verify({ businessId: BIZ, actorId: ACTOR, body: { action: 'verify' } });
  assert.equal(r.status, 503);
  assert.deepEqual(p.seen, []);
});
