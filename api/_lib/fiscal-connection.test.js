import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { normalizeRut, validateApiKey, validateResolucion, validateSucursal, createFiscalConnectionService } from './fiscal-connection.js';
import { open } from '../../supabase/functions/fiscal-emit/lib/secrets.mjs';
import { parseAllowedIssuers } from '../../supabase/functions/fiscal-emit/lib/allowlist.mjs';

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const ACTOR = '11111111-2222-4333-8444-555555555555';
const MASTER = randomBytes(32);
// Lista de empresas autorizadas de las pruebas: el negocio BIZ con el RUT de las solicitudes.
const ALLOW = parseAllowedIssuers(`${BIZ}=12345678-5`);
const API_KEY = 'dtc_live_EXAMPLE_KEY_0123456789abcdef';

// Cliente admin falso: registra llamadas y responde según el nombre de la RPC.
function fakeAdmin({ save = { data: true, error: null }, disconnect = { data: true, error: null }, row = null, submitResult = { data: true, error: null }, taxResult = { data: true, error: null } } = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'crm_fiscal_save_credentials') return save;
      if (fn === 'crm_fiscal_disconnect') return disconnect;
      if (fn === 'crm_fiscal_connection_status') return { data: row, error: null };
      if (fn === 'crm_fiscal_submit_application') return submitResult;
      if (fn === 'crm_fiscal_set_tax_default') return taxResult;
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
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
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
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
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
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
  assert.deepEqual((await svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '76123456-7' } })).body, { error: 'INVALID_RUT' });
  assert.deepEqual((await svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: 'corta', issuerRut: '12345678-5' } })).body, { error: 'INVALID_API_KEY' });
  assert.equal(admin.calls.length, 0);
});

test('conectar rechaza campos no permitidos (p. ej. business_id enviado por el cliente)', async () => {
  const admin = fakeAdmin();
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
  const r = await svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '12345678-5', business_id: 'otro' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'UNKNOWN_FIELD');
  assert.equal(admin.calls.length, 0);
});

test('operación fiscal en curso -> 409 FISCAL_OPERATION_IN_PROGRESS, sin cambios', async () => {
  const admin = fakeAdmin({ save: { data: null, error: { message: 'FISCAL_OPERATION_IN_PROGRESS' } } });
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
  const r = await svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '12345678-5' } });
  assert.deepEqual(r, { status: 409, body: { error: 'FISCAL_OPERATION_IN_PROGRESS' } });
});

test('migración H: RUT de otro comercio -> 409 RUT_NOT_AVAILABLE sin revelar el dueño; cambio de RUT con boleta pendiente -> 409', async () => {
  for (const [dbMsg, code] of [['FISCAL_ISSUER_RUT_TAKEN', 'RUT_NOT_AVAILABLE'], ['FISCAL_RUT_CHANGE_BLOCKED', 'RUT_CHANGE_BLOCKED'],
    ['FISCAL_ISSUER_RUT_INVALID', 'INVALID_RUT']]) {
    const admin = fakeAdmin({ save: { data: null, error: { message: dbMsg } } });
    const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
    const r = await svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '12345678-5' } });
    assert.equal(r.body.error, code);
    assert.equal(Object.keys(r.body).length, 1, 'sin detalles del otro comercio');
  }
});

test('error de base que contiene la clave: la respuesta y los logs no la repiten', async () => {
  const admin = fakeAdmin({ save: { data: null, error: { message: `connection refused near ${API_KEY}` } } });
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
  const { r, logs } = await captureLogs(() => svc.connect({ businessId: BIZ, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut: '12345678-5' } }));
  assert.deepEqual(r.body, { error: 'SERVER_ERROR' });
  assert.equal(JSON.stringify(r).includes(API_KEY), false);
  assert.equal(logs.some((l) => l.includes(API_KEY)), false);
});

test('desconectar: llama a la RPC con el actor y devuelve la conexión sin credenciales', async () => {
  const admin = fakeAdmin({ row: { connected: false, issuerRut: '12345678-5', enabled: false, verified: false, keyVersion: null, updatedAt: null } });
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
  const r = await svc.disconnect({ businessId: BIZ, actorId: ACTOR, body: { action: 'disconnect' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.connection.connected, false);
  assert.deepEqual(admin.calls[0], { fn: 'crm_fiscal_disconnect', args: { p_business_id: BIZ, p_actor_user_id: ACTOR } });
});

test('estado: nunca contiene la clave ni el texto cifrado', async () => {
  const admin = fakeAdmin({ row: CONNECTED_ROW });
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
  const r = await svc.status({ businessId: BIZ });
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.body);
  assert.equal(/ciphertext|iv|auth_tag|apiKey/.test(text), false);
  assert.deepEqual(Object.keys(r.body.connection).sort(), [
    'connected', 'defaultTaxCategory', 'enabled', 'issuerRut', 'keyVersion',
    'resolucionFecha', 'resolucionNumero', 'reviewNote',
    'reviewStatus', 'reviewedAt', 'rutConfirmationReason', 'rutConfirmed', 'submittedAt', 'sucursalCodigo', 'sucursalNombre', 'updatedAt', 'verified',
  ]);
});

test('constructor exige cliente admin y clave maestra', () => {
  assert.throws(() => createFiscalConnectionService({ allowedIssuers: ALLOW, admin: {}, masterKey: MASTER }), /admin client/);
  assert.throws(() => createFiscalConnectionService({ allowedIssuers: ALLOW, admin: fakeAdmin(), masterKey: undefined }), /master key/);
});

// --- Solicitud de alta (submit) --------------------------------------------------------------
const TODAY = new Date('2026-11-04T12:00:00Z');

test('resolución SII: número 1..999999 y fecha real entre 2003 y hoy', () => {
  assert.deepEqual(validateResolucion('80', '2014-08-22', { today: TODAY }), { numero: 80, fecha: '2014-08-22' });
  assert.equal(validateResolucion('0', '2014-08-22', { today: TODAY }), null);
  assert.equal(validateResolucion('1000000', '2014-08-22', { today: TODAY }), null);
  assert.equal(validateResolucion('80', '2014-02-30', { today: TODAY }), null);
  assert.equal(validateResolucion('80', '2002-12-31', { today: TODAY }), null);
  assert.equal(validateResolucion('80', '2026-11-05', { today: TODAY }), null);
  assert.equal(validateResolucion('8a', '2014-08-22', { today: TODAY }), null);
});

test('sucursal opcional: nombre hasta 80 y código numérico', () => {
  assert.deepEqual(validateSucursal('', ''), { nombre: null, codigo: null });
  assert.deepEqual(validateSucursal(' Casa Matriz ', '1'), { nombre: 'Casa Matriz', codigo: '1' });
  assert.equal(validateSucursal('x'.repeat(81), ''), null);
  assert.equal(validateSucursal('Local', 'A1'), null);
});

const SUBMIT = { action: 'submit', issuerRut: '12.345.678-5', apiKey: API_KEY, resolucionNumero: '80', resolucionFecha: '2014-08-22', sucursalNombre: 'Casa Matriz', sucursalCodigo: '1' };

test('submit con API key: guarda la clave sellada y envía la solicitud a revisión, sin la clave en las llamadas', async () => {
  const admin = fakeAdmin({ row: { ...CONNECTED_ROW, reviewStatus: 'pending_review' } });
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
  const r = await svc.submit({ businessId: BIZ, actorId: ACTOR, body: SUBMIT });
  assert.equal(r.status, 200);
  assert.equal(r.body.connection.reviewStatus, 'pending_review');
  assert.deepEqual(admin.calls.map((c) => c.fn), ['crm_fiscal_save_credentials', 'crm_fiscal_submit_application', 'crm_fiscal_connection_status']);
  assert.deepEqual(admin.calls[1].args, {
    p_business_id: BIZ, p_actor_user_id: ACTOR, p_resolucion_numero: 80, p_resolucion_fecha: '2014-08-22',
    p_sucursal_nombre: 'Casa Matriz', p_sucursal_codigo: '1',
  });
  assert.equal(JSON.stringify(admin.calls).includes(API_KEY), false);
});

test('submit sin API key: solo si ya hay una cuenta conectada con el mismo RUT', async () => {
  const { apiKey, ...noKey } = SUBMIT;
  const same = fakeAdmin({ row: CONNECTED_ROW });
  const r1 = await createFiscalConnectionService({ allowedIssuers: ALLOW, admin: same, masterKey: MASTER }).submit({ businessId: BIZ, actorId: ACTOR, body: noKey });
  assert.equal(r1.status, 200);
  assert.equal(same.calls.some((c) => c.fn === 'crm_fiscal_save_credentials'), false);

  const other = fakeAdmin({ row: { ...CONNECTED_ROW, issuerRut: '76123456-7' } });
  const r2 = await createFiscalConnectionService({ allowedIssuers: ALLOW, admin: other, masterKey: MASTER }).submit({ businessId: BIZ, actorId: ACTOR, body: noKey });
  assert.deepEqual([r2.status, r2.body.error], [409, 'API_KEY_REQUIRED']);
  assert.equal(other.calls.some((c) => c.fn === 'crm_fiscal_submit_application'), false);

  const none = fakeAdmin({ row: null });
  const r3 = await createFiscalConnectionService({ allowedIssuers: ALLOW, admin: none, masterKey: MASTER }).submit({ businessId: BIZ, actorId: ACTOR, body: noKey });
  assert.deepEqual([r3.status, r3.body.error], [409, 'API_KEY_REQUIRED']);
});

test('submit valida antes de guardar nada', async () => {
  for (const [patch, code] of [
    [{ issuerRut: '12.345.678-0' }, 'INVALID_RUT'],
    [{ resolucionNumero: '0' }, 'INVALID_RESOLUCION'],
    [{ resolucionFecha: '2999-01-01' }, 'INVALID_RESOLUCION'],
    [{ sucursalCodigo: 'A' }, 'INVALID_SUCURSAL'],
    [{ apiKey: 'corta' }, 'INVALID_API_KEY'],
    [{ extra: 1 }, 'UNKNOWN_FIELD'],
  ]) {
    const admin = fakeAdmin();
    const r = await createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER }).submit({ businessId: BIZ, actorId: ACTOR, body: { ...SUBMIT, ...patch } });
    assert.deepEqual([r.status, r.body.error], [400, code], JSON.stringify(patch));
    assert.equal(admin.calls.length, 0);
  }
});

test('submit: errores de la base se traducen sin detalles', async () => {
  const admin = fakeAdmin({ row: CONNECTED_ROW, submitResult: { data: null, error: { message: 'FISCAL_OPERATION_IN_PROGRESS' } } });
  const r = await createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER }).submit({ businessId: BIZ, actorId: ACTOR, body: SUBMIT });
  assert.deepEqual([r.status, r.body.error], [409, 'FISCAL_OPERATION_IN_PROGRESS']);
});

// --- Tratamiento tributario por defecto -------------------------------------------------------
test('categoría por defecto: valida, llama a la RPC con el actor y devuelve el estado', async () => {
  const admin = fakeAdmin({ row: { ...CONNECTED_ROW, defaultTaxCategory: 'IVA_AFECTO_19' } });
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
  const r = await svc.setTaxDefault({ businessId: BIZ, actorId: ACTOR, body: { action: 'set-tax-default', category: 'IVA_AFECTO_19' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.connection.defaultTaxCategory, 'IVA_AFECTO_19');
  assert.deepEqual(admin.calls[0], { fn: 'crm_fiscal_set_tax_default', args: { p_business_id: BIZ, p_actor_user_id: ACTOR, p_category: 'IVA_AFECTO_19' } });
  for (const [body, code] of [[{ action: 'set-tax-default', category: 'IVA_10' }, 'INVALID_TAX_CATEGORY'], [{ action: 'set-tax-default', category: 'EXENTO', x: 1 }, 'UNKNOWN_FIELD']]) {
    const bad = fakeAdmin();
    const rr = await createFiscalConnectionService({ allowedIssuers: ALLOW, admin: bad, masterKey: MASTER }).setTaxDefault({ businessId: BIZ, actorId: ACTOR, body });
    assert.deepEqual([rr.status, rr.body.error], [400, code]);
    assert.equal(bad.calls.length, 0);
  }
  const cleared = fakeAdmin({ row: CONNECTED_ROW });
  await createFiscalConnectionService({ allowedIssuers: ALLOW, admin: cleared, masterKey: MASTER }).setTaxDefault({ businessId: BIZ, actorId: ACTOR, body: { action: 'set-tax-default', category: '' } });
  assert.equal(cleared.calls[0].args.p_category, null);
});

// --- Lista de empresas autorizadas (servidor) -------------------------------------------------
const OTHER_BIZ = 'a9b8c7d6-e5f4-4321-8765-0fedcba98765';

test('sin lista de empresas el servicio no se construye (falla cerrado)', () => {
  assert.throws(() => createFiscalConnectionService({ admin: fakeAdmin(), masterKey: MASTER }), /allowedIssuers/);
});

test('conectar o enviar: negocio fuera de la lista, o con otro RUT -> 403 sin guardar nada', async () => {
  for (const [businessId, issuerRut] of [[OTHER_BIZ, '12345678-5'], [BIZ, '76123456-0']]) {
    const admin = fakeAdmin();
    const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
    const c = await svc.connect({ businessId, actorId: ACTOR, body: { action: 'connect', apiKey: API_KEY, issuerRut } });
    assert.deepEqual([c.status, c.body], [403, { error: 'FISCAL_BUSINESS_NOT_ALLOWED' }]);
    const s = await svc.submit({ businessId, actorId: ACTOR, body: { action: 'submit', apiKey: API_KEY, issuerRut, resolucionNumero: 80, resolucionFecha: '2014-08-22' } });
    assert.deepEqual([s.status, s.body], [403, { error: 'FISCAL_BUSINESS_NOT_ALLOWED' }]);
    assert.equal(admin.calls.length, 0, 'no se guarda credencial ni solicitud');
  }
});

test('categoría por defecto: solo negocios de la lista; desconectar siempre se permite', async () => {
  const admin = fakeAdmin();
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin, masterKey: MASTER });
  const t = await svc.setTaxDefault({ businessId: OTHER_BIZ, actorId: ACTOR, body: { action: 'set-tax-default', category: 'IVA_AFECTO_19' } });
  assert.equal(t.status, 403);
  assert.equal(admin.calls.length, 0);
  const d = await svc.disconnect({ businessId: OTHER_BIZ, actorId: ACTOR, body: { action: 'disconnect' } });
  assert.equal(d.status, 200);
});

test('estado: informa si el negocio está en la lista, sin revelar el RUT esperado', async () => {
  const svc = createFiscalConnectionService({ allowedIssuers: ALLOW, admin: fakeAdmin(), masterKey: MASTER });
  const inList = await svc.status({ businessId: BIZ });
  assert.equal(inList.body.allowed, true);
  const out = await svc.status({ businessId: OTHER_BIZ });
  assert.equal(out.body.allowed, false);
  assert.equal(JSON.stringify(out.body).includes('12345678'), false);
});
