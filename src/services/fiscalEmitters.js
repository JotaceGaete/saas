// Emisores que usa el flujo automático de boleta del TPV (fiscalSaleFlow).
// Misma interfaz para los dos:
//   status(saleId, sale) -> { ok, data: { state, folio, canEmit, blockedReason, siiStatus } } | { ok:false, code }
//   emit(saleId, sale)   -> { ok, status, folio } | { ok:false, status, code }
//   loadDte(saleId)      -> Uint8Array con el XML firmado (solo si state = issued)
//
// - live: la Edge Function fiscal-emit (DTE Core) y /api/fiscal/download. El
//   servidor es la fuente de verdad: reclamo atómico, una fila por venta,
//   unknown nunca se reintenta.
// - simulated: solo para Preview. Ninguna red, ningún folio real. Guarda un
//   libro local en este navegador con las mismas reglas (una boleta por
//   venta, unknown bloquea, la reimpresión no crea folio).

import { supabase } from '../lib/supabase';
import { emitFiscalSale, getFiscalSaleStatus } from './fiscalEmitService';
import { buildSimulatedDteXml, saleItemsToDteLines, SIMULATED_FOLIO_RANGE } from '../lib/fiscal/dte/simulatedDte';

export function createLiveEmitter({ businessId, fetchImpl = (...a) => fetch(...a), client = supabase } = {}) {
  return Object.freeze({
    mode: 'live',
    status: (saleId) => getFiscalSaleStatus(saleId),
    emit: (saleId) => emitFiscalSale(saleId),
    async loadDte(saleId) {
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw Object.assign(new Error('Debes iniciar sesión.'), { code: 'AUTH_REQUIRED' });
      const params = new URLSearchParams({ businessId, invoiceId: saleId, format: 'xml' });
      const res = await fetchImpl(`/api/fiscal/download?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
      });
      if (!res.ok) throw Object.assign(new Error('No se pudo descargar el XML de la boleta.'), { code: 'XML_DOWNLOAD_FAILED' });
      return new Uint8Array(await res.arrayBuffer());
    },
  });
}

// ---------------------------------------------------------------------------
// Simulación (Preview)

export const SIM_SCENARIO_STORAGE_KEY = 'walinka:fiscal-sim:scenario';
export const SIM_SCENARIOS = Object.freeze(['ok', 'unknown', 'rejected']);

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function safeStorage(storage) {
  return {
    get(key) { try { const raw = storage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; } },
    set(key, value) { try { storage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ } },
  };
}

function latin1Bytes(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/** Mismas reglas de elegibilidad que el servidor (lib/eligibility.mjs) que se pueden ver en el TPV. */
export function simulatedEligibility(sale = {}) {
  if (!sale || !Array.isArray(sale.items) || sale.items.length === 0) return 'SALE_NOT_FOUND';
  if (Number(sale.pendingBalance || 0) > 0) return 'SALE_NOT_ELIGIBLE';
  if (Number(sale.discountAmount || 0) > 0) return 'DISCOUNT_NOT_SUPPORTED';
  const payments = Array.isArray(sale.payments) ? sale.payments.filter((p) => Number(p?.amount) > 0) : [];
  if (payments.length === 0) return 'NO_CONFIRMED_PAYMENT';
  if (payments.length > 1) return 'MIXED_PAYMENTS';
  const lines = saleItemsToDteLines(sale.items);
  const sum = lines.reduce((a, l) => a + l.monto, 0);
  if (sum !== Math.round(Number(sale.total || 0))) return 'PAYMENT_AMOUNT_MISMATCH';
  return null;
}

/**
 * @param {{ businessId: string, storage?: Storage, scenario?: () => string, now?: () => Date, subtle?: SubtleCrypto }} opts
 */
export function createSimulatedEmitter({ businessId, storage, scenario, now = () => new Date(), subtle } = {}) {
  const store = safeStorage(storage || globalThis.localStorage || memoryStorage());
  const ledgerKey = `walinka:fiscal-sim:ledger:${businessId}`;
  const readLedger = () => store.get(ledgerKey) || { nextFolio: SIMULATED_FOLIO_RANGE.desde, sales: {} };
  const pickScenario = () => {
    const s = scenario ? scenario() : store.get(SIM_SCENARIO_STORAGE_KEY);
    return SIM_SCENARIOS.includes(s) ? s : 'ok';
  };
  let calls = 0;

  function view(row, sale) {
    if (!row) {
      const blockedReason = simulatedEligibility(sale);
      return { state: 'none', folio: null, canEmit: !blockedReason, blockedReason, siiStatus: null, simulated: true };
    }
    return { state: row.state, folio: row.folio ?? null, canEmit: false, blockedReason: null, siiStatus: row.state === 'issued' ? 'unverified' : null, errorCode: row.errorCode ?? null, simulated: true };
  }

  return Object.freeze({
    mode: 'simulated',
    get providerCalls() { return calls; },
    async status(saleId, sale) {
      return { ok: true, data: view(readLedger().sales[saleId], sale) };
    },
    async emit(saleId, sale) {
      const ledger = readLedger();
      const existing = ledger.sales[saleId];
      // Igual que el reclamo atómico del servidor: una venta con fila no vuelve a emitir.
      if (existing) {
        if (existing.state === 'issued') return { ok: false, status: 'issued', code: 'ALREADY_ISSUED', folio: existing.folio };
        return { ok: false, status: existing.state, code: existing.state === 'failed' ? 'PROVIDER_REJECTED' : 'UNKNOWN_REQUIRES_RECONCILIATION' };
      }
      const blocked = simulatedEligibility(sale);
      if (blocked) return { ok: false, status: 'error', code: blocked };
      calls += 1;
      const sc = pickScenario();
      if (sc === 'rejected') {
        ledger.sales[saleId] = { state: 'failed', errorCode: 'SIM_REJECTED', at: now().toISOString() };
        store.set(ledgerKey, ledger);
        return { ok: false, status: 'failed', code: 'PROVIDER_REJECTED' };
      }
      const folio = ledger.nextFolio;
      if (folio > SIMULATED_FOLIO_RANGE.hasta) return { ok: false, status: 'error', code: 'SIM_FOLIO_RANGE' };
      ledger.nextFolio = folio + 1;
      const xml = await buildSimulatedDteXml({ folio, lines: saleItemsToDteLines(sale.items), subtle });
      // 'unknown': el "proveedor" emitió pero la respuesta se perdió. El folio
      // y el XML quedan guardados para que la conciliación los recupere sin
      // emitir de nuevo (igual que el reconciliador del servidor).
      ledger.sales[saleId] = sc === 'unknown'
        ? { state: 'unknown', pendingFolio: folio, pendingXml: xml, errorCode: 'SIM_RESPONSE_LOST', at: now().toISOString() }
        : { state: 'issued', folio, xml, at: now().toISOString() };
      store.set(ledgerKey, ledger);
      if (sc === 'unknown') return { ok: false, status: 'unknown', code: 'UNKNOWN_REQUIRES_RECONCILIATION' };
      return { ok: true, status: 'issued', folio };
    },
    /** Conciliación simulada: resuelve un 'unknown' con el documento que el proveedor sí emitió. Nunca emite. */
    async reconcile(saleId) {
      const ledger = readLedger();
      const row = ledger.sales[saleId];
      if (!row || row.state !== 'unknown') return { ok: false, code: 'NOTHING_TO_RECONCILE' };
      ledger.sales[saleId] = { state: 'issued', folio: row.pendingFolio, xml: row.pendingXml, at: row.at, reconciledAt: now().toISOString() };
      store.set(ledgerKey, ledger);
      return { ok: true, folio: row.pendingFolio };
    },
    async loadDte(saleId) {
      const row = readLedger().sales[saleId];
      if (!row || row.state !== 'issued' || !row.xml) throw Object.assign(new Error('No hay boleta emitida.'), { code: 'XML_DOWNLOAD_FAILED' });
      return latin1Bytes(row.xml);
    },
  });
}
