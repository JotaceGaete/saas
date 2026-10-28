// SERVER ONLY — diagnostic immutable fiscal input, never authorizes issuance.
// Explicit caller-provided records must originate from a consistent locked DB read.
// No signing, folio reservation or XML serialization in this module.
const integer = value => typeof value === 'number' && Number.isSafeInteger(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const deny = reason => ({ok:false,reason});

export function buildFiscalSaleSnapshot({businessId, issuerRut, sale, items, payments, taxes}) {
  if (!text(businessId) || !text(issuerRut) || !sale ||
      sale.business_id !== businessId || !text(sale.id)) return deny('IDENTITY_MISMATCH');
  if (sale.status !== 'pagada' || !text(sale.paid_at) ||
      !integer(sale.total) || sale.total <= 0) return deny('SALE_NOT_SETTLED');
  if (!Array.isArray(items) || items.length === 0 ||
      !Array.isArray(payments) || payments.length === 0 ||
      !Array.isArray(taxes) || taxes.length !== items.length) return deny('INCOMPLETE_DATA');
  const seen = new Set();
  const taxById = new Map();
  for (const t of taxes) {
    if (!t || !text(t.invoiceItemId) || taxById.has(t.invoiceItemId) ||
        t.businessId !== businessId || t.saleId !== sale.id ||
        t.verified !== true || t.category !== 'IVA_AFECTO_19') return deny('UNVERIFIED_TAX');
    taxById.set(t.invoiceItemId,t);
  }
  let total = 0;
  const lines = [];
  for (const i of items) {
    if (!i || !text(i.id) || seen.has(i.id) || i.invoice_id !== sale.id ||
        !text(i.name) || !integer(i.subtotal) || i.subtotal < 0 ||
        typeof i.quantity !== 'number' || !Number.isFinite(i.quantity) || i.quantity <= 0 ||
        !Number.isFinite(i.unit_price) || i.unit_price < 0 ||
        !taxById.has(i.id)) return deny('INVALID_LINE');
    seen.add(i.id);
    total += i.subtotal;
    if (!Number.isSafeInteger(total)) return deny('OVERFLOW');
    lines.push(Object.freeze({id:i.id,name:i.name.trim(),description:typeof i.description === 'string' ? i.description.trim() : null,
      quantity:i.quantity,unitPrice:i.unit_price,subtotal:i.subtotal,
      taxCategory:'IVA_AFECTO_19'}));
  }
  if (total !== sale.total) return deny('LINE_TOTAL_MISMATCH');
  let received = 0;
  for (const p of payments) {
    if (!p || p.invoice_id !== sale.id || p.payment_status !== 'received' ||
        p.voided_at != null || !integer(p.amount) || p.amount <= 0 ||
        !text(p.payment_method)) return deny('INVALID_PAYMENT');
    received += p.amount;
    if (!Number.isSafeInteger(received)) return deny('OVERFLOW');
  }
  if (received !== total) return deny('PAYMENT_TOTAL_MISMATCH');
  // Explicitly excludes buyer RUT, net/IVA and folio until verified fiscal rules exist.
  return Object.freeze({ok:true, fiscalEligible:false, snapshot:Object.freeze({
    businessId,issuerRut,saleId:sale.id,paidAt:sale.paid_at,total,
    lines:Object.freeze(lines),paymentTotal:received
  })});
}
