// E3 — configuración local del Walinka Print Connector, por negocio y por
// navegador. Separada de printerConfigStorage (QZ) a propósito: la impresora
// que lista el conector es la de Windows del equipo donde corre, y el token
// pertenece solo a este navegador. Nunca se guarda nada del comercio aquí.
//
// Seguridad: el token queda en localStorage de este origen. Es un secreto de
// equipo, de baja sensibilidad (solo permite imprimir en loopback con
// origen permitido); se puede revocar desde el conector.

import { DEFAULT_CONNECTOR_BASE_URL, assertLoopbackBaseUrl, createLocalConnectorProvider } from './providers/localConnectorProvider.js';

export const CONNECTOR_CONFIG_SCHEMA_VERSION = 1;

export function buildConnectorConfigKey(businessId) {
  const business = String(businessId || '').trim();
  if (!business) return null;
  return `walinka:print-connector:${business}`;
}

function defaultStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function defaultConnectorConfig() {
  return {
    schemaVersion: CONNECTOR_CONFIG_SCHEMA_VERSION,
    enabled: false,
    baseUrl: DEFAULT_CONNECTOR_BASE_URL,
    token: null,
    printerName: null,
    deviceName: null,
  };
}

function sanitize(raw) {
  const base = defaultConnectorConfig();
  if (!raw || typeof raw !== 'object') return base;
  let baseUrl = base.baseUrl;
  try {
    baseUrl = assertLoopbackBaseUrl(raw.baseUrl || base.baseUrl);
  } catch {
    baseUrl = base.baseUrl;
  }
  return {
    schemaVersion: CONNECTOR_CONFIG_SCHEMA_VERSION,
    enabled: raw.enabled === true,
    baseUrl,
    token: typeof raw.token === 'string' && raw.token.length >= 32 ? raw.token : null,
    printerName: typeof raw.printerName === 'string' && raw.printerName.trim() ? raw.printerName : null,
    deviceName: typeof raw.deviceName === 'string' ? raw.deviceName.slice(0, 64) : null,
  };
}

export function readConnectorConfig(key, storage = defaultStorage()) {
  if (!key || !storage) return defaultConnectorConfig();
  try {
    const text = storage.getItem(key);
    return sanitize(text ? JSON.parse(text) : null);
  } catch {
    return defaultConnectorConfig();
  }
}

export function writeConnectorConfig(key, config, storage = defaultStorage()) {
  if (!key || !storage) return false;
  try {
    storage.setItem(key, JSON.stringify(sanitize(config)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve un provider listo para imprimir, o null si el conector no está
 * activado, no está emparejado o no tiene impresora elegida. Quien llama
 * usa QZ en ese caso.
 */
export function buildConnectorTarget(config, { fetchImpl } = {}) {
  if (!config?.enabled || !config.token || !config.printerName) return null;
  return {
    connector: createLocalConnectorProvider({ baseUrl: config.baseUrl, token: config.token, fetchImpl }),
    printerName: config.printerName,
  };
}
