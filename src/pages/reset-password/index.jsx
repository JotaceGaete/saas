import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Icon from 'components/AppIcon';
import PremiumLoader from 'components/ui/PremiumLoader';

/**
 * Captura URL en el primer render (antes de que el cliente pueda limpiar el hash).
 */
function getAuthFragmentError() {
  if (typeof window === 'undefined') return null;
  const tryParams = (raw) => {
    if (!raw) return null;
    const p = new URLSearchParams(raw.replace(/^[#?]/, ''));
    const err = p.get('error_description') || p.get('error');
    return err ? decodeURIComponent(err.replace(/\+/g, ' ')) : null;
  };
  return tryParams(window.location.hash) || tryParams(window.location.search);
}

function hasRecoveryTypeInUrl() {
  if (typeof window === 'undefined') return false;
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const q = new URLSearchParams(window.location.search.replace(/^\?/, ''));
  return h.get('type') === 'recovery' || q.get('type') === 'recovery';
}

/**
 * Restablecimiento de contraseña (enlace del correo Supabase).
 * redirectTo debe ser: ${origin}/auth/reset-password (añadir en Redirect URLs del proyecto).
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState('checking'); // checking | form | invalid | success
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [checkMessage, setCheckMessage] = useState(null);
  const sawPasswordRecovery = useRef(false);
  const hadRecoveryUrlHint = useRef(hasRecoveryTypeInUrl());

  useEffect(() => {
    let mounted = true;
    const fragmentError = getAuthFragmentError();
    if (fragmentError) {
      setCheckMessage(fragmentError);
      setPhase('invalid');
      return () => { mounted = false; };
    }

    const applySession = (session) => {
      if (!mounted || !session) return;
      setPhase('form');
      setCheckMessage(null);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        sawPasswordRecovery.current = true;
        applySession(session);
        return;
      }
      if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        if (sawPasswordRecovery.current || hadRecoveryUrlHint.current) {
          applySession(session);
        }
      }
    });

    let attempts = 0;
    const maxAttempts = 20;
    const intervalMs = 200;

    const poll = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session) {
        applySession(session);
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        if (hadRecoveryUrlHint.current && !session) {
          setPhase('invalid');
          setCheckMessage('El enlace de recuperación expiró o ya fue usado. Solicita uno nuevo desde el inicio de sesión.');
        } else {
          navigate('/login', {
            replace: true,
            state: { message: 'Usa el enlace que te enviamos por correo para restablecer tu contraseña.' },
          });
        }
        return;
      }
      setTimeout(poll, intervalMs);
    };

    poll();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [navigate]);

  const validate = () => {
    const errs = {};
    if (!password) errs.password = 'La contraseña es obligatoria';
    else if (password.length < 6) errs.password = 'Mínimo 6 caracteres';
    if (password !== confirmPassword) errs.confirmPassword = 'Las contraseñas no coinciden';
    return errs;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError(null);
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        const msg = updateError.message || 'Error al actualizar la contraseña.';
        setError(msg);
        return;
      }
      setPhase('success');
    } catch (err) {
      setError(err?.message || 'Error inesperado.');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'checking') {
    return <PremiumLoader fullScreen text="Validando enlace de recuperación..." />;
  }

  if (phase === 'invalid') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}>
            <Icon name="AlertCircle" size={28} style={{ color: 'var(--color-error)' }} />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            No pudimos validar el enlace
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {checkMessage || 'El enlace es inválido o ha expirado. Solicita un nuevo correo de recuperación.'}
          </p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center w-full h-12 rounded-lg font-semibold text-sm"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          >
            Ir al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  if (phase === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
            <Icon name="CheckCircle" size={28} style={{ color: 'var(--color-success, #22c55e)' }} />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            Contraseña actualizada
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Tu contraseña ha sido actualizada correctamente.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="w-full h-12 rounded-lg font-semibold text-sm"
            style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
          >
            Ir al login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
          Nueva contraseña
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Elige una contraseña segura para tu cuenta.
        </p>

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <Icon name="AlertCircle" size={15} color="var(--color-error)" className="mt-0.5 flex-shrink-0" />
            <span className="text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Nueva contraseña <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: null })); }}
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={6}
              className="w-full h-12 px-4 rounded-lg border text-sm outline-none transition-all"
              style={{
                borderColor: errors?.password ? 'var(--color-error)' : 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-foreground)',
              }}
            />
            {errors?.password && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-error)' }}>{errors.password}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Confirmar contraseña <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setErrors((prev) => ({ ...prev, confirmPassword: null })); }}
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={6}
              className="w-full h-12 px-4 rounded-lg border text-sm outline-none transition-all"
              style={{
                borderColor: errors?.confirmPassword ? 'var(--color-error)' : 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-foreground)',
              }}
            />
            {errors?.confirmPassword && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-error)' }}>{errors.confirmPassword}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-lg font-semibold text-sm"
            style={{
              backgroundColor: submitting ? 'rgba(124,58,237,0.7)' : 'var(--color-primary)',
              color: '#fff',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Guardando...' : 'Guardar nueva contraseña'}
          </button>
        </form>

        <p className="text-center text-sm mt-6">
          <Link to="/login" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>Volver al inicio de sesión</Link>
        </p>
      </div>
    </div>
  );
}
