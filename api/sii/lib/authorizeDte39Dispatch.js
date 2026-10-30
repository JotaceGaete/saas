// Pure authorization boundary for a future fiscal worker.
// Never take provider credentials from a browser request or an invoice snapshot.
export function authorizeDte39Dispatch({job, control, issuer, credentials}) {
  if (!job || job.document_type !== 39 || job.state !== 'claimed' ||
      !job.id || !job.business_id || !job.operation_id)
    throw new Error('DTE39_CLAIM_REQUIRED');
  if (control?.enabled !== true || control?.payment_voucher_policy_approved !== true)
    throw new Error('FISCAL_DISPATCH_DISABLED');
  if (issuer?.business_id !== job.business_id || issuer?.enabled !== true ||
      issuer?.verified !== true)
    throw new Error('ISSUER_NOT_VERIFIED');
  if (credentials?.business_id !== job.business_id ||
      !credentials?.apiKey || !credentials?.baseUrl)
    throw new Error('DTECORE_TENANT_CREDENTIALS_REQUIRED');
  return {operationId:job.operation_id,businessId:job.business_id,
    apiKey:credentials.apiKey,baseUrl:credentials.baseUrl};
}
