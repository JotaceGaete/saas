// Estado del Walinka Print Connector en dos pasos independientes:
//   1) ¿responde /v1/health? Solo un fallo aquí significa "conector no encontrado".
//   2) ¿lista las impresoras? Un fallo aquí NO significa que el conector no esté:
//      el servicio respondió. Antes se marcaba como no encontrado, lo que confundía
//      a la caja cuando el conector estaba activo.
// Función pura (sin React) para poder probarla con node --test.

const UNREACHABLE_MESSAGE = 'No se encontró el conector de impresión en este equipo. Revisa que esté abierto.';
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
export async function checkConnector({ provider, hasToken }) {
  let version = null;
  try {
    const info = await provider.connect();
    version = info?.version ?? null;
  } catch (err) {
    return {
      health: 'unreachable',
      healthError: messageOf(err, UNREACHABLE_MESSAGE),
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
