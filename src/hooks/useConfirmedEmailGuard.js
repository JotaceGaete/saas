import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';

export const BLOCKED_MESSAGE = 'Debes confirmar tu correo para usar esta función.';

/**
 * Guard central para bloquear acciones sensibles cuando el email no está confirmado.
 * Uso: const guard = useConfirmedEmailGuard();
 *      guard.runIfConfirmed(() => { ...acción sensible... });
 *      o: if (guard.isBlocked) { toast.warning(BLOCKED_MESSAGE); return; }
 */
export function useConfirmedEmailGuard() {
  const { isAuthenticated, isEmailConfirmed } = useAuth();
  const toast = useToast();

  const isBlocked = isAuthenticated && !isEmailConfirmed;

  const runIfConfirmed = useCallback(
    (fn) => {
      if (isBlocked) {
        toast?.warning?.(BLOCKED_MESSAGE);
        if (typeof window !== 'undefined') {
          console.log('[useConfirmedEmailGuard] acción bloqueada (email no confirmado)');
        }
        return;
      }
      if (typeof fn === 'function') fn();
    },
    [isBlocked, toast]
  );

  const runIfConfirmedAsync = useCallback(
    async (fn) => {
      if (isBlocked) {
        toast?.warning?.(BLOCKED_MESSAGE);
        if (typeof window !== 'undefined') {
          console.log('[useConfirmedEmailGuard] acción bloqueada (email no confirmado)');
        }
        return;
      }
      if (typeof fn === 'function') return fn();
    },
    [isBlocked, toast]
  );

  return {
    isBlocked,
    blockedMessage: BLOCKED_MESSAGE,
    runIfConfirmed,
    runIfConfirmedAsync,
  };
}
