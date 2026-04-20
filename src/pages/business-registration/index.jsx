import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCountry } from '../../contexts/CountryContext';
import { collectVisitAttribution } from '../../utils/analytics';
import { recordSiteVisit } from '../../services/waBusinessService';
import AuthStep from './components/AuthStep';
import ConfirmEmailStep from './components/ConfirmEmailStep';

function normalizeAuthErrorMessage(raw) {
  const msg = String(raw || '').trim();
  const lowered = msg.toLowerCase();

  if (lowered.includes('rate limit') || lowered.includes('too many requests')) {
    return 'Has intentado crear cuentas demasiadas veces en poco tiempo. Espera 1 minuto y vuelve a intentarlo.';
  }
  if (
    (lowered.includes('email') && lowered.includes('already') && (lowered.includes('registered') || lowered.includes('exists'))) ||
    lowered.includes('user already registered') ||
    lowered.includes('already registered')
  ) {
    return 'Este correo ya esta registrado. Inicia sesion o usa otro correo.';
  }
  if (lowered.includes('invalid') && lowered.includes('email')) {
    return 'El correo no es valido. Revisa el formato e intentalo de nuevo.';
  }
  if (lowered.includes('email') && (lowered.includes('not confirmed') || lowered.includes('confirm'))) {
    return 'Confirma tu correo antes de continuar.';
  }
  if (lowered.includes('invalid login credentials') || (lowered.includes('invalid') && lowered.includes('credentials'))) {
    return 'Correo o contrasena incorrectos.';
  }
  if (lowered.includes('signup') && (lowered.includes('disabled') || lowered.includes('not allowed'))) {
    return 'El registro esta deshabilitado temporalmente. Intenta mas tarde.';
  }
  if (lowered.includes('email') && (lowered.includes('not allowed') || lowered.includes('not authorized') || lowered.includes('blocked'))) {
    return 'No se permite registrar este correo. Prueba con otro correo.';
  }
  if (lowered.includes('password') && (lowered.includes('weak') || lowered.includes('strength'))) {
    return 'La contrasena es muy debil. Usa una mas segura (minimo 6 caracteres).';
  }
  if (lowered.includes('password') && (lowered.includes('short') || lowered.includes('at least'))) {
    return 'La contrasena es demasiado corta. Usa al menos 6 caracteres.';
  }
  if (lowered.includes('network') || lowered.includes('fetch') || lowered.includes('failed to fetch')) {
    return 'No pudimos conectar con el servidor. Revisa tu conexion e intentalo de nuevo.';
  }

  return msg || 'Ocurrio un error. Por favor intenta de nuevo.';
}

export default function BusinessRegistration() {
  const navigate = useNavigate();
  const {
    user,
    loading,
    businessLoading,
    signUp,
    signIn,
    signInWithGoogle,
    resendConfirmationEmail,
    isEmailConfirmed,
    resolvePostAuthRoute,
    persistOnboardingCountry,
  } = useAuth();
  const { countryCode } = useCountry();

  const [authError, setAuthError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);
  const [signupCooldownUntil, setSignupCooldownUntil] = useState(0);

  const cooldownRemainingMs = Math.max(0, (signupCooldownUntil || 0) - Date.now());
  const signupCooldownActive = cooldownRemainingMs > 0;

  useEffect(() => {
    recordSiteVisit({ path: '/register', attribution: collectVisitAttribution() }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!signupCooldownActive) return undefined;
    const timer = setInterval(() => {
      setSignupCooldownUntil((value) => value);
    }, 500);
    return () => clearInterval(timer);
  }, [signupCooldownActive]);

  useEffect(() => {
    if (!loading && !businessLoading && user) {
      navigate(resolvePostAuthRoute(), { replace: true });
    }
  }, [businessLoading, loading, navigate, resolvePostAuthRoute, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <svg className="animate-spin" width={32} height={32} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (user && !isEmailConfirmed) {
    return <Navigate to="/verify-email" replace />;
  }

  if (!countryCode && !user) {
    return <Navigate to="/elegir-pais" replace />;
  }

  if (!user) {
    const handleRegister = async ({ email, password, businessName }) => {
      if (!countryCode) {
        navigate('/elegir-pais', { replace: true });
        return;
      }

      if (signupCooldownActive) {
        setAuthError('Espera un minuto antes de intentarlo de nuevo.');
        return;
      }

      setIsSubmitting(true);
      setAuthError(null);
      setPendingConfirmation(null);

      try {
        const { data, error } = await signUp(email, password, {
          name: businessName || 'Mi Negocio',
          countryCode,
        });

        if (error) {
          setAuthError(normalizeAuthErrorMessage(error.message));
          const lowered = String(error.message || '').toLowerCase();
          if (lowered.includes('rate limit') || lowered.includes('too many requests')) {
            setSignupCooldownUntil(Date.now() + 60_000);
          }
          return;
        }

        if (data?.user && !data?.session) {
          setPendingConfirmation({ email: data.user?.email || email });
        }
      } catch {
        setAuthError('Error inesperado. Por favor intenta de nuevo.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleLogin = async ({ email, password }) => {
      if (!countryCode) {
        navigate('/elegir-pais', { replace: true });
        return;
      }

      setIsSubmitting(true);
      setAuthError(null);

      try {
        const { error } = await signIn(email, password);
        if (error) {
          setAuthError(normalizeAuthErrorMessage(error.message));
          return;
        }

        await persistOnboardingCountry(countryCode);
      } catch {
        setAuthError('Error inesperado. Por favor intenta de nuevo.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleGoogleLogin = async () => {
      if (!countryCode) {
        navigate('/elegir-pais', { replace: true });
        return;
      }

      setAuthError(null);
      const { error } = await signInWithGoogle();
      if (error) setAuthError(error?.message || 'Error al iniciar sesion con Google.');
    };

    if (pendingConfirmation?.email) {
      return (
        <ConfirmEmailStep
          email={pendingConfirmation.email}
          onResend={async () => {
            setAuthError(null);
            const { error } = await resendConfirmationEmail(pendingConfirmation.email);
            if (error) setAuthError(normalizeAuthErrorMessage(error.message));
            return { error };
          }}
          authError={authError}
          onClearError={() => setAuthError(null)}
        />
      );
    }

    return (
      <AuthStep
        onRegister={handleRegister}
        onLogin={handleLogin}
        onGoogleLogin={handleGoogleLogin}
        isLoading={isSubmitting || signupCooldownActive}
        cooldownMs={cooldownRemainingMs}
        authError={authError}
        onClearError={() => setAuthError(null)}
      />
    );
  }

  return <Navigate to="/onboarding" replace />;
}
