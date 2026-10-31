// Almacén en memoria con la MISMA semántica que las RPC de Postgres (claim, finalize, failed,
// reconcile). Sirve para probar el orquestador sin base de datos. Las pruebas contra la base
// real están en test/db/ y deben dar los mismos resultados.

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

export function createMemoryStore({ masterKey, emissionEnabled = true, taxOk = true } = {}) {
  const sales = new Map();
  const businesses = new Map();
  const issuances = new Map();
  const issuers = new Map();
  const lines = new Map();
  const payments = new Map();
  const pointOps = new Map();
  const creds = new Map();
  const control = { enabled: emissionEnabled };
  const key = (b, s) => `${b}|${s}`;

  function seed({ businessId, userId, saleId, total = 2380, cash = true, withLines = true, point = null }) {
    businesses.set(businessId, { id: businessId, userId, countryCode: 'CL' });
    sales.set(saleId, {
      id: saleId, businessId, status: 'pagada', paidAt: new Date(), total, discountAmount: 0,
    });
    issuers.set(businessId, { issuerRut: '76123456-7', enabled: true, verified: true });
    lines.set(saleId, withLines
      ? [{ id: `${saleId}-l1`, name: 'Café', unitPrice: 1190, quantity: total / 1190, discountPct: 0, category: 'IVA_AFECTO_19' }]
      : []);
    payments.set(saleId, cash ? [{ method: 'cash', amount: total, status: 'received', voided: false }] : []);
    pointOps.set(saleId, point ? [point] : []);
    creds.set(businessId, seal({ apiKey: `TEST-KEY-${businessId}` }, { key: masterKey, businessId }));
  }

  return {
    seed,
    control,
    issuances,
    creds,
    sales,
    get masterKey() { return masterKey; },

    async loadSaleById(saleId) {
      const s = sales.get(saleId);
      return s ? { ...s } : null;
    },
    async loadBusiness(bid) {
      const b = businesses.get(bid);
      return b ? { ...b } : null;
    },
    async getIssuance(b, s) {
      const r = issuances.get(key(b, s));
      return r ? { ...r } : null;
    },
    async loadEmissionContext(b, s) {
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
    },
    async loadCredentialRecord(b) { return creds.get(b) ?? null; },

    async claim(b, s, op) {
      if (!control.enabled) throw new FiscalError('FISCAL_EMISSION_DISABLED');
      const sale = sales.get(s);
      if (!sale || sale.businessId !== b) throw new FiscalError('Invalid fiscal issuance claim');
      const k = key(b, s);
      const cur = issuances.get(k);
      if (!cur) {
        issuances.set(k, { id: `iss-${k}`, businessId: b, saleId: s, operationId: op, status: 'sending', folio: null, pdfBase64: null });
        return true;
      }
      if (cur.status === 'pending' && cur.operationId === op) {
        cur.status = 'sending';
        return true;
      }
      return false;
    },

    async finalize(b, s, op, out) {
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'sending' || cur.operationId !== op) return false;
      if (out.status === 'issued') {
        if (!out.folio || !out.xmlBase64 || !out.pdfBase64) throw new FiscalError('Invalid fiscal outcome');
        Object.assign(cur, { status: 'issued', folio: out.folio, xmlBase64: out.xmlBase64, pdfBase64: out.pdfBase64 });
      } else {
        Object.assign(cur, { status: 'unknown', folio: null, xmlBase64: null, pdfBase64: null });
      }
      return true;
    },

    async markFailed(b, s, op, code) {
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'sending' || cur.operationId !== op) return false;
      Object.assign(cur, { status: 'failed', errorCode: code });
      return true;
    },

    async reconcile(b, s, op, ev) {
      const cur = issuances.get(key(b, s));
      if (!cur || cur.status !== 'unknown' || cur.operationId !== op) return false;
      Object.assign(cur, { status: 'issued', folio: ev.folio, xmlBase64: ev.xmlBase64, pdfBase64: ev.pdfBase64 });
      return true;
    },
  };
}
