// Revisión de altas de facturación electrónica por Walinka. Lógica sin dependencia del runtime.
//
// Reglas:
//  - Solo administradores de Walinka (auth app_metadata.role = 'admin'). La guarda llega decidida
//    (assertAdmin) y la base vuelve a comprobarlo dentro de crm_fiscal_review_application.
//  - Nunca devuelve la API key ni datos cifrados: la cola solo trae RUT, resolución y estado.
//  - Rechazar o suspender exige un motivo, que ve el comercio.
//  - Aprobar exige que el negocio esté en la lista del servidor CON el RUT de su solicitud
//    (FISCAL_ALLOWED_ISSUERS). Rechazar y suspender se permiten siempre.

import { isAllowlist } from '../../supabase/functions/fiscal-emit/lib/allowlist.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const REVIEW_STATUSES = Object.freeze(['draft', 'pending_review', 'approved', 'rejected', 'suspended']);
export const REVIEW_DECISIONS = Object.freeze(['approve', 'reject', 'suspend']);
const REVIEW_FIELDS = new Set(['action', 'businessId', 'decision', 'note']);

function fail(status, error) {
  return { status, body: { error } };
}

function mapDbError(err) {
  const msg = String(err?.message ?? '');
  if (msg.includes('FISCAL_REVIEWER_NOT_ADMIN')) return fail(403, 'ADMIN_REQUIRED');
  if (msg.includes('FISCAL_APPLICATION_NOT_FOUND')) return fail(404, 'APPLICATION_NOT_FOUND');
  if (msg.includes('FISCAL_REVIEW_STATE')) return fail(409, 'REVIEW_STATE_CHANGED');
  if (msg.includes('FISCAL_APPLICATION_INCOMPLETE')) return fail(409, 'APPLICATION_INCOMPLETE');
  if (msg.includes('FISCAL_REVIEW_NOTE_REQUIRED')) return fail(400, 'NOTE_REQUIRED');
  if (msg.includes('FISCAL_REVIEW_INVALID')) return fail(400, 'INVALID_REVIEW');
  // Migración H: solo se aprueba si la API key vigente pertenece al RUT del comercio.
  if (msg.includes('FISCAL_IDENTITY_NOT_VERIFIED')) return fail(409, 'IDENTITY_NOT_VERIFIED');
  return fail(503, 'SERVER_ERROR');
}

export function createFiscalApplicationsService({ admin, allowedIssuers }) {
  if (!admin || typeof admin.rpc !== 'function') throw new Error('admin client with rpc required');
  if (!isAllowlist(allowedIssuers)) throw new Error('allowedIssuers required (fail-closed)');

  async function list({ status = null } = {}) {
    if (status !== null && !REVIEW_STATUSES.includes(status)) return fail(400, 'INVALID_STATUS');
    const { data, error } = await admin.rpc('crm_fiscal_list_applications', { p_status: status });
    if (error) return mapDbError(error);
    return { status: 200, body: { applications: Array.isArray(data) ? data : [] } };
  }

  async function review({ adminId, body }) {
    for (const key of Object.keys(body)) {
      if (!REVIEW_FIELDS.has(key)) return fail(400, 'UNKNOWN_FIELD');
    }
    if (!UUID.test(String(body.businessId ?? ''))) return fail(400, 'INVALID_REQUEST');
    if (!REVIEW_DECISIONS.includes(body.decision)) return fail(400, 'INVALID_REVIEW');
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 500) return fail(400, 'INVALID_REVIEW');
    if (body.decision !== 'approve' && !note) return fail(400, 'NOTE_REQUIRED');
    if (body.decision === 'approve') {
      // El RUT se lee de la base (el de la solicitud), nunca del cuerpo de la petición.
      const { data, error: readError } = await admin.rpc('crm_fiscal_connection_status', { p_business_id: body.businessId });
      if (readError) return mapDbError(readError);
      if (!allowedIssuers.permits(body.businessId, data?.issuerRut ?? null)) return fail(403, 'FISCAL_BUSINESS_NOT_ALLOWED');
    }

    const { error } = await admin.rpc('crm_fiscal_review_application', {
      p_business_id: body.businessId,
      p_admin_user_id: adminId,
      p_decision: body.decision,
      p_note: note || null,
    });
    if (error) return mapDbError(error);
    return list({ status: null });
  }

  return Object.freeze({ list, review });
}
