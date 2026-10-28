// SERVER ONLY. Conservative pilot controls; not tax advice or authorization to issue.
// VAT classification must come from an independently verified fiscal mapping,
// never from client-supplied product flags or inferred CRM line descriptions.
const VALID_METHODS=new Set(['cash','card','debit_card','credit_card','mercado_pago','bank_transfer','check','other']);
export function assessFiscalReconciliation({sale,items,payments,taxClassifications}) {
  const deny=reason=>({eligible:false,reason});
  if (!sale || !Array.isArray(items) || items.length===0) return deny('MISSING_SALE');
  if (!Array.isArray(payments) || payments.length===0) return deny('NO_RECONCILED_PAYMENTS');
  if (payments.some(p=>p.invoice_id!==sale.id ||
      p.payment_status!=='received' || p.voided_at!=null ||
      !VALID_METHODS.has(p.payment_method) ||
      !Number.isSafeInteger(Number(p.amount)) || Number(p.amount)<=0))
    return deny('INVALID_PAYMENT');
  const received=payments.reduce((sum,p)=>sum+Number(p.amount),0);
  if (!Number.isSafeInteger(received) || received!==Number(sale.total))
    return deny('PAYMENT_TOTAL_MISMATCH');
  // Explicit, independently trusted tax mapping per line; missing or
  // mixed/exempt classifications remain blocked until fiscal review.
  if (!Array.isArray(taxClassifications) || taxClassifications.length!==items.length)
    return deny('TAX_MAPPING_MISSING');
  if (taxClassifications.some((t,i)=>t.invoiceItemId!==items[i].id ||
      t.verified!==true || t.category!=='IVA_AFECTO_19'))
    return deny('TAX_MAPPING_UNVERIFIED');
  return {eligible:true,reason:null,received};
}
