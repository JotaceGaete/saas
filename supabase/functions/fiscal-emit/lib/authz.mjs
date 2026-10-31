// Autorización por rol. Ser dueño de wa_businesses NO basta: la acción exige un rol fiscal activo
// (fiscal.business_fiscal_roles, vía fiscal.actor_role). La comprobación de tenant ocurre antes,
// en lib/emit.mjs, y responde SALE_NOT_FOUND para no revelar existencia entre comercios.
//
// Matriz (acción -> roles que pueden ejecutarla):
//   emit      -> fiscal_owner, fiscal_operator   (solo servidor; sin reconciliación)
//   reprint   -> fiscal_owner, fiscal_operator, fiscal_viewer   (PDF ya guardado, sin proveedor)
//   reconcile -> NO está en esta matriz. Se autoriza por separado en lib/reconciler.mjs.

export const ROLE_ACTIONS = Object.freeze({
  emit: Object.freeze(['fiscal_owner', 'fiscal_operator']),
  reprint: Object.freeze(['fiscal_owner', 'fiscal_operator', 'fiscal_viewer']),
});

// fiscal_reconciler es administrativo: NO emite ni reimprime. Solo lo usa lib/reconciler.mjs
// (createAdminReconciler), y se comprueba con hasRole, no con el rol de mayor privilegio.
export const RECONCILER_ROLE = 'fiscal_reconciler';
export const ROLES = Object.freeze(['fiscal_owner', 'fiscal_operator', 'fiscal_viewer', RECONCILER_ROLE]);

export function authorizeAction(role, action) {
  if (!role || !ROLES.includes(role)) return false;
  return (ROLE_ACTIONS[action] ?? []).includes(role);
}
