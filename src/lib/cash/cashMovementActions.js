// Reimpresión de tickets desde Caja → Movimientos.
//
// Módulo puro (sin React ni red) para que la regla de visibilidad y la clave
// de idempotencia se prueben con node:test y se usen igual en caja abierta y
// cerrada.
//
// Regla de negocio:
// - Solo cobros (`_row_kind === 'payment'`) ligados a una venta TPV real
//   (`invoice.source === 'pos'`) tienen un comprobante que reimprimir.
// - Un cobro anulado no se reimprime.
// - Un movimiento manual, un abono a cuenta corriente o un pago de pedido de
//   catálogo nunca tuvo ticket comercial: no se ofrece reimpresión.
// - La disponibilidad NO depende del estado de la caja. Caja abierta y cerrada
//   muestran lo mismo.

export const REPRINT_LABEL = 'Reimprimir';

/**
 * ¿Mostrar "Reimprimir ticket" en esta fila de movimientos?
 * No recibe el estado de la caja a propósito: la visibilidad no cambia según
 * si la caja está abierta o cerrada.
 */
export function canReprintMovement(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry._row_kind !== 'payment') return false;
  if (entry.voided_at) return false;
  if (!entry.invoice_id) return false;
  // Una venta anulada no es válida: no se reimprime su comprobante.
  if (entry.invoice?.status === 'anulada') return false;
  return entry.invoice?.source === 'pos';
}

/**
 * Clave de idempotencia para UNA reimpresión manual. Cada clic genera una clave
 * nueva: una reimpresión explícita debe salir. El conector solo rechaza claves
 * repetidas mientras estén en `printing` o `sent_to_spooler`.
 *
 * `now` y `nonce` son inyectables para las pruebas.
 */
export function buildReprintKey(invoiceId, { now = Date.now(), nonce = randomNonce() } = {}) {
  if (invoiceId === null || invoiceId === undefined || invoiceId === '') {
    throw new Error('buildReprintKey: falta el id de la venta.');
  }
  return `sale:${invoiceId}:reprint:${now}${nonce}`;
}

function randomNonce() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Mensaje cuando no hay impresora elegida para la ruta activa. Con el conector
 * activado, el mensaje dice que falta elegir impresora en el conector; nunca
 * sugiere cambiar a QZ. Un conector desconectado llega como error del proveedor
 * y se muestra tal cual.
 */
export function reprintBlockedMessage({ route }) {
  if (route === 'local-connector') {
    return 'Walinka Print Connector está activado pero no tiene impresora elegida. Elígela en Configuración de impresión.';
  }
  return 'No hay una impresora configurada en este equipo. Configúrala en Configuración de impresión.';
}
