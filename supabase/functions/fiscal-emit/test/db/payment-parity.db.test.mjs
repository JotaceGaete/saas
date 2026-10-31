// Validación de pago dentro de SQL: (1) cada caso produce el mismo resultado en SQL y en JS
// (paridad), y (2) el reclamo rechaza en SQL aunque la aplicación se saltara sus comprobaciones.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPgStore, assertLocalTestConfig } from '../../lib/store-pg.mjs';
import { evaluateEligibility } from '../../lib/eligibility.mjs';
import { FiscalError } from '../../lib/errors.mjs';
import { CFG, makeFixture, setEmissionControl } from './fixtures.mjs';

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

async function sqlMedio(f) {
  try {
    const r = await c.query(`select fiscal.sale_payment_medio($1, $2) as m`, [f.businessId, f.saleId]);
    return { medio: r.rows[0].m, code: null };
  } catch (err) {
    return { medio: null, code: /FISCAL_[A-Z_]+/.exec(err.message)?.[0] ?? err.message };
  }
}

async function jsMedio(f) {
  const ctx = await store.loadEmissionContext(f.businessId, f.saleId);
  const sale = (await store.loadSaleById(f.saleId));
  const business = await store.loadBusiness(f.businessId);
  try {
    const r = evaluateEligibility({
      sale, business, issuer: ctx.issuer, emissionEnabled: ctx.emissionEnabled,
      taxLinesVerified: ctx.taxLinesVerified, lines: ctx.lines, payments: ctx.payments,
      pointOps: ctx.pointOps, operationId: f.operationId,
    });
    return { medio: r.medioPago, code: null };
  } catch (err) {
    assert.ok(err instanceof FiscalError, String(err));
    return { medio: null, code: err.code };
  }
}

// Mapeo de códigos JS -> SQL: las comprobaciones de elegibilidad de JS que no son de pago
// (venta pagada, país, emisor, etc.) no se comparan aquí.
const PAYMENT_CODES = new Set([
  'MIXED_PAYMENTS', 'PAYMENT_AMOUNT_MISMATCH', 'POINT_NOT_CONFIRMED', 'NO_CONFIRMED_PAYMENT',
]);

const CASES = [
  { name: 'efectivo exacto', opts: { cash: true }, mutate: null },
  { name: 'Point confirmada', opts: { cash: false, point: true }, mutate: null },
  { name: 'Point en pending', opts: { cash: false, point: true }, mutate: `update public.crm_pos_point_operations set mp_status = 'at_terminal' where crm_invoice_id = $1` },
  { name: 'Point sin finalizar', opts: { cash: false, point: true }, mutate: `update public.crm_pos_point_operations set finalized_at = null where crm_invoice_id = $1` },
  { name: 'Point monto distinto', opts: { cash: false, point: true }, mutate: `update public.crm_pos_point_operations set amount = 2000 where crm_invoice_id = $1` },
  { name: 'Point moneda USD', opts: { cash: false, point: true }, mutate: `update public.crm_pos_point_operations set currency = 'USD' where crm_invoice_id = $1` },
  { name: 'efectivo + Point', opts: { cash: true, point: true }, mutate: null },
  { name: 'sin pagos', opts: { cash: false }, mutate: null },
  { name: 'efectivo que no suma', opts: { cash: true }, mutate: `update public.crm_payments set amount = 2000 where invoice_id = $1` },
  { name: 'efectivo anulado', opts: { cash: true }, mutate: `update public.crm_payments set voided_at = now() where invoice_id = $1` },
];

for (const tc of CASES) {
  test(`paridad SQL/JS: ${tc.name}`, async () => {
    const f = await makeFixture(c, tc.opts);
    if (tc.mutate) await c.query(tc.mutate, [f.saleId]);
    const sql = await sqlMedio(f);
    const js = await jsMedio(f);
    assert.equal(sql.medio, js.medio, `medio: sql=${sql.medio} js=${js.medio}`);
    assert.ok(js.code === null || PAYMENT_CODES.has(js.code), `unexpected JS code ${js.code}`);
    if (js.code) assert.equal(sql.code, `FISCAL_${js.code}`, `code: sql=${sql.code} js=${js.code}`);
  });
}

test('SQL rechaza un reclamo con Point no confirmada aunque la aplicación no lo compruebe', async () => {
  const f = await makeFixture(c, { cash: false, point: true });
  await c.query(`update public.crm_pos_point_operations set mp_status = 'at_terminal' where crm_invoice_id = $1`, [f.saleId]);
  await assert.rejects(store.claim(f.businessId, f.saleId, f.operationId), { code: 'FISCAL_POINT_NOT_CONFIRMED' });
  const n = await c.query(`select count(*)::int n from public.crm_fiscal_issuances where sale_id = $1`, [f.saleId]);
  assert.equal(n.rows[0].n, 0);
});

test('SQL rechaza un reclamo con pago mixto aunque la aplicación no lo compruebe', async () => {
  const f = await makeFixture(c, { cash: true, point: true });
  await assert.rejects(store.claim(f.businessId, f.saleId, f.operationId), { code: 'FISCAL_MIXED_PAYMENTS' });
});

test('SQL rechaza un reclamo sin ningún pago confirmado', async () => {
  const f = await makeFixture(c, { cash: false });
  await assert.rejects(store.claim(f.businessId, f.saleId, f.operationId), { code: 'FISCAL_NO_CONFIRMED_PAYMENT' });
});

test('el contexto de emisión no devuelve credenciales', async () => {
  const f = await makeFixture(c);
  const r = await c.query(`select public.crm_fiscal_emission_context($1, $2)::text as j`, [f.businessId, f.saleId]);
  assert.equal(r.rows[0].j.includes('ciphertext'), false);
  assert.equal(r.rows[0].j.includes('TEST-API-KEY'), false);
});
