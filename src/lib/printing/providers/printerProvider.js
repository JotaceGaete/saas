// PRINT-1 — contrato que debe cumplir cualquier integración de impresión
// térmica (QZ Tray hoy, otro bridge local a futuro). Ninguna otra capa de
// Walinka (printService incluido) debe conocer detalles de una marca o
// modelo de impresora concreto: eso, si acaso, vive dentro de la propia
// implementación del provider (ver qzTrayProvider.js), nunca aquí ni en
// capas superiores.
//
// JS no tiene interfaces reales -- este archivo documenta la forma vía
// JSDoc y expone `assertPrinterProvider` para detectar en tiempo de
// ejecución, con un error claro, un provider incompleto.

/**
 * @typedef {Object} PrinterProvider
 * @property {() => boolean} isAvailable
 *   Indica, de forma síncrona, si hay una conexión activa con el bridge de
 *   impresión en este momento. Nunca intenta conectar.
 * @property {() => Promise<void>} connect
 *   Establece la conexión con el bridge de impresión. Debe ser idempotente:
 *   llamarlo estando ya conectado no debe fallar.
 * @property {() => Promise<void>} disconnect
 *   Cierra la conexión activa, si existe.
 * @property {() => Promise<string[]>} listPrinters
 *   Nombres de las impresoras que el sistema operativo expone al bridge,
 *   tal cual las reporta el propio sistema -- nunca una lista inventada.
 * @property {(printerName: string, data: Uint8Array, options?: Object) => Promise<void>} print
 *   Envía bytes ya renderizados (p. ej. comandos ESC/POS) a la impresora
 *   indicada.
 */

const REQUIRED_METHODS = ['isAvailable', 'connect', 'disconnect', 'listPrinters', 'print'];

/** Valida que `provider` cumple la forma de PrinterProvider; lo devuelve tal cual si es válido. */
export function assertPrinterProvider(provider) {
  const missing = REQUIRED_METHODS.filter((method) => typeof provider?.[method] !== 'function');
  if (missing.length > 0) {
    throw new Error(`PrinterProvider inválido: falta implementar ${missing.join(', ')}.`);
  }
  return provider;
}
