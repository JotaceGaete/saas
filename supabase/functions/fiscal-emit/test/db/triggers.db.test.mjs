// Interacción de triggers fiscales: orden de ejecución real y reglas de protect_dte39_outbox_transition.
// PostgreSQL dispara triggers BEFORE del mismo evento en orden alfabético por nombre.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { CFG, makeFixture, setEmissionControl } from './fixtures.mjs';
import { assertLocalTestConfig } from '../../lib/store-pg.mjs';

let c;
before(async () => {
  c = new pg.Client(assertLocalTestConfig(CFG));
  await c.connect();
  await setEmissionControl(c, true);
});
after(async () => { await c.end(); });

test('orden: la guarda cruzada P3 se ejecuta antes que protect_dte39_outbox_transition', async () => {
  const r = await c.query(`select tgname from pg_trigger
     where tgrelid = 'fiscal.pos_dte39_outbox'::regclass and tgenabled <> 'D' and not tgisinternal
       and tgtype & 2 = 2 order by tgname`);
  const names = r.rows.map((x) => x.tgname);
  assert.deepEqual(names, ['fiscal_p3_cross_pipeline_guard', 'protect_dte39_outbox_transition']);
});

test('protect sigue activo: cambiar el folio de una fila issued falla', async () => {
  const f = await makeFixture(c);
  await c.query(`insert into fiscal.pos_dte39_outbox (business_id, invoice_id, operation_id, state, folio)
                 values ($1, $2, $3, 'issued', 77)`, [f.businessId, f.saleId, `WALINKA-DTE39-${f.saleId}`]);
  await assert.rejects(c.query(`update fiscal.pos_dte39_outbox set folio = 78 where invoice_id = $1`, [f.saleId]),
    { message: /FISCAL_FOLIO_IMMUTABLE/ });
});

test('protect sigue activo: unknown no cambia de estado', async () => {
  const f = await makeFixture(c);
  await c.query(`insert into fiscal.pos_dte39_outbox (business_id, invoice_id, operation_id, state)
                 values ($1, $2, $3, 'unknown')`, [f.businessId, f.saleId, `WALINKA-DTE39-${f.saleId}`]);
  await assert.rejects(c.query(`update fiscal.pos_dte39_outbox set state = 'failed' where invoice_id = $1`, [f.saleId]),
    { message: /FISCAL_FINAL_STATE_LOCKED/ });
});

test('protect sigue activo: claimed no vuelve a pending', async () => {
  const f = await makeFixture(c);
  await c.query(`insert into fiscal.pos_dte39_outbox (business_id, invoice_id, operation_id, state)
                 values ($1, $2, $3, 'claimed')`, [f.businessId, f.saleId, `WALINKA-DTE39-${f.saleId}`]);
  await assert.rejects(c.query(`update fiscal.pos_dte39_outbox set state = 'pending' where invoice_id = $1`, [f.saleId]),
    { message: /FISCAL_REQUEUE_FORBIDDEN/ });
});

test('si la guarda cruzada bloquea, protect no llega a evaluarse y la fila no cambia', async () => {
  const f = await makeFixture(c);
  await c.query(`insert into public.crm_fiscal_issuances (business_id, sale_id, provider, dte_type, operation_id, status, folio)
                 values ($1, $2, 'siisolutions', 39, $3, 'issued', 5)`, [f.businessId, f.saleId, f.operationId]);
  await assert.rejects(c.query(`insert into fiscal.pos_dte39_outbox (business_id, invoice_id, operation_id, state, folio)
                                values ($1, $2, $3, 'issued', 6)`, [f.businessId, f.saleId, `WALINKA-DTE39-${f.saleId}`]),
    { message: /FISCAL_CROSS_PIPELINE_CONFLICT/ });
  const n = await c.query(`select count(*)::int n from fiscal.pos_dte39_outbox where invoice_id = $1`, [f.saleId]);
  assert.equal(n.rows[0].n, 0);
});
