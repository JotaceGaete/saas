/**
 * Framework-agnostic store behind attemptLeave(). A page with unsaved-changes
 * protection registers a guard function; every navigation trigger in the app
 * (sidebar, breadcrumbs, cancel buttons, etc.) must call attemptLeave(action)
 * instead of invoking its navigation directly, so there is a single place
 * that decides whether leaving is allowed.
 */
export function createNavigationGuardStore() {
  let guard = null;

  return {
    setGuard(fn) {
      guard = fn;
    },
    clearGuard() {
      guard = null;
    },
    attemptLeave(action) {
      if (guard) {
        guard(action);
      } else {
        action();
      }
    },
  };
}
