/**
 * Commercial printer onboarding: never create a sale or print during discovery.
 *
 * Classifies errors raised by qzTrayProvider and by QZ Tray itself. Rules are
 * ordered: the first match wins, so more specific causes come before generic ones.
 *
 * Important: QZ Tray replaces every signing rejection with the generic
 * "Failed to sign request" (see PRINT-3A-BUG1 in qzTrayProvider.js). That message
 * does NOT tell us whether the cause was the signature, the network, or the user
 * denying trust, so it maps to SIGNATURE_UNCONFIRMED and never to TRUST_REQUIRED.
 */

const RULES = [
  {
    // qzTrayProvider: deployment config missing (certificate, Supabase URL or publishable key).
    code: 'CONFIG_MISSING',
    match: /falta configurar|certificado qz no configurado|VITE_QZ_CERTIFICATE/i,
    title: 'Configuración pendiente en Walinka',
    action: 'Contacta a soporte. No es necesario modificar tu impresora.',
  },
  {
    // requestQzSignature(): no session token, or the qz-sign function answered 401.
    code: 'SESSION_REQUIRED',
    match: /sesión válida|^no autorizado$/i,
    title: 'Tu sesión en Walinka expiró',
    action: 'Vuelve a iniciar sesión y reintenta.',
  },
  {
    // requestQzSignature(): fetch threw before any HTTP response (offline, DNS, CORS preflight).
    code: 'NETWORK_ERROR',
    match: /no se pudo contactar el servicio de firma|failed to fetch|networkerror|network request failed/i,
    title: 'No pudimos contactar el servicio de firma',
    action: 'Revisa la conexión a internet de este computador y reintenta.',
  },
  {
    // qz-sign answered with an error body or an invalid response (server-side problem).
    code: 'SIGNING_SERVICE_ERROR',
    match: /servicio de firma|no se pudo firmar|firma inválida|respuesta inválida|origen no permitido/i,
    title: 'El servicio de firma de Walinka respondió con error',
    action: 'Reintenta en unos minutos. Si continúa, contacta a soporte.',
  },
  {
    // QZ Tray is not running or its WebSocket cannot be reached.
    code: 'QZ_UNAVAILABLE',
    match: /websocket|econnrefused|connection refused|not running|timed? ?out|connection closed/i,
    title: 'No encontramos QZ Tray',
    action: 'Abre QZ Tray en este computador y vuelve a intentar.',
  },
  {
    // The user (or QZ policy) explicitly rejected the connection. Only explicit wording.
    code: 'TRUST_REQUIRED',
    match: /untrusted|denied by|request (has been )?denied|blocked by|not allowed/i,
    title: 'QZ Tray necesita autorización',
    action: 'Comprueba que estás en Walinka y autoriza el acceso en QZ Tray. Si vuelve a preguntar, contacta a soporte.',
  },
  {
    // QZ's generic signing failure. Cause is unknown, so the advice does not blame the session.
    code: 'SIGNATURE_UNCONFIRMED',
    match: /failed to sign request/i,
    title: 'QZ Tray no confirmó la conexión',
    action: 'Reintenta. Si QZ Tray muestra un aviso de autorización, acéptalo. Si continúa, contacta a soporte.',
  },
  {
    // printService/printReceipt guard in qzTrayProvider.print().
    code: 'PRINTER_NOT_SELECTED',
    match: /selecciona una impresora/i,
    title: 'Falta elegir una impresora',
    action: 'Selecciona la impresora térmica y vuelve a intentar.',
  },
];

const FALLBACK = {
  code: 'PRINTER_ERROR',
  title: 'No se pudo conectar la impresora',
  action: 'Comprueba que esté encendida y conectada. Puedes reintentar sin crear otra venta.',
};

export function explainPrinterSetupError(error) {
  const message = String(error?.message || error || '');
  const rule = RULES.find((r) => r.match.test(message));
  if (!rule) return { ...FALLBACK };
  const { code, title, action } = rule;
  return { code, title, action };
}

export function getPrinterSetupSteps() {
  return [
    { id: 'qz', title: 'Conectar QZ Tray', detail: 'Instala y abre QZ Tray una sola vez en el computador de caja.' },
    { id: 'trust', title: 'Autorizar Walinka', detail: 'La primera autorización puede ser necesaria. Una firma válida no garantiza confianza automática con un certificado de demostración.' },
    { id: 'printer', title: 'Elegir impresora', detail: 'Selecciona la impresora térmica detectada y guarda la preferencia.' },
    { id: 'test', title: 'Probar ticket y corte', detail: 'Imprime un ticket de prueba, sin cobrar ni registrar una venta.' },
  ];
}
