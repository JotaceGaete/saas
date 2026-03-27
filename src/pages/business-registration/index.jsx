import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCountry } from '../../contexts/CountryContext';
import { getBusinessLocale } from '../../lib/locale/businessLocale';
import { resolveCountryState, resolveBillingSetup, logCountryStateDebug } from '../../lib/country/state-model';
import AuthStep from './components/AuthStep';
import ConfirmEmailStep from './components/ConfirmEmailStep';
import StoreCreationStep from './components/StoreCreationStep';

function normalizeAuthErrorMessage(raw) {
  const msg = String(raw || '').trim();
  const m = msg.toLowerCase();
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return 'Has intentado crear cuentas demasiadas veces en poco tiempo. Espera 1 minuto y vuelve a intentarlo.';
  }
  if (
    (m.includes('email') && m.includes('already') && (m.includes('registered') || m.includes('exists'))) ||
    m.includes('user already registered') ||
    m.includes('already registered')
  ) {
    return 'Este correo ya está registrado. Inicia sesión o usa otro correo.';
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'El correo no es válido. Revisa el formato e inténtalo de nuevo.';
  }
  if (m.includes('email') && (m.includes('not confirmed') || m.includes('confirm'))) {
    return 'Confirma tu correo antes de continuar.';
  }
  if (m.includes('invalid login credentials') || (m.includes('invalid') && m.includes('credentials'))) {
    return 'Correo o contraseña incorrectos.';
  }
  if (m.includes('signup') && (m.includes('disabled') || m.includes('not allowed'))) {
    return 'El registro está deshabilitado temporalmente. Intenta más tarde.';
  }
  if (m.includes('email') && (m.includes('not allowed') || m.includes('not authorized') || m.includes('blocked'))) {
    return 'No se permite registrar este correo. Prueba con otro correo.';
  }
  if (m.includes('password') && (m.includes('weak') || m.includes('strength'))) {
    return 'La contraseña es muy débil. Usa una más segura (mínimo 6 caracteres).';
  }
  if (m.includes('password') && (m.includes('short') || m.includes('at least'))) {
    return 'La contraseña es demasiado corta. Usa al menos 6 caracteres.';
  }
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to fetch')) {
    return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }
  return msg || 'Ocurrió un error. Por favor intenta de nuevo.';
}

/**
 * Flujo de onboarding:
 *   1. Visitante no autenticado → AuthStep (login / registro con email)
 *   2. Usuario autenticado sin negocio → StoreCreationStep
 *   3. Usuario autenticado con negocio → redirige a /dashboard
 */
export default function BusinessRegistration() {
  const navigate = useNavigate();
  const { user, business, loading, businessLoading, signUp, signIn, signInWithGoogle, resendConfirmationEmail, isEmailConfirmed } = useAuth();
  const { countryCode } = useCountry();
  const countryState = resolveCountryState({
    businessCountryCode: business?.countryCode ?? business?.country_code ?? business?.country ?? null,
    onboardingCountryCode: null,
    userCountryCode: user?.user_metadata?.country_code ?? user?.user_metadata?.country ?? null,
    hostnameSuggestionCountryCode: countryCode,
  });
  const billingSetup = resolveBillingSetup(countryState);
  const locale = getBusinessLocale(null, { preferredCountryCode: countryState.billingCountry });

  const [authError, setAuthError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null); // { email } cuando signUp OK pero sin sesión
  const [signupCooldownUntil, setSignupCooldownUntil] = useState(0);

  const cooldownRemainingMs = Math.max(0, (signupCooldownUntil || 0) - Date.now());
  const signupCooldownActive = cooldownRemainingMs > 0;

  useEffect(() => {
    if (!signupCooldownActive) return;
    const t = setInterval(() => {
      setSignupCooldownUntil((v) => v);
    }, 500);
    return () => clearInterval(t);
  }, [signupCooldownActive]);

  useEffect(() => {
    logCountryStateDebug({
      uxCountry: countryState.uxCountry,
      businessCountry: countryState.businessCountry,
      billingCountry: countryState.billingCountry,
      provider: billingSetup.billingProvider,
      currency: billingSetup.currency,
    });
  }, [
    countryState.uxCountry,
    countryState.businessCountry,
    countryState.billingCountry,
    billingSetup.billingProvider,
    billingSetup.currency,
  ]);

  // Si ya tiene negocio → dashboard
  useEffect(() => {
    if (!loading && !businessLoading && user && business) {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, businessLoading, user, business, navigate]);

  // ── Pantalla de carga inicial ────────────────────────────────────────────────
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

  // ── PASO 1: No autenticado → pantalla de login/registro ─────────────────────
  if (!user) {
    const handleRegister = async ({ email, password, businessName, whatsapp }) => {
      if (signupCooldownActive) {
        setAuthError('Espera un minuto antes de intentarlo de nuevo.');
        return;
      }
      setIsSubmitting(true);
      setAuthError(null);
      setPendingConfirmation(null);
      try {
        const signupCountryCode = countryState?.billingCountry ?? locale?.countryCode ?? null;
        const { data, error } = await signUp(email, password, {
          name: businessName || 'Mi Negocio',
          whatsapp: whatsapp || '',
          currency: locale.currencyCode,
          // Importante: enviar country_code en metadata para que el trigger NO caiga a CL por default.
          country: signupCountryCode,
          countryCode: signupCountryCode,
        });
        if (error) {
          setAuthError(normalizeAuthErrorMessage(error.message));
          const msgLower = String(error.message || '').toLowerCase();
          if (msgLower.includes('rate limit') || msgLower.includes('too many requests')) {
            setSignupCooldownUntil(Date.now() + 60_000);
          }
          return;
        }
        if (data?.user && !data?.session) {
          if (typeof window !== 'undefined') {
            console.log('[BusinessRegistration] signUp: email confirmation required', { email: data.user?.email });
          }
          setPendingConfirmation({ email: data.user?.email || email });
        }
        // Si hay sesión, onAuthStateChange actualizará `user` y pasaremos al PASO 2.
      } catch {
        setAuthError('Error inesperado. Por favor intenta de nuevo.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleLogin = async ({ email, password }) => {
      setIsSubmitting(true);
      setAuthError(null);
      try {
        const { error } = await signIn(email, password);
        if (error) {
          setAuthError(normalizeAuthErrorMessage(error.message));
        }
        // Si no hay error, onAuthStateChange actualiza `user` automáticamente.
      } catch {
        setAuthError('Error inesperado. Por favor intenta de nuevo.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleGoogleLogin = async () => {
      setAuthError(null);
      const { error } = await signInWithGoogle();
      if (error) setAuthError(error?.message || 'Error al iniciar sesión con Google.');
      // Si no hay error, redirige a Google; al volver el callback redirige a dashboard/registro
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

  // ── PASO 2: Autenticado sin negocio → formulario de creación de tienda ───────
  // businessLoading = true mientras se carga el negocio por primera vez
  return (
    <StoreCreationStep
      user={user}
      businessLoading={businessLoading}
    />
  );
}
