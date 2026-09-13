import { stripDiacritics } from './renderEscPosReceipt';

// PRINT-2/PRINT-4 — arma el Receipt (datos planos, sin React/DOM, sin
// formatear moneda ni decidir layout) de una venta real del TPV. Recibe
// exactamente los mismos datos que CrmTerminal.jsx ya arma en
// `ticketData`/`saleSnapshot` (ver CrmThermalTicket.jsx, cuya UI en
// pantalla usa el mismo modelo) más el `business` actual -- no lee nada
// de Supabase ni recalcula la venta.
//
// PRINT-4: este builder solo decide QUÉ contenido semántico va en el
// ticket (líneas tipadas con datos crudos: números, strings sin
// formatear). El formato de moneda, el wrap de texto largo, el layout de
// la tabla de ítems y los comandos ESC/POS son responsabilidad exclusiva
// de renderEscPosReceipt.js -- este archivo nunca importa formatMoney ni
// calcula anchos de columna.
//
// No decide nada de impresora/QZ Tray: eso es responsabilidad de
// printService + el PrinterProvider configurado.

const PAYMENT_LABELS = {
  cash: 'Efectivo',
  bank_transfer: 'Transferencia',
  card: 'Tarjeta',
  check: 'Cheque',
  other: 'Otro',
  credit: 'Cuenta corriente',
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

function pad(n) {
  return String(n).padStart(4, '0');
}

function formatDateTime(dt) {
  const d = dt ? new Date(dt) : new Date();
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * @param {Object} params
 * @param {Object} params.business - negocio actual (useAuth().business)
 * @param {Object} [params.sale] - fila devuelta por crm_create_pos_sale
 * @param {Array} [params.items]
 * @param {Object} [params.customer]
 * @param {string} [params.paymentMethod]
 * @param {Array} [params.payments]
 * @param {number} [params.discountAmount]
 * @param {number} [params.subtotal]
 * @param {number} [params.total]
 * @param {number} [params.amountReceived]
 * @param {number} [params.change]
 * @param {number} [params.initialPaymentAmount]
 * @param {string} [params.initialPaymentMethod]
 * @param {number} [params.pendingBalance]
 * @param {string} [params.notes]
 * @param {string} [params.createdAt]
 * @param {number} [params.paperWidthMm]
 * @param {boolean} [params.autoCut] - PRINT-4: si es false, el ticket no pide corte
 * @param {boolean} [params.printLogo] - PRINT-4-BUG1: si es false, nunca se agrega la línea de logo
 * @param {string} [params.imageMode] - PRINT-4-BUG3: id de escPosCapabilities.GRAPHICS_STRATEGIES
 *   (p. ej. 'bitImageEscStar' o 'rasterGsV0') que el renderer usará para el logo. Este builder
 *   solo lo pasa tal cual -- no sabe qué significa ni qué impresora hay detrás.
 * @param {string} [params.cashierName] - PRINT-4: opcional, no hay hoy una fuente establecida para esto en CrmTerminal
 * @returns {import('./renderEscPosReceipt').Receipt}
 */
export function buildSaleReceipt({
  business,
  sale,
  items = [],
  customer,
  paymentMethod = 'efectivo',
  payments = [],
  discountAmount = 0,
  subtotal = 0,
  total = 0,
  amountReceived = null,
  change = null,
  initialPaymentAmount = null,
  initialPaymentMethod = null,
  pendingBalance = null,
  notes,
  createdAt,
  paperWidthMm = 80,
  autoCut = true,
  printLogo = true,
  imageMode,
  cashierName,
}) {
  const currency = business?.currency;
  const lines = [];
  const push = (line) => lines.push(line);

  // Logo -- "recuperar el logo del negocio existente": la única fuente
  // hoy es business.logoUrl (ver waBusinessService.mapBusinessFromDb:
  // logo_url / designSettings.logoUrl). Si no existe, o si falla al
  // cargar/rasterizar, el renderer simplemente omite esta línea -- el
  // ticket igual imprime completo.
  //
  // PRINT-4-BUG1: además de la fuente del logo, se exige `printLogo`
  // (gateado por defecto por printerConfigStorage -- ver ese archivo). En
  // la primera prueba física de PRINT-4, el ticket completo salió
  // ilegible/con símbolos en vez del texto normal: la hipótesis más
  // sólida es que el comando raster GS v 0 no es compatible (o algo en
  // esa cadena rompe el parser) con el equipo probado, y como el logo se
  // imprime PRIMERO, un fallo ahí arrastra el resto del ticket. Hasta
  // validar con la prueba de diagnóstico (ver buildRasterDiagnosticReceipt
  // en renderEscPosReceipt.js) que el raster funciona en el hardware real,
  // queda apagado por defecto -- el código/soporte de imagen se conserva
  // completo, listo para reactivarse por negocio.
  if (business?.logoUrl && printLogo !== false) push({ type: 'logo', url: business.logoUrl });

  push({ text: stripDiacritics(business?.name || 'Mi Negocio').toUpperCase(), align: 'center', bold: true, double: true });
  // "RUT si existe" -- no hay hoy una columna de RUT fiscal del propio
  // negocio en wa_businesses; se soporta el campo por si se agrega más
  // adelante, sin asumir que existe.
  if (business?.rut) push({ text: `RUT: ${business.rut}`, align: 'center' });
  if (business?.address) push({ text: stripDiacritics(business.address), align: 'center' });
  if (business?.whatsapp) push({ text: business.whatsapp, align: 'center' });
  push({ type: 'divider' });

  const ticketNumber = sale?.invoice_number ? `NV-${pad(sale.invoice_number)}` : `T-${Date.now().toString().slice(-6)}`;
  push({ text: `Ticket: ${ticketNumber}` });
  push({ text: `Fecha: ${formatDateTime(createdAt)}` });
  // Cajero -- no hay hoy una fuente establecida (CrmTerminal no maneja
  // identidad de cajero); se soporta como parámetro opcional para no
  // bloquear una futura integración, sin inventar ningún valor por defecto.
  if (cashierName) push({ text: `Cajero: ${stripDiacritics(cashierName)}` });
  push({ text: `Cliente: ${stripDiacritics(customer?.name || 'Consumidor final')}` });
  push({ type: 'divider' });

  if (items.length > 0) {
    push({ type: 'itemsHeader' });
    for (const item of items) {
      push({
        type: 'item',
        qty: item.quantity,
        name: item.name,
        unitPrice: item.unit_price,
        lineTotal: Number(item.unit_price || 0) * Number(item.quantity || 0),
        note: item.note,
        currency,
      });
    }
    push({ type: 'divider' });
  }

  push({ type: 'row', left: 'Subtotal', amount: subtotal, currency });
  if (discountAmount > 0) push({ type: 'row', left: 'Descuento', amount: -discountAmount, currency });
  push({ type: 'total', label: 'TOTAL', amount: total, currency, emphasize: true });
  push({ type: 'divider' });

  const normalizedPayments = (payments || [])
    .map((payment) => ({ method: payment.payment_method || payment.method, amount: Number(payment.amount || 0) }))
    .filter((payment) => payment.amount > 0);
  const paidAmount = normalizedPayments.length > 0
    ? normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0)
    : paymentMethod === 'credit'
      ? Number(initialPaymentAmount || 0)
      : Number(total || 0);
  const pendingAmount = pendingBalance != null
    ? Number(pendingBalance || 0)
    : Math.max(0, Number(total || 0) - paidAmount);
  const paymentState = pendingAmount <= 0 ? 'Pagada' : paidAmount > 0 ? 'Parcial' : 'Pendiente';

  push({ text: `Estado: ${paymentState}`, bold: true });
  if (normalizedPayments.length > 0) {
    push({ text: 'Pagos:' });
    for (const payment of normalizedPayments) {
      push({ type: 'row', left: `  ${PAYMENT_LABELS[payment.method] || payment.method}`, amount: payment.amount, currency });
    }
  } else {
    push({ text: `Forma de pago: ${PAYMENT_LABELS[paymentMethod] || paymentMethod}` });
  }
  push({ type: 'row', left: 'Pagado', amount: paidAmount, currency });
  push({ type: 'row', left: 'Pendiente', amount: pendingAmount, currency });

  if (normalizedPayments.length === 0 && paymentMethod === 'credit') {
    if (initialPaymentAmount != null && initialPaymentAmount > 0) {
      push({ text: `Metodo abono: ${PAYMENT_LABELS[initialPaymentMethod] || initialPaymentMethod || 'No informado'}` });
      push({ type: 'row', left: 'Abono', amount: initialPaymentAmount, currency, bold: true });
    }
  } else if (normalizedPayments.length === 0) {
    if (amountReceived != null && amountReceived > 0) push({ type: 'row', left: 'Pago recibido', amount: amountReceived, currency });
    if (change != null && change > 0) push({ type: 'row', left: 'Vuelto', amount: change, currency, bold: true });
  } else if (change != null && change > 0) {
    push({ type: 'row', left: 'Vuelto', amount: change, currency, bold: true });
  }

  if (notes) {
    push({ type: 'divider' });
    push({ text: 'Notas:' });
    push({ text: stripDiacritics(notes) });
  }

  push({ type: 'divider' });
  push({ text: 'Gracias por su compra', align: 'center' });
  if (business?.printLegend) {
    for (const legendLine of String(business.printLegend).split('\n')) {
      if (legendLine.trim()) push({ text: stripDiacritics(legendLine), align: 'center' });
    }
  }

  return {
    paperWidthMm,
    currency,
    imageMode,
    lines,
    feedLines: 4,
    cut: autoCut !== false,
  };
}

/**
 * PRINT-4-BUG3/BUG5 — ticket de validación física final: ejercita el
 * camino de producción completo (buildSaleReceipt -> renderEscPosReceipt)
 * con datos de una venta sintética (nunca se guarda ni se toca la base de
 * datos), incluyendo logo real del negocio, un producto de nombre corto y
 * uno de nombre largo, pagos (fila "Pagos:" alineada, no solo el resumen),
 * TOTAL destacado en doble ancho y footer -- exactamente lo que pediría
 * confirmar antes de dejar el logo/corte activados para ventas reales.
 * Pensado para el botón de diagnóstico en CrmPrintSettings, no para el
 * flujo de cobro.
 *
 * PRINT-4-BUG5 — los montos se eligieron para cubrir EXACTAMENTE los
 * casos pedidos por la validación de layout ($1.000, $24.000, $999.999,
 * $1.000.000), no para representar una venta realista: subtotal (25.000)
 * menos descuento (1.000) da un TOTAL de $24.000 (el mismo ejemplo del
 * encargo de "TOTAL grande en una sola línea"); el pago de $1.000.000
 * ejercita la fila de "Pagos:" alineada; `change` se fija en $999.999
 * como valor de cobertura para la línea "Vuelto" -- deliberadamente NO es
 * `paidAmount - total` (sería $976.000): este es un ticket de VALIDACIÓN
 * de layout, no una venta real, y ya se etiqueta como tal más abajo.
 */
export function buildFinalValidationReceipt({
  business, paperWidthMm = 80, autoCut = true, printLogo = true, imageMode,
} = {}) {
  return buildSaleReceipt({
    business,
    sale: { invoice_number: 999999 },
    items: [
      { name: 'Cafe', unit_price: 1000, quantity: 1 },
      { name: 'Producto de validacion con nombre largo para probar el ajuste de linea', unit_price: 24000, quantity: 1 },
    ],
    customer: { name: 'Cliente de prueba' },
    paymentMethod: 'cash',
    payments: [{ method: 'cash', amount: 1000000 }],
    discountAmount: 1000,
    subtotal: 25000,
    total: 24000,
    change: 999999,
    pendingBalance: 0,
    notes: 'Ticket de validacion final -- no corresponde a una venta real',
    createdAt: new Date().toISOString(),
    paperWidthMm,
    autoCut,
    printLogo,
    imageMode,
  });
}
