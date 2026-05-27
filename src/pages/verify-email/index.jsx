import React, { useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import PremiumLoader from 'components/ui/PremiumLoader';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const {
    user,
    loading,
    isEmailConfirmed,
    signOut,
    resendConfirmationEmail,
    refreshUser,
  } = useAuth();

  // Email guardado temporalmente durante el registro cuando Supabase no devuelve sesión
  const pendingEmail = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pendingVerifyEmail') : null;
  const displayEmail = user?.email || pendingEmail || null;

  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState(null);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeMsg, setChangeMsg] = useState(null);

  const handleResend = useCallback(async () => {
    const email = displayEmail?.trim();
    if (!email) return;
    setResendMsg(null);
    setResendLoading(true);
    try {
      const { error } = await resendConfirmationEmail(email);
      if (error) {
        setResendMsg({ type: 'error', text: error.message || 'No se pudo reenviar el correo.' });
      } else {
        setResendMsg({ type: 'ok', text: 'Te enviamos otro correo de verificación. Revisa spam.' });
      }
    } catch {
      setResendMsg({ type: 'error', text: 'Error al reenviar. Intenta más tarde.' });
    } finally {
      setResendLoading(false);
    }
  }, [user?.email, resendConfirmationEmail]);

  const handleRefresh = async () => {
    setResendMsg(null);
    setRefreshLoading(true);
    try {
      const { error, user: fresh } = await refreshUser();
      if (error) {
        setResendMsg({ type: 'error', text: error.message || 'No se pudo actualizar la sesión.' });
        return;
      }
      if (fresh?.email_confirmed_at) {
        navigate('/dashboard', { replace: true });
      } else {
        setResendMsg({ type: 'error', text: 'Aún no detectamos la confirmación. Abre el enlace del correo e intenta de nuevo.' });
      }
    } finally {
      setRefreshLoading(false);
    }
  };

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    setChangeMsg(null);
    const trimmed = newEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setChangeMsg({ type: 'error', text: 'Ingresa un correo válido.' });
      return;
    }
    setChangeLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) {
        setChangeMsg({ type: 'error', text: error.message || 'No se pudo actualizar el correo.' });
      } else {
        setChangeMsg({
          type: 'ok',
          text: 'Te enviamos un correo al nuevo email. Confírmalo y vuelve a iniciar sesión si es necesario.',
        });
        setShowChangeEmail(false);
        setNewEmail('');
        await refreshUser();
      }
    } catch (err) {
      setChangeMsg({ type: 'error', text: err?.message || 'Error inesperado.' });
    } finally {
      setChangeLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('pendingVerifyEmail');
    if (user) await signOut();
    navigate('/login', { replace: true });
  };

  if (loading) {
    return <PremiumLoader fullScreen text="Preparando tu acceso..." />;
  }

  // Redirigir a login solo si no hay usuario autenticado Y tampoco hay email pendiente de registro
  if (!user && !pendingEmail) {
    return <Navigate to="/login" replace />;
  }

  if (isEmailConfirmed) {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('pendingVerifyEmail');
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 sm:p-8" style={{ backgroundColor: 'var(--color-background)' }}>
      <div
        className="w-full max-w-md rounded-2xl border p-6 sm:p-8 shadow-sm"
        style={{ borderColor: 'var(--color-border)', backgroundColor: '#FFFFFF', boxShadow: 'var(--shadow-sm)' }}
      >
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ backgroundColor: 'rgba(124,58,237,0.12)' }}>
          <Icon name="Mail" size={28} color="var(--color-primary)" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-center mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
          Verifica tu correo
        </h1>
        <p className="text-sm text-center mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', lineHeight: 1.6 }}>
          Te enviamos un correo de verificación. Confirma tu email para continuar.
        </p>
        {displayEmail && (
          <p className="text-xs text-center mb-6 font-medium break-all" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
            {displayEmail}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading || !displayEmail}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
          >
            {resendLoading ? 'Enviando…' : 'Reenviar correo'}
          </button>
          <button
            type="button"
            onClick={user ? handleRefresh : () => { sessionStorage.removeItem('pendingVerifyEmail'); navigate('/login'); }}
            disabled={refreshLoading}
            className="w-full py-3 rounded-xl text-sm font-semibold border transition-opacity disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            {refreshLoading ? 'Comprobando…' : 'Ya confirmé mi correo'}
          </button>
          {user && (
            <button
              type="button"
              onClick={() => { setShowChangeEmail((v) => !v); setChangeMsg(null); }}
              className="w-full py-2.5 rounded-xl text-sm font-medium"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
            >
              {showChangeEmail ? 'Cancelar cambio de correo' : 'Cambiar correo'}
            </button>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full py-2.5 rounded-xl text-sm font-medium"
            style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
          >
            {user ? 'Cerrar sesión' : 'Volver al inicio'}
          </button>
        </div>

        {showChangeEmail && (
          <form onSubmit={handleChangeEmail} className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <label className="block text-xs font-semibold mb-1.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
              Nuevo correo electrónico
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="nuevo@correo.com"
              className="w-full px-3 py-2.5 rounded-xl border text-sm mb-3"
              style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
            />
            <button
              type="submit"
              disabled={changeLoading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border transition-opacity disabled:opacity-50"
              style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
            >
              {changeLoading ? 'Guardando…' : 'Guardar nuevo correo'}
            </button>
            {changeMsg && (
              <p className="text-xs mt-2" style={{ fontFamily: 'var(--font-caption)', color: changeMsg.type === 'ok' ? '#059669' : 'var(--color-error)' }}>
                {changeMsg.text}
              </p>
            )}
          </form>
        )}

        {resendMsg && (
          <p
            className="text-xs mt-4 text-center"
            style={{
              fontFamily: 'var(--font-caption)',
              color: resendMsg.type === 'ok' ? '#059669' : 'var(--color-error)',
            }}
          >
            {resendMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}
