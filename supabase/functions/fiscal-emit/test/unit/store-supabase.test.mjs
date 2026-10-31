// Almacén supabase-js. Los clientes falsos devuelven la forma { data, error } de supabase-js con
// errores en forma PostgREST: { message, code, details, hint }.
//
// ESTADO: esto prueba el mapeo del almacén frente a esas respuestas. NO prueba el comportamiento
// de un servidor PostgREST real (no disponible en este entorno). Ver README, sección "No verificado".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createSupabaseStore } from '../../lib/store-supabase.mjs';
import { seal, open } from '../../lib/secrets.mjs';
import { FiscalError } from '../../lib/errors.mjs';
import { StoreError } from '../../lib/store-common.mjs';

// Cliente falso con la forma de supabase-js que usa el almacén. Registra cada llamada.
// handlers.rpc[fn](args) puede devolver un valor (-> {data}), lanzar (-> excepción de red) o
// devolver { __error: {...} } (-> { error: {...} } como PostgREST).
function fakeClient(handlers) {
  const calls = [];
  const wrap = (v) => (v && typeof v === 'object' && '__error' in v ? { data: null, error: v.__error } : { data: v, error: null });
  return {
    calls,
    async rpc(fn, args) {
      calls.push({ fn, args });
      const h = handlers.rpc?.[fn];
      if (!h) return { data: null, error: { message: `no handler for ${fn}`, code: 'PGRST202' } };
      return wrap(await h(args));
    },
    from(table) {
      const q = {
        select() { return q; },
        eq(col, val) { q.where = [table, col, val]; return q; },
        async maybeSingle() {
          calls.push({ table, where: q.where });
          const h = handlers.tables?.[table];
          if (typeof h === 'function') return wrap(await h(q.where[2]));
          return { data: h?.[q.where[2]] ?? null, error: null };
        },
      };
      return q;
    },
  };
}

const pgrst = (message, code, extra = {}) => ({ __error: { message, code, details: 'internal details', hint: null, ...extra } });

test('claim llama al RPC con los nombres de parámetro de PostgREST y dte_type 39', async () => {
  const c = fakeClient({ rpc: { crm_claim_fiscal_issuance: () => true } });
  const store = createSupabaseStore(c);
  assert.equal(await store.claim('B', 'S', 'WLK-B-S'), true);
  assert.deepEqual(c.calls[0], {
    fn: 'crm_claim_fiscal_issuance',
    args: { p_business_id: 'B', p_sale_id: 'S', p_operation_id: 'WLK-B-S', p_dte_type: 39 },
  });
});

test('error de dominio del RPC (mensaje FISCAL_*) llega como FiscalError con código', async () => {
  const c = fakeClient({ rpc: { crm_claim_fiscal_issuance: () => pgrst('ERROR: FISCAL_POINT_NOT_CONFIRMED', 'P0001') } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.claim('B', 'S', 'op'), (e) => e instanceof FiscalError && e.code === 'FISCAL_POINT_NOT_CONFIRMED');
});

test('contexto de emisión se mapea igual que en Postgres', async () => {
  const raw = {
    issuer: { issuer_rut: '76123456-7', enabled: true, verified: true },
    emission_enabled: true,
    tax_lines_verified: true,
    lines: [{ id: 'l1', name: 'Café', unit_price: 1190, quantity: 2, discount_pct: 0, category: 'IVA_AFECTO_19' }],
    payments: [{ method: 'cash', amount: 2380, status: 'received', voided: false }],
    point_ops: [],
  };
  const store = createSupabaseStore(fakeClient({ rpc: { crm_fiscal_emission_context: () => raw } }));
  const ctx = await store.loadEmissionContext('B', 'S');
  assert.equal(ctx.issuer.issuerRut, '76123456-7');
  assert.equal(ctx.emissionEnabled, true);
  assert.equal(ctx.lines[0].unitPrice, 1190);
  assert.equal(ctx.payments[0].amount, 2380);
  assert.deepEqual(ctx.pointOps, []);
});

test('credenciales llegan en base64 y se abren con AAD del comercio', async () => {
  const key = randomBytes(32);
  const rec = seal({ apiKey: 'SECRET-123' }, { key, businessId: 'B' });
  const raw = {
    provider: 'dtecore', key_version: 1,
    ciphertext: rec.ciphertext.toString('base64'),
    iv: rec.iv.toString('base64'),
    auth_tag: rec.authTag.toString('base64'),
  };
  const store = createSupabaseStore(fakeClient({ rpc: { crm_fiscal_get_credentials: () => raw } }));
  const got = await store.loadCredentialRecord('B');
  assert.deepEqual(open({ ...got, keyVersion: got.keyVersion, authTag: got.authTag }, { key, businessId: 'B' }), { apiKey: 'SECRET-123' });
});

test('sin credenciales devuelve null', async () => {
  const store = createSupabaseStore(fakeClient({ rpc: { crm_fiscal_get_credentials: () => null } }));
  assert.equal(await store.loadCredentialRecord('B'), null);
});

test('la venta y el negocio se leen de tablas públicas, filtrando por id', async () => {
  const c = fakeClient({
    tables: {
      crm_invoices: { S: { id: 'S', business_id: 'B', status: 'pagada', paid_at: 'x', total: '2380', discount_amount: '0' } },
      wa_businesses: { B: { id: 'B', user_id: 'U', country_code: 'CL' } },
    },
  });
  const store = createSupabaseStore(c);
  const sale = await store.loadSaleById('S');
  assert.equal(sale.businessId, 'B');
  assert.equal(sale.total, 2380);
  const biz = await store.loadBusiness('B');
  assert.equal(biz.userId, 'U');
  assert.equal(await store.loadSaleById('missing'), null);
});

test('ninguna llamada del almacén usa un nombre de parámetro que no empiece por p_', async () => {
  const c = fakeClient({ rpc: {
    crm_fiscal_get_issuance: () => null,
    crm_fiscal_emission_context: () => ({ issuer: null, lines: [], payments: [], point_ops: [] }),
    crm_finalize_fiscal_issuance: () => true,
    crm_fiscal_mark_failed: () => true,
    crm_fiscal_reconcile_with_evidence: () => true,
    crm_claim_fiscal_issuance: () => true,
    crm_fiscal_get_credentials: () => null,
    crm_fiscal_actor_role: () => 'fiscal_owner',
    crm_fiscal_store_receipt: () => true,
    crm_fiscal_list_stale_sending: () => [],
    crm_fiscal_finalize_from_receipt: () => true,
    crm_fiscal_mark_stale_unknown: () => true,
  } });
  const store = createSupabaseStore(c);
  const before = new Date('2026-10-31T11:00:00Z');
  await store.getIssuance('B', 'S');
  await store.loadEmissionContext('B', 'S');
  await store.loadActorRole('B', 'U');
  await store.storeReceipt('B', 'S', 'op', { folio: 1, xmlBase64: 'PHhtbA==', pdfBase64: 'JVBERi0xLjQK' });
  await store.finalize('B', 'S', 'op', { status: 'unknown' });
  await store.markFailed('B', 'S', 'op', 'PROVIDER_REJECTED');
  await store.listStaleSending(before);
  await store.finalizeFromReceipt('B', 'S', 'op');
  await store.markStaleUnknown('B', 'S', 'op', before);
  await store.reconcileWithEvidence('B', 'S', 'op', { outcome: 'issued', folio: 1, xmlBase64: 'x', pdfBase64: 'y', reviewer: 'Juan', reason: 'motivo suficiente', evidenceReference: 'ref', providerStatus: 'found', checkedAt: '2026-10-31T12:00:00Z' });
  assert.equal(c.calls.filter((x) => x.fn).length, 10);
  for (const call of c.calls.filter((x) => x.fn)) {
    for (const k of Object.keys(call.args)) assert.ok(k.startsWith('p_'), `${call.fn}.${k}`);
  }
});

test('el almacén solo llama a funciones de esquema public (PostgREST no expone fiscal.*)', async () => {
  const names = new Set();
  const c = fakeClient({ rpc: new Proxy({}, { get: (_, fn) => { names.add(fn); return () => (fn === 'crm_fiscal_list_stale_sending' ? [] : true); } }) });
  const store = createSupabaseStore(c);
  await store.loadActorRole('B', 'U');
  await store.storeReceipt('B', 'S', 'op', { folio: 1, xmlBase64: 'a', pdfBase64: 'b' });
  await store.listStaleSending(new Date());
  await store.finalizeFromReceipt('B', 'S', 'op');
  await store.markStaleUnknown('B', 'S', 'op', new Date());
  for (const call of c.calls.filter((x) => x.fn)) {
    assert.ok(call.fn.startsWith('crm_'), call.fn);
    assert.equal(call.fn.includes('.'), false, 'sin esquema explícito');
  }
  assert.ok(names.has('crm_fiscal_actor_role'));
});

// ---------------------------------------------------------------------------
// Errores y respuestas de PostgREST
// ---------------------------------------------------------------------------

test('PGRST202 (función no encontrada en el esquema expuesto) -> StoreError, sin texto crudo', async () => {
  const c = fakeClient({ rpc: { crm_fiscal_actor_role: () => pgrst('Could not find the function public.crm_fiscal_actor_role in the schema cache', 'PGRST202') } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.loadActorRole('B', 'U'), (e) => {
    assert.ok(e instanceof StoreError);
    assert.equal(e.code, 'STORE_FUNCTION_MISSING');
    assert.equal(e.message.includes('schema cache'), false);
    assert.equal(e instanceof FiscalError, false);
    return true;
  });
});

test('PGRST116 en una lectura puntual (varias filas) -> StoreError STORE_UNEXPECTED_ROWS', async () => {
  const c = fakeClient({ tables: { crm_invoices: () => pgrst('JSON object requested, multiple (or no) rows returned', 'PGRST116') } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.loadSaleById('S'), (e) => e instanceof StoreError && e.code === 'STORE_UNEXPECTED_ROWS');
});

test('permiso denegado (42501) -> StoreError STORE_PERMISSION_DENIED', async () => {
  const c = fakeClient({ rpc: { crm_fiscal_store_receipt: () => pgrst('permission denied for function crm_fiscal_store_receipt', '42501') } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.storeReceipt('B', 'S', 'op', { folio: 1, xmlBase64: 'a', pdfBase64: 'b' }), (e) => e instanceof StoreError && e.code === 'STORE_PERMISSION_DENIED');
});

test('error PostgREST sin código conocido -> StoreError STORE_UNAVAILABLE, sin detalles internos', async () => {
  const c = fakeClient({ rpc: { crm_finalize_fiscal_issuance: () => pgrst('connection to database failed: password=abc', 'XX000') } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.finalize('B', 'S', 'op', { status: 'unknown' }), (e) => {
    assert.equal(e.code, 'STORE_UNAVAILABLE');
    assert.equal(e.message.includes('password'), false);
    return true;
  });
});

test('excepción de red (fetch falla antes de recibir respuesta) -> StoreError STORE_UNAVAILABLE', async () => {
  const c = fakeClient({ rpc: { crm_claim_fiscal_issuance: () => { throw new TypeError('fetch failed'); } } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.claim('B', 'S', 'op'), (e) => e instanceof StoreError && e.code === 'STORE_UNAVAILABLE');
});

test('errores de dominio con mensaje "Invalid fiscal..." -> INVALID_FISCAL_ARGUMENT', async () => {
  const c = fakeClient({ rpc: { crm_fiscal_store_receipt: () => pgrst('Invalid fiscal receipt', 'P0001') } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.storeReceipt('B', 'S', 'op', { folio: 1, xmlBase64: 'a', pdfBase64: 'b' }), { code: 'INVALID_FISCAL_ARGUMENT' });
});

test('FISCAL_RECEIPT_CONFLICT y FISCAL_NOT_SENDING llegan como FiscalError, distinguibles de la red', async () => {
  const c = fakeClient({ rpc: {
    crm_fiscal_store_receipt: (args) => (args.p_folio === 1
      ? pgrst('FISCAL_RECEIPT_CONFLICT', 'P0001')
      : pgrst('FISCAL_NOT_SENDING', 'P0001')),
  } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.storeReceipt('B', 'S', 'op', { folio: 1, xmlBase64: 'a', pdfBase64: 'b' }), (e) => e instanceof FiscalError && e.code === 'FISCAL_RECEIPT_CONFLICT');
  await assert.rejects(store.storeReceipt('B', 'S', 'op', { folio: 2, xmlBase64: 'a', pdfBase64: 'b' }), (e) => e instanceof FiscalError && e.code === 'FISCAL_NOT_SENDING');
});

test('data null en un RPC booleano se trata como false (conservador: no asume éxito)', async () => {
  const c = fakeClient({ rpc: { crm_finalize_fiscal_issuance: () => null, crm_fiscal_finalize_from_receipt: () => null } });
  const store = createSupabaseStore(c);
  assert.equal(await store.finalize('B', 'S', 'op', { status: 'issued', folio: 1, xmlBase64: 'a', pdfBase64: 'b' }), false);
  assert.equal(await store.finalizeFromReceipt('B', 'S', 'op'), false);
});

test('rol: solo los tres roles conocidos se aceptan; cualquier otro valor es denegado (null)', async () => {
  const roles = { v: 'fiscal_viewer', x: 'admin', n: null };
  const c = fakeClient({ rpc: { crm_fiscal_actor_role: (args) => roles[args.p_user_id] } });
  const store = createSupabaseStore(c);
  assert.equal(await store.loadActorRole('B', 'v'), 'fiscal_viewer');
  assert.equal(await store.loadActorRole('B', 'x'), null);
  assert.equal(await store.loadActorRole('B', 'n'), null);
});

test('listado de vencidas: forma PostgREST -> filas en camelCase con hasReceipt', async () => {
  const c = fakeClient({ rpc: { crm_fiscal_list_stale_sending: () => [
    { business_id: 'B', sale_id: 'S1', operation_id: 'WLK-B-S1', has_receipt: true },
    { business_id: 'B', sale_id: 'S2', operation_id: 'WLK-B-S2', has_receipt: false },
  ] } });
  const store = createSupabaseStore(c);
  const rows = await store.listStaleSending(new Date('2026-10-31T11:00:00Z'));
  assert.deepEqual(rows, [
    { businessId: 'B', saleId: 'S1', operationId: 'WLK-B-S1', hasReceipt: true },
    { businessId: 'B', saleId: 'S2', operationId: 'WLK-B-S2', hasReceipt: false },
  ]);
  assert.equal(c.calls.at(-1).args.p_before, '2026-10-31T11:00:00.000Z');
});

test('listado de vencidas con forma inesperada -> StoreError, nunca una lista falsa', async () => {
  const c = fakeClient({ rpc: { crm_fiscal_list_stale_sending: () => ({ unexpected: true }) } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.listStaleSending(new Date()), (e) => e instanceof StoreError && e.code === 'STORE_UNEXPECTED_SHAPE');
});

test('lectura de la venta con error PostgREST no se confunde con "no existe"', async () => {
  const c = fakeClient({ tables: { crm_invoices: () => pgrst('canceling statement due to statement timeout', '57014') } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.loadSaleById('S'), (e) => e instanceof StoreError);
});

test('constructor rechaza algo que no sea cliente supabase-js', () => {
  assert.throws(() => createSupabaseStore({}), /supabase-js client/);
});
