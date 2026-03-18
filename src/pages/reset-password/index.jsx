import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import Icon from 'components/AppIcon';

/**
 * Página de restablecimiento de contraseña.
 * El usuario llega aquí desde el enlace del correo enviado por resetPasswordForEmail.
 * Supabase procesa el token del hash (detectSessionInUrl) y emite PASSWORD_RECOVERY.
 * Mostramos formulario para nueva contraseña y llamamos updateUser.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data: { session } } = await supabase?.auth?.getSession();
      if (typeof window !== 'undefined') {
        console.log('[ResetPassword] getSession:', session ? { hasSession: true, user: session?.user?.email } : 'no session');
      }
      if (!mounted) return;
      setHasRecoverySession(!!session);
      setLoading(false);
      if (!session) {
        if (typeof window !== 'undefined') {
          console.log('[ResetPassword] no session, redirect to login');
        }
        navigate('/login', { replace: true, state: { message: 'Usa el enlace que te enviamos por correo para restablecer tu contraseña.' } });
      }
    };

    // Escuchar PASSWORD_RECOVERY por si el evento llega después del mount
    const { data: { subscription } } = supabase?.auth?.onAuthStateChange((event) => {
      if (typeof window !== 'undefined') {
        console.log('[ResetPassword] onAuthStateChange:', event);
      }
      if (event === 'PASSWORD_RECOVERY' && mounted) {
        setHasRecoverySession(true);
        setLoading(false);
      }
    });

    checkSession();
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
    if (typeof window !== 'undefined') {
      console.log('[ResetPassword] updateUser password...');
    }
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (typeof window !== 'undefined') {
        console.log('[ResetPassword] updateUser result:', updateError ? { error: updateError.message } : 'ok');
      }
      if (updateError) {
        setError(updateError?.message || 'Error al actualizar la contraseña.');
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err) {
      setError(err?.message || 'Error inesperado.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <svg className="animate-spin" width={36} height={36} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (!hasRecoverySession) {
    return null; // redirecting
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
            <Icon name="CheckCircle" size={28} style={{ color: 'var(--color-success, #22c55e)' }} />
          </div>
          <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Contraseña actualizada</h1>
          <p className="text-sm mb-4" style={{ color: 'var(--color-muted-foreground)' }}>Redirigiendo al inicio de sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Nueva contraseña</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Ingresa tu nueva contraseña.
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
              onChange={e => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: null })); }}
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
              onChange={e => { setConfirmPassword(e.target.value); setErrors(prev => ({ ...prev, confirmPassword: null })); }}
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
            {submitting ? 'Actualizando...' : 'Restablecer contraseña'}
          </button>
        </form>

        <p className="text-center text-sm mt-6">
          <Link to="/login" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>Volver al inicio de sesión</Link>
        </p>
      </div>
    </div>
  );
}
