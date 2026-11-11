// Secondary server-side kill switch. Database claim gate remains authoritative.
// An environment variable alone can never enable fiscal issuance.
export function loadDte39WorkerControl(env = process.env) {
 return {
  enabled:env.DTECORE_ENABLE_EMISSION==='true' &&
    env.FISCAL_DTE39_WORKER_APPROVED==='true',
  payment_voucher_policy_approved:env.FISCAL_DTE39_VOUCHER_POLICY_APPROVED==='true'
 };
}
