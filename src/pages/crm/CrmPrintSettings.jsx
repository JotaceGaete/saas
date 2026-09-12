import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from 'contexts/AuthContext';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { printService } from 'lib/printing/printService';
import { buildTestReceipt } from 'lib/printing/receipts/renderEscPosReceipt';
import { buildPrinterConfigKey, readPrinterConfig, writePrinterConfig } from 'lib/printing/printerConfigStorage';

// PRINT-1 — pantalla aislada de configuración/prueba de impresión térmica.
// No toca CrmTerminal.jsx ni el flujo de cobro: solo permite elegir la
// impresora de este equipo (vía QZ Tray) y enviarle un ticket de prueba.
// La impresión automática al cobrar queda fuera de este alcance.

const QZ_STATUS = {
  checking: { label: 'Verificando…', dot: 'bg-slate-300' },
  connected: { label: 'Conectado', dot: 'bg-emerald-500' },
  disconnected: { label: 'Desconectado', dot: 'bg-slate-300 border border-slate-400' },
};

export default function CrmPrintSettings() {
  const { business } = useAuth();
  const configKey = useMemo(() => buildPrinterConfigKey(business?.id), [business?.id]);

  const [config, setConfig] = useState(() => readPrinterConfig(null));
  const [qzStatus, setQzStatus] = useState('checking');
  const [printers, setPrinters] = useState([]);
  const [printersError, setPrintersError] = useState(null);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printResult, setPrintResult] = useState(null); // { ok, message } | null

  useEffect(() => {
    setConfig(readPrinterConfig(configKey));
  }, [configKey]);

  const refreshPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    setPrintersError(null);
    setPrintResult(null);
    try {
      await printService.connect();
      setQzStatus('connected');
      const list = await printService.listPrinters();
      setPrinters(list);
    } catch (err) {
      setQzStatus(printService.isAvailable() ? 'connected' : 'disconnected');
      setPrinters([]);
      setPrintersError(err?.message || 'No se pudo conectar con QZ Tray.');
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  useEffect(() => { refreshPrinters(); }, [refreshPrinters]);

  const handleSelectPrinter = (printerName) => {
    const next = { ...config, printerName: printerName || null };
    setConfig(next);
    setPrintResult(null);
    if (configKey) writePrinterConfig(configKey, next);
  };

  const handlePrintTest = async () => {
    if (!config.printerName || printing) return;
    setPrinting(true);
    setPrintResult(null);
    try {
      const receipt = buildTestReceipt({
        businessName: business?.name,
        printerName: config.printerName,
        paperWidthMm: config.paperWidthMm,
      });
      await printService.printReceipt(receipt, { printerName: config.printerName });
      setPrintResult({ ok: true, message: 'Ticket de prueba enviado a la impresora.' });
    } catch (err) {
      setPrintResult({ ok: false, message: err?.message || 'No se pudo imprimir el ticket de prueba.' });
    } finally {
      setPrinting(false);
    }
  };

  const status = QZ_STATUS[qzStatus];
  const savedPrinterMissing = Boolean(config.printerName) && qzStatus === 'connected' && !printers.includes(config.printerName);
  const canPrint = qzStatus === 'connected' && Boolean(config.printerName) && !printing;

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Icon name="Printer" size={16} />
            </span>
            <h1 className="text-base font-bold text-slate-900">Impresión del TPV</h1>
          </div>
        }
        subtitle={
          <p className="text-xs text-slate-500">Configura y prueba la impresora térmica de este equipo.</p>
        }
      />

      <DashboardLayoutContent innerClassName="lg:max-w-2xl">
        <section aria-label="Impresión del TPV" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado QZ Tray</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          </div>

          {qzStatus === 'disconnected' && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <Icon name="AlertTriangle" size={14} className="mt-0.5 shrink-0" />
              <span>
                No se detectó QZ Tray en este equipo. Verifica que la aplicación esté instalada y
                en ejecución, luego pulsa "Actualizar impresoras".
                {printersError && <> ({printersError})</>}
              </span>
            </div>
          )}

          <div className="mt-4">
            <label htmlFor="print-printer-select" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Impresora
            </label>
            <select
              id="print-printer-select"
              value={config.printerName || ''}
              onChange={(e) => handleSelectPrinter(e.target.value)}
              disabled={qzStatus !== 'connected' || printers.length === 0}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">
                {qzStatus === 'connected' && printers.length === 0 ? 'Sin impresoras detectadas' : 'Selecciona una impresora'}
              </option>
              {printers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            {savedPrinterMissing && (
              <p className="mt-1.5 text-xs text-amber-700">
                La impresora guardada ("{config.printerName}") ya no aparece en este equipo.
              </p>
            )}
            {qzStatus === 'connected' && printers.length === 0 && !savedPrinterMissing && (
              <p className="mt-1.5 text-xs text-slate-400">
                QZ Tray está conectado pero no reporta impresoras instaladas en este equipo.
              </p>
            )}
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Papel</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-700">{config.paperWidthMm} mm</p>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={refreshPrinters}
              disabled={loadingPrinters}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Icon name={loadingPrinters ? 'Loader2' : 'RefreshCw'} size={15} className={loadingPrinters ? 'animate-spin' : ''} />
              Actualizar impresoras
            </button>
            <button
              type="button"
              onClick={handlePrintTest}
              disabled={!canPrint}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              <Icon name={printing ? 'Loader2' : 'Printer'} size={15} className={printing ? 'animate-spin' : ''} />
              Imprimir ticket de prueba
            </button>
          </div>

          {printResult && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs ${printResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              <Icon name={printResult.ok ? 'CheckCircle2' : 'AlertCircle'} size={14} className="mt-0.5 shrink-0" />
              <span>{printResult.message}</span>
            </div>
          )}

          <p className="mt-5 text-xs text-slate-400">
            Este ticket de prueba no está conectado al flujo de cobro del Terminal de ventas: es
            solo para validar la conexión con tu impresora térmica.
          </p>
        </section>
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
