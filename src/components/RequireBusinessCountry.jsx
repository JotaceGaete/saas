import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isOnboardingComplete, getMissingOnboardingFields } from '../lib/country/business-country-policy';
import PremiumLoader from './ui/PremiumLoader';

/** Rutas donde no se exige `country_code` (evita redirect a /business-configuration → loop). */
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
 * Obliga a completar `country_code` cuando el negocio existe sin valor en BD.
 * Rutas exentas (p. ej. /business-configuration) no pasan esta validación para evitar bucles de <Navigate />.
 */
export default function RequireBusinessCountry({ children }) {
  const location = useLocation();
  const { pathname } = location;
  const { user, business, businessLoading } = useAuth();

  const isExempt = isExemptRoute(pathname);

  console.info('[RBC]', { pathname, isExempt, hasUser: !!user, businessLoading, businessId: business?.id });

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
    const missingFields = getMissingOnboardingFields(business);
    console.warn('[RBC] REDIRECT → /business-configuration', { pathname, missingFields, business: { id: business.id, name: business.name, whatsapp: business.whatsapp, country_code: business.country_code, countryCodeDb: business.countryCodeDb } });
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
