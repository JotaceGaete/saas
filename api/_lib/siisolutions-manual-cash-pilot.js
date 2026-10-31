import { normalizeCrmFiscalSale } from './siisolutions-crm-bridge.js';
import { createFiscalIssuanceRepository } from './siisolutions-repository.js';
import { issueCheckoutBoleta } from './siisolutions-checkout-issuer.js';
import { createBusinessFiscalIssuerResolver } from './siisolutions-issuer-resolver.js';
import { createFiscalPilotAuthorizationLoader } from './siisolutions-pilot-authorization.js';
import { inspectDteCoreReadiness } from './siisolutions-readiness.js';
import { createOwnerCashFiscalAuthorization } from './siisolutions-owner-cash-authorization.js';

/**
 * Server-only manual cash pilot. No HTTP route is registered here.
 * Cashier permission must be checked against server-trusted identity, never
 * a client-supplied flag. The checkout issuer remains simulation-only.
 */
export function createManualCashFiscalPilot({
  admin, resolveIssuer, authorizeCashier, sandboxBaseUrl, fetchImpl = fetch,
}) {
  if (!admin?.from || !admin?.rpc) throw new Error('Trusted service-role client required');
  if (typeof resolveIssuer !== 'function' || typeof authorizeCashier !== 'function') {
    throw new Error('Issuer resolver and cashier authorization required');
  }
  const repository = createFiscalIssuanceRepository(admin);
  return async function issueManualCash({ businessId, invoiceId, actorId }) {
    if (!businessId || !invoiceId || !actorId) return { state: 'blocked', reason: 'IDENTITY_REQUIRED' };
    const issuer = await resolveIssuer({ businessId });
    if (!issuer || issuer.businessId !== businessId || issuer.authorized !== true ||
        !issuer.operatorRut || !issuer.apiKey) {
      return { state: 'blocked', reason: 'ISSUER_NOT_AUTHORIZED' };
    }
    const allowed = await authorizeCashier({ businessId, invoiceId, actorId });
    if (allowed !== true) return { state: 'blocked', reason: 'CASHIER_NOT_AUTHORIZED' };

    const invoiceResult = await admin.from('crm_invoices').select('*')
      .eq('id', invoiceId).eq('business_id', businessId).maybeSingle();
    if (invoiceResult.error || !invoiceResult.data) return { state: 'blocked', reason: 'INVOICE_NOT_FOUND' };
    const businessResult = await admin.from('wa_businesses').select('id,currency,country_code')
      .eq('id', businessId).maybeSingle();
    if (businessResult.error || businessResult.data?.country_code !== 'CL' ||
        businessResult.data?.currency !== 'CLP') {
      return { state: 'blocked', reason: 'BUSINESS_UNSUPPORTED' };
    }
    const [items, payments] = await Promise.all([
      admin.from('crm_invoice_items').select('*').eq('invoice_id', invoiceId),
      admin.from('crm_payments').select('*').eq('invoice_id', invoiceId).eq('business_id', businessId),
    ]);
    if (items.error || payments.error) return { state: 'blocked', reason: 'SALE_READ_FAILED' };
    const normalized = normalizeCrmFiscalSale({
      invoice: { ...invoiceResult.data, currency: 'CLP' },
      items: items.data, payments: payments.data,
    });
    if (!normalized.ready) return { state: 'blocked', reason: normalized.reason };
    if (normalized.payment.method !== 'cash') return { state: 'blocked', reason: 'CASH_ONLY' };
    const activeCashReceipts = (payments.data || []).filter(p => p.payment_status === 'received' && !p.voided_at && p.payment_method === 'cash');
    if (activeCashReceipts.length !== 1) return { state: 'blocked', reason: 'CASH_RECEIPT_NOT_VERIFIED' };
    // A second explicit authorization must confirm receipt, not merely role.
    const receiptVerified = await authorizeCashier({
      businessId, invoiceId, actorId, verifyReceipt: true,
      payment: activeCashReceipts[0],
    });
    if (receiptVerified !== true) return { state: 'blocked', reason: 'CASH_RECEIPT_NOT_VERIFIED' };
    return issueCheckoutBoleta({
      sale: normalized.sale,
      payment: { ...normalized.payment, received_by_cashier: true },
      businessId, issuerBusinessId: issuer.businessId,
      operatorRut: issuer.operatorRut, apiKey: issuer.apiKey,
      repository, sandboxBaseUrl, fetchImpl,
    });
  };
}

export function createConfiguredManualCashFiscalPilot({
  admin, authorizeCashier, sandboxBaseUrl, fetchImpl = fetch, env = process.env,
}) {
  const resolveIssuer = createBusinessFiscalIssuerResolver({
    loadAuthorization: createFiscalPilotAuthorizationLoader({ env }),
  });
  const pilot = createManualCashFiscalPilot({
    admin, resolveIssuer, authorizeCashier: authorizeCashier ?? createOwnerCashFiscalAuthorization(admin), sandboxBaseUrl, fetchImpl,
  });
  return async args => {
    const readiness = inspectDteCoreReadiness(env);
    if (!readiness.issuerCredentialsConfigured) return { state: 'blocked', reason: readiness.configIssue };
    if (!readiness.simulationEnabled && env.SIISOLUTIONS_EMISSION_ENABLED !== 'live') return { state: 'blocked', reason: 'FISCAL_EMISSION_NOT_ENABLED' };
    return pilot(args);
  };
}
