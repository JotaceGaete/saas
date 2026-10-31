const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Access control for panel endpoints: a valid session AND ownership of the exact
 * business requested. Returns the actor id only when both hold.
 */
export function createBusinessOwnerGuard({ authenticate, admin }) {
  if (typeof authenticate !== 'function' || !admin?.from) throw new Error('Trusted auth and admin client required');
  return async function assertOwner({ bearer, businessId }) {
    if (typeof bearer !== 'string' || !/^Bearer [^\s]+$/.test(bearer)) return { ok: false, status: 401, error: 'UNAUTHORIZED' };
    if (!UUID.test(businessId || '')) return { ok: false, status: 400, error: 'INVALID_REQUEST' };
    let actorId;
    try {
      actorId = await authenticate(bearer.slice(7));
    } catch {
      return { ok: false, status: 401, error: 'UNAUTHORIZED' };
    }
    if (!UUID.test(actorId || '')) return { ok: false, status: 401, error: 'UNAUTHORIZED' };
    const { data: business, error } = await admin.from('wa_businesses')
      .select('id,user_id,country_code,is_active').eq('id', businessId).maybeSingle();
    if (error) return { ok: false, status: 503, error: 'SERVER_ERROR' };
    if (!business || business.user_id !== actorId || business.is_active === false) {
      return { ok: false, status: 403, error: 'BUSINESS_NOT_AUTHORIZED' };
    }
    return { ok: true, actorId };
  };
}
