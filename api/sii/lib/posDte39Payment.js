// Translate persisted Walinka payments to DTECore payment codes.
// A mixed-tender sale cannot be represented safely by one inferred code.
const CODES = Object.freeze({
  cash:'EF', card:'TC', debit_card:'TD', credit_card:'TC',
  mercado_pago:'TC'
});
export function resolveDte39PaymentCode(payments, invoiceTotal) {
  if (!Array.isArray(payments) || !payments.length) throw new Error('PAYMENTS_REQUIRED');
  let sum = 0;
  const codes = new Set();
  for (const payment of payments) {
    if (payment.payment_status !== 'received' || payment.voided_at)
      throw new Error('UNCONFIRMED_PAYMENT');
    const amount = Number(payment.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new Error('INVALID_PAYMENT_AMOUNT');
    sum += amount;
    const code = CODES[payment.payment_method];
    if (!code) throw new Error('PAYMENT_METHOD_REQUIRES_MAPPING');
    codes.add(code);
  }
  if (sum !== Number(invoiceTotal)) throw new Error('PAYMENTS_TOTAL_MISMATCH');
  if (codes.size !== 1) throw new Error('MIXED_TENDER_REQUIRES_POLICY');
  return [...codes][0];
}
