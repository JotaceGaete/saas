import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Ruta legacy: el país se define solo en Configuración.
 */
export default function CompleteBusinessSetupPage() {
  return <Navigate to="/business-configuration" replace />;
}
