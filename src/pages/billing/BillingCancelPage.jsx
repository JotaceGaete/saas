import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';

/**
 * Página cuando el usuario cancela un flujo de pago.
 * URL: https://go.ventalink.app/billing/cancel
 */
export default function BillingCancelPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="max-w-md w-full mx-4 text-center">
        <div className="rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-6" style={{ backgroundColor: 'rgba(156,163,175,0.15)' }}>
          <Icon name="XCircle" size={40} color="#9ca3af" />
        </div>
        <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
          Pago cancelado
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
          No se realizó ningún cargo. Puedes volver cuando quieras para contratar un plan.
        </p>
        <button
          type="button"
          onClick={() => navigate('/planes', { replace: true })}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Volver a Plan y facturación
        </button>
      </div>
    </div>
  );
}
