import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PanelHeader from 'components/ui/PanelHeader';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { updateBusiness, getMyBusiness, getRubros, getEffectivePlanSlug } from '../../services/waBusinessService';
import { supabase } from '../../lib/supabase';
import StoreCreationStep from '../business-registration/components/StoreCreationStep';
import WhatsAppMessageTemplate from './components/WhatsAppMessageTemplate';
import DynamicWhatsAppField from 'components/DynamicWhatsAppField';
import { getCountryLabels, getCountryCode } from '../../config/country';
import InstallAppBlock from './components/InstallAppBlock';
import SettingsSwitch from './components/SettingsSwitch';
import { Building2, CreditCard, Sparkles } from 'lucide-react';
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

const BUSINESS_DESCRIPTION_MAX = 280;

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
    shippingMethods: dsSnap?.shippingMethods ?? '',
    shippingCost: dsSnap?.shippingCost ?? '',
    retiroEnTienda: dsSnap?.retiroEnTienda === true,
  };
  return JSON.stringify({
    form: {
      name: business?.name || '',
      slug: business?.slug || '',
      description: business?.description || '',
      whatsapp: business?.whatsapp || '',
      email: business?.email || '',
      address: business?.address || '',
      city: business?.city || '',
      region: business?.region || '',
      country: labels.countryName,
      currency: business?.currency || labels.currency,
      rubroId: business?.rubroId || '',
    },
    design: designSnap,
    bankForm: {
      bankName: business?.bankName || '',
      bankAccountType: business?.bankAccountType || '',
      bankAccountNumber: business?.bankAccountNumber || '',
      bankAccountHolder: business?.bankAccountHolder || '',
      bankRut: business?.bankRut || '',
      bankEmail: business?.bankEmail || '',
    },
    orderMessageTemplate: business?.orderMessageTemplate || '',
    fullAddressInput: buildFullAddressLine({
      address: business?.address,
      city: business?.city,
      region: business?.region,
    }),
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
      <label className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</p>}
    </div>
  );
}

export default function BusinessConfiguration() {
  const navigate = useNavigate();
  const { user, loading, business: ctxBusiness, businessLoading, refreshBusiness } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [orderMessageTemplate, setOrderMessageTemplate] = useState('');
  const [business, setBusiness] = useState(null);
  const [businessFetchLoading, setBusinessFetchLoading] = useState(false);
  /** País ISO persistido (sincronizado con BD). */
  const [selectedCountryCode, setSelectedCountryCode] = useState(null);
  /** Sin país en BD: `suggest` (bloque sugerido) o `manual` (selector explícito). */
  const [countryFlowMode, setCountryFlowMode] = useState('suggest');
  const [manualCountryCode, setManualCountryCode] = useState('');
  const [isConfirmingCountry, setIsConfirmingCountry] = useState(false);

  const suggestedCountryCode = useMemo(() => suggestCountryCodeHint({ user }), [user]);

  /** Solo BD `country_code` — no usar `countryCode` inferido por moneda. */
  const persistedCountryCode =
    business?.countryCodeDb != null && String(business.countryCodeDb).trim() !== ''
      ? String(business.countryCodeDb).trim().toUpperCase()
      : null;
  /** Solo con `country_code` en BD (`countryCodeDb`): UI con etiquetas/prefijos; si no, neutro (sin fallback). */
  const hasPersistedCountry = persistedCountryCode != null;
  const uiCountryCode = hasPersistedCountry ? (selectedCountryCode ?? persistedCountryCode) : null;
  const countryLabels = getCountryLabels(uiCountryCode);
  const countryChangePolicy = business ? evaluateBusinessCountryChangePolicy(business) : { allowed: false };
  const countryStatePreview = resolveCountryState({
    businessCountryCode: business,
    onboardingCountryCode: null,
    userCountryCode: user?.user_metadata?.country_code ?? user?.user_metadata?.country ?? null,
    hostnameSuggestionCountryCode: null,
  });
  const billingPreview = resolveBillingSetup(countryStatePreview);
  const [bankForm, setBankForm] = useState({
    bankName: '',
    bankAccountType: '',
    bankAccountNumber: '',
    bankAccountHolder: '',
    bankRut: '',
    bankEmail: '',
  });

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    whatsapp: '',
    email: '',
    address: '',
    city: '',
    region: '',
    country: countryLabels.countryName,
    currency: countryLabels.currency,
    rubroId: '',
  });
  const [rubros, setRubros] = useState([]);
  const [fullAddressInput, setFullAddressInput] = useState('');
  const [slugEditUnlocked, setSlugEditUnlocked] = useState(false);
  const [settingsTab, setSettingsTab] = useState('identity');

  useEffect(() => {
    setSettingsTab((t) => (t === 'design' ? 'identity' : t));
  }, []);
  const [isImprovingBusinessDescription, setIsImprovingBusinessDescription] = useState(false);

  const effectivePlan = getEffectivePlanSlug(business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt);
  const canUseAiDescription = effectivePlan === 'pro' || effectivePlan === 'business';

  // Design settings state (valores por defecto; se rellenan desde business.designSettings al cargar)
  const [design, setDesign] = useState({
    theme: 'minimal',
    primaryColor: '#7C3AED',
    font: 'Inter',
    logoUrl: '',
    headerImageUrl: '',
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
        bankForm,
        orderMessageTemplate,
        fullAddressInput,
      }),
    [form, design, bankForm, orderMessageTemplate, fullAddressInput],
  );

  const isDirty = Boolean(business?.id && savedConfigSnapshot && currentConfigSnapshot !== savedConfigSnapshot);

  useEffect(() => {
    console.log('[VTLK_ROUTE] Renderizando: ' + (typeof window !== 'undefined' ? window.location.pathname : ''));
  }, []);

  useEffect(() => {
    if (!business?.id) return;
    const code =
      business.countryCodeDb != null && String(business.countryCodeDb).trim() !== ''
        ? String(business.countryCodeDb).trim().toUpperCase()
        : null;
    setSelectedCountryCode(code);
  }, [business?.id, business?.countryCodeDb]);

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
      selectedCountryCode,
      uiCountryCode,
      neutralNoCountry: !persistedCountryCode,
      billingCountry: countryStatePreview.billingCountry,
      billingProvider: billingPreview.billingProvider,
      billingCurrency: billingPreview.currency,
      policyAllowed: countryChangePolicy.allowed,
    });
  }, [
    persistedCountryCode,
    selectedCountryCode,
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
        whatsapp: business?.whatsapp || '',
        email: business?.email || '',
        address: business?.address || '',
        city: business?.city || '',
        region: business?.region || '',
        country: countryLabels.countryName,
        currency: business?.currency || countryLabels.currency,
        rubroId: business?.rubroId || '',
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
          shippingMethods: ds?.shippingMethods ?? '',
          shippingCost: ds?.shippingCost ?? '',
          retiroEnTienda: ds?.retiroEnTienda === true,
        }));
      }
      setOrderMessageTemplate(business?.orderMessageTemplate || '');
      setBankForm({
        bankName: business?.bankName || '',
        bankAccountType: business?.bankAccountType || '',
        bankAccountNumber: business?.bankAccountNumber || '',
        bankAccountHolder: business?.bankAccountHolder || '',
        bankRut: business?.bankRut || '',
        bankEmail: business?.bankEmail || '',
      });
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
      const endpoint = `${supabaseUrl}/functions/v1/improve-product-description`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({
          text: truncateAtWordBoundary(rawDesc, BUSINESS_DESCRIPTION_MAX),
          productName: storeName,
          maxDescriptionLength: BUSINESS_DESCRIPTION_MAX,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error ?? 'No se pudo mejorar la descripción. Intenta de nuevo.', 'error');
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
      showToast('Descripción actualizada. Revisa y guarda si te convence.', 'success');
    } catch (e) {
      console.error('[BusinessConfiguration] Mejorar descripción:', e);
      showToast('Error de conexión. Intenta de nuevo.', 'error');
    } finally {
      setIsImprovingBusinessDescription(false);
    }
  };

  const handleConfirmCountry = async (isoCode) => {
    const raw = String(isoCode || '').trim().toUpperCase();
    if (!raw || !COUNTRY_CODES.includes(raw)) {
      showToast('Selecciona un país válido.', 'error');
      return;
    }
    const bizId = business?.id;
    if (!bizId) {
      showToast('No se encontró el negocio. Intenta recargar la página.', 'error');
      return;
    }
    if (persistedCountryCode) {
      showToast('El país del negocio ya está fijado.', 'error');
      return;
    }

    setIsConfirmingCountry(true);
    try {
      const nextDesign = { ...design };
      nextDesign.showCatalogCurrencySymbol = false;

      const cfg = getCountryConfig(raw);
      const payload = {
        countryCode: raw,
        designSettings: nextDesign,
      };
      if (typeof window !== 'undefined') {
        console.log('[VTLK_COUNTRY_SAVE]', {
          countryCode: raw,
          country: cfg?.name ?? raw,
          currency: cfg?.currency ?? 'USD',
          payload,
        });
      }

      const { data: updated, error } = await updateBusiness(bizId, payload);
      if (error) {
        showToast('Error al guardar el país: ' + (error?.message || JSON.stringify(error)), 'error');
        return;
      }
      await refreshBusiness();
      if (updated) setBusiness(updated);
      setSelectedCountryCode(raw);
      showToast('País del negocio guardado.', 'success');
    } catch (e) {
      console.error('[BusinessConfig] handleConfirmCountry', e);
      showToast('Error inesperado al confirmar el país.', 'error');
    } finally {
      setIsConfirmingCountry(false);
    }
  };

  const handleSaveSettings = async () => {
    const bizId = business?.id;
    if (!bizId) {
      showToast('No se encontró el negocio. Intenta recargar la página.', 'error');
      return;
    }
    setIsSaving(true);

    const parsedAddr = parseAddressByCountry(fullAddressInput, persistedCountryCode);
    const slugClean = (s) => (String(s || '').trim() || '').replace(/\s+/g, '-').toLowerCase();
    const nextSlug = slugEditUnlocked
      ? slugClean(form?.slug) || slugClean(business?.slug)
      : (business?.slug || '');

    const payload = {
      name: form?.name?.trim() || business?.name,
      slug: nextSlug || business?.slug,
      description: form?.description,
      whatsapp: form?.whatsapp,
      email: form?.email,
      address: parsedAddr.address,
      city: parsedAddr.city,
      region: parsedAddr.region,
      rubroId: form?.rubroId || null,
      logoUrl: (design?.logoUrl ?? business?.logoUrl ?? '').trim() || null,
      coverImageUrl: (
        design?.coverImageUrl ??
        design?.headerImageUrl ??
        business?.coverImageUrl ??
        ''
      ).trim() || null,
      designSettings: design,
      orderMessageTemplate,
      bankName: bankForm?.bankName,
      bankAccountType: bankForm?.bankAccountType,
      bankAccountNumber: bankForm?.bankAccountNumber,
      bankAccountHolder: bankForm?.bankAccountHolder,
      bankRut: bankForm?.bankRut,
      bankEmail: bankForm?.bankEmail,
    };

    try {
      const { data: updated, error } = await updateBusiness(bizId, payload);
      if (error) {
        showToast('Error al guardar: ' + (error?.message || JSON.stringify(error)), 'error');
        return;
      }
      if (updated) setBusiness(updated);
      await refreshBusiness();
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
          design,
          bankForm,
          orderMessageTemplate,
          fullAddressInput: buildFullAddressLine(parsedAddr),
        }),
      );
      showToast('¡Configuración guardada!', 'success');
    } catch (e) {
      console.error('[BusinessConfig] handleSaveSettings exception:', e);
      showToast('Error inesperado: ' + (e?.message || 'Intenta de nuevo'), 'error');
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
    setSelectedCountryCode(code);
    const revertedLabels = getCountryLabels(code);
    setForm({
      name: business?.name || '',
      slug: business?.slug || '',
      description: business?.description || '',
      whatsapp: business?.whatsapp || '',
      email: business?.email || '',
      address: business?.address || '',
      city: business?.city || '',
      region: business?.region || '',
      country: revertedLabels.countryName,
      currency: business?.currency || revertedLabels.currency,
      rubroId: business?.rubroId || '',
    });
    setOrderMessageTemplate(business?.orderMessageTemplate || '');
    setBankForm({
      bankName: business?.bankName || '',
      bankAccountType: business?.bankAccountType || '',
      bankAccountNumber: business?.bankAccountNumber || '',
      bankAccountHolder: business?.bankAccountHolder || '',
      bankRut: business?.bankRut || '',
      bankEmail: business?.bankEmail || '',
    });
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
        shippingMethods: ds?.shippingMethods ?? '',
        shippingCost: ds?.shippingCost ?? '',
        retiroEnTienda: ds?.retiroEnTienda === true,
      }));
    }
    setSavedConfigSnapshot(buildSavedConfigSnapshotFromBusiness(business));
  }, [business]);

  const isLoading = businessLoading || businessFetchLoading;

  const inputClass = [
    'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900',
    'outline-none transition-all font-[family-name:var(--font-caption)]',
    'focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500',
  ].join(' ');
  const inputStyle = {
    fontFamily: 'var(--font-caption)',
  };

  const cardClass =
    'rounded-xl bg-white p-6 sm:p-7 shadow-sm shadow-slate-200/40 border border-slate-100/70';

  const sectionHeadingClass =
    'text-[11px] font-semibold uppercase tracking-wide text-slate-500 font-[family-name:var(--font-caption)] mb-3';

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
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <svg className="animate-spin" width={32} height={32} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin" width={32} height={32} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Verificando tu negocio...
          </p>
        </div>
      </div>
    );
  }

  if (!business?.id) {
    return <StoreCreationStep user={user} businessLoading={false} />;
  }

  const suggestedCfg = suggestedCountryCode ? getCountryConfig(suggestedCountryCode) : null;
  const manualCfg = manualCountryCode ? getCountryConfig(manualCountryCode) : null;

  return (
    <DashboardAppShell backgroundColor="#f7f7f9">
      <div
        role="main"
        className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden"
      >
        <PanelHeader
          title={<h1 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>Configuración</h1>}
        />

        <DashboardLayoutContent className={isDirty ? 'pb-28 md:pb-32' : ''}>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(139,92,246,0.2)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="ml-3 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Cargando...</span>
            </div>
          ) : !business?.id ? (
            <StoreCreationStep user={user} businessLoading={isLoading} />
          ) : (
          <>
            <div className="max-w-2xl mx-auto w-full min-w-0">
            {!hasPersistedCountry && (
              <div
                className="rounded-xl border border-slate-100/80 p-5 lg:p-6 mb-8 shadow-sm shadow-slate-200/30"
                style={{
                  borderColor: 'rgba(124, 58, 237, 0.35)',
                  background: 'linear-gradient(145deg, rgba(124, 58, 237, 0.09) 0%, #ffffff 55%)',
                  boxShadow: '0 2px 12px rgba(124, 58, 237, 0.08)',
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
                        disabled={isConfirmingCountry}
                        onClick={() => handleConfirmCountry(suggestedCountryCode)}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                        style={{
                          background: 'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 100%)',
                          fontFamily: 'var(--font-caption)',
                          boxShadow: '0 2px 8px rgba(139,92,246,0.35)',
                        }}
                      >
                        {isConfirmingCountry ? (
                          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        ) : null}
                        Usar {suggestedCfg.name}
                      </button>
                      <button
                        type="button"
                        disabled={isConfirmingCountry}
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
                      value={manualCountryCode || ''}
                      onChange={(code) => setManualCountryCode(code || '')}
                      disabled={isConfirmingCountry}
                      className={inputClass}
                      style={{ ...inputStyle, cursor: isConfirmingCountry ? 'not-allowed' : 'pointer' }}
                    />
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <button
                        type="button"
                        disabled={isConfirmingCountry || !manualCountryCode}
                        onClick={() => handleConfirmCountry(manualCountryCode)}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                        style={{
                          background: 'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 100%)',
                          fontFamily: 'var(--font-caption)',
                          boxShadow: '0 2px 8px rgba(139,92,246,0.35)',
                        }}
                      >
                        {isConfirmingCountry ? (
                          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        ) : null}
                        Confirmar país
                        {manualCfg?.name ? ` (${manualCfg.name})` : ''}
                      </button>
                      {suggestedCfg?.name && (
                        <button
                          type="button"
                          disabled={isConfirmingCountry}
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
                countryCode={persistedCountryCode}
                currencyLabel={business?.currency || countryLabels.currency}
              />
            )}

            <div
              className="flex flex-wrap gap-2 mb-8"
              role="tablist"
              aria-label="Secciones de configuración"
            >
              {[
                { id: 'identity', label: 'Identidad', Icon: Building2 },
                { id: 'payments', label: 'Pagos y envíos', Icon: CreditCard },
              ].map((tab) => {
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
                      'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border',
                      'font-[family-name:var(--font-caption)]',
                      active
                        ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-sm shadow-violet-200/40'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/80',
                    ].join(' ')}
                  >
                    <TabIcon className="w-4 h-4 shrink-0" strokeWidth={2} aria-hidden />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {settingsTab === 'identity' && (
            <div className={`${cardClass} mb-8`}>
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}
                >
                  <Icon name="Building2" size={18} color="var(--color-primary)" />
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Datos del negocio</h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Visible en tu catálogo público</p>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div>
                  <p className={sectionHeadingClass}>Identidad operativa</p>
                  <div className="flex flex-col gap-5">
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

                    <SettingsField label="Rubro principal" hint="Sector de tu negocio; filtra categorías sugeridas de productos.">
                      <select
                        value={form?.rubroId ?? ''}
                        onChange={e => handleRubroChange(e?.target?.value)}
                        className={`${inputClass} cursor-pointer`}
                        style={inputStyle}
                      >
                        <option value="">Sin rubro</option>
                        {rubros?.map((r) => (
                          <option key={r?.id} value={r?.id}>{r?.name}</option>
                        ))}
                      </select>
                    </SettingsField>

                    <SettingsField
                      label="Descripción del negocio"
                      hint="Cabecera del catálogo. Máximo 280 caracteres; la IA respeta el límite."
                    >
                      <div className="relative">
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
                          className={`${inputClass} pr-[9.5rem] pt-2.5`}
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
                    hint="Un solo campo. Al guardar, comuna y región se deducen del texto (no hace falta escribirlos aparte)."
                  >
                    <textarea
                      rows={3}
                      className={inputClass}
                      style={inputStyle}
                      placeholder={
                        hasPersistedCountry
                          ? 'Ej: Av. Principal 123, Las Condes, Región Metropolitana'
                          : 'Calle, ciudad y referencia'
                      }
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

            {settingsTab === 'payments' && business?.id && (
              <div className={`${cardClass} mb-8`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
                    <Icon name="Truck" size={18} color="var(--color-primary)" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Pagos y envíos</h2>
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Envíos, retiro, plantilla de pedido y datos para transferencia</p>
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

                <div id="datos-transferencia" className="pt-6 mt-6 border-t scroll-mt-24" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
                      <Icon name="Landmark" size={14} color="var(--color-primary)" />
                    </div>
                    <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Datos de transferencia</h3>
                  </div>
                  <p className="text-xs mb-4" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                    Usa estos datos para responder al cliente o completar mensajes de pago sin escribir siempre lo mismo.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SettingsField label="Banco" hint="Nombre del banco donde recibes transferencias">
                      <input type="text" className={inputClass} style={inputStyle} placeholder={countryLabels.bankPlaceholder} value={bankForm?.bankName} onChange={e => setBankForm(prev => ({ ...prev, bankName: e.target.value }))} />
                    </SettingsField>
                    <SettingsField label="Tipo de cuenta">
                      <select className={`${inputClass} cursor-pointer`} style={inputStyle} value={bankForm?.bankAccountType} onChange={e => setBankForm(prev => ({ ...prev, bankAccountType: e.target.value }))}>
                        <option value="">Seleccionar...</option>
                        {(countryLabels.bankAccountTypes || []).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </SettingsField>
                    <div className="sm:col-span-2">
                      <SettingsField label="Número de cuenta">
                        <input type="text" className={inputClass} style={inputStyle} placeholder="Ej: 00123456789" value={bankForm?.bankAccountNumber} onChange={e => setBankForm(prev => ({ ...prev, bankAccountNumber: e.target.value }))} />
                      </SettingsField>
                    </div>
                    <SettingsField label="Titular">
                      <input type="text" className={inputClass} style={inputStyle} placeholder="Nombre completo" value={bankForm?.bankAccountHolder} onChange={e => setBankForm(prev => ({ ...prev, bankAccountHolder: e.target.value }))} />
                    </SettingsField>
                    <SettingsField label={countryLabels.idNumberLabel} hint={countryLabels.idNumberPlaceholder}>
                      <input type="text" className={inputClass} style={inputStyle} placeholder={countryLabels.idNumberPlaceholder} value={bankForm?.bankRut} onChange={e => setBankForm(prev => ({ ...prev, bankRut: e.target.value }))} />
                    </SettingsField>
                    <div className="sm:col-span-2">
                      <SettingsField label="Email (transferencias)">
                        <input type="email" className={inputClass} style={inputStyle} placeholder="transferencias@ejemplo.com" value={bankForm?.bankEmail} onChange={e => setBankForm(prev => ({ ...prev, bankEmail: e.target.value }))} />
                      </SettingsField>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <InstallAppBlock />
            </div>
          </>
          )}
        </DashboardLayoutContent>
      </div>

      {isDirty && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[60] border-t border-slate-200/70 bg-white/80 backdrop-blur-md px-4 py-3.5 shadow-[0_-8px_32px_rgba(15,23,42,0.07)]"
          style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom, 0px))' }}
          role="region"
          aria-label="Acciones de guardado"
        >
          <div className="max-w-2xl mx-auto w-full flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-3">
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
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all bg-gradient-to-r from-violet-600 via-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-600 shadow-lg shadow-violet-500/20 font-[family-name:var(--font-caption)]"
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