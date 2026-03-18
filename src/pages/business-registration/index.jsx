import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCountry } from '../../contexts/CountryContext';
import { getCountryConfig } from '../../config/countryConfig';
import AuthStep from './components/AuthStep';
import ConfirmEmailStep from './components/ConfirmEmailStep';
import StoreCreationStep from './components/StoreCreationStep';

/**
 * Flujo de onboarding:
 *   1. Visitante no autenticado → AuthStep (login / registro con email)
 *   2. Usuario autenticado sin negocio → StoreCreationStep
 *   3. Usuario autenticado con negocio → redirige a /dashboard
 */
export default function BusinessRegistration() {
  const navigate = useNavigate();
  const { user, business, loading, businessLoading, signUp, signIn, signInWithGoogle, resendConfirmationEmail } = useAuth();
  const { countryCode } = useCountry();
  const countryConfig = getCountryConfig(countryCode);

  const [authError, setAuthError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null); // { email } cuando signUp OK pero sin sesión

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

  // ── PASO 1: No autenticado → pantalla de login/registro ─────────────────────
  if (!user) {
    const handleRegister = async ({ email, password, businessName, whatsapp }) => {
      setIsSubmitting(true);
      setAuthError(null);
      setPendingConfirmation(null);
      try {
        const { data, error } = await signUp(email, password, {
          name: businessName || 'Mi Negocio',
          whatsapp: whatsapp || '',
          currency: countryConfig?.currency || 'CLP',
          country: countryConfig?.name || null,
          countryCode: countryCode || null,
        });
        if (error) {
          setAuthError(error.message);
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
          const msg = error.message?.toLowerCase() || '';
          if (msg.includes('invalid') || msg.includes('wrong') || msg.includes('incorrect')) {
            setAuthError('Correo o contraseña incorrectos.');
          } else if (msg.includes('confirm')) {
            setAuthError('Confirma tu correo antes de continuar.');
          } else {
            setAuthError(error.message);
          }
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
            if (error) setAuthError(error.message);
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
        isLoading={isSubmitting}
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
