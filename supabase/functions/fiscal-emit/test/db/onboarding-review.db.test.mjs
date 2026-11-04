// Alta de facturación por comercio con revisión de Walinka (migración F,
// 20261104_fiscal_onboarding_review.sql) contra Postgres real (solo walinka_test).
// Nunca apunta a producción (assertLocalTestConfig en store-pg.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { assertLocalTestConfig } from '../../lib/store-pg.mjs';
import { seal } from '../../lib/secrets.mjs';
import { CFG, makeFixture } from './fixtures.mjs';

const MASTER = randomBytes(32);
const API_KEY = 'dtc_live_SECRET_DO_NOT_STORE_PLAIN_0123456789';

let c;
before(async () => { c = new pg.Client(assertLocalTestConfig(CFG)); await c.connect(); });
after(async () => { await c.end(); });

async function newBusiness() {
  const userId = randomUUID();
  const businessId = randomUUID();
  await c.query(`insert into auth.users (id, email) values ($1, $2)`, [userId, `owner-${userId}@test.local`]);
  await c.query(
    `insert into public.wa_businesses (id, user_id, name, whatsapp, country_code, currency)
     values ($1, $2, 'Comercio nuevo', '+56900000000', 'CL', 'CLP')`,
    [businessId, userId],
  );
  return { businessId, ownerId: userId };
}

async function admin() {
  const id = randomUUID();
  await c.query(`insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, '{"role":"admin"}')`,
    [id, `admin-${id}@walinka.local`]);
  return id;
}

async function plainUser() {
  const id = randomUUID();
  await c.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `u-${id}@test.local`]);
  return id;
}

async function saveKey(businessId, actorId, apiKey = API_KEY) {
  const rec = seal({ apiKey }, { key: MASTER, businessId, provider: 'dtecore', keyVersion: 1 });
  await c.query(`select public.crm_fiscal_save_credentials($1, $2, '12345678-5', $3, $4, $5, 1)`,
    [businessId, actorId, rec.ciphertext, rec.iv, rec.authTag]);
}

const submit = (businessId, actorId, { numero = 80, fecha = '2014-08-22', sucursalNombre = null, sucursalCodigo = null } = {}) =>
  c.query(`select public.crm_fiscal_submit_application($1, $2, $3, $4::date, $5, $6) as ok`,
    [businessId, actorId, numero, fecha, sucursalNombre, sucursalCodigo]);

const review = (businessId, adminId, decision, note = null) =>
  c.query(`select public.crm_fiscal_review_application($1, $2, $3, $4) as ok`, [businessId, adminId, decision, note]);

async function issuer(businessId) {
  const r = await c.query(
    `select review_status, review_note, enabled, verified, resolucion_numero, resolucion_fecha::text as resolucion_fecha,
            sucursal_nombre, sucursal_codigo, submitted_by, reviewed_by
       from fiscal.issuers where business_id = $1`, [businessId]);
  return r.rows[0] ?? null;
}

async function status(businessId) {
  return (await c.query(`select public.crm_fiscal_connection_status($1) as s`, [businessId])).rows[0].s;
}

async function audit(businessId) {
  return (await c.query(
    `select action, outcome, actor_user_id from fiscal.admin_audit where business_id = $1 and action like 'application_%' order by id`,
    [businessId])).rows;
}

async function rejects(promise, code) {
  await assert.rejects(promise, (err) => String(err.message).includes(code));
}

test('alta completa: guardar clave -> enviar -> Walinka aprueba -> emisor verificado y habilitado', async () => {
  const { businessId, ownerId } = await newBusiness();
  const adminId = await admin();
  await saveKey(businessId, ownerId);
  assert.equal((await issuer(businessId)).review_status, 'draft');

  await submit(businessId, ownerId, { sucursalNombre: 'Casa Matriz', sucursalCodigo: '1' });
  let i = await issuer(businessId);
  assert.deepEqual(
    { s: i.review_status, e: i.enabled, v: i.verified, n: i.resolucion_numero, f: i.resolucion_fecha, sn: i.sucursal_nombre, sc: i.sucursal_codigo },
    { s: 'pending_review', e: false, v: false, n: 80, f: '2014-08-22', sn: 'Casa Matriz', sc: '1' },
  );

  await review(businessId, adminId, 'approve');
  i = await issuer(businessId);
  assert.deepEqual({ s: i.review_status, e: i.enabled, v: i.verified, r: i.reviewed_by }, { s: 'approved', e: true, v: true, r: adminId });
  assert.deepEqual((await audit(businessId)).map((a) => a.action), ['application_submitted', 'application_approved']);
});

test('sin API key guardada no se puede enviar la solicitud', async () => {
  const { businessId, ownerId } = await newBusiness();
  await rejects(submit(businessId, ownerId), 'FISCAL_CREDENTIALS_REQUIRED');
});

test('datos inválidos: resolución fuera de rango, fecha futura o código de sucursal no numérico', async () => {
  const { businessId, ownerId } = await newBusiness();
  await saveKey(businessId, ownerId);
  await rejects(submit(businessId, ownerId, { numero: 0 }), 'FISCAL_APPLICATION_INVALID');
  await rejects(submit(businessId, ownerId, { fecha: '2999-01-01' }), 'FISCAL_APPLICATION_INVALID');
  await rejects(submit(businessId, ownerId, { sucursalCodigo: 'ABC' }), 'FISCAL_APPLICATION_INVALID');
  assert.equal((await issuer(businessId)).review_status, 'draft');
});

test('solo un admin de Walinka puede revisar', async () => {
  const { businessId, ownerId } = await newBusiness();
  await saveKey(businessId, ownerId);
  await submit(businessId, ownerId);
  await rejects(review(businessId, ownerId, 'approve'), 'FISCAL_REVIEWER_NOT_ADMIN');
  await rejects(review(businessId, await plainUser(), 'approve'), 'FISCAL_REVIEWER_NOT_ADMIN');
  assert.equal((await issuer(businessId)).verified, false);
});

test('rechazo con motivo obligatorio; el comercio corrige y vuelve a enviar', async () => {
  const { businessId, ownerId } = await newBusiness();
  const adminId = await admin();
  await saveKey(businessId, ownerId);
  await submit(businessId, ownerId);
  await rejects(review(businessId, adminId, 'reject'), 'FISCAL_REVIEW_NOTE_REQUIRED');
  await review(businessId, adminId, 'reject', 'El RUT no corresponde a la cuenta DTE Core.');
  let s = await status(businessId);
  assert.equal(s.reviewStatus, 'rejected');
  assert.equal(s.reviewNote, 'El RUT no corresponde a la cuenta DTE Core.');
  assert.equal(s.enabled, false);
  // Rechazada no se puede aprobar directamente: tiene que volver a enviarse.
  await rejects(review(businessId, adminId, 'approve'), 'FISCAL_REVIEW_STATE');
  await submit(businessId, ownerId, { numero: 99 });
  s = await status(businessId);
  assert.equal(s.reviewStatus, 'pending_review');
  assert.equal(s.reviewNote, null);
  await review(businessId, adminId, 'approve');
  assert.equal((await issuer(businessId)).enabled, true);
});

test('cambiar la API key de un comercio aprobado lo devuelve a borrador y apaga la emisión', async () => {
  const { businessId, ownerId } = await newBusiness();
  const adminId = await admin();
  await saveKey(businessId, ownerId);
  await submit(businessId, ownerId);
  await review(businessId, adminId, 'approve');
  await saveKey(businessId, ownerId, 'dtc_live_OTRA_CLAVE_0123456789abcdef');
  const i = await issuer(businessId);
  assert.deepEqual({ s: i.review_status, e: i.enabled, v: i.verified }, { s: 'draft', e: false, v: false });
});

test('desconectar devuelve a borrador; reenviar con datos nuevos exige otra revisión', async () => {
  const { businessId, ownerId } = await newBusiness();
  const adminId = await admin();
  await saveKey(businessId, ownerId);
  await submit(businessId, ownerId);
  await review(businessId, adminId, 'approve');
  await c.query(`select public.crm_fiscal_disconnect($1, $2)`, [businessId, ownerId]);
  assert.equal((await issuer(businessId)).review_status, 'draft');
  await rejects(submit(businessId, ownerId), 'FISCAL_CREDENTIALS_REQUIRED');
});

test('suspender: solo un aprobado, con motivo; apaga la emisión', async () => {
  const { businessId, ownerId } = await newBusiness();
  const adminId = await admin();
  await saveKey(businessId, ownerId);
  await submit(businessId, ownerId);
  await rejects(review(businessId, adminId, 'suspend', 'x'), 'FISCAL_REVIEW_STATE');
  await review(businessId, adminId, 'approve');
  await rejects(review(businessId, adminId, 'suspend'), 'FISCAL_REVIEW_NOTE_REQUIRED');
  await review(businessId, adminId, 'suspend', 'Reclamos del SII');
  const i = await issuer(businessId);
  assert.deepEqual({ s: i.review_status, e: i.enabled, v: i.verified }, { s: 'suspended', e: false, v: false });
  assert.deepEqual((await audit(businessId)).map((a) => a.action),
    ['application_submitted', 'application_approved', 'application_suspended']);
});

test('la base impide marcar un emisor verificado sin aprobación de Walinka', async () => {
  const { businessId, ownerId } = await newBusiness();
  await saveKey(businessId, ownerId);
  await rejects(c.query(`update fiscal.issuers set verified = true where business_id = $1`, [businessId]), 'issuers_review_check');
});

test('un emisor sin aprobar no puede emitir: el reclamo de una venta falla', async () => {
  const f = await makeFixture(c, { issuerVerified: false, issuerEnabled: false });
  const r = await c.query(
    `select public.crm_fiscal_claim_with_credentials($1, $2, $3) as r`,
    [f.businessId, f.saleId, randomUUID()],
  ).catch((err) => ({ error: err }));
  assert.equal(r.error?.message, 'FISCAL_ISSUER_NOT_ENABLED');
});

test('cola de revisión: pendientes primero, sin secretos, con correo del dueño', async () => {
  const { businessId, ownerId } = await newBusiness();
  await saveKey(businessId, ownerId);
  await submit(businessId, ownerId);
  const list = (await c.query(`select public.crm_fiscal_list_applications('pending_review') as l`)).rows[0].l;
  const row = list.find((x) => x.businessId === businessId);
  assert.ok(row);
  assert.equal(row.reviewStatus, 'pending_review');
  assert.equal(row.hasCredentials, true);
  assert.match(row.ownerEmail, /^owner-/);
  assert.equal(JSON.stringify(list).includes(API_KEY), false);
  assert.equal(JSON.stringify(list).includes('ciphertext'), false);
});

test('el contexto de emisión incluye la resolución del emisor (para imprimir la boleta)', async () => {
  const f = await makeFixture(c);
  const ctx = (await c.query(`select public.crm_fiscal_emission_context($1, $2) as x`, [f.businessId, f.saleId])).rows[0].x;
  assert.equal(ctx.issuer.resolucion_numero, 80);
  assert.equal(ctx.issuer.resolucion_fecha, '2014-08-22');
});

test('permisos: anon y authenticated no ejecutan las funciones nuevas', async () => {
  for (const sig of [
    'public.crm_fiscal_submit_application(uuid,uuid,integer,date,text,text)',
    'public.crm_fiscal_review_application(uuid,uuid,text,text)',
    'public.crm_fiscal_list_applications(text)',
  ]) {
    for (const role of ['anon', 'authenticated']) {
      const r = await c.query(`select has_function_privilege($1, $2, 'execute') as ok`, [role, sig]);
      assert.equal(r.rows[0].ok, false, `${role} no debe ejecutar ${sig}`);
    }
    const s = await c.query(`select has_function_privilege('service_role', $1, 'execute') as ok`, [sig]);
    assert.equal(s.rows[0].ok, true);
  }
});
