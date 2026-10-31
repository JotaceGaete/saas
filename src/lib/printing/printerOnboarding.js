/**
 * Commercial printer onboarding: never create a sale or print during discovery.
 * QZ signing validity and QZ trust are separate concerns: a signed request
 * can still be classified as "Untrusted website" by the local QZ Tray.
 */
export function explainPrinterSetupError(error) {
  const message = String(error?.message || error || '');
  if (/certificado qz no configurado|VITE_QZ_CERTIFICATE/i.test(message)) {
    return { code: 'CERTIFICATE_MISSING', title: 'Configuración pendiente en Walinka', action: 'Contacta a soporte. No es necesario modificar tu impresora.' };
  }
  if (/Failed to sign request|firma|signature|signing/i.test(message)) {
    return { code: 'SIGNING_FAILED', title: 'No pudimos verificar la conexión segura', action: 'Vuelve a iniciar sesión y reintenta. Si continúa, contacta a soporte.' };
  }
  if (/denied|rejected|blocked|not allowed|untrusted|unauthorized/i.test(message)) {
    return { code: 'TRUST_REQUIRED', title: 'QZ Tray necesita autorización', action: 'Comprueba que estás en Walinka y autoriza el acceso en QZ Tray. Si vuelve a preguntar, contacta a soporte.' };
  }
  if (/websocket|connect|refused|not running|timeout|closed|ECONNREFUSED/i.test(message)) {
    return { code: 'QZ_UNAVAILABLE', title: 'No encontramos QZ Tray', action: 'Abre QZ Tray en este computador y vuelve a intentar.' };
  }
  return { code: 'PRINTER_ERROR', title: 'No se pudo conectar la impresora', action: 'Comprueba que esté encendida y conectada. Puedes reintentar sin crear otra venta.' };
}

export function getPrinterSetupSteps() {
  return [
    { id: 'qz', title: 'Conectar QZ Tray', detail: 'Instala y abre QZ Tray una sola vez en el computador de caja.' },
    { id: 'trust', title: 'Autorizar Walinka', detail: 'La primera autorización puede ser necesaria. Una firma válida no garantiza confianza automática con un certificado de demostración.' },
    { id: 'printer', title: 'Elegir impresora', detail: 'Selecciona la impresora térmica detectada y guarda la preferencia.' },
    { id: 'test', title: 'Probar ticket y corte', detail: 'Imprime un ticket de prueba, sin cobrar ni registrar una venta.' },
  ];
}
