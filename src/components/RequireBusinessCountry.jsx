import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isOnboardingComplete } from '../lib/onboarding/state';

/** Legacy guard kept for compatibility. Onboarding now lives in /onboarding. */
const EXEMPT_PATHS = [
  '/onboarding',
  '/auth/callback',
  '/auth-callback',
  '/logout',
];

function normalizePathname(pathname) {
  if (!pathname) return '/';
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

function isExemptRoute(pathname) {
  const normalized = normalizePathname(pathname);
  return EXEMPT_PATHS.some((route) => normalized === route || normalized.startsWith(`${route}/`));
}

function RouteGuardSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Cargando tu negocio...
        </p>
      </div>
    </div>
  );
}

export default function RequireBusinessCountry({ children }) {
  const location = useLocation();
  const { pathname } = location;
  const { user, business, businessLoading } = useAuth();

  if (isExemptRoute(pathname) || !user) {
    return children;
  }

  if (businessLoading) {
    return <RouteGuardSpinner />;
  }

  if (business?.id && !isOnboardingComplete(business)) {
    return <Navigate to="/onboarding" replace state={{ from: location, onboardingIncomplete: true }} />;
  }

  return children;
}
