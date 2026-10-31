/**
 * Conservative first-stage manual cash authorization: business owner only.
 * actorId MUST be derived from a server-validated session, never request JSON.
 * Receipt verification also binds the cash payment to the same owner.
 * Delegated cashier roles require a separate permission model.
 */
export function createOwnerCashFiscalAuthorization(admin) {
  if (!admin?.from) throw new Error('Trusted Supabase client required');
  return async function authorizeCashier({
    businessId, invoiceId, actorId, verifyReceipt = false, payment,
  }) {
    if (!businessId || !invoiceId || !actorId) return false;
    const { data: business, error } = await admin.from('wa_businesses')
      .select('id,user_id').eq('id', businessId).maybeSingle();
    if (error || !business || business.user_id !== actorId) return false;
    if (!verifyReceipt) return true;
    if (!payment || payment.business_id !== businessId ||
        payment.invoice_id !== invoiceId || payment.created_by !== actorId ||
        payment.payment_method !== 'cash' || payment.payment_status !== 'received' ||
        payment.voided_at != null) return false;
    return true;
  };
}
