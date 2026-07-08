import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveGuardedDestination } from 'lib/forms/navigationGuard';
import { registerActiveFormGuard } from 'lib/forms/navigationGuardRegistry';

const DEFAULT_MESSAGE = 'Tienes cambios sin guardar. Si sales ahora, perderás la información ingresada.';

/**
 * Generic guard against losing unsaved form data. Framework-agnostic about the modal —
 * it exposes plain state/callbacks (same pattern as useOgGuard) so the caller renders
 * its own <ConfirmDialog {...confirmDialogProps} />.
 *
 * Covers:
 *  - Reload / close tab / typed URL / external link → native `beforeunload` prompt
 *    (browsers show their own fixed text here; the custom `message` only applies to the
 *    in-app ConfirmDialog below, not the native browser prompt — browsers do not allow
 *    customizing that text for security reasons).
 *  - Clicking any in-app <a href> (breadcrumbs, real <Link> usages) while this hook is
 *    mounted and dirty → intercepted via a capture-phase click listener, shows the
 *    ConfirmDialog before navigating. This works because react-router's <Link> checks
 *    `event.defaultPrevented` before calling navigate() — calling preventDefault() in our
 *    capture-phase listener (which runs before Link's own bubble-phase handler) reliably
 *    stops it.
 *  - Shared/global navigation UI that navigates programmatically (e.g. the sidebar, which
 *    uses `<button onClick={() => navigate(path)}>` rather than <Link>) → covered as long
 *    as that UI calls `useGuardedAppNavigate()` instead of react-router's `useNavigate()`;
 *    this hook registers itself (while dirty) so that wrapper defers to it automatically.
 *  - The screen's own explicit navigation (a "Cancelar"/"Volver" button) → call
 *    `guardedNavigate(to)` instead of `navigate(to)` directly.
 *
 * NOT covered: the browser's native Back/Forward buttons (popstate). This app uses
 * react-router-dom 6.0.2 with <BrowserRouter> (no data router), which doesn't expose a
 * reliable navigation-blocking API (`useBlocker`/`unstable_usePrompt` require 6.4+ with
 * createBrowserRouter). A manual history/popstate hack was deliberately left out here —
 * it's fragile (the router's own popstate listener fires and re-renders the route before
 * a hook further down the tree can intercept it) and risks flaky navigation bugs across
 * the whole app. Revisit if/when the app migrates to a data router.
 *
 * `isDirty` is computed by the caller (typically
 * `JSON.stringify(current) !== JSON.stringify(baseline)`). The guard clears itself
 * automatically once `isDirty` becomes false — e.g. right after a successful save, when
 * the caller resets its baseline to match the current values.
 *
 * Usage:
 *   const { guardedNavigate, confirmDialogProps } = useUnsavedChangesGuard(isDirty);
 *   <ConfirmDialog {...confirmDialogProps} />
 *   <button onClick={() => guardedNavigate('/crm')}>Cancelar</button>
 */
export function useUnsavedChangesGuard(isDirty, options = {}) {
  const { message = DEFAULT_MESSAGE } = options;
  const navigate = useNavigate();
  const isDirtyRef = useRef(isDirty);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const pendingActionRef = useRef(null);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // Reload / close tab / typed URL / external navigation.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // In-app link clicks (sidebar, breadcrumbs, any <Link>/<a href>) while dirty.
  useEffect(() => {
    if (!isDirty) return;
    const handleClick = (event) => {
      if (event.defaultPrevented) return;
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor) return;

      const destination = resolveGuardedDestination({
        href: anchor.getAttribute('href'),
        target: anchor.target,
        hasDownload: anchor.hasAttribute('download'),
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        currentHref: window.location.href,
      });
      if (!destination) return;

      event.preventDefault();
      pendingActionRef.current = () => navigate(`${destination.pathname}${destination.search}${destination.hash}`);
      setIsPromptOpen(true);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isDirty, navigate]);

  const guardedNavigate = useCallback((to, navOptions) => {
    if (!isDirtyRef.current) {
      navigate(to, navOptions);
      return;
    }
    pendingActionRef.current = () => navigate(to, navOptions);
    setIsPromptOpen(true);
  }, [navigate]);

  // Let shared/global navigation UI (e.g. the sidebar, via useGuardedAppNavigate) defer
  // to this guard while it's dirty, without needing to import this specific form.
  useEffect(() => {
    if (!isDirty) return;
    return registerActiveFormGuard({ requestNavigation: guardedNavigate });
  }, [isDirty, guardedNavigate]);

  const confirmLeave = useCallback(() => {
    setIsPromptOpen(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  }, []);

  const cancelLeave = useCallback(() => {
    pendingActionRef.current = null;
    setIsPromptOpen(false);
  }, []);

  return {
    guardedNavigate,
    isPromptOpen,
    confirmDialogProps: {
      isOpen: isPromptOpen,
      title: 'Cambios sin guardar',
      message,
      confirmLabel: 'Salir sin guardar',
      cancelLabel: 'Seguir editando',
      confirmVariant: 'destructive',
      variant: 'warning',
      onConfirm: confirmLeave,
      onCancel: cancelLeave,
    },
  };
}
