import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { COUNTRY_CONFIG } from '../../config/countryConfig';
import { getRubros, updateBusiness, getProducts } from '../../services/waBusinessService';
import { seedTemplateProductsIfEmpty } from '../../services/productTemplateService';
import { getTemplates } from '../../services/catalogTemplateService';
import { getFamilyForRubro } from '../../utils/rubroFamilyMap';
import {
  LEGACY_TEMPLATE_LOGO_PREFIX,
  DEMO_SOCIAL_LINKS,
} from '../../utils/productTemplates';
import Icon from '../../components/AppIcon';
import PremiumLoader from '../../components/ui/PremiumLoader';

// ─── Categorías visibles al usuario ──────────────────────────────────────────
// slug: rubro slug real en wa_rubros (usado internamente, nunca mostrado)

const SIMPLE_CATEGORIES = [
  { label: 'Ropa',       icon: 'Shirt',           slug: 'ropa',                    color: '#7c3aed', bg: '#f5f0ff' },
  { label: 'Tecnología', icon: 'Smartphone',       slug: 'tecnologia-y-electronica', color: '#1d4ed8', bg: '#eff6ff' },
  { label: 'Gastronomía',icon: 'UtensilsCrossed',  slug: 'gastronomia',              color: '#ea580c', bg: '#fff7ed' },
  { label: 'Belleza',    icon: 'Sparkles',         slug: 'belleza-y-cuidado-personal',color: '#db2777', bg: '#fdf2f8' },
  { label: 'Mascotas',   icon: 'PawPrint',         slug: 'mascotas',                 color: '#c2410c', bg: '#fff7ed' },
  { label: 'Florería',   icon: 'Leaf',             slug: 'floreria',                 color: '#16a34a', bg: '#f0fdf4' },
  { label: 'Hogar',      icon: 'Home',             slug: 'hogar-y-decoracion',       color: '#0369a1', bg: '#f0f9ff' },
  { label: 'Servicios',  icon: 'Wrench',           slug: 'servicios',                color: '#2563eb', bg: '#eff6ff' },
  { label: 'Otro',       icon: 'Package',          slug: null,                       color: '#6b7280', bg: '#f3f4f6' },
];

// Países principales mostrados directamente
const MAIN_COUNTRIES = ['CL', 'AR', 'CO', 'MX', 'PE', 'UY'];

// ─── Resolución interna de plantilla (no expuesta al usuario) ─────────────────

function resolveTemplatePreview(rubroSlug, templates) {
  if (!rubroSlug || !templates?.length) return null;
  const exact = templates.find((t) => t.rubroSlug === rubroSlug);
  if (exact?.previewImageUrl) return exact.previewImageUrl;
  const family = getFamilyForRubro(rubroSlug);
  if (family) {
    const byFamily = templates.find((t) => t.familySlug === family && !t.rubroSlug);
    if (byFamily?.previewImageUrl) return byFamily.previewImageUrl;
  }
  const universal = templates.find((t) => t.isUniversal);
  return universal?.previewImageUrl || null;
}

// ─── Indicador de paso ────────────────────────────────────────────────────────

function StepIndicator({ step }) {
  const map = {
    country:  '1 de 3 · País',
    category: '2 de 3 · Negocio',
    whatsapp: '3 de 3 · Contacto',
  };
  if (!map[step]) return null;
  return (
    <p
      className="text-xs font-semibold mb-4 text-center tracking-widest uppercase"
      style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)', opacity: 0.8 }}
    >
      {map[step]}
    </p>
  );
}

// ─── Botones reutilizables ────────────────────────────────────────────────────

function PrimaryButton({ onClick, disabled, loading, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
      style={{
        backgroundColor: disabled || loading ? 'var(--color-border)' : 'var(--color-primary)',
        color: disabled || loading ? 'var(--color-muted-foreground)' : '#fff',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        boxShadow: disabled || loading ? 'none' : '0 4px 14px rgba(124,58,237,0.3)',
        fontFamily: 'var(--font-caption)',
      }}
    >
      {loading ? (
        <>
          <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {children}
        </>
      ) : children}
    </button>
  );
}

function SecondaryButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-11 rounded-xl font-medium text-sm flex items-center justify-center gap-2 border transition-all"
      style={{
        borderColor: 'var(--color-primary)',
        color: 'var(--color-primary)',
        backgroundColor: 'transparent',
        fontFamily: 'var(--font-caption)',
      }}
    >
      {children}
    </button>
  );
}

// ─── Paso 1: País ─────────────────────────────────────────────────────────────

function CountryStep({ onSelect, saving, defaultCode }) {
  const [selected, setSelected] = useState(defaultCode || null);
  const [showOther, setShowOther] = useState(false);

  const mainCountries = MAIN_COUNTRIES.map((c) => COUNTRY_CONFIG[c]).filter(Boolean);
  const allOtherCountries = Object.values(COUNTRY_CONFIG)
    .filter((c) => !MAIN_COUNTRIES.includes(c.code))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleOtherChange = (e) => {
    setSelected(e.target.value || null);
  };

  return (
    <div>
      <StepIndicator step="country" />
      <h1
        className="text-2xl font-bold mb-1 text-center"
        style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
      >
        ¿Desde qué país operas?
      </h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Configuramos la moneda y el formato de precios.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {mainCountries.map((cfg) => {
          const isSelected = selected === cfg.code && !showOther;
          return (
            <button
              key={cfg.code}
              type="button"
              onClick={() => { setSelected(cfg.code); setShowOther(false); }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all"
              style={{
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: isSelected ? 'rgba(124,58,237,0.08)' : 'var(--color-surface)',
                boxShadow: isSelected ? '0 0 0 2px rgba(124,58,237,0.18)' : 'none',
              }}
            >
              <span className="text-xl leading-none">{cfg.flag}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {cfg.name}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {cfg.currency}
                </p>
              </div>
            </button>
          );
        })}

        {/* Otro país */}
        <button
          type="button"
          onClick={() => { setShowOther(true); setSelected(null); }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all"
          style={{
            borderColor: showOther ? 'var(--color-primary)' : 'var(--color-border)',
            backgroundColor: showOther ? 'rgba(124,58,237,0.08)' : 'var(--color-surface)',
            boxShadow: showOther ? '0 0 0 2px rgba(124,58,237,0.18)' : 'none',
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--color-muted)' }}>
              <Icon name="Globe" size={16} color="var(--color-muted-foreground)" />
            </div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
            Otro país
          </p>
        </button>
      </div>

      {showOther && (
        <select
          autoFocus
          value={selected || ''}
          onChange={handleOtherChange}
          className="w-full h-10 px-3 rounded-lg border text-sm mb-3 outline-none"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-foreground)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <option value="">Selecciona tu país...</option>
          {allOtherCountries.map((c) => (
            <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
          ))}
        </select>
      )}

      <PrimaryButton onClick={() => onSelect(selected)} disabled={!selected} loading={saving}>
        {saving ? 'Guardando...' : 'Continuar'}
      </PrimaryButton>
    </div>
  );
}

// ─── Paso 2: Tipo de negocio ──────────────────────────────────────────────────

function CategoryStep({ onSelect, saving }) {
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <StepIndicator step="category" />
      <h1
        className="text-2xl font-bold mb-1 text-center"
        style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
      >
        ¿Qué tipo de negocio tienes?
      </h1>
      <p className="text-sm text-center mb-5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Prepararemos una tienda de ejemplo para tu rubro.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {SIMPLE_CATEGORIES.map((cat) => {
          const isSelected = selected?.label === cat.label;
          return (
            <button
              key={cat.label}
              type="button"
              onClick={() => setSelected(cat)}
              className="flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-xl border transition-all"
              style={{
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: isSelected ? 'rgba(124,58,237,0.08)' : 'var(--color-surface)',
                boxShadow: isSelected ? '0 0 0 2px rgba(124,58,237,0.18)' : 'none',
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: isSelected ? cat.bg : 'var(--color-muted)' }}
              >
                <Icon name={cat.icon} size={18} color={isSelected ? cat.color : 'var(--color-muted-foreground)'} />
              </div>
              <span
                className="text-[11px] font-semibold text-center leading-tight"
                style={{
                  color: isSelected ? 'var(--color-primary)' : 'var(--color-foreground)',
                  fontFamily: 'var(--font-caption)',
                }}
              >
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      <PrimaryButton onClick={() => onSelect(selected)} disabled={!selected} loading={saving}>
        {saving ? 'Preparando tu tienda...' : 'Continuar'}
      </PrimaryButton>
    </div>
  );
}

// ─── Paso 3: WhatsApp ─────────────────────────────────────────────────────────

function WhatsAppStep({ onSubmit, onSkip, saving }) {
  const [value, setValue] = useState('');

  return (
    <div>
      <StepIndicator step="whatsapp" />
      <h1
        className="text-2xl font-bold mb-1 text-center"
        style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
      >
        ¿Cuál es tu WhatsApp?
      </h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Tus clientes podrán contactarte directamente desde tu catálogo.
      </p>

      <input
        type="tel"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ej. +56 9 1234 5678"
        className="w-full h-12 px-4 rounded-xl border text-sm outline-none mb-4"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-foreground)',
          fontFamily: 'var(--font-body)',
          fontSize: '16px',
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onSubmit(value.trim()); }}
      />

      <PrimaryButton onClick={() => onSubmit(value.trim())} loading={saving}>
        {saving ? 'Creando tu tienda...' : 'Crear mi tienda'}
      </PrimaryButton>

      <button
        type="button"
        onClick={onSkip}
        className="block w-full text-center text-xs mt-4 underline underline-offset-2 opacity-60 hover:opacity-90 transition-opacity"
        style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
      >
        Agregar después
      </button>
    </div>
  );
}

// ─── Paso 4: Tienda lista ─────────────────────────────────────────────────────

function SuccessStep({ business, seededCount, templatePreviewUrl }) {
  const navigate = useNavigate();
  const catalogUrl = business?.slug ? `/catalogo/${business.slug}` : null;
  const hasProducts = seededCount > 0;

  return (
    <div>
      {/* Preview del catálogo */}
      <div
        className="w-full rounded-2xl overflow-hidden border mb-6"
        style={{ borderColor: 'var(--color-border)', maxHeight: 260 }}
      >
        {templatePreviewUrl ? (
          <img
            src={templatePreviewUrl}
            alt="Vista previa de tu catálogo"
            className="w-full h-full object-cover object-top"
            style={{ maxHeight: 260 }}
          />
        ) : (
          <div
            className="w-full flex flex-col items-center justify-center py-12 gap-3"
            style={{ background: 'linear-gradient(135deg, #f5f0ff 0%, #eff6ff 100%)', minHeight: 180 }}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.15)' }}>
              <Icon name="ShoppingBag" size={22} color="var(--color-primary)" />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
              {business?.name || 'Tu tienda'}
            </p>
          </div>
        )}
      </div>

      <h1
        className="text-2xl font-bold mb-2 text-center"
        style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
      >
        {hasProducts ? '¡Tu tienda está lista!' : 'Tu tienda está creada'}
      </h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        {hasProducts
          ? `Hemos preparado una versión inicial de tu catálogo para que veas cómo se verá tu negocio. Podrás cambiar productos, imágenes, colores y diseño cuando quieras.`
          : 'Agrega tus productos para que tu catálogo esté listo para compartir con tus clientes.'}
      </p>

      <div className="flex flex-col gap-3">
        {catalogUrl && (
          <PrimaryButton onClick={() => window.open(catalogUrl, '_blank', 'noopener,noreferrer')}>
            <Icon name="ExternalLink" size={16} color="#fff" />
            Ver mi catálogo
          </PrimaryButton>
        )}
        <SecondaryButton onClick={() => navigate('/business-configuration')}>
          <Icon name="Settings" size={16} color="var(--color-primary)" />
          Personalizar diseño
        </SecondaryButton>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="block w-full text-center text-xs mt-1 underline underline-offset-2 opacity-60 hover:opacity-90 transition-opacity"
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          Ir al dashboard
        </button>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { business, refreshBusiness } = useAuth();

  const [step, setStep] = useState('country');
  const [rubros, setRubros] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState(null);
  const [seededCount, setSeededCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(true);

  // Guard: negocio con productos reales → dashboard
  useEffect(() => {
    if (!business?.id) return;
    getProducts(business.id)
      .then(({ data }) => {
        const real = (data || []).filter((p) => p?.isDraft !== true);
        if (real.length > 0) navigate('/dashboard', { replace: true });
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [business?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar rubros y plantillas en paralelo (internamente, sin mostrar al usuario)
  useEffect(() => {
    Promise.all([getRubros(), getTemplates()])
      .then(([rubrosRes, templatesRes]) => {
        setRubros(rubrosRes.data || []);
        setTemplates(templatesRes.data || []);
      })
      .catch(() => {});
  }, []);

  const handleSkip = useCallback(() => navigate('/dashboard', { replace: true }), [navigate]);

  // Paso 1: guardar país
  const handleCountrySelect = useCallback(async (countryCode) => {
    if (!business?.id || !countryCode) return;
    setSaving(true);
    setError(null);
    console.log('[onboarding] country:', countryCode);
    const { error: err } = await updateBusiness(business.id, { countryCode, persistCountry: true });
    setSaving(false);
    if (err) { setError('No se pudo guardar el país. Intenta de nuevo.'); return; }
    await refreshBusiness();
    setStep('category');
  }, [business?.id, refreshBusiness]);

  // Paso 2: guardar selección de categoría (sin API aún)
  const handleCategorySelect = useCallback((cat) => {
    setSelectedCategory(cat);
    // Resolver previewImageUrl de la plantilla correspondiente (operación local)
    if (cat?.slug && templates.length > 0) {
      setTemplatePreviewUrl(resolveTemplatePreview(cat.slug, templates));
    }
    setStep('whatsapp');
  }, [templates]);

  // Paso 3: guardar WhatsApp + sembrar productos
  const handleWhatsApp = useCallback(async (whatsapp) => {
    if (!business?.id) return;
    setSaving(true);
    setError(null);

    const rubroSlug = selectedCategory?.slug || null;

    // Guardar rubro si fue seleccionado
    if (rubroSlug) {
      const rubro = rubros.find((r) => r.slug === rubroSlug);
      if (rubro?.id) {
        const { error: rubroErr } = await updateBusiness(business.id, { rubroId: rubro.id });
        if (rubroErr) {
          setSaving(false);
          setError('No se pudo guardar el tipo de negocio. Intenta de nuevo.');
          return;
        }
      }
    }

    // Sembrar productos de ejemplo
    let seedResult = { created: 0, branding: null, categoriesCreated: 0 };
    if (rubroSlug) {
      seedResult = await seedTemplateProductsIfEmpty({ businessId: business.id, rubroSlug });
      console.log('[onboarding] seed source:', seedResult?.source, '| products:', seedResult?.created);
    }

    // Guardar WhatsApp
    if (whatsapp) {
      await updateBusiness(business.id, { whatsapp });
    }

    // Aplicar branding de la plantilla (logo, cover, redes demo)
    if (seedResult?.branding) {
      const currentBiz = business;
      const brandingPayload = {};
      const logoRaw = String(currentBiz?.logoUrl || '').trim();
      const logoMissingOrLegacy = !logoRaw || logoRaw.startsWith(LEGACY_TEMPLATE_LOGO_PREFIX);
      if (seedResult.branding.logoUrl && logoMissingOrLegacy) {
        brandingPayload.logoUrl = seedResult.branding.logoUrl;
      }
      if (seedResult.branding.coverImageUrl && !String(currentBiz?.coverImageUrl || '').trim()) {
        brandingPayload.coverImageUrl = seedResult.branding.coverImageUrl;
      }

      const socialPayload = {};
      const hasAnySocial = [currentBiz?.instagramUrl, currentBiz?.tiktokUrl, currentBiz?.facebookUrl]
        .some((v) => String(v || '').trim() !== '');
      const categoriesSeeded = Number(seedResult?.categoriesCreated || 0) > 0;

      if (!hasAnySocial && currentBiz?.designSettings?.demoSocialLinksRepaired !== true) {
        socialPayload.instagramUrl = DEMO_SOCIAL_LINKS.instagramUrl;
        socialPayload.facebookUrl = DEMO_SOCIAL_LINKS.facebookUrl;
        socialPayload.tiktokUrl = DEMO_SOCIAL_LINKS.tiktokUrl;
      }

      const onboardingPayload = { ...brandingPayload, ...socialPayload };
      if (Object.keys(onboardingPayload).length > 0 || categoriesSeeded) {
        const designAfterBranding = {
          ...(currentBiz?.designSettings || {}),
          ...(brandingPayload.logoUrl ? { logoUrl: brandingPayload.logoUrl } : {}),
          ...(brandingPayload.coverImageUrl ? { coverImageUrl: brandingPayload.coverImageUrl, headerImageUrl: brandingPayload.coverImageUrl } : {}),
          ...(Object.keys(socialPayload).length > 0 ? { demoSocialLinksApplied: true, demoSocialLinksRepaired: true } : {}),
          ...(categoriesSeeded ? { useCategories: true } : {}),
        };
        await updateBusiness(business.id, { ...onboardingPayload, designSettings: designAfterBranding });
      }
    }

    setSeededCount(Number(seedResult?.created || 0));
    await refreshBusiness();
    setSaving(false);
    setStep('success');
  }, [business, rubros, selectedCategory, refreshBusiness]);

  if (!business) return <PremiumLoader fullScreen text="Cargando tu cuenta..." />;
  if (checking) return <PremiumLoader fullScreen text="Verificando tu tienda..." />;

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        {step !== 'success' && (
          <div className="mb-6 text-center">
            <img src="/walinka.svg" alt="Walinka" className="h-7 w-auto object-contain inline-block" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-xl border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <Icon name="AlertCircle" size={14} color="var(--color-error)" className="mt-0.5 shrink-0" />
            <span className="text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{error}</span>
          </div>
        )}

        {step === 'country' && (
          <>
            <CountryStep onSelect={handleCountrySelect} saving={saving} defaultCode={business?.countryCode || null} />
            <button
              type="button"
              onClick={handleSkip}
              className="block w-full text-center text-xs mt-5 underline underline-offset-2 opacity-60 hover:opacity-90 transition-opacity"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              Saltar y configurar después →
            </button>
          </>
        )}

        {step === 'category' && (
          <CategoryStep onSelect={handleCategorySelect} saving={false} />
        )}

        {step === 'whatsapp' && (
          <WhatsAppStep onSubmit={handleWhatsApp} onSkip={() => handleWhatsApp('')} saving={saving} />
        )}

        {step === 'success' && (
          <SuccessStep
            business={business}
            seededCount={seededCount}
            templatePreviewUrl={templatePreviewUrl}
          />
        )}

      </div>
    </div>
  );
}
