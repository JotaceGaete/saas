// SII Solutions adapter. Server-side only; never import into browser bundles.
// Fiscal emission remains explicitly disabled until credentials, authorization and
// provider idempotency/folio behavior have been verified.
export const SII_BASE_URL = 'https://api.siisolutions.cl';
export const SII_EMISSION_PATHS = Object.freeze({
  39: '/dte/boletas/emitir',
  41: '/dte/boletas-exentas/emitir',
  33: '/dte/facturas/emitir',
  34: '/dte/facturas-exentas/emitir',
  61: '/dte/notas-credito/emitir',
  56: '/dte/notas-debito/emitir',
});

const integer = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}: expected nonnegative CLP integer`);
  return value;
};

export function buildBoletaPayload(sale) {
  if (!sale || typeof sale !== 'object') throw new Error('Sale required');
  if (!sale.id || typeof sale.id !== 'string') throw new Error('Unique sale id required');
  if (!Array.isArray(sale.items) || !sale.items.length) throw new Error('Sale items required');
  const details = sale.items.map((item, i) => {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Invalid quantity');
    const price = integer(item.unitPrice, 'unitPrice');
    const subtotal = integer(item.subtotal, 'subtotal');
    if (!item.description || typeof item.description !== 'string' || item.description.length > 80) throw new Error('Invalid description');
    // The provider's examples show gross prices for boletas. This assumption
    // MUST be validated against simulation before enabling real emission.
    if (Math.round(price * quantity) !== subtotal) throw new Error('Line subtotal mismatch; discounts not supported in pilot');
    return {
      linea: i + 1,
      codigo: String(item.sku || ''),
      descripcion: item.description,
      DscItem: String(item.longDescription || '').slice(0, 1000),
      precio: price,
      cantidad: quantity,
      precioPorcentajeDescuento: 0,
      precioDescuento: 0,
      precioSubtotal: subtotal,
      esExento: Boolean(item.exempt),
    };
  });
  const total = integer(sale.total, 'total');
  if (details.reduce((sum, d) => sum + d.precioSubtotal, 0) !== total) throw new Error('Sale total does not match lines');
  return {
    idBoletaOperacion: sale.id,
    total,
    descuentoGlobal: 0,
    medioPago: sale.paymentMethod === 'cash' ? 'EF' : 'OT',
    montoPago: String(total),
    vuelto: '0',
    enviarCorreo: false,
    cliente: {
      rut: '66666666',
      digito: '6',
      razonSocial: 'CLIENTE VARIOS',
    },
    detalles: details,
    referencias: [],
  };
}

export async function sendBoletaSimulation({ sale, apiKey, fetchImpl = fetch }) {
  if (process.env.SIISOLUTIONS_EMISSION_ENABLED !== 'simulation') {
    throw new Error('SII Solutions emission disabled: explicit simulation-only gate required');
  }
  if (!apiKey) throw new Error('Missing server-side SII Solutions API key');
  const payload = buildBoletaPayload(sale);
  // No client-supplied URL, folio, operator RUT, issue date or tenant credentials.
  const response = await fetchImpl(`${SII_BASE_URL}${SII_EMISSION_PATHS[39]}`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`SII Solutions HTTP ${response.status}; inspect server logs`);
  if (!body || body.esSimulacion !== true) {
    throw new Error('Provider did not confirm simulation mode; review account settings immediately');
  }
  return { folio: body.folio ?? null, simulated: true, pdfBase64: body.pdfBase64 ?? null, xmlBase64: body.xmlBase64 ?? null };
}
