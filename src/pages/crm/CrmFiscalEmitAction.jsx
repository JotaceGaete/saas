import React, { useState } from 'react';
import { emitFiscalSale, describeFiscalEmitError } from '../../services/fiscalEmitService';

// Emisión de boleta desde la venta pagada. Apagada por defecto: requiere VITE_FISCAL_EMIT_ENABLED=true.
// Sin reintento automático: si el resultado es incierto, el botón queda bloqueado y lo resuelve la recuperación.
const LOCKING_CODES = new Set(['UNKNOWN_REQUIRES_RECONCILIATION', 'PERSIST_PENDING_RECOVERY']);
const FISCAL_EMIT_ENABLED = import.meta.env.VITE_FISCAL_EMIT_ENABLED === 'true';

export default function CrmFiscalEmitAction({ saleId }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, folio } | { ok:false, message }

  const handleEmit = async () => {
    if (busy || !saleId) return;
    setBusy(true);
    setResult(null);
    const r = await emitFiscalSale(saleId);
    setBusy(false);
    if (r.ok) setResult({ ok: true, folio: r.folio });
    else setResult({ ok: false, message: describeFiscalEmitError(r.code), locked: LOCKING_CODES.has(r.code) });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
      <button
        type="button"
        onClick={handleEmit}
        disabled={!FISCAL_EMIT_ENABLED || busy || result?.ok === true || result?.locked === true}
        className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-white bg-sky-600 disabled:bg-white/10 disabled:text-white/60 disabled:cursor-not-allowed"
      >
        {busy ? 'Emitiendo…' : 'Emitir boleta electrónica'}
      </button>
      {!FISCAL_EMIT_ENABLED && (
        <p className="text-xs text-white/50">Emisión deshabilitada en este entorno.</p>
      )}
      {result?.ok && (
        <p role="status" className="text-xs text-emerald-300">Boleta emitida. Folio {result.folio}.</p>
      )}
      {result && !result.ok && (
        <p role="alert" className="text-xs text-red-300">{result.message}</p>
      )}
    </div>
  );
}
