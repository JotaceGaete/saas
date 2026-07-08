import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestAppNavigation } from 'lib/forms/navigationGuardRegistry';

/**
 * Drop-in replacement for react-router's `useNavigate()`, for shared/global navigation
 * UI (sidebar, top nav) that doesn't itself know about any particular guarded form.
 *
 * Behaves identically to plain `navigate()` whenever there's no dirty form guarded by
 * useUnsavedChangesGuard — which is the overwhelming majority of the time. It only
 * intercepts when a guard is currently active and dirty, in which case that guard shows
 * its own "Cambios sin guardar" confirm dialog and performs the navigation itself if the
 * user confirms.
 *
 * Use this instead of useNavigate() in components that live outside the guarded form
 * itself (e.g. BusinessSidebar) so any guarded form elsewhere in the app tree is
 * protected without every navigation call site needing to know about it individually.
 */
export function useGuardedAppNavigate() {
  const navigate = useNavigate();
  return useCallback((to, options) => {
    if (requestAppNavigation(to, options)) return;
    navigate(to, options);
  }, [navigate]);
}
