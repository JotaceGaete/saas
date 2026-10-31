import { operationIdForSale } from './siisolutions-issuance-state.js';

/**
 * Detects confirmed Point sales without a fiscal ledger row and REGISTERS them
 * as pending. It never emits: the dependency set deliberately has no emission
 * function. Emission happens later, only from the guarded queue action.
 *
 * Failure policy:
 *  - verification unavailable (MP/DB timeout, thrown error): skipped, retried on
 *    the next sweep; nothing is written.
 *  - verification says not eligible: nothing is written.
 *  - registration is an atomic insert; a concurrent webhook/reconciler/sweep
 *    yields at most one row (unique keys), reported as alreadyRegistered.
 */
export function createPointFiscalSweeper({ listCandidates, verifySale, registerPending }) {
  if (typeof listCandidates !== 'function' || typeof verifySale !== 'function' ||
      typeof registerPending !== 'function') {
    throw new Error('Sweep dependencies required');
  }
  return async function sweep({ limit = 50, dryRun = false } = {}) {
    const max = Math.min(Math.max(1, Number(limit) || 50), 50);
    const report = {
      examined: 0, registered: 0, alreadyRegistered: 0, eligibleDryRun: 0,
      notEligible: 0, verificationUnavailable: 0, failed: 0,
    };
    const candidates = await listCandidates({ limit: max });
    for (const candidate of candidates.slice(0, max)) {
      report.examined++;
      const { businessId, invoiceId } = candidate;
      let verdict;
      try {
        verdict = await verifySale({ businessId, invoiceId });
      } catch {
        report.verificationUnavailable++;
        continue;
      }
      if (!verdict?.ready) {
        report.notEligible++;
        continue;
      }
      if (dryRun) {
        report.eligibleDryRun++;
        continue;
      }
      try {
        const created = await registerPending({
          businessId, saleId: invoiceId,
          operationId: operationIdForSale(businessId, invoiceId), dteType: 39,
        });
        if (created) report.registered++; else report.alreadyRegistered++;
      } catch {
        report.failed++;
      }
    }
    return report;
  };
}

/**
 * Candidate query: Point operations finalized into a sale, minus sales that
 * already have any ledger row. Read-only.
 */
export function createPointSweepCandidateLister(admin, { sinceDays = 14 } = {}) {
  return async function listCandidates({ limit }) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    const { data: ops, error: opsError } = await admin.from('crm_pos_point_operations')
      .select('business_id,crm_invoice_id,created_at')
      .not('crm_invoice_id', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit * 4);
    if (opsError) throw new Error('Unable to list Point operations');
    const pairs = [...new Map((ops || []).map(o => [o.crm_invoice_id, o])).values()];
    if (pairs.length === 0) return [];
    const { data: ledger, error: ledgerError } = await admin.from('crm_fiscal_issuances')
      .select('sale_id')
      .in('sale_id', pairs.map(p => p.crm_invoice_id));
    if (ledgerError) throw new Error('Unable to read fiscal ledger');
    const known = new Set((ledger || []).map(r => r.sale_id));
    return pairs
      .filter(p => !known.has(p.crm_invoice_id))
      .slice(0, limit)
      .map(p => ({ businessId: p.business_id, invoiceId: p.crm_invoice_id }));
  };
}
