// Reconciliación manual. Fuera de la API pública: estas pruebas son la única forma de usarla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createReconciler } from '../../lib/reconciler.mjs';
import { normalizeEvidence } from '../../lib/evidence.mjs';
import { createFiscalEmitter } from '../../lib/emit.mjs';
import { createSimulatedProvider } from '../../lib/providers/simulated.mjs';
import { createMemoryStore, IDS } from '../helpers/memory-store.mjs';
import { TEST_ALLOW_ALL } from '../helpers/allowlist.mjs';

const MASTER = randomBytes(32);
const ROW_A = `${IDS.bizA}|${IDS.saleA}`;
const ALLOW = async () => true;
const DENY = async () => false;

// Deja una venta de A en 'unknown' (timeout del proveedor).
async function unknownSale() {
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  store.seed({ businessId: IDS.bizB, userId: IDS.userB, saleId: IDS.saleB });
  const provider = createSimulatedProvider({ scenario: 'timeout', delayMs: 5 });
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider, masterKey: MASTER, timeoutMs: 100 });
  await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  return { store, provider };
}

const BASE_EVIDENCE = {
  outcome: 'issued',
  folio: 77,
  xmlBase64: 'PHhtbA==',
  pdfBase64: 'JVBERi0xLjQK',
  providerStatus: 'found',
  reviewer: 'Juan Pérez',
  evidenceReference: 'portal-sii-ref-1',
  checkedAt: '2026-10-31T12:00:00Z',
  reason: 'Encontrada en portal por RUT y monto',
};

// ---------------------------------------------------------------------------
// Falla cerrado
// ---------------------------------------------------------------------------

test('sin función authorize no se construye el reconciliador', () => {
  const store = createMemoryStore({ masterKey: MASTER });
  assert.throws(() => createReconciler({ store }), /fail-closed/);
  assert.throws(() => createReconciler({ store, authorize: 'sí' }), /fail-closed/);
});

test('authorize que devuelve false -> RECONCILIATION_NOT_AUTHORIZED, sin tocar el ledger', async () => {
  const { store } = await unknownSale();
  const rec = createReconciler({ store, authorize: DENY });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: BASE_EVIDENCE }), { code: 'RECONCILIATION_NOT_AUTHORIZED' });
  assert.equal(store.issuances.get(ROW_A).status, 'unknown');
  assert.equal(store.evidenceLog.length, 0);
});

test('authorize que lanza excepción se trata como denegado', async () => {
  const { store } = await unknownSale();
  const rec = createReconciler({ store, authorize: async () => { throw new Error('policy service down'); } });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: BASE_EVIDENCE }), { code: 'RECONCILIATION_NOT_AUTHORIZED' });
});

test('authorize que devuelve algo distinto de true (p. ej. "sí") se trata como denegado', async () => {
  const { store } = await unknownSale();
  const rec = createReconciler({ store, authorize: async () => 'sí' });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: BASE_EVIDENCE }), { code: 'RECONCILIATION_NOT_AUTHORIZED' });
});

test('usuario sin rol en el negocio -> SALE_NOT_FOUND y authorize ni se llama', async () => {
  const { store } = await unknownSale();
  let called = false;
  const rec = createReconciler({ store, authorize: async () => { called = true; return true; } });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userB, saleId: IDS.saleA, evidence: BASE_EVIDENCE }), { code: 'SALE_NOT_FOUND' });
  assert.equal(called, false);
});

test('el reconciliador no recibe proveedor: no puede llamar a DTECore', async () => {
  const { store, provider } = await unknownSale();
  const rec = createReconciler({ store, authorize: ALLOW });
  await rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: BASE_EVIDENCE });
  assert.equal(provider.calls, 1, 'solo la emisión original llamó al proveedor');
  assert.deepEqual(Object.keys(rec), ['reconcile']);
});

// ---------------------------------------------------------------------------
// Con autorización explícita
// ---------------------------------------------------------------------------

test('autorizado + evidencia completa: unknown -> issued con folio y evidencia registrada', async () => {
  const { store } = await unknownSale();
  const seen = [];
  const rec = createReconciler({ store, authorize: async (ctx) => { seen.push(ctx); return true; } });
  const r = await rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: BASE_EVIDENCE });
  assert.equal(r.status, 'issued');
  assert.equal(r.folio, 77);
  assert.equal(r.providerCalls, 0);
  assert.equal(store.issuances.get(ROW_A).folio, 77);
  assert.equal(store.evidenceLog.length, 1);
  assert.equal(store.evidenceLog[0].reviewer, 'Juan Pérez');
  assert.equal(seen[0].businessId, IDS.bizA);
  assert.equal(seen[0].actorUserId, IDS.userA);
});

test('autorizado + evidencia "no encontrada" -> failed sin folio', async () => {
  const { store } = await unknownSale();
  const rec = createReconciler({ store, authorize: ALLOW });
  const r = await rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: {
    outcome: 'failed', providerStatus: 'not_found', reviewer: 'Juan', evidenceReference: 'portal-sii-ref-2',
    checkedAt: '2026-10-31T12:05:00Z', reason: 'Buscada por RUT y monto, sin resultados' } });
  assert.equal(r.status, 'failed');
  assert.equal(store.issuances.get(ROW_A).status, 'failed');
});

test('reconciliar solo desde unknown: una venta issued no se reconcilia', async () => {
  const store = createMemoryStore({ masterKey: MASTER });
  store.seed({ businessId: IDS.bizA, userId: IDS.userA, saleId: IDS.saleA });
  const emitter = createFiscalEmitter({ allowedIssuers: TEST_ALLOW_ALL, store, provider: createSimulatedProvider({ scenario: 'ok' }), masterKey: MASTER });
  await emitter.emitSale({ actorUserId: IDS.userA, saleId: IDS.saleA });
  const rec = createReconciler({ store, authorize: ALLOW });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: BASE_EVIDENCE }), { code: 'NOT_UNKNOWN' });
});

test('evidencia insuficiente se rechaza sin escribir', async () => {
  const { store } = await unknownSale();
  const rec = createReconciler({ store, authorize: ALLOW });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: { ...BASE_EVIDENCE, reason: 'corto' } }), { code: 'EVIDENCE_REQUIRED' });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: { ...BASE_EVIDENCE, pdfBase64: '' } }), { code: 'EVIDENCE_INCOMPLETE' });
  await assert.rejects(rec.reconcile({ actorUserId: IDS.userA, saleId: IDS.saleA, evidence: { ...BASE_EVIDENCE, providerStatus: 'not_found' } }), { code: 'EVIDENCE_INVALID' });
  assert.equal(store.issuances.get(ROW_A).status, 'unknown');
  assert.equal(store.evidenceLog.length, 0);
});

// ---------------------------------------------------------------------------
// normalizeEvidence (reglas compartidas con la BD)
// ---------------------------------------------------------------------------

test('normalizeEvidence rechaza base64 mal formado y folio en failed', () => {
  assert.throws(() => normalizeEvidence({ ...BASE_EVIDENCE, xmlBase64: 'no es base64!' }), { code: 'EVIDENCE_INCOMPLETE' });
  assert.throws(() => normalizeEvidence({ ...BASE_EVIDENCE, outcome: 'failed', providerStatus: 'not_found' }), { code: 'EVIDENCE_INVALID' });
  assert.throws(() => normalizeEvidence({ ...BASE_EVIDENCE, checkedAt: 'ayer' }), { code: 'EVIDENCE_REQUIRED' });
  assert.throws(() => normalizeEvidence(null), { code: 'EVIDENCE_REQUIRED' });
});
