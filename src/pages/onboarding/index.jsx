import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { COUNTRY_CONFIG, COUNTRY_CODES } from '../../config/countryConfig';
import { getRubros, updateBusiness, getProducts } from '../../services/waBusinessService';
import { seedTemplateProductsIfEmpty } from '../../services/productTemplateService';
import {
  RUBRO_SLUG_TO_TEMPLATE,
  LEGACY_TEMPLATE_LOGO_PREFIX,
  DEMO_SOCIAL_LINKS,
} from '../../utils/productTemplates';
import Icon from '../../components/AppIcon';
import PremiumLoader from '../../components/ui/PremiumLoader';

// ─── Constantes ───────────────────────────────────────────────────────────────

const STEPS = ['country', 'rubro', 'success'];

// Iconos por rubro (slug → emoji fallback)
const RUBRO_EMOJI = {
  'ropa': '👗',
  'comida-y-bebidas': '🍕',
  'belleza': '💄',
  'tecnologia': '📱',
  'servicios': '🔧',
  'hogar': '🏠',
  'deportes': '⚽',
  'mascotas': '🐾',
  'joyeria': '💍',
  'arte': '🎨',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StepDots({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className="rounded-full transition-all"
          style={{
            width: s === current ? 20 : 8,
            height: 8,
            backgroundColor: s === current
              ? 'var(--color-primary)'
              : STEPS.indexOf(current) > i
                ? 'rgba(124,58,237,0.35)'
                : 'var(--color-border)',
          }}
        />
      ))}
    </div>
  );
}

function StepLabel({ step }) {
  const labels = { country: 'Paso 1 de 2', rubro: 'Paso 2 de 2', success: '¡Listo!' };
  return (
    <p className="text-xs font-medium mb-2 text-center" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {labels[step]}
    </p>
  );
}

function SkipLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block text-center w-full mt-5 text-xs underline underline-offset-2"
      style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
    >
      Saltar y configurar después
    </button>
  );
}

// ─── Checklist ────────────────────────────────────────────────────────────────

function ChecklistItem({ done, label }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{
          backgroundColor: done ? 'var(--color-primary)' : 'transparent',
          border: done ? 'none' : '2px solid var(--color-border)',
        }}
      >
        {done && <Icon name="Check" size={11} color="#fff" />}
      </div>
      <span
        className="text-sm"
        style={{
          color: done ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
          fontFamily: 'var(--font-body)',
          textDecoration: done ? 'none' : 'none',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Paso 1: País ─────────────────────────────────────────────────────────────

function CountryStep({ onSelect, defaultCode }) {
  const [selected, setSelected] = useState(defaultCode || null);
  const [query, setQuery] = useState('');

  const filtered = COUNTRY_CODES.filter((code) => {
    if (!query) return true;
    const cfg = COUNTRY_CONFIG[code];
    return cfg?.name.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div>
      <StepLabel step="country" />
      <StepDots current="country" />

      <h1 className="text-2xl font-bold mb-1 text-center" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
        ¿Desde qué país operas?
      </h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Configura la moneda y el formato de precios de tu catálogo.
      </p>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar país..."
        className="w-full h-10 px-3 rounded-lg border text-sm outline-none mb-4"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-foreground)',
          fontFamily: 'var(--font-body)',
        }}
      />

      <div className="grid grid-cols-2 gap-2 mb-6 max-h-64 overflow-y-auto pr-1">
        {filtered.map((code) => {
          const cfg = COUNTRY_CONFIG[code];
          if (!cfg) return null;
          const isSelected = selected === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setSelected(code)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all"
              style={{
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: isSelected ? 'rgba(124,58,237,0.08)' : 'var(--color-surface)',
                boxShadow: isSelected ? '0 0 0 2px rgba(124,58,237,0.2)' : 'none',
              }}
            >
              <span className="text-xl leading-none">{cfg.flag}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{cfg.name}</p>
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{cfg.currency}</p>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!selected}
        onClick={() => onSelect(selected)}
        className="w-full h-12 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all"
        style={{
          backgroundColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
          color: selected ? '#fff' : 'var(--color-muted-foreground)',
          fontFamily: 'var(--font-caption)',
          cursor: selected ? 'pointer' : 'not-allowed',
          boxShadow: selected ? '0 4px 14px rgba(124,58,237,0.35)' : 'none',
        }}
      >
        Continuar
        <Icon name="ArrowRight" size={16} color={selected ? '#fff' : 'var(--color-muted-foreground)'} />
      </button>
    </div>
  );
}

// ─── Paso 2: Rubro ────────────────────────────────────────────────────────────

function RubroStep({ rubros, onSelect }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!selected) return;
    setSaving(true);
    await onSelect(selected);
    // saving se resetea solo si hay error; en éxito el paso cambia
  };

  return (
    <div>
      <StepLabel step="rubro" />
      <StepDots current="rubro" />

      <h1 className="text-2xl font-bold mb-1 text-center" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
        ¿Qué tipo de negocio tienes?
      </h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Te prepararemos un catálogo con productos de ejemplo para que veas cómo luce.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-6 max-h-72 overflow-y-auto pr-1">
        {rubros.map((rubro) => {
          const hasTemplate = !!RUBRO_SLUG_TO_TEMPLATE[rubro.slug];
          const emoji = RUBRO_EMOJI[rubro.slug] || '🛒';
          const isSelected = selected?.id === rubro.id;
          return (
            <button
              key={rubro.id}
              type="button"
              onClick={() => setSelected(rubro)}
              className="relative flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all"
              style={{
                borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: isSelected ? 'rgba(124,58,237,0.08)' : 'var(--color-surface)',
                boxShadow: isSelected ? '0 0 0 2px rgba(124,58,237,0.2)' : 'none',
              }}
            >
              <span className="text-2xl leading-none">{emoji}</span>
              <span className="text-xs font-medium leading-tight" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                {rubro.name}
              </span>
              {hasTemplate && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(124,58,237,0.12)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
                >
                  ✨ Demo
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!selected || saving}
        onClick={handleCreate}
        className="w-full h-12 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all"
        style={{
          backgroundColor: selected && !saving ? 'var(--color-primary)' : 'var(--color-border)',
          color: selected && !saving ? '#fff' : 'var(--color-muted-foreground)',
          fontFamily: 'var(--font-caption)',
          cursor: selected && !saving ? 'pointer' : 'not-allowed',
          boxShadow: selected && !saving ? '0 4px 14px rgba(124,58,237,0.35)' : 'none',
        }}
      >
        {saving ? (
          <>
            <svg className="animate-spin" width={18} height={18} viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Creando tu catálogo...
          </>
        ) : (
          <>
            <Icon name="Sparkles" size={16} color={selected ? '#fff' : 'var(--color-muted-foreground)'} />
            Crear mi catálogo
          </>
        )}
      </button>
    </div>
  );
}

// ─── Paso 3: Éxito ────────────────────────────────────────────────────────────

function SuccessStep({ business, seededCount }) {
  const navigate = useNavigate();
  const catalogUrl = business?.slug ? `/catalogo/${business.slug}` : null;

  // Checklist calculada desde estado del negocio
  const hasRealLogo = !!(business?.logoUrl && !business.logoUrl.startsWith(LEGACY_TEMPLATE_LOGO_PREFIX));
  const items = [
    { done: true, label: 'Catálogo creado' },
    { done: !!(business?.whatsapp), label: 'Agregar WhatsApp' },
    { done: hasRealLogo, label: 'Subir tu logo' },
    { done: seededCount === 0, label: 'Cambiar los productos demo' },
    { done: !!(business?.address), label: 'Agregar dirección' },
    { done: false, label: 'Conectar dominio propio' },
  ];

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div>
      <StepDots current="success" />

      <div className="text-center mb-8">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'rgba(124,58,237,0.12)' }}
        >
          <span className="text-3xl">🎉</span>
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
          ¡Tu catálogo está listo!
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          {seededCount > 0
            ? `Agregamos ${seededCount} productos de ejemplo para que veas cómo luce tu tienda.`
            : 'Tu catálogo está configurado y listo para compartir.'}
        </p>
      </div>

      <div className="flex flex-col gap-3 mb-8">
        {catalogUrl && (
          <button
            type="button"
            onClick={() => window.open(catalogUrl, '_blank', 'noopener,noreferrer')}
            className="w-full h-12 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: '#fff',
              fontFamily: 'var(--font-caption)',
              boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
            }}
          >
            <Icon name="ExternalLink" size={16} color="#fff" />
            Ver mi catálogo
          </button>
        )}

        <button
          type="button"
          onClick={() => navigate('/business-configuration')}
          className="w-full h-12 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all border"
          style={{
            backgroundColor: 'transparent',
            borderColor: 'var(--color-primary)',
            color: 'var(--color-primary)',
            fontFamily: 'var(--font-caption)',
          }}
        >
          <Icon name="Settings" size={16} color="var(--color-primary)" />
          Personalizar catálogo
        </button>
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
            Completa tu tienda
          </h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(124,58,237,0.12)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
            {doneCount}/{items.length}
          </span>
        </div>
        {items.map((item) => (
          <ChecklistItem key={item.label} done={item.done} label={item.label} />
        ))}
      </div>

      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="block text-center w-full mt-5 text-xs underline underline-offset-2"
        style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
      >
        Ir al dashboard
      </button>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { business, refreshBusiness } = useAuth();

  const [step, setStep] = useState('country');
  const [rubros, setRubros] = useState([]);
  const [loadingRubros, setLoadingRubros] = useState(true);
  const [seededCount, setSeededCount] = useState(0);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(true);

  // Guard: si el negocio ya tiene productos reales, redirigir a dashboard
  useEffect(() => {
    if (!business?.id) return;
    getProducts(business.id).then(({ data }) => {
      const real = (data || []).filter((p) => p?.isDraft !== true);
      if (real.length > 0) {
        navigate('/dashboard', { replace: true });
      } else {
        setChecking(false);
      }
    }).catch(() => setChecking(false));
  }, [business?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar rubros
  useEffect(() => {
    getRubros().then(({ data }) => {
      setRubros(data || []);
    }).finally(() => setLoadingRubros(false));
  }, []);

  const handleSkip = useCallback(() => navigate('/dashboard', { replace: true }), [navigate]);

  // Paso 1: guardar país
  const handleCountrySelect = useCallback(async (countryCode) => {
    if (!business?.id) return;
    setError(null);
    const { error: err } = await updateBusiness(business.id, {
      countryCode,
      persistCountry: true,
    });
    if (err) {
      setError('No se pudo guardar el país. Intenta de nuevo.');
      return;
    }
    await refreshBusiness();
    setStep('rubro');
  }, [business?.id, refreshBusiness]);

  // Paso 2: guardar rubro + sembrar catálogo + aplicar branding
  const handleRubroSelect = useCallback(async (rubro) => {
    if (!business?.id) return;
    setError(null);

    // 1. Guardar rubro en el negocio
    const { error: rubroErr } = await updateBusiness(business.id, { rubroId: rubro.id });
    if (rubroErr) {
      setError('No se pudo guardar el rubro. Intenta de nuevo.');
      return;
    }

    // 2. Sembrar productos demo
    const seedResult = await seedTemplateProductsIfEmpty({
      businessId: business.id,
      rubroSlug: rubro.slug,
    });
    const created = Number(seedResult?.created || 0);
    setSeededCount(created);

    // 3. Aplicar branding si el negocio no tiene imágenes propias
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

      // Redes sociales demo: solo si el negocio no tiene ninguna
      const socialPayload = {};
      const hasAnySocial = [
        currentBiz?.instagramUrl,
        currentBiz?.tiktokUrl,
        currentBiz?.facebookUrl,
      ].some((v) => String(v || '').trim() !== '');
      const categoriesSeeded = Number(seedResult?.categoriesCreated || 0) > 0;

      if (!hasAnySocial && currentBiz?.designSettings?.demoSocialLinksRepaired !== true) {
        socialPayload.instagramUrl = DEMO_SOCIAL_LINKS.instagramUrl;
        socialPayload.facebookUrl = DEMO_SOCIAL_LINKS.facebookUrl;
        socialPayload.tiktokUrl = DEMO_SOCIAL_LINKS.tiktokUrl;
      }

      const onboardingPayload = { ...brandingPayload, ...socialPayload };
      if (Object.keys(onboardingPayload).length > 0 || categoriesSeeded) {
        const existingDesign = currentBiz?.designSettings || {};
        const designAfterBranding = {
          ...existingDesign,
          ...(brandingPayload.logoUrl ? { logoUrl: brandingPayload.logoUrl } : {}),
          ...(brandingPayload.coverImageUrl
            ? { coverImageUrl: brandingPayload.coverImageUrl, headerImageUrl: brandingPayload.coverImageUrl }
            : {}),
          ...(Object.keys(socialPayload).length > 0
            ? { demoSocialLinksApplied: true, demoSocialLinksRepaired: true }
            : {}),
          ...(categoriesSeeded ? { useCategories: true } : {}),
        };
        await updateBusiness(business.id, {
          ...onboardingPayload,
          designSettings: designAfterBranding,
        });
      }
    }

    await refreshBusiness();
    setStep('success');
  }, [business, refreshBusiness]);

  // Estados de carga previos al render de pasos
  if (!business) return <PremiumLoader fullScreen text="Cargando tu cuenta..." />;
  if (checking) return <PremiumLoader fullScreen text="Verificando tu tienda..." />;
  if (step === 'rubro' && loadingRubros) return <PremiumLoader fullScreen text="Cargando rubros..." />;

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="mb-8">
          <img src="/walinka.svg" alt="Walinka" className="w-full max-w-[200px] h-auto object-contain mx-auto" />
        </div>

        {/* Error global */}
        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <Icon name="AlertCircle" size={15} color="var(--color-error)" className="mt-0.5 shrink-0" />
            <span className="text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{error}</span>
          </div>
        )}

        {/* Pasos */}
        {step === 'country' && (
          <>
            <CountryStep
              onSelect={handleCountrySelect}
              defaultCode={business?.countryCode || null}
            />
            <SkipLink onClick={handleSkip} />
          </>
        )}

        {step === 'rubro' && (
          <>
            <RubroStep rubros={rubros} onSelect={handleRubroSelect} />
            <SkipLink onClick={handleSkip} />
          </>
        )}

        {step === 'success' && (
          <SuccessStep
            business={business}
            seededCount={seededCount}
          />
        )}

      </div>
    </div>
  );
}
