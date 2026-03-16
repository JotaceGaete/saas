import React, { useState } from 'react';
import Icon from 'components/AppIcon';
import Button from 'components/ui/Button';
import Input from 'components/ui/Input';
import WhatsAppField from './WhatsAppField';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';
import FeatureExplainCards from 'components/FeatureExplainCards';

export default function RegistrationForm({ mode = 'register', onModeChange, onRegister, onLogin, isLoading, authError }) {
  const [formData, setFormData] = useState({ businessName: '', email: '', password: '', confirmPassword: '', whatsapp: '' });
  const [errors, setErrors] = useState({});

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors?.[field]) setErrors(prev => { const e = { ...prev }; delete e?.[field]; return e; });
  };

  const validateRegister = () => {
    const errs = {};
    if (!formData?.businessName?.trim()) errs.businessName = 'El nombre del negocio es obligatorio';
    if (!formData?.email?.trim()) errs.email = 'El email es obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/?.test(formData?.email)) errs.email = 'Email inválido';
    if (!formData?.password) errs.password = 'La contraseña es obligatoria';
    else if (formData?.password?.length < 6) errs.password = 'Mínimo 6 caracteres';
    if (formData?.password !== formData?.confirmPassword) errs.confirmPassword = 'Las contraseñas no coinciden';
    if (!formData?.whatsapp?.trim()) errs.whatsapp = 'El WhatsApp es obligatorio';
    return errs;
  };

  const validateLogin = () => {
    const errs = {};
    if (!formData?.email?.trim()) errs.email = 'El email es obligatorio';
    if (!formData?.password) errs.password = 'La contraseña es obligatoria';
    return errs;
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    const errs = mode === 'register' ? validateRegister() : validateLogin();
    if (Object.keys(errs)?.length > 0) { setErrors(errs); return; }
    if (mode === 'register') onRegister?.({ ...formData, nombre: formData?.businessName });
    else onLogin?.(formData);
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-10 xl:p-14" style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 60%, #4C1D95 100%)' }}>
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center"><Icon name="MessageCircle" size={20} color="#fff" /></div>
            <span className="text-white font-bold text-lg" style={{ fontFamily: 'var(--font-heading)' }}>VentALink</span>
          </div>
          <h2 className="text-3xl xl:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            {mode === 'register' ? 'Crea tu catálogo digital en minutos' : 'Bienvenido de vuelta'}
          </h2>
          <p className="text-white/70 text-base" style={{ fontFamily: 'var(--font-body)' }}>
            {mode === 'register' ? 'Gestiona tus productos y recibe pedidos directamente por WhatsApp.' : 'Accede a tu panel para gestionar tu catálogo y pedidos.'}
          </p>
        </div>
        <FeatureExplainCards variant="grid" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)' }}><Icon name="MessageCircle" size={16} color="#fff" /></div>
            <span className="font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>VentALink</span>
          </div>

          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>{mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{mode === 'register' ? 'Completa el formulario para comenzar' : 'Ingresa tus credenciales'}</p>

          <div className="mb-5 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(124,58,237,0.05)', borderColor: 'rgba(124,58,237,0.2)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>🔑 Credenciales de demo</p>
            <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Email: <strong>negocio@ejemplo.com</strong> · Contraseña: <strong>demo1234</strong></p>
          </div>

          {authError && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <Icon name="AlertCircle" size={15} color="var(--color-error)" />
              <span className="text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === 'register' && (<Input label="Nombre del negocio" value={formData?.businessName} onChange={e => updateField('businessName', e?.target?.value)} error={errors?.businessName} placeholder="Ej: Tienda Artesanal Lucía" required />)}
            <Input label="Email" type="email" value={formData?.email} onChange={e => updateField('email', e?.target?.value)} error={errors?.email} placeholder="tu@email.com" required />
            {mode === 'register' && (<WhatsAppField value={formData?.whatsapp} onChange={val => updateField('whatsapp', val)} error={errors?.whatsapp} />)}
            <div>
              <Input label="Contraseña" type="password" value={formData?.password} onChange={e => updateField('password', e?.target?.value)} error={errors?.password} placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'} required />
              {mode === 'register' && formData?.password && (<div className="mt-2"><PasswordStrengthIndicator password={formData?.password} /></div>)}
            </div>
            {mode === 'register' && (<Input label="Confirmar contraseña" type="password" value={formData?.confirmPassword} onChange={e => updateField('confirmPassword', e?.target?.value)} error={errors?.confirmPassword} placeholder="Repite tu contraseña" required />)}
            <Button type="submit" variant="default" size="lg" loading={isLoading} className="w-full shadow-violet mt-2">
              {mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}
            </Button>
          </form>

          <p className="text-center text-sm mt-5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {mode === 'register' ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <button onClick={() => onModeChange?.(mode === 'register' ? 'login' : 'register')} className="font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
              {mode === 'register' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}