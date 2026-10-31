import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createSupabaseStore } from '../../lib/store-supabase.mjs';
import { seal, open } from '../../lib/secrets.mjs';

// Cliente falso con la forma de supabase-js que usa el almacén. Registra cada llamada.
function fakeClient(handlers) {
  const calls = [];
  return {
    calls,
    async rpc(fn, args) {
      calls.push({ fn, args });
      const h = handlers.rpc?.[fn];
      if (!h) return { data: null, error: { message: `no handler for ${fn}` } };
      try {
        return { data: await h(args), error: null };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    },
    from(table) {
      const q = {
        select() { return q; },
        eq(col, val) { q.where = [table, col, val]; return q; },
        async maybeSingle() {
          calls.push({ table, where: q.where });
          const row = handlers.tables?.[table]?.[q.where[2]] ?? null;
          return { data: row, error: null };
        },
      };
      return q;
    },
  };
}

test('claim llama al RPC con los nombres de parámetro de PostgREST y dte_type 39', async () => {
  const c = fakeClient({ rpc: { crm_claim_fiscal_issuance: () => true } });
  const store = createSupabaseStore(c);
  assert.equal(await store.claim('B', 'S', 'WLK-B-S'), true);
  assert.deepEqual(c.calls[0], {
    fn: 'crm_claim_fiscal_issuance',
    args: { p_business_id: 'B', p_sale_id: 'S', p_operation_id: 'WLK-B-S', p_dte_type: 39 },
  });
});

test('errores del RPC de guarda llegan como FiscalError con código', async () => {
  const c = fakeClient({ rpc: { crm_claim_fiscal_issuance: () => { throw new Error('ERROR: FISCAL_POINT_NOT_CONFIRMED'); } } });
  const store = createSupabaseStore(c);
  await assert.rejects(store.claim('B', 'S', 'op'), { code: 'FISCAL_POINT_NOT_CONFIRMED' });
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
  } });
  const store = createSupabaseStore(c);
  await store.getIssuance('B', 'S');
  await store.loadEmissionContext('B', 'S');
  await store.finalize('B', 'S', 'op', { status: 'unknown' });
  await store.markFailed('B', 'S', 'op', 'PROVIDER_REJECTED');
  await store.reconcileWithEvidence('B', 'S', 'op', { outcome: 'issued', folio: 1, xmlBase64: 'x', pdfBase64: 'y', reviewer: 'Juan', reason: 'motivo suficiente', evidenceReference: 'ref', providerStatus: 'found', checkedAt: '2026-10-31T12:00:00Z' });
  for (const call of c.calls.filter((x) => x.fn)) {
    for (const k of Object.keys(call.args)) assert.ok(k.startsWith('p_'), `${call.fn}.${k}`);
  }
});

test('constructor rechaza algo que no sea cliente supabase-js', () => {
  assert.throws(() => createSupabaseStore({}), /supabase-js client/);
});
