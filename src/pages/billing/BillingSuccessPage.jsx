import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';

/**
 * Página de éxito tras completar el pago en LemonSqueezy.
 * URL: https://go.ventalink.app/billing/success
 */
export default function BillingSuccessPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate('/planes', { replace: true }), 4000);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="max-w-md w-full mx-4 text-center">
        <div className="rounded-full w-16 h-16 mx-auto flex items-center justify-center mb-6" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
          <Icon name="CheckCircle" size={40} color="#10b981" />
        </div>
        <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
          Pago exitoso
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
          Tu plan se está activando. En unos segundos serás redirigido a Plan y facturación.
        </p>
        <button
          type="button"
          onClick={() => navigate('/planes', { replace: true })}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Ir a Plan y facturación
        </button>
      </div>
    </div>
  );
}
