// Dos claves maestras por versión: v1 = FISCAL_MASTER_KEY, v2 = FISCAL_MASTER_KEY_V2 (+ KCV).
// Falla cerrado ante cualquier configuración dudosa; nunca prueba otra clave; nunca expone valores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  buildKeyring, keyCheckValue, open, openWithKeyring, resolveKeyV2, seal, KCV_LABEL,
} from '../../lib/secrets.mjs';
import { createFiscalConnectionService } from '../../../../../api/_lib/fiscal-connection.js';
import { parseAllowedIssuers } from '../../lib/allowlist.mjs';

const BIZ = '85e80cd0-7242-492f-951d-b17893e84283';
const K1 = randomBytes(32);
const K2 = randomBytes(32);
const b64 = (k) => k.toString('base64');
const kcv = (k) => keyCheckValue(k);

test('KCV: 32 hex, determinista, distinto por clave y sin rastro de la clave', () => {
  assert.match(kcv(K2), /^[0-9a-f]{32}$/);
  assert.equal(kcv(K2), kcv(Buffer.from(K2)));
  assert.notEqual(kcv(K1), kcv(K2));
  assert.ok(!K2.toString('hex').includes(kcv(K2)) && !kcv(K2).includes(K2.toString('hex').slice(0, 8)));
  assert.equal(typeof KCV_LABEL, 'string');
  assert.throws(() => keyCheckValue(randomBytes(16)), { code: 'MASTER_KEY_INVALID' });
});

test('resolveKeyV2: cada configuración dudosa deja la V2 sin usar', () => {
  const st = (o) => resolveKeyV2(o).status;
  assert.equal(st({}), 'missing');
  assert.equal(st({ v2: '   ' }), 'missing');
  assert.equal(st({ v2: 'no-es-base64-de-32', v2Kcv: kcv(K2) }), 'invalid');
  assert.equal(st({ v2: b64(randomBytes(16)), v2Kcv: kcv(K2) }), 'invalid');
  assert.equal(st({ v2: b64(K2) }), 'kcv_missing');
  assert.equal(st({ v2: b64(K2), v2Kcv: 'xyz' }), 'kcv_mismatch');
  assert.equal(st({ v2: b64(K2), v2Kcv: kcv(K1) }), 'kcv_mismatch', 'KCV de otra clave (las plataformas tienen claves distintas)');
  assert.equal(st({ v2: b64(K1), v2Kcv: kcv(K1), v1Key: K1 }), 'same_as_v1');
  const ok = resolveKeyV2({ v2: ` ${b64(K2)}\n`, v2Kcv: ` ${kcv(K2).toUpperCase()} ` });
  assert.equal(ok.status, 'ok');
  assert.ok(ok.key.equals(K2));
  for (const s of ['missing', 'invalid', 'kcv_missing', 'kcv_mismatch', 'same_as_v1']) {
    const r = resolveKeyV2(s === 'same_as_v1' ? { v2: b64(K1), v2Kcv: kcv(K1), v1Key: K1 } : s === 'kcv_mismatch' ? { v2: b64(K2), v2Kcv: kcv(K1) } : s === 'kcv_missing' ? { v2: b64(K2) } : s === 'invalid' ? { v2: 'x', v2Kcv: kcv(K2) } : {});
    assert.equal(r.key, null, s);
  }
});

test('buildKeyring: V1 obligatoria (mismos errores que antes); V2 opcional; versiones desconocidas sin clave', () => {
  assert.throws(() => buildKeyring({}), { code: 'MASTER_KEY_MISSING' });
  assert.throws(() => buildKeyring({ v1: b64(randomBytes(16)) }), { code: 'MASTER_KEY_INVALID' });
  const onlyV1 = buildKeyring({ v1: b64(K1) });
  assert.deepEqual(onlyV1.status, { v1: 'ok', v2: 'missing' });
  assert.ok(onlyV1.keyFor(1).equals(K1));
  assert.equal(onlyV1.keyFor(2), null);
  const both = buildKeyring({ v1: b64(K1), v2: b64(K2), v2Kcv: kcv(K2) });
  assert.deepEqual(both.status, { v1: 'ok', v2: 'ok' });
  assert.ok(both.keyFor(2).equals(K2));
  for (const v of [0, 3, -1, '1', null, undefined]) assert.equal(both.keyFor(v), null, String(v));
  const badV2 = buildKeyring({ v1: b64(K1), v2: b64(K2), v2Kcv: kcv(K1) });
  assert.equal(badV2.status.v2, 'kcv_mismatch');
  assert.equal(badV2.keyFor(2), null, 'una V2 inválida no tumba la V1 ni se usa');
  assert.ok(badV2.keyFor(1).equals(K1));
});

test('el estado del llavero no contiene claves ni KCV', () => {
  const ring = buildKeyring({ v1: b64(K1), v2: b64(K2), v2Kcv: kcv(K2) });
  const text = JSON.stringify(ring) + JSON.stringify(ring.status);
  for (const secret of [b64(K1), b64(K2), K1.toString('hex'), K2.toString('hex'), kcv(K1), kcv(K2)]) {
    assert.ok(!text.includes(secret));
  }
});

test('openWithKeyring: cada versión con su clave; sin clave para la versión, CREDENTIAL_KEY_UNAVAILABLE', () => {
  const v1rec = seal({ apiKey: 'K-V1' }, { key: K1, businessId: BIZ, keyVersion: 1 });
  const v2rec = seal({ apiKey: 'K-V2' }, { key: K2, businessId: BIZ, keyVersion: 2 });
  const both = buildKeyring({ v1: b64(K1), v2: b64(K2), v2Kcv: kcv(K2) });
  assert.deepEqual(openWithKeyring(v1rec, { keyring: both, businessId: BIZ }), { apiKey: 'K-V1' });
  assert.deepEqual(openWithKeyring(v2rec, { keyring: both, businessId: BIZ }), { apiKey: 'K-V2' });

  const onlyV1 = buildKeyring({ v1: b64(K1) });
  assert.deepEqual(openWithKeyring(v1rec, { keyring: onlyV1, businessId: BIZ }), { apiKey: 'K-V1' }, 'credenciales existentes siguen igual');
  assert.throws(() => openWithKeyring(v2rec, { keyring: onlyV1, businessId: BIZ }), { code: 'CREDENTIAL_KEY_UNAVAILABLE' });
  assert.throws(() => openWithKeyring({ ...v2rec, keyVersion: 3 }, { keyring: both, businessId: BIZ }), { code: 'CREDENTIAL_KEY_UNAVAILABLE' });
  assert.throws(() => openWithKeyring({ ...v2rec, keyVersion: undefined }, { keyring: both, businessId: BIZ }), { code: 'CREDENTIAL_KEY_UNAVAILABLE' });

  // La versión forma parte del AAD: relabelar una fila no la hace descifrable con la otra clave.
  assert.throws(() => openWithKeyring({ ...v1rec, keyVersion: 2 }, { keyring: both, businessId: BIZ }), { code: 'CREDENTIAL_INVALID' });
  assert.throws(() => openWithKeyring({ ...v2rec, keyVersion: 1 }, { keyring: both, businessId: BIZ }), { code: 'CREDENTIAL_INVALID' });
  // Una V2 distinta en Supabase (aunque con su propio KCV válido) no descifra lo que selló Vercel.
  const K2b = randomBytes(32);
  const other = buildKeyring({ v1: b64(K1), v2: b64(K2b), v2Kcv: kcv(K2b) });
  assert.throws(() => openWithKeyring(v2rec, { keyring: other, businessId: BIZ }), { code: 'CREDENTIAL_INVALID' });
});

test('compatibilidad Vercel → fiscal-emit: lo que sella la conexión (v2) lo abre el llavero; las v1 siguen abriendo', async () => {
  const calls = [];
  const admin = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'crm_fiscal_connection_status') return { data: { connected: true, issuerRut: '78506417-8', keyVersion: 2 }, error: null };
      return { data: true, error: null };
    },
  };
  const allow = parseAllowedIssuers(`${BIZ}=78506417-8`);
  const svc = createFiscalConnectionService({ admin, sealingKey: K2, allowedIssuers: allow });
  const r = await svc.connect({ businessId: BIZ, actorId: 'u1', body: { action: 'connect', apiKey: 'DTECORE-API-KEY-0001', issuerRut: '78506417-8' } });
  assert.equal(r.status, 200);
  const a = calls.find((c) => c.fn === 'crm_fiscal_save_credentials').args;
  assert.equal(a.p_key_version, 2);
  assert.ok(!JSON.stringify(calls).includes('DTECORE-API-KEY-0001'), 'la API key no viaja en claro');
  const hex = (s) => Buffer.from(s.slice(2), 'hex');
  const stored = { ciphertext: hex(a.p_ciphertext), iv: hex(a.p_iv), authTag: hex(a.p_auth_tag), keyVersion: a.p_key_version, provider: 'dtecore' };
  const ring = buildKeyring({ v1: b64(K1), v2: b64(K2), v2Kcv: kcv(K2) });
  assert.deepEqual(openWithKeyring(stored, { keyring: ring, businessId: BIZ }), { apiKey: 'DTECORE-API-KEY-0001' });
  assert.throws(() => open(stored, { key: K1, businessId: BIZ }), { code: 'CREDENTIAL_INVALID' }, 'la V1 nunca abre un registro nuevo');
});

test('Vercel sin clave V2 verificada: guardar una API key responde 503 sin tocar la base; lo demás funciona', async () => {
  const calls = [];
  const admin = { rpc: async (fn, args) => { calls.push(fn); return { data: { connected: true, issuerRut: '78506417-8' }, error: null }; } };
  const allow = parseAllowedIssuers(`${BIZ}=78506417-8`);
  const svc = createFiscalConnectionService({ admin, sealingKey: null, allowedIssuers: allow });
  const connect = await svc.connect({ businessId: BIZ, actorId: 'u1', body: { action: 'connect', apiKey: 'DTECORE-API-KEY-0001', issuerRut: '78506417-8' } });
  assert.deepEqual(connect, { status: 503, body: { error: 'SERVER_NOT_CONFIGURED' } });
  const submit = await svc.submit({ businessId: BIZ, actorId: 'u1', body: { action: 'submit', apiKey: 'DTECORE-API-KEY-0001', issuerRut: '78506417-8', resolucionNumero: 99, resolucionFecha: '2014-10-21' } });
  assert.deepEqual(submit, { status: 503, body: { error: 'SERVER_NOT_CONFIGURED' } });
  assert.ok(!calls.includes('crm_fiscal_save_credentials') && !calls.includes('crm_fiscal_submit_application'));
  assert.equal((await svc.status({ businessId: BIZ })).status, 200);
});
