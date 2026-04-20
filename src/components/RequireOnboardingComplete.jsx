import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function GuardSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Verificando onboarding...
        </p>
      </div>
    </div>
  );
}

export default function RequireOnboardingComplete({ children }) {
  const location = useLocation();
  const { user, business, loading, businessLoading, isEmailConfirmed } = useAuth();

  if (loading || businessLoading) {
    return <GuardSpinner />;
  }

  if (!user) {
    return <Navigate to="/business-registration" state={{ from: location }} replace />;
  }

  if (!isEmailConfirmed) {
    return <Navigate to="/verify-email" state={{ from: location }} replace />;
  }

  if (!business?.id) {
    return <Navigate to="/onboarding" state={{ from: location, reason: 'missing_business' }} replace />;
  }

  if (business?.onboardingStep !== 'completed' || !business?.onboardingCompletedAt) {
    return <Navigate to="/onboarding" state={{ from: location, reason: 'incomplete_onboarding' }} replace />;
  }

  return children;
}
