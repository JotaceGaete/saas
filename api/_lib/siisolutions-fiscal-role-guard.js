// Autorización de los endpoints de lectura fiscal (api/fiscal/document, download, pdf).
//
// Permiso = rol activo en fiscal.business_fiscal_roles, consultado con la RPC
// public.crm_fiscal_actor_role (SECURITY INVOKER, solo service_role). NO compara
// wa_businesses.user_id: al cambiar de dueño, el anterior pierde el acceso porque su fila de rol
// queda revocada por el trigger wa_businesses_owner_change.
//
// Roles de lectura: fiscal_owner, fiscal_operator, fiscal_viewer. El rol fiscal_reconciler NO lee
// por esta vía: su función es administrativa y vive fuera de la API pública.
//
// Historial: la guarda decide quién entra, no qué documento se devuelve. Los documentos emitidos
// antes del cambio se leen igual, porque el filtro por negocio y tipo de DTE de cada endpoint no cambia.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FISCAL_READ_ROLES = Object.freeze(['fiscal_owner', 'fiscal_operator', 'fiscal_viewer']);

export function createFiscalRoleGuard({ authenticate, admin, allowedRoles = FISCAL_READ_ROLES }) {
  if (typeof authenticate !== 'function' || typeof admin?.rpc !== 'function') {
    throw new Error('Trusted auth and admin client required');
  }
  const allowed = Object.freeze([...allowedRoles]);
  return async function assertFiscalRole({ bearer, businessId }) {
    if (typeof bearer !== 'string' || !/^Bearer [^\s]+$/.test(bearer)) return { ok: false, status: 401, error: 'UNAUTHORIZED' };
    if (!UUID.test(businessId || '')) return { ok: false, status: 400, error: 'INVALID_REQUEST' };
    let actorId;
    try {
      actorId = await authenticate(bearer.slice(7));
    } catch {
      return { ok: false, status: 401, error: 'UNAUTHORIZED' };
    }
    if (!UUID.test(actorId || '')) return { ok: false, status: 401, error: 'UNAUTHORIZED' };
    let role;
    try {
      const { data, error } = await admin.rpc('crm_fiscal_actor_role', { p_business_id: businessId, p_user_id: actorId });
      if (error) return { ok: false, status: 503, error: 'SERVER_ERROR' };
      role = data;
    } catch {
      return { ok: false, status: 503, error: 'SERVER_ERROR' };
    }
    // Sin fila activa (no miembro, dueño anterior, negocio inactivo) o rol fuera de la lista: denegado.
    if (typeof role !== 'string' || !allowed.includes(role)) {
      return { ok: false, status: 403, error: 'BUSINESS_NOT_AUTHORIZED' };
    }
    return { ok: true, actorId, role };
  };
}
