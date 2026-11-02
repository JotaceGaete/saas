import React, { useState } from 'react';
import {
  FISCAL_THERMAL_PRINT_ENABLED, printBoletaThermal, printTimbreDiagnostic,
} from '../../services/fiscalThermalPrintService';
import { SELECTABLE_TIMBRE_STRATEGY_IDS, TIMBRE_STRATEGIES } from '../../lib/printing/receipts/buildBoletaReceipt';

// FISCAL-80MM — REIMPRESIÓN térmica de una boleta ya emitida.
// Oculto salvo VITE_FISCAL_THERMAL_PRINT=preview. Solo imprime: no emite,
// no llama al proveedor, no consume folios y no cambia el estado fiscal.
//
// Con `invoiceId` toma el XML guardado de esa nota de venta; sin él pide
// el archivo XML (p. ej. DTE_39_51106.xml descargado del portal).

const RES_STORAGE_KEY = 'walinka:fiscal:resolucion-prueba';
const STRATEGY_STORAGE_KEY = 'walinka:fiscal:timbre-strategy';
const VARIANT_LETTERS = ['A', 'B', 'C'];

function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}

function readSavedResolucion() {
  const parsed = readStored(RES_STORAGE_KEY, null);
  return { numero: String(parsed?.numero ?? ''), anio: String(parsed?.anio ?? '') };
}

function readSavedStrategy() {
  const id = readStored(STRATEGY_STORAGE_KEY, SELECTABLE_TIMBRE_STRATEGY_IDS[0]);
  return SELECTABLE_TIMBRE_STRATEGY_IDS.includes(id) ? id : SELECTABLE_TIMBRE_STRATEGY_IDS[0];
}

export default function CrmFiscalThermalPrint({ businessId, invoiceId }) {
  const [resolucion, setResolucion] = useState(readSavedResolucion);
  const [strategyId, setStrategyId] = useState(readSavedStrategy);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);

  if (!FISCAL_THERMAL_PRINT_ENABLED) return null;

  const fileMode = !invoiceId;
  const sourceReady = !fileMode || !!file;

  const updateRes = (field) => (event) => {
    const next = { ...resolucion, [field]: event.target.value.replace(/\D/g, '').slice(0, field === 'anio' ? 4 : 6) };
    setResolucion(next);
    writeStored(RES_STORAGE_KEY, next);
  };

  const updateStrategy = (event) => {
    setStrategyId(event.target.value);
    writeStored(STRATEGY_STORAGE_KEY, event.target.value);
  };

  const run = async (kind) => {
    if (busy || !sourceReady) return;
    setBusy(kind);
    setResult(null);
    const source = fileMode ? { file } : { invoiceId };
    const r = kind === 'diag'
      ? await printTimbreDiagnostic({ businessId, ...source })
      : await printBoletaThermal({ businessId, ...source, resolucion, timbreStrategyId: strategyId });
    setBusy('');
    if (!r.ok) {
      setResult({ tone: 'error', text: r.message });
      return;
    }
    const detail = r.timbre
      ? ` Timbre esperado: ${r.timbre.widthMm} x ${r.timbre.heightMm} mm.`
      : ` Mide y escanea las variantes ${r.timbres.map((t, i) => `${VARIANT_LETTERS[i]} (${t.widthMm} x ${t.heightMm} mm)`).join(', ')}.`;
    setResult({ tone: 'ok', text: `Reimpresión de la boleta ${r.folio} enviada a la impresora.${detail}` });
  };

  return (
    <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="font-semibold text-amber-900">Reimpresión térmica 80 mm de una boleta emitida (prueba)</p>
      <p className="mt-1 text-amber-800">
        Imprime una copia rotulada como REIMPRESION desde el XML firmado. No emite, no consume folios y no
        modifica la boleta ni su estado en el SII.
      </p>

      {fileMode && (
        <label className="mt-3 flex flex-col text-xs text-amber-900">
          XML de la boleta (DTE 39)
          <input
            type="file"
            accept=".xml,application/xml,text/xml"
            onChange={(event) => { setFile(event.target.files?.[0] || null); setResult(null); }}
            className="mt-1 text-sm"
          />
        </label>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-amber-900">
          Resolución SII N.º
          <input value={resolucion.numero} onChange={updateRes('numero')} inputMode="numeric"
            className="mt-1 w-24 rounded border border-amber-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-amber-900">
          Año
          <input value={resolucion.anio} onChange={updateRes('anio')} inputMode="numeric"
            className="mt-1 w-20 rounded border border-amber-300 px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col text-xs text-amber-900">
          Modo del timbre
          <select value={strategyId} onChange={updateStrategy}
            className="mt-1 rounded border border-amber-300 bg-white px-2 py-1 text-sm">
            {SELECTABLE_TIMBRE_STRATEGY_IDS.map((id, i) => (
              <option key={id} value={id}>{`${VARIANT_LETTERS[i]}) ${TIMBRE_STRATEGIES[id].label}`}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => run('diag')} disabled={!!busy || !sourceReady}
          className="rounded-lg border border-amber-400 px-3 py-2 font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50">
          {busy === 'diag' ? 'Imprimiendo...' : '1. Diagnóstico del timbre'}
        </button>
        <button type="button" onClick={() => run('boleta')} disabled={!!busy || !sourceReady}
          className="rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
          {busy === 'boleta' ? 'Imprimiendo...' : '2. Reimprimir boleta'}
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
