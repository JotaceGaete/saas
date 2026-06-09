import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { PLAN_LABELS } from 'constants/plans';
import { FEATURE_MIN_PLAN } from 'config/planFeatures';

const PLAN_COLORS = {
  pro:      { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700', text: 'text-purple-600' },
  business: { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700', btn: 'bg-emerald-600 hover:bg-emerald-700', text: 'text-emerald-600' },
};

/**
 * Tarjeta de feature bloqueada. Muestra candado, nombre, descripción,
 * plan requerido y CTA a /planes.
 *
 * @param {{ featureId: string, label?: string, description?: string }} props
 *
 * @example
 *   <LockedFeatureCard featureId="invoices" />
 */
export default function LockedFeatureCard({ featureId, label, description }) {
  const navigate   = useNavigate();
  const minPlan    = FEATURE_MIN_PLAN[featureId] ?? 'business';
  const colors     = PLAN_COLORS[minPlan] ?? PLAN_COLORS.business;
  const planLabel  = PLAN_LABELS[minPlan] ?? minPlan;

  return (
    <div className={`rounded-2xl border-2 ${colors.bg} ${colors.border} p-6 flex flex-col items-center text-center gap-4 max-w-sm mx-auto`}>
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${colors.badge}`}>
        <Icon name="Lock" size={24} />
      </div>

      <div>
        {label && <p className="text-sm font-bold text-gray-900 mb-1">{label}</p>}
        <p className="text-xs text-gray-500">
          Disponible desde el plan{' '}
          <span className={`font-bold ${colors.text}`}>{planLabel}</span>
        </p>
        {description && <p className="mt-1.5 text-xs text-gray-500">{description}</p>}
      </div>

      <button
        onClick={() => navigate('/planes')}
        className={`w-full py-2.5 rounded-xl text-white text-sm font-bold transition-colors ${colors.btn}`}
      >
        Actualizar plan →
      </button>
    </div>
  );
}
