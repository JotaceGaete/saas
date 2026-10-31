import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLiveIssuance, createLiveSingleEmission, validateDocumentBytes } from './siisolutions-live-single-emission.js';

const BIZ = '11111111-1111-4111-8111-111111111111';
const SALE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUTH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const VALID_XML_B64 = 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iSVNPLTg4NTktMSI/PjxEVEUgdmVyc2lvbj0iMS4wIj48RG9jdW1lbnRvPjxFbmNhYmV6YWRvPjxJZERvYz48VGlwb0RURT4zOTwvVGlwb0RURT48Rm9saW8+NTExMDU8L0ZvbGlvPjwvSWREb2M+PC9FbmNhYmV6YWRvPjwvRG9jdW1lbnRvPjwvRFRFPg==';
const VALID_PDF_B64 = 'JVBERi0xLjQKMSAwIG9iago8PD4+CmVuZG9iagolJUVPRgo=';
const PROD_EMIT = 'https://api.siisolutions.cl/dte/boletas/emitir';
const FORBIDDEN_TABLES = ['fiscal.pos_dte39_outbox', 'fiscal.operations', 'crm_point_fiscal_outbox'];

const armedEnv = (overrides = {}) => ({
  SIISOLUTIONS_LIVE_SINGLE_EMISSION: 'armed',
  SIISOLUTIONS_LIVE_SINGLE_BUSINESS_ID: BIZ,
  SIISOLUTIONS_LIVE_SINGLE_SALE_ID: SALE,
  SIISOLUTIONS_PILOT_ISSUERS_JSON: JSON.stringify({
    [BIZ]: { operator_rut: '12345678-5', api_key: 'TEST-KEY-NOT-REAL', verified: true },
  }),
  ...overrides,
});

const baseData = (over = {}) => ({
  invoice: { id: SALE, business_id: BIZ, status: 'pagada', paid_at: '2026-10-31T10:00:00Z', total: 100 },
  items: [{ name: 'Producto de prueba', sku: '', unit_price: 100, quantity: 1, subtotal: 100 }],
  payments: [{ business_id: BIZ, invoice_id: SALE, payment_status: 'received', payment_method: 'cash',
    amount: 100, voided_at: null, created_by: OWNER }],
  business: { id: BIZ, user_id: OWNER, currency: 'CLP', country_code: 'CL' },
  ...over,
});

function fakeAdmin(data, { begin = async () => ({ data: true, error: null }),
  finalize = async () => ({ data: true, error: null }) } = {}) {
  const calls = { tables: [], rpcs: [] };
  const builder = result => {
    const b = {
      select() { return b; }, eq() { return b; },
      maybeSingle() { return Promise.resolve(result); },
      then(res, rej) { return Promise.resolve(result).then(res, rej); },
    };
    return b;
  };
  return {
    calls,
    from(table) {
      calls.tables.push(table);
      if (table === 'crm_invoices') return builder({ data: data.invoice, error: null });
      if (table === 'crm_invoice_items') return builder({ data: data.items, error: null });
      if (table === 'crm_payments') return builder({ data: data.payments, error: null });
      if (table === 'wa_businesses') return builder({ data: data.business, error: null });
      throw new Error(`Unexpected table read: ${table}`);
    },
    async rpc(name, args) {
      calls.rpcs.push({ name, args });
      if (name === 'crm_begin_manual_single_emission') return begin(args);
      if (name === 'crm_finalize_fiscal_issuance') return finalize(args);
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
}

function fakeFetch(responder) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const r = await responder(url, opts);
    return new Response(r.raw ?? JSON.stringify(r.body ?? null), { status: r.status });
  };
  fn.calls = calls;
  return fn;
}

const issuedBody = (folio, over = {}) => ({
  folio, esSimulacion: false, xmlBase64: null, pdfBase64: null, pdfEstado: 'no_solicitado',
  documentos: {
    pdf: `https://api.siisolutions.cl/dte/documentos/39/${folio}/pdf`,
    xml: `https://api.siisolutions.cl/dte/documentos/39/${folio}/xml`,
  },
  ...over,
});

const run = (deps, input = {}) => createLiveSingleEmission(deps)({
  businessId: BIZ, saleId: SALE, authorizationId: AUTH, amount: 100, ...input,
});

// ---- Pure mapping -------------------------------------------------------

test('2xx with folio and no inline documents is unknown and KEEPS the folio', () => {
  const r = classifyLiveIssuance({ statusCode: 200, body: issuedBody(51105) });
  assert.equal(r.state, 'unknown');
  assert.equal(r.folio, 51105);
  assert.equal(r.reason, 'FOLIO_ASSIGNED_DOCUMENTS_NOT_RETRIEVED');
});

test('2xx with folio and inline XML+PDF is issued with bytes', () => {
  const r = classifyLiveIssuance({ statusCode: 200, body: issuedBody(51105, { xmlBase64: 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iSVNPLTg4NTktMSI/PjxEVEUgdmVyc2lvbj0iMS4wIj48RG9jdW1lbnRvPjxFbmNhYmV6YWRvPjxJZERvYz48VGlwb0RURT4zOTwvVGlwb0RURT48Rm9saW8+NTExMDU8L0ZvbGlvPjwvSWREb2M+PC9FbmNhYmV6YWRvPjwvRG9jdW1lbnRvPjwvRFRFPg==', pdfBase64: 'JVBERi0xLjQKMSAwIG9iago8PD4+CmVuZG9iagolJUVPRgo=' }) });
  assert.equal(r.state, 'issued');
  assert.equal(r.folio, 51105);
  assert.equal(r.xmlBase64, 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iSVNPLTg4NTktMSI/PjxEVEUgdmVyc2lvbj0iMS4wIj48RG9jdW1lbnRvPjxFbmNhYmV6YWRvPjxJZERvYz48VGlwb0RURT4zOTwvVGlwb0RURT48Rm9saW8+NTExMDU8L0ZvbGlvPjwvSWREb2M+PC9FbmNhYmV6YWRvPjwvRG9jdW1lbnRvPjwvRFRFPg==');
});

test('retrieved documents matching the folio make it issued', () => {
  const r = classifyLiveIssuance({ statusCode: 200, body: issuedBody(51105),
    retrievedDocuments: { folio: 51105, xmlBase64: 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iSVNPLTg4NTktMSI/PjxEVEUgdmVyc2lvbj0iMS4wIj48RG9jdW1lbnRvPjxFbmNhYmV6YWRvPjxJZERvYz48VGlwb0RURT4zOTwvVGlwb0RURT48Rm9saW8+NTExMDU8L0ZvbGlvPjwvSWREb2M+PC9FbmNhYmV6YWRvPjwvRG9jdW1lbnRvPjwvRFRFPg==', pdfBase64: 'JVBERi0xLjQKMSAwIG9iago8PD4+CmVuZG9iagolJUVPRgo=' } });
  assert.equal(r.state, 'issued');
});

test('retrieved documents for a DIFFERENT folio are ignored', () => {
  const r = classifyLiveIssuance({ statusCode: 200, body: issuedBody(51105),
    retrievedDocuments: { folio: 99999, xmlBase64: 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iSVNPLTg4NTktMSI/PjxEVEUgdmVyc2lvbj0iMS4wIj48RG9jdW1lbnRvPjxFbmNhYmV6YWRvPjxJZERvYz48VGlwb0RURT4zOTwvVGlwb0RURT48Rm9saW8+NTExMDU8L0ZvbGlvPjwvSWREb2M+PC9FbmNhYmV6YWRvPjwvRG9jdW1lbnRvPjwvRFRFPg==', pdfBase64: 'JVBERi0xLjQKMSAwIG9iago8PD4+CmVuZG9iagolJUVPRgo=' } });
  assert.equal(r.state, 'unknown');
});

test('simulation flag in production response is ENVIRONMENT_MISMATCH and keeps folio', () => {
  const r = classifyLiveIssuance({ statusCode: 200, body: issuedBody(51105, { esSimulacion: true }) });
  assert.equal(r.state, 'unknown');
  assert.equal(r.reason, 'ENVIRONMENT_MISMATCH');
  assert.equal(r.folio, 51105);
});

test('2xx without folio is unknown with no folio', () => {
  const r = classifyLiveIssuance({ statusCode: 200, body: { esSimulacion: false } });
  assert.equal(r.state, 'unknown');
  assert.equal(r.folio, null);
  assert.equal(r.reason, 'RESPONSE_INVALID');
});

test('409 keeps the existing folio when the provider reports one', () => {
  const r = classifyLiveIssuance({ statusCode: 409, body: { folioExistente: 51104 } });
  assert.equal(r.state, 'unknown');
  assert.equal(r.folio, 51104);
  assert.equal(r.reason, 'PROVIDER_OPERATION_ALREADY_EXISTS');
});

test('network error, timeout and 5xx are unknown with no folio', () => {
  for (const r of [
    classifyLiveIssuance({ networkError: true }),
    classifyLiveIssuance({ statusCode: 503, body: { folio: 7 } }),
  ]) {
    assert.equal(r.state, 'unknown');
    assert.equal(r.folio, null);
  }
});

test('other 4xx is never issued and never auto-failed: unknown', () => {
  const r = classifyLiveIssuance({ statusCode: 422, body: { error: 'x' } });
  assert.equal(r.state, 'unknown');
  assert.equal(r.reason, 'PROVIDER_REJECTED_UNVERIFIED');
});

// ---- Gates --------------------------------------------------------------

test('not armed: blocked before any read, RPC or network call', async () => {
  const data = baseData(); const db = fakeAdmin(data); const net = fakeFetch(() => ({ status: 200, body: {} }));
  const r = await run({ admin: db, env: armedEnv({ SIISOLUTIONS_LIVE_SINGLE_EMISSION: 'off' }), fetchImpl: net });
  assert.deepEqual(r, { state: 'blocked', reason: 'LIVE_NOT_ARMED' });
  assert.equal(db.calls.tables.length, 0);
  assert.equal(db.calls.rpcs.length, 0);
  assert.equal(net.calls.length, 0);
});

test('armed for another sale is blocked', async () => {
  const net = fakeFetch(() => ({ status: 200, body: {} }));
  const r = await run({ admin: fakeAdmin(baseData()), env: armedEnv(), fetchImpl: net }, { saleId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
  assert.equal(r.reason, 'LIVE_NOT_ARMED');
  assert.equal(net.calls.length, 0);
});

test('missing or unverified issuer is blocked', async () => {
  const net = fakeFetch(() => ({ status: 200, body: {} }));
  const env = armedEnv({ SIISOLUTIONS_PILOT_ISSUERS_JSON: JSON.stringify({ [BIZ]: { operator_rut: '12345678-5', api_key: 'k', verified: false } }) });
  const r = await run({ admin: fakeAdmin(baseData()), env, fetchImpl: net });
  assert.equal(r.reason, 'ISSUER_NOT_AUTHORIZED');
  assert.equal(net.calls.length, 0);
});

test('invoice total other than the authorized amount is blocked before consuming', async () => {
  const data = baseData({ invoice: { id: SALE, business_id: BIZ, status: 'pagada', paid_at: 'x', total: 99 } });
  const db = fakeAdmin(data); const net = fakeFetch(() => ({ status: 200, body: {} }));
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net });
  assert.equal(r.reason, 'AMOUNT_MISMATCH');
  assert.equal(db.calls.rpcs.length, 0);
  assert.equal(net.calls.length, 0);
});

test('cash receipt recorded by someone other than the owner is blocked', async () => {
  const data = baseData();
  data.payments[0].created_by = OTHER;
  const db = fakeAdmin(data); const net = fakeFetch(() => ({ status: 200, body: {} }));
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net });
  assert.equal(r.reason, 'CASH_RECEIPT_NOT_VERIFIED');
  assert.equal(db.calls.rpcs.length, 0);
  assert.equal(net.calls.length, 0);
});

// ---- Single-use atomic consumption --------------------------------------

test('authorization rejected by the database: nothing is sent and nothing is finalized', async () => {
  const db = fakeAdmin(baseData(), { begin: async () => ({ data: null, error: { message: 'Authorization already consumed' } }) });
  const net = fakeFetch(() => ({ status: 200, body: {} }));
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net });
  assert.equal(r.reason, 'AUTHORIZATION_REJECTED');
  assert.equal(net.calls.length, 0);
  assert.equal(db.calls.rpcs.filter(c => c.name === 'crm_finalize_fiscal_issuance').length, 0);
});

test('ambiguous begin (thrown error): stops without sending', async () => {
  const db = fakeAdmin(baseData(), { begin: async () => { throw new Error('socket hang up'); } });
  const net = fakeFetch(() => ({ status: 200, body: {} }));
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net });
  assert.equal(r.reason, 'BEGIN_OUTCOME_UNKNOWN');
  assert.equal(net.calls.length, 0);
});

test('success without inline documents: finalized as unknown WITH folio, one send only', async () => {
  const db = fakeAdmin(baseData());
  const net = fakeFetch(() => ({ status: 200, body: issuedBody(51105) }));
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net });
  assert.equal(net.calls.length, 1);
  assert.equal(net.calls[0].url, PROD_EMIT);
  assert.equal(r.state, 'unknown');
  assert.equal(r.folio, 51105);
  const fin = db.calls.rpcs.find(c => c.name === 'crm_finalize_fiscal_issuance').args;
  assert.equal(fin.p_status, 'unknown');
  assert.equal(fin.p_folio, 51105);
  assert.equal(fin.p_xml_base64, null);
});

test('injected document retrieval that succeeds finalizes as issued with bytes', async () => {
  const db = fakeAdmin(baseData());
  const net = fakeFetch(() => ({ status: 200, body: issuedBody(51105) }));
  const retrieveDocuments = async ({ folio }) => ({ folio, xmlBase64: 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iSVNPLTg4NTktMSI/PjxEVEUgdmVyc2lvbj0iMS4wIj48RG9jdW1lbnRvPjxFbmNhYmV6YWRvPjxJZERvYz48VGlwb0RURT4zOTwvVGlwb0RURT48Rm9saW8+NTExMDU8L0ZvbGlvPjwvSWREb2M+PC9FbmNhYmV6YWRvPjwvRG9jdW1lbnRvPjwvRFRFPg==', pdfBase64: 'JVBERi0xLjQKMSAwIG9iago8PD4+CmVuZG9iagolJUVPRgo=' });
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net, retrieveDocuments });
  assert.equal(r.state, 'issued');
  const fin = db.calls.rpcs.find(c => c.name === 'crm_finalize_fiscal_issuance').args;
  assert.equal(fin.p_status, 'issued');
  assert.equal(fin.p_folio, 51105);
  assert.equal(fin.p_pdf_base64, 'JVBERi0xLjQKMSAwIG9iago8PD4+CmVuZG9iagolJUVPRgo=');
});

test('document retrieval that throws keeps the folio as unknown', async () => {
  const db = fakeAdmin(baseData());
  const net = fakeFetch(() => ({ status: 200, body: issuedBody(51105) }));
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net,
    retrieveDocuments: async () => { throw new Error('boom'); } });
  assert.equal(r.state, 'unknown');
  assert.equal(r.folio, 51105);
});

test('network failure after send: unknown, no folio, and a retry is refused by the database', async () => {
  let consumed = false;
  const begin = async () => {
    if (consumed) return { data: null, error: { message: 'Authorization already consumed' } };
    consumed = true; return { data: true, error: null };
  };
  const db = fakeAdmin(baseData(), { begin });
  const net = fakeFetch(() => { throw new TypeError('fetch failed'); });
  const first = await run({ admin: db, env: armedEnv(), fetchImpl: net });
  assert.equal(first.state, 'unknown');
  assert.equal(first.folio, null);
  assert.equal(net.calls.length, 1);
  const retry = await run({ admin: db, env: armedEnv(), fetchImpl: net });
  assert.equal(retry.reason, 'AUTHORIZATION_REJECTED');
  assert.equal(net.calls.length, 1, 'no second provider call');
});

test('timeout is treated as unknown, never retried', async () => {
  const db = fakeAdmin(baseData());
  const net = fakeFetch(() => { const e = new Error('aborted'); e.name = 'TimeoutError'; throw e; });
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net });
  assert.equal(r.state, 'unknown');
  assert.equal(net.calls.length, 1);
});

test('provider 409 is unknown and preserves the existing folio', async () => {
  const db = fakeAdmin(baseData());
  const net = fakeFetch(() => ({ status: 409, body: { folioExistente: 51104 } }));
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net });
  assert.equal(r.state, 'unknown');
  assert.equal(r.folio, 51104);
  const fin = db.calls.rpcs.find(c => c.name === 'crm_finalize_fiscal_issuance').args;
  assert.equal(fin.p_folio, 51104);
});

test('finalize failure: reported for reconciliation, not resent', async () => {
  const db = fakeAdmin(baseData(), { finalize: async () => ({ data: null, error: { message: 'x' } }) });
  const net = fakeFetch(() => ({ status: 200, body: issuedBody(51105) }));
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net });
  assert.equal(r.reason, 'FINALIZE_FAILED_RECONCILE');
  assert.equal(net.calls.length, 1);
});

// ---- Isolation ----------------------------------------------------------

test('never touches the 19 earlier operations or the Point outbox, and never calls register_pending', async () => {
  const db = fakeAdmin(baseData());
  const net = fakeFetch(() => ({ status: 200, body: issuedBody(51105) }));
  await run({ admin: db, env: armedEnv(), fetchImpl: net });
  for (const t of db.calls.tables) assert.ok(!FORBIDDEN_TABLES.includes(t), `forbidden table ${t}`);
  for (const c of db.calls.rpcs) assert.notEqual(c.name, 'crm_fiscal_register_pending');
  assert.ok(db.calls.rpcs.every(c => ['crm_begin_manual_single_emission', 'crm_finalize_fiscal_issuance'].includes(c.name)));
});

test('production host is fixed: env cannot redirect the emission', async () => {
  const db = fakeAdmin(baseData());
  const net = fakeFetch(() => ({ status: 200, body: issuedBody(51105) }));
  await run({ admin: db, env: armedEnv({ SIISOLUTIONS_SANDBOX_BASE_URL: 'https://evil.example', DTECORE_BASE_URL: 'https://evil.example' }), fetchImpl: net });
  assert.equal(net.calls[0].url, PROD_EMIT);
});

test('invalid identifiers are rejected before any work', async () => {
  const db = fakeAdmin(baseData()); const net = fakeFetch(() => ({ status: 200, body: {} }));
  const r = await run({ admin: db, env: armedEnv(), fetchImpl: net }, { businessId: 'not-a-uuid' });
  assert.equal(r.reason, 'IDENTITY_REQUIRED');
  assert.equal(db.calls.tables.length, 0);
});

// ---- Byte content validation -------------------------------------------

test('valid XML with matching folio and PDF signature passes', () => {
  assert.equal(validateDocumentBytes({ folio: 51105, xmlBase64: VALID_XML_B64, pdfBase64: VALID_PDF_B64 }), true);
});
test('XML folio different from the assigned folio fails closed', () => {
  const wrong = Buffer.from(Buffer.from(VALID_XML_B64, 'base64').toString('latin1').replace('51105', '99999'), 'latin1').toString('base64');
  assert.equal(validateDocumentBytes({ folio: 51105, xmlBase64: wrong, pdfBase64: VALID_PDF_B64 }), false);
});
test('XML without a DTE root fails closed (vendor example stub is not a document)', () => {
  const stub = Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?>', 'latin1').toString('base64');
  assert.equal(validateDocumentBytes({ folio: 51105, xmlBase64: stub, pdfBase64: VALID_PDF_B64 }), false);
});
test('PDF without %PDF- signature fails closed', () => {
  const bad = Buffer.from('<html>not pdf</html>').toString('base64');
  assert.equal(validateDocumentBytes({ folio: 51105, xmlBase64: VALID_XML_B64, pdfBase64: bad }), false);
});
test('non-base64 or misaligned input fails closed', () => {
  assert.equal(validateDocumentBytes({ folio: 51105, xmlBase64: 'not base64!', pdfBase64: VALID_PDF_B64 }), false);
  assert.equal(validateDocumentBytes({ folio: 51105, xmlBase64: 'PHhtbA=', pdfBase64: VALID_PDF_B64 }), false);
});
test('inline bytes that fail content validation are unknown with folio, not issued', () => {
  const stub = Buffer.from('<?xml version="1.0"?>', 'latin1').toString('base64');
  const r = classifyLiveIssuance({ statusCode: 200, body: issuedBody(51105, { xmlBase64: stub, pdfBase64: VALID_PDF_B64 }) });
  assert.equal(r.state, 'unknown');
  assert.equal(r.reason, 'DOCUMENT_BYTES_INVALID');
  assert.equal(r.folio, 51105);
});
