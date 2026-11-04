// Cliente de la conexión DTECore por comercio (Configuración → Facturación electrónica).
//
// Reglas:
//  - La API key viaja solo en el cuerpo de un POST, nunca en la URL ni en un log.
//  - Ninguna función devuelve la clave: las respuestas son solo el estado de la conexión.
//  - Los errores se traducen a códigos estables; el mensaje visible sale de describeFiscalError.

import { supabase } from '../lib/supabase';

export class FiscalConnectionError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.name = 'FiscalConnectionError';
    this.code = code;
    this.status = status;
  }
}

export const FISCAL_ERROR_MESSAGES = Object.freeze({
  AUTH_REQUIRED: 'Debes iniciar sesión para gestionar la facturación.',
  NETWORK_ERROR: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  BUSINESS_NOT_AUTHORIZED: 'Solo el propietario del negocio puede gestionar la facturación electrónica.',
  INVALID_RUT: 'El RUT no es válido. Revisa el dígito verificador.',
  INVALID_API_KEY: 'La API key no tiene un formato válido.',
  FISCAL_OPERATION_IN_PROGRESS: 'Hay una emisión en curso. Vuelve a intentarlo cuando termine.',
  UNKNOWN_FIELD: 'La solicitud contiene datos no permitidos.',
  SERVER_NOT_CONFIGURED: 'La facturación electrónica no está disponible en este momento.',
  SERVER_ERROR: 'No pudimos guardar los cambios. Inténtalo de nuevo.',
  INVALID_RESOLUCION: 'Revisa la resolución del SII: número entero y fecha válida (no futura).',
  INVALID_SUCURSAL: 'El código de sucursal del SII debe tener solo números.',
  API_KEY_REQUIRED: 'Ingresa tu API key de DTE Core.',
  INVALID_APPLICATION: 'Revisa los datos de la solicitud.',
  INVALID_TAX_CATEGORY: 'Elige un tratamiento de IVA válido.',
});

export function describeFiscalError(err) {
  const code = err instanceof FiscalConnectionError ? err.code : 'SERVER_ERROR';
  return FISCAL_ERROR_MESSAGES[code] ?? FISCAL_ERROR_MESSAGES.SERVER_ERROR;
}

async function authorizationHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new FiscalConnectionError('AUTH_REQUIRED', 401);
  return `Bearer ${token}`;
}

async function request(businessId, { method = 'GET', body } = {}) {
  const headers = { Authorization: await authorizationHeader() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const params = new URLSearchParams({ businessId });

  let response;
  try {
    response = await fetch(`/api/fiscal/connection?${params}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new FiscalConnectionError('NETWORK_ERROR');
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new FiscalConnectionError(json?.error || 'SERVER_ERROR', response.status);
  }
  if (!json?.connection) return null;
  // GET informa si el negocio está en la lista de empresas autorizadas del servidor.
  return typeof json.allowed === 'boolean' ? { ...json.connection, allowed: json.allowed } : json.connection;
}

export function getFiscalConnection(businessId) {
  return request(businessId);
}

// La clave se envía una sola vez en el cuerpo. El llamador debe limpiarla al terminar.
export function connectFiscal(businessId, { issuerRut, apiKey }) {
  return request(businessId, { method: 'POST', body: { action: 'connect', issuerRut, apiKey } });
}

/**
 * Formulario único: RUT + API key (opcional si ya está guardada para el mismo RUT) + resolución
 * SII + sucursal opcional. Envía la solicitud a revisión de Walinka; nunca habilita la emisión.
 */
export function submitFiscalApplication(businessId, {
  issuerRut, apiKey = '', resolucionNumero, resolucionFecha, sucursalNombre = '', sucursalCodigo = '',
}) {
  const body = { action: 'submit', issuerRut, resolucionNumero, resolucionFecha, sucursalNombre, sucursalCodigo };
  if (apiKey) body.apiKey = apiKey;
  return request(businessId, { method: 'POST', body });
}

/** category: 'IVA_AFECTO_19' | 'EXENTO' | 'NO_AFECTO' | null (sin categoría por defecto). */
export function setFiscalTaxDefault(businessId, category) {
  return request(businessId, { method: 'POST', body: { action: 'set-tax-default', category } });
}

export function disconnectFiscal(businessId) {
  return request(businessId, { method: 'POST', body: { action: 'disconnect' } });
}
