// Revisión de seguridad (PR #108): cambio de dueño, bloqueo retroactivo, reconciliación
// administrativa con auditoría, recibos no reasociables, configuración y carreras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createFiscalEmitter, operationIdFor } from '../../lib/emit.mjs';
import { createRecovery } from '../../lib/recovery.mjs';
import { createAdminReconciler } from '../../lib/reconciler.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { readRecoveryConfig, DEFAULT_STALE_AFTER_MS, MIN_STALE_AFTER_MS, MAX_STALE_AFTER_MS } from '../../lib/config.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';

const MASTER = randomBytes(32);
const ROW = `${IDS.bizA}|${IDS.saleA}`;
const OP = operationIdFor(IDS.bizA, IDS.saleA);
const STALE = 16 * 60_000;
const NEW_OWNER = 'user-c';

function world({ scenario = 'ok' } = {}) {
  let t = Date.parse('2026-10-31T12:00:00Z');
  const clock = { now: () => new Date(t), advance: (ms) => { t += ms; } };
  const store = createMemoryStore({ masterKey: MASTER, now: clock.now });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  store.seed({ businessId: IDS.bizB, userId: IDS.userB, saleId: IDS.saleB });
  const provider = createSimulatedProvider({ scenario, delayMs: 5 });
  const emitter = createFiscalEmitter({ store, provider, masterKey: MASTER, timeoutMs: 200 });
  const recovery = createRecovery({ store, now: clock.now, staleAfterMs: 15 * 60_000 });
  return { store, provider, emitter, recovery, clock };
}

const EVIDENCE = (over = {}) => ({
  outcome: 'issued', folio: 77, xmlBase64: 'PHhtbA==', pdfBase64: 'JVBERi0xLjQK', providerStatus: 'found',
  reviewer: 'Ana Reconciliadora', reviewerUserId: IDS.userA, evidenceReference: 'portal-ref-77',
  checkedAt: '2026-10-31T12:00:00Z', reason: 'Encontrada en portal por RUT y monto', ...over,
});

// Deja una venta de A en 'unknown'.
async function unknownSale() {
  const w = world({ scenario: 'timeout' });
  await w.emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  return w;
}

// ---------------------------------------------------------------------------
// 1. Cambio de propietario
// ---------------------------------------------------------------------------

test('cambio de dueño: el dueño anterior pierde el acceso fiscal y no hereda nada', async () => {
  const w = world();
  w.store.grantRole(IDS.bizA, IDS.userA, 'fiscal_operator');
  w.store.changeOwner(IDS.bizA, NEW_OWNER);
  await assert.rejects(w.emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'SALE_NOT_FOUND' });
  await assert.rejects(w.emitter.reprint({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'SALE_NOT_FOUND' });
  assert.equal(w.provider.calls, 0);
});

test('cambio de dueño: el nuevo dueño recibe fiscal_owner y puede emitir; queda auditado', async () => {
  const w = world();
  w.store.changeOwner(IDS.bizA, NEW_OWNER);
  const r = await w.emitter.emitSale({ actorUserId: NEW_OWNER, saleId: IDS.saleA });
  assert.equal(r.status, 'issued');
  const audit = w.store.auditLog.find((a) => a.action === 'owner_changed');
  assert.equal(audit.previous, IDS.userA);
  assert.equal(audit.next, NEW_OWNER);
  assert.equal(audit.revoked, 1);
});

test('cambio de dueño: el dueño anterior no puede leer el PDF de una venta ya emitida', async () => {
  const w = world();
  await w.emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  w.store.changeOwner(IDS.bizA, NEW_OWNER);
  await assert.rejects(w.emitter.reprint({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'SALE_NOT_FOUND' });
  const r = await w.emitter.reprint({ actorUserId: NEW_OWNER, saleId: IDS.saleA });
  assert.equal(r.folio, 1000);
});

// ---------------------------------------------------------------------------
// 2. Bloqueo de emisión retroactiva (ventas Point antiguas)
// ---------------------------------------------------------------------------

test('venta bloqueada para emisión retroactiva: rechazo en el reclamo, sin llamar al proveedor ni crear fila', async () => {
  const w = world();
  w.store.blockSale(IDS.saleA);
  await assert.rejects(w.emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA }), { code: 'FISCAL_RETROACTIVE_BLOCKED' });
  assert.equal(w.provider.calls, 0);
  assert.equal(w.store.issuances.has(ROW), false);
});

// ---------------------------------------------------------------------------
// 3. Reconciliación administrativa
// ---------------------------------------------------------------------------

test('cajero (fiscal_operator) no puede resolver un unknown; queda auditado el intento denegado', async () => {
  const w = await unknownSale();
  w.store.revokeRole(IDS.bizA, IDS.userA, 'fiscal_owner');
  w.store.grantRole(IDS.bizA, IDS.userA, 'fiscal_operator');
  const rec = createAdminReconciler({ store: w.store });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: EVIDENCE() }), { code: 'RECONCILIATION_NOT_AUTHORIZED' });
  assert.equal(w.store.issuances.get(ROW).status, 'unknown');
  assert.equal(w.store.evidenceLog.length, 0);
  assert.equal(w.store.auditLog.at(-1).outcome, 'denied_no_reconciler_role');
});

test('dueño sin rol de reconciliador no concilia por ser dueño', async () => {
  const w = await unknownSale();
  const rec = createAdminReconciler({ store: w.store });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: EVIDENCE() }), { code: 'RECONCILIATION_NOT_AUTHORIZED' });
  assert.equal(w.store.issuances.get(ROW).status, 'unknown');
});

test('reconciliador con identidad distinta del revisor declarado -> EVIDENCE_REVIEWER_MISMATCH', async () => {
  const w = await unknownSale();
  w.store.grantRole(IDS.bizA, IDS.userA, 'fiscal_reconciler');
  const rec = createAdminReconciler({ store: w.store });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: EVIDENCE({ reviewerUserId: 'otro-usuario' }) }), { code: 'EVIDENCE_REVIEWER_MISMATCH' });
  assert.equal(w.store.issuances.get(ROW).status, 'unknown');
});

test('reconciliador autorizado: aplica con evidencia y deja auditoría de inicio y de resultado', async () => {
  const w = await unknownSale();
  w.store.grantRole(IDS.bizA, IDS.userA, 'fiscal_reconciler');
  const rec = createAdminReconciler({ store: w.store });
  const r = await rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: EVIDENCE() });
  assert.equal(r.status, 'issued');
  assert.equal(w.store.issuances.get(ROW).folio, 77);
  assert.equal(w.store.evidenceLog.length, 1);
  const actions = w.store.auditLog.map((a) => `${a.action}:${a.outcome}`);
  assert.deepEqual(actions.slice(-2), ['reconcile_attempt:started', 'reconcile_result:applied']);
  assert.equal(w.provider.calls, 1, 'reconciliar no llama al proveedor');
});

test('auditoría previa no disponible: no se reconcilia (falla cerrado)', async () => {
  const w = await unknownSale();
  w.store.grantRole(IDS.bizA, IDS.userA, 'fiscal_reconciler');
  w.store.setAuditFailure(true);
  const rec = createAdminReconciler({ store: w.store });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: EVIDENCE() }), /audit store unavailable/);
  assert.equal(w.store.issuances.get(ROW).status, 'unknown');
  assert.equal(w.store.evidenceLog.length, 0);
});

test('auditoría del resultado fallida tras aplicar: error interno visible, no un éxito silencioso', async () => {
  const w = await unknownSale();
  w.store.grantRole(IDS.bizA, IDS.userA, 'fiscal_reconciler');
  const rec = createAdminReconciler({ store: w.store });
  // Falla solo en el resultado: la auditoría de inicio sí se escribe.
  const original = w.store.appendAudit;
  let calls = 0;
  w.store.appendAudit = async (entry) => {
    calls += 1;
    if (entry.outcome === 'applied') throw new Error('audit down');
    return original(entry);
  };
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: EVIDENCE() }), /reconciled but audit result/);
  assert.equal(w.store.issuances.get(ROW).status, 'issued', 'la evidencia quedó registrada y el estado aplicado');
  assert.equal(w.store.evidenceLog.length, 1);
});

test('reconciliar una venta que no está en unknown (sending) se rechaza y queda auditado', async () => {
  const w = world();
  w.store.grantRole(IDS.bizA, IDS.userA, 'fiscal_reconciler');
  w.store.injectFault('storeReceipt', { mode: 'hang', times: 1 });
  w.emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  await new Promise((r) => setTimeout(r, 20));
  const rec = createAdminReconciler({ store: w.store });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: EVIDENCE() }), { code: 'NOT_UNKNOWN' });
  assert.equal(w.store.issuances.get(ROW).status, 'sending');
  assert.equal(w.store.auditLog.at(-1).outcome, 'rejected');
});

test('no miembro -> SALE_NOT_FOUND, sin tocar auditoría ni estado', async () => {
  const w = await unknownSale();
  const rec = createAdminReconciler({ store: w.store });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userB, saleId: IDS.saleA, evidence: EVIDENCE({ reviewerUserId: IDS.userB }) }), { code: 'SALE_NOT_FOUND' });
  assert.equal(w.store.auditLog.length, 0, 'un no miembro no deja rastro en la auditoría');
});

// ---------------------------------------------------------------------------
// 4. Recibos: no sobrescribibles ni reasociables
// ---------------------------------------------------------------------------

test('recibo no se puede asociar a otro negocio o a otra operación', async () => {
  const w = world();
  await w.store.claim(IDS.bizA, IDS.saleA, OP);
  const doc = { folio: 1, xmlBase64: 'PHhtbA==', pdfBase64: 'JVBERi0xLjQK' };
  await assert.rejects(w.store.storeReceipt(IDS.bizB, IDS.saleA, OP, doc), { code: 'FISCAL_NOT_SENDING' });
  await assert.rejects(w.store.storeReceipt(IDS.bizA, IDS.saleA, 'WLK-otra', doc), { code: 'FISCAL_NOT_SENDING' });
  assert.equal(w.store.receipts.size, 0);
});

test('recibo ya guardado: contenido distinto no sobrescribe; el mismo contenido es idempotente', async () => {
  const w = world();
  await w.store.claim(IDS.bizA, IDS.saleA, OP);
  const doc = { folio: 1000, xmlBase64: 'PHhtbA==', pdfBase64: 'JVBERi0xLjQK' };
  await w.store.storeReceipt(IDS.bizA, IDS.saleA, OP, doc);
  await assert.rejects(w.store.storeReceipt(IDS.bizA, IDS.saleA, OP, { ...doc, folio: 1001 }), { code: 'FISCAL_RECEIPT_CONFLICT' });
  await assert.rejects(w.store.storeReceipt(IDS.bizA, IDS.saleA, OP, { ...doc, pdfBase64: 'JVBERi0xLjUK' }), { code: 'FISCAL_RECEIPT_CONFLICT' });
  assert.equal(await w.store.storeReceipt(IDS.bizA, IDS.saleA, OP, doc), true);
  assert.equal(w.store.receipts.get(`${IDS.bizA}|${IDS.saleA}|${OP}`).folio, 1000);
});

// ---------------------------------------------------------------------------
// 5. Configuración de recuperación
// ---------------------------------------------------------------------------

test('staleAfterMs: por defecto 15 minutos; configurable por entorno dentro de los límites', () => {
  assert.equal(DEFAULT_STALE_AFTER_MS, 15 * 60_000);
  assert.deepEqual({ ...readRecoveryConfig({}) }, { staleAfterMs: 900000, source: 'default' });
  assert.equal(readRecoveryConfig({ FISCAL_STALE_AFTER_MS: '1200000' }).staleAfterMs, 1_200_000);
  assert.equal(readRecoveryConfig({ FISCAL_STALE_AFTER_MS: MIN_STALE_AFTER_MS.toString() }).staleAfterMs, MIN_STALE_AFTER_MS);
  assert.equal(readRecoveryConfig({ FISCAL_STALE_AFTER_MS: MAX_STALE_AFTER_MS.toString() }).staleAfterMs, MAX_STALE_AFTER_MS);
});

test('staleAfterMs: valores inválidos o fuera de rango impiden arrancar', () => {
  for (const bad of ['abc', '12.5', '-1', '1000', String(MAX_STALE_AFTER_MS + 1), '1e6']) {
    assert.throws(() => readRecoveryConfig({ FISCAL_STALE_AFTER_MS: bad }), /FISCAL_STALE_AFTER_MS/, bad);
  }
});

// ---------------------------------------------------------------------------
// 6. Carreras entre recuperación, persistencia y reconciliación
// ---------------------------------------------------------------------------

test('carrera: la recuperación finaliza desde el recibo mientras el emisor finaliza; resultado único, sin reemisión', async () => {
  const w = world();
  // Justo antes de que el emisor finalice, la recuperación (con la fila ya vencida) la completa desde el recibo.
  w.store.onNextCall('finalize', async () => {
    w.clock.advance(STALE);
    const rep = await w.recovery.recoverStaleSending();
    assert.equal(rep.finalizedFromReceipt, 1);
  });
  const r = await w.emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  assert.equal(r.status, 'issued');
  assert.equal(r.folio, 1000);
  assert.equal(w.store.issuances.get(ROW).status, 'issued');
  assert.equal(w.provider.calls, 1);
});

test('carrera: la reconciliación no puede tomar una fila que la recuperación aún no ha marcado', async () => {
  const w = world();
  w.store.injectFault('storeReceipt', { mode: 'hang', times: 1 });
  w.emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  await new Promise((r) => setTimeout(r, 20));
  w.store.grantRole(IDS.bizA, IDS.userA, 'fiscal_reconciler');
  const rec = createAdminReconciler({ store: w.store });
  // Aún 'sending': reconciliar debe fallar.
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: EVIDENCE() }), { code: 'NOT_UNKNOWN' });
  // La recuperación la lleva a unknown; ahora sí, la reconciliación con evidencia la resuelve; después la recuperación no toca nada.
  w.clock.advance(STALE);
  assert.equal((await w.recovery.recoverStaleSending()).markedUnknown, 1);
  const r = await rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: EVIDENCE() });
  assert.equal(r.status, 'issued');
  assert.equal((await w.recovery.recoverStaleSending()).examined, 0);
  assert.equal(w.store.issuances.get(ROW).status, 'issued');
  assert.equal(w.provider.calls, 1);
});
