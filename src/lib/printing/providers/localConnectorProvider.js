// E3 — provider para Walinka Print Connector (servicio local en Windows).
//
// Implementa la forma PrinterProvider (ver printerProvider.js) más las
// operaciones de emparejamiento y prueba que usa la pantalla de
// configuración. Todo el I/O pasa por `fetchImpl`, así que se prueba con
// node:test sin navegador ni conector real.
//
// Regla de seguridad: la URL base solo puede apuntar a loopback
// (127.0.0.1 o localhost). Nunca se llama a otro host con el token.

export const DEFAULT_CONNECTOR_BASE_URL = 'http://127.0.0.1:47801';
export const CONNECTOR_SERVICE_NAME = 'walinka-print-connector';

export class ConnectorError extends Error {
  /**
   * @param {string} code  Código estable (p. ej. 'connector_unreachable', 'printer_unavailable').
   * @param {string} message  Mensaje legible para el cajero.
   * @param {{ status?: number, problems?: string[] }} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'ConnectorError';
    this.code = code;
    this.status = extra.status ?? null;
    this.problems = extra.problems ?? [];
  }
}

/** Valida que la URL sea http(s) hacia loopback y devuelve la base sin barra final. */
export function assertLoopbackBaseUrl(baseUrl) {
  let url;
  try {
    url = new URL(String(baseUrl || ''));
  } catch {
    throw new ConnectorError('invalid_base_url', 'La dirección del conector no es válida.');
  }
  const isLoopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (!isLoopback || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new ConnectorError('invalid_base_url', 'El conector solo puede usar una dirección local (127.0.0.1).');
  }
  return `${url.protocol}//${url.host}`;
}

/** Base64 de bytes sin depender de Buffer (funciona en navegador y en node:test). */
export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function request(fetchImpl, url, init) {
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new ConnectorError(
      'connector_unreachable',
      'No se encontró el conector de impresión en este equipo. Revisa que esté abierto.',
    );
  }
  const body = await readJsonSafe(response);
  if (!response.ok) {
    const code = body?.error || `http_${response.status}`;
    throw new ConnectorError(code, messageFor(code, body), {
      status: response.status,
      problems: Array.isArray(body?.problems) ? body.problems : [],
    });
  }
  return body;
}

function messageFor(code, body) {
  switch (code) {
    case 'origin_not_allowed':
      return 'Este navegador no está autorizado por el conector. Vuelve a emparejar el equipo.';
    case 'unauthorized':
      return 'El equipo ya no está emparejado con el conector. Vuelve a emparejarlo.';
    case 'printer_not_found':
      return 'La impresora configurada no existe en este equipo. Elige otra en Configuración de impresión.';
    case 'printer_unavailable':
      return `La impresora no está lista${body?.problems?.length ? `: ${body.problems.join(', ')}` : ''}.`;
    case 'rate_limited':
      return 'Demasiados intentos seguidos. Espera un minuto e intenta de nuevo.';
    case 'spooler_unavailable':
      return 'El servicio de impresión de Windows no responde.';
    case 'print_failed':
      return 'Windows no pudo enviar el ticket a la impresora.';
    default:
      return 'El conector de impresión devolvió un error.';
  }
}

/**
 * @param {{
 *   baseUrl?: string,
 *   token?: string | null,
 *   fetchImpl?: typeof fetch,
 * }} options
 */
export function createLocalConnectorProvider({
  baseUrl = DEFAULT_CONNECTOR_BASE_URL,
  token = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = assertLoopbackBaseUrl(baseUrl);
  const authHeaders = () => {
    if (!token) throw new ConnectorError('not_paired', 'Este equipo todavía no está emparejado con el conector.');
    return { Authorization: `Bearer ${token}` };
  };

  let connected = false;

  return {
    id: 'local-connector',

    isAvailable: () => connected,

    async connect() {
      const body = await request(fetchImpl, `${base}/v1/health`, { method: 'GET' });
      if (body?.service !== CONNECTOR_SERVICE_NAME) {
        throw new ConnectorError('connector_incompatible', 'El servicio local no es el conector de Walinka.');
      }
      connected = true;
      return body;
    },

    /**
     * ¿Hay algo escuchando en el puerto del conector, aunque no autorice este
     * origen? Petición `no-cors` sin credenciales ni token: el navegador no
     * deja leer la respuesta (opaca), solo saber si llegó. Sirve para
     * distinguir «conector cerrado» de «conector abierto que no autoriza este
     * sitio» (p. ej. una Preview que falta en AllowedOrigins).
     */
    async probeListening() {
      try {
        await fetchImpl(`${base}/v1/health`, { method: 'GET', mode: 'no-cors', credentials: 'omit', cache: 'no-store' });
        return true;
      } catch {
        return false;
      }
    },

    /**
     * Pide al conector que autorice este sitio. El conector muestra una
     * ventana en Windows y solo agrega el origen si el usuario pulsa «Sí».
     * Petición simple `no-cors` (POST sin cuerpo ni cabeceras, sin token): el
     * sitio todavía no está autorizado, así que no hay preflight ni se puede
     * leer la respuesta. El resultado se ve al volver a consultar /v1/health.
     * Devuelve false si no hay nada escuchando.
     */
    async requestOriginApproval() {
      try {
        await fetchImpl(`${base}/v1/origin-approval`, { method: 'POST', mode: 'no-cors', credentials: 'omit', cache: 'no-store' });
        return true;
      } catch {
        return false;
      }
    },

    async disconnect() {
      connected = false;
    },

    async listPrinters() {
      const body = await request(fetchImpl, `${base}/v1/printers`, {
        method: 'GET',
        headers: authHeaders(),
      });
      return (body?.printers || []).map((p) => p.name);
    },

    /**
     * Imprime bytes ESC/POS. Devuelve { status, duplicate }.
     * `duplicate: true` significa que el conector ya tenía esa clave: no se
     * volvió a imprimir y eso es un éxito para quien llama.
     */
    async print(printerName, bytes, { copies = 1, idempotencyKey } = {}) {
      if (!idempotencyKey) {
        throw new ConnectorError('missing_idempotency_key', 'Falta la clave de impresión.');
      }
      return request(fetchImpl, `${base}/v1/print`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          printerName,
          copies,
          dataBase64: bytesToBase64(bytes),
        }),
      });
    },

    /** Prueba de corte sin venta. Solo para la pantalla de configuración. */
    async testPrinter(printerName) {
      return request(fetchImpl, `${base}/v1/printers/test`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerName }),
      });
    },

    /** Canjea un código de 6 dígitos por un token. No requiere token previo. */
    async pair(code, deviceName = 'Caja') {
      const body = await request(fetchImpl, `${base}/v1/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, deviceName }),
      });
      if (!body?.token) throw new ConnectorError('pairing_failed', 'El conector no devolvió un token.');
      return body.token;
    },
  };
}
