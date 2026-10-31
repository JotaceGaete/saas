import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from 'components/AppIcon';
import {
  buildConnectorConfigKey, buildConnectorTarget, defaultConnectorConfig, readConnectorConfig, writeConnectorConfig,
} from 'lib/printing/connectorConfigStorage';
import { createLocalConnectorProvider } from 'lib/printing/providers/localConnectorProvider';

// E3 — sección "Walinka Print Connector" de Configuración de impresión.
// Convive con QZ Tray: si el conector no está activo y emparejado en este
// equipo, el TPV sigue imprimiendo por QZ. No toca el flujo de cobro.

const CODE_PATTERN = /^\d{6}$/;

function messageFor(err) {
  return err?.message || 'Ocurrió un error con el conector.';
}

export default function PrintConnectorSection({ businessId }) {
  const configKey = useMemo(() => buildConnectorConfigKey(businessId), [businessId]);
  const [config, setConfig] = useState(() => defaultConnectorConfig());
  const [health, setHealth] = useState('checking'); // checking | ok | unreachable
  const [healthError, setHealthError] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message } | null

  useEffect(() => {
    setConfig(readConnectorConfig(configKey));
  }, [configKey]);

  const save = useCallback((next) => {
    setConfig(next);
    if (configKey) writeConnectorConfig(configKey, next);
  }, [configKey]);

  const provider = useMemo(
    () => createLocalConnectorProvider({ baseUrl: config.baseUrl, token: config.token }),
    [config.baseUrl, config.token],
  );

  const refresh = useCallback(async () => {
    setHealthError(null);
    try {
      await provider.connect();
      setHealth('ok');
      if (config.token) {
        setPrinters(await provider.listPrinters());
      }
    } catch (err) {
      setHealth('unreachable');
      setPrinters([]);
      setHealthError(messageFor(err));
    }
  }, [provider, config.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const handlePair = async () => {
    if (!CODE_PATTERN.test(code) || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const token = await provider.pair(code, 'Caja Walinka');
      save({ ...config, token, enabled: true, deviceName: 'Caja Walinka' });
      setCode('');
      setResult({ ok: true, message: 'Equipo emparejado. Elige la impresora del conector.' });
    } catch (err) {
      setResult({ ok: false, message: messageFor(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleSelectPrinter = (printerName) => {
    save({ ...config, printerName: printerName || null });
    setResult(null);
  };

  const handleToggleEnabled = () => {
    save({ ...config, enabled: !config.enabled });
    setResult(null);
  };

  const handleUnpair = () => {
    save({ ...defaultConnectorConfig(), baseUrl: config.baseUrl });
    setPrinters([]);
    setResult({ ok: true, message: 'Equipo desvinculado. Las ventas volverán a imprimir por QZ Tray.' });
  };

  const handleTestCut = async () => {
    if (!config.printerName || busy) return;
    setBusy(true);
    setResult(null);
    try {
      await provider.testPrinter(config.printerName);
      setResult({ ok: true, message: 'Prueba de corte enviada. Revisa que la impresora haya cortado el papel.' });
    } catch (err) {
      setResult({ ok: false, message: messageFor(err) });
    } finally {
      setBusy(false);
    }
  };

  const active = Boolean(buildConnectorTarget(config));
  const paired = Boolean(config.token);
  const healthDot = health === 'ok' ? 'bg-emerald-500' : health === 'checking' ? 'bg-slate-300' : 'bg-rose-400';
  const healthLabel = health === 'ok' ? 'Conector disponible' : health === 'checking' ? 'Verificando…' : 'Conector no encontrado';

  return (
    <section aria-label="Walinka Print Connector" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Walinka Print Connector</p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
          <span className={`h-2.5 w-2.5 rounded-full ${healthDot}`} />
          {healthLabel}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Imprime tickets directamente en Windows, sin QZ Tray. Si no está activo, las ventas siguen imprimiendo por QZ Tray.
      </p>

      {health === 'unreachable' && healthError && (
        <p className="mt-2 text-xs text-amber-700">{healthError}</p>
      )}

      {!paired && (
        <div className="mt-4">
          <label htmlFor="connector-pair-code" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Código de emparejamiento
          </label>
          <p className="mt-1 text-xs text-slate-500">En este equipo ejecuta WalinkaPrintConnector.exe pair y escribe aquí el código de 6 dígitos que aparece (vale 5 minutos).</p>
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
              disabled={!CODE_PATTERN.test(code) || busy || health !== 'ok'}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Emparejar
            </button>
          </div>
        </div>
      )}

      {paired && (
        <>
          <div className="mt-4">
            <label htmlFor="connector-printer-select" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Impresora del conector
            </label>
            <select
              id="connector-printer-select"
              value={config.printerName || ''}
              onChange={(e) => handleSelectPrinter(e.target.value)}
              disabled={health !== 'ok' || printers.length === 0}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">{printers.length === 0 ? 'Sin impresoras detectadas' : 'Selecciona una impresora'}</option>
              {printers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleTestCut}
              disabled={!config.printerName || busy || health !== 'ok'}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Icon name={busy ? 'Loader2' : 'Scissors'} size={15} className={busy ? 'animate-spin' : ''} />
              Probar corte
            </button>
            <button
              type="button"
              onClick={handleToggleEnabled}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {config.enabled ? 'Desactivar para ventas' : 'Activar para ventas'}
            </button>
            <button
              type="button"
              onClick={handleUnpair}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              Desvincular
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            {active
              ? 'Las ventas y reimpresiones salen por el conector.'
              : config.enabled
                ? 'Elige una impresora para que las ventas salgan por el conector.'
                : 'Conector pausado: las ventas salen por QZ Tray.'}
          </p>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={refresh} disabled={busy} className="text-xs font-semibold text-slate-600 underline underline-offset-2 disabled:opacity-40">
          Verificar conector
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
