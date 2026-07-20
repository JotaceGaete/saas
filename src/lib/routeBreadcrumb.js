/**
 * Tracks the current and previous route so error reporting (see ErrorBoundary)
 * can tag crashes with where the user was and where they were headed, without
 * depending on react-router context inside a class component.
 */
let currentRoute = typeof window !== 'undefined' ? window.location?.pathname ?? null : null;
let previousRoute = null;

export function recordRoute(pathname) {
  if (!pathname || pathname === currentRoute) return;
  previousRoute = currentRoute;
  currentRoute = pathname;
}

export function getRouteBreadcrumb() {
  return { route: currentRoute, previousRoute };
}
