import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { normalizeRut, validateApiKey, createFiscalConnectionService } from './fiscal-connection.js';
import { open } from '../../supabase/functions/fiscal-emit/lib/secrets.mjs';

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const ACTOR = '11111111-2222-4333-8444-555555555555';
const MASTER = randomBytes(32);
const API_KEY = 'dtc_live_EXAMPLE_KEY_0123456789abcdef';

// Cliente admin falso: registra llamadas y responde según el nombre de la RPC.
function fakeAdmin({ save = { data: true, error: null }, disconnect = { data: true, error: null }, row = null } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'crm_fiscal_save_credentials') return save;
      if (fn === 'crm_fiscal_disconnect') return disconnect;
      if (fn === 'crm_fiscal_connection_status') return { data: row, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
  };
}

const CONNECTED_ROW = {
  connected: true, issuerRut: '12345678-5', enabled: false, verified: false, keyVersion: 1,
  updatedAt: '2026-10-31T22:00:00Z',
};

function captureLogs(fn) {
  const logs = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => logs.push(a.map(String).join(' '));
  return Promise.resolve().then(fn).finally(() => Object.assign(console, orig)).then((r) => ({ r, logs }));
}

// --- RUT y clave -----------------------------------------------------------------------------

test('RUT: acepta forma canónica y con puntos; rechaza dígito verificador incorrecto', () => {
  assert.equal(normalizeRut('76123456-0'), '76123456-0');
  assert.equal(normalizeRut('76.123.456-0'), '76123456-0');
  assert.equal(normalizeRut('11111111-1'), '11111111-1');
  assert.equal(normalizeRut('12345678-5'), '12345678-5');
  assert.equal(normalizeRut('76123456-7'), null, 'DV incorrecto');
  assert.equal(normalizeRut('12345678-K'), null, 'K incorrecta para este cuerpo');
  assert.equal(normalizeRut('abc'), null);
  assert.equal(normalizeRut(undefined), null);
});

test('clave: recorta espacios exteriores; rechaza vacía, corta, con espacios o control', () => {
  assert.equal(validateApiKey(`  ${API_KEY}  `), API_KEY);
  assert.equal(validateApiKey('corta'), null);
  assert.equal(validateApiKey('dos palabras con espacios aqui'), null);
  assert.equal(validateApiKey(`${API_KEY}\u0007`), null, 'carácter de control');
  assert.equal(validateApiKey(42), null);
});

// --- Servicio ----------------------------------------------------------------------------------

test('conectar: sella la clave, guarda bytes cifrados y responde sin la clave', async () => {
  const admin = fakeAdmin({ row: CONNECTED_ROW });
  const svc = createFiscalConnectionService({ admin, masterKey: MASTER });
  const { r, logs } = await captureLogs(() => svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '12.345.678-5' } }));

  assert.equal(r.status, 200);
  assert.equal(r.body.connection.connected, true);
  assert.equal(r.body.connection.verified, false, 'nunca verificada por el solo hecho de guardarla');
  assert.equal(r.body.connection.enabled, false, 'guardar no habilita emisión');
  assert.equal(JSON.stringify(r.body).includes(API_KEY), false, 'la respuesta no contiene la clave');
  assert.equal(logs.some((l) => l.includes(API_KEY)), false, 'ningún log contiene la clave');

  const save = admin.calls.find((c) => c.fn === 'crm_fiscal_save_credentials').args;
  assert.equal(save.p_business_id, BIZ);
  assert.equal(save.p_actor_user_id, ACTOR);
  assert.equal(save.p_issuer_rut, '12345678-5');
  assert.ok(save.p_ciphertext.startsWith('\\x') && save.p_iv.startsWith('\\x') && save.p_auth_tag.startsWith('\\x'));
  assert.equal(save.p_ciphertext.includes(Buffer.from(API_KEY).toString('hex')), false, 'el texto cifrado no contiene la clave en claro');
});

test('el texto cifrado se descifra solo con la clave maestra y el negocio correcto', async () => {
  const admin = fakeAdmin({ row: CONNECTED_ROW });
  const svc = createFiscalConnectionService({ admin, masterKey: MASTER });
  await svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '12345678-5' } });
  const a = admin.calls.find((c) => c.fn === 'crm_fiscal_save_credentials').args;
  const toBuf = (s) => Buffer.from(s.slice(2), 'hex');
  const record = { ciphertext: toBuf(a.p_ciphertext), iv: toBuf(a.p_iv), authTag: toBuf(a.p_auth_tag), keyVersion: 1, provider: 'dtecore' };
  assert.deepEqual(open(record, { key: MASTER, businessId: BIZ }), { apiKey: API_KEY });
  assert.throws(() => open(record, { key: MASTER, businessId: '99999999-9999-4999-8999-999999999999' }), { code: 'CREDENTIAL_INVALID' }, 'otro negocio no puede usar el sellado');
  assert.throws(() => open(record, { key: randomBytes(32), businessId: BIZ }), { code: 'CREDENTIAL_INVALID' }, 'otra clave maestra no descifra');
});

test('conectar rechaza RUT inválido y clave inválida sin tocar la base', async () => {
  const admin = fakeAdmin();
  const svc = createFiscalConnectionService({ admin, masterKey: MASTER });
  assert.deepEqual((await svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '76123456-7' } })).body, { error: 'INVALID_RUT' });
  assert.deepEqual((await svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: 'corta', issuerRut: '12345678-5' } })).body, { error: 'INVALID_API_KEY' });
  assert.equal(admin.calls.length, 0);
});

test('conectar rechaza campos no permitidos (p. ej. business_id enviado por el cliente)', async () => {
  const admin = fakeAdmin();
  const svc = createFiscalConnectionService({ admin, masterKey: MASTER });
  const r = await svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '12345678-5', business_id: 'otro' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'UNKNOWN_FIELD');
  assert.equal(admin.calls.length, 0);
});

test('operación fiscal en curso -> 409 FISCAL_OPERATION_IN_PROGRESS, sin cambios', async () => {
  const admin = fakeAdmin({ save: { data: null, error: { message: 'FISCAL_OPERATION_IN_PROGRESS' } } });
  const svc = createFiscalConnectionService({ admin, masterKey: MASTER });
  const r = await svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '12345678-5' } });
  assert.deepEqual(r, { status: 409, body: { error: 'FISCAL_OPERATION_IN_PROGRESS' } });
});

test('error de base que contiene la clave: la respuesta y los logs no la repiten', async () => {
  const admin = fakeAdmin({ save: { data: null, error: { message: `connection refused near ${API_KEY}` } } });
  const svc = createFiscalConnectionService({ admin, masterKey: MASTER });
  const { r, logs } = await captureLogs(() => svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '12345678-5' } }));
  assert.deepEqual(r.body, { error: 'SERVER_ERROR' });
  assert.equal(JSON.stringify(r).includes(API_KEY), false);
  assert.equal(logs.some((l) => l.includes(API_KEY)), false);
});

test('desconectar: llama a la RPC con el actor y devuelve la conexión sin credenciales', async () => {
  const admin = fakeAdmin({ row: { connected: false, issuerRut: '12345678-5', enabled: false, verified: false, keyVersion: null, updatedAt: null } });
  const svc = createFiscalConnectionService({ admin, masterKey: MASTER });
  const r = await svc.disconnect({ businessId: BIZ, actorId: ACTOR, body: { action: 'disconnect' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.connection.connected, false);
  assert.deepEqual(admin.calls[0], { fn: 'crm_fiscal_disconnect', args: { p_business_id: BIZ, p_actor_user_id: ACTOR } });
});

test('estado: nunca contiene la clave ni el texto cifrado', async () => {
  const admin = fakeAdmin({ row: CONNECTED_ROW });
  const svc = createFiscalConnectionService({ admin, masterKey: MASTER });
  const r = await svc.status({ businessId: BIZ });
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.body);
  assert.equal(/ciphertext|iv|auth_tag|apiKey/.test(text), false);
  assert.deepEqual(Object.keys(r.body.connection).sort(), ['connected', 'enabled', 'issuerRut', 'keyVersion', 'updatedAt', 'verified']);
});

test('constructor exige cliente admin y clave maestra', () => {
  assert.throws(() => createFiscalConnectionService({ admin: {}, masterKey: MASTER }), /admin client/);
  assert.throws(() => createFiscalConnectionService({ admin: fakeAdmin(), masterKey: undefined }), /master key/);
});
