import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getMyBusiness } from '../../services/waBusinessService';
import { APP_ORIGIN, isCanonicalAppHostname } from '../../config/appUrl';
import PremiumLoader from 'components/ui/PremiumLoader';

function isLocalhostHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

const SESSION_TIMEOUT_MS = 2500;

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let isActive = true;
    let hasRedirected = false;

    const safeNavigate = (to) => {
      if (!isActive || hasRedirected) return;
      hasRedirected = true;
      navigate(to, { replace: true });
    };

    const timeoutId = window.setTimeout(() => {
      console.warn('[AuthCallback] Session resolution timed out, redirecting to login');
      safeNavigate('/login');
    }, SESSION_TIMEOUT_MS);

    const resolveAndRedirect = async () => {
      try {
        if (typeof window !== 'undefined') {
          const host = String(window.location.hostname || '').trim().toLowerCase();
          if (!isLocalhostHost(host) && !isCanonicalAppHostname(host)) {
            const nextUrl = `${APP_ORIGIN}/auth/callback${window.location.search || ''}${window.location.hash || ''}`;
            console.warn('[AuthCallback] wrong_host_redirect', {
              currentOrigin: window.location.origin,
              nextUrl,
            });
            window.location.replace(nextUrl);
            return;
          }
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isActive || hasRedirected) return;

        if (sessionError) {
          console.error('[AuthCallback] getSession error:', sessionError);
          safeNavigate('/login');
          return;
        }

        if (!session) {
          safeNavigate('/login?checkEmail=true');
          return;
        }

        const { data: business, error: businessError } = await getMyBusiness();

        if (!isActive || hasRedirected) return;

        if (businessError) {
          console.error('[AuthCallback] getMyBusiness error:', businessError);
          safeNavigate('/login');
          return;
        }

        if (business) {
          safeNavigate('/dashboard');
          return;
        }

        safeNavigate('/business-registration');
      } catch (error) {
        console.error('[AuthCallback] Unexpected error:', error);
        safeNavigate('/login');
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    resolveAndRedirect();

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [navigate]);

  return (
    <PremiumLoader fullScreen text="Preparando tu acceso..." />
  );
}
