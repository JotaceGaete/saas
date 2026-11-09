// Reglas de elegibilidad de una venta para emitir DTE 39. Pura: recibe los datos ya leídos.
// Las mismas condiciones se re-validan en crm_claim_fiscal_issuance bajo bloqueo; esto da
// un error temprano y explícito antes de tocar el ledger.

import { FiscalError } from './errors.mjs';
import { MEDIO_PAGO, buildBoletaPayload, santiagoDate } from './payload.mjs';

const MP_METHOD = 'mercado_pago';

export function evaluateEligibility({
  sale,
  business,
  issuer,
  emissionEnabled,
  taxLinesVerified,
  lines,
  payments,
  pointOps,
  operationId,
  now = new Date(),
}) {
  if (!sale || sale.status !== 'pagada' || !sale.paidAt || !(Number(sale.total) > 0)) {
    throw new FiscalError('SALE_NOT_ELIGIBLE');
  }
  // Solo ventas del día (hora de Santiago). La boleta lleva la fecha de emisión que pone el
  // proveedor; emitirla otro día la desfasaría de la venta. Además protege las ventas históricas
  // (incluidas las ventas Point anteriores): nunca se emiten boletas retroactivas desde el TPV.
  if (santiagoDate(sale.paidAt) !== santiagoDate(now)) {
    throw new FiscalError('SALE_NOT_SAME_DAY');
  }
  if (!business || business.countryCode !== 'CL') {
    throw new FiscalError('COUNTRY_NOT_SUPPORTED');
  }
  if (!issuer || !issuer.enabled || !issuer.verified || !issuer.issuerRut) {
    throw new FiscalError('FISCAL_ISSUER_NOT_ENABLED');
  }
  // C1 (migración H): antes de la primera emisión con esta API key y este RUT, el propietario debe
  // confirmar expresamente el RUT. La base lo vuelve a exigir al pasar a sending.
  if (issuer.rutConfirmed !== true) {
    // Sin credenciales el motivo accionable es conectar la cuenta, no confirmar el RUT.
    throw new FiscalError(issuer.rutConfirmationReason === 'credentials_missing'
      ? 'CREDENTIALS_MISSING' : 'FISCAL_RUT_NOT_CONFIRMED');
  }
  if (!emissionEnabled) {
    throw new FiscalError('FISCAL_EMISSION_DISABLED');
  }
  // Tratamiento tributario (migración G). Solo DTE 39 con todas las líneas afectas: las líneas
  // exentas o no afectas (IndExe = 1) no están verificadas con DTE Core, y una venta exenta
  // corresponde a la boleta 41, que esta integración no emite. Sin categoría no se emite.
  const categories = (lines ?? []).map((l) => l?.category ?? null);
  if (categories.length === 0 || categories.some((c) => c == null)) {
    throw new FiscalError('FISCAL_TAX_LINES_NOT_VERIFIED');
  }
  if (categories.some((c) => c === 'EXENTO' || c === 'NO_AFECTO')) {
    throw new FiscalError('FISCAL_NON_TAXABLE_NOT_SUPPORTED');
  }
  if (!taxLinesVerified || categories.some((c) => c !== 'IVA_AFECTO_19')) {
    throw new FiscalError('FISCAL_TAX_LINES_NOT_VERIFIED');
  }
  if (Number(sale.discountAmount ?? 0) !== 0) {
    throw new FiscalError('DISCOUNT_NOT_SUPPORTED');
  }

  const total = Number(sale.total);
  const active = (payments ?? []).filter((p) => p.status === 'received' && !p.voided);
  const cash = active.filter((p) => p.method === 'cash');
  const other = active.filter((p) => p.method !== 'cash');
  const point = pointOps ?? [];

  // Misma lógica y mismos códigos que sale_payment_medio() en SQL (paridad probada en test/db).
  let medioPago;
  if (cash.length > 0 && (other.length > 0 || point.length > 0)) {
    throw new FiscalError('MIXED_PAYMENTS');
  }
  if (cash.length > 0) {
    const cashSum = cash.reduce((a, p) => a + Number(p.amount), 0);
    if (cashSum !== total) throw new FiscalError('PAYMENT_AMOUNT_MISMATCH');
    medioPago = MEDIO_PAGO.CASH;
  } else if (point.length > 0) {
    if (point.length !== 1) throw new FiscalError('POINT_NOT_CONFIRMED');
    const p = point[0];
    const confirmed =
      p.mpStatus === 'processed' &&
      p.finalizedAt &&
      p.mpOrderId &&
      p.mpPaymentId &&
      p.currency === 'CLP' &&
      Number(p.amount) === total;
    if (!confirmed) throw new FiscalError('POINT_NOT_CONFIRMED');
    // Forma real en producción: el cobro Point queda como crm_payments.payment_method = 'mercado_pago'.
    const mp = other.filter((q) => q.method === MP_METHOD);
    if (other.length !== mp.length) throw new FiscalError('UNSUPPORTED_PAYMENT_METHOD');
    const mpSum = mp.reduce((a, q) => a + Number(q.amount), 0);
    if (mp.length !== 1 || mpSum !== total) throw new FiscalError('PAYMENT_AMOUNT_MISMATCH');
    medioPago = MEDIO_PAGO.POINT;
  } else {
    throw new FiscalError('NO_CONFIRMED_PAYMENT');
  }

  // Construye (y valida) el payload; cualquier descripción >80 o precio no entero falla aquí.
  const payload = buildBoletaPayload({
    operationId,
    rutOperador: issuer.issuerRut,
    lines,
    montoPago: total,
    medioPago,
    sucursal: issuer?.sucursal ?? null,
  });
  return { medioPago, montoPago: total, payload };
}
