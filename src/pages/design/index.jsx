import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PanelHeader from 'components/ui/PanelHeader';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PremiumLoader from 'components/ui/PremiumLoader';
import Icon from 'components/AppIcon';
import DesignCustomization from '../business-configuration/components/DesignCustomization';
import MobilePreviewPanel from '../business-configuration/components/MobilePreviewPanel';
import { useAuth } from '../../contexts/AuthContext';
import { getMyBusiness, updateBusiness, getProducts } from '../../services/waBusinessService';
import { getCountryLabels } from '../../config/country';
import { getBusinessLocale } from '../../lib/locale/businessLocale';
import { isRestaurantBusiness } from '../../utils/businessType';

const defaultDesign = {
  theme: 'minimal',
  primaryColor: '#7C3AED',
  font: 'Inter',
  logoUrl: '',
  headerImageUrl: '',
  coverFit: 'cover',
  coverPosition: 'center',
  catalogStyle: 'minimal',
  catalogLayout: 'list',
  catalogViewMode: 'featured',
  useCategories: false,
  categories: [],
  storeHeader: { showStoreName: true, showDescription: true, showWhatsAppButton: true, descriptionColor: '' },
  cardSettings: { showPrice: true, showDescription: true, showStock: false, showWhatsApp: true },
};

function Toast({ message, type, onClose }) {
  return (
    <div
      className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
      style={{
        backgroundColor: type === 'success' ? '#10b981' : '#ef4444',
        color: '#fff',
        minWidth: '260px',
        fontFamily: 'var(--font-caption)',
      }}
    >
      <Icon name={type === 'success' ? 'CheckCircle2' : 'AlertCircle'} size={14} color="#fff" />
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button onClick={onClose} className="flex-shrink-0 hover:opacity-70">
        <Icon name="X" size={14} color="#fff" />
      </button>
    </div>
  );
}

export default function DesignPage() {
  const navigate = useNavigate();
  const previewAnchorRef = useRef(null);   // desktop (sticky)
  const previewMobileRef = useRef(null);   // móvil/tablet (al final)
  const { user, business: ctxBusiness, businessLoading, refreshBusiness, patchBusiness } = useAuth();
  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  // `design` = persisted baseline (what's in the DB).
  // `draftDesign` = working copy (only in-memory until saved).
  const [design, setDesign] = useState(defaultDesign);
  const [draftDesign, setDraftDesign] = useState(defaultDesign);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [toast, setToast] = useState(null);
  const showSavedTimerRef = useRef(null);
  const locale = getBusinessLocale(business, {
    preferredCountryCode: user?.user_metadata?.country_code ?? null,
  });
  const isRestaurant = isRestaurantBusiness(business);
  const designTitle = isRestaurant ? 'Diseño del menú' : 'Diseño del catálogo';
  const designSubtitle = isRestaurant
    ? 'Cuida cómo se verá tu carta cuando tus clientes la abran.'
    : 'Ajusta cómo se verá tu tienda cuando tus clientes la abran.';
  const previewTitle = isRestaurant ? 'Vista del menú' : 'Vista del catálogo';

  const loading = businessLoading && !ctxBusiness;

  // True when the draft differs from the last-saved state.
  const isDirty = useMemo(
    () => JSON.stringify(draftDesign) !== JSON.stringify(design),
    [draftDesign, design],
  );

  useEffect(() => {
    if (ctxBusiness) setBusiness(ctxBusiness);
  }, [ctxBusiness]);

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
  }, [user, navigate, loading]);

  useEffect(() => {
    if (!user) return;
    if (!ctxBusiness && !business) {
      getMyBusiness().then(({ data }) => {
        if (data) {
          setBusiness(data);
          refreshBusiness?.();
        }
      });
    }
  }, [user, ctxBusiness, business, refreshBusiness]);

  useEffect(() => {
    if (business?.designSettings) {
      const ds = business.designSettings;
      const resolved = {
        ...defaultDesign,
        ...ds,
        catalogViewMode: ds?.catalogViewMode === 'compact' ? 'compact' : 'featured',
        useCategories: ds?.useCategories === true,
        categories: Array.isArray(ds?.categories) ? ds.categories : defaultDesign.categories,
        storeHeader: { ...defaultDesign.storeHeader, ...(ds.storeHeader || {}) },
        cardSettings: { ...defaultDesign.cardSettings, ...(ds.cardSettings || {}) },
      };
      // Both baseline and draft start from the same DB value.
      setDesign(resolved);
      setDraftDesign(resolved);
    }
  }, [business?.id]);

  useEffect(() => {
    if (!business?.id) return;
    getProducts(business.id).then(({ data }) => setProducts(data || []));
  }, [business?.id]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Warn browser before tab close when there are unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleSaveDesign = useCallback(async () => {
    if (!business?.id) {
      showToast('No se encontró el negocio.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await updateBusiness(business.id, { designSettings: draftDesign });
      if (error) {
        showToast('Error al guardar: ' + (error?.message || ''), 'error');
        return;
      }
      patchBusiness({ ...business, designSettings: draftDesign });
      // Advance persisted baseline to match the saved draft.
      setDesign(draftDesign);
      setShowSaved(true);
      if (showSavedTimerRef.current) clearTimeout(showSavedTimerRef.current);
      showSavedTimerRef.current = setTimeout(() => setShowSaved(false), 2500);
      showToast('¡Diseño guardado!', 'success');
    } catch (e) {
      showToast(e?.message || 'Error inesperado', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [business, draftDesign, patchBusiness, showToast]);

  // Discard draft, revert to the last-saved state.
  const handleReset = useCallback(() => {
    setDraftDesign(design);
    setShowSaved(false);
  }, [design]);

  if (!user) return null;

  if (loading && !business) {
    return <PremiumLoader fullScreen business={business} />;
  }

  if (!business?.id) {
    navigate('/business-registration', { replace: true });
    return null;
  }

  return (
    <DashboardAppShell backgroundColor="#f6f7fb" allowDesktopOverflow>
        <PanelHeader
          title={<h1 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Diseño</h1>}
          subtitle={<p className="text-xs hidden sm:block" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Identidad visual, portada y experiencia de catálogo.</p>}
        />

        <DashboardLayoutContent innerClassName="xl:overflow-visible">
          <section className="border-b pb-6" style={{ borderColor: 'rgba(17,24,39,0.08)' }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Identidad visual
            </p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em' }}>
              {designTitle}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-body)' }}>
              {designSubtitle}
            </p>
          </section>

          {/* Grid de 2 columnas en desktop. Columna izquierda crece con el formulario;
              columna derecha hace sticky real: se queda visible mientras el usuario scrollea. */}
          <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-8 xl:items-start xl:overflow-visible">
            {/* Columna izquierda — formulario largo */}
            <div className="min-w-0 w-full">
              <DesignCustomization
                design={draftDesign}
                onChange={setDraftDesign}
                businessId={business?.id}
                businessName={business?.name}
                userEmail={user?.email}
                isSaving={isSaving}
                onSave={handleSaveDesign}
                showToast={showToast}
                isDirty={isDirty}
                showSaved={showSaved}
                onReset={handleReset}
                isRestaurant={isRestaurant}
              />
            </div>

            {/* Columna derecha — preview sticky */}
            <div
              ref={previewAnchorRef}
              id="design-preview"
              className="hidden xl:sticky xl:top-[84px] xl:flex xl:h-[calc(100vh-108px)] xl:self-start xl:justify-center xl:overflow-visible"
            >
              <div
                className="rounded-[24px] border p-4 shadow-[0_18px_42px_rgba(17,24,39,0.08)] xl:max-h-full xl:overflow-visible"
                style={{ backgroundColor: 'rgba(255,255,255,0.72)', borderColor: 'rgba(17,24,39,0.08)' }}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      En vivo
                    </p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                      {previewTitle}
                    </p>
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: 'rgba(17,24,39,0.06)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    Mobile
                  </span>
                </div>
                <MobilePreviewPanel
                  storeName={business?.name || (isRestaurant ? 'Mi restaurante' : 'Mi tienda')}
                  storeSlug={business?.slug || ''}
                  logoUrl={draftDesign?.logoUrl || business?.logoUrl}
                  coverImageUrl={draftDesign?.headerImageUrl || business?.coverImageUrl}
                  products={products}
                  currency={business?.currency || locale.currencyCode}
                  locale={locale.locale}
                  countryCode={locale.countryCode}
                  design={draftDesign}
                  hideCurrencySymbol={draftDesign?.showCatalogCurrencySymbol === false}
                />
              </div>
            </div>
          </div>

          {/* Móvil/tablet: preview al final del formulario (acceso por botón flotante) */}
          <div
            ref={previewMobileRef}
            id="design-preview-mobile"
            className="xl:hidden w-full max-w-[360px] mx-auto scroll-mt-24 mt-8"
          >
            <div
              className="rounded-[24px] border p-4 shadow-[0_18px_42px_rgba(17,24,39,0.08)]"
              style={{ backgroundColor: 'rgba(255,255,255,0.72)', borderColor: 'rgba(17,24,39,0.08)' }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    En vivo
                  </p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                    {previewTitle}
                  </p>
                </div>
                <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: 'rgba(17,24,39,0.06)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  Mobile
                </span>
              </div>
              <MobilePreviewPanel
                storeName={business?.name || (isRestaurant ? 'Mi restaurante' : 'Mi tienda')}
                storeSlug={business?.slug || ''}
                logoUrl={draftDesign?.logoUrl || business?.logoUrl}
                coverImageUrl={draftDesign?.headerImageUrl || business?.coverImageUrl}
                products={products}
                currency={business?.currency || locale.currencyCode}
                locale={locale.locale}
                countryCode={locale.countryCode}
                design={draftDesign}
                hideCurrencySymbol={draftDesign?.showCatalogCurrencySymbol === false}
              />
            </div>
          </div>
        </DashboardLayoutContent>

        {/* Móvil: acceso rápido a la vista previa (al final del flujo o scroll al ancla) */}
        <button
          type="button"
          className="fixed bottom-6 right-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 shadow-lg md:hidden transition-transform duration-300 hover:-translate-y-0.5 active:scale-95"
          style={{
            background: '#111827',
            color: '#fff',
            fontFamily: 'var(--font-caption)',
            boxShadow: '0 12px 30px rgba(17,24,39,0.22)',
          }}
          onClick={() => previewMobileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          aria-label="Ir a vista previa"
        >
          <Icon name="Smartphone" size={18} color="#fff" />
          <span className="text-sm font-semibold">Vista previa</span>
        </button>
      
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </DashboardAppShell>
  );
}
