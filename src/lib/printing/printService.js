import { qzTrayProvider } from './providers/qzTrayProvider';
import { assertPrinterProvider } from './providers/printerProvider';
import { renderEscPosReceipt } from './receipts/renderEscPosReceipt';
import { explainPrinterSetupError, getPrinterSetupSteps } from './printerOnboarding';

// PRINT-1 — única fachada de impresión que el resto de Walinka debe
// conocer. Ninguna página ni servicio de negocio debe importar
// qzTrayProvider ni 'qz-tray' directamente: siempre printService.
//
// El provider concreto es hoy qzTrayProvider, pero printService solo
// depende de la forma PrinterProvider (ver providers/printerProvider.js) --
// sustituirlo a futuro por otro bridge no debería requerir tocar quien
// llama a printService.
const provider = assertPrinterProvider(qzTrayProvider);

export const printService = {
  isAvailable: () => provider.isAvailable(),
  connect: () => provider.connect(),
  disconnect: () => provider.disconnect(),
  listPrinters: () => provider.listPrinters(),

  // Non-destructive setup API for a future guided CRM screen.
  // Never creates a sale, prints a receipt, or changes the printer configuration.
  getSetupSteps: getPrinterSetupSteps,
  explainSetupError: explainPrinterSetupError,
  checkConnection: async () => {
    try {
      const printers = await provider.listPrinters();
      return { ok: true, printers };
    } catch (error) {
      return { ok: false, printers: [], error: explainPrinterSetupError(error) };
    }
  },

  /**
   * @param {import('./receipts/renderEscPosReceipt').Receipt} receipt
   * @param {{ printerName: string, copies?: number }} target
   */
  printReceipt: async (receipt, { printerName, copies } = {}) => {
    // PRINT-4: renderEscPosReceipt es async (el logo requiere cargar y
    // rasterizar una imagen) -- ver receipts/renderEscPosReceipt.js.
    const bytes = await renderEscPosReceipt(receipt);
    return provider.print(printerName, bytes, { copies });
  },
};
