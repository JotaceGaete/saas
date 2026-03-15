import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';

const PREMIUM_FEATURES = [
  'Estadísticas del negocio',
  'Ingresos del mes',
  'Productos más vendidos',
  'Asistencia de IA para descripciones',
  'Más capacidad de productos y pedidos',
];

/**
 * Banner de conversión "valor desbloqueado" para usuarios en Pro Trial.
 * Solo se muestra cuando:
 * - planSlug es 'pro' o 'business'
 * - trialExpiresAt existe y está en el futuro
 * - planExpiresAt es null (no han pagado aún)
 */
export default function TrialConversionBanner({ trialDaysLeft, trialExpiresAt }) {
  const navigate = useNavigate();
  const endingSoon = trialDaysLeft <= 3;

  return (
    <div
      className="mb-5 rounded-2xl border overflow-hidden"
      style={{
        backgroundColor: endingSoon ? 'rgba(245,158,11,0.06)' : 'rgba(124,58,237,0.05)',
        borderColor: endingSoon ? 'rgba(245,158,11,0.35)' : 'rgba(124,58,237,0.2)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: endingSoon ? 'rgba(245,158,11,0.15)' : 'rgba(124,58,237,0.12)',
            }}
          >
            <Icon
              name="Sparkles"
              size={20}
              color={endingSoon ? '#D97706' : 'var(--color-primary)'}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              className="text-base font-bold mb-1"
              style={{
                fontFamily: 'var(--font-heading)',
                color: endingSoon ? '#92400E' : 'var(--color-foreground)',
              }}
            >
              {endingSoon ? 'Tu prueba termina pronto' : 'Estás probando Pro gratis'}
            </h2>
            <p
              className="text-sm font-semibold mb-2"
              style={{
                color: endingSoon ? '#B45309' : 'var(--color-primary)',
                fontFamily: 'var(--font-caption)',
              }}
            >
              Te quedan {Math.max(1, trialDaysLeft)} {Math.max(1, trialDaysLeft) === 1 ? 'día' : 'días'} de prueba
              {trialExpiresAt && (
                <span className="font-normal text-gray-500 ml-1">
                  (hasta el {new Date(trialExpiresAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })})
                </span>
              )}
            </p>
            {endingSoon ? (
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                Para seguir viendo estadísticas e IA, mantén tu plan Pro. No pierdas tus funciones premium.
              </p>
            ) : (
              <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                Durante tu prueba tienes acceso a estadísticas, productos más vendidos, ingresos del mes e IA para mejorar descripciones.
                Si no actualizas, tu cuenta volverá automáticamente al plan Starter.
              </p>
            )}

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mb-4" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
              {PREMIUM_FEATURES.map((label) => (
                <li key={label} className="flex items-center gap-2 text-xs sm:text-sm">
                  <Icon name="Check" size={14} color={endingSoon ? '#059669' : 'var(--color-primary)'} className="flex-shrink-0" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => navigate('/planes')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{
                backgroundColor: endingSoon ? '#D97706' : 'var(--color-primary)',
                boxShadow: endingSoon ? '0 2px 8px rgba(217,119,6,0.35)' : '0 2px 10px rgba(124,58,237,0.35)',
              }}
            >
              <Icon name="CreditCard" size={16} color="#fff" />
              Mantener Pro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
