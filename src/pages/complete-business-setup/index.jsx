import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Ruta legacy del onboarding.
 */
export default function CompleteBusinessSetupPage() {
  return <Navigate to="/onboarding" replace />;
}
