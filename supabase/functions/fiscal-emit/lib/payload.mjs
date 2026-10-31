// Cuerpo de POST /dte/boletas/emitir según el ejemplo oficial de la colección Postman
// (SII Solutions API). Nombres y tipos siguen ese ejemplo: montoPago y vuelto son texto,
// total y descuentoGlobal son números, folio va null (lo asigna el proveedor).
//
// SUPUESTOS PENDIENTES DE CONFIRMAR (no verificados contra un entorno real):
//  - Los precios del TPV son BRUTOS (IVA incluido). El ejemplo oficial muestra precio neto
//    10000 con total 11900 (IVA 19%), así que para líneas IVA_AFECTO_19 se envía precio = neto.
//  - Cliente por defecto (CONSUMIDOR_FINAL) es el del ejemplo; no está confirmado que el
//    proveedor lo acepte como regla. La sucursal NO tiene valor por defecto: es obligatoria.

import { FiscalError } from './errors.mjs';

export const MAX_DESCRIPCION = 80;
export const MEDIO_PAGO = Object.freeze({ CASH: 'EF', POINT: 'PE' });
export const IVA_RATE = 0.19;

export const CONSUMIDOR_FINAL = Object.freeze({
    idCliente: 0,
    rut: '66666666',
    digito: '6',
    razonSocial: 'Consumidor final',
    giro: 'SIN GIRO',
    direccion: '',
    ciudad: '',
    comuna: '',
    contacto: '',
    fono: '',
    email: '',
    cargo: '',
  nombreSucursal: '',
});

// Fecha de emisión YYYY-MM-DD en hora de Santiago (la boleta se emite el día de la venta).
export function santiagoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new FiscalError('PAYLOAD_INVALID', 'invalid paidAt');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d);
}

export function buildBoletaPayload({
  operationId,
  rutOperador,
  lines,
  montoPago,
  medioPago,
  fechaEmision,
  sucursal,
  cliente = CONSUMIDOR_FINAL,
}) {
  if (!operationId || typeof operationId !== 'string') {
    throw new FiscalError('PAYLOAD_INVALID', 'operationId required');
  }
  if (!rutOperador) throw new FiscalError('PAYLOAD_INVALID', 'rutOperador required');
  if (!Object.values(MEDIO_PAGO).includes(medioPago)) {
    throw new FiscalError('PAYLOAD_INVALID', `unsupported medioPago ${medioPago}`);
  }
  if (!Number.isSafeInteger(montoPago) || montoPago <= 0) {
    throw new FiscalError('PAYLOAD_INVALID', 'montoPago must be a positive integer');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaEmision ?? ''))) {
    throw new FiscalError('PAYLOAD_INVALID', 'fechaEmision must be YYYY-MM-DD');
  }
  if (!sucursal?.nombre || !sucursal?.codigo) {
    throw new FiscalError('SUCURSAL_NOT_CONFIGURED', 'sucursal del comercio no configurada');
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new FiscalError('PAYLOAD_INVALID', 'at least one line required');
  }

  let grossSum = 0;
  const detalles = lines.map((l, idx) => {
    const descripcion = String(l.name ?? '').trim();
    if (!descripcion) throw new FiscalError('PAYLOAD_INVALID', `line ${idx + 1} without description`);
    if (descripcion.length > MAX_DESCRIPCION) {
      throw new FiscalError('DESCRIPTION_TOO_LONG', `line ${idx + 1} description exceeds ${MAX_DESCRIPCION}`);
    }
    if (!Number.isSafeInteger(l.unitPrice) || l.unitPrice <= 0) {
      throw new FiscalError('PAYLOAD_INVALID', `line ${idx + 1} price must be a positive integer`);
    }
    if (!Number.isSafeInteger(l.quantity) || l.quantity <= 0) {
      throw new FiscalError('PAYLOAD_INVALID', `line ${idx + 1} quantity must be a positive integer`);
    }
    if (Number(l.discountPct ?? 0) !== 0) {
      throw new FiscalError('DISCOUNT_NOT_SUPPORTED', `line ${idx + 1} has discount`);
    }
    const esExento = l.category === 'EXENTO';
    const subtotal = l.unitPrice * l.quantity; // bruto: lo que paga el cliente
    grossSum += subtotal;
    return {
      linea: idx + 1,
      descripcion,
      DscItem: '',
      precio: esExento ? l.unitPrice : Math.round(l.unitPrice / (1 + IVA_RATE)),
      cantidad: l.quantity,
      precioPorcentajeDescuento: 0,
      precioDescuento: 0,
      precioSubtotal: subtotal,
      esExento,
    };
  });

  if (grossSum !== montoPago) {
    throw new FiscalError('PRICE_MISMATCH', `sum of lines ${grossSum} != montoPago ${montoPago}`);
  }

  return {
    rutOperador,
    idBoletaOperacion: operationId,
    folio: null,
    fechaEmision,
    total: montoPago,
    descuentoGlobal: 0,
    montoPago: String(montoPago),
    vuelto: '0',
    medioPago,
    formatoPdf: '80mm',
    retornarPdf: true,
    retornarXml: true,
    modoPdfSalida: 'base64',
    modoEntrada: 'json',
    enviarCorreo: false,
    sucursalEmision: sucursal.nombre,
    sucursalCodigo: sucursal.codigo,
    cliente,
    detalles,
    referencias: [],
  };
}
