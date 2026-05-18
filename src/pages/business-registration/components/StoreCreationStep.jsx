import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import PremiumLoader from 'components/ui/PremiumLoader';
import { useAuth } from '../../../contexts/AuthContext';
import { createBusiness, updateBusiness } from '../../../services/waBusinessService';
import { getPublicCatalogRelativePath, getPublicCatalogUrl } from '../../../config/appUrl';
import WhatsAppField from './WhatsAppField';

/**
 * Creación inicial de tienda: sin país ni moneda (se definen en Configuración).
 */
export default function StoreCreationStep({ user, business, businessLoading, onBusinessCreated }) {
  const navigate = useNavigate();
  const { refreshBusiness, patchBusiness } = useAuth();

  const [formData, setFormData] = useState({
    businessName: user?.user_metadata?.name || '',
    whatsapp: '',
    description: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [createdBusiness, setCreatedBusiness] = useState(null);
  const [copied, setCopied] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState('');
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugError, setSlugError] = useState(null);

  const readyBusiness = createdBusiness || business;
  const publicSlug = String(readyBusiness?.slug || '').trim();
  const publicUrl = publicSlug ? getPublicCatalogUrl(publicSlug) : '';
  const catalogPath = publicSlug ? getPublicCatalogRelativePath(publicSlug) : '';

  const update = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => {
      const e = { ...prev };
      delete e[field];
      return e;
    });
  };

  const validate = () => {
    const e = {};
    if (!formData.businessName.trim()) e.businessName = 'El nombre del negocio es obligatorio';
    if (!formData.whatsapp.trim()) e.whatsapp = 'El WhatsApp es obligatorio';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      console.info('[VTLK_NEUTRAL_REGISTER]', { event: 'store_creation_submit' });
      const { data, error } = await createBusiness({
        name: formData.businessName.trim(),
        whatsapp: formData.whatsapp.trim(),
        description: formData.description.trim() || null,
      });
      if (error) {
        setSaveError(error.message || 'No se pudo crear el negocio. Intenta de nuevo.');
        return;
      }
      if (data) {
        setCreatedBusiness(data);
        setSlugDraft(data.slug || '');
        onBusinessCreated?.(data);
        await refreshBusiness();
      }
    } catch {
      setSaveError('Error inesperado. Por favor intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (businessLoading) {
    return <PremiumLoader fullScreen text="Verificando tu cuenta..." />;
  }

  if (readyBusiness) {
    const copyLink = async () => {
      if (!publicUrl) return;
      try {
        await navigator.clipboard?.writeText(publicUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        setSlugError('No pudimos copiar el link. Puedes seleccionarlo y copiarlo manualmente.');
      }
    };

    const openCatalog = () => {
      if (!catalogPath) return;
      window.open(catalogPath, '_blank', 'noopener,noreferrer');
    };

    const handleEditSlug = () => {
      setSlugDraft(publicSlug);
      setSlugError(null);
      setEditingSlug(true);
    };

    const handleSaveSlug = async () => {
      const nextSlug = String(slugDraft || '').trim().toLowerCase();
      setSlugError(null);
      if (!nextSlug) {
        setSlugError('Escribe un link para tu catálogo.');
        return;
      }
      if (!/^[a-z0-9-]+$/.test(nextSlug)) {
        setSlugError('Usa solo minúsculas, números y guiones.');
        return;
      }
      if (nextSlug.startsWith('-') || nextSlug.endsWith('-') || nextSlug.includes('--')) {
        setSlugError('Evita guiones al inicio, al final o repetidos.');
        return;
      }
      if (nextSlug === publicSlug) {
        setEditingSlug(false);
        return;
      }

      setSlugSaving(true);
      const { data, error } = await updateBusiness(readyBusiness.id, { slug: nextSlug });
      setSlugSaving(false);
      if (error) {
        const message = String(error?.message || '').toLowerCase();
        if (error?.code === '23505' || message.includes('duplicate') || message.includes('unique')) {
          setSlugError('Ese link ya está en uso. Prueba con otro nombre.');
        } else {
          setSlugError(error?.message || 'No pudimos guardar el link. Intenta de nuevo.');
        }
        return;
      }

      const updated = data || { ...readyBusiness, slug: nextSlug };
      setCreatedBusiness(updated);
      onBusinessCreated?.(updated);
      patchBusiness?.(updated);
      setEditingSlug(false);
    };

    return (
      <div className="min-h-screen flex items-center justify-center p-5" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="w-full max-w-md">
          <div className="mb-6">
            <img
              src="/walinka.svg"
              alt="Walinka"
              className="w-full max-w-[240px] h-auto object-contain mx-auto"
            />
          </div>

          <div className="flex items-center gap-2 mb-8">
            <Step num={1} label="Cuenta" done />
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-primary)' }} />
            <Step num={2} label="Tu tienda" done />
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-primary)' }} />
            <Step num={3} label="Catálogo" active />
          </div>

          <div className="rounded-2xl border p-5 sm:p-6" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--color-primary)' }}>
              <Icon name="PartyPopper" size={24} color="#fff" />
            </div>

            <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Tu catálogo está listo 🎉
            </h1>
            <p className="text-sm mb-5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Ya tienes un link para compartir tu negocio.
            </p>

            <div className="rounded-xl border p-3 mb-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
              {publicUrl ? (
                <p className="text-sm break-all font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-body)' }}>
                  {publicUrl}
                </p>
              ) : (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.25)" strokeWidth="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Preparando tu link...
                </div>
              )}
            </div>

            {!editingSlug ? (
              <button
                type="button"
                onClick={handleEditSlug}
                disabled={!publicSlug}
                className="text-sm font-semibold mb-5 disabled:opacity-50"
                style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
              >
                Editar link
              </button>
            ) : (
              <div className="mb-5">
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                  Link del catálogo
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={slugDraft}
                    onChange={(e) => setSlugDraft(e.target.value.toLowerCase())}
                    className="min-w-0 flex-1 h-11 px-3 rounded-lg border text-sm outline-none"
                    style={{
                      borderColor: slugError ? 'var(--color-error)' : 'var(--color-border)',
                      backgroundColor: 'var(--color-background)',
                      color: 'var(--color-foreground)',
                      fontFamily: 'var(--font-body)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveSlug}
                    disabled={slugSaving}
                    className="h-11 px-4 rounded-lg text-sm font-semibold disabled:opacity-70"
                    style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
                  >
                    {slugSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSlug(false);
                    setSlugError(null);
                  }}
                  className="text-xs mt-2"
                  style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                >
                  Cancelar
                </button>
              </div>
            )}

            {slugError && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
                <Icon name="AlertCircle" size={15} color="var(--color-error)" className="mt-0.5 flex-shrink-0" />
                <span className="text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{slugError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <button
                type="button"
                onClick={openCatalog}
                disabled={!publicSlug}
                className="h-11 rounded-lg border font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="ExternalLink" size={16} />
                Ver mi catálogo
              </button>
              <button
                type="button"
                onClick={copyLink}
                disabled={!publicUrl}
                className="h-11 rounded-lg border font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name={copied ? 'Check' : 'Copy'} size={16} />
                {copied ? 'Copiado' : 'Copiar link'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigate('/dashboard', { replace: true })}
              className="w-full h-12 rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                fontFamily: 'var(--font-caption)',
                boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
              }}
            >
              <Icon name="LayoutDashboard" size={16} color="#fff" />
              Ir al dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-md">

        <div className="mb-6">
          <img
            src="/walinka.svg"
            alt="Walinka"
            className="w-full max-w-[280px] h-auto object-contain mx-auto"
          />
        </div>

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

        <div className="flex items-center gap-2 mb-8">
          <Step num={1} label="Cuenta" done />
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-primary)' }} />
          <Step num={2} label="Tu tienda" active />
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          <Step num={3} label="Dashboard" />
        </div>

        {saveError && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <Icon name="AlertCircle" size={15} color="var(--color-error)" className="mt-0.5 flex-shrink-0" />
            <span className="text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{saveError}</span>
          </div>
        )}

        <p className="text-xs mb-4 p-3 rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(124,58,237,0.06)', fontFamily: 'var(--font-caption)', color: 'var(--color-text-secondary)' }}>
          El país y la moneda de tu negocio los elegirás después en <strong>Configuración</strong>.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Nombre del negocio <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              type="text"
              value={formData.businessName}
              onChange={(e) => update('businessName', e.target.value)}
              placeholder="Ej: Tienda Artesanal Lucía"
              autoFocus
              className="w-full h-12 px-4 rounded-lg border text-sm outline-none transition-all"
              style={{
                borderColor: errors.businessName ? 'var(--color-error)' : 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-body)',
              }}
            />
            {errors.businessName && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><Icon name="AlertCircle" size={12} />{errors.businessName}</p>}
          </div>

          <WhatsAppField
            neutral
            value={formData.whatsapp}
            onChange={(val) => update('whatsapp', val)}
            error={errors.whatsapp}
            hint="Incluye código de país si aplica (ej. +52 1 55 1234 5678)."
          />

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
              Descripción breve <span className="font-normal" style={{ color: 'var(--color-muted-foreground)' }}>(opcional)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Ej: Venta de productos artesanales y manualidades"
              rows={2}
              className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition-all resize-none"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-body)',
              }}
            />
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
          Podrás definir país, moneda y más en Configuración.
        </p>
      </div>
    </div>
  );
}

function Step({ num, label, done, active }) {
  const bg = done ? 'var(--color-primary)' : active ? 'var(--color-primary)' : 'var(--color-border)';
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
