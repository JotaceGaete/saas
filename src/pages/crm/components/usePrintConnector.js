import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildConnectorConfigKey, defaultConnectorConfig, readConnectorConfig, writeConnectorConfig,
} from 'lib/printing/connectorConfigStorage';
import { createLocalConnectorProvider } from 'lib/printing/providers/localConnectorProvider';
import { resolvePrintRoute, ROUTE, connectorStatusView } from 'lib/printing/printRouting';

// Estado único del Walinka Print Connector para la pantalla de impresión.
// La pantalla no decide la ruta: solo la muestra. La ruta real la decide
// resolvePrintRoute (printRouting.js), igual que en el TPV.

const CODE_PATTERN = /^\d{6}$/;
const DEVICE_NAME = 'Caja Walinka';

function messageFor(err) {
  return err?.message || 'Ocurrió un error con el conector.';
}

export function usePrintConnector(businessId) {
  const configKey = useMemo(() => buildConnectorConfigKey(businessId), [businessId]);
  const [config, setConfig] = useState(() => defaultConnectorConfig());
  const [health, setHealth] = useState('checking'); // checking | ok | unreachable
  const [healthError, setHealthError] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message } | null

  useEffect(() => {
    setConfig(readConnectorConfig(configKey));
  }, [configKey]);

  const persist = useCallback((next) => {
    setConfig(next);
    if (configKey) writeConnectorConfig(configKey, next);
  }, [configKey]);

  const provider = useMemo(
    () => createLocalConnectorProvider({ baseUrl: config.baseUrl, token: config.token }),
    [config.baseUrl, config.token],
  );

  const route = resolvePrintRoute(config);
  const active = route === ROUTE.CONNECTOR;
  const paired = Boolean(config.token);

  const refresh = useCallback(async () => {
    setHealthError(null);
    try {
      await provider.connect();
      setHealth('ok');
      setPrinters(config.token ? await provider.listPrinters() : []);
    } catch (err) {
      setHealth('unreachable');
      setPrinters([]);
      setHealthError(messageFor(err));
    }
  }, [provider, config.token]);

  useEffect(() => { refresh(); }, [refresh]);

  const pair = async (code) => {
    if (!CODE_PATTERN.test(code) || busy) return false;
    setBusy(true);
    setResult(null);
    try {
      const token = await provider.pair(code, DEVICE_NAME);
      persist({ ...config, token, enabled: true, deviceName: DEVICE_NAME });
      setResult({ ok: true, message: 'Equipo emparejado. Elige la impresora del conector.' });
      return true;
    } catch (err) {
      setResult({ ok: false, message: messageFor(err) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const selectPrinter = (printerName) => {
    persist({ ...config, printerName: printerName || null });
    setResult(null);
  };

  const setEnabled = (enabled) => {
    persist({ ...config, enabled: enabled && paired });
    setResult(null);
  };

  const unpair = () => {
    persist({ ...defaultConnectorConfig(), baseUrl: config.baseUrl });
    setPrinters([]);
    setResult({ ok: true, message: 'Equipo desvinculado. Las ventas volverán a imprimir por QZ Tray.' });
  };

  const status = connectorStatusView({
    active,
    paired,
    health,
    printerName: config.printerName,
  });

  return {
    config,
    provider,
    active,
    paired,
    health,
    healthError,
    printers,
    printerName: config.printerName,
    busy,
    setBusy,
    result,
    setResult,
    status,
    refresh,
    pair,
    selectPrinter,
    setEnabled,
    unpair,
  };
}
