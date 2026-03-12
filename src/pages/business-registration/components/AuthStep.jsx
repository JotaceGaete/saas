import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from 'components/AppIcon';
import WhatsAppField from './WhatsAppField';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';

export default function AuthStep({ onRegister, onLogin, isLoading, authError, onClearError }) {
  const [mode, setMode] = useState('register'); // 'register' | 'login'
  const [formData, setFormData] = useState({ businessName: '', email: '', password: '', confirmPassword: '', whatsapp: '' });
  const [errors, setErrors] = useState({});

  const update = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
    if (authError) onClearError?.();
  };

  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    onClearError?.();
  };

  const validate = () => {
    const e = {};
    if (!formData.email.trim()) e.email = 'El correo es obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) e.email = 'Correo inválido';
    if (!formData.password) e.password = 'La contraseña es obligatoria';
    else if (formData.password.length < 6) e.password = 'Mínimo 6 caracteres';
    if (mode === 'register') {
      if (!formData.businessName.trim()) e.businessName = 'El nombre del negocio es obligatorio';
      if (!formData.whatsapp.trim()) e.whatsapp = 'El WhatsApp es obligatorio';
      if (formData.password !== formData.confirmPassword) e.confirmPassword = 'Las contraseñas no coinciden';
    }
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (mode === 'register') {
      onRegister({ email: formData.email, password: formData.password, businessName: formData.businessName, whatsapp: formData.whatsapp });
    } else {
      onLogin({ email: formData.email, password: formData.password });
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-background)' }}>

      {/* ── Panel izquierdo (desktop) ── */}
      <div className="hidden lg:flex lg:w-5/12 xl:w-2/5 flex-col justify-between p-10 xl:p-14" style={{ background: 'linear-gradient(145deg, #7C3AED 0%, #5B21B6 55%, #4C1D95 100%)' }}>
        <div>
          <div className="flex items-center gap-3 mb-14">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Icon name="MessageCircle" size={20} color="#fff" />
            </div>
            <span className="text-white font-bold text-lg" style={{ fontFamily: 'var(--font-heading)' }}>CatálogoWA</span>
          </div>
          <h2 className="text-3xl xl:text-4xl font-bold text-white mb-4 leading-tight" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em' }}>
            {mode === 'register' ? 'Crea tu catálogo digital en minutos' : 'Bienvenido de vuelta'}
          </h2>
          <p className="text-white/70 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
            {mode === 'register'
              ? 'Gestiona tus productos y recibe pedidos directamente por WhatsApp.'
              : 'Accede a tu panel para gestionar tu catálogo y pedidos.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: 'Package',      label: 'Gestión de productos' },
            { icon: 'ShoppingCart', label: 'Pedidos por WhatsApp' },
            { icon: 'Link',         label: 'Catálogo público' },
            { icon: 'BarChart2',    label: 'Estadísticas' },
          ].map(f => (
            <div key={f.label} className="flex items-center gap-2.5 bg-white/10 rounded-xl p-3">
              <Icon name={f.icon} size={15} color="rgba(255,255,255,0.9)" />
              <span className="text-white/90 text-xs font-medium" style={{ fontFamily: 'var(--font-caption)' }}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Panel derecho: formulario ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Logo móvil */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)' }}>
              <Icon name="MessageCircle" size={16} color="#fff" />
            </div>
            <span className="font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>CatálogoWA</span>
          </div>

          {/* Título */}
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
            {mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {mode === 'register' ? 'Completa el formulario para comenzar' : 'Ingresa tus credenciales'}
          </p>

          {/* Error de auth */}
          {authError && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <Icon name="AlertCircle" size={15} color="var(--color-error)" className="mt-0.5 flex-shrink-0" />
              <span className="text-sm flex-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{authError}</span>
              <button onClick={onClearError} className="flex-shrink-0 opacity-60 hover:opacity-100">
                <Icon name="X" size={14} color="var(--color-error)" />
              </button>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {mode === 'register' && (
              <Field
                label="Nombre del negocio"
                required
                error={errors.businessName}
                input={
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={e => update('businessName', e.target.value)}
                    placeholder="Ej: Tienda Artesanal Lucía"
                    autoFocus
                    className="w-full h-12 px-4 rounded-lg border text-sm outline-none transition-all"
                    style={inputStyle(!!errors.businessName)}
                    onFocus={e => applyFocus(e, !!errors.businessName)}
                    onBlur={e => applyBlur(e, !!errors.businessName)}
                  />
                }
              />
            )}

            <Field
              label="Correo electrónico"
              required
              error={errors.email}
              input={
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => update('email', e.target.value)}
                  placeholder="tu@negocio.com"
                  autoComplete="email"
                  autoFocus={mode === 'login'}
                  className="w-full h-12 px-4 rounded-lg border text-sm outline-none transition-all"
                  style={inputStyle(!!errors.email)}
                  onFocus={e => applyFocus(e, !!errors.email)}
                  onBlur={e => applyBlur(e, !!errors.email)}
                />
              }
            />

            {mode === 'register' && (
              <WhatsAppField
                value={formData.whatsapp}
                onChange={val => update('whatsapp', val)}
                error={errors.whatsapp}
              />
            )}

            <PasswordField
              value={formData.password}
              onChange={v => update('password', v)}
              error={errors.password}
              showStrength={mode === 'register'}
            />

            {mode === 'register' && (
              <Field
                label="Confirmar contraseña"
                required
                error={errors.confirmPassword}
                input={
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={e => update('confirmPassword', e.target.value)}
                    placeholder="Repite tu contraseña"
                    autoComplete="new-password"
                    className="w-full h-12 px-4 rounded-lg border text-sm outline-none transition-all"
                    style={inputStyle(!!errors.confirmPassword)}
                    onFocus={e => applyFocus(e, !!errors.confirmPassword)}
                    onBlur={e => applyBlur(e, !!errors.confirmPassword)}
                  />
                }
              />
            )}

            <SubmitButton loading={isLoading} label={mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'} />
          </form>

          {/* Cambio de modo */}
          <p className="text-center text-sm mt-5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {mode === 'register' ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
            <button
              onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}
              className="font-semibold hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              {mode === 'register' ? 'Iniciar sesión' : 'Crear cuenta gratis'}
            </button>
          </p>

          {mode === 'login' && (
            <p className="text-center text-xs mt-3" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              ¿Olvidaste tu contraseña?{' '}
              <Link to="/login" className="hover:underline" style={{ color: 'var(--color-primary)' }}>
                Ir al inicio de sesión
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes internos ────────────────────────────────────────────────

function Field({ label, required, error, input }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
        {label} {required && <span style={{ color: 'var(--color-error)' }}>*</span>}
      </label>
      {input}
      {error && (
        <p className="mt-1 text-xs flex items-center gap-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
          <Icon name="AlertCircle" size={12} />{error}
        </p>
      )}
    </div>
  );
}

function PasswordField({ value, onChange, error, showStrength }) {
  const [show, setShow] = useState(false);
  return (
    <Field
      label="Contraseña"
      required
      error={error}
      input={
        <div className="space-y-2">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="••••••••"
              autoComplete={showStrength ? 'new-password' : 'current-password'}
              className="w-full h-12 px-4 pr-11 rounded-lg border text-sm outline-none transition-all"
              style={inputStyle(!!error)}
              onFocus={e => applyFocus(e, !!error)}
              onBlur={e => applyBlur(e, !!error)}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShow(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              <Icon name={show ? 'EyeOff' : 'Eye'} size={18} />
            </button>
          </div>
          {showStrength && value && <PasswordStrengthIndicator password={value} />}
        </div>
      }
    />
  );
}

function SubmitButton({ loading, label }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full h-12 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all mt-2"
      style={{
        backgroundColor: loading ? 'rgba(124,58,237,0.7)' : 'var(--color-primary)',
        color: '#fff',
        fontFamily: 'var(--font-caption)',
        cursor: loading ? 'not-allowed' : 'pointer',
        boxShadow: loading ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
      }}
    >
      {loading ? (
        <>
          <svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Procesando...
        </>
      ) : label}
    </button>
  );
}

// ── Helpers de estilos de inputs ───────────────────────────────────────────

function inputStyle(hasError) {
  return {
    borderColor: hasError ? 'var(--color-error)' : 'var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-foreground)',
    fontFamily: 'var(--font-body)',
    boxShadow: hasError ? '0 0 0 3px rgba(239,68,68,0.1)' : 'none',
  };
}

function applyFocus(e, hasError) {
  e.target.style.borderColor = hasError ? 'var(--color-error)' : 'var(--color-primary)';
  if (!hasError) e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)';
}

function applyBlur(e, hasError) {
  e.target.style.borderColor = hasError ? 'var(--color-error)' : 'var(--color-border)';
  e.target.style.boxShadow = hasError ? '0 0 0 3px rgba(239,68,68,0.1)' : 'none';
}
