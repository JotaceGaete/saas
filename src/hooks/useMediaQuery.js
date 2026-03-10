import { useState, useEffect } from 'react';

/**
 * Returns true when the viewport matches (min-width: 1024px) — desktop layout.
 * Use to avoid marginLeft / sidebar space on mobile so content is full width.
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = (e) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    setIsDesktop(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}
