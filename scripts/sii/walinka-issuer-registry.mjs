// SERVER ONLY. Requires a trusted database client with access to the private
// fiscal schema. Never call from browser or expose its credentials.
export function createWalinkaIssuerRegistry(db) {
  if (typeof db?.schema !== 'function') throw Error('Private fiscal database client required');
  return {
    async getVerifiedIssuer(businessId) {
      if (typeof businessId !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(businessId))
        throw Error('Invalid business identity');
      const { data, error } = await db.schema('fiscal')
        .from('verified_issuers')
        .select('business_id, issuer_rut, issuer_verified, fiscal_enabled, document_type')
        .eq('business_id', businessId)
        .eq('document_type', 39)
        .maybeSingle();
      if (error) throw Error('Fiscal issuer registry unavailable');
      if (!data || data.business_id !== businessId ||
          data.document_type !== 39) return null;
      return {
        businessId: data.business_id,
        issuerRut: data.issuer_rut,
        issuerVerified: data.issuer_verified === true,
        fiscalEnabled: data.fiscal_enabled === true
      };
    }
  };
}
