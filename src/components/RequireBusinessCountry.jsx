import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isOnboardingComplete, getMissingOnboardingFields } from '../lib/country/business-country-policy';
import PremiumLoader from './ui/PremiumLoader';

/** Rutas donde no se exige onboarding completo (evita redirect a /onboarding → loop). */
const EXEMPT_PATHS = [
  '/business-configuration',
  '/complete-business-setup',
  '/onboarding',
  '/auth/callback',
  '/auth-callback',
  '/logout',
  '/koronel-connect',
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

  const isExempt = isExemptRoute(pathname);

  console.log('[RBC_CURRENT]', {
    pathname,
    isExempt,
    hasUser: !!user,
    businessLoading,
    businessId: business?.id,
    isComplete: business ? isOnboardingComplete(business) : null,
    missingFields: business ? getMissingOnboardingFields(business) : [],
  });

  if (isExempt) {
    return children;
  }

  if (!user) {
    return children;
  }

  if (businessLoading) {
    return <RouteGuardSpinner business={business} />;
  }

  if (business?.id && !isOnboardingComplete(business)) {
    console.log('[RBC_CURRENT_REDIRECT]', {
      from: pathname,
      to: '/onboarding',
      businessId: business?.id,
    });
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
