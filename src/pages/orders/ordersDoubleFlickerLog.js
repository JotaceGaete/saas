/**
 * Diagnóstico del doble pestañeo: timestamps relativos al inicio de un flujo (p. ej. handleUpdate).
 *
 * Activar (por defecto en dev):
 *   import.meta.env.DEV
 *
 * Desactivar:
 *   window.__ORDERS_DOUBLE_FLICKER_DEBUG__ = false
 *
 * Forzar en prod:
 *   window.__ORDERS_DOUBLE_FLICKER_DEBUG__ = true
 */

let baselineMs = null;
let sessionId = 0;
let seq = 0;
let sessionEvents = [];
let dumpTimer = null;

export function resetOrdersDoubleFlickerBaseline() {
  baselineMs = typeof performance !== 'undefined' ? performance.now() : 0;
}

export function startOrdersDoubleFlickerSession(label, detail = {}) {
  if (!isOrdersDoubleFlickerDebug()) return;
  sessionId += 1;
  seq = 0;
  sessionEvents = [];
  baselineMs = typeof performance !== 'undefined' ? performance.now() : 0;
  if (dumpTimer) window.clearTimeout(dumpTimer);
  ordersDoubleFlickerLog('session:start', { sessionId, label, ...detail });
  dumpTimer = window.setTimeout(() => {
    const counts = {
      setOrdersChanged: 0,
      setOrdersNoop: 0,
      setDetailOrderChanged: 0,
      setDetailOrderNoop: 0,
      setLoadingChanged: 0,
      setLoadingNoop: 0,
      realtimeEvents: 0,
    };
    sessionEvents.forEach((e) => {
      if (String(e.phase).startsWith('realtime:')) counts.realtimeEvents += 1;
      if (e.phase === 'setOrders') {
        if (e.detail?.changedRef) counts.setOrdersChanged += 1;
        else counts.setOrdersNoop += 1;
      }
      if (e.phase === 'setDetailOrder') {
        if (e.detail?.changedRef) counts.setDetailOrderChanged += 1;
        else counts.setDetailOrderNoop += 1;
      }
      if (e.phase === 'setLoading') {
        if (e.detail?.changedValue) counts.setLoadingChanged += 1;
        else counts.setLoadingNoop += 1;
      }
    });
    console.groupCollapsed(`[orders-double-flicker +3000ms] session:summary #${sessionId}`);
    console.table(sessionEvents.map((e) => ({ t: e.relMs, seq: e.seq, event: e.phase, ...e.detail })));
    console.log('[orders-double-flicker] session:counts', counts);
    console.groupEnd();
  }, 3000);
}

export function isOrdersDoubleFlickerDebug() {
  if (typeof window === 'undefined') return false;
  if (window.__ORDERS_DOUBLE_FLICKER_DEBUG__ === false) return false;
  if (window.__ORDERS_DOUBLE_FLICKER_DEBUG__ === true) return true;
  return import.meta.env.DEV === true;
}

/**
 * @param {string} phase
 * @param {Record<string, unknown>} [detail]
 */
export function ordersDoubleFlickerLog(phase, detail = {}) {
  if (!isOrdersDoubleFlickerDebug()) return;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const rel = baselineMs != null ? (now - baselineMs).toFixed(1) : '—';
  seq += 1;
  const payload = { sessionId, seq, phase, relMs: Number(rel) || 0, detail };
  sessionEvents.push(payload);
  console.log(`[orders-double-flicker +${rel}ms #${seq}] ${phase}`, detail);
}
