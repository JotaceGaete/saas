import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PremiumLoader from './ui/PremiumLoader';

/**
 * Protege rutas que solo deben ser accesibles por usuarios admin.
 * Redirige a /dashboard si el usuario no es admin.
 * Si no hay sesión, redirige a /login.
 */
export default function RequireAdmin({ children }) {
  const { user, loading, isAdmin, isEmailConfirmed } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PremiumLoader fullScreen text="Verificando acceso..." />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isEmailConfirmed) {
    return <Navigate to="/verify-email" state={{ from: location }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
