import { assessFiscalReconciliation } from './walinka-fiscal-reconciliation.mjs';
import { assessWalinkaCrmSale } from './walinka-sale-eligibility.mjs';
import { buildFiscalSaleSnapshot } from './fiscal-sale-snapshot.mjs';
// SERVER ONLY. Pilot integration with Walinka's existing tenant and CRM tables.
// This adapter is NOT an HTTP endpoint and does NOT enable fiscal issuance.
// db: server-side Supabase client. issuerRegistry: trusted administrative registry.
// reserve: backend transaction which MUST independently recheck authorization.
export function createWalinkaFiscalAdapter({ db, issuerRegistry, taxMapping, reserve }) {
  if (!db || typeof db.from !== 'function' ||
      typeof issuerRegistry?.getVerifiedIssuer !== 'function' ||
      typeof taxMapping?.getVerifiedLineTaxes !== 'function' || typeof reserve !== 'function') throw Error('Fiscal backend not configured');

  const one = async query => {
    const { data, error } = await query.maybeSingle();
    if (error) throw Error('Fiscal database read failed');
    return data;
  };
  return {
    async getBusiness(businessId) {
      const business = await one(db.from('wa_businesses')
        .select('id, user_id, country_code, is_active')
        .eq('id', businessId));
      if (!business || business.is_active !== true || business.country_code !== 'CL')
        return null;
      // The registry must be controlled by administrators and independently verified.
      const issuer = await issuerRegistry.getVerifiedIssuer(businessId);
      if (!issuer || issuer.businessId !== businessId) return null;
      return {
        id: business.id,
        issuerRut: issuer.issuerRut,
        fiscalEnabled: issuer.fiscalEnabled === true,
        issuerVerified: issuer.issuerVerified === true
      };
    },
    async canIssue({ actorId, businessId }) {
      // Pilot: owner only. Cashiers/collaborators are intentionally denied.
      const business = await one(db.from('wa_businesses')
        .select('id, user_id, country_code, is_active')
        .eq('id', businessId).eq('user_id', actorId));
      return Boolean(business && business.id === businessId &&
        business.user_id === actorId && business.is_active === true &&
        business.country_code === 'CL');
    },
    async getSale({ businessId, saleId }) {
      // CRM invoice is the existing sales document; it is not itself an SII DTE.
      const sale = await one(db.from('crm_invoices')
        .select('id, business_id, status, paid_at, total')
        .eq('id', saleId).eq('business_id', businessId));
      if (!sale || sale.id !== saleId || sale.business_id !== businessId) return null;
      const { data: items, error: itemsError } = await db.from('crm_invoice_items')
        .select('id, invoice_id, quantity, unit_price, subtotal')
        .eq('invoice_id', saleId);
      if (itemsError) throw Error('Fiscal sale items unavailable');
      const assessment = assessWalinkaCrmSale({ sale, items, businessId });
      let reconciliation={eligible:false,reason:'SALE_PRECHECK_FAILED'};
      if(assessment.eligible){
        const {data:payments,error:paymentError}=await db.from('crm_payments')
          .select('invoice_id, amount, payment_method, payment_status, voided_at')
          .eq('invoice_id',saleId);
        if(paymentError || !Array.isArray(payments)) throw Error('Fiscal payments unavailable');
        const taxes=await taxMapping.getVerifiedLineTaxes({businessId,saleId});
        const byId=new Map();
        for(const t of taxes){
          if(t.businessId!==businessId || t.saleId!==saleId || byId.has(t.invoiceItemId))
            throw Error('Inconsistent fiscal tax mapping');
          byId.set(t.invoiceItemId,t);
        }
        reconciliation=assessFiscalReconciliation({sale,items,payments,
          taxClassifications:items.map(i=>byId.get(i.id)).filter(Boolean)});
      }
      // Positive pre-eligibility does NOT mean SII eligibility: VAT treatment,
      // verified issuer binding, reconciled payment and transactional database
      // authorization remain required. Deliberately deny folio reservation.
      return { id: sale.id, businessId: sale.business_id,
        issuerRut: null, fiscalEligible: false,
        preEligible: assessment.eligible, preEligibilityReason: assessment.reason,
        reconciled:reconciliation.eligible,reconciliationReason:reconciliation.reason };
    },
    // Diagnostic-only: caller must supply independently verified, transactionally
    // consistent records. Not connected to production CRM queries yet.
    // Never converts a successful diagnostic into fiscal eligibility.
    assessPreparedSale({ businessId, issuerRut, sale, items, payments, taxes }) {
      return buildFiscalSaleSnapshot({businessId,issuerRut,sale,items,payments,taxes});
    },
    async reserve(args) { return reserve(args); }
  };
}
