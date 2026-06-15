import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { COUNTRY_CONFIG } from '../../config/countryConfig';
import { getRubros, updateBusiness, getProducts } from '../../services/waBusinessService';
import { seedTemplateProductsIfEmpty } from '../../services/productTemplateService';
import {
  LEGACY_TEMPLATE_LOGO_PREFIX,
  DEMO_SOCIAL_LINKS,
} from '../../utils/productTemplates';
import Icon from '../../components/AppIcon';
import PremiumLoader from '../../components/ui/PremiumLoader';
import { ONBOARDING_CATEGORY_IMAGES } from '../../config/onboardingCategoryImages';

// ─── Config de categorías (etiquetas visibles → slugs internos) ───────────────

const SIMPLE_CATEGORIES = [
  { label: 'Ropa',        icon: 'Shirt',          slug: 'ropa',                      color: '#7c3aed', bg: '#f5f0ff', imageUrl: ONBOARDING_CATEGORY_IMAGES.ropa },
  { label: 'Tecnología',  icon: 'Smartphone',      slug: 'tecnologia-y-electronica',  color: '#1d4ed8', bg: '#eff6ff', imageUrl: ONBOARDING_CATEGORY_IMAGES.tecnologia },
  { label: 'Gastronomía', icon: 'UtensilsCrossed', slug: 'gastronomia',               color: '#ea580c', bg: '#fff7ed', imageUrl: ONBOARDING_CATEGORY_IMAGES.gastronomia },
  { label: 'Belleza',     icon: 'Sparkles',        slug: 'belleza-y-cuidado-personal', color: '#db2777', bg: '#fdf2f8', imageUrl: ONBOARDING_CATEGORY_IMAGES.belleza },
  { label: 'Mascotas',    icon: 'PawPrint',        slug: 'mascotas',                  color: '#c2410c', bg: '#fff7ed', imageUrl: ONBOARDING_CATEGORY_IMAGES.mascotas },
  { label: 'Florería',    icon: 'Leaf',            slug: 'floreria',                  color: '#16a34a', bg: '#f0fdf4', imageUrl: ONBOARDING_CATEGORY_IMAGES.floreria },
  { label: 'Hogar',       icon: 'Home',            slug: 'hogar-y-decoracion',        color: '#0369a1', bg: '#f0f9ff', imageUrl: ONBOARDING_CATEGORY_IMAGES.hogar },
  { label: 'Servicios',   icon: 'Wrench',          slug: 'servicios',                 color: '#2563eb', bg: '#eff6ff', imageUrl: ONBOARDING_CATEGORY_IMAGES.servicios },
  { label: 'Otro',        icon: 'Package',         slug: null,                        color: '#6b7280', bg: '#f3f4f6', imageUrl: null },
];

const MAIN_COUNTRIES = ['CL', 'AR', 'CO', 'MX', 'PE', 'UY'];

// DEBUG: log when onboarding page mounts
if (typeof window !== 'undefined') {
  console.info('[OnboardingPage] module loaded');
}

const CREATING_STEPS = ['Diseño', 'Productos', 'Categorías', 'Configuración inicial'];
// Tiempo en ms para marcar cada checkmark durante la pantalla de creación
const CHECK_DELAYS = [0, 700, 1400, 2100];

// ─── Indicador de progreso ────────────────────────────────────────────────────

function StepIndicator({ step }) {
  const map = { country: '1 de 3 · País', category: '2 de 3 · Negocio', whatsapp: '3 de 3 · Contacto' };
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

// ─── Botones ──────────────────────────────────────────────────────────────────

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

  return (
    <div>
      <StepIndicator step="country" />
      <h1 className="text-2xl font-bold mb-1 text-center" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
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
                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{cfg.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>{cfg.currency}</p>
              </div>
            </button>
          );
        })}
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
          <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Otro país</p>
        </button>
      </div>

      {showOther && (
        <select
          autoFocus
          value={selected || ''}
          onChange={(e) => setSelected(e.target.value || null)}
          className="w-full h-10 px-3 rounded-lg border text-sm mb-3 outline-none"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-foreground)', fontFamily: 'var(--font-body)' }}
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

      <button
        type="button"
        onClick={() => onSelect(null)}
        className="block w-full text-center text-xs mt-4 underline underline-offset-2 opacity-60 hover:opacity-90 transition-opacity"
        style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
      >
        Saltar y configurar después →
      </button>
    </div>
  );
}

// ─── Tile de categoría ────────────────────────────────────────────────────────

function CategoryTile({ cat, isSelected, onClick }) {
  const [imgError, setImgError] = useState(false);
  const showImage = !!cat.imageUrl && !imgError;

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border overflow-hidden text-left transition-all w-full"
      style={{
        borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
        backgroundColor: 'var(--color-surface)',
        boxShadow: isSelected ? '0 0 0 2px rgba(124,58,237,0.18)' : 'none',
      }}
    >
      {/* Área de imagen — aspect-ratio 3:2 */}
      <div className="relative w-full" style={{ paddingTop: '66.67%' }}>
        {showImage ? (
          <img
            src={cat.imageUrl}
            alt={cat.label}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: isSelected ? cat.bg : 'var(--color-muted)' }}
          >
            <Icon name={cat.icon} size={26} color={isSelected ? cat.color : 'var(--color-muted-foreground)'} />
          </div>
        )}

        {/* Overlay sutil cuando está seleccionado */}
        {isSelected && (
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(124,58,237,0.10)' }} />
        )}

        {/* Check badge */}
        {isSelected && (
          <div
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <Icon name="Check" size={11} color="#fff" />
          </div>
        )}
      </div>

      {/* Etiqueta */}
      <div className="px-2 py-2">
        <span
          className="text-[11px] font-semibold leading-tight"
          style={{
            color: isSelected ? 'var(--color-primary)' : 'var(--color-foreground)',
            fontFamily: 'var(--font-caption)',
          }}
        >
          {cat.label}
        </span>
      </div>
    </button>
  );
}

// ─── Paso 2: Tipo de negocio ──────────────────────────────────────────────────

function CategoryStep({ onSelect }) {
  const [selected, setSelected] = useState(null);

  return (
    <div>
      <StepIndicator step="category" />
      <h1 className="text-2xl font-bold mb-1 text-center" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
        ¿Qué tipo de negocio tienes?
      </h1>
      <p className="text-sm text-center mb-5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Prepararemos una tienda de ejemplo para tu rubro.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {SIMPLE_CATEGORIES.map((cat) => (
          <CategoryTile
            key={cat.label}
            cat={cat}
            isSelected={selected?.label === cat.label}
            onClick={() => setSelected(cat)}
          />
        ))}
      </div>

      <PrimaryButton onClick={() => onSelect(selected)} disabled={!selected}>
        Continuar
      </PrimaryButton>
    </div>
  );
}

// ─── Paso 3: WhatsApp ─────────────────────────────────────────────────────────

function WhatsAppStep({ onSubmit, saving }) {
  const [value, setValue] = useState('');

  return (
    <div>
      <StepIndicator step="whatsapp" />
      <h1 className="text-2xl font-bold mb-1 text-center" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
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
        className="w-full h-12 px-4 rounded-xl border text-base outline-none mb-4"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-foreground)', fontFamily: 'var(--font-body)' }}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(value.trim()); }}
      />

      <PrimaryButton onClick={() => onSubmit(value.trim())} loading={saving}>
        {saving ? 'Creando tu tienda...' : 'Crear mi tienda'}
      </PrimaryButton>

      <button
        type="button"
        onClick={() => onSubmit('')}
        className="block w-full text-center text-xs mt-4 underline underline-offset-2 opacity-60 hover:opacity-90 transition-opacity"
        style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
      >
        Agregar después
      </button>
    </div>
  );
}

// ─── Paso 4: Creando tu tienda ────────────────────────────────────────────────

function CreatingStep({ work, onComplete }) {
  const [checkedCount, setCheckedCount] = useState(0);
  const [apiResult, setApiResult] = useState(undefined); // undefined = pendiente
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Animación de checkmarks
  useEffect(() => {
    const timers = CHECK_DELAYS.map((delay, i) =>
      setTimeout(() => setCheckedCount(i + 1), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Ejecutar trabajo real
  useEffect(() => {
    let cancelled = false;
    work().then((result) => {
      if (!cancelled) setApiResult(result);
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Avanzar cuando animación Y API terminen
  useEffect(() => {
    if (checkedCount < CREATING_STEPS.length || apiResult === undefined) return;
    const timer = setTimeout(() => onCompleteRef.current(apiResult), 500);
    return () => clearTimeout(timer);
  }, [checkedCount, apiResult]);

  return (
    <div className="py-8">
      <div className="text-center mb-8">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'rgba(124,58,237,0.1)' }}
        >
          <svg className="animate-spin" width={24} height={24} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
          Creando tu tienda...
        </h1>
      </div>

      <div className="space-y-3">
        {CREATING_STEPS.map((label, i) => {
          const done = checkedCount > i;
          const active = checkedCount === i;
          return (
            <div
              key={label}
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
              style={{
                backgroundColor: done ? 'rgba(124,58,237,0.06)' : active ? 'var(--color-surface)' : 'transparent',
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all"
                style={{
                  backgroundColor: done ? 'var(--color-primary)' : 'transparent',
                  border: done ? 'none' : '2px solid var(--color-border)',
                }}
              >
                {done && <Icon name="Check" size={13} color="#fff" />}
              </div>
              <span
                className="text-sm font-medium"
                style={{
                  color: done ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                  fontFamily: 'var(--font-caption)',
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Paso 5: Tu tienda está lista ─────────────────────────────────────────────

function SuccessStep({ business, seededCount, catalogImageUrl }) {
  const navigate = useNavigate();
  const catalogUrl = business?.slug ? `/catalogo/${business.slug}` : null;

  return (
    <div>
      {/* Imagen del catálogo generado */}
      <div className="w-full rounded-2xl overflow-hidden border mb-6" style={{ borderColor: 'var(--color-border)' }}>
        {catalogImageUrl ? (
          <img
            src={catalogImageUrl}
            alt="Tu catálogo"
            className="w-full object-cover object-top"
            style={{ maxHeight: 240 }}
          />
        ) : (
          <div
            className="w-full flex flex-col items-center justify-center py-14 gap-3"
            style={{ background: 'linear-gradient(135deg, #f5f0ff 0%, #eff6ff 50%, #f0fdf4 100%)', minHeight: 200 }}
          >
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.15)' }}>
              <Icon name="ShoppingBag" size={22} color="var(--color-primary)" />
            </div>
            {business?.name && (
              <p className="text-sm font-semibold" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                {business.name}
              </p>
            )}
          </div>
        )}
      </div>

      <h1 className="text-2xl font-bold mb-2 text-center" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
        Tu tienda está lista
      </h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
        Hemos preparado una primera versión de tu catálogo para que veas cómo se verá tu negocio.
        Podrás cambiar productos, imágenes, colores y diseño cuando quieras.
      </p>

      <div className="flex flex-col gap-3">
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

  useEffect(() => {
    console.info('[OnboardingPage] mounted', { businessId: business?.id });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState('country');
  const [rubros, setRubros] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [seededCount, setSeededCount] = useState(0);
  const [catalogImageUrl, setCatalogImageUrl] = useState(null);
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

  // Cargar rubros en background (necesarios para rubroId, nunca mostrados al usuario)
  useEffect(() => {
    getRubros().then(({ data }) => setRubros(data || [])).catch(() => {});
  }, []);

  // Paso 1: guardar país
  const handleCountrySelect = useCallback(async (countryCode) => {
    if (!business?.id) return;
    // Si omite país, avanzar igual
    if (!countryCode) { setStep('category'); return; }
    setSaving(true);
    setError(null);
    console.log('[onboarding] country:', countryCode);
    const { error: err } = await updateBusiness(business.id, { countryCode, persistCountry: true });
    setSaving(false);
    if (err) { setError('No se pudo guardar el país. Intenta de nuevo.'); return; }
    await refreshBusiness();
    setStep('category');
  }, [business?.id, refreshBusiness]);

  // Paso 2: guardar categoría en estado local (sin API)
  const handleCategorySelect = useCallback((cat) => {
    setSelectedCategory(cat);
    setStep('whatsapp');
  }, []);

  // Paso 3: guardar WhatsApp y arrancar creación
  const handleWhatsApp = useCallback((wa) => {
    setWhatsapp(wa);
    setStep('creating');
  }, []);

  // Trabajo real que ocurre en el paso "Creando tu tienda"
  // Este callback es estable: se crea una sola vez con los valores actuales via closure
  const buildWork = useCallback(() => {
    const rubroSlug = selectedCategory?.slug || null;
    const currentBusinessId = business?.id;

    return async () => {
      if (!currentBusinessId) return { seededCount: 0, catalogImageUrl: null };

      // 1. Guardar rubro (si se eligió)
      if (rubroSlug) {
        const rubro = rubros.find((r) => r.slug === rubroSlug);
        if (rubro?.id) {
          await updateBusiness(currentBusinessId, { rubroId: rubro.id });
        }
      }

      // 2. Sembrar productos de ejemplo
      let seedResult = { created: 0, branding: null, categoriesCreated: 0 };
      if (rubroSlug) {
        seedResult = await seedTemplateProductsIfEmpty({ businessId: currentBusinessId, rubroSlug });
        console.log('[onboarding] seed source:', seedResult?.source, '| products:', seedResult?.created);
      }

      // 3. Guardar WhatsApp
      if (whatsapp) {
        await updateBusiness(currentBusinessId, { whatsapp });
      }

      // 4. Aplicar branding de la plantilla
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
          await updateBusiness(currentBusinessId, { ...onboardingPayload, designSettings: designAfterBranding });
        }
      }

      // 5. Refrescar negocio
      await refreshBusiness();

      // 6. Imagen del catálogo: previewImageUrl > coverImageUrl > null
      const img =
        seedResult?.branding?.previewImageUrl ||
        seedResult?.branding?.coverImageUrl ||
        null;

      return {
        seededCount: Number(seedResult?.created || 0),
        catalogImageUrl: img,
      };
    };
  }, [business, rubros, selectedCategory, whatsapp, refreshBusiness]);

  // Callback cuando CreatingStep termina
  const handleCreatingComplete = useCallback((result) => {
    setSeededCount(result?.seededCount || 0);
    setCatalogImageUrl(result?.catalogImageUrl || null);
    setStep('success');
  }, []);

  if (!business) return <PremiumLoader fullScreen text="Cargando tu cuenta..." />;
  if (checking) return <PremiumLoader fullScreen text="Verificando tu tienda..." />;

  // El paso "creating" no tiene logo ni wrapper — ocupa toda la pantalla centrado
  if (step === 'creating') {
    return (
      <div className="min-h-screen flex items-center justify-center p-5" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="w-full max-w-sm">
          <CreatingStep work={buildWork()} onComplete={handleCreatingComplete} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="w-full max-w-sm">

        {step !== 'success' && (
          <div className="mb-6 text-center">
            <img src="/walinka.svg" alt="Walinka" className="h-7 w-auto object-contain inline-block" />
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-xl border" style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <Icon name="AlertCircle" size={14} color="var(--color-error)" className="mt-0.5 shrink-0" />
            <span className="text-sm" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>{error}</span>
          </div>
        )}

        {step === 'country' && (
          <CountryStep onSelect={handleCountrySelect} saving={saving} defaultCode={business?.countryCode || null} />
        )}

        {step === 'category' && (
          <CategoryStep onSelect={handleCategorySelect} />
        )}

        {step === 'whatsapp' && (
          <WhatsAppStep onSubmit={handleWhatsApp} saving={false} />
        )}

        {step === 'success' && (
          <SuccessStep
            business={business}
            seededCount={seededCount}
            catalogImageUrl={catalogImageUrl}
          />
        )}

      </div>
    </div>
  );
}
