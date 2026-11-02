// Cuerpo de POST /dte/boletas/emitir (DTE Core / SII Solutions) para DTE 39.
//
// CONTRATO VERIFICADO (2026-11-02), en este orden de autoridad:
//  1. XML firmados de las boletas 51105 y 51106, ACEPTADAS por el SII:
//       51106: PrcItem 100, MontoItem 100, MntNeto 84, IVA 16, MntTotal 100.
//       51105: PrcItem 1190, MontoItem 1190, MntNeto 1000, IVA 190, MntTotal 1190.
//     El precio por línea es BRUTO (IVA incluido) y el proveedor calcula neto e IVA.
//  2. El cuerpo que produjo la 51106 (rama feat/boleta-real-unica-20261031,
//     api/_lib/siisolutions-adapter.js): precio bruto, sin folio, sin fecha, sin total,
//     sin sucursal, cliente 66666666-6 "CLIENTE VARIOS".
//  3. Referencia de campos del proveedor (scripts/siisolutions/README.md en esa rama):
//     "gross boleta prices are used"; medioPago EF/PE/TF/CQ/OT; folio opcional.
//
// La versión anterior de este archivo (PR #108) enviaba precio NETO = round(bruto / 1,19) a
// partir de un ejemplo de Postman. Eso contradice los XML aceptados y se corrigió.
// test/contract/accepted-boletas.contract.test.mjs fija el contrato contra esos XML.
//
// Reglas:
//  - El cuerpo replica los campos de la emisión aceptada. No se agregan campos sin evidencia.
//  - Sucursal: la 51106 se aceptó sin sucursal. Solo se envía si el emisor la tiene configurada.
//  - Fecha: no se envía; el proveedor usa la fecha de emisión. La elegibilidad exige que la venta
//    sea del mismo día (hora de Santiago), así la fecha del documento coincide con la venta.

import { FiscalError } from './errors.mjs';

export const MAX_DESCRIPCION = 80;
export const MEDIO_PAGO = Object.freeze({ CASH: 'EF', POINT: 'PE' });

// Receptor de las boletas aceptadas (XML 51105/51106: RUTRecep 66666666-6, CLIENTE VARIOS).
export const CONSUMIDOR_FINAL = Object.freeze({
  rut: '66666666',
  digito: '6',
  razonSocial: 'CLIENTE VARIOS',
});

// Fecha YYYY-MM-DD en hora de Santiago.
export function santiagoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new FiscalError('PAYLOAD_INVALID', 'invalid date');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d);
}

export function buildBoletaPayload({
  operationId,
  rutOperador,
  lines,
  montoPago,
  medioPago,
  sucursal = null,
  cliente = CONSUMIDOR_FINAL,
}) {
  if (!operationId || typeof operationId !== 'string') {
    throw new FiscalError('PAYLOAD_INVALID', 'operationId required');
  }
  if (!/^\d{7,8}-[0-9Kk]$/.test(String(rutOperador ?? ''))) {
    throw new FiscalError('PAYLOAD_INVALID', 'rutOperador must be a RUT like 77804207-K');
  }
  if (!Object.values(MEDIO_PAGO).includes(medioPago)) {
    throw new FiscalError('PAYLOAD_INVALID', `unsupported medioPago ${medioPago}`);
  }
  if (!Number.isSafeInteger(montoPago) || montoPago <= 0) {
    throw new FiscalError('PAYLOAD_INVALID', 'montoPago must be a positive integer');
  }
  if (sucursal != null && (!sucursal.nombre || !sucursal.codigo)) {
    throw new FiscalError('PAYLOAD_INVALID', 'sucursal requires nombre and codigo');
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
    if (l.category !== 'IVA_AFECTO_19' && l.category !== 'EXENTO') {
      throw new FiscalError('FISCAL_TAX_LINES_NOT_VERIFIED', `line ${idx + 1} without verified tax category`);
    }
    // Bruto: lo que paga el cliente (IVA incluido). Es lo que el XML aceptado muestra en PrcItem.
    const subtotal = l.unitPrice * l.quantity;
    if (!Number.isSafeInteger(subtotal)) throw new FiscalError('PAYLOAD_INVALID', `line ${idx + 1} overflow`);
    grossSum += subtotal;
    return {
      linea: idx + 1,
      codigo: String(l.sku ?? ''),
      descripcion,
      DscItem: '',
      precio: l.unitPrice,
      cantidad: l.quantity,
      precioPorcentajeDescuento: 0,
      precioDescuento: 0,
      precioSubtotal: subtotal,
      esExento: l.category === 'EXENTO',
    };
  });

  if (grossSum !== montoPago) {
    throw new FiscalError('PRICE_MISMATCH', `sum of lines ${grossSum} != montoPago ${montoPago}`);
  }

  const body = {
    rutOperador,
    idBoletaOperacion: operationId,
    descuentoGlobal: 0,
    medioPago,
    retornarPdf: true,
    formatoPdf: '80mm',
    modoPdfSalida: 'base64',
    retornarXml: true,
    montoPago: String(montoPago),
    vuelto: '0',
    enviarCorreo: false,
    cliente: { ...cliente },
    detalles,
    referencias: [],
  };
  if (sucursal) {
    body.sucursalEmision = sucursal.nombre;
    body.sucursalCodigo = sucursal.codigo;
  }
  return body;
}

// Totales que el proveedor debería calcular para un cuerpo dado (boleta, precios brutos):
// neto = round(afecto / 1,19), IVA = afecto - neto, total = afecto + exento.
// Coincide con 51105 (1190 -> 1000 + 190) y 51106 (100 -> 84 + 16). Sirve para validar el XML
// devuelto; el proveedor es quien calcula.
export function expectedTotals(payload) {
  let afecto = 0;
  let exento = 0;
  for (const d of payload.detalles) {
    if (d.esExento) exento += d.precioSubtotal;
    else afecto += d.precioSubtotal;
  }
  const neto = Math.round(afecto / 1.19);
  return { neto, iva: afecto - neto, exento, total: afecto + exento };
}
