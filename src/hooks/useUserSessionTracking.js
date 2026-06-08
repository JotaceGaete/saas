import { useEffect, useRef } from 'react';
import {
  startSession,
  startHeartbeat,
  stopHeartbeat,
  endSession,
  registerActivityListeners,
  registerUnloadHandler,
  getCurrentSessionId,
} from '../services/userSessionService';

/**
 * Tracks user sessions in Supabase.
 * Uses stable primitive deps (user?.id, business?.id) to avoid spurious re-runs.
 * hasStartedRef prevents double-invocation under React StrictMode.
 */
export function useUserSessionTracking(user, business) {
  const sessionIdRef = useRef(null);
  const cleanupRef = useRef(null);
  const hasStartedRef = useRef(false);

  const userId = user?.id;
  const businessId = business?.id;

  useEffect(() => {
    if (!userId || !businessId) return;
    // Guard against StrictMode double-invocation and repeated business loads
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let cancelled = false;

    const init = async () => {
      const id = await startSession(businessId);
      if (cancelled || !id) return;
      sessionIdRef.current = id;

      startHeartbeat(id);
      const removeActivity = registerActivityListeners(id);
      const removeUnload = registerUnloadHandler(id);
      cleanupRef.current = () => {
        stopHeartbeat();
        removeActivity();
        removeUnload();
      };
    };

    init();

    return () => {
      cancelled = true;
      // On cleanup (StrictMode unmount/remount), reset guard so remount can re-init
      hasStartedRef.current = false;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [userId, businessId]);

  const endTracking = async () => {
    hasStartedRef.current = false;
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    const id = sessionIdRef.current || getCurrentSessionId();
    sessionIdRef.current = null;
    if (id) await endSession(id);
  };

  return { endTracking };
}
