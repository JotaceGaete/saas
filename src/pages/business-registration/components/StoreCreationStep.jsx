import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { useAuth } from '../../../contexts/AuthContext';
import { createBusiness } from '../../../services/waBusinessService';
import WhatsAppField from './WhatsAppField';
import { getCountryLabels } from '../../../config/country';
import { getCountryConfig } from '../../../config/countryConfig';
import { useCountry } from '../../../contexts/CountryContext';
import { getBusinessLocale } from '../../../lib/locale/businessLocale';
import { resolveCountryState, resolveBillingSetup, logCountryStateDebug } from '../../../lib/country/state-model';
import { resolveCountryCode } from '../../../lib/country/resolveCountryCode';

export default function StoreCreationStep({ user, businessLoading }) {
  const navigate = useNavigate();
  const { refreshBusiness } = useAuth();
  const { countryCode } = useCountry();
  const [selectedOnboardingCountry, setSelectedOnboardingCountry] = useState(
    countryCode ?? user?.user_metadata?.country_code ?? user?.user_metadata?.country ?? null,
  );
  const countryState = resolveCountryState({
    businessCountryCode: null,
    onboardingCountryCode: selectedOnboardingCountry,
    userCountryCode: user?.user_metadata?.country_code ?? user?.user_metadata?.country ?? null,
    hostnameSuggestionCountryCode: countryCode ?? null,
  });
  const billingSetup = resolveBillingSetup(countryState);
  const locale = getBusinessLocale(null, {
    preferredCountryCode: countryState.billingCountry,
  });
  const labels = getCountryLabels(locale.countryCode);

  const [formData, setFormData] = useState({
    businessName: user?.user_metadata?.name || '',
    whatsapp:     user?.user_metadata?.whatsapp || '',
    description:  '',
    currency:     locale.currencyCode,
    countryCode:  selectedOnboardingCountry ?? null,
  });
  const [errors, setErrors]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    setFormData((prev) => ({ ...prev, currency: locale.currencyCode }));
  }, [locale.currencyCode]);

  const effectiveCountryCode =
    selectedOnboardingCountry ||
    formData.countryCode ||
    countryState.uxCountry ||
    null;

  const handleCountryChange = (next) => {
    setSelectedOnboardingCountry(next);
    setFormData((prev) => ({ ...prev, countryCode: next || null }));
  };

  useEffect(() => {
    logCountryStateDebug({
      uxCountry: countryState.uxCountry,
      businessCountry: countryState.businessCountry,
      billingCountry: countryState.billingCountry,
      provider: billingSetup.billingProvider,
      currency: billingSetup.currency,
    });
  }, [
    countryState.uxCountry,
    countryState.businessCountry,
    countryState.billingCountry,
    billingSetup.billingProvider,
    billingSetup.currency,
  ]);

  const update = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  };

  const validate = () => {
    const e = {};
    if (!formData.businessName.trim()) e.businessName = 'El nombre del negocio es obligatorio';
    if (!formData.whatsapp.trim())     e.whatsapp     = 'El WhatsApp es obligatorio';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    setSaveError(null);
    try {
      console.info('[COUNTRY_SUBMIT_PAYLOAD]', {
        selectedOnboardingCountry,
        formDataCountryCode: formData.countryCode || null,
        countryStateUxCountry: countryState?.uxCountry || null,
        whatsapp: formData.whatsapp || null,
        effectiveCountryCode,
      });

      const countryResolution = resolveCountryCode({
        business: null,
        user,
        phoneInput: formData.whatsapp,
        explicitCountryCode: effectiveCountryCode,
      });
      const resolvedCode = effectiveCountryCode || countryResolution.finalCountry;
      if (!resolvedCode) {
        setSaveError('Selecciona el país de tu número de WhatsApp.');
        setSaving(false);
        return;
      }
      console.info('[COUNTRY_RESOLUTION]', {
        businessId: null,
        countryFromBusiness: countryResolution.countryFromBusiness,
        countryFromUser: countryResolution.countryFromUser,
        countryFromPhone: countryResolution.countryFromPhone,
        finalCountry: countryResolution.finalCountry,
        currency: countryResolution.currency,
      });
      const labelsForCreate = getCountryLabels(resolvedCode);
      const currencyForCreate = countryResolution.currency || getCountryConfig(resolvedCode)?.currency || locale.currencyCode;
      const payload = {
        name:        formData.businessName.trim(),
        whatsapp:    formData.whatsapp.trim(),
        description: formData.description.trim() || null,
        currency:    currencyForCreate,
        country:     labelsForCreate.countryName,
        countryCode: effectiveCountryCode || resolvedCode,
      };
      console.info('[COUNTRY_CREATE_BUSINESS_PAYLOAD]', payload);
      const { data, error } = await createBusiness({
        ...payload,
      });
      if (error) {
        setSaveError(error.message || 'No se pudo crear el negocio. Intenta de nuevo.');
        return;
      }
      if (data) {
        await refreshBusiness();
        navigate('/dashboard', { replace: true });
      }
    } catch {
      setSaveError('Error inesperado. Por favor intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // Mientras carga el negocio por primera vez (post-login, comprobando si ya existe)
  if (businessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin" width={32} height={32} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Verificando tu cuenta...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-md">

        {/* Logo VentALink */}
        <div className="mb-6">
          <img
            src="/logo-ventalink-redes.png"
            alt="VentALink"
            className="w-full max-w-[280px] h-auto object-contain mx-auto"
          />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>
            <Icon name="Store" size={20} color="#fff" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
              Crear tu tienda
            </h1>
            <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Sesión iniciada como <strong>{user?.email}</strong>
            </p>
          </div>
        </div>

        {/* Stepper visual */}
        <div className="flex items-center gap-2 mb-8">
          <Step num={1} label="Cuenta" done />
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-primary)' }} />
          <Step num={2} label="Tu tienda" active />
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          <Step num={3} label="Dashboard" />
        </div>

        {/* Error */}
        {saveError && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <Icon name="AlertCircle" size={15} color="var(--color-error)" className="mt-0.5 flex-shrink-0" />
            <span className="text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{saveError}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Nombre del negocio <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.businessName}
              onChange={e => update('businessName', e.target.value)}
              placeholder="Ej: Tienda Artesanal Lucía"
              autoFocus
              className="w-full h-12 px-4 rounded-lg border text-sm outline-none transition-all"
              style={{
                borderColor: errors.businessName ? 'var(--color-error)' : 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-body)',
              }}
              onFocus={e => { e.target.style.borderColor = errors.businessName ? 'var(--color-error)' : 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = errors.businessName ? 'var(--color-error)' : 'var(--color-border)'; e.target.style.boxShadow = 'none'; }}
            />
            {errors.businessName && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><Icon name="AlertCircle" size={12} />{errors.businessName}</p>}
          </div>

          <WhatsAppField
            value={formData.whatsapp}
            onChange={val => update('whatsapp', val)}
            error={errors.whatsapp}
            countryCode={effectiveCountryCode}
            onCountryChange={handleCountryChange}
            onResolvedCountryCode={handleCountryChange}
          />

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Descripción breve <span className="font-normal" style={{ color: 'var(--color-muted-foreground)' }}>(opcional)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Ej: Venta de productos artesanales y manualidades"
              rows={2}
              className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition-all resize-none"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-body)',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Moneda (según país)
            </label>
            <div
              className="w-full h-12 px-4 rounded-lg border text-sm flex items-center"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-muted)',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {locale.currencyCode}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all mt-2"
            style={{
              backgroundColor: saving ? 'rgba(124,58,237,0.7)' : 'var(--color-primary)',
              color: '#fff',
              fontFamily: 'var(--font-caption)',
              cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: saving ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
            }}
          >
            {saving ? (
              <>
                <svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Creando tu tienda...
              </>
            ) : (
              <>
                <Icon name="Store" size={16} color="#fff" />
                Crear mi tienda
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs mt-5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Podrás personalizar más detalles desde el panel de configuración.
        </p>
      </div>
    </div>
  );
}

function Step({ num, label, done, active }) {
  const bg    = done ? 'var(--color-primary)' : active ? 'var(--color-primary)' : 'var(--color-border)';
  const color = done || active ? '#fff' : 'var(--color-muted-foreground)';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: bg, color }}>
        {done ? <Icon name="Check" size={13} color="#fff" /> : num}
      </div>
      <span className="text-xs" style={{ color: active ? 'var(--color-primary)' : 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', fontWeight: active ? 600 : 400 }}>
        {label}
      </span>
    </div>
  );
}
