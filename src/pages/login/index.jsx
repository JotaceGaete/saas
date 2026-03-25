import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoginLeftPanel from './components/LoginLeftPanel';
import LoginForm from './components/LoginForm';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signInWithGoogle, resetPasswordForEmail, isAuthenticated, isEmailConfirmed, loading, business, businessLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);

  // Redirección centralizada tras resolver sesión y negocio.
  useEffect(() => {
    if (loading || !isAuthenticated) return;

    if (!isEmailConfirmed) {
      navigate('/verify-email', { replace: true });
      return;
    }

    // Evita navegar a dashboard sin resolver primero si existe negocio.
    if (businessLoading) return;

    if (business) {
      navigate('/dashboard', { replace: true });
      return;
    }

    navigate('/business-registration', { replace: true });
  }, [isAuthenticated, isEmailConfirmed, loading, navigate, business, businessLoading]);

  const handleLogin = async (formData) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const { error } = await signIn(formData?.email, formData?.password);
      if (error) {
        const msg = error?.message?.toLowerCase() || '';
        if (msg?.includes('invalid login') || msg?.includes('invalid credentials') || msg?.includes('wrong') || msg?.includes('incorrect')) {
          setAuthError('Correo o contraseña incorrectos. Intenta nuevamente.');
        } else if (msg?.includes('email not confirmed') || msg?.includes('confirm')) {
          setAuthError('Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.');
        } else {
          setAuthError(error?.message || 'Error al iniciar sesión. Intenta de nuevo.');
        }
        return;
      }
      // No navegamos aquí para evitar decisiones con estado parcial.
      // El useEffect superior redirige cuando sesión+negocio están resueltos.
    } catch (e) {
      setAuthError('Error inesperado. Por favor intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (email) => {
    if (!email?.trim()) {
      setAuthError('Ingresa tu correo electrónico para recibir el enlace de recuperación.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setAuthError('Ingresa un correo electrónico válido.');
      return;
    }
    setForgotPasswordLoading(true);
    setAuthError(null);
    try {
      const { error } = await resetPasswordForEmail(email.trim());
      if (typeof window !== 'undefined') {
        console.log('[Login] resetPasswordForEmail result:', error ? { error: error.message } : 'ok');
      }
      if (error) {
        setAuthError(error?.message || 'Error al enviar el correo de recuperación. Intenta de nuevo.');
        return;
      }
      setAuthError(null);
      setForgotPasswordSuccess(true);
    } catch (e) {
      setAuthError('Error inesperado. Por favor intenta de nuevo.');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        setAuthError(error?.message || 'Error al iniciar sesión con Google.');
        return;
      }
      // Si no hay error, redirige a Google; al volver el callback redirige a dashboard
    } catch (e) {
      setAuthError(e?.message || 'Error inesperado al conectar con Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Show nothing while checking auth state
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

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-background)' }}>
      <LoginLeftPanel />
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10">
        <LoginForm
          onSubmit={handleLogin}
          onGoogleLogin={handleGoogleLogin}
          onForgotPassword={handleForgotPassword}
          isLoading={isLoading}
          googleLoading={googleLoading}
          authError={authError}
          forgotPasswordSuccess={forgotPasswordSuccess}
          forgotPasswordLoading={forgotPasswordLoading}
          onClearForgotSuccess={() => setForgotPasswordSuccess(false)}
          redirectMessage={location?.state?.message}
        />
      </div>
    </div>
  );
}
