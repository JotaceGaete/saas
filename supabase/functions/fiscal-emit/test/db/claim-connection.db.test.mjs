// Concurrencia entre la administración de credenciales y el reclamo de emisión, contra Postgres real
// (solo walinka_test). Dos conexiones reales: una administra credenciales, otra reclama una venta.
// Cubre: serialización bajo el candado de conexión, credenciales leídas dentro del reclamo,
// 'sending' reciente que bloquea, 'sending' abandonado y 'unknown' que NO bloquean, liberación
// de reclamos anteriores a la llamada al proveedor, y proveedor canónico en el ledger.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { assertLocalTestConfig } from '../../lib/store-pg.mjs';
import { seal, open } from '../../lib/secrets.mjs';
import { CFG, TEST_MASTER_KEY, makeFixture, setEmissionControl, uniqueRut, seedRutConfirmation } from './fixtures.mjs';

let admin;   // administra credenciales (conexión A)
let worker;  // reclama la venta (conexión B)
let c;       // conexión de apoyo para fixtures y consultas
let savedControl;

before(async () => {
  const cfg = assertLocalTestConfig(CFG);
  c = new pg.Client(cfg);
  admin = new pg.Client(cfg);
  worker = new pg.Client(cfg);
  await Promise.all([c.connect(), admin.connect(), worker.connect()]);
  const r = await c.query(`select enabled from fiscal.dte39_emission_control where singleton`);
  savedControl = r.rows[0]?.enabled ?? false;
  await setEmissionControl(c, true);
});

after(async () => {
  await setEmissionControl(c, savedControl);
  await Promise.all([admin.end(), worker.end(), c.end()]);
});

function sealFor(businessId, apiKey) {
  return seal({ apiKey }, { key: TEST_MASTER_KEY, businessId, provider: 'dtecore', keyVersion: 1 });
}

function saveSql(businessId, actorId, rec, rut = '12345678-5') {
  return [
    `select public.crm_fiscal_save_credentials($1,$2,$3,$4,$5,$6,1)`,
    [businessId, actorId, rut, rec.ciphertext, rec.iv, rec.authTag],
  ];
}

function claimSql(businessId, saleId, operationId) {
  return [`select public.crm_fiscal_claim_with_credentials($1,$2,$3) as j`, [businessId, saleId, operationId]];
}

async function issuance(businessId, saleId) {
  const r = await c.query(
    `select status, provider, updated_at from public.crm_fiscal_issuances where business_id=$1 and sale_id=$2 and dte_type=39`,
    [businessId, saleId],
  );
  return r.rows[0] ?? null;
}

// ---------------------------------------------------------------------------

test('serialización: el reclamo espera a un reemplazo de credenciales en curso y usa la clave NUEVA', async () => {
  const f = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  const before = await c.query(`select ciphertext from fiscal.business_credentials where business_id=$1`, [f.businessId]);

  // A abre una transacción y reemplaza la credencial (toma el candado de conexión).
  await admin.query('begin');
  const newRec = sealFor(f.businessId, 'CLAVE-NUEVA-DE-PRUEBA-0123456789');
  await admin.query(...saveSql(f.businessId, f.userId, newRec, uniqueRut()));

  // B intenta reclamar mientras A no ha confirmado: debe quedar esperando (y aquí, expirar).
  await worker.query('set lock_timeout = 300');
  await assert.rejects(worker.query(...claimSql(f.businessId, f.saleId, f.operationId)), (e) => e.code === '55P03');
  await worker.query('reset lock_timeout');
  await admin.query('commit');

  // Reconectar deja el emisor sin habilitar ni verificar: no se puede emitir hasta que el propietario verifique.
  await assert.rejects(worker.query(...claimSql(f.businessId, f.saleId, f.operationId)), /FISCAL_ISSUER_NOT_ENABLED/);
  await c.query(`update fiscal.issuers set review_status = 'approved', enabled = true, verified = true where business_id = $1`, [f.businessId]);
  // Migración H: la clave nueva (y el RUT nuevo) invalidan la confirmación anterior del RUT: no se
  // emite hasta que el propietario confirme de nuevo.
  await assert.rejects(worker.query(...claimSql(f.businessId, f.saleId, f.operationId)),
    /FISCAL_RUT_NOT_CONFIRMED: credentials_changed/);
  await seedRutConfirmation(c, f.businessId, f.userId);

  // Tras ambas verificaciones, B reclama y recibe la clave nueva, nunca la anterior.
  const r = await worker.query(...claimSql(f.businessId, f.saleId, f.operationId));
  const got = r.rows[0].j;
  assert.equal(got.claimed, true);
  const rec = {
    ciphertext: Buffer.from(got.credentials.ciphertext, 'base64'),
    iv: Buffer.from(got.credentials.iv, 'base64'),
    authTag: Buffer.from(got.credentials.auth_tag, 'base64'),
    keyVersion: 1,
    provider: 'dtecore',
  };
  assert.deepEqual(open(rec, { key: TEST_MASTER_KEY, businessId: f.businessId }), { apiKey: 'CLAVE-NUEVA-DE-PRUEBA-0123456789' });
  assert.notDeepEqual(rec.ciphertext, Buffer.from(before.rows[0].ciphertext));
});

test('sending reciente bloquea: reemplazar o desconectar durante una emisión falla sin cambios', async () => {
  const f = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  const r = await worker.query(...claimSql(f.businessId, f.saleId, f.operationId));
  assert.equal(r.rows[0].j.claimed, true);

  await assert.rejects(admin.query(...saveSql(f.businessId, f.userId, sealFor(f.businessId, 'OTRA-CLAVE-DE-PRUEBA-0123'), uniqueRut())),
    /FISCAL_OPERATION_IN_PROGRESS/);
  await assert.rejects(admin.query(`select public.crm_fiscal_disconnect($1,$2)`, [f.businessId, f.userId]),
    /FISCAL_OPERATION_IN_PROGRESS/);
});

test('sending abandonado (más antiguo que la ventana) NO bloquea la administración de credenciales', async () => {
  const f = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  await worker.query(...claimSql(f.businessId, f.saleId, f.operationId));
  await c.query(`update public.crm_fiscal_issuances set updated_at = now() - interval '2 hours'
                  where business_id=$1 and sale_id=$2`, [f.businessId, f.saleId]);
  // Reemplazar la API key del MISMO RUT sí se permite.
  await admin.query(...saveSql(f.businessId, f.userId, sealFor(f.businessId, 'CLAVE-TRAS-VENTANA-0123456789'), f.issuerRut));
  const row = await c.query(`select issuer_rut from fiscal.issuers where business_id=$1`, [f.businessId]);
  assert.equal(row.rows[0].issuer_rut, f.issuerRut);
  // Migración H: cambiar el RUT con una emisión sin resolver (sending) no se permite: el documento
  // pendiente es del RUT anterior y su reconciliación necesita esa cuenta.
  await assert.rejects(admin.query(...saveSql(f.businessId, f.userId, sealFor(f.businessId, 'OTRA-0123456789-CLAVE'), uniqueRut())),
    /FISCAL_RUT_CHANGE_BLOCKED/);
});

test("unknown NO bloquea: documentos históricos en 'unknown' no impiden administrar credenciales", async () => {
  const f = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  await c.query(
    `insert into public.crm_fiscal_issuances (business_id, sale_id, provider, dte_type, operation_id, status)
     values ($1,$2,'dtecore',39,$3,'unknown')`,
    [f.businessId, f.saleId, f.operationId],
  );
  await admin.query(...saveSql(f.businessId, f.userId, sealFor(f.businessId, 'CLAVE-CON-UNKNOWN-0123456789'), f.issuerRut));
  await assert.rejects(admin.query(...saveSql(f.businessId, f.userId, sealFor(f.businessId, 'OTRA-0123456789-CLAVE'), uniqueRut())),
    /FISCAL_RUT_CHANGE_BLOCKED/, 'H: el RUT no cambia con un documento unknown sin reconciliar');
  await admin.query(`select public.crm_fiscal_disconnect($1,$2)`, [f.businessId, f.userId]);
  assert.equal((await issuance(f.businessId, f.saleId)).status, 'unknown', 'el documento histórico no se toca');
});

test('sin credenciales: el reclamo falla con FISCAL_CREDENTIALS_MISSING y no crea fila', async () => {
  const f = await makeFixture(c, { withCredentials: false, issuerEnabled: false, issuerVerified: false });
  await assert.rejects(worker.query(...claimSql(f.businessId, f.saleId, f.operationId)), /FISCAL_CREDENTIALS_MISSING/);
  assert.equal(await issuance(f.businessId, f.saleId), null);
});

test('emisor y credenciales con proveedores distintos: FISCAL_PROVIDER_MISMATCH sin fila', async () => {
  const f = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  await c.query(`update fiscal.issuers set provider='sii_solutions' where business_id=$1`, [f.businessId]);
  await assert.rejects(worker.query(...claimSql(f.businessId, f.saleId, f.operationId)), /FISCAL_PROVIDER_MISMATCH/);
  assert.equal(await issuance(f.businessId, f.saleId), null);
});

test('el ledger registra el proveedor canónico en emisiones nuevas', async () => {
  const f = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  await worker.query(...claimSql(f.businessId, f.saleId, f.operationId));
  assert.equal((await issuance(f.businessId, f.saleId)).provider, 'dtecore');
});

test('liberación: sending -> pending permite reintentar; liberar algo que no está en sending no hace nada', async () => {
  const f = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  await worker.query(...claimSql(f.businessId, f.saleId, f.operationId));
  const released = await c.query(`select public.crm_fiscal_release_claim($1,$2,$3) as ok`, [f.businessId, f.saleId, f.operationId]);
  assert.equal(released.rows[0].ok, true);
  assert.equal((await issuance(f.businessId, f.saleId)).status, 'pending');
  const again = await worker.query(...claimSql(f.businessId, f.saleId, f.operationId));
  assert.equal(again.rows[0].j.claimed, true, 'tras liberar, el reclamo vuelve a funcionar');
  const noop = await c.query(`select public.crm_fiscal_release_claim($1,$2,'otra-operacion') as ok`, [f.businessId, f.saleId]);
  assert.equal(noop.rows[0].ok, false);
});

test('reclamo de una venta ya reclamada no devuelve credenciales', async () => {
  const f = await makeFixture(c, { withCredentials: true, issuerEnabled: true, issuerVerified: true });
  await worker.query(...claimSql(f.businessId, f.saleId, f.operationId));
  const second = await worker.query(...claimSql(f.businessId, f.saleId, f.operationId));
  assert.equal(second.rows[0].j.claimed, false);
  assert.equal(second.rows[0].j.credentials, undefined);
});

test('histórico: la recuperación sigue viendo emisiones del piloto con proveedor siisolutions', async () => {
  const f = await makeFixture(c, { withCredentials: false, issuerEnabled: false, issuerVerified: false });
  // Fila histórica anterior a H (sin verificación de identidad): se siembra con triggers
  // desactivados solo para esta transacción, como existiría en la base antes de la migración.
  await c.query('begin');
  await c.query(`set local session_replication_role = replica`);
  await c.query(
    `insert into public.crm_fiscal_issuances (business_id, sale_id, provider, dte_type, operation_id, status, updated_at, issuer_rut)
     values ($1,$2,'siisolutions',39,$3,'sending', now() - interval '2 hours', $4)`,
    [f.businessId, f.saleId, f.operationId, f.issuerRut],
  );
  await c.query('commit');
  const r = await c.query(`select r::text as t from public.crm_fiscal_list_stale_sending(now() - interval '1 hour') r`);
  assert.ok(r.rows.some((x) => x.t.includes(f.saleId)), 'el histórico legado no queda fuera de la recuperación');
});

test('constantes de proveedor del código = restricciones de la base (emisor, ledger y credenciales)', async () => {
  const { ISSUER_PROVIDER_IDS, LEDGER_PROVIDER_IDS, CANONICAL_PROVIDER } = await import('../../lib/provider-ids.mjs');
  const r = await c.query(`select conname, pg_get_constraintdef(oid) d from pg_constraint
                           where conname in ('issuers_provider_check', 'crm_fiscal_issuances_provider_check')`);
  const defs = Object.fromEntries(r.rows.map((x) => [x.conname, x.d]));
  for (const v of ISSUER_PROVIDER_IDS) assert.ok(defs.issuers_provider_check.includes(`'${v}'`), `emisor admite ${v}`);
  for (const v of LEDGER_PROVIDER_IDS) assert.ok(defs.crm_fiscal_issuances_provider_check.includes(`'${v}'`), `ledger admite ${v}`);
  assert.equal(CANONICAL_PROVIDER, 'dtecore');
  const cred = await c.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'business_credentials_provider_check'`);
  assert.ok(cred.rows[0].d.includes(`'${CANONICAL_PROVIDER}'`));
});
