/**
 * Interruptor único del modo de acceso restringido (mantenimiento temporal).
 * Cuando VITE_RESTRICTED_ACCESS !== 'true', el comportamiento de la app es
 * exactamente el normal -- ningún otro archivo debe leer esta env var directo.
 */
export function isRestrictedAccessEnabled() {
  return import.meta.env.VITE_RESTRICTED_ACCESS === 'true';
}

/** Excepción temporal para el usuario propietario de Artemis Chile. */
const ALLOWED_MAINTENANCE_USER_IDS = new Set(['75627d19-d67d-48b5-b975-cbe0ce7eb680']);

export function isRestrictedAccessAllowedUser(user) {
  return typeof user?.id === 'string' && ALLOWED_MAINTENANCE_USER_IDS.has(user.id);
}
