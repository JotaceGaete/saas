import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoginLeftPanel from './components/LoginLeftPanel';
import LoginForm from './components/LoginForm';

export default function Login() {
  const navigate = useNavigate();
  const { signIn, isAuthenticated, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

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
      navigate('/dashboard');
    } catch (e) {
      setAuthError('Error inesperado. Por favor intenta de nuevo.');
    } finally {
      setIsLoading(false);
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
          isLoading={isLoading}
          authError={authError}
        />
      </div>
    </div>
  );
}
