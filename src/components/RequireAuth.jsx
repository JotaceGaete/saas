import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RequireBusinessCountry from './RequireBusinessCountry';
import PremiumLoader from './ui/PremiumLoader';

/**
 * Protege rutas que requieren sesión activa.
 * Si no hay sesión válida, redirige a /login.
 */
export default function RequireAuth({ children }) {
  const { user, loading, isEmailConfirmed } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PremiumLoader fullScreen text="Verificando sesión..." />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isEmailConfirmed) {
    return <Navigate to="/verify-email" state={{ from: location }} replace />;
  }

  return <RequireBusinessCountry>{children}</RequireBusinessCountry>;
}
