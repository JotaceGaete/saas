import React, { useState } from 'react';
import Icon from 'components/AppIcon';
import { useAuth } from '../contexts/AuthContext';

/**
 * Banner persistente cuando el usuario está autenticado pero no ha confirmado su email.
 * Solo se muestra si isAuthenticated && !isEmailConfirmed.
 */
export default function EmailConfirmBanner() {
  const { user, isAuthenticated, isEmailConfirmed, resendConfirmationEmail } = useAuth();
  const [resendLoading, setResendLoading] = useState(false);

  if (!isAuthenticated || isEmailConfirmed) return null;

  const handleResend = async () => {
    const email = user?.email;
    if (!email) return;
    setResendLoading(true);
    try {
      await resendConfirmationEmail(email);
      if (typeof window !== 'undefined') {
        console.log('[EmailConfirmBanner] resend requested for', email);
      }
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div
      className="w-full py-3 px-4 flex flex-wrap items-center justify-center gap-2 text-sm"
      style={{ backgroundColor: 'rgba(245,158,11,0.15)', borderBottom: '1px solid rgba(245,158,11,0.3)' }}
    >
      <Icon name="AlertCircle" size={18} style={{ color: '#B45309' }} className="flex-shrink-0" />
      <span style={{ color: '#92400e', fontFamily: 'var(--font-caption)' }}>
        Confirma tu correo para acceder a todas las funciones.
      </span>
      <button
        type="button"
        onClick={handleResend}
        disabled={resendLoading}
        className="font-semibold underline hover:no-underline disabled:opacity-70"
        style={{ color: 'var(--color-primary)' }}
      >
        {resendLoading ? 'Enviando...' : 'Reenviar correo de confirmación'}
      </button>
    </div>
  );
}
