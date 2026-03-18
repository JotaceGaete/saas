import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from 'components/AppIcon';
import GoogleIcon from 'components/GoogleIcon';

export default function LoginForm({ onSubmit, onGoogleLogin, onForgotPassword, isLoading, googleLoading, authError, forgotPasswordSuccess, forgotPasswordLoading, onClearForgotSuccess, redirectMessage }) {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors?.[field]) setErrors(prev => { const e = { ...prev }; delete e?.[field]; return e; });
  };

  const validate = () => {
    const errs = {};
    if (!formData?.email?.trim()) errs.email = 'El correo electrónico es obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/?.test(formData?.email)) errs.email = 'Ingresa un correo válido';
    if (!formData?.password) errs.password = 'La contraseña es obligatoria';
    else if (formData?.password?.length < 6) errs.password = 'Mínimo 6 caracteres';
    return errs;
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    const errs = validate();
    if (Object.keys(errs)?.length > 0) { setErrors(errs); return; }
    onSubmit?.(formData);
  };

  return (
    <div className="w-full max-w-md">
      {/* Mobile logo (solo icono, sin texto) */}
      <div className="flex items-center mb-8 lg:hidden">
        <div className="h-14 flex items-center">
          <img
            src="/logo-ventalink.png"
            alt="VentALink"
            className="h-14 w-auto object-contain"
            onError={(e) => {
              e.target.style.display = 'none';
              const fb = e.target.parentElement?.querySelector('.logo-fallback');
              if (fb) { fb.classList.remove('hidden'); fb.style.display = 'flex'; }
            }}
          />
          <div className="logo-fallback hidden w-14 h-14 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)' }} aria-hidden>
            <Icon name="MessageCircle" size={28} color="#fff" />
          </div>
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Iniciar sesión</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Accede a tu panel para gestionar tu catálogo y pedidos.</p>

      {/* Message from redirect (e.g. reset-password without session) */}
      {redirectMessage && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(124,58,237,0.06)', borderColor: 'rgba(124,58,237,0.2)' }}>
          <Icon name="Info" size={15} style={{ color: 'var(--color-primary)' }} className="mt-0.5 flex-shrink-0" />
          <span className="text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{redirectMessage}</span>
        </div>
      )}

      {/* Forgot password success */}
      {forgotPasswordSuccess && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.3)' }}>
          <Icon name="CheckCircle" size={15} color="var(--color-success, #22c55e)" className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <span className="text-sm" style={{ color: 'var(--color-success, #22c55e)', fontFamily: 'var(--font-caption)' }}>
              Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.
            </span>
            {onClearForgotSuccess && (
              <button type="button" onClick={onClearForgotSuccess} className="block mt-1 text-xs hover:underline" style={{ color: 'var(--color-primary)' }}>
                Cerrar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Auth error banner */}
      {authError && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <Icon name="AlertCircle" size={15} color="var(--color-error)" className="mt-0.5 flex-shrink-0" />
          <span className="text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{authError}</span>
        </div>
      )}

      {onGoogleLogin && (
        <>
          <button
            type="button"
            onClick={onGoogleLogin}
            disabled={googleLoading || isLoading}
            className="w-full h-12 rounded-lg font-medium text-sm flex items-center justify-center gap-3 border transition-all mb-4"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-foreground)',
              fontFamily: 'var(--font-caption)',
              cursor: googleLoading || isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {googleLoading ? (
              <>
                <svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Redirigiendo a Google...
              </>
            ) : (
              <>
                <GoogleIcon />
                Continuar con Google
              </>
            )}
          </button>
          <div className="relative flex items-center mb-4">
            <div className="flex-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
            <span className="px-3 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>o</span>
            <div className="flex-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Email field */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
            Correo electrónico <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <input
            type="email"
            value={formData?.email}
            onChange={e => updateField('email', e?.target?.value)}
            placeholder="tu@negocio.com"
            autoComplete="email"
            className="w-full h-12 px-4 rounded-lg border text-sm transition-all outline-none"
            style={{
              borderColor: errors?.email ? 'var(--color-error)' : 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-foreground)',
              fontFamily: 'var(--font-body)',
              boxShadow: errors?.email ? '0 0 0 3px rgba(239,68,68,0.1)' : 'none',
            }}
            onFocus={e => { if (!errors?.email) e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)'; e.target.style.borderColor = errors?.email ? 'var(--color-error)' : 'var(--color-primary)'; }}
            onBlur={e => { e.target.style.boxShadow = errors?.email ? '0 0 0 3px rgba(239,68,68,0.1)' : 'none'; e.target.style.borderColor = errors?.email ? 'var(--color-error)' : 'var(--color-border)'; }}
          />
          {errors?.email && (
            <p className="mt-1 text-xs flex items-center gap-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
              <Icon name="AlertCircle" size={12} />{errors?.email}
            </p>
          )}
        </div>

        {/* Password field */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
            Contraseña <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={formData?.password}
              onChange={e => updateField('password', e?.target?.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full h-12 px-4 pr-11 rounded-lg border text-sm transition-all outline-none"
              style={{
                borderColor: errors?.password ? 'var(--color-error)' : 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-body)',
                boxShadow: errors?.password ? '0 0 0 3px rgba(239,68,68,0.1)' : 'none',
              }}
              onFocus={e => { if (!errors?.password) e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)'; e.target.style.borderColor = errors?.password ? 'var(--color-error)' : 'var(--color-primary)'; }}
              onBlur={e => { e.target.style.boxShadow = errors?.password ? '0 0 0 3px rgba(239,68,68,0.1)' : 'none'; e.target.style.borderColor = errors?.password ? 'var(--color-error)' : 'var(--color-border)'; }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
              style={{ color: 'var(--color-muted-foreground)' }}
              tabIndex={-1}
            >
              <Icon name={showPassword ? 'EyeOff' : 'Eye'} size={18} />
            </button>
          </div>
          {errors?.password && (
            <p className="mt-1 text-xs flex items-center gap-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
              <Icon name="AlertCircle" size={12} />{errors?.password}
            </p>
          )}
          {/* Forgot password link */}
          <div className="flex justify-end mt-1.5">
            <button
              type="button"
              onClick={() => {
                const email = formData?.email?.trim();
                if (!email) {
                  if (typeof window !== 'undefined') console.log('[LoginForm] forgot password: no email');
                  setErrors(prev => ({ ...prev, email: 'Ingresa tu correo para recibir el enlace de recuperación' }));
                  return;
                }
                onForgotPassword?.(email);
              }}
              disabled={forgotPasswordLoading || isLoading}
              className="text-xs font-medium hover:underline transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
            >
              {forgotPasswordLoading ? (
                <>
                  <span className="inline-block animate-spin mr-1">⟳</span> Enviando...
                </>
              ) : (
                'Olvidé mi contraseña'
              )}
            </button>
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all mt-2"
          style={{
            backgroundColor: isLoading ? 'rgba(124,58,237,0.7)' : 'var(--color-primary)',
            color: '#fff',
            fontFamily: 'var(--font-caption)',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            boxShadow: isLoading ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
          }}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Iniciando sesión...
            </>
          ) : 'Iniciar sesión'}
        </button>
      </form>

      {/* Divider + register link */}
      <div className="mt-6">
        <div className="relative flex items-center">
          <div className="flex-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
        </div>
        <p className="text-center text-sm mt-4" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          ¿No tienes cuenta?{' '}
          <Link to="/business-registration" className="font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
            Crear cuenta gratis
          </Link>
        </p>
      </div>
    </div>
  );
}
