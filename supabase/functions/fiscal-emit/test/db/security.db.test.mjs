// Revisión de seguridad (PR #108) contra Postgres real (walinka_test): cambio de dueño con
// revocación y auditoría, roles, auditoría solo-anexar, bloqueo retroactivo de las cuatro ventas
// Point, recibos no reasociables y reconciliación administrativa. Nunca apunta a producción.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPgStore, assertLocalTestConfig } from '../../lib/store-pg.mjs';
import { createAdminReconciler } from '../../lib/reconciler.mjs';
import { operationIdFor } from '../../lib/emit.mjs';
import { CFG, makeFixture, otherUser, setEmissionControl } from './fixtures.mjs';

const POINT_SALES = [
  '8d40285b-4d52-41fa-ab7a-90870ca150dd',
  'df077a1b-7cdc-4825-8750-6a5a991a3095',
  'ef2746fd-ca30-4ebc-86c6-4b8442e5fb84',
  '661c88a9-9731-46f8-a685-4e112290a98e',
];
const DOC = { folio: 4300, xmlBase64: 'PHhtbD4=', pdfBase64: 'JVBERi0xLjQK' };

let c;
let store;
let savedControl;

before(async () => {
  c = new pg.Client(assertLocalTestConfig(CFG));
  await c.connect();
  const r = await c.query(`select enabled from fiscal.dte39_emission_control where singleton`);
  savedControl = r.rows[0]?.enabled ?? false;
  await setEmissionControl(c, true);
  store = createPgStore(CFG);
});

after(async () => {
  await setEmissionControl(c, savedControl);
  await store.end();
  await c.end();
});

async function actorRole(businessId, userId) {
  const r = await c.query(`select public.crm_fiscal_actor_role($1, $2) as role`, [businessId, userId]);
  return r.rows[0].role;
}

async function hasRole(businessId, userId, role) {
  const r = await c.query(`select public.crm_fiscal_has_role($1, $2, $3) as ok`, [businessId, userId, role]);
  return r.rows[0].ok === true;
}

async function issuanceStatus(businessId, saleId) {
  const r = await c.query(
    `select status, folio from public.crm_fiscal_issuances where business_id = $1 and sale_id = $2 and dte_type = 39`,
    [businessId, saleId],
  );
  return r.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// 1. Cambio de propietario
// ---------------------------------------------------------------------------

test('cambio de dueño: el anterior pierde todo rol fiscal, el nuevo recibe fiscal_owner, queda auditado', async () => {
  const fx = await makeFixture(c);
  const newOwner = await otherUser(c);
  await c.query(
    `insert into fiscal.business_fiscal_roles (business_id, user_id, role) values ($1, $2, 'fiscal_operator')`,
    [fx.businessId, fx.userId],
  );
  assert.equal(await actorRole(fx.businessId, fx.userId), 'fiscal_owner');

  await c.query(`update public.wa_businesses set user_id = $2 where id = $1`, [fx.businessId, newOwner]);

  assert.equal(await actorRole(fx.businessId, fx.userId), null, 'sin acceso heredado');
  assert.equal(await hasRole(fx.businessId, fx.userId, 'fiscal_operator'), false);
  assert.equal(await actorRole(fx.businessId, newOwner), 'fiscal_owner');

  const audit = await c.query(
    `select action, outcome, detail from fiscal.admin_audit where business_id = $1 and action = 'owner_changed'`,
    [fx.businessId],
  );
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].outcome, 'previous_owner_revoked');
  assert.equal(audit.rows[0].detail.previous_user_id, fx.userId);
  assert.equal(audit.rows[0].detail.new_user_id, newOwner);
  assert.equal(audit.rows[0].detail.revoked_rows, 2);
});

test('cambio de dueño sin cambio de user_id no toca roles ni audita', async () => {
  const fx = await makeFixture(c);
  await c.query(`update public.wa_businesses set name = 'Renombrado' where id = $1`, [fx.businessId]);
  assert.equal(await actorRole(fx.businessId, fx.userId), 'fiscal_owner');
  const r = await c.query(`select count(*)::int as n from fiscal.admin_audit where business_id = $1`, [fx.businessId]);
  assert.equal(r.rows[0].n, 0);
});

// ---------------------------------------------------------------------------
// 2. Auditoría solo-anexar
// ---------------------------------------------------------------------------

test('admin_audit no admite UPDATE ni DELETE', async () => {
  const fx = await makeFixture(c);
  await store.appendAudit({ businessId: fx.businessId, actorUserId: fx.userId, action: 'reconcile_attempt', outcome: 'started', detail: {} });
  await assert.rejects(c.query(`update fiscal.admin_audit set outcome = 'x' where business_id = $1`, [fx.businessId]));
  await assert.rejects(c.query(`delete from fiscal.admin_audit where business_id = $1`, [fx.businessId]));
  const r = await c.query(`select outcome from fiscal.admin_audit where business_id = $1`, [fx.businessId]);
  assert.equal(r.rows[0].outcome, 'started');
});

// ---------------------------------------------------------------------------
// 3. Ventas Point bloqueadas para emisión retroactiva
// ---------------------------------------------------------------------------

test('las cuatro ventas Point antiguas están bloqueadas en la migración', async () => {
  const r = await c.query(
    `select sale_id from fiscal.retroactive_emission_blocks where sale_id = any($1::uuid[])`,
    [POINT_SALES],
  );
  assert.equal(r.rows.length, 4);
});

test('reclamo de una venta bloqueada -> FISCAL_RETROACTIVE_BLOCKED, sin fila nueva', async () => {
  const fx = await makeFixture(c);
  await c.query(`insert into fiscal.retroactive_emission_blocks (sale_id, reason) values ($1, 'prueba de bloqueo')`, [fx.saleId]);
  await assert.rejects(store.claim(fx.businessId, fx.saleId, fx.operationId), { code: 'FISCAL_RETROACTIVE_BLOCKED' });
  assert.equal(await issuanceStatus(fx.businessId, fx.saleId), null);
});

// ---------------------------------------------------------------------------
// 4. Recibos no sobrescribibles ni reasociables
// ---------------------------------------------------------------------------

test('recibo: no se asocia a otro negocio ni a otra operación; no se sobrescribe', async () => {
  const fx = await makeFixture(c);
  const other = await makeFixture(c);
  assert.equal(await store.claim(fx.businessId, fx.saleId, fx.operationId), true);

  await assert.rejects(store.storeReceipt(other.businessId, fx.saleId, fx.operationId, DOC), { code: 'FISCAL_NOT_SENDING' });
  await assert.rejects(store.storeReceipt(fx.businessId, fx.saleId, 'WLK-otra-operacion', DOC), { code: 'FISCAL_NOT_SENDING' });

  // Inserción directa con negocio ajeno: la clave compuesta del recibo lo impide.
  await assert.rejects(c.query(
    `insert into fiscal.crm_fiscal_provider_receipts
       (business_id, sale_id, operation_id, folio, xml_base64, pdf_base64, xml_sha256, pdf_sha256)
     values ($1, $2, $3, 4300, 'PHhtbD4=', 'JVBERi0xLjQK', repeat('a',64), repeat('b',64))`,
    [other.businessId, fx.saleId, fx.operationId],
  ));

  assert.equal(await store.storeReceipt(fx.businessId, fx.saleId, fx.operationId, DOC), true);
  await assert.rejects(store.storeReceipt(fx.businessId, fx.saleId, fx.operationId, { ...DOC, folio: 4301 }), { code: 'FISCAL_RECEIPT_CONFLICT' });
  const r = await c.query(
    `select folio from fiscal.crm_fiscal_provider_receipts where business_id = $1 and sale_id = $2`,
    [fx.businessId, fx.saleId],
  );
  assert.equal(r.rows[0].folio, 4300);
});

// ---------------------------------------------------------------------------
// 5. Reconciliación administrativa contra la base
// ---------------------------------------------------------------------------

async function unknownFixture() {
  const fx = await makeFixture(c);
  await store.claim(fx.businessId, fx.saleId, fx.operationId);
  await store.finalize(fx.businessId, fx.saleId, fx.operationId, { status: 'unknown' });
  return fx;
}

function evidence(userId, over = {}) {
  return {
    outcome: 'issued', folio: 4301, xmlBase64: 'PHhtbD4=', pdfBase64: 'JVBERi0xLjQK',
    reviewer: 'Ana Reconciliadora', reviewerUserId: userId, evidenceReference: 'portal-ref-4301',
    providerStatus: 'found', checkedAt: new Date().toISOString(),
    reason: 'Encontrada en portal por RUT y monto', ...over,
  };
}

test('cajero no concilia un unknown; la fila queda igual y se audita el intento', async () => {
  const fx = await unknownFixture();
  await c.query(`insert into fiscal.business_fiscal_roles (business_id, user_id, role) values ($1, $2, 'fiscal_operator')`, [fx.businessId, fx.userId]);
  const rec = createAdminReconciler({ store });
  await assert.rejects(rec.reconcile({ actorUserId: fx.userId, saleId: fx.saleId, evidence: evidence(fx.userId) }), { code: 'RECONCILIATION_NOT_AUTHORIZED' });
  assert.equal((await issuanceStatus(fx.businessId, fx.saleId)).status, 'unknown');
  const r = await c.query(`select outcome from fiscal.admin_audit where business_id = $1 and action = 'reconcile_result' order by id desc limit 1`, [fx.businessId]);
  assert.equal(r.rows[0].outcome, 'denied_no_reconciler_role');
});

test('reconciliador con evidencia: resuelve, registra evidencia y audita inicio y resultado', async () => {
  const fx = await unknownFixture();
  await c.query(`insert into fiscal.business_fiscal_roles (business_id, user_id, role) values ($1, $2, 'fiscal_reconciler')`, [fx.businessId, fx.userId]);
  assert.equal(await hasRole(fx.businessId, fx.userId, 'fiscal_reconciler'), true);
  const rec = createAdminReconciler({ store });
  const out = await rec.reconcile({ actorUserId: fx.userId, saleId: fx.saleId, evidence: evidence(fx.userId) });
  assert.equal(out.status, 'issued');
  const st = await issuanceStatus(fx.businessId, fx.saleId);
  assert.equal(st.status, 'issued');
  assert.equal(st.folio, 4301);
  const audit = await c.query(`select outcome from fiscal.admin_audit where business_id = $1 order by id`, [fx.businessId]);
  assert.deepEqual(audit.rows.map((x) => x.outcome), ['applied']);
});

test('reconciliador que firma por otro -> EVIDENCE_REVIEWER_MISMATCH, sin cambios', async () => {
  const fx = await unknownFixture();
  const stranger = await otherUser(c);
  await c.query(`insert into fiscal.business_fiscal_roles (business_id, user_id, role) values ($1, $2, 'fiscal_reconciler')`, [fx.businessId, fx.userId]);
  const rec = createAdminReconciler({ store });
  await assert.rejects(rec.reconcile({ actorUserId: fx.userId, saleId: fx.saleId, evidence: evidence(stranger) }), { code: 'EVIDENCE_REVIEWER_MISMATCH' });
  assert.equal((await issuanceStatus(fx.businessId, fx.saleId)).status, 'unknown');
});

test('tras cambio de dueño el dueño anterior ya no puede conciliar aunque tuviera rol reconciliador', async () => {
  const fx = await unknownFixture();
  const newOwner = await otherUser(c);
  await c.query(`insert into fiscal.business_fiscal_roles (business_id, user_id, role) values ($1, $2, 'fiscal_reconciler')`, [fx.businessId, fx.userId]);
  await c.query(`update public.wa_businesses set user_id = $2 where id = $1`, [fx.businessId, newOwner]);
  const rec = createAdminReconciler({ store });
  await assert.rejects(rec.reconcile({ actorUserId: fx.userId, saleId: fx.saleId, evidence: evidence(fx.userId) }), { code: 'SALE_NOT_FOUND' });
  assert.equal((await issuanceStatus(fx.businessId, fx.saleId)).status, 'unknown');
});

// ---------------------------------------------------------------------------
// 6. Reconciliación atómica (crm_fiscal_reconcile_admin)
// ---------------------------------------------------------------------------

test('la RPC rechaza a un revisor distinto del actor, aunque la aplicación no lo hubiera validado', async () => {
  const fx = await unknownFixture();
  const stranger = await otherUser(c);
  await c.query(`insert into fiscal.business_fiscal_roles (business_id, user_id, role) values ($1, $2, 'fiscal_reconciler')`, [fx.businessId, fx.userId]);
  await assert.rejects(store.reconcileAdmin(fx.businessId, fx.saleId, fx.operationId, fx.userId,
    { ...evidence(fx.userId), reviewerUserId: stranger }), { code: 'FISCAL_REVIEWER_MISMATCH' });
  assert.equal((await issuanceStatus(fx.businessId, fx.saleId)).status, 'unknown');
});

test('si la auditoría falla dentro de la transacción, la evidencia y el estado se revierten por completo', async () => {
  const fx = await unknownFixture();
  await c.query(`insert into fiscal.business_fiscal_roles (business_id, user_id, role) values ($1, $2, 'fiscal_reconciler')`, [fx.businessId, fx.userId]);
  await c.query('begin');
  try {
    await c.query(`create or replace function public.zz_boom_audit() returns trigger language plpgsql as $$
                   begin raise exception 'boom audit'; end $$`);
    await c.query(`create trigger zz_boom_audit before insert on fiscal.admin_audit
                   for each row execute function public.zz_boom_audit()`);
    await assert.rejects(c.query(
      `select public.crm_fiscal_reconcile_admin($1, $2, $3, $4, $4, 'issued', 4301, 'PHhtbD4=', 'JVBERi0xLjQK',
         'Ana Reconciliadora', 'Encontrada en portal por RUT y monto', 'portal-ref-rollback', 'found', now())`,
      [fx.businessId, fx.saleId, fx.operationId, fx.userId]), /boom audit/);
  } finally {
    await c.query('rollback');
  }
  assert.equal((await issuanceStatus(fx.businessId, fx.saleId)).status, 'unknown', 'el estado no cambió');
  const ev = await c.query(`select count(*)::int as n from fiscal.crm_fiscal_reconciliation_evidence where sale_id = $1`, [fx.saleId]);
  assert.equal(ev.rows[0].n, 0, 'la evidencia no quedó escrita');
  await c.query('drop trigger if exists zz_boom_audit on fiscal.admin_audit');
  await c.query('drop function if exists public.zz_boom_audit()');
});

// ---------------------------------------------------------------------------
// 7. Privilegios de wa_businesses.user_id y no afectación de ventas nuevas
// ---------------------------------------------------------------------------

test('authenticated y anon no pueden actualizar wa_businesses.user_id; sí otras columnas', async () => {
  const r = await c.query(`select
      has_column_privilege('authenticated', 'public.wa_businesses', 'user_id', 'UPDATE') as auth_user_id,
      has_column_privilege('anon', 'public.wa_businesses', 'user_id', 'UPDATE') as anon_user_id,
      has_column_privilege('authenticated', 'public.wa_businesses', 'name', 'UPDATE') as auth_name`);
  assert.equal(r.rows[0].auth_user_id, false);
  assert.equal(r.rows[0].anon_user_id, false);
  assert.equal(r.rows[0].auth_name, true);
});

test('un bloqueo por venta no afecta a una venta nueva del mismo negocio', async () => {
  const blocked = await makeFixture(c);
  const fresh = await makeFixture(c);
  await c.query(`insert into fiscal.retroactive_emission_blocks (sale_id, reason) values ($1, 'prueba de aislamiento por venta')`, [blocked.saleId]);
  assert.equal(await store.claim(fresh.businessId, fresh.saleId, fresh.operationId), true);
  assert.equal((await issuanceStatus(fresh.businessId, fresh.saleId)).status, 'sending');
});
