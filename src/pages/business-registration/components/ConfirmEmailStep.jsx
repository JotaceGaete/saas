import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from 'components/AppIcon';

/**
 * Pantalla mostrada tras registro cuando se requiere confirmación de email.
 * Muestra el mensaje, el correo usado, botón para reenviar y link a login.
 */
export default function ConfirmEmailStep({ email, onResend, authError, onClearError }) {
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleResend = async () => {
    setResendLoading(true);
    setResendSuccess(false);
    onClearError?.();
    try {
      const result = await onResend?.();
      if (typeof window !== 'undefined') {
        console.log('[ConfirmEmailStep] resend result:', result);
      }
      if (!result?.error) {
        setResendSuccess(true);
      }
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Panel izquierdo (mismo estilo que AuthStep) */}
      <div
        className="w-full lg:w-1/2 flex flex-col justify-center p-8 md:p-10 xl:p-14 min-h-[40vh] lg:min-h-screen"
        style={{ background: 'linear-gradient(145deg, #7C3AED 0%, #5B21B6 55%, #4C1D95 100%)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
            Revisa tu correo
          </h2>
          <p className="text-white/85 text-base" style={{ fontFamily: 'var(--font-body)' }}>
            Te enviamos un enlace para activar tu cuenta. Es importante que lo revises.
          </p>
        </motion.div>
      </div>

      {/* Panel derecho */}
      <div className="flex-1 flex flex-col items-center justify-center py-8 px-6 md:py-10 md:px-8 lg:p-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[420px]"
        >
          <div className="flex items-center justify-center w-16 h-16 rounded-full mb-6 mx-auto" style={{ backgroundColor: 'rgba(124,58,237,0.15)' }}>
            <Icon name="Mail" size={32} style={{ color: 'var(--color-primary)' }} />
          </div>

          <h1 className="text-2xl font-bold text-center mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            Confirma tu correo
          </h1>
          <p className="text-center text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Te enviamos un enlace de confirmación a tu correo. Debes activarlo para ingresar correctamente.
          </p>

          {email && (
            <div className="mb-6 p-4 rounded-xl border text-center" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--color-muted-foreground)' }}>Correo enviado a</p>
              <p className="font-medium break-all" style={{ color: 'var(--color-foreground)' }}>{email}</p>
            </div>
          )}

          {authError && (
            <div className="mb-5 flex items-start gap-2 p-3 rounded-xl border" style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <Icon name="AlertCircle" size={15} color="var(--color-error)" className="mt-0.5 flex-shrink-0" />
              <span className="text-sm flex-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{authError}</span>
              <button type="button" onClick={onClearError} className="flex-shrink-0 opacity-60 hover:opacity-100">
                <Icon name="X" size={14} color="var(--color-error)" />
              </button>
            </div>
          )}

          {resendSuccess && (
            <div className="mb-5 flex items-start gap-2 p-3 rounded-xl border" style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
              <Icon name="CheckCircle" size={15} style={{ color: 'var(--color-success, #22c55e)' }} className="mt-0.5 flex-shrink-0" />
              <span className="text-sm" style={{ color: 'var(--color-success, #22c55e)', fontFamily: 'var(--font-caption)' }}>
                Correo reenviado. Revisa tu bandeja de entrada.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading}
            className="w-full h-12 rounded-xl font-medium text-sm border mb-4"
            style={{
              borderColor: 'var(--color-primary)',
              color: 'var(--color-primary)',
              backgroundColor: 'transparent',
              cursor: resendLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {resendLoading ? (
              <>
                <span className="inline-block animate-spin mr-2">⟳</span> Reenviando...
              </>
            ) : (
              'Reenviar correo de confirmación'
            )}
          </button>

          <p className="text-center text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            ¿Ya activaste tu cuenta?{' '}
            <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
              Iniciar sesión
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
