// SERVER ONLY. Pilot integration with Walinka's existing tenant and CRM tables.
// This adapter is NOT an HTTP endpoint and does NOT enable fiscal issuance.
// db: server-side Supabase client. issuerRegistry: trusted administrative registry.
// reserve: backend transaction which MUST independently recheck authorization.
export function createWalinkaFiscalAdapter({ db, issuerRegistry, reserve }) {
  if (!db || typeof db.from !== 'function' ||
      typeof issuerRegistry?.getVerifiedIssuer !== 'function' ||
      typeof reserve !== 'function') throw Error('Fiscal backend not configured');

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
        .select('id, business_id, status, total')
        .eq('id', saleId).eq('business_id', businessId));
      if (!sale || sale.id !== saleId || sale.business_id !== businessId) return null;
      // Deliberately deny until a trusted fiscal-sale eligibility and issuer
      // binding is implemented; never infer these from client-supplied fields.
      return { id: sale.id, businessId: sale.business_id,
        issuerRut: null, fiscalEligible: false };
    },
    async reserve(args) { return reserve(args); }
  };
}
