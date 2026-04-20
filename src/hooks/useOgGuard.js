import { useState, useRef, useCallback } from 'react';
import { hasValidOgImage } from '../utils/ogImage';

/**
 * Guards catalog-sharing actions behind an OG image check.
 *
 * If the business lacks a valid OG image, the share action is intercepted and
 * a warning modal is presented. The user can then:
 *   - Go to config to upload a cover image (recommended path)
 *   - Share anyway (soft gate — never blocks completely)
 *
 * Usage:
 *   const { guardShare, ogGuardState } = useOgGuard(business, navigate);
 *
 *   // Wrap any share action:
 *   guardShare(() => window.open(whatsappUrl, '_blank'));
 *
 *   // Render the modal:
 *   <OgShareGuardModal {...ogGuardState} />
 *
 * The hook is intentionally framework-agnostic regarding the modal:
 * it exposes plain state + callbacks so the modal stays a pure component.
 *
 * @param {object|null} business  — mapped business object from AuthContext
 * @param {function}    navigate  — react-router navigate() function
 * @returns {{ guardShare: function, ogGuardState: object }}
 */
export function useOgGuard(business, navigate) {
  const [isOpen, setIsOpen] = useState(false);
  const pendingActionRef = useRef(null);

  /**
   * Wraps a share action with the OG guard.
   * If the business has a valid OG image, calls fn() immediately.
   * Otherwise opens the warning modal and stores fn for later.
   *
   * @param {function} fn — the actual share action to execute
   */
  const guardShare = useCallback((fn) => {
    if (hasValidOgImage(business)) {
      fn();
      return;
    }
    pendingActionRef.current = fn;
    setIsOpen(true);
  }, [business]);

  /** User chose "Compartir igual" — execute the pending action and close. */
  const handleConfirm = useCallback(() => {
    pendingActionRef.current?.();
    pendingActionRef.current = null;
    setIsOpen(false);
  }, []);

  /** User dismissed the modal without acting. */
  const handleDismiss = useCallback(() => {
    pendingActionRef.current = null;
    setIsOpen(false);
  }, []);

  /** User chose "Subir portada" — navigate to design settings and close. */
  const handleGoToConfig = useCallback(() => {
    setIsOpen(false);
    pendingActionRef.current = null;
    navigate('/design');
  }, [navigate]);

  return {
    guardShare,
    ogGuardState: {
      isOpen,
      onConfirm:    handleConfirm,
      onDismiss:    handleDismiss,
      onGoToConfig: handleGoToConfig,
    },
  };
}
