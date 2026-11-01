import React, { useState } from 'react';
import {
  FISCAL_THERMAL_PRINT_ENABLED, printBoletaThermal, printTimbreDiagnostic,
} from '../../services/fiscalThermalPrintService';

// FISCAL-80MM — pruebas de impresión térmica de una boleta ya emitida.
// Oculto salvo VITE_FISCAL_THERMAL_PRINT=preview. Solo imprime: no emite,
// no llama al proveedor y no cambia el estado fiscal.

const RES_STORAGE_KEY = 'walinka:fiscal:resolucion-prueba';

function readSavedResolucion() {
  try {
    const raw = window.localStorage.getItem(RES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return { numero: String(parsed?.numero ?? ''), anio: String(parsed?.anio ?? '') };
  } catch {
    return { numero: '', anio: '' };
  }
}

export default function CrmFiscalThermalPrint({ businessId, invoiceId }) {
  const [resolucion, setResolucion] = useState(readSavedResolucion);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);

  if (!FISCAL_THERMAL_PRINT_ENABLED) return null;

  const update = (field) => (event) => {
    const next = { ...resolucion, [field]: event.target.value.replace(/\D/g, '').slice(0, field === 'anio' ? 4 : 6) };
    setResolucion(next);
    try { window.localStorage.setItem(RES_STORAGE_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
  };

  const run = async (kind) => {
    if (busy) return;
    setBusy(kind);
    setResult(null);
    const r = kind === 'diag'
      ? await printTimbreDiagnostic({ businessId, invoiceId })
      : await printBoletaThermal({ businessId, invoiceId, resolucion });
    setBusy('');
    if (!r.ok) {
      setResult({ tone: 'error', text: r.message });
      return;
    }
    const detail = r.timbre
      ? ` Timbre esperado: ${r.timbre.widthMm} x ${r.timbre.heightMm} mm.`
      : ' Compara las tres variantes A, B y C y escanéalas.';
    setResult({ tone: 'ok', text: `Enviado a la impresora (boleta ${r.folio}).${detail}` });
  };

  return (
    <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="font-semibold text-amber-900">Ticket térmico 80 mm (prueba, no oficial)</p>
      <p className="mt-1 text-amber-800">
        Se imprime desde el XML firmado. No emite ni modifica la boleta. Cada ticket sale rotulado como prueba
        hasta validar el formato con el SII.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-amber-900">
          Resolución SII N.º
          <input value={resolucion.numero} onChange={update('numero')} inputMode="numeric"
            className="mt-1 w-24 rounded border border-amber-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-amber-900">
          Año
          <input value={resolucion.anio} onChange={update('anio')} inputMode="numeric"
            className="mt-1 w-20 rounded border border-amber-300 px-2 py-1 text-sm" />
        </label>
        <button type="button" onClick={() => run('boleta')} disabled={!!busy}
          className="rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
          {busy === 'boleta' ? 'Imprimiendo...' : 'Imprimir ticket de prueba'}
        </button>
        <button type="button" onClick={() => run('diag')} disabled={!!busy}
          className="rounded-lg border border-amber-400 px-3 py-2 font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50">
          {busy === 'diag' ? 'Imprimiendo...' : 'Diagnóstico del timbre'}
        </button>
      </div>
      {result && (
        <p role={result.tone === 'error' ? 'alert' : 'status'}
          className={`mt-2 ${result.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
          {result.text}
        </p>
      )}
    </div>
  );
}
