// Pruebas contra Postgres real (walinka_test, base local de pruebas). Ejecutan el ledger, las RPC
// y la migración propuesta de verdad. Nunca apuntan a producción: createPgStore lo impide.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPgStore, assertLocalTestConfig } from '../../lib/store-pg.mjs';
import { createFiscalEmitter } from '../../lib/emit.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { open as openSecret } from '../../lib/secrets.mjs';
import { CFG, TEST_MASTER_KEY, makeFixture, otherUser, setEmissionControl } from './fixtures.mjs';

let c; // cliente como superusuario de prueba (fixtures y lecturas de verificación)
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

function emitterFor(provider) {
  return createFiscalEmitter({ store, provider, masterKey: TEST_MASTER_KEY, timeoutMs: 300 });
}

async function issuanceRow(businessId, saleId) {
  const r = await c.query(
    `select status, folio, error_code, pdf_base64 is not null as has_pdf
       from public.crm_fiscal_issuances where business_id = $1 and sale_id = $2 and dte_type = 39`,
    [businessId, saleId],
  );
  return r.rows[0] ?? null;
}

async function countIssuances(businessId, saleId) {
  const r = await c.query(
    `select count(*)::int n from public.crm_fiscal_issuances where business_id = $1 and sale_id = $2`,
    [businessId, saleId],
  );
  return r.rows[0].n;
}

// ---------------------------------------------------------------------------
// Concurrencia e idempotencia
// ---------------------------------------------------------------------------

test('concurrencia real: 20 emisiones simultáneas -> una llamada, una fila issued', async () => {
  const f = await makeFixture(c);
  const provider = createSimulatedProvider({ scenario: 'ok', delayMs: 60 });
  const emitter = emitterFor(provider);
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId })),
  );
  assert.equal(provider.calls, 1, 'el proveedor debe llamarse exactamente una vez');
  const issued = results.filter((r) => r.status === 'fulfilled' && r.value.status === 'issued');
  assert.equal(issued.length, 1);
  assert.equal(await countIssuances(f.businessId, f.saleId), 1);
  const row = await issuanceRow(f.businessId, f.saleId);
  assert.equal(row.status, 'issued');
  assert.equal(row.has_pdf, true);
  for (const r of results.filter((x) => x.status === 'rejected')) {
    assert.ok(['ALREADY_IN_PROGRESS', 'NOT_EMITTABLE_IN_STATE'].includes(r.reason.code), r.reason.code);
  }
});

test('idempotencia: repetir una venta emitida no llama al proveedor', async () => {
  const f = await makeFixture(c);
  const provider = createSimulatedProvider();
  const emitter = emitterFor(provider);
  await emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId });
  const again = await emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(again.alreadyIssued, true);
  assert.equal(provider.calls, 1);
});

// ---------------------------------------------------------------------------
// Conflicto entre pipelines (P1, P3, P4): ninguna venta debe emitirse por dos caminos
// ---------------------------------------------------------------------------

test('P3 pendiente en la misma venta bloquea el reclamo: cero llamadas al proveedor', async () => {
  const f = await makeFixture(c);
  await c.query(
    `insert into fiscal.pos_dte39_outbox (business_id, invoice_id, operation_id, state)
     values ($1, $2, $3, 'pending')`,
    [f.businessId, f.saleId, `WALINKA-DTE39-${f.saleId}`],
  );
  const provider = createSimulatedProvider();
  await assert.rejects(emitterFor(provider).emitSale({ actorUserId: f.userId, saleId: f.saleId }), {
    code: 'FISCAL_CROSS_PIPELINE_CONFLICT',
  });
  assert.equal(provider.calls, 0);
  assert.equal(await countIssuances(f.businessId, f.saleId), 0);
});

test('P3 en estado skipped no bloquea (limpieza autorizada)', async () => {
  const f = await makeFixture(c);
  await c.query(
    `insert into fiscal.pos_dte39_outbox (business_id, invoice_id, operation_id, state)
     values ($1, $2, $3, 'skipped')`,
    [f.businessId, f.saleId, `WALINKA-DTE39-${f.saleId}`],
  );
  const provider = createSimulatedProvider();
  const r = await emitterFor(provider).emitSale({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(r.status, 'issued');
});

test('P1 (fiscal.operations) pendiente bloquea; cancelado no', async () => {
  const f = await makeFixture(c);
  await c.query(
    `insert into fiscal.operations (business_id, sale_id, issuer_rut, document_type, operation_key, status, snapshot)
     values ($1, $2, '76123456-7', 39, $3, 'pending', '{}'::jsonb)`,
    [f.businessId, f.saleId, `${f.businessId}:${f.saleId}:39`],
  );
  const provider = createSimulatedProvider();
  await assert.rejects(emitterFor(provider).emitSale({ actorUserId: f.userId, saleId: f.saleId }), {
    code: 'FISCAL_CROSS_PIPELINE_CONFLICT',
  });
  assert.equal(provider.calls, 0);

  await c.query(`update fiscal.operations set status = 'cancelled' where business_id = $1 and sale_id = $2`, [f.businessId, f.saleId]);
  const r = await emitterFor(provider).emitSale({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(r.status, 'issued');
});

test('P4 (crm_point_fiscal_outbox) con fila bloquea el reclamo', async () => {
  const f = await makeFixture(c, { cash: false, point: true });
  const po = await c.query(`select id from public.crm_pos_point_operations where crm_invoice_id = $1`, [f.saleId]);
  await c.query(
    `insert into public.crm_point_fiscal_outbox (point_operation_id, business_id, sale_id, status)
     values ($1, $2, $3, 'pending')`,
    [po.rows[0].id, f.businessId, f.saleId],
  );
  const provider = createSimulatedProvider();
  await assert.rejects(emitterFor(provider).emitSale({ actorUserId: f.userId, saleId: f.saleId }), {
    code: 'FISCAL_CROSS_PIPELINE_CONFLICT',
  });
  assert.equal(provider.calls, 0);
});

// ---------------------------------------------------------------------------
// Estados desconocidos y errores
// ---------------------------------------------------------------------------

test('timeout -> unknown; reintento bloqueado; reconciliación manual -> issued', async () => {
  const f = await makeFixture(c);
  const provider = createSimulatedProvider({ scenario: 'timeout' });
  const emitter = emitterFor(provider);
  const r = await emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(r.status, 'unknown');
  assert.equal((await issuanceRow(f.businessId, f.saleId)).status, 'unknown');

  await assert.rejects(emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId }), { code: 'UNKNOWN_REQUIRES_RECONCILIATION' });
  assert.equal(provider.calls, 1);

  const rec = await emitter.reconcile({
    actorUserId: f.userId,
    saleId: f.saleId,
    evidence: { folio: 4242, xmlBase64: 'PHhtbD4=', pdfBase64: 'JVBER', reason: 'Encontrada en portal por RUT y monto' },
  });
  assert.equal(rec.status, 'issued');
  const row = await issuanceRow(f.businessId, f.saleId);
  assert.equal(row.status, 'issued');
  assert.equal(row.folio, 4242);
});

test('respuesta sin PDF -> unknown, nunca issued', async () => {
  const f = await makeFixture(c);
  const r = await emitterFor(createSimulatedProvider({ scenario: 'no_pdf' })).emitSale({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(r.status, 'unknown');
  assert.equal((await issuanceRow(f.businessId, f.saleId)).status, 'unknown');
});

test('rechazo explícito -> failed con código; no se reintenta', async () => {
  const f = await makeFixture(c);
  const emitter = emitterFor(createSimulatedProvider({ scenario: 'rejected' }));
  const r = await emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(r.status, 'failed');
  const row = await c.query(`select status, error_code from public.crm_fiscal_issuances where sale_id = $1`, [f.saleId]);
  assert.equal(row.rows[0].status, 'failed');
  assert.equal(row.rows[0].error_code, 'PROVIDER_REJECTED');
  await assert.rejects(emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId }), { code: 'NOT_EMITTABLE_IN_STATE' });
});

// ---------------------------------------------------------------------------
// Aislamiento entre comercios
// ---------------------------------------------------------------------------

test('tenant: otro comercio no puede emitir ni reimprimir la venta', async () => {
  const a = await makeFixture(c);
  const b = await makeFixture(c);
  const provider = createSimulatedProvider();
  const emitter = emitterFor(provider);
  await assert.rejects(emitter.emitSale({ actorUserId: b.userId, saleId: a.saleId }), { code: 'SALE_NOT_FOUND' });
  await assert.rejects(emitter.reprint({ actorUserId: b.userId, saleId: a.saleId }), { code: 'SALE_NOT_FOUND' });
  assert.equal(provider.calls, 0);
  assert.equal(await countIssuances(a.businessId, a.saleId), 0);
});

test('tenant: la RPC rechaza un reclamo con business_id ajeno a la venta (aunque se llame directo)', async () => {
  const a = await makeFixture(c);
  const b = await makeFixture(c);
  await assert.rejects(store.claim(b.businessId, a.saleId, `WLK-${b.businessId}-${a.saleId}`), {
    message: /Invalid fiscal issuance claim/,
  });
  assert.equal(await countIssuances(a.businessId, a.saleId), 0);
});

test('tenant: un usuario ajeno no aparece como dueño de la venta', async () => {
  const a = await makeFixture(c);
  const stranger = await otherUser(c);
  await assert.rejects(emitterFor(createSimulatedProvider()).emitSale({ actorUserId: stranger, saleId: a.saleId }), {
    code: 'SALE_NOT_FOUND',
  });
});

// ---------------------------------------------------------------------------
// Guardas de la base (aunque el código de aplicación se saltara las comprobaciones)
// ---------------------------------------------------------------------------

test('guarda SQL: emisión global deshabilitada bloquea el reclamo', async () => {
  const f = await makeFixture(c);
  await setEmissionControl(c, false);
  try {
    await assert.rejects(store.claim(f.businessId, f.saleId, f.operationId), { code: 'FISCAL_EMISSION_DISABLED' });
  } finally {
    await setEmissionControl(c, true);
  }
  assert.equal(await countIssuances(f.businessId, f.saleId), 0);
});

test('guarda SQL: emisor no verificado bloquea el reclamo', async () => {
  const f = await makeFixture(c, { issuerVerified: false });
  await assert.rejects(store.claim(f.businessId, f.saleId, f.operationId), { code: 'FISCAL_ISSUER_NOT_ENABLED' });
});

test('guarda SQL: venta no pagada bloquea el reclamo', async () => {
  const f = await makeFixture(c, { status: 'pendiente', paid: false });
  await assert.rejects(store.claim(f.businessId, f.saleId, f.operationId), { code: 'FISCAL_SALE_NOT_ELIGIBLE' });
});

test('guarda SQL: línea sin verificación tributaria bloquea el reclamo', async () => {
  const f = await makeFixture(c, { taxVerified: false });
  await assert.rejects(store.claim(f.businessId, f.saleId, f.operationId), { code: 'FISCAL_TAX_LINES_NOT_VERIFIED' });
});

test('guarda SQL: verificación con huella antigua (línea editada) bloquea el reclamo', async () => {
  const f = await makeFixture(c);
  await c.query(`update public.crm_invoice_items set unit_price = 1191 where id = $1`, [f.itemId]);
  await assert.rejects(store.claim(f.businessId, f.saleId, f.operationId), { code: 'FISCAL_TAX_LINES_NOT_VERIFIED' });
});

test('claim atómico: el segundo reclamo de la misma operación devuelve false y no duplica', async () => {
  const f = await makeFixture(c);
  const first = await store.claim(f.businessId, f.saleId, f.operationId);
  const second = await store.claim(f.businessId, f.saleId, f.operationId);
  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(await countIssuances(f.businessId, f.saleId), 1);
});

// ---------------------------------------------------------------------------
// Medios de pago
// ---------------------------------------------------------------------------

test('pago mixto (efectivo + Point) se rechaza sin tocar el ledger', async () => {
  const f = await makeFixture(c, { cash: true, point: true });
  const provider = createSimulatedProvider();
  await assert.rejects(emitterFor(provider).emitSale({ actorUserId: f.userId, saleId: f.saleId }), { code: 'MIXED_PAYMENTS' });
  assert.equal(provider.calls, 0);
  assert.equal(await countIssuances(f.businessId, f.saleId), 0);
});

test('Point confirmada con monto exacto -> issued con medio PE', async () => {
  const f = await makeFixture(c, { cash: false, point: true });
  const provider = createSimulatedProvider();
  const r = await emitterFor(provider).emitSale({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(r.status, 'issued');
  assert.equal(r.medioPago, 'PE');
  assert.equal(provider.calls, 1);
});

// ---------------------------------------------------------------------------
// Reimpresión
// ---------------------------------------------------------------------------

test('reimpresión: devuelve el PDF guardado y no llama al proveedor', async () => {
  const f = await makeFixture(c);
  const provider = createSimulatedProvider();
  const emitter = emitterFor(provider);
  await emitter.emitSale({ actorUserId: f.userId, saleId: f.saleId });
  const r = await emitter.reprint({ actorUserId: f.userId, saleId: f.saleId });
  assert.equal(r.providerCalls, 0);
  assert.equal(provider.calls, 1);
  assert.ok(r.pdfBase64.length > 0);
});

// ---------------------------------------------------------------------------
// Credenciales: cifradas, ligadas al comercio y sin acceso para roles de cliente
// ---------------------------------------------------------------------------

test('credenciales: en la base solo hay ciphertext; se abren con la clave correcta', async () => {
  const f = await makeFixture(c);
  const row = (await c.query(`select ciphertext, iv, auth_tag, key_version, provider from fiscal.business_credentials where business_id = $1`, [f.businessId])).rows[0];
  assert.equal(row.ciphertext.toString('utf8').includes('TEST-API-KEY'), false);
  const plain = openSecret({ ...row, keyVersion: row.key_version, authTag: row.auth_tag }, { key: TEST_MASTER_KEY, businessId: f.businessId });
  assert.equal(plain.apiKey, `TEST-API-KEY-${f.businessId}`);
});

test('credenciales: copiar la fila a otro comercio no se puede abrir', async () => {
  const a = await makeFixture(c);
  const b = await makeFixture(c);
  const row = (await c.query(`select ciphertext, iv, auth_tag, key_version, provider from fiscal.business_credentials where business_id = $1`, [a.businessId])).rows[0];
  assert.throws(() => openSecret({ ...row, keyVersion: row.key_version, authTag: row.auth_tag }, { key: TEST_MASTER_KEY, businessId: b.businessId }), {
    code: 'CREDENTIAL_INVALID',
  });
});

test('credenciales: roles anon y authenticated no pueden leer la tabla ni crm_invoices sin RLS', async () => {
  const f = await makeFixture(c);
  for (const role of ['anon', 'authenticated']) {
    await c.query('begin');
    try {
      await c.query(`set local role ${role}`);
      await assert.rejects(c.query(`select count(*) from fiscal.business_credentials`), { code: '42501' }, role);
    } finally {
      await c.query('rollback');
    }
  }
  await c.query('begin');
  try {
    await c.query('set local role anon');
    await assert.rejects(c.query(`select id from public.crm_invoices where id = $1`, [f.saleId]), { code: '42501' });
  } finally {
    await c.query('rollback');
  }
});

test('la función de conflicto y la de líneas no son ejecutables por anon', async () => {
  for (const fn of ['fiscal.sale_fiscal_conflict(uuid,uuid)', 'fiscal.sale_tax_lines_verified(uuid,uuid)', 'public.crm_claim_fiscal_issuance(uuid,uuid,text,integer)']) {
    const r = await c.query(`select has_function_privilege('anon', $1::regprocedure, 'EXECUTE') as ok`, [fn]);
    assert.equal(r.rows[0].ok, false, fn);
  }
});

// ---------------------------------------------------------------------------
// Guarda de conexión: nunca apuntar a algo que no sea la base local de pruebas
// ---------------------------------------------------------------------------

test('la guarda de conexión rechaza hosts remotos y bases que no terminan en _test', () => {
  assert.throws(() => assertLocalTestConfig({ host: 'db.example.supabase.co', database: 'walinka_test' }), /non-local/);
  assert.throws(() => assertLocalTestConfig({ host: '/home/pgtest/pg/sock', database: 'postgres' }), /_test/);
  assert.throws(() => assertLocalTestConfig({ host: '127.0.0.1', database: 'production' }), /_test/);
  assert.doesNotThrow(() => assertLocalTestConfig({ host: '/home/pgtest/pg/sock', database: 'walinka_test' }));
});
