import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePlanFeature } from '../hooks/usePlanFeature';
import { canAccessCrm, CRM_ADMIN_ONLY } from '../config/crmConfig';
import PremiumLoader from './ui/PremiumLoader';
import Icon from './AppIcon';

/**
 * Protege todas las rutas /crm/*.
 *
 * Orden de verificación:
 *   1. Sesión activa (→ /login si no)
 *   2. Email confirmado (→ /verify-email si no)
 *   3. canAccessCrm(isAdmin, hasPlanAccess)
 *      - Si CRM_ADMIN_ONLY=true: solo admins; resto ve CrmStabilizationScreen
 *      - Si CRM_ADMIN_ONLY=false: admin o plan Pro+; resto ve CrmUpgradeScreen
 */
export default function RequireCrm({ children }) {
  const { user, loading, isAdmin, isEmailConfirmed, businessLoading } = useAuth();
  const location = useLocation();
  const hasCrmAccess = usePlanFeature('crmAccess');

  if (loading || businessLoading) {
    return <PremiumLoader fullScreen text="Verificando acceso..." />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isEmailConfirmed) {
    return <Navigate to="/verify-email" state={{ from: location }} replace />;
  }

  if (!canAccessCrm(isAdmin, hasCrmAccess)) {
    return CRM_ADMIN_ONLY ? <CrmStabilizationScreen /> : <CrmUpgradeScreen />;
  }

  return <>{children}</>;
}

// Pantalla temporal mientras el CRM está en estabilización
function CrmStabilizationScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--color-background, #f6f7fb)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 p-8 flex flex-col items-center text-center gap-5"
        style={{ backgroundColor: '#fff', borderColor: 'rgba(59,130,246,0.2)' }}
      >
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(59,130,246,0.08)' }}>
          <Icon name="Construction" size={28} color="#3B82F6" />
        </div>

        <div>
          <p className="text-base font-bold text-gray-900 mb-1">CRM en preparación</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Estamos terminando de afinar esta funcionalidad para garantizarte la mejor experiencia.
            Pronto estará disponible.
          </p>
        </div>

        <div className="w-full bg-blue-50 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-700 font-medium">
            ¿Tienes urgencia? Contáctanos y te ayudamos.
          </p>
        </div>

        <a
          href="/dashboard"
          className="w-full py-3 rounded-xl text-white text-sm font-bold text-center transition-colors"
          style={{ backgroundColor: '#3B82F6' }}
        >
          Volver al inicio
        </a>
      </div>
    </div>
  );
}

function CrmUpgradeScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: 'var(--color-background, #f6f7fb)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 p-8 flex flex-col items-center text-center gap-5"
        style={{ backgroundColor: '#fff', borderColor: 'rgba(124,58,237,0.18)' }}
      >
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}>
          <Icon name="Lock" size={28} color="#7C3AED" />
        </div>

        <div>
          <p className="text-base font-bold text-gray-900 mb-1">CRM y gestión comercial</p>
          <p className="text-sm text-gray-500">
            Disponible desde el plan{' '}
            <span className="font-bold text-purple-600">Pro</span>
          </p>
        </div>

        <ul className="text-left space-y-2 w-full">
          {[
            'Clientes, historial y cuenta corriente',
            'Presupuestos y facturas',
            'Control de stock en tiempo real',
            'TPV y caja diaria',
            'Códigos de barra y etiquetas',
            'Termómetro del negocio',
          ].map(b => (
            <li key={b} className="flex items-center gap-2 text-xs text-gray-600">
              <Icon name="CheckCircle2" size={13} color="#7C3AED" />
              {b}
            </li>
          ))}
        </ul>

        <a
          href="/planes"
          className="w-full py-3 rounded-xl text-white text-sm font-bold text-center transition-colors"
          style={{ backgroundColor: '#7C3AED' }}
        >
          Ver plan Pro →
        </a>
      </div>
    </div>
  );
}
