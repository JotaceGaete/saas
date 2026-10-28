// SERVER ONLY. Authorization gate before any fiscal folio reservation.
// These adapters must read trusted DB records, never client-supplied ownership claims.
const validId = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,128}$/.test(value);
const validRut = value => typeof value === 'string' && /^[0-9]{1,8}-[0-9K]$/.test(value);

export async function reserveAuthorizedBoleta39({ actorId, businessId, saleId, deps }) {
  if (![actorId, businessId, saleId].every(validId)) throw Error('Invalid fiscal identity');
  if (!deps || ['getBusiness','getSale','canIssue','reserve'].some(key => typeof deps[key] !== 'function'))
    throw Error('Fiscal authorization adapter missing');
  // All three reads MUST use a privileged server-side connection with tenant constraints.
  const business = await deps.getBusiness(businessId);
  if (!business || business.id !== businessId || !validRut(business.issuerRut) ||
      business.fiscalEnabled !== true || business.issuerVerified !== true)
    throw Error('Fiscal issuer not authorized');
  const allowed = await deps.canIssue({ actorId, businessId });
  if (allowed !== true) throw Error('Fiscal actor not authorized');
  const sale = await deps.getSale({ businessId, saleId });
  if (!sale || sale.id !== saleId || sale.businessId !== businessId ||
      sale.issuerRut !== business.issuerRut || sale.fiscalEligible !== true)
    throw Error('Sale not authorized for issuer');
  // The database must independently enforce authorization, idempotency and CAF locks.
  return deps.reserve({ businessId, saleId, issuerRut: business.issuerRut });
}
