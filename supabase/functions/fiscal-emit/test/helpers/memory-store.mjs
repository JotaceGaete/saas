// Almacén en memoria con la MISMA semántica que las RPC de Postgres (claim, finalize, failed,
// recibos, recuperación, roles). Sirve para probar el orquestador sin base de datos. Las pruebas
// contra la base real están en test/db/ y deben dar los mismos resultados.
//
// Inyección de fallos por método (injectFault):
//   mode 'before' -> error de transporte ANTES de escribir (la escritura no ocurre).
//   mode 'after'  -> la escritura OCURRE y luego la llamada falla (respuesta perdida).
//   mode 'hang'   -> la llamada nunca vuelve (simula caída del proceso en ese punto).

import { FiscalError } from '../../lib/errors.mjs';
import { seal } from '../../lib/secrets.mjs';

export const IDS = Object.freeze({
  userA: 'user-a',
  userB: 'user-b',
  bizA: 'biz-a',
  bizB: 'biz-b',
  saleA: 'sale-a',
  saleB: 'sale-b',
});

const ROLE_RANK = { fiscal_owner: 1, fiscal_operator: 2, fiscal_viewer: 3, fiscal_reconciler: 4 };

export function createMemoryStore({ masterKey, emissionEnabled = true, taxOk = true, now = () => new Date() } = {}) {
  const sales = new Map();
  const businesses = new Map();
  const issuances = new Map();
  const issuers = new Map();
  const lines = new Map();
  const payments = new Map();
  const pointOps = new Map();
  const creds = new Map();
  const roles = new Map(); // `${b}|${u}` -> Set(role)
  const receipts = new Map(); // `${b}|${s}|${op}` -> receipt
  const evidenceLog = [];
  const auditLog = [];
  const retroBlocks = new Set(); // sale ids bloqueadas para emisión retroactiva automática
  const control = { enabled: emissionEnabled };
  const faults = new Map();
  const hooks = new Map(); // method -> fn, se ejecuta una vez antes de la llamada
  const state = { auditFails: false };
  const calls = {};
  const key = (b, s) => `${b}|${s}`;
  const rkey = (b, u) => `${b}|${u}`;

  function seed({ businessId, userId, saleId, total = 2380, cash = true, withLines = true, point = null, active = true, owner = true }) {
    businesses.set(businessId, { id: businessId, userId, countryCode: 'CL', isActive: active });
    sales.set(saleId, {
      id: saleId, businessId, status: 'pagada', paidAt: new Date(), total, discountAmount: 0,
    });
    issuers.set(businessId, {
      issuerRut: '76123456-7', provider: 'dtecore', enabled: true, verified: true,
      sucursal: { nombre: 'SUCURSAL DE PRUEBA', codigo: '1' }, resolucion: { numero: 80, fecha: '2014-08-22' },
    });
    lines.set(saleId, withLines
      ? [{ id: `${saleId}-l1`, name: 'Café', unitPrice: 1190, quantity: total / 1190, discountPct: 0, category: 'IVA_AFECTO_19' }]
      : []);
    payments.set(saleId, cash
      ? [{ method: 'cash', amount: total, status: 'received', voided: false }]
      : point ? [{ method: 'mercado_pago', amount: total, status: 'received', voided: false }] : []);
    pointOps.set(saleId, point ? [point] : []);
    creds.set(businessId, seal({ apiKey: `TEST-KEY-${businessId}` }, { key: masterKey, businessId }));
    // Espejo de la migración: el dueño recibe fiscal_owner al sembrarse el negocio.
    if (owner) grantRole(businessId, userId, 'fiscal_owner');
  }

  function grantRole(b, u, role) {
    const k = rkey(b, u);
    if (!roles.has(k)) roles.set(k, new Set());
    roles.get(k).add(role);
  }

  function revokeRole(b, u, role) {
    roles.get(rkey(b, u))?.delete(role);
  }

  // Ejecuta un método del almacén con la inyección de fallos activa.
  function guard(name, fn) {
    return async (...args) => {
      calls[name] = (calls[name] ?? 0) + 1;
      const hook = hooks.get(name);
      if (hook) {
        hooks.delete(name);
        await hook(...args);
      }
      const f = faults.get(name);
      if (f && f.times > 0) {
        f.times -= 1;
        if (f.mode === 'hang') return new Promise(() => {});
        if (f.mode === 'before') throw new Error(`injected transport failure before ${name}`);
        await fn(...args);
        throw new Error(`injected response lost after ${name}`);
      }
      return fn(...args);
    };
  }

  const stamp = (row) => { row.updatedAt = now(); };

  const claimSale = async (b, s, op) => {
    if (!control.enabled) throw new FiscalError('FISCAL_EMISSION_DISABLED');
    if (retroBlocks.has(s)) throw new FiscalError('FISCAL_RETROACTIVE_BLOCKED');
    const sale = sales.get(s);
    if (!sale || sale.businessId !== b) throw new FiscalError('Invalid fiscal issuance claim');
    const k = key(b, s);
    const cur = issuances.get(k);
    if (!cur) {
      const row = { id: `iss-${k}`, businessId: b, saleId: s, operationId: op, status: 'sending', folio: null, pdfBase64: null };
      stamp(row);
      issuances.set(k, row);
      return true;
    }
    if (cur.status === 'pending' && cur.operationId === op) {
      cur.status = 'sending';
      stamp(cur);
      return true;
    }
    return false;

  };

  const store = {
    seed,
    grantRole,
    revokeRole,
    auditLog,
    blockSale(saleId) { retroBlocks.add(saleId); },
    // Espejo del trigger wa_businesses_owner_change: revoca todo rol del dueño anterior, audita y siembra el nuevo.
    changeOwner(b, newUserId) {
      const biz = businesses.get(b);
      const previous = biz.userId;
      let revoked = 0;
      if (previous != null) {
        const set = roles.get(rkey(b, previous));
        if (set) { revoked = set.size; set.clear(); }
      }
      biz.userId = newUserId;
      auditLog.push({ businessId: b, action: 'owner_changed', outcome: 'previous_owner_revoked', previous, next: newUserId, revoked });
      if (newUserId != null) grantRole(b, newUserId, 'fiscal_owner');
    },
    // Hace fallar la auditoría (transporte) para probar que el reconciliador falla cerrado.
    setAuditFailure(on) { state.auditFails = on; },
    // Ejecuta fn una sola vez justo antes de la próxima llamada a `name` (simula una carrera).
    onNextCall(name, fn) { hooks.set(name, fn); },
    control,
    issuances,
    creds,
    evidenceLog,
    receipts,
    sales,
    calls,
    injectFault(name, { mode = 'before', times = 1 } = {}) {
      faults.set(name, { mode, times });
    },
    clearFaults() { faults.clear(); },
    get masterKey() { return masterKey; },

    // Espejo de public.crm_fiscal_has_role: rol activo exacto en negocio activo.
    hasRole: guard('hasRole', async (b, u, role) => {
      const biz = businesses.get(b);
      if (!biz || biz.isActive === false) return false;
      return roles.get(rkey(b, u))?.has(role) === true;
    }),

    // Espejo de public.crm_fiscal_audit_append (solo-anexar).
    appendAudit: guard('appendAudit', async (entry) => {
      if (state.auditFails) throw new Error('audit store unavailable');
      if (!entry?.businessId || !entry.action || !entry.outcome) throw new FiscalError('Invalid fiscal audit entry');
      auditLog.push({ ...entry });
      return true;
    }),

    loadSaleById: guard('loadSaleById', async (saleId) => {
      const s = sales.get(saleId);
      return s ? { ...s } : null;
    }),

    loadBusiness: guard('loadBusiness', async (bid) => {
      const b = businesses.get(bid);
      return b ? { id: b.id, userId: b.userId, countryCode: b.countryCode } : null;
    }),

    // Espejo de fiscal.actor_role: fila de rol activa en negocio activo; el de mayor privilegio.
    // No mira wa_businesses.user_id: el permiso sale de business_fiscal_roles.
    loadActorRole: guard('loadActorRole', async (b, u) => {
      const biz = businesses.get(b);
      if (!biz || biz.isActive === false) return null;
      const set = roles.get(rkey(b, u));
      if (!set || set.size === 0) return null;
      return [...set].sort((x, y) => ROLE_RANK[x] - ROLE_RANK[y])[0];
    }),

    getIssuance: guard('getIssuance', async (b, s) => {
      const r = issuances.get(key(b, s));
      // Misma forma que mapIssuance (crm_fiscal_get_issuance con la migración E).
      return r ? { ...r, hasXml: Boolean(r.xmlBase64), siiStatus: r.siiStatus ?? 'unverified', siiTrackId: r.siiTrackId ?? null } : null;
    }),

    loadEmissionContext: guard('loadEmissionContext', async (b, s) => {
      const sale = sales.get(s);
      const sameTenant = sale && sale.businessId === b;
      return {
        issuer: issuers.get(b) ?? null,
        emissionEnabled: control.enabled,
        taxLinesVerified: taxOk,
        lines: (lines.get(s) ?? []).map((l) => ({ ...l })),
        payments: sameTenant ? (payments.get(s) ?? []).map((p) => ({ ...p })) : [],
        pointOps: sameTenant ? (pointOps.get(s) ?? []).map((p) => ({ ...p })) : [],
      };
    }),

    loadCredentialRecord: guard('loadCredentialRecord', async (b) => creds.get(b) ?? null),

    claim: guard('claim', claimSale),

    claimWithCredentials: guard('claimWithCredentials', async (b, s, op) => {
      // Espejo de public.crm_fiscal_claim_with_credentials: credenciales y emisor se leen en el mismo paso que el reclamo.
      const c = creds.get(b);
      if (!c) throw new FiscalError('FISCAL_CREDENTIALS_MISSING');
      const iss = issuers.get(b);
      if (!iss || iss.provider !== c.provider) throw new FiscalError('FISCAL_PROVIDER_MISMATCH');
      if (!(await claimSale(b, s, op))) return { claimed: false, credentials: null };
      return { claimed: true, credentials: c };
    }),

    // Espejo de public.crm_fiscal_release_claim: solo sending -> pending con la misma operación.
    releaseClaim: guard('releaseClaim', async (b, s, op) => {
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'sending' || cur.operationId !== op) return false;
      cur.status = 'pending';
      stamp(cur);
      return true;
    }),

    // Espejo de public.crm_fiscal_store_receipt: exige 'sending'; mismo contenido = idempotente.
    storeReceipt: guard('storeReceipt', async (b, s, op, doc) => {
      if (!Number.isSafeInteger(doc?.folio) || doc.folio <= 0 || !op) throw new FiscalError('Invalid fiscal receipt');
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'sending' || cur.operationId !== op) throw new FiscalError('FISCAL_NOT_SENDING');
      const rk = `${b}|${s}|${op}`;
      const prev = receipts.get(rk);
      if (prev) {
        if (prev.folio !== doc.folio || prev.xmlBase64 !== doc.xmlBase64 || prev.pdfBase64 !== doc.pdfBase64) {
          throw new FiscalError('FISCAL_RECEIPT_CONFLICT');
        }
        return true;
      }
      receipts.set(rk, { businessId: b, saleId: s, operationId: op, folio: doc.folio, xmlBase64: doc.xmlBase64, pdfBase64: doc.pdfBase64 });
      return true;
    }),

    finalize: guard('finalize', async (b, s, op, out) => {
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'sending' || cur.operationId !== op) return false;
      if (out.status === 'issued') {
        if (!out.folio || !out.xmlBase64 || !out.pdfBase64) throw new FiscalError('Invalid fiscal outcome');
        Object.assign(cur, { status: 'issued', folio: out.folio, xmlBase64: out.xmlBase64, pdfBase64: out.pdfBase64 });
      } else {
        // Igual que la RPC: unknown conserva el folio informado (pista) y el motivo.
        Object.assign(cur, { status: 'unknown', folio: out.folio ?? null, xmlBase64: null, pdfBase64: null, errorCode: out.errorCode ?? null });
      }
      stamp(cur);
      return true;
    }),

    markFailed: guard('markFailed', async (b, s, op, code) => {
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'sending' || cur.operationId !== op) return false;
      Object.assign(cur, { status: 'failed', errorCode: code });
      stamp(cur);
      return true;
    }),

    // Espejo de public.crm_fiscal_list_stale_sending.
    listStaleSending: guard('listStaleSending', async (before) => {
      return [...issuances.values()]
        .filter((r) => r.status === 'sending' && r.updatedAt && r.updatedAt < before)
        .map((r) => ({
          businessId: r.businessId,
          saleId: r.saleId,
          operationId: r.operationId,
          hasReceipt: receipts.has(`${r.businessId}|${r.saleId}|${r.operationId}`),
        }));
    }),

    // Espejo de public.crm_fiscal_finalize_from_receipt: sin proveedor.
    finalizeFromReceipt: guard('finalizeFromReceipt', async (b, s, op) => {
      const rec = receipts.get(`${b}|${s}|${op}`);
      if (!rec) return false;
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'sending' || cur.operationId !== op) return false;
      Object.assign(cur, { status: 'issued', folio: rec.folio, xmlBase64: rec.xmlBase64, pdfBase64: rec.pdfBase64, errorCode: null });
      stamp(cur);
      return true;
    }),

    // Espejo de public.crm_fiscal_mark_stale_unknown: nunca si hay recibo.
    markStaleUnknown: guard('markStaleUnknown', async (b, s, op, before) => {
      if (receipts.has(`${b}|${s}|${op}`)) return false;
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'sending' || cur.operationId !== op) return false;
      if (!cur.updatedAt || !(cur.updatedAt < before)) return false;
      Object.assign(cur, { status: 'unknown', errorCode: 'STALE_SENDING', folio: null, xmlBase64: null, pdfBase64: null });
      stamp(cur);
      return true;
    }),

    reconcileWithEvidence: guard('reconcileWithEvidence', async (b, s, op, ev) => {
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'unknown' || cur.operationId !== op) return false;
      evidenceLog.push({ businessId: b, saleId: s, operationId: op, ...ev });
      if (ev.outcome === 'issued') {
        Object.assign(cur, { status: 'issued', folio: ev.folio, xmlBase64: ev.xmlBase64, pdfBase64: ev.pdfBase64 });
      } else {
        Object.assign(cur, { status: 'failed', folio: null, xmlBase64: null, pdfBase64: null, errorCode: 'RECONCILED_NOT_FOUND' });
      }
      stamp(cur);
      return true;
    }),
    // Espejo de public.crm_fiscal_reconcile_admin: todo o nada. Las comprobaciones van primero; el
    // cambio de estado y la auditoría 'applied' se escriben juntos, al final. Un fallo de auditoría
    // se lanza antes de tocar nada (como revertir la transacción en la base).
    reconcileAdmin: guard('reconcileAdmin', async (b, s, op, actor, ev) => {
      if (state.auditFails) throw new Error('audit store unavailable');
      if (ev.reviewerUserId !== actor) throw new FiscalError('FISCAL_REVIEWER_MISMATCH');
      const biz = businesses.get(b);
      if (!biz || biz.isActive === false || roles.get(rkey(b, actor))?.has('fiscal_reconciler') !== true) {
        throw new FiscalError('FISCAL_RECONCILIATION_NOT_AUTHORIZED');
      }
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'unknown' || cur.operationId !== op) throw new FiscalError('FISCAL_NOT_RECONCILABLE');
      evidenceLog.push({ businessId: b, saleId: s, operationId: op, ...ev });
      if (ev.outcome === 'issued') {
        Object.assign(cur, { status: 'issued', folio: ev.folio, xmlBase64: ev.xmlBase64, pdfBase64: ev.pdfBase64 });
      } else {
        Object.assign(cur, { status: 'failed', folio: null, xmlBase64: null, pdfBase64: null, errorCode: 'RECONCILED_NOT_FOUND' });
      }
      stamp(cur);
      auditLog.push({ businessId: b, saleId: s, actorUserId: actor, action: 'reconcile_result', outcome: 'applied', detail: { outcome: ev.outcome, folio: ev.folio ?? null } });
      return true;
    }),
  };

  return store;
}
