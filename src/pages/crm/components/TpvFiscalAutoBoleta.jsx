import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FISCAL_AUTO_MODE } from '../../../services/fiscalAutoMode';
import { createLiveEmitter, createSimulatedEmitter, SIM_SCENARIO_STORAGE_KEY, SIM_SCENARIOS } from '../../../services/fiscalEmitters';
import { createFiscalSaleFlow, describeFlowCode, PHASE } from '../../../services/fiscalSaleFlow';
import { hasValidResolucion, printIssuedBoleta, readFiscalPrintSettings } from '../../../services/fiscalThermalPrintService';

// Boleta electrónica automática al confirmar una venta cobrada en el TPV.
// Emite (DTE Core o simulación) y envía la boleta con su timbre PDF417 a la
// impresora configurada, por la misma ruta de impresión del ticket (Walinka
// Print Connector o QZ Tray). Ver services/fiscalSaleFlow.js.
//
// Cuando la venta no lleva boleta (no pagada, etc.) llama a onPlainTicket
// para que el TPV imprima el ticket de siempre.

const box = { margin: '12px 16px', padding: 12, border: '1px solid #d1d5db', borderRadius: 10, background: '#f9fafb', color: '#374151', fontSize: 12 };
const btn = (primary = false) => ({
  padding: '7px 11px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: primary ? 'none' : '1px solid #d1d5db', background: primary ? '#0369a1' : '#fff', color: primary ? '#fff' : '#374151',
});

function readScenario() {
  try { return JSON.parse(window.localStorage.getItem(SIM_SCENARIO_STORAGE_KEY)) || 'ok'; } catch { return 'ok'; }
}

export function buildFlowForMode(mode, businessId) {
  if (mode === 'off' || !businessId) return null;
  const emitter = mode === 'live' ? createLiveEmitter({ businessId }) : createSimulatedEmitter({ businessId });
  const flow = createFiscalSaleFlow({
    businessId,
    emitter,
    print: ({ bytes, reprint, idempotencyKey }) => printIssuedBoleta({ businessId, bytes, reprint, idempotencyKey }),
    // En modo real, una boleta nueva no se emite si no se puede imprimir con su resolución.
    canPrintOriginal: () => mode !== 'live' || hasValidResolucion(readFiscalPrintSettings().resolucion),
  });
  return { emitter, flow };
}

export default function TpvFiscalAutoBoleta({ businessId, sale, saleContext, onPlainTicket, mode = FISCAL_AUTO_MODE, deps }) {
  const built = useMemo(() => deps || buildFlowForMode(mode, businessId), [deps, mode, businessId]);
  const [state, setState] = useState({ phase: PHASE.CHECKING });
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState(readScenario);
  const plainPrintedRef = useRef(false);
  const saleId = sale?.id;

  const apply = useCallback((r) => {
    setState(r);
    if (r.phase === PHASE.NOT_ELIGIBLE && !plainPrintedRef.current) {
      plainPrintedRef.current = true;
      onPlainTicket?.();
    }
  }, [onPlainTicket]);

  const run = useCallback(async (action) => {
    if (!built || !saleId) return;
    setBusy(true);
    if (action === 'start') setState({ phase: PHASE.EMITTING });
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
