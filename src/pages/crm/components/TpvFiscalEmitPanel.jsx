import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  emitFiscalSale,
  getFiscalSaleStatus,
  describeFiscalEmitError,
  LOCKING_CODES,
  SII_STATUS_LABELS,
} from '../../../services/fiscalEmitService';

// Boleta electrónica DTE 39 desde el TPV, tras una venta confirmada.
//
// - Apagado por defecto: solo aparece con VITE_FISCAL_EMIT_ENABLED=true.
// - El botón se habilita únicamente si el servidor dice canEmit (rol, venta del día pagada,
//   emisor verificado, control global encendido, IVA verificado, sin fila previa).
// - Confirmación explícita antes de enviar: emitir consume un folio real y no se deshace.
// - Nunca reintenta. Un resultado incierto bloquea el botón y queda para conciliación.
// - "Emitida" (folio + XML firmado) se muestra aparte del estado SII (aceptada, rechazada...).
// - La impresión térmica de la boleta (PR #112) es independiente y no se llama desde aquí.
export const FISCAL_EMIT_ENABLED = import.meta.env.VITE_FISCAL_EMIT_ENABLED === 'true';

const clp = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;

const box = { margin: '12px 16px', padding: 12, border: '1px solid #d1d5db', borderRadius: 10, background: '#f9fafb', color: '#374151', fontSize: 12 };
const btn = (enabled, primary = true) => ({
  padding: '8px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
  border: primary ? 'none' : '1px solid #d1d5db',
  background: !enabled ? '#e5e7eb' : primary ? '#0369a1' : '#fff',
  color: !enabled ? '#6b7280' : primary ? '#fff' : '#374151',
  cursor: enabled ? 'pointer' : 'not-allowed',
});

export default function TpvFiscalEmitPanel({ saleId, businessId, total, enabled = FISCAL_EMIT_ENABLED }) {
  const [status, setStatus] = useState({ loading: true, data: null, code: null });
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, folio } | { ok:false, code }
  const [downloadError, setDownloadError] = useState('');
  const sentRef = useRef(false); // una sola emisión por montaje, aunque se pulse dos veces

  const refresh = useCallback(async () => {
    if (!saleId) return;
    setStatus((s) => ({ ...s, loading: true }));
    const r = await getFiscalSaleStatus(saleId);
    setStatus(r.ok ? { loading: false, data: r.data, code: null } : { loading: false, data: null, code: r.code });
  }, [saleId]);

  useEffect(() => { if (enabled) refresh(); }, [enabled, refresh]);

  if (!enabled || !saleId) return null;

  const data = status.data;
  const locked = Boolean(result && !result.ok && LOCKING_CODES.has(result.code));
  const canEmit = Boolean(data?.canEmit) && !busy && !locked && !sentRef.current && result?.ok !== true;

  const handleEmit = async () => {
    if (!canEmit || !acknowledged || sentRef.current) return;
    sentRef.current = true;
    setBusy(true);
    setConfirming(false);
    const r = await emitFiscalSale(saleId);
    setResult(r.ok ? { ok: true, folio: r.folio } : { ok: false, code: r.code });
    setBusy(false);
    await refresh(); // muestra el estado real del ledger, incluido unknown
  };

  async function download(format) {
    setDownloadError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Debes iniciar sesión.');
      const params = new URLSearchParams({ businessId, invoiceId: saleId, format });
      const response = await fetch(`/api/fiscal/download?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
      });
      if (!response.ok) throw new Error('No se pudo descargar el documento tributario.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `boleta-${data?.folio}.${format}`;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setDownloadError(err.message || 'No se pudo descargar.');
    }
  }

  let body;
  if (status.loading && !data) {
    body = <div>Revisando el estado fiscal de la venta…</div>;
  } else if (!data) {
    body = <div>No fue posible consultar el estado fiscal ({status.code}). No se emitió ninguna boleta.</div>;
  } else if (data.state === 'issued' || data.state === 'cancelled') {
    body = (
      <>
        <div style={{ fontWeight: 700, color: data.state === 'cancelled' ? '#92400e' : '#065f46' }}>{data.state === 'cancelled' ? 'Boleta electrónica anulada' : 'Boleta electrónica emitida'} · Folio {data.folio}</div>
        <div data-testid="sii-status" style={{ marginTop: 4 }}>
          {data.state === 'cancelled' ? 'Anulada con nota de crédito' : (SII_STATUS_LABELS[data.siiStatus] ?? SII_STATUS_LABELS.unverified)}
          {data.siiTrackId ? ` · TrackId ${data.siiTrackId}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {data.hasPdf && <button type="button" style={btn(true, false)} onClick={() => download('pdf')}>Descargar PDF</button>}
          {data.hasXml && <button type="button" style={btn(true, false)} onClick={() => download('xml')}>Descargar XML</button>}
        </div>
        {downloadError && <div role="alert" style={{ marginTop: 4, color: '#b91c1c' }}>{downloadError}</div>}
      </>
    );
  } else if (data.state === 'unknown' || data.state === 'sending' || locked) {
    body = (
      <div role="alert" style={{ color: '#92400e' }}>
        <strong>Resultado pendiente de confirmar.</strong> No repitas la emisión: se revisa con DTE Core antes de cualquier otra acción.
        {data.folio ? ` Folio informado por el proveedor: ${data.folio}.` : ''}
        {data.errorCode ? <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 11 }}>Motivo: {data.errorCode}</div> : null}
      </div>
    );
  } else if (data.state === 'failed') {
    body = <div role="alert" style={{ color: '#b91c1c' }}>{describeFiscalEmitError('PROVIDER_REJECTED')}</div>;
  } else {
    body = (
      <>
        <div>{data.canEmit ? `Venta lista para boleta electrónica por ${clp(total)}.` : describeFiscalEmitError(data.blockedReason)}</div>
        <button type="button" style={{ ...btn(canEmit), marginTop: 8 }} disabled={!canEmit}
          onClick={() => { setAcknowledged(false); setConfirming(true); }}>
          {busy ? 'Emitiendo…' : 'Emitir boleta electrónica'}
        </button>
      </>
    );
  }

  return (
    <section aria-label="Boleta electrónica SII" style={box}>
      <strong style={{ display: 'block', fontSize: 13, marginBottom: 5 }}>Boleta electrónica · SII</strong>
      {body}
      {result && !result.ok && !locked && data?.state !== 'failed' && (
        <div role="alert" style={{ marginTop: 6, color: '#b91c1c' }}>{describeFiscalEmitError(result.code)}</div>
      )}

      {confirming && (
        <div role="dialog" aria-modal="true" aria-label="Confirmar emisión" style={{ marginTop: 10, padding: 10, border: '1px solid #f59e0b', borderRadius: 8, background: '#fffbeb', color: '#78350f' }}>
          <strong>¿Emitir la boleta electrónica de esta venta?</strong>
          <ul style={{ margin: '6px 0 6px 16px', padding: 0 }}>
            <li>Total: {clp(total)}, IVA incluido.</li>
            <li>Se envía al SII a través de DTE Core y consume un folio real.</li>
            <li>No se puede deshacer: solo se anula con una nota de crédito.</li>
            <li>Si no hay respuesta, no se repite: queda pendiente de confirmación.</li>
          </ul>
          <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            <span>Confirmo que la venta está pagada y quiero emitir la boleta.</span>
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" style={btn(acknowledged)} disabled={!acknowledged} onClick={handleEmit}>Emitir ahora</button>
            <button type="button" style={btn(true, false)} onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}
