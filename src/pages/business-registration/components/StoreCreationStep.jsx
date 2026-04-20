import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Componente legacy.
 * El alta del negocio ahora vive solo en /onboarding.
 */
export default function StoreCreationStep() {
  return <Navigate to="/onboarding" replace />;
}
