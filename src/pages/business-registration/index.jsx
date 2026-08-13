import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCountry } from '../../contexts/CountryContext';
import { resolveCountryState, resolveBillingSetup, logCountryStateDebug } from '../../lib/country/state-model';
import { collectVisitAttribution } from '../../utils/analytics';
import { recordSiteVisit } from '../../services/waBusinessService';
import { trackLoopsEvent } from '../../services/loopsClient';
import { captureReferralFromUrl, attemptPendingAttribution } from '../../utils/referralAttribution';
import AuthStep from './components/AuthStep';
import ConfirmEmailStep from './components/ConfirmEmailStep';
import StoreCreationStep from './components/StoreCreationStep';
import PremiumLoader from 'components/ui/PremiumLoader';
import Icon from 'components/AppIcon';

/**
 * Se muestra cuando la carga del negocio falló (red/backend) — nunca cuando
 * simplemente no existe negocio. Evita ofrecer el formulario de creación
 * (StoreCreationStep) sobre un negocio que en realidad sí existe pero no
 * pudimos consultar en este intento.
 */
function BusinessLoadErrorScreen({ onRetry, retrying }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-md text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
        >
          <Icon name="AlertCircle" size={24} color="var(--color-error)" />
        </div>
        <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
          No pudimos cargar tu cuenta
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Ocurrió un problema al consultar tu negocio. No es necesario crear uno nuevo — intenta de nuevo en unos segundos.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
          style={{
            backgroundColor: retrying ? 'rgba(124,58,237,0.7)' : 'var(--color-primary)',
            color: '#fff',
            fontFamily: 'var(--font-caption)',
            cursor: retrying ? 'not-allowed' : 'pointer',
          }}
        >
          {retrying ? (
            <>
              <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Reintentando...
            </>
          ) : (
            <>
              <Icon name="RefreshCw" size={15} color="#fff" />
              Reintentar
            </>
          )}
        </button>
      </div>
    </div>
  );
}

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
  const { user, business, loading, businessLoading, businessStatus, refreshBusiness, signUp, signIn, signInWithGoogle, resendConfirmationEmail, isEmailConfirmed } = useAuth();
  const [retryingBusinessLoad, setRetryingBusinessLoad] = useState(false);
  const { countryCode } = useCountry();
  const countryState = resolveCountryState({
    businessCountryCode: business,
    onboardingCountryCode: null,
    userCountryCode: user?.user_metadata?.country_code ?? user?.user_metadata?.country ?? null,
    hostnameSuggestionCountryCode: countryCode,
  });
  const billingSetup = resolveBillingSetup(countryState);

  const [authError, setAuthError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null); // { email } cuando signUp OK pero sin sesión
  const [signupCooldownUntil, setSignupCooldownUntil] = useState(0);
  const registerInFlightRef = useRef(false);

  const cooldownRemainingMs = Math.max(0, (signupCooldownUntil || 0) - Date.now());
  const signupCooldownActive = cooldownRemainingMs > 0;

  useEffect(() => {
    recordSiteVisit({ path: '/register', attribution: collectVisitAttribution() }).catch(() => {});
  }, []);

  // Captura ?ref= apenas se monta la página, sin importar si hay sesión o
  // no todavía -- clickAt debe representar el momento real de llegada, no
  // el momento posterior del signup.
  useEffect(() => {
    captureReferralFromUrl();
  }, []);

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
    return <PremiumLoader fullScreen />;
  }

  if (user && !isEmailConfirmed) {
    return <Navigate to="/verify-email" replace />;
  }

  // ── PASO 1: No autenticado → pantalla de login/registro ─────────────────────
  if (!user) {
    const handleRegister = async ({ email, password, businessName }) => {
      if (registerInFlightRef.current || signupCooldownActive) {
        setAuthError('Espera un minuto antes de intentarlo de nuevo.');
        return;
      }
      registerInFlightRef.current = true;
      setIsSubmitting(true);
      setAuthError(null);
      setPendingConfirmation(null);
      try {
        const { data, error } = await signUp(email, password, {
          name: businessName || 'Mi Negocio',
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
          // Sin sesión todavía -- la atribución se intenta más adelante en
          // /auth/callback cuando confirme el correo, nunca acá.
          // eslint-disable-next-line no-console
          console.info('[referral_debug]', { step: 'signup_deferred_confirmation', rpcCalled: false });
        } else if (data?.session && data?.user) {
          // Sesión inmediata (confirmación de email desactivada): signUp
          // siempre es un usuario nuevo, sin necesitar ninguna heurística.
          attemptPendingAttribution({ userId: data.user.id, isEligible: true, source: 'signup_immediate_session' }).catch(() => {});
        }
        trackLoopsEvent('user_registered', {
          email: data?.user?.email || email,
          firstName: businessName || data?.user?.user_metadata?.name || '',
          businessName: businessName || 'Mi Negocio',
          country: '',
          plan: 'starter',
        }).catch(() => {});
        // Si hay sesión, onAuthStateChange actualizará `user` y pasaremos al PASO 2.
      } catch {
        setAuthError('Error inesperado. Por favor intenta de nuevo.');
      } finally {
        registerInFlightRef.current = false;
        setIsSubmitting(false);
      }
    };

    const handleLogin = async ({ email, password }) => {
      setIsSubmitting(true);
      setAuthError(null);
      try {
        const { data, error } = await signIn(email, password);
        if (error) {
          setAuthError(normalizeAuthErrorMessage(error.message));
        } else if (data?.user) {
          // Login = usuario existente, nunca elegible. Limpia cualquier
          // referral pendiente para que no siga intentando atribuirse.
          attemptPendingAttribution({ userId: data.user.id, isEligible: false, source: 'login_existing_user' }).catch(() => {});
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

  // ── PASO 2: Autenticado ───────────────────────────────────────────────────
  // Un error de carga NUNCA debe mostrar el formulario de creación de negocio —
  // podría existir y estar ocultándose por un problema transitorio de red/backend.
  if (businessStatus === 'error') {
    const handleRetry = async () => {
      setRetryingBusinessLoad(true);
      try {
        await refreshBusiness();
      } finally {
        setRetryingBusinessLoad(false);
      }
    };
    return <BusinessLoadErrorScreen onRetry={handleRetry} retrying={retryingBusinessLoad} />;
  }

  // businessLoading = true mientras se carga el negocio por primera vez.
  // StoreCreationStep solo llega a mostrar el formulario real cuando
  // businessStatus === 'not_found' (mientras carga, muestra su propio spinner).
  return (
    <StoreCreationStep
      user={user}
      businessLoading={businessLoading}
    />
  );
}
