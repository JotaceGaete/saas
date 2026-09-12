import qz from 'qz-tray';

// PRINT-1 — única capa de Walinka que importa 'qz-tray'. Ningún otro
// módulo (printService, páginas, componentes) debe importar este paquete
// directamente -- siempre a través de printService.js (ver
// providers/printerProvider.js para el contrato que este archivo cumple).
//
// No hay nada específico de marca/modelo acá: qz.printers.find() devuelve
// los nombres tal como los reporta el sistema operativo, y print() envía
// bytes crudos a la impresora que el usuario haya elegido.
//
// Sin certificado firmado (fuera de alcance de PRINT-1), QZ Tray opera en
// modo "no firmado": la propia aplicación de escritorio le pide una vez
// al usuario que confíe en la conexión. No se llama a
// qz.security.setCertificatePromise/setSignaturePromise acá.

function ensureConnected() {
  if (qz.websocket.isActive()) return Promise.resolve();
  return qz.websocket.connect();
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export const qzTrayProvider = {
  isAvailable() {
    return qz.websocket.isActive();
  },

  connect() {
    return ensureConnected();
  },

  disconnect() {
    if (!qz.websocket.isActive()) return Promise.resolve();
    return qz.websocket.disconnect();
  },

  async listPrinters() {
    await ensureConnected();
    const printers = await qz.printers.find();
    return Array.isArray(printers) ? printers : [printers].filter(Boolean);
  },

  async print(printerName, data, options = {}) {
    if (!printerName) throw new Error('Selecciona una impresora antes de imprimir.');
    await ensureConnected();
    const config = qz.configs.create(printerName, { copies: options.copies || 1 });
    await qz.print(config, [{
      type: 'raw',
      format: 'command',
      flavor: 'base64',
      data: toBase64(data),
    }]);
  },
};
