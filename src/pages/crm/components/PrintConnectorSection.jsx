import React, { useState } from 'react';
import Icon from 'components/AppIcon';
import { CONNECTOR_TONE_CLASSES } from 'lib/printing/printRouting';

// Tarjeta del Walinka Print Connector. Presentacional: el estado vive en
// usePrintConnector (ver CrmPrintSettings). La ruta de impresión la decide
// printRouting.js, nunca esta tarjeta.

const CONNECTOR_DOWNLOAD_URL = 'https://github.com/JotaceGaete/saas/releases/download/print-connector-v0.3.0/WalinkaPrintConnector-Setup-0.3.0.exe';

export default function PrintConnectorSection({ connector }) {
  const [code, setCode] = useState('');
  const { status, health, healthError, printersError, paired, active, config, busy, result } = connector;

  const handlePair = async () => {
    const ok = await connector.pair(code);
    if (ok) setCode('');
  };

  return (
    <section aria-label="Walinka Print Connector" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Walinka Print Connector</p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
          <span className={`h-2.5 w-2.5 rounded-full ${CONNECTOR_TONE_CLASSES[status.tone]}`} />
          {status.label}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        {active
          ? 'Las ventas y las pruebas salen por este conector, sin QZ Tray.'
          : 'Imprime directo en Windows, sin licencias. Mientras esté pausado o sin emparejar, las ventas usan QZ Tray.'}
      </p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Conector para Windows</p>
            <p className="mt-1 text-xs text-slate-600">Versión 0.3.0 (preliminar). Instálalo una vez para imprimir directamente desde Walinka.</p>
          </div>
          <a
            href={CONNECTOR_DOWNLOAD_URL}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            download
          >
            <Icon name="Download" size={16} />
            Descargar para Windows
          </a>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          El instalador todavía no está firmado digitalmente y Windows puede mostrar una advertencia. Descárgalo únicamente desde este enlace oficial.
        </p>
      </div>

      {health === 'unreachable' && healthError && (
        <p className="mt-2 text-xs text-amber-700">{healthError}</p>
      )}
      {health === 'ok' && printersError && (
        <p className="mt-2 text-xs text-amber-700">{printersError}</p>
      )}

      {!paired && (
        <div className="mt-4">
          <label htmlFor="connector-pair-code" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Código de emparejamiento
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Abre «Emparejar con Walinka» desde el menú Inicio de Windows y escribe aquí el código de 6 dígitos (válido durante 5 minutos).
          </p>
          <div className="mt-2 flex gap-2">
            <input
              id="connector-pair-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-32 rounded-xl border border-slate-200 px-3 py-2.5 text-center text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="000000"
            />
            <button
              type="button"
              onClick={handlePair}
              disabled={!/^\d{6}$/.test(code) || busy || health !== 'ok'}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Emparejar
            </button>
          </div>
        </div>
      )}

      {paired && (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={config.enabled}
                onChange={(e) => connector.setEnabled(e.target.checked)}
              />
              Usar para ventas
            </label>
            <button
              type="button"
              onClick={connector.unpair}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              Desvincular
            </button>
          </div>
        </>
      )}

      <div className="mt-3">
        <button type="button" onClick={connector.verify} disabled={busy} className="text-xs font-semibold text-slate-600 underline underline-offset-2 disabled:opacity-40">
          {busy ? 'Verificando…' : 'Verificar conector'}
        </button>
      </div>

      {result && (
        <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          <Icon name={result.ok ? 'CheckCircle2' : 'AlertCircle'} size={14} className="mt-0.5 shrink-0" />
          <span>{result.message}</span>
        </div>
      )}
    </section>
  );
}
