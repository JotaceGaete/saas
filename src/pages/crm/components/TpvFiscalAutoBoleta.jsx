import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FISCAL_AUTO_MODE } from '../../../services/fiscalAutoMode';
import { createLiveEmitter, createSimulatedEmitter, SIM_SCENARIO_STORAGE_KEY, SIM_SCENARIOS } from '../../../services/fiscalEmitters';
import { createFiscalSaleFlow, describeFlowCode, PHASE } from '../../../services/fiscalSaleFlow';
import { fiscalPrintBlocker, printIssuedBoleta, readFiscalPrintSettings } from '../../../services/fiscalThermalPrintService';
import { POINT_PREVIEW } from '../../../services/pointClient';

// Boleta electrónica automática al confirmar una venta cobrada en el TPV.
// Emite (DTE Core o simulación) y envía la boleta con su timbre PDF417 a la
// impresora configurada del Walinka Print Connector, el mismo que imprime los
// tickets (sin QZ Tray). Ver services/fiscalSaleFlow.js.
//
// Cuando la venta no lleva boleta (no pagada, etc.) llama a onPlainTicket
// para que el TPV imprima el ticket de siempre.

const box = { margin: '12px 16px', padding: 12, border: '1px solid #d1d5db', borderRadius: 10, background: '#f9fafb', color: '#374151', fontSize: 12 };
const btn = (primary = false) => ({
  padding: '7px 11px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: primary ? 'none' : '1px solid #d1d5db', background: primary ? '#0369a1' : '#fff', color: primary ? '#fff' : '#374151',
});

// Reintento automático, sin el cajero, de lo que suele resolverse solo al
// poco rato en un equipo real: el conector todavía no autoriza el sitio, el
// navegador está pidiendo el permiso de red local, la impresora está ocupada
// o el conector aún no está configurado en esta dirección. Nunca emite otra
// boleta: el papel reusa la misma clave del original (el conector descarta
// duplicados) y una boleta bloqueada antes de emitir vuelve a pasar por las
// mismas reglas del flujo.
export const AUTO_PRINT_RETRY_DELAYS_MS = Object.freeze([2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000, 30000, 30000]);
export const AUTO_BLOCKED_RETRY_MS = 3000;
export const AUTO_BLOCKED_MAX_TRIES = 100; // ~5 minutos
const TRANSIENT_PRINT_CODES = new Set([
  'connector_unreachable', 'printer_unavailable', 'rate_limited', 'spooler_unavailable', 'print_failed',
  'PRINT_FAILED', 'origin_not_allowed', 'not_paired', 'unauthorized', 'MISSING_PRINTER', 'CONNECTOR_REQUIRED',
  'missing_printer',
]);

export function isTransientPrintFailure(code) {
  return TRANSIENT_PRINT_CODES.has(code) || /^http_5\d\d$/.test(String(code || ''));
}

function readScenario() {
  try { return JSON.parse(window.localStorage.getItem(SIM_SCENARIO_STORAGE_KEY)) || 'ok'; } catch { return 'ok'; }
}

/**
 * Modo fiscal efectivo de una venta. En una Preview nunca es 'live' (DTE Core
 * y SII desactivados, aunque el cobro Point sea real), ni para una venta simulada.
 */
export function fiscalModeForSale(mode, sale, { preview = POINT_PREVIEW } = {}) {
  if (mode !== 'live') return mode;
  if (sale?.simulated || preview) return 'simulated';
  return mode;
}

/** Resolución del servidor ({ numero, fecha }) en la forma que imprime la boleta ({ numero, anio }). */
export function printableResolucion(resolucion) {
  if (!resolucion?.numero || !resolucion?.fecha) return { numero: '', anio: '' };
  return { numero: String(resolucion.numero), anio: String(resolucion.fecha).slice(0, 4) };
}

/**
 * En modo real la resolución SII es la del emisor aprobado por Walinka (viene en el estado de
 * fiscal-emit), no la guardada en este navegador. Envuelve el emisor para recordarla.
 */
export function withServerResolucion(emitter) {
  let resolucion = null;
  return Object.freeze({
    ...emitter,
    mode: emitter.mode,
    async status(...args) {
      const r = await emitter.status(...args);
      if (r?.ok && r.data && 'resolucion' in r.data) resolucion = r.data.resolucion ?? null;
      return r;
    },
    resolucion: () => resolucion,
  });
}

export function buildFlowForMode(mode, businessId) {
  if (mode === 'off' || !businessId) return null;
  const emitter = mode === 'live' ? withServerResolucion(createLiveEmitter({ businessId })) : createSimulatedEmitter({ businessId });
  const settings = () => (mode === 'live'
    ? { ...readFiscalPrintSettings(), resolucion: printableResolucion(emitter.resolucion()) }
    : readFiscalPrintSettings());
  const printBlocker = () => fiscalPrintBlocker(businessId, { requireResolucion: mode === 'live', settings: settings() });
  const flow = createFiscalSaleFlow({
    businessId,
    emitter,
    print: ({ bytes, reprint, idempotencyKey, saleNumber }) => printIssuedBoleta({
      businessId, bytes, reprint, idempotencyKey, saleNumber, settings: settings(),
    }),
    // Una boleta nueva no se emite si este equipo no puede imprimirla: conector
    // activo con impresora y, en modo real, resolución SII.
    printBlocker,
  });
  return { emitter, flow, printBlocker };
}

export default function TpvFiscalAutoBoleta({ businessId, sale, saleContext, onPlainTicket, onSettled, mode = FISCAL_AUTO_MODE, deps }) {
  // Una venta simulada nunca llega a DTE Core, y en una Preview la boleta es
  // siempre simulada, aunque el cobro Point haya sido real.
  const effectiveMode = fiscalModeForSale(mode, sale);
  const built = useMemo(() => deps || buildFlowForMode(effectiveMode, businessId), [deps, effectiveMode, businessId]);
  const [state, setState] = useState({ phase: PHASE.CHECKING });
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState(readScenario);
  const plainPrintedRef = useRef(false);
  const saleId = sale?.id;

  const apply = useCallback((r) => {
    setState(r);
    // Avisa al TPV en qué terminó (p. ej. para quitar la venta de «boletas pendientes»).
    onSettled?.(saleId, r.phase);
    if (r.phase === PHASE.NOT_ELIGIBLE && !plainPrintedRef.current) {
      plainPrintedRef.current = true;
      onPlainTicket?.();
    }
  }, [onPlainTicket, onSettled, saleId]);

  const run = useCallback(async (action, { auto = false } = {}) => {
    if (!built || !saleId) return;
    setBusy(true);
    if (action === 'start' && !auto) setState({ phase: PHASE.EMITTING });
    try {
      let r;
      if (action === 'start') r = await built.flow.start(saleId, saleContext);
      else if (action === 'refresh') r = await built.flow.refresh(saleId, saleContext);
      else if (action === 'emitAgain') r = await built.flow.emitAgain(saleId, saleContext);
      else if (action === 'retryPrint') r = await built.flow.retryPrint(saleId, state.folio);
      else if (action === 'reprint') r = await built.flow.reprint(saleId, state.folio);
      else if (action === 'reconcile') {
        await built.emitter.reconcile?.(saleId);
        r = await built.flow.refresh(saleId, saleContext);
      }
      if (!r) return;
      if (action === 'reprint') {
        // Una reimpresión no cambia el estado de la boleta: solo informa su resultado.
        setState((s) => ({ ...s, reprintError: r.phase === PHASE.PRINTED ? null : r, reprinted: r.phase === PHASE.PRINTED }));
        return;
      }
      apply(r);
    } finally {
      setBusy(false);
    }
  }, [built, saleId, saleContext, state.folio, apply]);

  // Reintentos automáticos (ver AUTO_PRINT_RETRY_DELAYS_MS).
  const autoRef = useRef({ saleId: null, print: 0, blocked: 0 });
  const [autoRetrying, setAutoRetrying] = useState(false);
  useEffect(() => {
    if (!built || !saleId) return undefined;
    const a = autoRef.current;
    if (a.saleId !== saleId) Object.assign(a, { saleId, print: 0, blocked: 0 });
    const printRetry = state.phase === PHASE.PRINT_FAILED && !state.reprint && state.folio != null && isTransientPrintFailure(state.code);
    const blockedRetry = state.phase === PHASE.BLOCKED && state.retryable;
    if (busy || (!printRetry && !blockedRetry)) { setAutoRetrying(false); return undefined; }
    if (printRetry && a.print >= AUTO_PRINT_RETRY_DELAYS_MS.length) { setAutoRetrying(false); return undefined; }
    if (blockedRetry && a.blocked >= AUTO_BLOCKED_MAX_TRIES) { setAutoRetrying(false); return undefined; }
    setAutoRetrying(true);
    const delay = printRetry ? AUTO_PRINT_RETRY_DELAYS_MS[a.print] : AUTO_BLOCKED_RETRY_MS;
    const timer = setTimeout(() => {
      if (printRetry) {
        a.print += 1;
        run('retryPrint', { auto: true });
        return;
      }
      a.blocked += 1;
      // Mientras siga faltando el conector no se llama al flujo: solo se mira la configuración.
      if (built.printBlocker && built.printBlocker()) { setState((st) => ({ ...st })); return; }
      run('start', { auto: true });
    }, delay);
    return () => clearTimeout(timer);
  }, [built, saleId, state, busy, run]);

  // Al montar (venta recién cobrada o reabierta): una vez por venta.
  const startedRef = useRef(null);
  useEffect(() => {
    if (!built || !saleId || startedRef.current === saleId) return;
    startedRef.current = saleId;
    run('start');
  }, [built, saleId, run]);

  if (!built || !saleId) return null;
  const simulated = built.emitter.mode === 'simulated';
  const { phase, folio, code, message } = state;

  let tone = '#374151';
  let body;
  switch (phase) {
    case PHASE.CHECKING:
    case PHASE.EMITTING:
      body = 'Emitiendo boleta electrónica…';
      break;
    case PHASE.PRINTING:
      body = `Imprimiendo boleta ${folio}…`;
      break;
    case PHASE.PRINTED:
      tone = '#065f46';
      body = state.alreadyPrinted ? `Boleta ${folio} emitida e impresa.`
          : `Boleta ${folio} emitida y enviada a la impresora.`;
      break;
    case PHASE.PRINT_FAILED:
      tone = '#b91c1c';
      body = `Boleta ${folio} emitida, pero no se imprimió: ${message || describeFlowCode(code)} Reintentar no emite otra boleta.`;
      break;
    case PHASE.NOT_ELIGIBLE:
      body = `Sin boleta electrónica: ${describeFlowCode(code)} Se imprimió el ticket de venta.`;
      break;
    case PHASE.UNCERTAIN:
      tone = '#92400e';
      body = `${describeFlowCode(code)}${folio ? ` Folio informado: ${folio}.` : ''} No se reintenta sola.`;
      break;
    case PHASE.REJECTED:
      tone = '#b91c1c';
      body = describeFlowCode('PROVIDER_REJECTED');
      break;
    default:
      tone = '#b91c1c';
      body = message || describeFlowCode(code);
  }

  const hasBoleta = phase === PHASE.PRINTED || phase === PHASE.PRINT_FAILED;
  return (
    <section aria-label="Boleta electrónica SII" style={box} data-testid="fiscal-auto-boleta" data-phase={phase}>
      <strong style={{ display: 'block', fontSize: 13, marginBottom: 5 }}>
        Boleta electrónica · SII{simulated ? ' · SIMULACIÓN (sin valor tributario)' : ''}
      </strong>
      <div role={tone === '#374151' || tone === '#065f46' ? 'status' : 'alert'} style={{ color: tone }}>{body}</div>
      {autoRetrying && (
        <div role="status" data-testid="fiscal-auto-retry" style={{ marginTop: 4, color: '#6b7280' }}>
          {phase === PHASE.BLOCKED
            ? 'Se emitirá e imprimirá sola en cuanto el conector esté listo en este equipo.'
            : 'Reintentando la impresión automáticamente (misma boleta, mismo folio).'}
        </div>
      )}
      {state.reprinted && !state.reprintError && (
        <div role="status" style={{ marginTop: 4, color: '#065f46' }}>Reimpresión de la boleta {folio} enviada (rotulada REIMPRESION, mismo folio).</div>
      )}
      {state.reprintError && (
        <div role="alert" style={{ marginTop: 4, color: '#b91c1c' }}>No se pudo reimprimir: {state.reprintError.message || describeFlowCode(state.reprintError.code)}</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {phase === PHASE.PRINT_FAILED && !state.reprint && (
          <button type="button" style={btn(true)} disabled={busy} onClick={() => run('retryPrint')}>Reintentar impresión</button>
        )}
        {hasBoleta && (
          <button type="button" style={btn()} disabled={busy} onClick={() => run('reprint')}>Reimprimir boleta</button>
        )}
        {phase === PHASE.BLOCKED && state.retryable && (
          <button type="button" style={btn(true)} disabled={busy} onClick={() => run('start')}>Reintentar boleta</button>
        )}
        {(phase === PHASE.UNCERTAIN || phase === PHASE.ERROR) && (
          <button type="button" style={btn()} disabled={busy} onClick={() => run('refresh')}>Consultar estado</button>
        )}
        {phase === PHASE.UNCERTAIN && code === 'ATTEMPT_ALREADY_SENT' && (
          <button type="button" style={btn()} disabled={busy} onClick={() => run('emitAgain')}>El servidor no la recibió: emitir</button>
        )}
        {simulated && phase === PHASE.UNCERTAIN && code !== 'ATTEMPT_ALREADY_SENT' && (
          <button type="button" style={btn()} disabled={busy} onClick={() => run('reconcile')}>Conciliar (simulado)</button>
        )}
      </div>
      {simulated && (
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, color: '#6b7280', fontSize: 11 }}>
          Escenario de la próxima venta simulada:
          <select value={scenario} onChange={(e) => {
            setScenario(e.target.value);
            try { window.localStorage.setItem(SIM_SCENARIO_STORAGE_KEY, JSON.stringify(e.target.value)); } catch { /* sin almacenamiento */ }
          }}>
            {SIM_SCENARIOS.map((s) => (
              <option key={s} value={s}>{{ ok: 'emisión correcta', unknown: 'respuesta perdida', rejected: 'rechazo del proveedor' }[s]}</option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
