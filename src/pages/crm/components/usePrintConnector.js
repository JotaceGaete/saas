import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildConnectorConfigKey, defaultConnectorConfig, readConnectorConfig, writeConnectorConfig,
} from 'lib/printing/connectorConfigStorage';
import { createLocalConnectorProvider } from 'lib/printing/providers/localConnectorProvider';
import { resolvePrintRoute, ROUTE, connectorStatusView } from 'lib/printing/printRouting';
import {
  APPROVAL_WAITING_MESSAGE, checkConnector, describeVerify, requestOriginApproval,
} from 'lib/printing/connectorHealth';

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
  const [originBlocked, setOriginBlocked] = useState(false);
  const [approving, setApproving] = useState(false);
  const mounted = useRef(true);
  const [printers, setPrinters] = useState([]);
  const [printersError, setPrintersError] = useState(null);
  const [version, setVersion] = useState(null);
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
    const state = await checkConnector({
      provider,
      hasToken: Boolean(config.token),
      pageOrigin: typeof window !== 'undefined' ? window.location?.origin : null,
    });
    setHealth(state.health);
    setHealthError(state.healthError);
    setOriginBlocked(Boolean(state.originBlocked));
    setPrinters(state.printers);
    setPrintersError(state.printersError);
    setVersion(state.version);
    return state;
  }, [provider, config.token]);

  // Acción del botón «Verificar conector»: muestra siempre un resultado visible.
  const verify = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const state = await refresh();
      setResult(describeVerify(state, Boolean(config.token)));
    } finally {
      setBusy(false);
    }
  }, [refresh, config.token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // «Autorizar este sitio»: el conector muestra una ventana en Windows y solo
  // agrega este origen si el usuario la confirma. Aquí solo se espera.
  const requestApproval = useCallback(async () => {
    if (approving) return false;
    setApproving(true);
    setResult({ ok: true, message: APPROVAL_WAITING_MESSAGE });
    try {
      const outcome = await requestOriginApproval({
        provider,
        recheck: refresh,
        isCancelled: () => !mounted.current,
      });
      if (outcome.reason === 'cancelled' || !mounted.current) return false;
      setResult({ ok: outcome.ok, message: outcome.message });
      return outcome.ok;
    } finally {
      if (mounted.current) setApproving(false);
    }
  }, [approving, provider, refresh]);

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
    printersError,
  });

  return {
    config,
    provider,
    active,
    paired,
    health,
    healthError,
    originBlocked,
    approving,
    requestApproval,
    printers,
    printersError,
    printerName: config.printerName,
    busy,
    setBusy,
    result,
    setResult,
    status,
    refresh,
    verify,
    version,
    pair,
    selectPrinter,
    setEnabled,
    unpair,
  };
}
