// Panel de Walinka → Facturación: cola de altas de facturación electrónica y su revisión.
// Solo administradores (lo exige el servidor y la base). Nunca recibe API keys.
import { supabase } from '../lib/supabase';

export const REVIEW_STATUS_LABELS = Object.freeze({
  draft: 'Sin enviar',
  pending_review: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  suspended: 'Suspendida',
});

const ERROR_MESSAGES = Object.freeze({
  AUTH_REQUIRED: 'Debes iniciar sesión.',
  ADMIN_REQUIRED: 'Solo administradores de Walinka pueden revisar altas.',
  NOTE_REQUIRED: 'Escribe el motivo: el comercio lo verá.',
  REVIEW_STATE_CHANGED: 'La solicitud cambió mientras la revisabas. Actualiza la lista.',
  APPLICATION_INCOMPLETE: 'La solicitud está incompleta (falta API key o resolución). No se puede aprobar.',
  IDENTITY_NOT_VERIFIED: 'No se puede aprobar: Walinka todavía no verificó con DTE Core que la API key pertenece al RUT del comercio.',
  APPLICATION_NOT_FOUND: 'La solicitud ya no existe.',
  NETWORK_ERROR: 'No pudimos conectar con el servidor.',
  SERVER_NOT_CONFIGURED: 'La facturación electrónica no está disponible en este entorno.',
});

export function describeAdminFiscalError(code) {
  return ERROR_MESSAGES[code] || 'No se pudo completar la acción. Inténtalo de nuevo.';
}

async function request({ method = 'GET', status = null, body } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { error: 'AUTH_REQUIRED' };
  const params = status ? `?${new URLSearchParams({ status })}` : '';
  let response;
  try {
    response = await fetch(`/api/fiscal/applications${params}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    return { error: 'NETWORK_ERROR' };
  }
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  if (!response.ok) return { error: json?.error || 'SERVER_ERROR' };
  return { applications: Array.isArray(json?.applications) ? json.applications : [] };
}

export function listFiscalApplications(status = null) {
  return request({ status });
}

/** decision: 'approve' | 'reject' | 'suspend'. Rechazar y suspender exigen motivo. */
export function reviewFiscalApplication(businessId, decision, note = '') {
  return request({ method: 'POST', body: { action: 'review', businessId, decision, ...(note ? { note } : {}) } });
}
