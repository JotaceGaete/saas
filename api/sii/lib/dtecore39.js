// Server-only DTECore adapter. Does not emit until called by a reviewed server workflow.
// API reference: DTECore OpenAPI 3.0.3 /dte/boletas/emitir (DTE 39).
// Each DTECore tenant has its own API endpoint. Never assume a shared host.
export function resolveDtecoreBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('DTECORE_BASE_URL_REQUIRED');
  let parsed;
  try { parsed = new URL(value.trim()); } catch { throw new Error('DTECORE_BASE_URL_INVALID'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.pathname !== '/' ||
      parsed.port || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(parsed.hostname))
    throw new Error('DTECORE_BASE_URL_INVALID');
  return parsed.origin;
}
const MONEY = (n, name) => {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0)
    throw new Error('INVALID_' + name);
  return n;
};
const STR = (v) => String(v ?? '').trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RUT = /^\d{7,8}-[0-9Kk]$/;

export function buildDte39Payload(sale) {
  if (!sale || typeof sale !== 'object') throw new Error('SALE_REQUIRED');
  const operationId = STR(sale.operationId);
  const rutOperador = STR(sale.rutOperador).toUpperCase();
  const fechaEmision = STR(sale.fechaEmision);
  if (!operationId || operationId.length > 120) throw new Error('OPERATION_ID_REQUIRED');
  if (!RUT.test(rutOperador)) throw new Error('OPERATOR_RUT_INVALID');
  if (!DATE.test(fechaEmision)) throw new Error('ISSUE_DATE_INVALID');
  if (!Array.isArray(sale.items) || !sale.items.length) throw new Error('ITEMS_REQUIRED');

  const detalles = sale.items.map((item, i) => {
    const descripcion = STR(item.description);
    if (!descripcion) throw new Error('ITEM_DESCRIPTION_REQUIRED');
    const precio = MONEY(item.unitPrice, 'UNIT_PRICE');
    const cantidad = item.quantity;
    if (typeof cantidad !== 'number' || !Number.isFinite(cantidad) || cantidad <= 0)
      throw new Error('QUANTITY_INVALID');
    const precioDescuento = MONEY(item.discountAmount ?? 0, 'DISCOUNT');
    const gross = precio * cantidad;
    const subtotal = item.subtotal ?? gross - precioDescuento;
    if (!Number.isSafeInteger(subtotal) || subtotal < 0 || subtotal > gross ||
        Math.abs(gross - precioDescuento - subtotal) > 0.000001)
      throw new Error('ITEM_SUBTOTAL_MISMATCH');
    // Tax exemption must come from verified product/business tax data, never inferred.
    if (typeof item.isExempt !== 'boolean') throw new Error('TAX_CLASSIFICATION_REQUIRED');
    return {
      linea: i + 1, codigo: STR(item.code) || String(i + 1),
      descripcion, DscItem: '', precio, cantidad,
      precioPorcentajeDescuento: 0, precioDescuento,
      precioSubtotal: subtotal, esExento: item.isExempt,
      UnmdItem: STR(item.unit) || 'UN'
    };
  });
  const total = detalles.reduce((sum, item) => sum + item.precioSubtotal, 0);
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('TOTAL_INVALID');
  if (sale.total !== undefined && sale.total !== total) throw new Error('SALE_TOTAL_MISMATCH');
  const montoPago = MONEY(sale.amountTendered ?? total, 'AMOUNT_TENDERED');
  if (montoPago < total) throw new Error('AMOUNT_TENDERED_INSUFFICIENT');
  const medioPago = STR(sale.paymentCode);
  if (!medioPago) throw new Error('PAYMENT_CODE_REQUIRED');
  return {
    rutOperador, idBoletaOperacion: operationId, folio: null,
    fechaEmision, total, descuentoGlobal: 0,
    montoPago: String(montoPago), vuelto: String(montoPago - total),
    medioPago, formatoPdf: '80mm', disenoPdfCarta: 'diseno2',
    retornarPdf: false, retornarXml: false, modoPdfSalida: 'async',
    modoEntrada: 'json', enviarCorreo: false,
    sucursalEmision: STR(sale.branchName) || 'CASA MATRIZ',
    sucursalCodigo: STR(sale.branchCode) || '1',
    cliente: {
      idCliente: 0, rut: '66666666', digito: '6',
      razonSocial: 'CONSUMIDOR FINAL', giro: '', direccion: '',
      ciudad: '', comuna: '', contacto: '', fono: '', email: '',
      cargo: '', nombreSucursal: ''
    },
    detalles, referencias: []
  };
}

// Must only run after a durable, atomic idempotency claim in Walinka's DB.
// Network timeouts are UNKNOWN outcome, never automatically resend the POST.
export async function emitDte39Claimed({payload, apiKey, baseUrl = process.env.DTECORE_BASE_URL, fetchImpl = fetch}) {
  if (process.env.DTECORE_ENABLE_EMISSION !== 'true')
    throw new Error('DTECORE_EMISSION_DISABLED');
  if (!apiKey || typeof apiKey !== 'string') throw new Error('DTECORE_KEY_MISSING');
  if (!payload?.idBoletaOperacion || !Array.isArray(payload.detalles))
    throw new Error('INVALID_DTE39_PAYLOAD');
  const apiBase = resolveDtecoreBaseUrl(baseUrl);
  const response = await fetchImpl(apiBase + '/dte/boletas/emitir', {
    method: 'POST',
    headers: {'Accept':'application/json','Content-Type':'application/json','X-Api-Key':apiKey},
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error('DTECORE_HTTP_' + response.status);
    error.status = response.status;
    error.code = body?.code || null;
    error.retryAfter = response.headers.get('Retry-After');
    throw error;
  }
  if (!Number.isSafeInteger(body?.folio) || body.folio <= 0)
    throw new Error('DTECORE_RESPONSE_INVALID');
  return {
    folio: body.folio, isSimulation: body.esSimulacion === true,
    pdfStatus: body.pdfEstado || null, documents: body.documentos || null
  };
}
