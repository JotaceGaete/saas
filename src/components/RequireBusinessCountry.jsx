import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isOnboardingComplete } from '../lib/country/business-country-policy';
import PremiumLoader from './ui/PremiumLoader';

/** Rutas donde no se exige onboarding completo (evita redirect a /onboarding → loop). */
const EXEMPT_PATHS = [
  '/business-configuration',
  '/complete-business-setup',
  '/onboarding',
  '/auth/callback',
  '/auth-callback',
  '/logout',
];

function normalizePathname(pathname) {
  if (!pathname) return '/';
  const p = pathname.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

function isExemptRoute(pathname) {
  const p = normalizePathname(pathname);
  return EXEMPT_PATHS.some((ex) => p === ex || p.startsWith(`${ex}/`));
}

function RouteGuardSpinner({ business }) {
  return <PremiumLoader fullScreen business={business} />;
}

/**
 * Redirige a /onboarding cuando el negocio existe pero el setup inicial no está completo.
 * Rutas exentas (incluyendo /onboarding y /business-configuration) no pasan esta validación.
 */
export default function RequireBusinessCountry({ children }) {
  const location = useLocation();
  const { pathname } = location;
  const { user, business, businessLoading } = useAuth();

  if (isExemptRoute(pathname)) {
    return children;
  }

  if (!user) {
    return children;
  }

  if (businessLoading) {
    return <RouteGuardSpinner business={business} />;
  }

  if (business?.id && !isOnboardingComplete(business)) {
    return (
      <Navigate
        to="/onboarding"
        replace
        state={{ from: location }}
      />
    );
  }

  return children;
}
