// Construcción del cuerpo para DTECore POST /dte/boletas/emitir.
// Campos y nombres según el informe de integración (reportado, NO verificado contra la
// documentación oficial). Ver F2 §5. No se envía folio ni fechaEmision: los asigna el proveedor.

import { FiscalError } from './errors.mjs';

export const MAX_DESCRIPCION = 80;
export const MEDIO_PAGO = Object.freeze({ CASH: 'EF', POINT: 'PE' });

export function buildBoletaPayload({ operationId, rutOperador, lines, montoPago, medioPago }) {
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
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new FiscalError('PAYLOAD_INVALID', 'at least one line required');
  }

  let sum = 0;
  const detalles = lines.map((l, idx) => {
    const descripcion = String(l.name ?? '').trim();
    if (!descripcion) throw new FiscalError('PAYLOAD_INVALID', `line ${idx + 1} without description`);
    if (descripcion.length > MAX_DESCRIPCION) {
      // Decisión pendiente del owner: rechazar (aquí) vs truncar. Por defecto se rechaza.
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
    sum += l.unitPrice * l.quantity;
    return {
      linea: idx + 1,
      descripcion,
      precio: l.unitPrice,
      cantidad: l.quantity,
      esExento: l.category === 'EXENTO',
    };
  });

  if (sum !== montoPago) {
    throw new FiscalError('PRICE_MISMATCH', `sum of lines ${sum} != montoPago ${montoPago}`);
  }

  return {
    rutOperador,
    idBoletaOperacion: operationId,
    detalles,
    medioPago,
    montoPago,
    retornarPdf: true,
    formatoPdf: '80mm',
    modoPdfSalida: 'base64',
    retornarXml: true,
    enviarCorreo: false,
  };
}
