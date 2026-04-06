import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isOnboardingComplete, getMissingOnboardingFields } from '../lib/country/business-country-policy';

/** Rutas donde no se exige `country_code` (evita redirect a /business-configuration → loop). */
const EXEMPT_PATHS = [
  '/business-configuration',
  '/complete-business-setup',
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

function RouteGuardSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Cargando tu negocio…
        </p>
      </div>
    </div>
  );
}

/**
 * Obliga a completar `country_code` cuando el negocio existe sin valor en BD.
 * Rutas exentas (p. ej. /business-configuration) no pasan esta validación para evitar bucles de <Navigate />.
 */
export default function RequireBusinessCountry({ children }) {
  const location = useLocation();
  const { pathname } = location;
  const { user, business, businessLoading } = useAuth();

  const isExempt = isExemptRoute(pathname);

  if (isExempt) {
    return children;
  }

  if (!user) {
    return children;
  }

  if (businessLoading) {
    return <RouteGuardSpinner />;
  }

  if (business?.id && !isOnboardingComplete(business)) {
    const missingFields = getMissingOnboardingFields(business);
    return (
      <Navigate
        to="/business-configuration"
        replace
        state={{ from: location, onboardingIncomplete: true, missingFields }}
      />
    );
  }

  return children;
}
