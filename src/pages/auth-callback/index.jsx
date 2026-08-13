import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getMyBusiness } from '../../services/waBusinessService';
import { APP_ORIGIN, isCanonicalAppHostname } from '../../config/appUrl';
import { attemptPendingAttribution, isNewAccountFromTimestamps } from '../../utils/referralAttribution';
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

        // Best-effort, en paralelo -- nunca debe demorar ni bloquear la
        // redirección de abajo. Dos flujos aterrizan acá con sesión fresca:
        //   - Google OAuth: provider='google' -> solo elegible si la CUENTA
        //     (no la identidad) se acaba de crear (created_at/last_sign_in_at).
        //   - Confirmación de email de un signUp(): provider='email' -- ya
        //     sabemos que es un usuario nuevo por construcción (un login
        //     nunca pasa por acá, signIn() siempre da sesión inmediata).
        //
        // Invariante de la que depende `provider === 'email' -> true`: hoy
        // /auth/callback solo recibe provider='email' desde signup/confirmación
        // de cuentas nuevas (signUp, resendConfirmationEmail, cambio de correo
        // pre-confirmación en /verify-email) -- nunca desde un login de una
        // cuenta ya existente, porque signIn() con email/password resuelve la
        // sesión de forma síncrona y nunca redirige a esta página. Si en el
        // futuro se agrega passwordless/magic-link u otro login por email para
        // usuarios EXISTENTES que redirija acá, esta elegibilidad debe
        // revisarse -- ya no sería seguro asumir "provider=email = siempre nuevo".
        const provider = session.user?.app_metadata?.provider;
        const isEligible = provider === 'google' ? isNewAccountFromTimestamps(session.user) : true;
        const authPath = provider === 'google' ? 'auth_callback_google' : 'auth_callback_email';
        attemptPendingAttribution({ userId: session.user?.id, isEligible, authPath }).catch(() => {});

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
