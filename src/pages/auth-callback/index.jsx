import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { getMyBusiness } from '../../services/waBusinessService';
import { hasPersistedBusinessCountry } from '../../lib/country/business-country-policy';
import Icon from 'components/AppIcon';
import { APP_ORIGIN, isCanonicalAppHostname } from '../../config/appUrl';

function isLocalhostHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

/**
 * Página de callback OAuth (Google, etc.).
 * Supabase redirige aquí tras el login; con detectSessionInUrl: true,
 * el cliente procesa la sesión automáticamente. Esperamos a que se resuelva
 * y redirigimos a dashboard o business-registration.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const resolveAndRedirect = async () => {
      if (typeof window !== 'undefined') {
        const host = String(window.location.hostname || '').trim().toLowerCase();
        // Callback OAuth/email debe resolverse siempre en APP_ORIGIN (no apex/www).
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

      // Breve espera para que Supabase procese la URL (hash/query)
      await new Promise((r) => setTimeout(r, 300));

      const { data: { session }, error: sessionError } = await supabase?.auth?.getSession();

      if (typeof window !== 'undefined') {
        console.log('[AuthCallback] session check:', { hasSession: !!session, hasUser: !!session?.user, error: sessionError?.message });
      }

      if (!mounted) return;

      if (sessionError) {
        setError(sessionError?.message || 'Error al obtener la sesión.');
        return;
      }

      if (!session?.user) {
        // Sin sesión: puede ser error de OAuth o usuario canceló
        setError('No se pudo completar el inicio de sesión. Intenta de nuevo.');
        return;
      }

      if (!session.user.email_confirmed_at) {
        navigate('/verify-email', { replace: true });
        return;
      }

      // Usuario autenticado y correo confirmado: verificar si tiene negocio
      try {
        const { data: business } = await getMyBusiness();
        if (business) {
          console.log('[VTLK_ROUTE] AuthCallback negocio', {
            path: typeof window !== 'undefined' ? window.location.pathname : '',
            businessId: business.id,
            countryCodeDb: business.countryCodeDb ?? null,
            hasCountryCode: hasPersistedBusinessCountry(business),
          });
          if (!hasPersistedBusinessCountry(business)) {
            navigate('/business-configuration', { replace: true });
          } else {
            navigate('/dashboard', { replace: true });
          }
        } else {
          navigate('/business-registration', { replace: true });
        }
      } catch (err) {
        console.error('[AuthCallback] Error checking business:', err);
        navigate('/business-registration', { replace: true });
      }
    };

    resolveAndRedirect();
    return () => { mounted = false; };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
            <Icon name="AlertCircle" size={28} color="var(--color-error)" />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Error al iniciar sesión</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)' }}>{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="px-6 py-3 rounded-xl font-semibold text-sm"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <svg className="animate-spin mb-4" width={36} height={36} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Completando inicio de sesión...</p>
    </div>
  );
}
