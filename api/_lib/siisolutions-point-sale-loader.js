/**
 * Server-only persisted Point sale reader. Requires a service-role Supabase
 * client instantiated by a trusted worker, never a browser-supplied client.
 * Every lookup is constrained by business and invoice.
 */
export function createPointFiscalSaleLoader(admin) {
  if (!admin?.from) throw new Error('Trusted Supabase client required');
  return async function loadPersisted({ invoiceId, businessId }) {
    if (!invoiceId || !businessId) throw new Error('Missing fiscal sale identity');
    const invoiceResult = await admin.from('crm_invoices')
      .select('*').eq('id', invoiceId).eq('business_id', businessId).maybeSingle();
    if (invoiceResult.error) throw new Error('Could not read fiscal invoice');
    const invoice = invoiceResult.data;
    if (!invoice) return null;

    const [businessResult, itemResult, paymentResult, operationResult] = await Promise.all([
      admin.from('wa_businesses').select('id, currency, country_code').eq('id', businessId).maybeSingle(),
      admin.from('crm_invoice_items').select('*').eq('invoice_id', invoiceId),
      admin.from('crm_payments').select('*').eq('invoice_id', invoiceId)
        .eq('business_id', businessId),
      admin.from('crm_pos_point_operations').select('*')
        .eq('crm_invoice_id', invoiceId).eq('business_id', businessId).limit(2),
    ]);
    if (businessResult.error || itemResult.error || paymentResult.error || operationResult.error) {
      throw new Error('Could not read persisted fiscal sale records');
    }
    // CRM invoices have no currency column. Resolve it from the owning
    // business, and fail closed unless the fiscal pilot currency is CLP.
    if (!businessResult.data || businessResult.data.currency !== 'CLP' ||
        businessResult.data.country_code !== 'CL') {
      return { invoice: null, items: [], payments: [], operation: null };
    }
    invoice.currency = businessResult.data.currency;
    // Multiple Point operations associated with the same invoice require
    // investigation; never select one arbitrarily.
    if (operationResult.data?.length !== 1) return {
      invoice, items: itemResult.data, payments: paymentResult.data,
      operation: null,
    };
    return {
      invoice,
      items: itemResult.data ?? [],
      payments: paymentResult.data ?? [],
      operation: operationResult.data[0],
    };
  };
}
