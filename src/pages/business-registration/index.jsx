import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RegistrationForm from './components/RegistrationForm';
import { useAuth } from '../../contexts/AuthContext';

export default function BusinessRegistration() {
  const navigate = useNavigate();
  const { signUp, signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [mode, setMode] = useState('register');

  const handleRegister = async (formData) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const { data, error } = await signUp(formData?.email, formData?.password, {
        name: formData?.businessName || formData?.nombre || 'Mi Negocio',
        whatsapp: formData?.whatsapp || '',
        description: formData?.description || '',
        currency: formData?.currency || 'CLP',
      });
      if (error) {
        setAuthError(error?.message);
        return;
      }
      // If session exists → go to dashboard directly
      if (data?.session) {
        navigate('/dashboard');
        return;
      }
      // No session means email confirmation is required
      // Still navigate to dashboard — AuthenticationWrapper will handle redirect if not authed
      navigate('/dashboard');
    } catch (e) {
      console.error('Registration error:', e);
      setAuthError('Error al crear la cuenta. Por favor intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (formData) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const { error } = await signIn(formData?.email, formData?.password);
      if (error) {
        setAuthError(error?.message);
        return;
      }
      navigate('/dashboard');
    } catch (e) {
      setAuthError('Error inesperado. Por favor intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <RegistrationForm
      mode={mode}
      onModeChange={setMode}
      onRegister={handleRegister}
      onLogin={handleLogin}
      isLoading={isLoading}
      authError={authError}
    />
  );
}