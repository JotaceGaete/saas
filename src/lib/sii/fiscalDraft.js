// Pure, non-fiscal draft validation. Never submit this output as a DTE to SII.
export const SII_DOCUMENT_TYPES = Object.freeze({ BOLETA_AFECTA: 39, BOLETA_EXENTA: 41, FACTURA_AFECTA: 33, FACTURA_EXENTA: 34 });

export function normalizeChileanRut(value) {
  const compact = String(value ?? '').replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{1,8}[0-9K]$/.test(compact)) throw new Error('RUT inválido');
  const body = compact.slice(0, -1);
  let sum = 0, factor = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * factor; factor = factor === 7 ? 2 : factor + 1; }
  const remainder = 11 - (sum % 11);
  const dv = remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
  if (compact.at(-1) !== dv) throw new Error('Dígito verificador de RUT inválido');
  return `${Number(body)}-${dv}`;
}

export function createFiscalDraft({ businessId, issuerRut, saleId, paymentMethod, items, currency = 'CLP' }) {
  if (!businessId || !saleId) throw new Error('Falta comercio o identificador de venta');
  if (currency !== 'CLP') throw new Error('El piloto SII solo admite CLP');
  if (!['cash', 'bank_transfer', 'debit_card', 'credit_card', 'mercado_pago'].includes(paymentMethod)) throw new Error('Medio de pago no admitido');
  if (!Array.isArray(items) || items.length === 0) throw new Error('La venta no tiene ítems');
  const normalized = items.map((item) => {
    const quantity = Number(item.quantity), unitPrice = Number(item.unitPrice);
    if (!item.name || !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new Error('Ítem inválido');
    const total = quantity * unitPrice;
    if (!Number.isSafeInteger(total)) throw new Error('Total fuera de rango');
    return { name: String(item.name), quantity, unitPrice, total };
  });
  const total = normalized.reduce((sum, item) => sum + item.total, 0);
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Total inválido');
  return Object.freeze({ businessId, issuerRut: normalizeChileanRut(issuerRut), saleId, paymentMethod, currency, documentType: SII_DOCUMENT_TYPES.BOLETA_AFECTA, items: normalized, total, idempotencyKey: `CL:${businessId}:${saleId}:39`, status: 'draft_only' });
}
