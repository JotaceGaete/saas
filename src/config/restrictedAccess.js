/**
 * Interruptor único del modo de acceso restringido (mantenimiento temporal).
 * Cuando VITE_RESTRICTED_ACCESS !== 'true', el comportamiento de la app es
 * exactamente el normal -- ningún otro archivo debe leer esta env var directo.
 */
export function isRestrictedAccessEnabled() {
  return import.meta.env.VITE_RESTRICTED_ACCESS === 'true';
}
