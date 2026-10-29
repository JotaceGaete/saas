// SII Solutions DTE 39 adapter. Server-side only; never import into Vite client code.
// This module does not authorize issuance: callers must validate tenant ownership,
// paid sale, issuer identity, production enablement and durable idempotency first.
const API_URL = 'https://api.siisolutions.cl';
export function buildBoletaPayload({ businessId, saleId, operatorRut, items, paymentMethod, paidAmount, change = 0, customer, branch }) {
  if (!businessId || !saleId || !operatorRut || !Array.isArray(items) || items.length === 0) {
    throw new Error('Missing validated sale/issuer information');
  }
  if (!Number.isSafeInteger(paidAmount) || paidAmount <= 0 || !Number.isSafeInteger(change) || change < 0) {
    throw new Error('Invalid payment amount');
  }
  const medioPago = ({ cash: 'EF', efectivo: 'EF', card: 'PE', tarjeta: 'PE', transfer: 'TF', transferencia: 'TF' })[paymentMethod];
  if (!medioPago) throw new Error('Unsupported payment method');
  const detalles = items.map((item, index) => {
    const precio = Number(item.unitPrice);
    const cantidad = Number(item.quantity);
    if (!Number.isSafeInteger(precio) || precio < 0 || !Number.isSafeInteger(cantidad) || cantidad <= 0 || !item.description) {
      throw new Error('Invalid line item');
    }
    return { linea: index + 1, codigo: String(item.sku ?? '').slice(0, 60), descripcion: String(item.description).slice(0, 80), precio, cantidad, precioSubtotal: precio * cantidad, esExento: Boolean(item.taxExempt) };
  });
  const total = detalles.reduce((sum, item) => sum + item.precioSubtotal, 0);
  if (total !== paidAmount) throw new Error('Sale total does not match payment; discounts/mixed payments require explicit handling');
  return {
    rutOperador: operatorRut,
    idBoletaOperacion: `${businessId}:${saleId}:39`,
    medioPago, montoPago: String(paidAmount), vuelto: String(change),
    retornarPdf: true, formatoPdf: '80mm', modoPdfSalida: 'base64', retornarXml: true,
    enviarCorreo: false, sucursalEmision: branch || undefined,
    cliente: customer || { rut: '66666666', digito: '6', razonSocial: 'CLIENTE VARIOS' },
    detalles, referencias: []
  };
}
export async function emitirBoleta({ apiKey, payload, signal }) {
  if (!apiKey) throw new Error('Missing server-side SII Solutions API key');
  const response = await fetch(`${API_URL}/dte/boletas/emitir`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(payload), signal
  });
  const data = await response.json().catch(() => null);
  if (response.status === 409) return { status: 'already_issued', folio: data?.folioExistente, response: data };
  if (!response.ok || data?.success === false) {
    const error = new Error(data?.error || `SII Solutions HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return { status: 'submitted', response: data };
}
