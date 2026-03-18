import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from 'components/AppIcon';
import GoogleIcon from 'components/GoogleIcon';
import WhatsAppField from './WhatsAppField';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import { getCountryLabels } from 'config/country';

const BENEFITS = [
  'Comparte tu catálogo en Instagram, TikTok o Facebook',
  'Recibe pedidos organizados automáticamente',
  'Sin comisiones',
];

const FEATURE_CARDS = [
  { icon: 'Package', title: 'Gestión de productos', description: 'Agrega y organiza tus productos fácilmente.' },
  { icon: 'ShoppingCart', title: 'Pedidos por WhatsApp', description: 'Los clientes te envían el pedido directo.' },
  { icon: 'Link', title: 'Catálogo público', description: 'Comparte el link de tu catálogo donde quieras.' },
  { icon: 'BarChart2', title: 'Estadísticas', description: 'Revisa visitas y pedidos.' },
];

export default function AuthStep({ onRegister, onLogin, onGoogleLogin, isLoading, authError, onClearError }) {
  const countryLabels = getCountryLabels();
  const [mode, setMode] = useState('register');
  const [googleLoading, setGoogleLoading] = useState(false);
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
    const emailVal = (formData.email || '').trim();
    if (!emailVal) e.email = 'El correo es obligatorio';
    else if (emailVal.length > 254) e.email = 'El correo es demasiado largo';
    else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailVal)) e.email = 'Ingresa un correo válido (ej: tu@negocio.com)';
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
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ backgroundColor: 'var(--color-background)' }}>

      {/* ── Hero / Left panel (top on mobile, left on desktop) ── */}
      <div
        className="w-full lg:w-1/2 flex flex-col justify-between p-8 md:p-10 xl:p-14 min-h-[50vh] lg:min-h-screen order-1"
        style={{ background: 'linear-gradient(145deg, #7C3AED 0%, #5B21B6 55%, #4C1D95 100%)' }}
      >
        <div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
            className="mb-6 md:mb-8"
          >
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm bg-white/15 text-white/95" aria-label={countryLabels.countryName} title={countryLabels.countryName}>{countryLabels.flag} {countryLabels.countryName}</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            {mode === 'register' && (
              <span className="inline-block mb-3 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-white/20 text-white border border-white/30" style={{ fontFamily: 'var(--font-caption)' }}>
                Sin comisiones
              </span>
            )}
            <h2 className="text-2xl sm:text-3xl md:text-4xl xl:text-[2.75rem] font-bold text-white mb-3 leading-[1.15]" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.04em' }}>
              {mode === 'register' ? 'Convierte tu WhatsApp en una tienda de ventas' : 'Bienvenido de vuelta'}
            </h2>
            <p className="text-white/85 text-base sm:text-lg leading-relaxed mb-6" style={{ fontFamily: 'var(--font-body)' }}>
              {mode === 'register' ? 'Tus clientes ven tus productos, arman su pedido y te lo envían directo a tu WhatsApp.' : 'Accede a tu panel para gestionar tu catálogo y pedidos.'}
            </p>

            {mode === 'register' && (
              <>
                <ul className="space-y-2 mb-6">
                  {BENEFITS.map((text, i) => (
                    <motion.li
                      key={text}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, delay: 0.18 + i * 0.07 }}
                      className="flex items-center gap-2.5 text-white/95 text-sm"
                      style={{ fontFamily: 'var(--font-body)' }}
                    >
                      <span className="text-[#86efac] font-bold text-base leading-none shrink-0">✔</span>
                      {text}
                    </motion.li>
                  ))}
                </ul>
                <p className="text-white/70 text-sm mb-8" style={{ fontFamily: 'var(--font-caption)' }}>
                  Hecho para emprendedores que venden por WhatsApp en Chile
                </p>
              </>
            )}
          </motion.div>

          {/* Banner VentALink — Unifica tus ventas por redes (centrado) */}
          {mode === 'register' && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.3 }}
              className="mt-6 sm:mt-8 flex justify-center"
            >
              <img
                src="/logo-ventalink-redes.png"
                alt="VentALink — Unifica todas tus ventas por WhatsApp, Instagram, YouTube, Facebook, TikTok o Mail"
                className="w-full max-w-[420px] sm:max-w-[480px] h-auto rounded-2xl border-2 border-white/25 shadow-2xl object-contain mx-auto"
                style={{ boxShadow: '0 20px 50px -12px rgba(0,0,0,0.35)' }}
              />
            </motion.div>
          )}
        </div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.45 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 lg:mt-6"
        >
          {FEATURE_CARDS.map((f) => (
            <motion.div
              key={f.title}
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              className="bg-white/10 hover:bg-white/15 rounded-xl p-4 border border-white/10 transition-colors duration-200 cursor-default"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Icon name={f.icon} size={18} color="rgba(255,255,255,0.95)" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm mb-0.5" style={{ fontFamily: 'var(--font-caption)' }}>{f.title}</p>
                  <p className="text-white/70 text-xs leading-snug" style={{ fontFamily: 'var(--font-body)' }}>{f.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ── Form panel (bottom on mobile, right on desktop) ── */}
      <div className="flex-1 flex flex-col items-center justify-center py-8 px-6 md:py-10 md:px-8 lg:p-10 overflow-y-auto order-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12 }}
          className="w-full max-w-[420px]"
        >
          {/* Logo móvil (misma marca) */}
          <div className="mb-6 lg:hidden">
            <img
              src="/logo-ventalink-redes.png"
              alt="VentALink"
              className="w-full max-w-[240px] h-auto object-contain"
            />
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs bg-violet-100 text-violet-700 mt-2" title={countryLabels.countryName}>{countryLabels.flag} {countryLabels.countryName}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.03em' }}>
            {mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}
          </h1>
          <p className="text-sm mb-6 flex items-center gap-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {mode === 'register' ? 'Solo toma un minuto.' : 'Ingresa tus credenciales.'}
            <span className="text-base" title={countryLabels.countryName}>{countryLabels.flag}</span>
          </p>

          {authError && (
            <div className="mb-5 flex items-start gap-2 p-3 rounded-xl border" style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <Icon name="AlertCircle" size={15} color="var(--color-error)" className="mt-0.5 flex-shrink-0" />
              <span className="text-sm flex-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{authError}</span>
              <button type="button" onClick={onClearError} className="flex-shrink-0 opacity-60 hover:opacity-100">
                <Icon name="X" size={14} color="var(--color-error)" />
              </button>
            </div>
          )}

          {onGoogleLogin && (
            <>
              <button
                type="button"
                onClick={async () => {
                  setGoogleLoading(true);
                  onClearError?.();
                  await onGoogleLogin();
                  setGoogleLoading(false);
                }}
                disabled={googleLoading || isLoading}
                className="w-full h-12 rounded-xl font-medium text-sm flex items-center justify-center gap-3 border transition-all mb-5"
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
                    <svg className="animate-spin" width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Redirigiendo a Google...
                  </>
                ) : (
                  <>
                    <GoogleIcon size={20} />
                    Continuar con Google
                  </>
                )}
              </button>
              <div className="relative flex items-center mb-5">
                <div className="flex-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
                <span className="px-3 text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>o</span>
                <div className="flex-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} noValidate className="rounded-2xl p-8 border space-y-6" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05)' }}>
            {mode === 'register' && (
              <>
                <SectionHeader icon="Store" title="Negocio" />
                <div className="space-y-5 md:space-y-6">
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
                        className="w-full h-12 px-4 rounded-xl border text-sm outline-none transition-all duration-200"
                        style={inputStyle(!!errors.businessName)}
                        onFocus={e => applyFocus(e, !!errors.businessName)}
                        onBlur={e => applyBlur(e, !!errors.businessName)}
                      />
                    }
                  />
                  <WhatsAppField
                    value={formData.whatsapp}
                    onChange={val => update('whatsapp', val)}
                    error={errors.whatsapp}
                    hint={countryLabels.whatsappHint}
                  />
                </div>
              </>
            )}

            <SectionHeader icon="Mail" title="Cuenta" />
            <div className="space-y-5 md:space-y-6">
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
                    className="w-full h-12 px-4 rounded-xl border text-sm outline-none transition-all"
                    style={inputStyle(!!errors.email)}
                    onFocus={e => applyFocus(e, !!errors.email)}
                    onBlur={e => applyBlur(e, !!errors.email)}
                  />
                }
              />
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
                      className="w-full h-12 px-4 rounded-xl border text-sm outline-none transition-all duration-200"
                      style={inputStyle(!!errors.confirmPassword)}
                      onFocus={e => applyFocus(e, !!errors.confirmPassword)}
                      onBlur={e => applyBlur(e, !!errors.confirmPassword)}
                    />
                  }
                />
              )}
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
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
                    Procesando...
                  </>
                ) : mode === 'register' ? 'Crear mi catálogo' : 'Iniciar sesión'}
              </button>
              {mode === 'register' && (
                <p className="text-center text-xs mt-3" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  No se requiere tarjeta de crédito.
                </p>
              )}
            </div>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {mode === 'register' ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
            <button
              type="button"
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
        </motion.div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
        <Icon name={icon} size={14} color="#fff" />
      </div>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{title}</h3>
    </div>
  );
}

function Field({ label, required, error, input }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
        {label} {required && <span style={{ color: 'var(--color-error)' }}>*</span>}
      </label>
      {input}
      {error && (
        <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
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
              className="w-full h-12 px-4 pr-11 rounded-xl border text-sm outline-none transition-all duration-200"
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
