import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Escucha sessionExpiredMessage del contexto y redirige a login con el mensaje.
 * Debe estar dentro de BrowserRouter para usar useNavigate.
 */
export default function SessionExpiredHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionExpiredMessage, clearSessionExpiredMessage } = useAuth();

  useEffect(() => {
    if (!sessionExpiredMessage) return;
    const path = location?.pathname || '';
    const isPublicRoute =
      path === '/login' ||
      path === '/auth/callback' ||
      path === '/reset-password' ||
      path === '/auth/reset-password' ||
      path.startsWith('/catalog/') ||
      path.startsWith('/catalogo/') ||
      path === '/terms' ||
      path === '/privacy' ||
      path === '/refunds' ||
      path === '/plans' ||
      path === '/landing-page';
    if (isPublicRoute) {
      clearSessionExpiredMessage();
      return;
    }
    navigate('/login', { replace: true, state: { message: sessionExpiredMessage } });
    clearSessionExpiredMessage();
  }, [sessionExpiredMessage, navigate, location?.pathname, clearSessionExpiredMessage]);

  return null;
}
