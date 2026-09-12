import { formatMoney } from 'utils/formatMoney';
import { columnsForWidth, stripDiacritics } from './renderEscPosReceipt';

// PRINT-2 — arma el Receipt (datos planos, sin React/DOM) de una venta real
// del TPV. Recibe exactamente los mismos datos que CrmTerminal.jsx ya arma
// en `ticketData`/`saleSnapshot` (ver auditoría PRINT-0 y
// CrmThermalTicket.jsx, cuya UI en pantalla usa el mismo modelo) más el
// `business` actual -- no lee nada de Supabase ni recalcula la venta.
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
}) {
  const currency = business?.currency;
  const columns = columnsForWidth(paperWidthMm);
  const money = (n) => formatMoney(n, currency);
  const lines = [];
  const push = (text, opts = {}) => lines.push({ text, ...opts });
  const divider = () => push('-'.repeat(columns));

  push(stripDiacritics(business?.name || 'Mi Negocio').toUpperCase(), { align: 'center', bold: true, double: true });
  // "RUT si existe" -- no hay hoy una columna de RUT fiscal del propio
  // negocio en wa_businesses (ver auditoría PRINT-0); se soporta el campo
  // por si se agrega más adelante, sin asumir que existe.
  if (business?.rut) push(`RUT: ${business.rut}`, { align: 'center' });
  if (business?.address) push(stripDiacritics(business.address), { align: 'center' });
  if (business?.whatsapp) push(business.whatsapp, { align: 'center' });
  push('Terminal de Ventas', { align: 'center' });
  divider();

  const ticketNumber = sale?.invoice_number ? `NV-${pad(sale.invoice_number)}` : `T-${Date.now().toString().slice(-6)}`;
  push(`Ticket: ${ticketNumber}`);
  push(`Fecha: ${formatDateTime(createdAt)}`);
  push(`Cliente: ${stripDiacritics(customer?.name || 'Consumidor final')}`);
  divider();

  for (const item of items) {
    push(`${item.quantity}x ${stripDiacritics(item.name)}`);
    push(`   ${money(item.unit_price)} c/u = ${money(item.unit_price * item.quantity)}`);
    if (item.note) push(`   ${stripDiacritics(item.note)}`);
  }
  divider();

  push(`Subtotal: ${money(subtotal)}`);
  if (discountAmount > 0) push(`Descuento: -${money(discountAmount)}`);
  push(`TOTAL: ${money(total)}`, { bold: true, double: true });
  divider();

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

  push(`Estado: ${paymentState}`, { bold: true });
  if (normalizedPayments.length > 0) {
    push('Pagos:');
    for (const payment of normalizedPayments) {
      push(`  ${PAYMENT_LABELS[payment.method] || payment.method}: ${money(payment.amount)}`);
    }
  } else {
    push(`Forma de pago: ${PAYMENT_LABELS[paymentMethod] || paymentMethod}`);
  }
  push(`Pagado: ${money(paidAmount)}`);
  push(`Pendiente: ${money(pendingAmount)}`);

  if (normalizedPayments.length === 0 && paymentMethod === 'credit') {
    if (initialPaymentAmount != null && initialPaymentAmount > 0) {
      push(`Metodo abono: ${PAYMENT_LABELS[initialPaymentMethod] || initialPaymentMethod || 'No informado'}`);
      push(`Abono: ${money(initialPaymentAmount)}`, { bold: true });
    }
  } else if (normalizedPayments.length === 0) {
    if (amountReceived != null && amountReceived > 0) push(`Pago recibido: ${money(amountReceived)}`);
    if (change != null && change > 0) push(`Vuelto: ${money(change)}`, { bold: true });
  } else if (change != null && change > 0) {
    push(`Vuelto: ${money(change)}`, { bold: true });
  }

  if (notes) {
    divider();
    push('Notas:');
    push(stripDiacritics(notes));
  }

  divider();
  push('Gracias por su compra', { align: 'center' });
  if (business?.printLegend) {
    for (const legendLine of String(business.printLegend).split('\n')) {
      if (legendLine.trim()) push(stripDiacritics(legendLine), { align: 'center' });
    }
  }

  return { lines, feedLines: 4, cut: true };
}
