// Migración E (20261102_fiscal_sii_status.sql): emitido vs aceptado por el SII, inmutabilidad
// del documento emitido, motivo de unknown y bloqueo de ventas de otro día. Solo walinka_test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { CFG, makeFixture, setEmissionControl } from './fixtures.mjs';
import { assertLocalTestConfig, createPgStore } from '../../lib/store-pg.mjs';

let c;
before(async () => {
  c = new pg.Client(assertLocalTestConfig(CFG));
  await c.connect();
  await setEmissionControl(c, true);
});
after(async () => { await c.end(); });

const XML = Buffer.from('<?xml version="1.0"?><DTE><Folio>1</Folio></DTE>').toString('base64');
const PDF = Buffer.from('%PDF-1.4').toString('base64');

async function claim(f) {
  const r = await c.query('select public.crm_fiscal_claim_with_credentials($1,$2,$3) as j', [f.businessId, f.saleId, f.operationId]);
  return r.rows[0].j;
}
async function finalize(f, status, folio = null, errorCode = null) {
  const r = await c.query(
    `select public.crm_finalize_fiscal_issuance(p_business_id => $1, p_sale_id => $2, p_operation_id => $3, p_status => $4,
       p_folio => $5, p_xml_base64 => $6, p_pdf_base64 => $7, p_error_code => $8) as ok`,
    [f.businessId, f.saleId, f.operationId, status, folio, status === 'issued' ? XML : null, status === 'issued' ? PDF : null, errorCode]);
  return r.rows[0].ok;
}
const row = async (f) => (await c.query('select * from public.crm_fiscal_issuances where sale_id = $1', [f.saleId])).rows[0];
async function issued(folio) {
  const f = await makeFixture(c);
  await claim(f);
  assert.equal(await finalize(f, 'issued', folio), true);
  return f;
}
const record = (f, status, source = 'provider_api', track = null, actor = null) => c.query(
  'select public.crm_fiscal_record_sii_status($1,$2,$3,$4,$5,$6,$7) as j',
  [f.businessId, f.saleId, status, source, track, 'prueba', actor]);

test('emitida queda sii_status unverified con issued_at; emitido no es aceptado', async () => {
  const f = await issued(900001);
  const r = await row(f);
  assert.equal(r.status, 'issued');
  assert.equal(r.sii_status, 'unverified');
  assert.ok(r.issued_at);
  const g = (await c.query('select public.crm_fiscal_get_issuance($1,$2) as j', [f.businessId, f.saleId])).rows[0].j;
  assert.equal(g.sii_status, 'unverified');
  assert.equal(g.has_xml, true);
});

test('registrar estado SII: received -> accepted, con historial; no cambia folio ni documentos', async () => {
  const f = await issued(900002);
  await record(f, 'received', 'provider_api', '24416614851');
  await record(f, 'accepted', 'provider_api');
  const r = await row(f);
  assert.equal(r.sii_status, 'accepted');
  assert.equal(r.sii_track_id, '24416614851');
  assert.equal(r.folio, 900002);
  assert.equal(r.xml_base64, XML);
  const ev = await c.query('select from_status, to_status from fiscal.crm_fiscal_sii_status_events where issuance_id = $1 order by id', [r.id]);
  assert.deepEqual(ev.rows.map((e) => `${e.from_status}>${e.to_status}`), ['unverified>received', 'received>accepted']);
});

test('estado SII final no retrocede ni cambia; TrackId distinto se rechaza', async () => {
  const f = await issued(900003);
  await record(f, 'accepted', 'provider_api', '1');
  await assert.rejects(record(f, 'received'), { message: /FISCAL_SII_STATUS_FINAL/ });
  await assert.rejects(record(f, 'rejected'), { message: /FISCAL_SII_STATUS_FINAL/ });
  const g = await issued(900004);
  await record(g, 'received', 'provider_api', '1');
  await assert.rejects(record(g, 'accepted', 'provider_api', '2'), { message: /FISCAL_SII_TRACK_MISMATCH/ });
});

test('no se registra estado SII de una venta no emitida (unknown)', async () => {
  const f = await makeFixture(c);
  await claim(f);
  await finalize(f, 'unknown', 51106, 'PROVIDER_OPERATION_ALREADY_EXISTS');
  await assert.rejects(record(f, 'accepted'), { message: /FISCAL_NOT_ISSUED/ });
  await assert.rejects(c.query(`update public.crm_fiscal_issuances set sii_status = 'accepted' where sale_id = $1`, [f.saleId]),
    { message: /sii_status_check/ });
});

test('unknown guarda el folio informado y el motivo', async () => {
  const f = await makeFixture(c);
  await claim(f);
  assert.equal(await finalize(f, 'unknown', 51106, 'PROVIDER_OPERATION_ALREADY_EXISTS'), true);
  const r = await row(f);
  assert.equal(r.status, 'unknown');
  assert.equal(r.folio, 51106);
  assert.equal(r.error_code, 'PROVIDER_OPERATION_ALREADY_EXISTS');
  assert.equal(r.xml_base64, null);
});

test('carga manual desde el portal exige rol fiscal_owner o fiscal_reconciler', async () => {
  const f = await issued(900005);
  await assert.rejects(record(f, 'accepted', 'portal_manual', null, null), { message: /FISCAL_ROLE_REQUIRED/ });
  const ok = await record(f, 'accepted', 'portal_manual', null, f.userId); // dueño sembrado como fiscal_owner
  assert.equal(ok.rows[0].j.sii_status, 'accepted');
});

test('documento emitido inmutable: folio, XML, PDF y vuelta atrás bloqueados; anular sí', async () => {
  const f = await issued(900006);
  for (const sql of [
    `update public.crm_fiscal_issuances set folio = 1 where sale_id = $1`,
    `update public.crm_fiscal_issuances set xml_base64 = null where sale_id = $1`,
    `update public.crm_fiscal_issuances set pdf_base64 = 'eA==' where sale_id = $1`,
    `update public.crm_fiscal_issuances set status = 'unknown' where sale_id = $1`,
  ]) {
    await assert.rejects(c.query(sql, [f.saleId]), { message: /FISCAL_ISSUED_DOCUMENT_IMMUTABLE/ }, sql);
  }
  await c.query(`update public.crm_fiscal_issuances set status = 'cancelled' where sale_id = $1`, [f.saleId]);
  assert.equal((await row(f)).status, 'cancelled');
});

test('venta pagada otro día: la base rechaza crear la fila del ledger', async () => {
  const f = await makeFixture(c);
  await c.query(`update public.crm_invoices set paid_at = now() - interval '2 days' where id = $1`, [f.saleId]);
  await assert.rejects(claim(f), { message: /FISCAL_SALE_NOT_SAME_DAY/ });
  assert.equal(await row(f), undefined);
});

test('almacén pg: finalize unknown con motivo y getIssuance con campos SII', async () => {
  const store = createPgStore(CFG); // corre como service_role: prueba también los permisos
  const f = await makeFixture(c);
  await claim(f);
  assert.equal(await store.finalize(f.businessId, f.saleId, f.operationId, { status: 'unknown', folio: 7, errorCode: 'PROVIDER_TIMEOUT' }), true);
  const g = await store.getIssuance(f.businessId, f.saleId);
  assert.equal(g.status, 'unknown');
  assert.equal(g.errorCode, 'PROVIDER_TIMEOUT');
  assert.equal(g.siiStatus, 'unverified');
  await store.end();
});
