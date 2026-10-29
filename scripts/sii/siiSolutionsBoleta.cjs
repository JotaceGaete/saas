// Server-only SII Solutions DTE39 adapter. No HTTP route or issuance authorization here.
// Caller must verify authenticated tenant, issuer, immutable paid sale and durable idempotency.
const API_URL = 'https://api.siisolutions.cl';
function buildBoletaPayload({ businessId, saleId, operatorRut, items, paymentMethod, paidAmount, change = 0, customer }) {
  if (!businessId || !saleId || !operatorRut || !Array.isArray(items) || !items.length)
    throw new Error('Missing validated sale/issuer information');
  if (!Number.isSafeInteger(paidAmount) || paidAmount <= 0 || !Number.isSafeInteger(change) || change < 0)
    throw new Error('Invalid payment amount');
  // Only cash is permitted for this pilot; card voucher tax treatment requires review.
  if (paymentMethod !== 'cash' && paymentMethod !== 'efectivo')
    throw new Error('Unsupported payment method for fiscal pilot');
  const detalles = items.map((item, index) => {
    const precio = item.unitPrice;
    const cantidad = item.quantity;
    if (!Number.isSafeInteger(precio) || precio < 0 || !Number.isSafeInteger(cantidad) || cantidad <= 0 || !item.description)
      throw new Error('Invalid line item');
    const precioSubtotal = precio * cantidad;
    if (!Number.isSafeInteger(precioSubtotal)) throw new Error('Invalid line total');
    return { linea: index + 1, codigo: String(item.sku ?? '').slice(0, 60),
      descripcion: String(item.description).slice(0, 80), precio, cantidad, precioSubtotal,
      esExento: Boolean(item.taxExempt) };
  });
  const total = detalles.reduce((sum, item) => sum + item.precioSubtotal, 0);
  if (!Number.isSafeInteger(total) || total !== paidAmount)
    throw new Error('Sale total does not match payment; discounts/mixed payments require explicit handling');
  return {
    rutOperador: operatorRut,
    idBoletaOperacion: `${businessId}:${saleId}:39`,
    medioPago: 'EF', montoPago: String(paidAmount), vuelto: String(change),
    retornarPdf: true, formatoPdf: '80mm', modoPdfSalida: 'base64',
    retornarXml: true, enviarCorreo: false,
    cliente: customer || { rut: '66666666', digito: '6', razonSocial: 'CLIENTE VARIOS' },
    detalles, referencias: []
  };
}
async function emitirBoleta({ apiKey, payload, signal, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('Missing server-side SII Solutions API key');
  if (!payload?.idBoletaOperacion) throw new Error('Missing idempotency key');
  const response = await fetchImpl(`${API_URL}/dte/boletas/emitir`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(payload), signal
  });
  const data = await response.json().catch(() => null);
  if (response.status === 400) {
    const error = new Error('SII Solutions validation rejected the request');
    error.code = 'PROVIDER_VALIDATION_REJECTED';
    error.status = 400;
    error.details = typeof data?.error === 'string' ? data.error : null;
    throw error;
  }
  if (response.status === 409) {
    if (!Number.isSafeInteger(Number(data?.folioExistente)) || Number(data.folioExistente) <= 0) throw new Error('Conflicting operation without recoverable folio');
    return { status: 'already_issued', folio: Number(data.folioExistente), response: data };
  }
  if (!response.ok || data?.success !== true) {
    const error = new Error(data?.error || `SII Solutions HTTP ${response.status}: unknown result`);
    error.status = response.status;
    throw error;
  }
  return { status: 'submitted', response: data };
}
module.exports = { buildBoletaPayload, emitirBoleta };
