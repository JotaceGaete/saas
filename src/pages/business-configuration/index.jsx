import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PanelHeader from 'components/ui/PanelHeader';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PremiumLoader from 'components/ui/PremiumLoader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { updateBusiness, getMyBusiness, getRubros, getEffectivePlanSlug } from '../../services/waBusinessService';
import { seedTemplateProductsIfEmpty } from '../../services/productTemplateService';
import { supabase } from '../../lib/supabase';
import StoreCreationStep from '../business-registration/components/StoreCreationStep';
import WhatsAppMessageTemplate from './components/WhatsAppMessageTemplate';
import DynamicWhatsAppField from 'components/DynamicWhatsAppField';
import { getCountryLabels, getCountryCode } from '../../config/country';
import InstallAppBlock from './components/InstallAppBlock';
import SettingsSwitch from './components/SettingsSwitch';
import { Building2, CreditCard, Palette, Sparkles } from 'lucide-react';
import { truncateAtWordBoundary } from '../../utils/textTruncate';
import CountryIsoSelect from '../../components/country/CountryIsoSelect';
import {
  evaluateBusinessCountryChangePolicy,
} from '../../lib/country/business-country-policy';
import { resolveCountryState, resolveBillingSetup } from '../../lib/country/state-model';
import { suggestCountryCodeHint } from '../../lib/country/suggest-country-hint';
import { getCountryConfig, COUNTRY_CODES } from '../../config/countryConfig';
import BusinessConfigContextBanner from 'components/business/BusinessConfigContextBanner';
import { parseAddressByCountry, buildFullAddressLine } from '../../utils/addressParse';
import { resolveVentaAiProductDescriptionEndpoint } from '../../lib/ai/resolveVentaAiProductDescriptionUrl.js';
import DesignSettings from './components/DesignSettings';
import RubroPrincipalSelector from './components/RubroPrincipalSelector';
import BusinessCategoriesManager from './components/BusinessCategoriesManager';
import CustomDomainSettings from './components/CustomDomainSettings';
import { BUSINESS_MODES, getRecommendedBusinessModeFromRubro } from '../../lib/business-mode';

const BUSINESS_DESCRIPTION_MAX = 280;
const PRINT_LEGEND_MAX = 180;

/** Línea base para detectar cambios sin depender del ciclo de setState. */
function buildSavedConfigSnapshotFromBusiness(business) {
  if (!business?.id) return '';
  const labels = getCountryLabels(
    business.countryCodeDb != null && String(business.countryCodeDb).trim() !== ''
      ? String(business.countryCodeDb).trim().toUpperCase()
      : null,
  );
  const dsSnap = business.designSettings || {};
  const designSnap = {
    ...dsSnap,
    theme: dsSnap.theme ?? 'minimal',
    primaryColor: dsSnap.primaryColor ?? '#7C3AED',
    font: dsSnap.font ?? 'Inter',
    logoUrl: dsSnap.logoUrl ?? '',
    headerImageUrl: dsSnap.headerImageUrl ?? '',
    shareImageUrl: dsSnap.shareImageUrl ?? '',
    coverFit: dsSnap.coverFit ?? 'cover',
    coverPosition: dsSnap.coverPosition ?? 'center',
    catalogLayout: dsSnap.catalogLayout ?? 'list',
    catalogViewMode: dsSnap?.catalogViewMode === 'compact' ? 'compact' : 'featured',
    useCategories: dsSnap?.useCategories === true,
    categories: Array.isArray(dsSnap?.categories) ? dsSnap.categories : [],
    storeHeader: {
      showStoreName: true,
      showDescription: true,
      showWhatsAppButton: true,
      descriptionColor: '',
      ...(dsSnap.storeHeader || {}),
    },
    cardSettings: {
      showPrice: true,
      showDescription: true,
      showStock: false,
      showWhatsApp: true,
      ...(dsSnap.cardSettings || {}),
    },
    showAddress: dsSnap?.showAddress === true,
    businessHours: dsSnap?.businessHours ?? '',
    footerText: dsSnap?.footerText ?? '',
    shippingMethods: dsSnap?.shippingMethods ?? '',
    shippingCost: dsSnap?.shippingCost ?? '',
    retiroEnTienda: dsSnap?.retiroEnTienda === true,
  };
  return JSON.stringify({
    form: {
      name: business?.name || '',
      slug: business?.slug || '',
      description: business?.description || '',
      printLegend: business?.printLegend || business?.print_legend || '',
      whatsapp: business?.whatsapp || '',
      email: business?.email || '',
      address: business?.address || '',
      city: business?.city || '',
      region: business?.region || '',
      country: labels.countryName,
      currency: business?.currency || labels.currency,
      rubroId: business?.rubroId || '',
      businessMode: business?.businessMode || BUSINESS_MODES.STORE,
      documentTitleType: business?.documentTitleType || 'cotizacion',
    },
    design: designSnap,
    orderMessageTemplate: business?.orderMessageTemplate || '',
    fullAddressInput: buildFullAddressLine({
      address: business?.address,
      city: business?.city,
      region: business?.region,
    }),
    uxCountry:
      business?.countryCodeDb != null && String(business.countryCodeDb).trim() !== ''
        ? String(business.countryCodeDb).trim().toUpperCase()
        : null,
  });
}

function Toast({ message, type, onClose }) {
  return (
    <div
      className="fixed top-4 right-4 z-[80] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg toast-enter"
      style={{
        backgroundColor: type === 'success' ? '#10b981' : '#ef4444',
        color: '#fff',
        minWidth: '260px',
        maxWidth: '360px',
        fontFamily: 'var(--font-caption)',
        boxShadow: type === 'success' ? '0 4px 20px rgba(16,185,129,0.35)' : '0 4px 20px rgba(239,68,68,0.35)',
      }}
    >
      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 check-pop" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
        <Icon name={type === 'success' ? 'CheckCircle2' : 'AlertCircle'} size={14} color="#fff" />
      </div>
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button onClick={onClose} className="flex-shrink-0 hover:opacity-70 transition-opacity duration-150 ml-1">
        <Icon name="X" size={14} color="#fff" />
      </button>
    </div>
  );
}

function SettingsField({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>
        {label}
      </label>
      {hint && <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>{hint}</p>}
      {children}
    </div>
  );
}

const ONBOARDING_FIELD_LABELS = {
  country: 'País del negocio',
  name: 'Nombre del negocio',
  whatsapp: 'Número de WhatsApp',
};

const ONBOARDING_SCROLL_PRIORITY = ['country', 'whatsapp', 'name'];

function OnboardingIncompleteBanner({ missingFields }) {
  const hasMissing = missingFields.length > 0;

  const handleScrollToFields = () => {
    const first = ONBOARDING_SCROLL_PRIORITY.find((f) => missingFields.includes(f));
    const el = first
      ? document.getElementById(`onboarding-field-${first}`)
      : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div
      className="rounded-xl border p-4 mb-6 flex gap-3"
      style={{
        borderColor: 'rgba(234,179,8,0.4)',
        backgroundColor: 'rgba(254,252,232,1)',
      }}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Icon name="AlertTriangle" size={18} color="#ca8a04" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold mb-1" style={{ color: '#854d0e', fontFamily: 'var(--font-caption)' }}>
          Debes completar estos datos para continuar
        </p>
        {hasMissing && (
          <ul className="mt-1 space-y-0.5">
            {missingFields.map((f) => (
              <li key={f} className="flex items-center gap-1.5 text-xs" style={{ color: '#92400e', fontFamily: 'var(--font-caption)' }}>
                <Icon name="Circle" size={6} color="#ca8a04" />
                {ONBOARDING_FIELD_LABELS[f] ?? f}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs" style={{ color: '#92400e', fontFamily: 'var(--font-caption)' }}>
          Esto es necesario para activar tu catálogo y recibir pedidos.
        </p>
        <button
          type="button"
          onClick={handleScrollToFields}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-2 transition-opacity hover:opacity-70"
          style={{ color: '#854d0e', fontFamily: 'var(--font-caption)' }}
        >
          Completar ahora
          <Icon name="ArrowDown" size={12} color="#854d0e" />
        </button>
      </div>
    </div>
  );
}

export default function BusinessConfiguration() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, business: ctxBusiness, businessLoading, refreshBusiness, patchBusiness } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [rubroError, setRubroError] = useState(null);
  const [orderMessageTemplate, setOrderMessageTemplate] = useState('');
  const [business, setBusiness] = useState(null);
  const [businessFetchLoading, setBusinessFetchLoading] = useState(false);
  /** País ISO en UX (solo se persiste al guardar). */
  const [uxCountry, setUxCountry] = useState(null);
  /** Sin país en BD: `suggest` (bloque sugerido) o `manual` (selector explícito). */
  const [countryFlowMode, setCountryFlowMode] = useState('suggest');
  const [manualCountryCode, setManualCountryCode] = useState('');
  const [countryGuards, setCountryGuards] = useState({
    loading: false,
    hasOrders: false,
    trialStarted: false,
    hasActiveSubscription: false,
  });

  const suggestedCountryCode = useMemo(() => suggestCountryCodeHint({ user }), [user]);

  /** País persistido en BD (`country_code` / `countryCodeDb`). */
  const businessCountry =
    business?.countryCodeDb != null && String(business.countryCodeDb).trim() !== ''
      ? String(business.countryCodeDb).trim().toUpperCase()
      : null;
  /** Solo con país en BD: UI con etiquetas/prefijos; si no, neutro (sin fallback). */
  const hasPersistedCountry = businessCountry != null;
  const uiCountryCode = uxCountry ?? businessCountry;
  const countryLabels = getCountryLabels(uiCountryCode);
  const countryChangePolicy = business ? evaluateBusinessCountryChangePolicy(business) : { allowed: false };
  const countryStatePreview = resolveCountryState({
    businessCountryCode: business,
    onboardingCountryCode: null,
    userCountryCode: user?.user_metadata?.country_code ?? user?.user_metadata?.country ?? null,
    hostnameSuggestionCountryCode: null,
  });
  const billingPreview = resolveBillingSetup(countryStatePreview);

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    printLegend: '',
    whatsapp: '',
    email: '',
    address: '',
    city: '',
    region: '',
    country: countryLabels.countryName,
    currency: countryLabels.currency,
    rubroId: '',
    instagramUrl: '',
    tiktokUrl: '',
    facebookUrl: '',
    businessMode: BUSINESS_MODES.STORE,
  });
  const [rubros, setRubros] = useState([]);
  const [fullAddressInput, setFullAddressInput] = useState('');
  const [slugEditUnlocked, setSlugEditUnlocked] = useState(false);
  const [settingsTab, setSettingsTab] = useState('identity');

  const [isImprovingBusinessDescription, setIsImprovingBusinessDescription] = useState(false);

  const effectivePlan = getEffectivePlanSlug(business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt);
  const canUseAiDescription = effectivePlan === 'pro' || effectivePlan === 'business';

  const currentRubro = useMemo(
    () => rubros.find((r) => String(r?.id) === String(form?.rubroId)) ?? null,
    [rubros, form?.rubroId],
  );
  const recommendedBusinessMode = useMemo(
    () => getRecommendedBusinessModeFromRubro(currentRubro),
    [currentRubro],
  );
  const visibleBusinessKind = (form?.businessMode || business?.businessMode || BUSINESS_MODES.STORE) === BUSINESS_MODES.RESTAURANT
    ? 'restaurante'
    : 'tienda';
  const visibleCatalogSurface = visibleBusinessKind === 'restaurante' ? 'menú' : 'catálogo';

  // Design settings state (valores por defecto; se rellenan desde business.designSettings al cargar)
  const [design, setDesign] = useState({
    theme: 'minimal',
    primaryColor: '#7C3AED',
    font: 'Inter',
    logoUrl: '',
    headerImageUrl: '',
    shareImageUrl: '',
    coverFit: 'cover',
    coverPosition: 'center',
    catalogLayout: 'list',
    catalogViewMode: 'featured',
    useCategories: false,
    categories: [],
    storeHeader: {
      showStoreName: true,
      showDescription: true,
      showWhatsAppButton: true,
      descriptionColor: '',
    },
    cardSettings: {
      showPrice: true,
      showDescription: true,
      showStock: false,
      showWhatsApp: true,
    },
    showAddress: false,
    businessHours: '',
    footerText: '',
    shippingMethods: '',
    shippingCost: '',
    retiroEnTienda: false,
  });

  const toastTimer = useRef(null);
  const [savedConfigSnapshot, setSavedConfigSnapshot] = useState('');

  const currentConfigSnapshot = useMemo(
    () =>
      JSON.stringify({
        form,
        design,
        orderMessageTemplate,
        fullAddressInput,
        uxCountry,
      }),
    [form, design, orderMessageTemplate, fullAddressInput, uxCountry],
  );

  const isDirty = Boolean(business?.id && savedConfigSnapshot && currentConfigSnapshot !== savedConfigSnapshot);
  const hasUnsavedCountryChange = (uxCountry ?? null) !== (businessCountry ?? null);
  /** Bloqueo solo si ya hay país guardado y hay suscripción activa, pedidos o trial iniciado. */
  const isCountryLocked =
    hasPersistedCountry &&
    (countryGuards.hasActiveSubscription || countryGuards.hasOrders || countryGuards.trialStarted);

  useEffect(() => {
    console.log('[VTLK_ROUTE] Renderizando: ' + (typeof window !== 'undefined' ? window.location.pathname : ''));
  }, []);

  useEffect(() => {
    if (!business?.id) return;
    const code =
      business.countryCodeDb != null && String(business.countryCodeDb).trim() !== ''
        ? String(business.countryCodeDb).trim().toUpperCase()
        : null;
    setUxCountry(code);
  }, [business?.id, business?.countryCodeDb]);

  useEffect(() => {
    let cancelled = false;
    const loadCountryGuards = async () => {
      const bizId = business?.id;
      if (!bizId) return;
      setCountryGuards((prev) => ({ ...prev, loading: true }));
      try {
        const [{ count }, { data: businessRow }] = await Promise.all([
          supabase
            .from('wa_orders')
            .select('id', { count: 'exact', head: true })
            .eq('business_id', bizId),
          supabase
            .from('wa_businesses')
            .select('plan_slug, plan_expires_at, trial_expires_at, plan_started_at')
            .eq('id', bizId)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        const now = new Date();
        const planSlug = String(businessRow?.plan_slug || '').trim().toLowerCase();
        const expiresAt = businessRow?.plan_expires_at ? new Date(businessRow.plan_expires_at) : null;
        const hasActiveSubscription =
          (planSlug === 'pro' || planSlug === 'business') &&
          expiresAt instanceof Date &&
          !Number.isNaN(expiresAt.getTime()) &&
          expiresAt > now;
        const trialStarted = Boolean(businessRow?.plan_started_at || businessRow?.trial_expires_at);
        setCountryGuards({
          loading: false,
          hasOrders: (count || 0) > 0,
          trialStarted,
          hasActiveSubscription,
        });
      } catch (_) {
        if (cancelled) return;
        setCountryGuards((prev) => ({ ...prev, loading: false }));
      }
    };
    loadCountryGuards();
    return () => {
      cancelled = true;
    };
  }, [business?.id, business?.updatedAt]);

  useEffect(() => {
    if (hasPersistedCountry) return;
    setCountryFlowMode(suggestedCountryCode ? 'suggest' : 'manual');
    setManualCountryCode('');
  }, [hasPersistedCountry, business?.id, suggestedCountryCode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    console.log('[VTLK_UI_COUNTRY]', {
      country_code: business?.country_code,
      countryCodeDb: business?.countryCodeDb,
      uiCountryCode,
      hasPersistedCountry,
      usingFallback: false,
    });
  }, [business?.country_code, business?.countryCodeDb, uiCountryCode, hasPersistedCountry]);

  useEffect(() => {
    if (typeof window === 'undefined' || (!window.__VENTALINK_COUNTRY_DEBUG__ && !window.__VTLK_COUNTRY_DEBUG__)) return;
    console.info(window.__VTLK_COUNTRY_DEBUG__ ? '[VTLK_COUNTRY_CONFIG]' : '[VENTALINK_BUSINESS_CONFIG_COUNTRY]', {
      persistedDb: business?.countryCodeDb ?? null,
      hostnameUxHint: getCountryCode(),
      uxCountry,
      uiCountryCode,
      neutralNoCountry: !businessCountry,
      billingCountry: countryStatePreview.billingCountry,
      billingProvider: billingPreview.billingProvider,
      billingCurrency: billingPreview.currency,
      policyAllowed: countryChangePolicy.allowed,
    });
  }, [
    businessCountry,
    uxCountry,
    uiCountryCode,
    countryStatePreview.billingCountry,
    billingPreview.billingProvider,
    billingPreview.currency,
    countryChangePolicy.allowed,
  ]);

  // Sincronizar negocio local desde el contexto cuando este se actualice
  useEffect(() => {
    if (ctxBusiness) setBusiness(ctxBusiness);
  }, [ctxBusiness]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/business-registration', { replace: true });
    }
  }, [loading, user, navigate]);

  // Si el contexto no tiene negocio tras cargar, hacer fetch directo y actualizar el contexto
  // para que el resto de la app (p. ej. Product Editor) vea el negocio.
  useEffect(() => {
    if (!businessLoading && !ctxBusiness) {
      setBusinessFetchLoading(true);
      getMyBusiness()
        ?.then(async ({ data, error }) => {
          if (data) {
            setBusiness(data);
            await refreshBusiness();
          }
          setBusinessFetchLoading(false);
        })
        ?.catch(() => setBusinessFetchLoading(false));
    }
  }, [businessLoading, ctxBusiness, refreshBusiness]);

  useEffect(() => {
    if (business) {
      setForm({
        name: business?.name || '',
        slug: business?.slug || '',
        description: business?.description || '',
        printLegend: business?.printLegend || business?.print_legend || '',
        whatsapp: business?.whatsapp || '',
        email: business?.email || '',
        address: business?.address || '',
        city: business?.city || '',
        region: business?.region || '',
        country: countryLabels.countryName,
        currency: business?.currency || countryLabels.currency,
        rubroId: business?.rubroId || '',
        instagramUrl: business?.instagramUrl || '',
        tiktokUrl: business?.tiktokUrl || '',
        facebookUrl: business?.facebookUrl || '',
        businessMode: business?.businessMode || BUSINESS_MODES.STORE,
        documentTitleType: business?.documentTitleType || 'cotizacion',
      });
      if (business?.designSettings) {
        const ds = business.designSettings;
        setDesign(prev => ({
          ...prev,
          ...ds,
          catalogViewMode: ds?.catalogViewMode === 'compact' ? 'compact' : 'featured',
          useCategories: ds?.useCategories === true,
          categories: Array.isArray(ds?.categories) ? ds.categories : prev.categories,
          storeHeader: { ...prev.storeHeader, ...(ds.storeHeader || {}) },
          cardSettings: { ...prev.cardSettings, ...(ds.cardSettings || {}) },
          showAddress: ds?.showAddress === true,
          businessHours: ds?.businessHours ?? '',
          footerText: ds?.footerText ?? '',
          shippingMethods: ds?.shippingMethods ?? '',
          shippingCost: ds?.shippingCost ?? '',
          retiroEnTienda: ds?.retiroEnTienda === true,
        }));
      }
      setOrderMessageTemplate(business?.orderMessageTemplate || '');
      setFullAddressInput(
        buildFullAddressLine({
          address: business?.address,
          city: business?.city,
          region: business?.region,
        }),
      );
      setSlugEditUnlocked(false);
      setSavedConfigSnapshot(buildSavedConfigSnapshotFromBusiness(business));
    }
  }, [business?.id, business?.updatedAt]);

  useEffect(() => {
    getRubros().then(({ data }) => setRubros(data || []));
  }, []);

  const showToast = (message, type = 'success') => {
    if (toastTimer?.current) clearTimeout(toastTimer?.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleRubroChange = (nextRaw) => {
    const next = nextRaw != null ? String(nextRaw) : '';
    if (next) setRubroError(null);
    const prev = form?.rubroId != null ? String(form.rubroId) : '';
    if (prev && next && prev !== next) {
      const ok = window.confirm(
        'Cambiar el rubro puede resetear tus categorías sugeridas. ¿Deseas continuar?',
      );
      if (!ok) return;
    }
    handleFormChange('rubroId', next);
  };

  const handleImproveBusinessDescription = async () => {
    const rawDesc = (form?.description ?? '').trim();
    const storeName = (form?.name ?? '').trim();
    if (!rawDesc && !storeName) {
      showToast('Escribe una descripción o el nombre del negocio para poder mejorar el texto.', 'error');
      return;
    }
    setIsImprovingBusinessDescription(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showToast('Inicia sesión para usar esta función.', 'error');
        return;
      }
      const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
      const { ventaAiUrl, useVentaAi } = resolveVentaAiProductDescriptionEndpoint();
      if (useVentaAi && !business?.id) {
        showToast('Carga el negocio antes de usar la IA.', 'error');
        return;
      }
      const endpoint = useVentaAi
        ? ventaAiUrl
        : `${supabaseUrl}/functions/v1/improve-product-description`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          ...(useVentaAi ? {} : { apikey: import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '' }),
        },
        body: JSON.stringify(
          useVentaAi
            ? {
                businessId: business?.id,
                text: truncateAtWordBoundary(rawDesc, BUSINESS_DESCRIPTION_MAX),
                productName: storeName,
                maxDescriptionLength: BUSINESS_DESCRIPTION_MAX,
              }
            : {
                text: truncateAtWordBoundary(rawDesc, BUSINESS_DESCRIPTION_MAX),
                productName: storeName,
                maxDescriptionLength: BUSINESS_DESCRIPTION_MAX,
              },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        console.error('[Mejorar descripción] Error API:', res.status, data?.code);
        if (res.status === 429) {
          showToast('Demasiadas solicitudes. Espera un momento e intenta de nuevo.', 'error');
        } else if (res.status === 504) {
          showToast('El servicio de IA tardó demasiado. Intenta de nuevo.', 'error');
        } else {
          showToast('No pudimos generar la respuesta en este momento. Intenta nuevamente en unos segundos.', 'error');
        }
        return;
      }
      let improved = typeof data?.description === 'string' ? data.description.trim() : '';
      if (!improved) {
        showToast('No se obtuvo texto. Intenta de nuevo.', 'error');
        return;
      }
      improved = truncateAtWordBoundary(
        improved
          .replace(/\s*\([^)]*(?:\bIA\b|inteligencia\s+artificial)[^)]*\)/gi, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim(),
        BUSINESS_DESCRIPTION_MAX,
      );
      handleFormChange('description', improved);
      showToast(
        useVentaAi && data?.cached === true
          ? '⚡ Generado previamente (caché). Revisa y guarda si te convence.'
          : 'Descripción actualizada. Revisa y guarda si te convence.',
        'success',
      );
    } catch (e) {
      console.error('[BusinessConfiguration] Mejorar descripción:', e);
      showToast('Error de conexión. Intenta de nuevo.', 'error');
    } finally {
      setIsImprovingBusinessDescription(false);
    }
  };

  const handleCountrySelection = (isoCode) => {
    const raw = String(isoCode || '').trim().toUpperCase();
    if (!raw || !COUNTRY_CODES.includes(raw)) {
      showToast('Selecciona un país válido.', 'error');
      return;
    }
    if (raw === (uxCountry ?? businessCountry)) return;
    if (isCountryLocked) {
      return;
    }
    if (!hasPersistedCountry) {
      setUxCountry(raw);
      return;
    }
    const ok = window.confirm(
      'Changing the country will affect currency, pricing and payment providers. This action may not be reversible. Do you want to continue?',
    );
    if (!ok) return;
    setUxCountry(raw);
  };

  const handleSaveSettings = async () => {
    const bizId = business?.id;
    if (!bizId) {
      showToast('No se encontró el negocio. Intenta recargar la página.', 'error');
      return;
    }

    if (!form?.rubroId) {
      setRubroError('Selecciona un rubro principal para continuar.');
      document.getElementById('field-rubro-principal')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setRubroError(null);

    const prevRubroId = business?.rubroId != null ? String(business.rubroId) : '';
    const rubroChanged = prevRubroId !== String(form?.rubroId || '');

    setIsSaving(true);

    const countryToPersist = uxCountry ?? businessCountry;
    const parsedAddr = parseAddressByCountry(fullAddressInput, countryToPersist);
    const slugClean = (s) => (String(s || '').trim() || '').replace(/\s+/g, '-').toLowerCase();
    const nextSlug = slugEditUnlocked
      ? slugClean(form?.slug) || slugClean(business?.slug)
      : (business?.slug || '');

    const payload = {
      name: form?.name?.trim() || business?.name,
      slug: nextSlug || business?.slug,
      description: form?.description,
      printLegend: form?.printLegend?.trim() || null,
      whatsapp: form?.whatsapp,
      email: form?.email,
      address: parsedAddr.address,
      city: parsedAddr.city,
      region: parsedAddr.region,
      rubroId: form?.rubroId || null,
      businessMode: form?.businessMode || BUSINESS_MODES.STORE,
      documentTitleType: form?.documentTitleType || 'cotizacion',
      instagramUrl: form?.instagramUrl || null,
      tiktokUrl: form?.tiktokUrl || null,
      facebookUrl: form?.facebookUrl || null,
      logoUrl: (design?.logoUrl ?? business?.logoUrl ?? '').trim() || null,
      coverImageUrl: (
        design?.coverImageUrl ??
        design?.headerImageUrl ??
        business?.coverImageUrl ??
        ''
      ).trim() || null,
      designSettings: design,
      orderMessageTemplate,
    };
    if (countryToPersist && countryToPersist !== businessCountry) {
      payload.countryCode = countryToPersist;
      payload.persistCountry = true;
      payload.designSettings = {
        ...design,
        showCatalogCurrencySymbol: false,
      };
    }

    try {
      const { data: updated, error } = await updateBusiness(bizId, payload);
      if (error) {
        showToast('No se pudo guardar la configuración. Intenta de nuevo.', 'error');
        return;
      }
      if (updated) {
        patchBusiness(updated);
      }

      // Siembra automática de catálogo de ejemplo según el rubro recién guardado.
      // Solo inserta si el negocio no tiene productos reales; si falla, el guardado igual fue exitoso.
      let seededCount = 0;
      let brandingApplied = false;
      let designAfterBranding = design;
      try {
        const selectedRubro =
          currentRubro ?? rubros.find((r) => String(r?.id) === String(form?.rubroId)) ?? null;
        console.log('[templates] selected rubro:', selectedRubro);

        let rubroSlug = selectedRubro?.slug || null;
        if (!rubroSlug && form?.rubroId) {
          // Fallback: si la lista de rubros aún no cargó, leer el slug directo de wa_rubros.
          const { data: rubroRow, error: rubroError } = await supabase
            ?.from('wa_rubros')
            ?.select('slug')
            ?.eq('id', form.rubroId)
            ?.maybeSingle();
          if (rubroError) console.error('[templates] error leyendo wa_rubros:', rubroError);
          rubroSlug = rubroRow?.slug || null;
        }
        console.log('[templates] rubroSlug enviado:', rubroSlug);

        const seedResult = await seedTemplateProductsIfEmpty({
          businessId: bizId,
          rubroSlug,
        });
        console.log('[templates] seed result:', seedResult);
        seededCount = seedResult?.created || 0;

        // Identidad visual del template: solo cuando se crearon productos y
        // solo en campos vacíos — nunca pisar imágenes subidas por el usuario.
        if (seededCount > 0 && seedResult?.branding) {
          const bizAfterSave = updated || business;
          const hasLogo = String(bizAfterSave?.logoUrl || '').trim() !== '';
          const hasCover = String(bizAfterSave?.coverImageUrl || '').trim() !== '';
          const brandingUpdates = {};
          if (seedResult.branding.logoUrl && !hasLogo) {
            brandingUpdates.logoUrl = seedResult.branding.logoUrl;
          }
          if (seedResult.branding.coverImageUrl && !hasCover) {
            brandingUpdates.coverImageUrl = seedResult.branding.coverImageUrl;
          }
          console.log('[templates] branding a aplicar:', brandingUpdates);
          if (Object.keys(brandingUpdates).length > 0) {
            const { data: brandedBiz, error: brandingError } = await updateBusiness(bizId, brandingUpdates);
            if (brandingError) {
              console.error('[templates] branding update error:', brandingError);
            } else {
              if (brandedBiz) patchBusiness(brandedBiz);
              brandingApplied = true;
              // Reflejar en el estado de diseño local: el payload de guardado
              // prioriza design.logoUrl/coverImageUrl, así que sin esto el
              // próximo guardado pisaría el branding con valores vacíos.
              designAfterBranding = {
                ...designAfterBranding,
                ...(brandingUpdates.logoUrl ? { logoUrl: brandingUpdates.logoUrl } : {}),
                ...(brandingUpdates.coverImageUrl
                  ? {
                      coverImageUrl: brandingUpdates.coverImageUrl,
                      headerImageUrl: brandingUpdates.coverImageUrl,
                    }
                  : {}),
              };
              setDesign(designAfterBranding);
            }
          }
        }
      } catch (seedError) {
        console.error('[templates] seedTemplateProductsIfEmpty exception:', seedError);
      }

      const formAfterAddr = {
        ...form,
        address: parsedAddr.address,
        city: parsedAddr.city,
        region: parsedAddr.region,
        slug: nextSlug || form?.slug,
      };
      setForm(formAfterAddr);
      setFullAddressInput(buildFullAddressLine(parsedAddr));
      setSlugEditUnlocked(false);
      setSavedConfigSnapshot(
        JSON.stringify({
          form: formAfterAddr,
          design: designAfterBranding,
          orderMessageTemplate,
          fullAddressInput: buildFullAddressLine(parsedAddr),
          uxCountry: countryToPersist,
        }),
      );
      if (seededCount > 0 && brandingApplied) {
        showToast('Rubro guardado, catálogo e identidad visual creados.', 'success');
      } else if (seededCount > 0) {
        showToast(`Rubro guardado y catálogo creado con ${seededCount} productos de ejemplo.`, 'success');
      } else if (rubroChanged) {
        showToast('Rubro guardado correctamente.', 'success');
      } else {
        showToast('¡Configuración guardada!', 'success');
      }
    } catch (e) {
      console.error('[BusinessConfig] handleSaveSettings exception:', e);
      showToast('Error inesperado. Intenta de nuevo.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const discardConfigChanges = useCallback(() => {
    if (!business) return;
    const code =
      business.countryCodeDb != null && String(business.countryCodeDb).trim() !== ''
        ? String(business.countryCodeDb).trim().toUpperCase()
        : null;
    setUxCountry(code);
    const revertedLabels = getCountryLabels(code);
    setForm({
      name: business?.name || '',
      slug: business?.slug || '',
      description: business?.description || '',
      printLegend: business?.printLegend || business?.print_legend || '',
      whatsapp: business?.whatsapp || '',
      email: business?.email || '',
      address: business?.address || '',
      city: business?.city || '',
      region: business?.region || '',
      country: revertedLabels.countryName,
      currency: business?.currency || revertedLabels.currency,
      rubroId: business?.rubroId || '',
      instagramUrl: business?.instagramUrl || '',
      tiktokUrl: business?.tiktokUrl || '',
      facebookUrl: business?.facebookUrl || '',
      businessMode: business?.businessMode || BUSINESS_MODES.STORE,
    });
    setOrderMessageTemplate(business?.orderMessageTemplate || '');
    setFullAddressInput(
      buildFullAddressLine({
        address: business?.address,
        city: business?.city,
        region: business?.region,
      }),
    );
    setSlugEditUnlocked(false);
    if (business?.designSettings) {
      const ds = business.designSettings;
      setDesign(prev => ({
        ...prev,
        ...ds,
        catalogViewMode: ds?.catalogViewMode === 'compact' ? 'compact' : 'featured',
        useCategories: ds?.useCategories === true,
        categories: Array.isArray(ds?.categories) ? ds.categories : prev.categories,
        storeHeader: { ...prev.storeHeader, ...(ds.storeHeader || {}) },
        cardSettings: { ...prev.cardSettings, ...(ds.cardSettings || {}) },
        showAddress: ds?.showAddress === true,
        businessHours: ds?.businessHours ?? '',
        footerText: ds?.footerText ?? '',
        shippingMethods: ds?.shippingMethods ?? '',
        shippingCost: ds?.shippingCost ?? '',
        retiroEnTienda: ds?.retiroEnTienda === true,
      }));
    }
    setSavedConfigSnapshot(buildSavedConfigSnapshotFromBusiness(business));
  }, [business]);

  const isLoading = businessLoading || businessFetchLoading;

  const inputClass = [
    'w-full rounded-lg border border-slate-200/80 bg-white/85 px-3 py-2 text-sm text-slate-900',
    'outline-none transition-all font-[family-name:var(--font-caption)]',
    'placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/5',
  ].join(' ');
  const inputStyle = {
    fontFamily: 'var(--font-caption)',
  };

  const cardClass =
    'rounded-[18px] border border-white/70 bg-white/72 p-5 shadow-[0_12px_34px_rgba(17,24,39,0.055)] sm:p-6';

  const sectionHeadingClass =
    'mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 font-[family-name:var(--font-caption)]';

  const settingsTabs = [
    {
      id: 'identity',
      label: 'Identidad',
      description: `Nombre, rubro y presentacion de tu ${visibleBusinessKind}`,
      Icon: Building2,
    },
    {
      id: 'design',
      label: 'Diseno',
      description: `Aspecto público de tu ${visibleCatalogSurface}`,
      Icon: Palette,
    },
    {
      id: 'payments',
      label: 'Pedidos',
      description: 'Envios, retiro y mensaje de WhatsApp',
      Icon: CreditCard,
    },
  ];

  const unlockSlugForEdit = () => {
    if (
      !window.confirm(
        'Cambiar el enlace del catálogo puede invalidar enlaces y QR ya compartidos. ¿Seguro que quieres editarlo?',
      )
    ) {
      return;
    }
    setSlugEditUnlocked(true);
  };

  const cancelSlugEdit = () => {
    setSlugEditUnlocked(false);
    setForm(prev => ({ ...prev, slug: business?.slug || '' }));
  };

  if (loading) {
    return <PremiumLoader fullScreen business={business} />;
  }

  if (!user) return null;

  if (isLoading) {
    return <PremiumLoader fullScreen business={business} />;
  }

  if (!business?.id) {
    return <StoreCreationStep user={user} businessLoading={false} />;
  }

  const suggestedCfg = suggestedCountryCode ? getCountryConfig(suggestedCountryCode) : null;
  const manualCfg = manualCountryCode ? getCountryConfig(manualCountryCode) : null;

  const onboardingMissingFields = location.state?.onboardingIncomplete
    ? (location.state?.missingFields ?? [])
    : [];

  // Applies a subtle amber ring to fields that are required but missing.
  const onboardingFieldStyle = (field) =>
    onboardingMissingFields.includes(field)
      ? { outline: '2px solid rgba(234,179,8,0.45)', outlineOffset: '4px', borderRadius: '10px' }
      : {};

  return (
    <DashboardAppShell backgroundColor="#f7f7f9">
      <div
        role="main"
        className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
      >
        <PanelHeader
          title={<h1 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>Configuración</h1>}
        />

        <DashboardLayoutContent
          className={
            isDirty
              ? // Reservar espacio para la barra fija inferior + safe area; ! anula lg:pb-8 del layout (evita tapar “Instalar aplicación”).
                '!pb-[calc(11rem+env(safe-area-inset-bottom,0px))] sm:!pb-[calc(7.75rem+env(safe-area-inset-bottom,0px))]'
              : ''
          }
        >
          {isLoading ? (
            <PremiumLoader business={business} />
          ) : !business?.id ? (
            <StoreCreationStep user={user} businessLoading={isLoading} />
          ) : (
          <>
            <div className="w-full min-w-0">
            <section className="mb-7">
              <div className="max-w-3xl">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 font-[family-name:var(--font-caption)]">
                  Editor comercial
                </p>
                <h2 className="text-[2rem] font-black leading-[1.05] text-slate-950 sm:text-5xl" style={{ fontFamily: 'var(--font-heading)', letterSpacing: 0 }}>
                  Configuracion de tu {visibleBusinessKind}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base" style={{ fontFamily: 'var(--font-body)' }}>
                  Personaliza cómo los clientes ven y compran en tu {visibleCatalogSurface}. Mantén la identidad clara, el pedido simple y la información pública al día.
                </p>
              </div>
            </section>

            {onboardingMissingFields.length > 0 && (
              <OnboardingIncompleteBanner missingFields={onboardingMissingFields} />
            )}
            {!hasPersistedCountry && (
              <div
                id="onboarding-field-country"
                className="rounded-xl border border-slate-100/80 p-5 lg:p-6 mb-8 shadow-sm shadow-slate-200/30"
                style={{
                  borderColor: 'rgba(124, 58, 237, 0.35)',
                  background: 'rgba(255,255,255,0.72)',
                  boxShadow: '0 12px 34px rgba(17,24,39,0.055)',
                  ...onboardingFieldStyle('country'),
                }}
              >
                <h2 className="text-base font-bold mb-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>
                  País del negocio
                </h2>
                {countryFlowMode === 'suggest' && suggestedCfg?.name && (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                      Detectamos que probablemente estás en <strong>{suggestedCfg.name}</strong>. Esto definirá formatos, moneda y opciones de pago.
                    </p>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <button
                        type="button"
                        disabled={countryGuards.loading}
                        onClick={() => handleCountrySelection(suggestedCountryCode)}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                        style={{
                          background: '#111827',
                          fontFamily: 'var(--font-caption)',
                          boxShadow: '0 10px 24px rgba(17,24,39,0.16)',
                        }}
                      >
                        Usar {suggestedCfg.name}
                      </button>
                      <button
                        type="button"
                        disabled={countryGuards.loading}
                        onClick={() => {
                          setCountryFlowMode('manual');
                          setManualCountryCode('');
                        }}
                        className="text-sm font-medium underline-offset-2 hover:underline disabled:opacity-50"
                        style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
                      >
                        Elegir otro país
                      </button>
                    </div>
                  </div>
                )}
                {(countryFlowMode === 'manual' || !suggestedCfg?.name) && (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                      {!suggestedCfg?.name
                        ? 'Elige el país de tu negocio. Esto definirá formatos, moneda y opciones de pago.'
                        : 'Selecciona el país que corresponda a tu negocio.'}
                    </p>
                    <CountryIsoSelect
                      value={manualCountryCode || uxCountry || ''}
                      onChange={(code) => {
                        setManualCountryCode(code || '');
                        handleCountrySelection(code || '');
                      }}
                      disabled={countryGuards.loading}
                      className={inputClass}
                      style={{ ...inputStyle, cursor: countryGuards.loading ? 'not-allowed' : 'pointer' }}
                    />
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {manualCfg?.name && (
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>
                          País elegido: <strong>{manualCfg.name}</strong>
                        </p>
                      )}
                      {suggestedCfg?.name && (
                        <button
                          type="button"
                          disabled={countryGuards.loading}
                          onClick={() => {
                            setCountryFlowMode('suggest');
                            setManualCountryCode('');
                          }}
                          className="text-sm font-medium underline-offset-2 hover:underline disabled:opacity-50"
                          style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}
                        >
                          Volver a la sugerencia
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {hasPersistedCountry && (
              <BusinessConfigContextBanner
                countryCode={businessCountry}
                currencyLabel={business?.currency || countryLabels.currency}
              />
            )}

            {hasPersistedCountry && (
              <div className={`${cardClass} mb-8`}>
                <p className={sectionHeadingClass}>País del negocio</p>
                <SettingsField
                  label="País"
                  hint="El cambio queda en borrador hasta que guardes con Guardar cambios."
                >
                  <CountryIsoSelect
                    value={uxCountry ?? businessCountry ?? ''}
                    onChange={(code) => handleCountrySelection(code || '')}
                    disabled={countryGuards.loading || isCountryLocked}
                    className={inputClass}
                    style={{
                      ...inputStyle,
                      cursor: countryGuards.loading || isCountryLocked ? 'not-allowed' : 'pointer',
                    }}
                  />
                  {isCountryLocked && (
                    <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                      El país no se puede cambiar porque tu negocio ya tiene país definido y hay suscripción activa, pedidos registrados o el período de prueba ya comenzó. Si necesitas otro mercado, contacta a soporte.
                    </p>
                  )}
                  {hasUnsavedCountryChange && !isCountryLocked && (
                    <button
                      type="button"
                      onClick={() => setUxCountry(businessCountry)}
                      className="mt-2 text-sm font-medium underline-offset-2 hover:underline"
                      style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
                    >
                      Restore
                    </button>
                  )}
                </SettingsField>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
              <div
                className="sticky top-20 z-[1] rounded-2xl border border-white/70 bg-white/46 p-2"
              >
            <div
              className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0"
              role="tablist"
              aria-label="Secciones de configuración"
            >
              {settingsTabs.map((tab) => {
                const active = settingsTab === tab.id;
                const TabIcon = tab.Icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSettingsTab(tab.id)}
                    className={[
                      'group flex min-w-[10.5rem] items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all lg:min-w-0',
                      'font-[family-name:var(--font-caption)]',
                      active
                        ? 'bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]'
                        : 'text-slate-600 hover:bg-white/75 hover:text-slate-950',
                    ].join(' ')}
                  >
                    <TabIcon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    <span className="min-w-0">
                      <span className="block leading-tight">{tab.label}</span>
                      <span className={['mt-1 hidden text-[11px] font-normal leading-snug lg:block', active ? 'text-slate-300' : 'text-slate-500'].join(' ')}>
                        {tab.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
              </div>

              <div className="min-w-0">
            {settingsTab === 'identity' && (
            <div className={`${cardClass} mb-8`}>
              <div className="mb-6 max-w-2xl">
                <p className={sectionHeadingClass}>Identidad</p>
                <h2 className="text-2xl font-black leading-tight text-slate-950" style={{ fontFamily: 'var(--font-heading)', letterSpacing: 0 }}>La presencia pública de tu {visibleBusinessKind}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600" style={{ fontFamily: 'var(--font-body)' }}>
                  Estos datos construyen la primera impresión de tu {visibleCatalogSurface}: nombre, rubro, descripción y canales de contacto.
                </p>
              </div>
              <div className="hidden">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}
                >
                  <Icon name="Building2" size={18} color="var(--color-primary)" />
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Datos de tu {visibleBusinessKind}</h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Visible en tu catálogo público</p>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div>
                  <p className={sectionHeadingClass}>Identidad operativa</p>
                  <div className="flex flex-col gap-5">
                    <div id="onboarding-field-name" style={onboardingFieldStyle('name')}>
                      <SettingsField label="Nombre del negocio" hint="Nombre que verán tus clientes en el catálogo">
                        <input
                          type="text"
                          className={inputClass}
                          style={inputStyle}
                          placeholder="Ej: Mi Tienda"
                          value={form?.name}
                          onChange={e => handleFormChange('name', e?.target?.value)}
                        />
                      </SettingsField>
                    </div>

                    <SettingsField
                      label="Enlace del catálogo (slug)"
                      hint="Solo lectura por defecto: cambiarlo puede romper enlaces ya compartidos."
                    >
                      {!slugEditUnlocked ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <div
                            className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50/80 text-sm text-slate-700 font-mono"
                            style={{ fontFamily: 'var(--font-caption)' }}
                          >
                            <span className="text-slate-400 flex-shrink-0 select-none">/c/</span>
                            <span className="truncate">{business?.slug || form?.slug || '—'}</span>
                            <Icon name="Lock" size={14} className="flex-shrink-0 text-slate-400 ml-auto" aria-hidden />
                          </div>
                          <button
                            type="button"
                            onClick={unlockSlugForEdit}
                            className="text-sm font-medium text-violet-700 hover:text-violet-800 px-2 py-1.5 rounded-lg font-[family-name:var(--font-caption)]"
                          >
                            Editar enlace
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs flex-shrink-0 text-slate-500 font-[family-name:var(--font-caption)]">/c/</span>
                            <input
                              type="text"
                              className={`${inputClass} flex-1 min-w-0`}
                              style={inputStyle}
                              placeholder="mi-tienda"
                              value={form?.slug}
                              onChange={e => handleFormChange('slug', (e?.target?.value || '').replace(/\s+/g, '-').toLowerCase())}
                              autoComplete="off"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={cancelSlugEdit}
                            className="self-start text-xs font-medium text-slate-600 hover:text-slate-800 font-[family-name:var(--font-caption)]"
                          >
                            Cancelar edición del enlace
                          </button>
                        </div>
                      )}
                    </SettingsField>

                    <div id="field-rubro-principal">
                      <SettingsField label="Rubro principal" hint="Sector de tu negocio; filtra categorías sugeridas de productos.">
                        <RubroPrincipalSelector
                          rubros={rubros}
                          value={form?.rubroId ?? ''}
                          onChange={handleRubroChange}
                          hasError={!!rubroError}
                        />
                        {rubroError && (
                          <p className="mt-1.5 text-xs font-medium" style={{ color: 'var(--color-error, #ef4444)', fontFamily: 'var(--font-caption)' }}>
                            {rubroError}
                          </p>
                        )}
                      </SettingsField>
                    </div>

                    {/* ── Tipo de negocio ──────────────────────────────────── */}
                    <SettingsField
                      label="Tipo de negocio"
                      hint="Walinka adaptará la experiencia pública según lo que vendes."
                    >
                      <div className="rounded-2xl border border-slate-200/70 bg-slate-50/55 p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          {
                            value: BUSINESS_MODES.STORE,
                            label: 'Tienda / productos',
                            description: 'Ideal para catálogos, productos físicos, servicios o ventas generales.',
                            icon: 'ShoppingBag',
                          },
                          {
                            value: BUSINESS_MODES.RESTAURANT,
                            label: 'Restaurante / comida',
                            description: 'Ideal para menús, combos, delivery y pedidos rápidos por WhatsApp.',
                            icon: 'UtensilsCrossed',
                          },
                        ].map((opt) => {
                          const selected = (form?.businessMode || BUSINESS_MODES.STORE) === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => handleFormChange('businessMode', opt.value)}
                              className="text-left rounded-xl border p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white"
                              style={{
                                borderColor: selected ? '#111827' : 'rgba(226,232,240,0.9)',
                                backgroundColor: selected ? '#ffffff' : 'rgba(255,255,255,0.58)',
                                boxShadow: selected ? '0 10px 24px rgba(17,24,39,0.08)' : 'none',
                              }}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <Icon
                                  name={opt.icon}
                                  size={16}
                                  color={selected ? '#111827' : 'var(--color-muted-foreground)'}
                                />
                                <span
                                  className="text-sm font-semibold"
                                  style={{
                                    fontFamily: 'var(--font-heading)',
                                    color: selected ? '#111827' : 'var(--color-foreground)',
                                  }}
                                >
                                  {opt.label}
                                </span>
                              </div>
                              <p
                                className="text-xs leading-relaxed"
                                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                              >
                                {opt.description}
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      </div>

                      {/* Aviso de recomendación según rubro */}
                      {currentRubro && recommendedBusinessMode !== (form?.businessMode || BUSINESS_MODES.STORE) && (
                        <div
                          className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl px-4 py-3"
                          style={{ backgroundColor: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)' }}
                        >
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <Icon name="Lightbulb" size={15} color="#B45309" className="mt-0.5 shrink-0" />
                            <p
                              className="text-xs leading-relaxed"
                              style={{ color: '#92400E', fontFamily: 'var(--font-caption)' }}
                            >
                              {recommendedBusinessMode === BUSINESS_MODES.RESTAURANT
                                ? `Tu rubro principal (${currentRubro.name}) parece gastronómico. Para aprovechar mejor Walinka, recomendamos usar "Restaurante / comida".`
                                : `Tu rubro principal (${currentRubro.name}) no parece gastronómico. Para este rubro recomendamos "Tienda / productos". Usa "Restaurante / comida" solo si vendes menús, combos o pedidos gastronómicos.`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFormChange('businessMode', recommendedBusinessMode)}
                            className="shrink-0 self-start sm:self-center text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:opacity-90"
                            style={{ backgroundColor: '#B45309', color: '#ffffff', fontFamily: 'var(--font-caption)' }}
                          >
                            Usar recomendado
                          </button>
                        </div>
                      )}
                    </SettingsField>

                    {business?.id && (
                      <div className="border-t border-slate-200/70 pt-6">
                        <div className="mb-4 flex items-start gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'rgba(15,23,42,0.06)' }}>
                            <Icon name="Tags" size={18} color="var(--color-primary)" />
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 font-[family-name:var(--font-caption)]">
                              Organización del catálogo
                            </p>
                            <h2 className="mt-1 text-lg font-black text-slate-950" style={{ fontFamily: 'var(--font-heading)', letterSpacing: 0 }}>
                              Categorías de productos
                            </h2>
                            <p className="mt-1 text-sm leading-6" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-body)' }}>
                              Agrupa productos como una vitrina: colecciones, líneas, momentos de compra o secciones del menú.
                            </p>
                          </div>
                        </div>

                        {/* Toggle: mostrar categorías en el catálogo público */}
                        <label
                          className="flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all mb-4"
                          style={{
                            borderColor: design?.useCategories ? 'rgba(15,23,42,0.22)' : 'rgba(15,23,42,0.08)',
                            backgroundColor: design?.useCategories ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.58)',
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: design?.useCategories ? 'rgba(15,23,42,0.10)' : '#f0f0f8' }}>
                              <Icon name="LayoutList" size={14} color={design?.useCategories ? 'var(--color-primary)' : '#a0a0b8'} />
                            </div>
                            <div>
                              <span className="text-sm font-medium block" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>
                                Mostrar categorías en el catálogo
                              </span>
                              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                                Activa filtros de navegación en tu tienda pública
                              </span>
                            </div>
                          </div>
                          <div
                            className="relative flex-shrink-0 transition-all cursor-pointer"
                            style={{ width: '40px', height: '22px', borderRadius: '11px', backgroundColor: design?.useCategories ? 'var(--color-primary)' : '#d1d5db' }}
                            onClick={(e) => { e.preventDefault(); setDesign(prev => ({ ...prev, useCategories: !prev.useCategories })); }}
                          >
                            <div className="absolute top-0.5 rounded-full bg-white transition-all" style={{ width: '18px', height: '18px', left: design?.useCategories ? '20px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                          </div>
                        </label>

                        <BusinessCategoriesManager business={business} />
                      </div>
                    )}

                    <SettingsField
                      label="Presentación pública"
                      hint="Una bio breve para explicar qué vendes, qué te hace distinto y por qué conviene pedirte. Máximo 280 caracteres."
                    >
                      <div className="relative rounded-2xl border border-slate-200/70 bg-slate-50/45 p-3">
                        {canUseAiDescription && (
                          <button
                            type="button"
                            onClick={handleImproveBusinessDescription}
                            disabled={isImprovingBusinessDescription}
                            className="absolute top-2 right-2 z-[1] inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50 bg-violet-100/95 text-violet-800 border border-violet-200/80 shadow-sm font-[family-name:var(--font-caption)]"
                            aria-label="Mejorar descripción orientada a ventas"
                          >
                            {isImprovingBusinessDescription ? (
                              <span
                                className="w-3 h-3 border-2 border-violet-600 border-t-transparent rounded-full animate-spin flex-shrink-0"
                                aria-hidden
                              />
                            ) : (
                              <Sparkles className="w-3 h-3 text-violet-700 shrink-0" strokeWidth={2} aria-hidden />
                            )}
                            Mejorar con IA
                          </button>
                        )}
                        <textarea
                          rows={4}
                          maxLength={BUSINESS_DESCRIPTION_MAX}
                          className={`${inputClass} min-h-[112px] border-white/90 bg-white pr-[9.5rem] pt-2.5 leading-relaxed`}
                          style={inputStyle}
                          placeholder="Ej: Tienda de ropa y accesorios para toda la familia..."
                          value={form?.description}
                          onChange={e => handleFormChange('description', e?.target?.value)}
                        />
                        <p className="text-right text-[11px] text-slate-400 tabular-nums mt-1.5 font-[family-name:var(--font-caption)]">
                          {(form?.description ?? '').length}/{BUSINESS_DESCRIPTION_MAX}
                        </p>
                      </div>
                    </SettingsField>

                    <SettingsField
                      label="Leyenda del ticket (opcional)"
                      hint="Se imprime al final del ticket. Ideal para 2 o 3 líneas cortas."
                    >
                      <div className="relative">
                        <textarea
                          rows={3}
                          maxLength={PRINT_LEGEND_MAX}
                          className={inputClass}
                          style={{ ...inputStyle, whiteSpace: 'pre-wrap' }}
                          placeholder="Gracias por tu pedido 🙌"
                          value={form?.printLegend ?? ''}
                          onChange={e => handleFormChange('printLegend', e?.target?.value)}
                        />
                        <p className="text-right text-[11px] text-slate-400 tabular-nums mt-1.5 font-[family-name:var(--font-caption)]">
                          {(form?.printLegend ?? '').length}/{PRINT_LEGEND_MAX}
                        </p>
                      </div>
                    </SettingsField>

                    <SettingsField
                      label="Nombre del documento comercial"
                      hint="Elige cómo quieres que se muestre este documento a tus clientes."
                    >
                      <div className="flex gap-2">
                        {[
                          { value: 'cotizacion', label: 'Cotización' },
                          { value: 'presupuesto', label: 'Presupuesto' },
                        ].map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleFormChange('documentTitleType', opt.value)}
                            className={[
                              'flex-1 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all',
                              (form?.documentTitleType || 'cotizacion') === opt.value
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300',
                            ].join(' ')}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </SettingsField>

                    <SettingsField label="Correo electrónico" hint="Contacto del negocio (opcional)">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2">
                          <Icon name="Mail" size={16} color="var(--color-text-tertiary)" />
                        </span>
                        <input
                          type="email"
                          className={inputClass}
                          style={{ ...inputStyle, paddingLeft: '2.25rem' }}
                          placeholder="contacto@minegocio.com"
                          value={form?.email}
                          onChange={e => handleFormChange('email', e?.target?.value)}
                        />
                      </div>
                    </SettingsField>
                  </div>
                </div>

                <div>
                  <p className={sectionHeadingClass}>Redes sociales</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                    Aparecen en tu catálogo público como iconos de enlace. Puedes escribir solo el usuario (@minegocio) o la URL completa.
                  </p>
                  <div className="space-y-3">
                    {[
                      {
                        label: 'Instagram',
                        field: 'instagramUrl',
                        placeholder: '@minegocio o URL completa',
                        icon: (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-text-tertiary)">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                          </svg>
                        ),
                      },
                      {
                        label: 'TikTok',
                        field: 'tiktokUrl',
                        placeholder: '@minegocio o URL completa',
                        icon: (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-text-tertiary)">
                            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
                          </svg>
                        ),
                      },
                      {
                        label: 'Facebook',
                        field: 'facebookUrl',
                        placeholder: '@minegocio o URL completa',
                        icon: (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-text-tertiary)">
                            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                          </svg>
                        ),
                      },
                    ].map(({ label, field, placeholder, icon }) => (
                      <SettingsField key={field} label={label} hint="Opcional">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                            {icon}
                          </span>
                          <input
                            type="text"
                            className={inputClass}
                            style={{ ...inputStyle, paddingLeft: '2.25rem' }}
                            placeholder={placeholder}
                            value={form?.[field]}
                            onChange={e => handleFormChange(field, e?.target?.value)}
                          />
                        </div>
                      </SettingsField>
                    ))}
                  </div>
                </div>

                <div id="onboarding-field-whatsapp" style={onboardingFieldStyle('whatsapp')}>
                  <p className={sectionHeadingClass}>Canal de ventas (WhatsApp)</p>
                  <DynamicWhatsAppField
                    label="Número de WhatsApp"
                    hint={
                      hasPersistedCountry
                        ? `${countryLabels.whatsappHint ?? ''} Prefijo fijado según tu país.`
                        : undefined
                    }
                    countryCode={hasPersistedCountry ? uiCountryCode : null}
                    editableCountry={false}
                    persistCountrySelection={false}
                    value={form?.whatsapp}
                    onChange={(v) => handleFormChange('whatsapp', v)}
                  />
                </div>

                <div>
                  <p className={sectionHeadingClass}>Ubicación simplificada</p>
                  <SettingsField
                    label="Dirección completa"
                    hint="Incluye tu dirección y ciudad para que tus clientes te encuentren fácilmente. Un solo campo: calle, ciudad y referencias de ubicación."
                  >
                    <textarea
                      rows={3}
                      className={inputClass}
                      style={inputStyle}
                      placeholder="Ej: Calle 123, Ciudad"
                      value={fullAddressInput}
                      onChange={e => setFullAddressInput(e?.target?.value ?? '')}
                    />
                  </SettingsField>
                </div>

                <div className="mt-2 pt-6 border-t border-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Información de tienda</p>
                  <p className="text-xs mb-4" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                    Horario y si mostrar tu dirección en el catálogo (la dirección la cargás arriba).
                  </p>
                  <div className="flex flex-col gap-4">
                    <SettingsField label="Horario de atención" hint="Ej: Lun–Vie 9:00–18:00, Sáb 10:00–14:00">
                      <textarea
                        rows={2}
                        className={inputClass}
                        style={inputStyle}
                        placeholder="Opcional"
                        value={design?.businessHours ?? ''}
                        onChange={e => setDesign(prev => ({ ...prev, businessHours: e?.target?.value ?? '' }))}
                      />
                    </SettingsField>
                    <SettingsField
                      label="Texto del pie de página del catálogo"
                      hint="Mensaje breve que se muestra al final del catálogo público. Si lo dejas vacío, se usa el texto automático."
                    >
                      <textarea
                        rows={3}
                        className={inputClass}
                        style={{ ...inputStyle, whiteSpace: 'pre-wrap' }}
                        placeholder="Productos naturales de campo, elaborados con dedicación y pensados para llevar sabor auténtico a tu mesa. Consulta disponibilidad y pedidos por WhatsApp."
                        value={design?.footerText ?? ''}
                        onChange={e => setDesign(prev => ({ ...prev, footerText: e?.target?.value ?? '' }))}
                      />
                    </SettingsField>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 font-[family-name:var(--font-caption)]">
                          Mostrar dirección en el catálogo
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">Si está activado, se muestra la dirección y un enlace al mapa</p>
                      </div>
                      <SettingsSwitch
                        checked={design?.showAddress === true}
                        onCheckedChange={(v) => setDesign(prev => ({ ...prev, showAddress: v }))}
                        label="Mostrar dirección en el catálogo"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}

            {settingsTab === 'design' && (
              <div className="mb-8">
                <DesignSettings />
              </div>
            )}

            {settingsTab === 'payments' && business?.id && (
              <div className={`${cardClass} mb-8`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
                    <Icon name="Truck" size={18} color="var(--color-primary)" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Pagos y envíos</h2>
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Envíos, retiro y plantilla de pedido</p>
                  </div>
                </div>

                <div className="flex flex-col gap-5 mb-8 pb-8 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Envío y retiro</p>
                  <SettingsField label="Métodos de envío" hint="Ej: Correo, mensajería, envío a domicilio">
                    <input
                      type="text"
                      className={inputClass}
                      style={inputStyle}
                      placeholder="Opcional"
                      value={design?.shippingMethods ?? ''}
                      onChange={e => setDesign(prev => ({ ...prev, shippingMethods: e?.target?.value ?? '' }))}
                    />
                  </SettingsField>
                  <SettingsField label="Costo de envío" hint="Ej: Desde $X según zona, o gratis sobre $Y">
                    <input
                      type="text"
                      className={inputClass}
                      style={inputStyle}
                      placeholder="Opcional"
                      value={design?.shippingCost ?? ''}
                      onChange={e => setDesign(prev => ({ ...prev, shippingCost: e?.target?.value ?? '' }))}
                    />
                  </SettingsField>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 font-[family-name:var(--font-caption)]">Retiro en tienda</p>
                      <p className="text-xs text-slate-500 mt-0.5">Mostrar en el catálogo que se puede retirar en tu local</p>
                    </div>
                    <SettingsSwitch
                      checked={design?.retiroEnTienda === true}
                      onCheckedChange={(v) => setDesign(prev => ({ ...prev, retiroEnTienda: v }))}
                      label="Ofrecer retiro en tienda"
                    />
                  </div>
                </div>

                <WhatsAppMessageTemplate
                  value={orderMessageTemplate}
                  onChange={setOrderMessageTemplate}
                  isSaving={isSaving}
                  onSave={handleSaveSettings}
                />

              </div>
            )}

              </div>
            </div>

            {/* Dominio propio */}
            <div className="rounded-xl border border-slate-100/80 p-5 lg:p-6 mb-6 shadow-sm"
              style={{ background: 'rgba(255,255,255,0.72)', boxShadow: '0 12px 34px rgba(17,24,39,0.04)' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                  <Icon name="Globe" size={18} color="#7c3aed" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900" style={{ fontFamily: 'var(--font-heading)' }}>
                    Dominio propio
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Conecta tu catálogo a un dominio personalizado</p>
                </div>
              </div>
              <CustomDomainSettings />
            </div>

            <InstallAppBlock />
            </div>
          </>
          )}
        </DashboardLayoutContent>
      </div>

      {isDirty && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[60] border-t border-slate-200/70 bg-white/80 backdrop-blur-md px-4 sm:px-5 md:px-6 lg:px-8 py-3.5 shadow-[0_-8px_32px_rgba(15,23,42,0.07)]"
          style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom, 0px))' }}
          role="region"
          aria-label="Acciones de guardado"
        >
          <div className="max-w-7xl mx-auto w-full flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-3">
            {hasUnsavedCountryChange && (
              <button
                type="button"
                onClick={() => setUxCountry(businessCountry)}
                disabled={isSaving}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors font-[family-name:var(--font-caption)]"
              >
                Restore
              </button>
            )}
            <button
              type="button"
              onClick={discardConfigChanges}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors font-[family-name:var(--font-caption)]"
            >
              Descartar cambios
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition-colors hover:bg-slate-800 disabled:opacity-60 font-[family-name:var(--font-caption)]"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Guardando…
                </>
              ) : (
                <>
                  <Icon name="Save" size={16} color="#fff" aria-hidden />
                  Guardar cambios
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      )}
    </DashboardAppShell>
  );
}
