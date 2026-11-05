// Laboratorio multiempresa (migración H) contra Postgres real (solo walinka_test, nunca producción).
// Dos comercios ficticios A y B, cada uno con su dueño, su RUT, su API key simulada y su
// verificación de identidad. Proveedor SIMULADO: ninguna llamada de red, ninguna emisión real.
//
// Garantías que se demuestran (numeradas como en el pedido):
//   1. A nunca emite con la identidad fiscal de B.
//   2. B no accede a los documentos de A.
//   3. Una API key de otro RUT se rechaza antes de emitir.
//   4. Un RUT duplicado no se registra indebidamente.
//   5. Un folio repetido del mismo emisor se rechaza.
//   6. Dos emisores distintos pueden usar el mismo número de folio.
//   7. Una venta emitida no se modifica (salvo corrección autorizada y auditada).
//   8. Dos cajas simultáneas no provocan doble emisión.
//   9. Un timeout no provoca reenvíos inseguros.
//  10. Una reimpresión no genera otra boleta.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import pg from 'pg';
import { createPgStore, assertLocalTestConfig } from '../../lib/store-pg.mjs';
import { createFiscalEmitter, operationIdFor } from '../../lib/emit.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { createSiisolutionsHttpProvider } from '../../lib/providers/siisolutions-http.mjs';
import { parseAllowedIssuers } from '../../lib/allowlist.mjs';
import { seal } from '../../lib/secrets.mjs';
import { CFG, TEST_MASTER_KEY, makeFixture, setEmissionControl, uniqueRut, verifyIdentity, otherUser } from './fixtures.mjs';

let c;
let store;
let savedControl;

before(async () => {
  c = new pg.Client(assertLocalTestConfig(CFG));
  await c.connect();
  savedControl = (await c.query(`select enabled, identity_methods_accepted from fiscal.dte39_emission_control where singleton`)).rows[0];
  await setEmissionControl(c, true);
  store = createPgStore(CFG);
});
after(async () => {
  await setEmissionControl(c, savedControl?.enabled ?? false, savedControl?.identity_methods_accepted ?? []);
  await store.end();
  await c.end();
});

// Proveedor simulado con identidad: cada API key pertenece a un RUT (como una cuenta DTE Core).
function simProvider({ keyOwners = new Map(), scenario = 'ok', folioStart = randomInt(100_000, 900_000), delayMs = 20 } = {}) {
  const sim = createSimulatedProvider({ scenario, folioStart, delayMs, identityFor: (k) => keyOwners.get(k) ?? null });
  const seen = [];
  return {
    name: 'dtecore', ready: true, identityContractVerified: true, seen,
    get calls() { return sim.calls; },
    get identityCalls() { return sim.identityCalls; },
    async emit(a) { seen.push({ rutEmisor: a.payload?.rutEmisor ?? a.payload?.rutOperador ?? null, apiKey: a.credentials?.apiKey, expect: a.expect }); return sim.emit(a); },
    verifyIdentity: (a) => sim.verifyIdentity(a),
    async lookupOperation() { return { result: 'not_found' }; },
    async retrieveDocuments() { return null; },
  };
}

const emitterFor = (p, allow, timeoutMs = 400) => createFiscalEmitter({
  store, provider: p, masterKey: TEST_MASTER_KEY, allowedIssuers: parseAllowedIssuers(allow), timeoutMs,
});

// Comercio del laboratorio: fixture + API key propia conocida + otra venta opcional.
async function merchant(label, opts = {}) {
  const f = await makeFixture(c, opts);
  const apiKey = `TEST-API-KEY-${f.businessId}`;
  return { ...f, label, apiKey };
}

async function extraSale(f, total = 2380) {
  const saleId = randomUUID();
  await c.query(
    `insert into public.crm_invoices (id, business_id, invoice_number, status, paid_at, total, subtotal, discount_amount)
     values ($1, $2, $3, 'pagada', now(), $4, $4, 0)`, [saleId, f.businessId, randomInt(1, 2_000_000_000), total]);
  const item = await c.query(
    `insert into public.crm_invoice_items (invoice_id, name, unit_price, quantity, subtotal, sort_order)
     values ($1, 'Café', 1190, 2, $2, 1) returning id`, [saleId, total]);
  await c.query(
    `insert into fiscal.line_tax_verifications (business_id, sale_id, invoice_item_id, category, verified, evidence, verified_at, line_fingerprint)
     select $1, $2, i.id, 'IVA_AFECTO_19', true, 'Verificado por contador, prueba', now(),
            md5(jsonb_build_array(i.product_id, i.name, i.description, i.unit_price, i.quantity,
                  i.discount_pct, i.subtotal, i.sort_order, i.discount_type)::text)
       from public.crm_invoice_items i where i.id = $3`, [f.businessId, saleId, item.rows[0].id]);
  await c.query(
    `insert into public.crm_payments (business_id, invoice_id, amount, payment_method, payment_status, payment_number)
     values ($1, $2, $3, 'cash', 'received', $4)`, [f.businessId, saleId, total, randomInt(100, 1_000_000)]);
  return { ...f, saleId, operationId: operationIdFor(f.businessId, saleId) };
}

async function pair() {
  const A = await merchant('A');
  const B = await merchant('B');
  assert.notEqual(A.issuerRut, B.issuerRut);
  const keyOwners = new Map([[A.apiKey, A.issuerRut], [B.apiKey, B.issuerRut]]);
  const allow = `${A.businessId}=${A.issuerRut},${B.businessId}=${B.issuerRut}`;
  return { A, B, keyOwners, allow };
}

const ledger = async (saleId) => (await c.query(
  `select status, folio, issuer_rut from public.crm_fiscal_issuances where sale_id = $1`, [saleId])).rows;

const saveCredentials = (businessId, actorId, rut, apiKey) => {
  const rec = seal({ apiKey }, { key: TEST_MASTER_KEY, businessId });
  return c.query(`select public.crm_fiscal_save_credentials($1, $2, $3, $4, $5, $6, 1)`,
    [businessId, actorId, rut, rec.ciphertext, rec.iv, rec.authTag]);
};

async function asAuthenticated(userId, fn) {
  await c.query('begin');
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [userId]);
    await c.query('set local role authenticated');
    return await fn();
  } finally {
    await c.query('rollback');
  }
}

// ---------------------------------------------------------------------------------------------
test('1. A nunca emite con la identidad fiscal de B', async () => {
  const { A, B, keyOwners, allow } = await pair();
  const p = simProvider({ keyOwners });
  const e = emitterFor(p, allow);

  // a) A no puede adoptar el RUT de B (la base lo rechaza aunque el formato sea otro).
  const dotted = B.issuerRut.replace(/^(\d{1,2})(\d{3})(\d{3})-/, '$1.$2.$3-');
  await assert.rejects(saveCredentials(A.businessId, A.userId, B.issuerRut, A.apiKey), /FISCAL_ISSUER_RUT_TAKEN/);
  await assert.rejects(c.query(`update fiscal.issuers set issuer_rut = $2 where business_id = $1`, [A.businessId, dotted]),
    /FISCAL_ISSUER_RUT_TAKEN/);

  // b) A no puede reclamar la venta de B con su propio negocio (ni con la operación de B).
  await assert.rejects(c.query(`select public.crm_claim_fiscal_issuance($1, $2, $3, 39)`, [A.businessId, B.saleId, B.operationId]),
    /Invalid fiscal issuance claim/);

  // c) La emisión de A sale con el RUT y la API key de A, y el documento queda con el RUT de A.
  const r = await e.emitSale({ actorUserId: A.userId, saleId: A.saleId });
  assert.equal(r.status, 'issued');
  assert.equal(p.seen.length, 1);
  assert.equal(p.seen[0].apiKey, A.apiKey);
  assert.equal(p.seen[0].expect.rutEmisor, A.issuerRut);
  assert.deepEqual((await ledger(A.saleId)).map((x) => x.issuer_rut), [A.issuerRut]);

  // d) El ledger rechaza un XML emitido que declara a B como emisor.
  const xmlB = Buffer.from(`<DTE><Documento><Encabezado><Emisor><RUTEmisor>${B.issuerRut}</RUTEmisor></Emisor></Encabezado></Documento></DTE>`).toString('base64');
  const A2 = await extraSale(A);
  await c.query(`select public.crm_fiscal_claim_with_credentials($1, $2, $3)`, [A2.businessId, A2.saleId, A2.operationId]);
  await assert.rejects(c.query(
    `update public.crm_fiscal_issuances set status = 'issued', folio = 1, xml_base64 = $2, pdf_base64 = 'JVBERi0xLjQK' where sale_id = $1`,
    [A2.saleId, xmlB]), /FISCAL_DOCUMENT_ISSUER_MISMATCH/);
  assert.equal((await ledger(A2.saleId))[0].status, 'sending', 'sigue sin emitir; la recuperación decide');
});

test('2. B no accede a los documentos de A', async () => {
  const { A, B, keyOwners, allow } = await pair();
  const p = simProvider({ keyOwners });
  const e = emitterFor(p, allow);
  await e.emitSale({ actorUserId: A.userId, saleId: A.saleId });

  // Por el emisor (servidor): la venta de A no existe para B; mismo código que una venta inexistente.
  for (const action of ['reprint', 'status', 'lookupOperation', 'refreshSiiStatus', 'emitSale']) {
    await assert.rejects(e[action]({ actorUserId: B.userId, saleId: A.saleId }), { code: 'SALE_NOT_FOUND' }, action);
  }
  // Por la RPC con el negocio de B: no devuelve nada.
  const g = await c.query(`select public.crm_fiscal_get_issuance($1, $2) as j`, [B.businessId, A.saleId]);
  assert.equal(g.rows[0].j, null);
  // Desde el navegador (rol authenticated con el usuario de B): ni ledger, ni esquema fiscal, ni la venta.
  await asAuthenticated(B.userId, async () => {
    await assert.rejects(c.query(`select * from public.crm_fiscal_issuances`), /permission denied/);
  });
  await asAuthenticated(B.userId, async () => {
    await assert.rejects(c.query(`select * from fiscal.document_folios`), /permission denied/);
  });
  await asAuthenticated(B.userId, async () => {
    const r = await c.query(`select id from public.crm_invoices where id = $1`, [A.saleId]);
    assert.equal(r.rowCount, 0, 'RLS: la venta de A no es visible para B');
  });
  assert.equal(p.calls, 1);
});

test('3. Una API key de otro RUT se rechaza antes de emitir', async () => {
  const { A, B, keyOwners, allow } = await pair();
  // El comercio A guarda por error la API key de la cuenta de B (mismo RUT de A en Walinka).
  await saveCredentials(A.businessId, A.userId, A.issuerRut, B.apiKey);
  await c.query(`update fiscal.issuers set review_status = 'approved', enabled = true, verified = true where business_id = $1`, [A.businessId]);
  const p = simProvider({ keyOwners });
  const e = emitterFor(p, allow);

  // Antes de verificar: la credencial nueva no está verificada -> no se emite.
  await assert.rejects(e.emitSale({ actorUserId: A.userId, saleId: A.saleId }), { code: 'FISCAL_IDENTITY_NOT_VERIFIED' });
  // La verificación consulta la identidad (simulada) y detecta que la key es de B.
  const v = await e.verifyIssuerIdentity({ actorUserId: A.userId, businessId: A.businessId });
  assert.equal(v.outcome, 'mismatch');
  assert.equal(v.blockReason, 'last_check_mismatch');
  await assert.rejects(e.emitSale({ actorUserId: A.userId, saleId: A.saleId }), { code: 'FISCAL_IDENTITY_NOT_VERIFIED' });
  // Aunque se salte el código del servidor, la base no deja pasar a sending.
  await assert.rejects(c.query(`select public.crm_fiscal_claim_with_credentials($1, $2, $3)`, [A.businessId, A.saleId, A.operationId]),
    /FISCAL_IDENTITY_NOT_VERIFIED: last_check_mismatch/);
  assert.equal(p.calls, 0, 'cero emisiones');
  assert.deepEqual(await ledger(A.saleId), [], 'ninguna fila en el ledger');
  // Solo el dueño fiscal puede verificar.
  await assert.rejects(e.verifyIssuerIdentity({ actorUserId: B.userId, businessId: A.businessId }), { code: 'FISCAL_ROLE_REQUIRED' });

  // Con la key correcta y verificada, A emite.
  await saveCredentials(A.businessId, A.userId, A.issuerRut, A.apiKey);
  await c.query(`update fiscal.issuers set review_status = 'approved', enabled = true, verified = true where business_id = $1`, [A.businessId]);
  assert.equal((await e.verifyIssuerIdentity({ actorUserId: A.userId, businessId: A.businessId })).outcome, 'match');
  assert.equal((await e.emitSale({ actorUserId: A.userId, saleId: A.saleId })).status, 'issued');

  // Proveedor real (sin contrato de identidad): ni llama ni registra nada; queda bloqueado.
  const real = createFiscalEmitter({ store, provider: createSiisolutionsHttpProvider({ ready: true, fetchImpl: () => { throw new Error('NO NETWORK IN TESTS'); } }),
    masterKey: TEST_MASTER_KEY, allowedIssuers: parseAllowedIssuers(allow) });
  const n0 = (await c.query(`select count(*)::int n from fiscal.identity_checks where business_id = $1`, [B.businessId])).rows[0].n;
  await assert.rejects(real.verifyIssuerIdentity({ actorUserId: B.userId, businessId: B.businessId }), { code: 'IDENTITY_CONTRACT_PENDING' });
  const n1 = (await c.query(`select count(*)::int n from fiscal.identity_checks where business_id = $1`, [B.businessId])).rows[0].n;
  assert.equal(n1, n0);
});

test('3b. Sin método de verificación aceptado (estado inicial de producción) nadie emite', async () => {
  const { A, keyOwners, allow } = await pair();
  const p = simProvider({ keyOwners });
  const e = emitterFor(p, allow);
  await setEmissionControl(c, true, []);
  try {
    await assert.rejects(e.emitSale({ actorUserId: A.userId, saleId: A.saleId }), { code: 'FISCAL_IDENTITY_NOT_VERIFIED' });
    await assert.rejects(c.query(`select public.crm_fiscal_claim_with_credentials($1, $2, $3)`, [A.businessId, A.saleId, A.operationId]),
      /FISCAL_IDENTITY_NOT_VERIFIED: method_not_accepted/);
    assert.equal(p.calls, 0);
  } finally {
    await setEmissionControl(c, true);
  }
});

test('4. Un RUT duplicado no se registra indebidamente; RUT compartido solo por administrador y mismo dueño', async () => {
  const { A, B } = await pair();
  const n = await merchant('N', { withCredentials: false, issuerRut: uniqueRut() });
  // Variantes de formato del mismo RUT también se rechazan (normalización).
  const variants = [A.issuerRut, A.issuerRut.toLowerCase(), A.issuerRut.replace(/^(\d{1,2})(\d{3})(\d{3})-/, '$1.$2.$3-')];
  for (const v of variants) {
    await assert.rejects(saveCredentials(n.businessId, n.userId, v, 'K'), /FISCAL_ISSUER_RUT_TAKEN|Invalid fiscal connection input/, v);
  }
  // Inserción directa como service_role (bypass del código): igual se rechaza.
  const bid = randomUUID();
  const uid = await otherUser(c);
  await c.query(`insert into public.wa_businesses (id, user_id, name, whatsapp, country_code, currency) values ($1, $2, 'X', '+56900000001', 'CL', 'CLP')`, [bid, uid]);
  await c.query('begin');
  await c.query('set local role service_role');
  await assert.rejects(c.query(`insert into fiscal.issuers (business_id, issuer_rut, provider) values ($1, $2, 'dtecore')`, [bid, A.issuerRut]),
    /FISCAL_ISSUER_RUT_TAKEN/);
  await c.query('rollback');
  // RUT con dígito verificador inválido.
  const body = A.issuerRut.split('-')[0];
  const badDv = `${body}-${A.issuerRut.endsWith('-0') ? '1' : '0'}`;
  await assert.rejects(c.query(`update fiscal.issuers set issuer_rut = $2 where business_id = $1`, [n.businessId, badDv]), /FISCAL_ISSUER_RUT_INVALID/);

  // RUT compartido: dueños distintos -> rechazado; sin admin -> rechazado.
  const admin = await otherUser(c);
  await c.query(`update auth.users set raw_app_meta_data = '{"role":"admin"}' where id = $1`, [admin]);
  await assert.rejects(c.query(`select public.crm_fiscal_create_rut_share($1, $2, $3, 'Mismo contribuyente con dos locales', 'TICKET-SOPORTE-0001')`,
    [admin, A.issuerRut, [A.businessId, B.businessId]]), /FISCAL_RUT_SHARE_DIFFERENT_OWNERS/);
  await assert.rejects(c.query(`select public.crm_fiscal_create_rut_share($1, $2, $3, 'Mismo contribuyente con dos locales', 'TICKET-SOPORTE-0001')`,
    [A.userId, A.issuerRut, [A.businessId, B.businessId]]), /FISCAL_REVIEWER_NOT_ADMIN/);
  // Mismo dueño: segundo local de A.
  const local2 = randomUUID();
  await c.query(`insert into public.wa_businesses (id, user_id, name, whatsapp, country_code, currency) values ($1, $2, 'A local 2', '+56900000002', 'CL', 'CLP')`, [local2, A.userId]);
  await assert.rejects(saveCredentials(local2, A.userId, A.issuerRut, A.apiKey), /FISCAL_ISSUER_RUT_TAKEN/, 'sin grupo, ni siquiera el mismo dueño');
  const g = await c.query(`select public.crm_fiscal_create_rut_share($1, $2, $3, 'Mismo contribuyente con dos locales', 'TICKET-SOPORTE-0001') as id`,
    [admin, A.issuerRut, [A.businessId, local2]]);
  assert.ok(g.rows[0].id);
  await saveCredentials(local2, A.userId, A.issuerRut, A.apiKey);
  const shared = await c.query(`select count(*)::int n from fiscal.issuers where issuer_rut = $1 and rut_share_group = $2`, [A.issuerRut, g.rows[0].id]);
  assert.equal(shared.rows[0].n, 2);
  const aud = await c.query(`select count(*)::int n from fiscal.admin_audit where action = 'rut_share_created' and actor_user_id = $1`, [admin]);
  assert.equal(aud.rows[0].n, 2);
  // Un tercero (B, otro dueño) sigue sin poder usar ese RUT.
  await assert.rejects(c.query(`update fiscal.issuers set issuer_rut = $2 where business_id = $1`, [B.businessId, A.issuerRut]), /FISCAL_ISSUER_RUT_TAKEN/);
  await assert.rejects(c.query(`update fiscal.issuers set rut_share_group = $2 where business_id = $1`, [B.businessId, g.rows[0].id]), /FISCAL_RUT_SHARE_INVALID/);
});

test('5. Un folio repetido del mismo emisor se rechaza', async () => {
  const { A, keyOwners, allow } = await pair();
  const A2 = await extraSale(A);
  // Dos instancias del proveedor que devuelven el MISMO folio (proveedor defectuoso o CAF reusado).
  const e1 = emitterFor(simProvider({ keyOwners, folioStart: 777 }), allow);
  const e2 = emitterFor(simProvider({ keyOwners, folioStart: 777 }), allow);
  assert.equal((await e1.emitSale({ actorUserId: A.userId, saleId: A.saleId })).folio, 777);
  await assert.rejects(e2.emitSale({ actorUserId: A.userId, saleId: A2.saleId }), { code: 'PERSIST_PENDING_RECOVERY' });
  const rows2 = await ledger(A2.saleId);
  assert.notEqual(rows2[0].status, 'issued', 'la segunda venta no queda emitida con un folio repetido');
  // Directo en SQL (sin el emisor): también se rechaza.
  await assert.rejects(c.query(
    `update public.crm_fiscal_issuances set status = 'issued', folio = 777, xml_base64 = 'PHhtbD4=', pdf_base64 = 'JVBERi0xLjQK' where sale_id = $1`,
    [A2.saleId]), /FISCAL_FOLIO_DUPLICATE/);
  // La recuperación no la deja issued ni atascada en sending: pasa a unknown con el conflicto.
  const rec = await c.query(`select public.crm_fiscal_finalize_from_receipt($1, $2, $3) as ok`, [A2.businessId, A2.saleId, A2.operationId]);
  assert.equal(rec.rows[0].ok, false);
  const after2 = (await c.query(`select status, error_code, folio from public.crm_fiscal_issuances where sale_id = $1`, [A2.saleId])).rows[0];
  assert.deepEqual(after2, { status: 'unknown', error_code: 'FOLIO_DUPLICATE', folio: 777 });
  const reg = await c.query(`select count(*)::int n from fiscal.document_folios where issuer_rut = $1 and dte_type = 39 and folio = 777`, [A.issuerRut]);
  assert.equal(reg.rows[0].n, 1);
  // El registro es permanente.
  await assert.rejects(c.query(`delete from fiscal.document_folios where issuer_rut = $1`, [A.issuerRut]), /FISCAL_EVIDENCE_IMMUTABLE/);
});

test('6. Dos emisores distintos pueden usar el mismo número de folio', async () => {
  const { A, B, keyOwners, allow } = await pair();
  const folio = randomInt(1_000_000, 9_000_000);
  const eA = emitterFor(simProvider({ keyOwners, folioStart: folio }), allow);
  const eB = emitterFor(simProvider({ keyOwners, folioStart: folio }), allow);
  assert.equal((await eA.emitSale({ actorUserId: A.userId, saleId: A.saleId })).folio, folio);
  assert.equal((await eB.emitSale({ actorUserId: B.userId, saleId: B.saleId })).folio, folio);
  const reg = await c.query(`select issuer_rut from fiscal.document_folios where dte_type = 39 and folio = $1 order by 1`, [folio]);
  assert.deepEqual(reg.rows.map((r) => r.issuer_rut).sort(), [A.issuerRut, B.issuerRut].sort());
  // Numeración interna independiente: invoice_number no se relaciona con el folio.
  const n = await c.query(`select invoice_number from public.crm_invoices where id = any($1)`, [[A.saleId, B.saleId]]);
  assert.equal(n.rowCount, 2);
});

test('7. Una venta emitida no se modifica; solo una corrección autorizada y auditada', async () => {
  const { A, keyOwners, allow } = await pair();
  const e = emitterFor(simProvider({ keyOwners }), allow);
  await e.emitSale({ actorUserId: A.userId, saleId: A.saleId });
  const locked = /FISCAL_SALE_TRIBUTARY_LOCKED/;
  const attempts = [
    [`update public.crm_invoices set total = 1 where id = $1`, [A.saleId]],
    [`update public.crm_invoices set discount_amount = 100 where id = $1`, [A.saleId]],
    [`update public.crm_invoices set status = 'anulada' where id = $1`, [A.saleId]],
    [`update public.crm_invoice_items set quantity = 1 where invoice_id = $1`, [A.saleId]],
    [`update public.crm_invoice_items set unit_price = 1 where invoice_id = $1`, [A.saleId]],
    [`delete from public.crm_invoice_items where invoice_id = $1`, [A.saleId]],
    [`insert into public.crm_invoice_items (invoice_id, name, unit_price, quantity, subtotal, sort_order) values ($1, 'Extra', 10, 1, 10, 2)`, [A.saleId]],
    [`update public.crm_payments set amount = 1 where invoice_id = $1`, [A.saleId]],
    [`update public.crm_payments set voided_at = now() where invoice_id = $1`, [A.saleId]],
    [`insert into public.crm_payments (business_id, invoice_id, amount, payment_method, payment_status, payment_number) values ($2, $1, 5, 'cash', 'received', 9)`, [A.saleId, A.businessId]],
    [`delete from public.crm_invoices where id = $1`, [A.saleId]],
  ];
  for (const [sql, params] of attempts) {
    await assert.rejects(c.query(sql, params), locked, sql);
  }
  // También como el dueño desde el navegador (RLS permite su venta; la base igual la protege).
  await asAuthenticated(A.userId, async () => {
    await assert.rejects(c.query(`update public.crm_invoices set total = 1 where id = $1`, [A.saleId]), locked);
  });
  // Campos no tributarios siguen editables (notas).
  await c.query(`update public.crm_invoices set notes = 'nota interna' where id = $1`, [A.saleId]);

  // Corrección legítima: solo un administrador, con motivo y evidencia, y solo en esa transacción.
  const admin = await otherUser(c);
  await c.query(`update auth.users set raw_app_meta_data = '{"role":"admin"}' where id = $1`, [admin]);
  await assert.rejects(c.query(`select public.crm_fiscal_authorize_tributary_correction($1, $2, $3, 'Corrección de prueba', 'TICKET-0001')`,
    [A.businessId, A.saleId, A.userId]), /FISCAL_REVIEWER_NOT_ADMIN/);
  await c.query('begin');
  await c.query(`select public.crm_fiscal_authorize_tributary_correction($1, $2, $3, 'Origen mal registrado en la venta', 'TICKET-0001')`,
    [A.businessId, A.saleId, admin]);
  await c.query(`update public.crm_invoices set source = 'pos' where id = $1`, [A.saleId]);
  await c.query('commit');
  // La autorización no sobrevive a su transacción.
  await assert.rejects(c.query(`update public.crm_invoices set source = 'crm' where id = $1`, [A.saleId]), locked);
  const aud = await c.query(`select action from fiscal.admin_audit where sale_id = $1 and action like 'tributary_correction%' order by id`, [A.saleId]);
  assert.deepEqual(aud.rows.map((r) => r.action), ['tributary_correction_authorized', 'tributary_correction_change']);
  // El documento emitido sigue intacto e inmutable.
  await assert.rejects(c.query(`update public.crm_fiscal_issuances set folio = folio + 1 where sale_id = $1`, [A.saleId]), /FISCAL_ISSUED_DOCUMENT_IMMUTABLE/);
  await assert.rejects(c.query(`update public.crm_fiscal_issuances set issuer_rut = '11111111-1' where sale_id = $1`, [A.saleId]), /FISCAL_ISSUER_RUT_IMMUTABLE/);
});

test('8. Dos cajas simultáneas no provocan doble emisión', async () => {
  const { A, keyOwners, allow } = await pair();
  const p = simProvider({ keyOwners, delayMs: 80 });
  const caja1 = emitterFor(p, allow);
  const caja2 = emitterFor(p, allow);
  const results = await Promise.allSettled([
    caja1.emitSale({ actorUserId: A.userId, saleId: A.saleId }),
    caja2.emitSale({ actorUserId: A.userId, saleId: A.saleId }),
    caja1.emitSale({ actorUserId: A.userId, saleId: A.saleId }),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  assert.ok(ok.length >= 1);
  assert.equal(p.calls, 1, 'una sola llamada al proveedor');
  const rows = await ledger(A.saleId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'issued');
  for (const r of results) {
    if (r.status === 'rejected') assert.ok(['ALREADY_IN_PROGRESS', 'NOT_EMITTABLE_IN_STATE'].includes(r.reason.code), r.reason.code);
  }
  // Ventas distintas del mismo emisor en paralelo: folios distintos.
  const s2 = await extraSale(A);
  const s3 = await extraSale(A);
  const [r2, r3] = await Promise.all([caja1.emitSale({ actorUserId: A.userId, saleId: s2.saleId }), caja2.emitSale({ actorUserId: A.userId, saleId: s3.saleId })]);
  assert.notEqual(r2.folio, r3.folio);
});

test('9. Un timeout no provoca reenvíos inseguros', async () => {
  const { A, keyOwners, allow } = await pair();
  const p = simProvider({ keyOwners, scenario: 'timeout' });
  const e = emitterFor(p, allow, 150);
  const r = await e.emitSale({ actorUserId: A.userId, saleId: A.saleId });
  assert.equal(r.status, 'unknown');
  for (let i = 0; i < 3; i += 1) {
    await assert.rejects(e.emitSale({ actorUserId: A.userId, saleId: A.saleId }), { code: 'UNKNOWN_REQUIRES_RECONCILIATION' });
  }
  // Ni la base permite volver a reclamar una operación unknown.
  const again = await c.query(`select public.crm_fiscal_claim_with_credentials($1, $2, $3) as j`, [A.businessId, A.saleId, A.operationId]);
  assert.equal(again.rows[0].j.claimed, false);
  // La consulta de recuperación no emite.
  await e.lookupOperation({ actorUserId: A.userId, saleId: A.saleId });
  assert.equal(p.calls, 1, 'una sola llamada: nunca se reenvía');
  assert.equal((await ledger(A.saleId))[0].status, 'unknown');
});

test('10. Una reimpresión no genera otra boleta', async () => {
  const { A, keyOwners, allow } = await pair();
  const p = simProvider({ keyOwners });
  const e = emitterFor(p, allow);
  const first = await e.emitSale({ actorUserId: A.userId, saleId: A.saleId });
  for (let i = 0; i < 3; i += 1) {
    const rp = await e.reprint({ actorUserId: A.userId, saleId: A.saleId });
    assert.equal(rp.folio, first.folio);
    assert.equal(rp.providerCalls, 0);
  }
  const again = await e.emitSale({ actorUserId: A.userId, saleId: A.saleId });
  assert.equal(again.alreadyIssued, true);
  assert.equal(p.calls, 1);
  const reg = await c.query(`select count(*)::int n from fiscal.document_folios where business_id = $1`, [A.businessId]);
  assert.equal(reg.rows[0].n, 1, 'un solo folio registrado para el comercio');
});

test('A3. Nota de crédito: borrador vinculado al original del mismo emisor; emisión real bloqueada', async () => {
  const { A, B, keyOwners, allow } = await pair();
  const e = emitterFor(simProvider({ keyOwners }), allow);
  await e.emitSale({ actorUserId: A.userId, saleId: A.saleId });
  const draft = (cod, razon, amount, actor = A.userId, biz = A.businessId, sale = A.saleId) => c.query(
    `select public.crm_fiscal_draft_credit_note($1, $2, $3, $4, $5, $6) as id`, [biz, sale, actor, cod, razon, amount]);
  // B no puede crear notas sobre la boleta de A.
  await assert.rejects(draft(1, 'Anula', 2380, B.userId), /FISCAL_FORBIDDEN/);
  await assert.rejects(draft(1, 'Anula', 2380, B.userId, B.businessId), /FISCAL_CREDIT_NOTE_ORIGINAL_NOT_ISSUED/);
  // Montos: anular exige el total; corregir montos no supera el saldo; corregir texto va en 0.
  await assert.rejects(draft(1, 'Anula', 100), /FISCAL_CREDIT_NOTE_AMOUNT/);
  await assert.rejects(draft(3, 'Devolución', 999999), /FISCAL_CREDIT_NOTE_AMOUNT/);
  await assert.rejects(draft(2, 'Corrige giro', 10), /FISCAL_CREDIT_NOTE_AMOUNT/);
  const nc = (await draft(3, 'Devolución parcial', 1190)).rows[0].id;
  const row = (await c.query(`select n.issuer_rut, n.original_folio, n.status, f.folio from fiscal.credit_notes n
                               join public.crm_fiscal_issuances f on f.id = n.original_issuance_id where n.id = $1`, [nc])).rows[0];
  assert.equal(row.issuer_rut, A.issuerRut);
  assert.equal(row.original_folio, row.folio);
  assert.equal(row.status, 'draft');
  await assert.rejects(draft(3, 'Otra devolución', 1191), /FISCAL_CREDIT_NOTE_AMOUNT/, 'no supera el saldo');
  // Emisión real de DTE 61 bloqueada en la base.
  for (const st of ['sending', 'issued', 'unknown']) {
    await assert.rejects(c.query(`update fiscal.credit_notes set status = $2 where id = $1`, [nc, st]), /FISCAL_CREDIT_NOTE_EMISSION_DISABLED/);
  }
  // No se puede re-apuntar la nota a otro documento ni a otro emisor.
  await assert.rejects(c.query(`update fiscal.credit_notes set issuer_rut = $2 where id = $1`, [nc, B.issuerRut]), /FISCAL_CREDIT_NOTE_IMMUTABLE|violates foreign key/);
});
