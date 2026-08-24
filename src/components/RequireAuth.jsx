import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RequireBusinessCountry from './RequireBusinessCountry';
import RestrictedAccessScreen from './RestrictedAccessScreen';
import { isRestrictedAccessEnabled } from '../config/restrictedAccess';
import PremiumLoader from './ui/PremiumLoader';

/**
 * Protege rutas que requieren sesión activa.
 * Si no hay sesión válida, redirige a /login.
 */
export default function RequireAuth({ children }) {
  const { user, loading, isAdmin, isEmailConfirmed } = useAuth();
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

  // Modo de acceso restringido (temporal, ver src/config/restrictedAccess.js):
  // solo admins pasan; el resto ve la pantalla de mantenimiento en vez del
  // panel privado. isAdmin reutiliza app_metadata.role sin cambios.
  if (isRestrictedAccessEnabled() && !isAdmin) {
    return <RestrictedAccessScreen />;
  }

  return <RequireBusinessCountry>{children}</RequireBusinessCountry>;
}
