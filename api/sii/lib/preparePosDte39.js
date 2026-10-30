// Pure preparation gate. No provider calls, no database writes.
export function preparePosDte39({invoice, business, issuer, taxConfig, items, operationId}) {
  if (!invoice?.id || invoice.source !== 'pos' || invoice.status !== 'pagada' || !invoice.paid_at)
    throw new Error('SALE_NOT_PAID');
  if (String(business?.country_code).toUpperCase() !== 'CL')
    throw new Error('NOT_CHILEAN_BUSINESS');
  if (!issuer?.enabled || !issuer?.verified || !issuer?.issuer_rut)
    throw new Error('ISSUER_NOT_VERIFIED');
  if (taxConfig?.confirmed_by_owner !== true || taxConfig?.default_is_exempt !== false)
    throw new Error('TAX_DEFAULT_NOT_CONFIRMED');
  if (!Array.isArray(items) || !items.length) throw new Error('ITEMS_REQUIRED');
  const total = Number(invoice.total);
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('INVALID_TOTAL');
  let sum = 0;
  const mapped = items.map((item) => {
    const unitPrice = Number(item.unit_price);
    const quantity = Number(item.quantity);
    const subtotal = Number(item.subtotal);
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0 ||
        !Number.isInteger(quantity) || quantity <= 0 ||
        !Number.isSafeInteger(subtotal) || subtotal < 0 ||
        !Number.isSafeInteger(unitPrice * quantity) || subtotal > unitPrice * quantity)
      throw new Error('INVALID_ITEM_AMOUNTS');
    sum += subtotal;
    return {
      description: String(item.name || item.description || '').trim(),
      unitPrice, quantity, subtotal,
      discountAmount: unitPrice * quantity - subtotal,
      isExempt: false
    };
  });
  // Global discounts, rounding or mixed tax require explicit reconciliation first.
  if (sum !== total) throw new Error('TOTAL_RECONCILIATION_REQUIRED');
  if (!operationId) throw new Error('OPERATION_ID_REQUIRED');
  return {
    operationId, rutOperador: issuer.issuer_rut,
    fechaEmision: invoice.issue_date,
    total, amountTendered: total,
    paymentCode: 'EF', // Temporary placeholder: replace with verified tender mapping before emission.
    items: mapped
  };
}
