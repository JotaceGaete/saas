// Estado del Walinka Print Connector en dos pasos independientes:
//   1) ¿responde /v1/health? Solo un fallo aquí significa "conector no encontrado".
//   2) ¿lista las impresoras? Un fallo aquí NO significa que el conector no esté:
//      el servicio respondió. Antes se marcaba como no encontrado, lo que confundía
//      a la caja cuando el conector estaba activo.
// Función pura (sin React) para poder probarla con node --test.

const UNREACHABLE_MESSAGE = 'No se encontró el conector de impresión en este equipo. Revisa que esté abierto.';

// Orígenes que el conector autoriza de fábrica (ConnectorConfig.AllowedOrigins).
export const DEFAULT_CONNECTOR_ORIGINS = Object.freeze(['https://go.ventalink.app', 'https://go.walinka.com']);

/** Mensaje cuando el conector está abierto pero no autoriza el sitio actual. */
export function originNotAuthorizedMessage(origin) {
  return `El conector está abierto en este equipo, pero todavía no autoriza este sitio (${origin}). `
    + 'Pulsa «Autorizar este sitio» y confirma en la ventana que aparecerá en Windows.';
}

export const APPROVAL_WAITING_MESSAGE = 'Revisa la pantalla de este equipo: Walinka Print Connector pide confirmar este sitio. '
  + 'Pulsa «Sí» en esa ventana.';
export const APPROVAL_DONE_MESSAGE = 'Sitio autorizado. Escribe el código de 6 dígitos que muestra Windows y pulsa «Emparejar».';
export const APPROVAL_TIMEOUT_MESSAGE = 'No llegó la autorización. Si no apareció ninguna ventana en Windows, instala el conector 0.4.0 o superior. '
  + 'Si pulsaste «No», espera 10 minutos antes de pedirlo otra vez.';

const sleepMs = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Pide al conector que autorice el sitio actual y espera a que el usuario
 * confirme en Windows. `recheck` vuelve a consultar el estado (checkConnector);
 * en cuanto /v1/health se puede leer, el sitio ya está autorizado.
 * @returns {Promise<{ ok: boolean, reason?: string, message: string, state?: object }>}
 */
export async function requestOriginApproval({
  provider,
  recheck,
  attempts = 70,
  intervalMs = 2000,
  sleep = sleepMs,
  isCancelled = () => false,
}) {
  if (typeof provider?.requestOriginApproval !== 'function') {
    return { ok: false, reason: 'unsupported', message: APPROVAL_TIMEOUT_MESSAGE };
  }
  const sent = await provider.requestOriginApproval();
  if (!sent) return { ok: false, reason: 'unreachable', message: UNREACHABLE_MESSAGE };

  for (let i = 0; i < attempts; i += 1) {
    await sleep(intervalMs);
    if (isCancelled()) return { ok: false, reason: 'cancelled', message: '' };
    const state = await recheck();
    if (state?.health === 'ok') return { ok: true, message: APPROVAL_DONE_MESSAGE, state };
  }
  return { ok: false, reason: 'timeout', message: APPROVAL_TIMEOUT_MESSAGE };
}

/** Mensaje cuando no hay respuesta desde un sitio que no es el de producción. */
function unreachableFromOtherOriginMessage(origin) {
  return `${UNREACHABLE_MESSAGE} Si está abierto, este sitio (${origin}) debe estar en AllowedOrigins del conector `
    + 'y el navegador debe permitirle acceder a la red local.';
}
const PRINTERS_MESSAGE = 'El conector respondió, pero no pudo listar las impresoras. Reinícialo e intenta de nuevo.';

function messageOf(err, fallback) {
  return err?.message || fallback;
}

/**
 * @param {{
 *   provider: { connect: () => Promise<unknown>, listPrinters: () => Promise<string[]> },
 *   hasToken: boolean,
 * }} input
 * @returns {Promise<{ health: 'ok'|'unreachable', healthError: string|null, printers: string[], printersError: string|null }>}
 */
export async function checkConnector({ provider, hasToken, pageOrigin = null }) {
  let version = null;
  try {
    const info = await provider.connect();
    version = info?.version ?? null;
  } catch (err) {
    let healthError = messageOf(err, UNREACHABLE_MESSAGE);
    let originBlocked = false;
    const otherOrigin = pageOrigin && !DEFAULT_CONNECTOR_ORIGINS.includes(pageOrigin);
    if (err?.code === 'connector_unreachable' && otherOrigin) {
      // Un fallo de CORS y un conector cerrado se ven igual desde fetch. La
      // sonda opaca solo dice si hay algo escuchando; nunca envía el token.
      originBlocked = typeof provider.probeListening === 'function' && await provider.probeListening();
      healthError = originBlocked
        ? originNotAuthorizedMessage(pageOrigin)
        : unreachableFromOtherOriginMessage(pageOrigin);
    }
    return {
      health: 'unreachable',
      healthError,
      originBlocked,
      version: null,
      printers: [],
      printersError: null,
    };
  }

  if (!hasToken) {
    return { health: 'ok', healthError: null, version, printers: [], printersError: null };
  }

  try {
    const printers = await provider.listPrinters();
    return { health: 'ok', healthError: null, version, printers, printersError: null };
  } catch (err) {
    // Un fallo de red aquí (preflight, 500 sin CORS) se reporta como error de listado,
    // no como conector ausente. Otros códigos (401, 503...) conservan su mensaje.
    const message = err?.code === 'connector_unreachable' ? PRINTERS_MESSAGE : messageOf(err, PRINTERS_MESSAGE);
    return { health: 'ok', healthError: null, version, printers: [], printersError: message };
  }
}

/**
 * Texto de resultado para el botón «Verificar conector». Siempre hay feedback visible.
 * @returns {{ ok: boolean, message: string }}
 */
export function describeVerify(state, hasToken) {
  const name = state.version ? `Conector ${state.version}` : 'Conector';
  if (state.health === 'unreachable') return { ok: false, message: state.healthError || UNREACHABLE_MESSAGE };
  if (state.printersError) return { ok: false, message: state.printersError };
  if (!hasToken) return { ok: true, message: `${name} respondió correctamente. Falta emparejar este equipo.` };
  const n = state.printers.length;
  return { ok: true, message: `${name} respondió correctamente. ${n} ${n === 1 ? 'impresora disponible' : 'impresoras disponibles'}.` };
}
