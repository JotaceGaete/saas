// Concurrencia real entre pipelines fiscales (P1, P2, P3, P4) sobre walinka_test.
// Cada prueba intercala dos transacciones de verdad: la segunda queda bloqueada en el lock por
// venta hasta que la primera hace COMMIT. Se verifica que el bloqueo ocurre (pg_stat_activity)
// y que el resultado final nunca deja dos caminos de emisión activos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { CFG, makeFixture, setEmissionControl } from './fixtures.mjs';
import { assertLocalTestConfig } from '../../lib/store-pg.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let admin;
let savedControl;

before(async () => {
  admin = new pg.Client(assertLocalTestConfig(CFG));
  await admin.connect();
  const r = await admin.query(`select enabled from fiscal.dte39_emission_control where singleton`);
  savedControl = r.rows[0]?.enabled ?? false;
  await setEmissionControl(admin, true);
});

after(async () => {
  await setEmissionControl(admin, savedControl);
  await admin.end();
});

async function openAs(role = 'service_role') {
  const c = new pg.Client(assertLocalTestConfig(CFG));
  await c.connect();
  await c.query('begin');
  await c.query(`set local role ${role}`);
  return c;
}

// A ejecuta `firstSql` y mantiene la transacción abierta (retiene el lock por venta).
// B ejecuta `secondSql` en paralelo; debe quedar bloqueada. Luego A hace COMMIT y se resuelve B.
// Cada paso corre como service_role (el emisor), salvo que indique otro rol. Las escrituras del
// pipeline antiguo P3 corren como el dueño de las tablas: en producción service_role no puede
// escribir fiscal.pos_dte39_outbox; solo lo hacen sus funciones SECURITY DEFINER (sii_pos_dte39_*).
async function interleave({ first, second }) {
  const A = await openAs(first.role);
  const firstResult = await A.query(first.sql, first.params);

  const B = await openAs(second.role);
  const secondPromise = (async () => {
    try {
      await B.query(second.sql, second.params);
      await B.query('commit');
      return { ok: true };
    } catch (err) {
      await B.query('rollback').catch(() => {});
      return { ok: false, message: err.message };
    }
  })();

  // Espera a que B esté bloqueada por lock (no solo lenta).
  let blocked = false;
  for (let i = 0; i < 50 && !blocked; i += 1) {
    await sleep(20);
    const r = await admin.query(
      `select count(*)::int n from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`,
    );
    blocked = r.rows[0].n > 0;
  }
  await A.query('commit');
  const secondResult = await secondPromise;
  await A.end();
  await B.end();
  return { blockedBeforeFirstCommit: blocked, firstResult, secondResult };
}

const P2_CLAIM = (f) => ({
  sql: `select public.crm_claim_fiscal_issuance($1, $2, $3, 39) as ok`,
  params: [f.businessId, f.saleId, f.operationId],
});

test('P2 reclama primero; P3 intenta pasar a claimed -> bloqueado y rechazado tras el commit', async () => {
  const f = await makeFixture(admin);
  const r = await interleave({
    first: P2_CLAIM(f),
    second: {
      role: 'postgres',
      sql: `insert into fiscal.pos_dte39_outbox (business_id, invoice_id, operation_id, state)
            values ($1, $2, $3, 'claimed')`,
      params: [f.businessId, f.saleId, `WALINKA-DTE39-${f.saleId}`],
    },
  });
  assert.equal(r.blockedBeforeFirstCommit, true, 'P3 debe esperar el lock por venta');
  assert.equal(r.firstResult.rows[0].ok, true);
  assert.equal(r.secondResult.ok, false);
  assert.match(r.secondResult.message, /FISCAL_CROSS_PIPELINE_CONFLICT/);
  const p3 = await admin.query(`select count(*)::int n from fiscal.pos_dte39_outbox where invoice_id = $1`, [f.saleId]);
  assert.equal(p3.rows[0].n, 0);
});

test('P3 pasa a claimed primero; P2 intenta reclamar -> bloqueado y rechazado tras el commit', async () => {
  const f = await makeFixture(admin);
  const r = await interleave({
    first: {
      role: 'postgres',
      sql: `insert into fiscal.pos_dte39_outbox (business_id, invoice_id, operation_id, state)
            values ($1, $2, $3, 'claimed')`,
      params: [f.businessId, f.saleId, `WALINKA-DTE39-${f.saleId}`],
    },
    second: P2_CLAIM(f),
  });
  assert.equal(r.blockedBeforeFirstCommit, true, 'P2 debe esperar el lock por venta');
  assert.equal(r.secondResult.ok, false);
  assert.match(r.secondResult.message, /FISCAL_CROSS_PIPELINE_CONFLICT/);
  const p2 = await admin.query(`select count(*)::int n from public.crm_fiscal_issuances where sale_id = $1`, [f.saleId]);
  assert.equal(p2.rows[0].n, 0);
});

test('P2 reclama primero; P1 intenta insertar operación pending -> bloqueado y rechazado', async () => {
  const f = await makeFixture(admin);
  const r = await interleave({
    first: P2_CLAIM(f),
    second: {
      sql: `insert into fiscal.operations (business_id, sale_id, issuer_rut, document_type, operation_key, status, snapshot)
            values ($1, $2, '76123456-7', 39, $3, 'pending', '{}'::jsonb)`,
      params: [f.businessId, f.saleId, `${f.businessId}:${f.saleId}:39`],
    },
  });
  assert.equal(r.blockedBeforeFirstCommit, true);
  assert.equal(r.secondResult.ok, false);
  assert.match(r.secondResult.message, /FISCAL_CROSS_PIPELINE_CONFLICT/);
});

test('P1 inserta primero; P2 intenta reclamar -> bloqueado y rechazado (P1 pendiente bloquea)', async () => {
  const f = await makeFixture(admin);
  const r = await interleave({
    first: {
      sql: `insert into fiscal.operations (business_id, sale_id, issuer_rut, document_type, operation_key, status, snapshot)
            values ($1, $2, '76123456-7', 39, $3, 'pending', '{}'::jsonb)`,
      params: [f.businessId, f.saleId, `${f.businessId}:${f.saleId}:39`],
    },
    second: P2_CLAIM(f),
  });
  assert.equal(r.blockedBeforeFirstCommit, true);
  assert.equal(r.secondResult.ok, false);
  assert.match(r.secondResult.message, /FISCAL_CROSS_PIPELINE_CONFLICT/);
});

test('P2 reclama primero; P4 intenta encolar -> bloqueado y rechazado', async () => {
  const f = await makeFixture(admin, { cash: false, point: true });
  const po = await admin.query(`select id from public.crm_pos_point_operations where crm_invoice_id = $1`, [f.saleId]);
  const r = await interleave({
    first: P2_CLAIM(f),
    second: {
      sql: `insert into public.crm_point_fiscal_outbox (point_operation_id, business_id, sale_id, status)
            values ($1, $2, $3, 'pending')`,
      params: [po.rows[0].id, f.businessId, f.saleId],
    },
  });
  assert.equal(r.blockedBeforeFirstCommit, true);
  assert.equal(r.secondResult.ok, false);
  assert.match(r.secondResult.message, /FISCAL_CROSS_PIPELINE_CONFLICT/);
});

test('P4 encola primero; P2 intenta reclamar -> bloqueado y rechazado', async () => {
  const f = await makeFixture(admin, { cash: false, point: true });
  const po = await admin.query(`select id from public.crm_pos_point_operations where crm_invoice_id = $1`, [f.saleId]);
  const r = await interleave({
    first: {
      sql: `insert into public.crm_point_fiscal_outbox (point_operation_id, business_id, sale_id, status)
            values ($1, $2, $3, 'pending')`,
      params: [po.rows[0].id, f.businessId, f.saleId],
    },
    second: P2_CLAIM(f),
  });
  assert.equal(r.blockedBeforeFirstCommit, true);
  assert.equal(r.secondResult.ok, false);
  assert.match(r.secondResult.message, /FISCAL_CROSS_PIPELINE_CONFLICT/);
});

test('sin conflicto: dos reclamos P2 concurrentes -> uno gana, el otro devuelve false', async () => {
  const f = await makeFixture(admin);
  const r = await interleave({ first: P2_CLAIM(f), second: P2_CLAIM(f) });
  assert.equal(r.firstResult.rows[0].ok, true);
  assert.equal(r.secondResult.ok, true); // la segunda consulta se ejecuta, pero devuelve false
  const rows = await admin.query(`select count(*)::int n from public.crm_fiscal_issuances where sale_id = $1`, [f.saleId]);
  assert.equal(rows.rows[0].n, 1);
});

test('un P3 en skipped no bloquea P2 aunque se escriba en paralelo', async () => {
  const f = await makeFixture(admin);
  const r = await interleave({
    first: {
      role: 'postgres',
      sql: `insert into fiscal.pos_dte39_outbox (business_id, invoice_id, operation_id, state)
            values ($1, $2, $3, 'skipped')`,
      params: [f.businessId, f.saleId, `WALINKA-DTE39-${f.saleId}`],
    },
    second: P2_CLAIM(f),
  });
  assert.equal(r.secondResult.ok, true);
});
