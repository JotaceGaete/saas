import qz from 'qz-tray';
import { getValidToken } from 'lib/auth/getValidToken';
import { getSupabasePublishableKey } from 'lib/supabasePublishableKey';

// PRINT-1 — única capa de Walinka que importa 'qz-tray'. Ningún otro
// módulo (printService, páginas, componentes) debe importar este paquete
// directamente -- siempre a través de printService.js (ver
// providers/printerProvider.js para el contrato que este archivo cumple).
//
// No hay nada específico de marca/modelo acá: qz.printers.find() devuelve
// los nombres tal como los reporta el sistema operativo, y print() envía
// bytes crudos a la impresora que el usuario haya elegido.
//
// PRINT-3A — firma de solicitudes QZ Tray (elimina el aviso "Unsigned
// request / Untrusted website"). La clave privada NUNCA vive acá ni en
// ningún otro lugar del frontend/repo: este archivo solo
//   1) expone el certificado PÚBLICO (no es secreto, ver getQzCertificate)
//   2) le pide al backend (Edge Function supabase/functions/qz-sign) que
//      firme cada solicitud, autenticado con la sesión real del usuario.
// La Edge Function es la ÚNICA que conoce la clave privada (secreto de
// Supabase). Si el certificado o el servicio de firma no están
// configurados, la conexión falla con un mensaje claro en vez de caer en
// silencio al modo "no firmado".
//
// IMPORTANTE (contrato real de qz-tray 2.3.x, confirmado leyendo
// node_modules/qz-tray/qz-tray.js): `toSign` NO es el JSON
// {call,params,timestamp} tal cual -- QZ lo hashea primero
// (_qz.tools.hash, SHA-256, salida en hex) y firma ESE hash. No cambia
// nuestro código (tratamos `toSign` como un string opaco, cualquiera sea
// su forma), pero si algún día se necesita loguear o inspeccionar el
// valor, no esperar ver el JSON original.
//
// PRINT-3A-BUG1: QZ Tray reemplaza CUALQUIER rechazo de la signature
// promise por el mismo `Error("Failed to sign request")` genérico antes
// de devolvérselo a quien llamó a connect()/print() (ver
// _qz.websocket.connection.sendData en qz-tray.js) -- nuestro mensaje de
// error real NUNCA llega hasta ahí. Por eso cada fallo de
// requestQzSignature se loguea con logSigningFailure() ANTES de
// rechazar: es la única forma de ver la causa real en producción.

let securityConfigured = false;

// Diagnóstico seguro: código corto + detalle no sensible. Nunca el JWT
// completo, nunca la clave privada (que ni siquiera pasa por acá), nunca
// el body completo de la respuesta si pudiera incluir algo más que
// {error} o {signature}.
function logSigningFailure(code, detail) {
  console.error(`QZ signing failed: ${code}`, detail ?? '');
}

function getQzCertificate() {
  const cert = String(import.meta.env.VITE_QZ_CERTIFICATE || '').trim();
  if (!cert) {
    throw new Error('Certificado QZ no configurado (VITE_QZ_CERTIFICATE). Sin esto, QZ Tray mostrará "Untrusted website".');
  }
  return cert;
}

function getQzSignEndpoint() {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (!supabaseUrl) throw new Error('Falta configurar VITE_SUPABASE_URL para firmar solicitudes QZ.');
  return `${supabaseUrl}/functions/v1/qz-sign`;
}

// Pide la firma de `toSign` al backend -- nunca se firma en el cliente.
// Cada fallo se loguea (logSigningFailure) con un código corto ANTES de
// rechazar, porque QZ Tray reemplaza el mensaje real por uno genérico
// (ver nota PRINT-3A-BUG1 arriba) -- sin este log, la causa real es
// invisible incluso en desarrollo.
async function requestQzSignature(toSign) {
  const token = await getValidToken();
  if (!token) {
    logSigningFailure('NO_SESSION');
    throw new Error('No hay una sesión válida para firmar la solicitud QZ. Inicia sesión de nuevo.');
  }

  const anonKey = getSupabasePublishableKey();
  if (!anonKey) {
    logSigningFailure('NO_ANON_KEY');
    throw new Error('Falta configurar la clave pública de Supabase (VITE_SUPABASE_PUBLISHABLE_KEY).');
  }

  let response;
  try {
    response = await fetch(getQzSignEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ request: toSign }),
    });
  } catch (err) {
    // Cubre tanto "el fetch nunca salió" como "el navegador rechazó el
    // preflight CORS" (p. ej. la Edge Function no tiene verify_jwt=false
    // en supabase/config.toml y el gateway devuelve 401 al OPTIONS antes
    // de que nuestro propio código de origen/JWT se ejecute) -- ambos se
    // ven acá como un TypeError de fetch, nunca como respuesta HTTP.
    logSigningFailure('NETWORK_ERROR', err?.message);
    throw new Error('No se pudo contactar el servicio de firma QZ (endpoint no disponible).');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    logSigningFailure(`INVALID_JSON_${response.status}`);
    throw new Error('El servicio de firma QZ devolvió una respuesta inválida.');
  }

  if (!response.ok) {
    logSigningFailure(`HTTP_${response.status}`, payload?.error);
    throw new Error(payload?.error || `El servicio de firma QZ respondió con error (${response.status}).`);
  }
  if (typeof payload?.signature !== 'string' || !payload.signature) {
    logSigningFailure('EMPTY_OR_INVALID_SIGNATURE');
    throw new Error('El servicio de firma QZ devolvió una firma inválida.');
  }
  return payload.signature;
}

// Configura certificado + algoritmo + firma UNA sola vez por carga de
// página, antes del primer connect(). rejectOnFailure: true evita que QZ
// Tray caiga en silencio al modo "sin certificado" si getQzCertificate()
// falla -- preferimos un error explícito a un aviso de "untrusted" que
// nadie investiga.
function configureSecurity() {
  if (securityConfigured) return;
  securityConfigured = true;

  qz.security.setCertificatePromise((resolve, reject) => {
    try {
      resolve(getQzCertificate());
    } catch (err) {
      reject(err);
    }
  }, { rejectOnFailure: true });

  qz.security.setSignatureAlgorithm('SHA512');

  qz.security.setSignaturePromise((toSign) => (resolve, reject) => (
    requestQzSignature(toSign).then(resolve, reject)
  ));
}

function ensureConnected() {
  configureSecurity();
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
