import { useState, useEffect } from 'react';

const DESKTOP_MQ = '(min-width: 1024px)';

/**
 * Perfil CF `mobile` vs `desktop` (mismo breakpoint que useIsDesktop).
 * Sin `window` (SSR): `mobile` por defecto.
 */
export function useResponsiveCfImageProfile() {
  const [profile, setProfile] = useState(() => {
    if (typeof window === 'undefined') return 'mobile';
    return window.matchMedia(DESKTOP_MQ).matches ? 'desktop' : 'mobile';
  });

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_MQ);
    const handler = (e) => setProfile(e.matches ? 'desktop' : 'mobile');
    mql.addEventListener('change', handler);
    setProfile(mql.matches ? 'desktop' : 'mobile');
    return () => mql.removeEventListener('change', handler);
  }, []);

  return profile;
}
