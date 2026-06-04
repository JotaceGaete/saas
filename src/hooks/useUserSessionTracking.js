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
 * Call with (user, business) — starts tracking when both are present.
 * Returns endTracking() for use on sign-out.
 */
export function useUserSessionTracking(user, business) {
  const sessionIdRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!user?.id || !business?.id) return;

    let cancelled = false;

    const init = async () => {
      const id = await startSession(business.id);
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
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [user?.id, business?.id]);

  const endTracking = async () => {
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
