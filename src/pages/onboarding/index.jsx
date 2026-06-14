import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { COUNTRY_CONFIG } from '../../config/countryConfig';
import { getRubros, updateBusiness, getProducts } from '../../services/waBusinessService';
import { seedTemplateProductsIfEmpty } from '../../services/productTemplateService';
import {
  RUBRO_SLUG_TO_TEMPLATE,
  LEGACY_TEMPLATE_LOGO_PREFIX,
  DEMO_SOCIAL_LINKS,
} from '../../utils/productTemplates';
import Icon from '../../components/AppIcon';
import PremiumLoader from '../../components/ui/PremiumLoader';

// ─── Constantes de curación ───────────────────────────────────────────────────

/** Países mostrados directamente sin necesidad de buscar. */
const MAIN_COUNTRY_CODES = ['CL', 'AR', 'CO', 'MX', 'PE', 'UY', 'EC', 'BO', 'ES', 'US'];

/** Rubros en el orden que queremos mostrar como destacados. */
const FEATURED_RUBRO_SLUGS = [
  'ropa',
  'gastronomia',
  'belleza-y-cuidado-personal',
  'moda-y-accesorios',
  'mascotas',
  'tecnologia-y-electronica',
  'servicios',
  'hogar-y-decoracion',
];

const RUBRO_EMOJI = {
  'ropa': '👗',
  'gastronomia': '🍕',
  'comida': '🍔',
  'comida-y-bebidas': '🍽️',
  'belleza-y-cuidado-personal': '💄',
  'belleza': '💋',
  'moda-y-accesorios': '👒',
  'mascotas': '🐾',
  'tecnologia-y-electronica': '📱',
  'electronica': '💻',
  'servicios': '🔧',
  'hogar-y-decoracion': '🏠',
  'hogar': '🛋️',
  'bienestar-y-deporte': '🏃',
  'ferreteria': '🔨',
  'libreria': '📚',
  'varios': '🛒',
  'otros': '📦',
  'ofertas-sale': '🏷️',
};

// ─── Sub-componentes pequeños ─────────────────────────────────────────────────

function StepIndicator({ step }) {
  const labels = { country: '1 de 2 · País', rubro: '2 de 2 · Rubro' };
  if (!labels[step]) return null;
  return (
    <p
      className="text-xs font-semibold mb-4 text-center tracking-widest uppercase"
      style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)', opacity: 0.8 }}
    >
      {labels[step]}
    </p>
  );
}

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

function SkipLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-center text-xs mt-5 underline underline-offset-2 opacity-60 hover:opacity-90 transition-opacity"
      style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
    >
      Saltar y configurar después →
    </button>
  );
}

// ─── Paso 1: País ─────────────────────────────────────────────────────────────

function CountryStep({ onSelect, saving, defaultCode }) {
  const [selected, setSelected] = useState(defaultCode || null);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return Object.values(COUNTRY_CONFIG).filter(
      (c) => c.name.toLowerCase().includes(q) && !MAIN_COUNTRY_CODES.includes(c.code)
    );
  }, [query]);

  const mainCountries = MAIN_COUNTRY_CODES.map((c) => COUNTRY_CONFIG[c]).filter(Boolean);

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
        Configuramos la moneda y el formato de precios de tu catálogo.
      </p>

      {/* Grid de países principales */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {mainCountries.map((cfg) => {
          const isSelected = selected === cfg.code;
          return (
            <button
              key={cfg.code}
              type="button"
              onClick={() => setSelected(cfg.code)}
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
      </div>

      {/* Buscador expandible */}
      {!showSearch ? (
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          className="w-full text-xs py-2 text-center underline underline-offset-2 mb-5"
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          ¿No ves tu país? Buscar otro país
        </button>
      ) : (
        <div className="mb-5">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar país..."
            className="w-full h-10 px-3 rounded-lg border text-sm outline-none mb-2"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-foreground)',
              fontFamily: 'var(--font-body)',
            }}
          />
          {searchResults.map((cfg) => {
            const isSelected = selected === cfg.code;
            return (
              <button
                key={cfg.code}
                type="button"
                onClick={() => setSelected(cfg.code)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border mb-1 text-left"
                style={{
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: isSelected ? 'rgba(124,58,237,0.08)' : 'var(--color-surface)',
                }}
              >
                <span>{cfg.flag}</span>
                <span className="text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {cfg.name}
                </span>
                <span className="ml-auto text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  {cfg.currency}
                </span>
              </button>
            );
          })}
          {query && searchResults.length === 0 && (
            <p className="text-xs text-center py-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              País no encontrado. Elige el más cercano de la lista.
            </p>
          )}
        </div>
      )}

      <PrimaryButton onClick={() => onSelect(selected)} disabled={!selected} loading={saving}>
        {saving ? 'Guardando...' : 'Continuar'}
      </PrimaryButton>
    </div>
  );
}

// ─── Paso 2: Rubro ────────────────────────────────────────────────────────────

function RubroStep({ rubros, onSelect, saving }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');

  const featuredRubros = useMemo(() => {
    const result = [];
    for (const slug of FEATURED_RUBRO_SLUGS) {
      const found = rubros.find((r) => r.slug === slug);
      if (found) result.push(found);
    }
    return result;
  }, [rubros]);

  const otherRubros = useMemo(() => {
    const featuredSlugs = new Set(FEATURED_RUBRO_SLUGS);
    return rubros.filter((r) => !featuredSlugs.has(r.slug));
  }, [rubros]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return rubros.filter((r) => r.name.toLowerCase().includes(q));
  }, [query, rubros]);

  const displayRubros = showSearch ? [] : featuredRubros;

  return (
    <div>
      <StepIndicator step="rubro" />

      <h1
        className="text-2xl font-bold mb-1 text-center"
        style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
      >
        ¿Qué tipo de negocio tienes?
      </h1>
      <p className="text-sm text-center mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Prepararemos tu catálogo con productos de ejemplo.
      </p>

      {/* Badge demo explicativo */}
      <div className="flex items-center justify-center gap-1.5 mb-5">
        <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(124,58,237,0.1)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
          ✨ Demo
        </span>
        <span className="text-[11px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          = catálogo demo real incluido
        </span>
      </div>

      {/* Grilla de destacados */}
      {!showSearch && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {displayRubros.map((rubro) => {
            const hasDemo = !!RUBRO_SLUG_TO_TEMPLATE[rubro.slug];
            const emoji = RUBRO_EMOJI[rubro.slug] || '🛒';
            const isSelected = selected?.id === rubro.id;
            return (
              <button
                key={rubro.id}
                type="button"
                onClick={() => setSelected(rubro)}
                className="relative flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all"
                style={{
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: isSelected ? 'rgba(124,58,237,0.08)' : 'var(--color-surface)',
                  boxShadow: isSelected ? '0 0 0 2px rgba(124,58,237,0.18)' : 'none',
                }}
              >
                <span className="text-2xl leading-none">{emoji}</span>
                <span className="text-sm font-medium leading-tight" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {rubro.name}
                </span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: hasDemo ? 'rgba(124,58,237,0.12)' : 'rgba(0,0,0,0.05)',
                    color: hasDemo ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                    fontFamily: 'var(--font-caption)',
                  }}
                >
                  {hasDemo ? '✨ Demo' : 'Diseño base'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Buscador */}
      {!showSearch ? (
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          className="w-full text-xs py-2 text-center underline underline-offset-2 mb-4"
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          Buscar otro rubro
        </button>
      ) : (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => { setShowSearch(false); setQuery(''); }}
              className="text-xs underline underline-offset-2"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              ← Volver
            </button>
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar rubro..."
              className="flex-1 h-10 px-3 rounded-lg border text-sm outline-none"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-foreground)',
                fontFamily: 'var(--font-body)',
              }}
            />
          </div>
          <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
            {(query ? searchResults : [...featuredRubros, ...otherRubros]).map((rubro) => {
              const hasDemo = !!RUBRO_SLUG_TO_TEMPLATE[rubro.slug];
              const emoji = RUBRO_EMOJI[rubro.slug] || '🛒';
              const isSelected = selected?.id === rubro.id;
              return (
                <button
                  key={rubro.id}
                  type="button"
                  onClick={() => setSelected(rubro)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all"
                  style={{
                    borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: isSelected ? 'rgba(124,58,237,0.08)' : 'var(--color-surface)',
                  }}
                >
                  <span className="text-lg leading-none">{emoji}</span>
                  <span className="flex-1 text-sm font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                    {rubro.name}
                  </span>
                  {hasDemo && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: 'rgba(124,58,237,0.12)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                      ✨ Demo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback */}
      <button
        type="button"
        onClick={() => navigate('/business-configuration', { replace: true })}
        className="w-full text-xs py-1 text-center underline underline-offset-2 mb-4 opacity-60 hover:opacity-90 transition-opacity"
        style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
      >
        No encuentro mi rubro → configurar manualmente
      </button>

      <PrimaryButton onClick={() => onSelect(selected)} disabled={!selected} loading={saving}>
        {saving ? 'Creando tu catálogo...' : 'Crear mi catálogo'}
      </PrimaryButton>
    </div>
  );
}

// ─── Checklist item ───────────────────────────────────────────────────────────

function CheckItem({ done, label }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-b-0" style={{ borderColor: 'var(--color-border)' }}>
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
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Paso 3: Éxito ────────────────────────────────────────────────────────────

function SuccessStep({ business, seededCount, selectedRubroName }) {
  const navigate = useNavigate();
  const catalogUrl = business?.slug ? `/catalogo/${business.slug}` : null;
  const hasProducts = seededCount > 0;

  const hasRealLogo = !!(business?.logoUrl && !business.logoUrl.startsWith(LEGACY_TEMPLATE_LOGO_PREFIX));
  const checklist = [
    { done: true, label: 'Catálogo configurado' },
    { done: hasProducts, label: 'Productos de ejemplo creados' },
    { done: !!(business?.whatsapp), label: 'Número de WhatsApp' },
    { done: hasRealLogo, label: 'Logo subido' },
    { done: !!(business?.address), label: 'Dirección del negocio' },
    { done: false, label: 'Dominio propio conectado' },
  ];
  const doneCount = checklist.filter((i) => i.done).length;

  if (!hasProducts) {
    return (
      <div>
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}>
            <span className="text-3xl">🏗️</span>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
            Estamos preparando tu catálogo
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            {selectedRubroName
              ? `El rubro "${selectedRubroName}" aún no tiene productos de ejemplo. Agrega los tuyos para que tu catálogo esté listo.`
              : 'Agrega tus productos para que tu catálogo esté listo para compartir.'}
          </p>
        </div>
        <div className="flex flex-col gap-3 mb-6">
          <PrimaryButton onClick={() => navigate('/product-management')}>
            <Icon name="Plus" size={16} color="#fff" />
            Agregar mis productos
          </PrimaryButton>
          <SecondaryButton onClick={() => navigate('/business-configuration')}>
            <Icon name="Settings" size={16} color="var(--color-primary)" />
            Personalizar diseño
          </SecondaryButton>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="block w-full text-center text-xs underline underline-offset-2 opacity-60"
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          Ir al dashboard
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}>
          <span className="text-3xl">🎉</span>
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
          ¡Tu catálogo está listo!
        </h1>
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Creamos <strong>{seededCount} productos de ejemplo</strong>
          {selectedRubroName ? ` de ${selectedRubroName}` : ''}.{' '}
          Edítalos y agrégale precio, foto y descripción real.
        </p>
      </div>

      <div className="flex flex-col gap-3 mb-6">
        {catalogUrl && (
          <PrimaryButton onClick={() => window.open(catalogUrl, '_blank', 'noopener,noreferrer')}>
            <Icon name="ExternalLink" size={16} color="#fff" />
            Ver mi catálogo
          </PrimaryButton>
        )}
        <SecondaryButton onClick={() => navigate('/product-management')}>
          <Icon name="Package" size={16} color="var(--color-primary)" />
          Editar productos
        </SecondaryButton>
        <SecondaryButton onClick={() => navigate('/business-configuration')}>
          <Icon name="Settings" size={16} color="var(--color-primary)" />
          Personalizar diseño
        </SecondaryButton>
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
            Completa tu tienda
          </p>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(124,58,237,0.1)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
            {doneCount}/{checklist.length}
          </span>
        </div>
        {checklist.map((item) => <CheckItem key={item.label} {...item} />)}
      </div>

      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="block w-full text-center text-xs mt-4 underline underline-offset-2 opacity-60"
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
  const [selectedRubroName, setSelectedRubroName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(true);

  // Guard: negocio con productos reales → dashboard (ya completó el onboarding)
  useEffect(() => {
    if (!business?.id) return;
    getProducts(business.id)
      .then(({ data }) => {
        const real = (data || []).filter((p) => p?.isDraft !== true);
        console.log('[onboarding] productos existentes:', real.length);
        if (real.length > 0) navigate('/dashboard', { replace: true });
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [business?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar rubros
  useEffect(() => {
    getRubros()
      .then(({ data }) => setRubros(data || []))
      .finally(() => setLoadingRubros(false));
  }, []);

  const handleSkip = useCallback(() => navigate('/dashboard', { replace: true }), [navigate]);

  // Paso 1: guardar país
  const handleCountrySelect = useCallback(async (countryCode) => {
    if (!business?.id || !countryCode) return;
    setSaving(true);
    setError(null);
    console.log('[onboarding] selected country:', countryCode);
    const { error: err } = await updateBusiness(business.id, {
      countryCode,
      persistCountry: true,
    });
    setSaving(false);
    if (err) { setError('No se pudo guardar el país. Intenta de nuevo.'); return; }
    await refreshBusiness();
    setStep('rubro');
  }, [business?.id, refreshBusiness]);

  // Paso 2: guardar rubro + sembrar + branding
  const handleRubroSelect = useCallback(async (rubro) => {
    if (!business?.id || !rubro) return;
    setSaving(true);
    setError(null);
    console.log('[onboarding] selected rubro:', rubro.slug, rubro.name);

    const { error: rubroErr } = await updateBusiness(business.id, { rubroId: rubro.id });
    if (rubroErr) {
      setSaving(false);
      setError('No se pudo guardar el rubro. Intenta de nuevo.');
      return;
    }

    const seedResult = await seedTemplateProductsIfEmpty({
      businessId: business.id,
      rubroSlug: rubro.slug,
    });
    console.log('[onboarding] seed result:', seedResult);

    const created = Number(seedResult?.created || 0);
    console.log('[onboarding] products seeded:', created);
    setSeededCount(created);
    setSelectedRubroName(rubro.name);

    // Aplicar branding del template (logo, cover, redes demo) — misma lógica que business-configuration
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
        const existingDesign = currentBiz?.designSettings || {};
        const designAfterBranding = {
          ...existingDesign,
          ...(brandingPayload.logoUrl ? { logoUrl: brandingPayload.logoUrl } : {}),
          ...(brandingPayload.coverImageUrl ? { coverImageUrl: brandingPayload.coverImageUrl, headerImageUrl: brandingPayload.coverImageUrl } : {}),
          ...(Object.keys(socialPayload).length > 0 ? { demoSocialLinksApplied: true, demoSocialLinksRepaired: true } : {}),
          ...(categoriesSeeded ? { useCategories: true } : {}),
        };
        await updateBusiness(business.id, { ...onboardingPayload, designSettings: designAfterBranding });
      }
    }

    await refreshBusiness();
    setSaving(false);
    console.log('[onboarding] business slug:', business?.slug);
    console.log('[onboarding] catalog url:', `/catalogo/${business?.slug}`);
    setStep('success');
  }, [business, refreshBusiness]);

  if (!business) return <PremiumLoader fullScreen text="Cargando tu cuenta..." />;
  if (checking) return <PremiumLoader fullScreen text="Verificando tu tienda..." />;
  if (step === 'rubro' && loadingRubros) return <PremiumLoader fullScreen text="Cargando rubros..." />;

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-md">

        {/* Logo reducido */}
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
            <CountryStep
              onSelect={handleCountrySelect}
              saving={saving}
              defaultCode={business?.countryCode || null}
            />
            <SkipLink onClick={handleSkip} />
          </>
        )}

        {step === 'rubro' && (
          <>
            <RubroStep rubros={rubros} onSelect={handleRubroSelect} saving={saving} />
            <SkipLink onClick={handleSkip} />
          </>
        )}

        {step === 'success' && (
          <SuccessStep
            business={business}
            seededCount={seededCount}
            selectedRubroName={selectedRubroName}
          />
        )}

      </div>
    </div>
  );
}
