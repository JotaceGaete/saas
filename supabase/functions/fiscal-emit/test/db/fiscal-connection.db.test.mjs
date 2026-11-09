// Conexión DTECore por comercio contra Postgres real (solo walinka_test). Cubre la migración
// 20261101_fiscal_connection.sql: estado sin secretos, guardar/reemplazar credenciales, validación
// de entrada, bloqueo con emisiones en curso, desconexión, auditoría sin clave y privilegios.
// Nunca apunta a producción (assertLocalTestConfig en store-pg.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { assertLocalTestConfig } from '../../lib/store-pg.mjs';
import { seal } from '../../lib/secrets.mjs';
import { CFG, makeFixture, uniqueRut } from './fixtures.mjs';

const MASTER = randomBytes(32);
const SAVE_SIG = 'public.crm_fiscal_save_credentials(uuid,uuid,text,bytea,bytea,bytea,integer)';
const DISCONNECT_SIG = 'public.crm_fiscal_disconnect(uuid,uuid)';
const STATUS_SIG = 'public.crm_fiscal_connection_status(uuid)';
const API_KEY = 'dtc_live_SECRET_DO_NOT_STORE_PLAIN_0123456789';

let c;

before(async () => {
  c = new pg.Client(assertLocalTestConfig(CFG));
  await c.connect();
});

after(async () => {
  await c.end();
});

// Sella una clave como lo hace el servicio. Solo bytes cifrados llegan a la base.
function sealFor(businessId, apiKey = API_KEY) {
  return seal({ apiKey }, { key: MASTER, businessId, provider: 'dtecore', keyVersion: 1 });
}

async function save(businessId, actorId, { rut = uniqueRut(), rec = sealFor(businessId) } = {}) {
  return c.query(
    `select public.crm_fiscal_save_credentials($1, $2, $3, $4, $5, $6, $7) as ok`,
    [businessId, actorId, rut, rec.ciphertext, rec.iv, rec.authTag, 1],
  );
}

async function status(businessId) {
  const r = await c.query(`select public.crm_fiscal_connection_status($1) as s`, [businessId]);
  return r.rows[0].s;
}

async function issuer(businessId) {
  const r = await c.query(`select issuer_rut, enabled, verified from fiscal.issuers where business_id = $1`, [businessId]);
  return r.rows[0] ?? null;
}

async function credentialRow(businessId) {
  const r = await c.query(`select business_id from fiscal.business_credentials where business_id = $1`, [businessId]);
  return r.rows[0] ?? null;
}

async function auditRows(businessId) {
  const r = await c.query(
    `select action, outcome, detail::text as detail from fiscal.admin_audit where business_id = $1 order by created_at, id`,
    [businessId],
  );
  return r.rows;
}

async function newBusiness(opts) {
  return makeFixture(c, { withCredentials: false, issuerEnabled: false, issuerVerified: false, ...opts });
}

// ---------------------------------------------------------------------------

test('estado sin credenciales: no conectado, sin secretos en el resultado', async () => {
  const f = await newBusiness();
  const s = await status(f.businessId);
  assert.equal(s.connected, false);
  assert.equal(s.keyVersion, null);
  const text = JSON.stringify(s);
  assert.equal(/ciphertext|iv|auth_tag|apiKey|SECRET/i.test(text), false);
});

test('guardar: conecta el RUT y cifra; el estado no revela la clave ni el texto cifrado', async () => {
  const f = await newBusiness();
  const rut = uniqueRut();
  await save(f.businessId, f.userId, { rut });
  const s = await status(f.businessId);
  assert.equal(s.connected, true);
  assert.equal(s.issuerRut, rut);
  // H: una conexión recién guardada no tiene el RUT confirmado por el propietario.
  assert.equal(s.rutConfirmed, false);
  assert.equal(s.rutConfirmationReason, 'not_confirmed');
  assert.equal(s.keyVersion, 1);
  assert.equal(JSON.stringify(s).includes(API_KEY), false);
});

test('guardar: lo almacenado no contiene la clave en claro', async () => {
  const f = await newBusiness();
  await save(f.businessId, f.userId);
  const r = await c.query(`select ciphertext, iv, auth_tag from fiscal.business_credentials where business_id = $1`, [f.businessId]);
  const blob = Buffer.concat([r.rows[0].ciphertext, r.rows[0].iv, r.rows[0].auth_tag]);
  assert.equal(blob.includes(Buffer.from(API_KEY, 'utf8')), false);
});

test('guardar: deja enabled = false y verified = false aunque antes estuviera verificado', async () => {
  // Antes verificado y aprobado (con su key verificada).
  const f = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  const rut = uniqueRut();
  await save(f.businessId, f.userId, { rut });
  const i = await issuer(f.businessId);
  assert.equal(i.issuer_rut, rut);
  assert.equal(i.enabled, false, 'reconectar no habilita emisión');
  assert.equal(i.verified, false, 'reconectar exige nueva verificación');
});

test('reemplazar: una sola fila por negocio y RUT actualizado', async () => {
  const f = await newBusiness();
  await save(f.businessId, f.userId, { rut: uniqueRut() });
  const nuevoRut = uniqueRut();
  await save(f.businessId, f.userId, { rut: nuevoRut, rec: sealFor(f.businessId, 'OTRA_CLAVE_DE_PRUEBA_0123') });
  const n = await c.query(`select count(*)::int as n from fiscal.business_credentials where business_id = $1`, [f.businessId]);
  assert.equal(n.rows[0].n, 1);
  assert.equal((await issuer(f.businessId)).issuer_rut, nuevoRut);
});

test('validación en base: RUT, longitudes de IV y tag, y bytes vacíos se rechazan', async () => {
  const f = await newBusiness();
  const rec = sealFor(f.businessId);
  // La base valida la forma del RUT; el dígito verificador lo valida la aplicación (normalizeRut).
  await assert.rejects(save(f.businessId, f.userId, { rut: '123456789-5' }), /Invalid fiscal connection input/);
  await assert.rejects(save(f.businessId, f.userId, { rut: 'abc' }), /Invalid fiscal connection input/);
  await assert.rejects(c.query(
    `select public.crm_fiscal_save_credentials($1,$2,'12345678-5',$3,$4,$5,1)`,
    [f.businessId, f.userId, rec.ciphertext, randomBytes(11), rec.authTag]), /Invalid fiscal connection input/);
  await assert.rejects(c.query(
    `select public.crm_fiscal_save_credentials($1,$2,'12345678-5',$3,$4,$5,1)`,
    [f.businessId, f.userId, rec.ciphertext, rec.iv, randomBytes(8)]), /Invalid fiscal connection input/);
  await assert.rejects(c.query(
    `select public.crm_fiscal_save_credentials($1,$2,'12345678-5','\\x'::bytea,$3,$4,1)`,
    [f.businessId, f.userId, rec.iv, rec.authTag]), /Invalid fiscal connection input/);
  assert.equal(await credentialRow(f.businessId), null, 'ningún intento inválido deja credenciales');
});

test('negocio inactivo: no se puede conectar', async () => {
  const f = await newBusiness();
  await c.query(`update public.wa_businesses set is_active = false where id = $1`, [f.businessId]);
  await assert.rejects(save(f.businessId, f.userId), /FISCAL_BUSINESS_INACTIVE/);
  assert.equal(await credentialRow(f.businessId), null);
});

test('emisión en curso (sending): guardar y desconectar quedan bloqueados sin cambios', async () => {
  const f = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  await c.query(
    `insert into public.crm_fiscal_issuances (business_id, sale_id, provider, dte_type, operation_id, status)
     values ($1, $2, 'siisolutions', 39, $3, 'sending')`,
    [f.businessId, f.saleId, f.operationId],
  );
  const before = await credentialRow(f.businessId);
  await assert.rejects(save(f.businessId, f.userId, { rut: uniqueRut() }), /FISCAL_OPERATION_IN_PROGRESS/);
  await assert.rejects(c.query(`select public.crm_fiscal_disconnect($1,$2)`, [f.businessId, f.userId]), /FISCAL_OPERATION_IN_PROGRESS/);
  assert.deepEqual(await credentialRow(f.businessId), before, 'la credencial sigue ahí');
  assert.equal((await issuer(f.businessId)).issuer_rut, f.issuerRut, 'el RUT no cambió');
});

test('bloqueo solo por el negocio afectado: otro comercio con emisión en curso no bloquea', async () => {
  const busy = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  await c.query(
    `insert into public.crm_fiscal_issuances (business_id, sale_id, provider, dte_type, operation_id, status)
     values ($1, $2, 'siisolutions', 39, $3, 'sending')`,
    [busy.businessId, busy.saleId, busy.operationId],
  );
  const free = await newBusiness();
  await save(free.businessId, free.userId);
  assert.equal((await status(free.businessId)).connected, true);
});

test('desconectar: borra la credencial, deshabilita el emisor y el estado queda sin conexión', async () => {
  const f = await makeFixture(c, { withCredentials: false, issuerEnabled: false, issuerVerified: false });
  await save(f.businessId, f.userId);
  await c.query(`update fiscal.issuers set review_status = 'approved', enabled = true, verified = true where business_id = $1`, [f.businessId]);
  await c.query(`select public.crm_fiscal_disconnect($1,$2)`, [f.businessId, f.userId]);
  assert.equal(await credentialRow(f.businessId), null);
  const i = await issuer(f.businessId);
  assert.equal(i.enabled, false);
  assert.equal(i.verified, false);
  assert.equal((await status(f.businessId)).connected, false);
});

test('auditoría: registra acciones con RUT y versión, nunca la clave', async () => {
  const f = await newBusiness();
  const rut = uniqueRut();
  await save(f.businessId, f.userId, { rut });
  await c.query(`select public.crm_fiscal_disconnect($1,$2)`, [f.businessId, f.userId]);
  const rows = await auditRows(f.businessId);
  const actions = rows.map((r) => r.action);
  assert.ok(actions.includes('credentials_saved'));
  assert.ok(actions.includes('credentials_removed'));
  const saved = rows.find((r) => r.action === 'credentials_saved');
  assert.ok(saved.detail.includes(rut));
  assert.equal(rows.some((r) => r.detail.includes(API_KEY)), false);
  assert.equal(rows.some((r) => /ciphertext|auth_tag|\\x/i.test(r.detail)), false);
});

test('privilegios: solo service_role puede ejecutar las funciones de conexión', async () => {
  for (const sig of [SAVE_SIG, DISCONNECT_SIG, STATUS_SIG]) {
    for (const role of ['anon', 'authenticated', 'public']) {
      const r = await c.query(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, sig]);
      assert.equal(r.rows[0].ok, false, `${role} no debe ejecutar ${sig}`);
    }
    const sr = await c.query(`select has_function_privilege('service_role', $1, 'EXECUTE') as ok`, [sig]);
    assert.equal(sr.rows[0].ok, true, `service_role debe ejecutar ${sig}`);
  }
});

test('desconectar un negocio sin credenciales no falla y deja auditoría', async () => {
  const f = await newBusiness();
  await c.query(`select public.crm_fiscal_disconnect($1,$2)`, [f.businessId, f.userId]);
  const rows = await auditRows(f.businessId);
  assert.equal(rows.find((r) => r.action === 'credentials_removed').detail.includes('"had_credentials": false'), true);
});
