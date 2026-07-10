import { useState, useCallback } from 'react';
import { hasValidOgImage } from '../utils/ogImage';

/**
 * Informs — never blocks — catalog-sharing actions about OG image readiness.
 *
 * /api/og-catalog always returns a 200 PNG (falling back to a generic
 * gradient card when there's no cover/logo/share image), so there is nothing
 * to "gate": share must never wait on or be prevented by this check. When the
 * business has no real source image configured, guardShare still fires the
 * share action immediately and additionally surfaces an informational notice
 * (not a confirmation prompt) suggesting a cover for a better preview next time.
 *
 * Usage:
 *   const { guardShare, ogGuardState } = useOgGuard(business, navigate);
 *
 *   // Wrap any share action — always executes immediately:
 *   guardShare(() => window.open(whatsappUrl, '_blank'));
 *
 *   // Render the (dismiss-only, informational) modal:
 *   <OgShareGuardModal {...ogGuardState} />
 *
 * @param {object|null} business  — mapped business object from AuthContext
 * @param {function}    navigate  — react-router navigate() function
 * @returns {{ guardShare: function, ogGuardState: object }}
 */
export function useOgGuard(business, navigate) {
  const [isOpen, setIsOpen] = useState(false);

  /**
   * Always executes fn() immediately. If the business has no real OG source
   * image, additionally opens an informational (non-blocking) notice.
   * @param {function} fn — the actual share action to execute
   */
  const guardShare = useCallback((fn) => {
    fn?.();
    if (!hasValidOgImage(business)) {
      setIsOpen(true);
    }
  }, [business]);

  /** User dismissed the informational notice. */
  const handleDismiss = useCallback(() => {
    setIsOpen(false);
  }, []);

  /** User chose "Subir portada" — navigate to config and close. */
  const handleGoToConfig = useCallback(() => {
    setIsOpen(false);
    navigate('/business-configuration');
  }, [navigate]);

  return {
    guardShare,
    ogGuardState: {
      isOpen,
      onDismiss:    handleDismiss,
      onGoToConfig: handleGoToConfig,
    },
  };
}
