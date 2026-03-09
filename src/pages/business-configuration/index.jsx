import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import {
  updateBusiness,
  uploadBusinessLogo,
  uploadBusinessCover,
  getProducts,
  getMyBusiness,
} from '../../services/waBusinessService';
import StoreHeaderCard from './components/StoreHeaderCard';
import ProductListPanel from './components/ProductListPanel';
import MobilePreviewPanel from './components/MobilePreviewPanel';
import DesignCustomization from './components/DesignCustomization';
import WhatsAppMessageTemplate from './components/WhatsAppMessageTemplate';

function Toast({ message, type, onClose }) {
  return (
    <div
      className="fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg toast-enter"
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

const CURRENCIES = [
  { value: 'USD', label: 'USD — Dólar estadounidense' },
  { value: 'MXN', label: 'MXN — Peso mexicano' },
  { value: 'COP', label: 'COP — Peso colombiano' },
  { value: 'ARS', label: 'ARS — Peso argentino' },
  { value: 'CLP', label: 'CLP — Peso chileno' },
  { value: 'PEN', label: 'PEN — Sol peruano' },
  { value: 'BRL', label: 'BRL — Real brasileño' },
  { value: 'EUR', label: 'EUR — Euro' },
];

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
  const { business: ctxBusiness, businessLoading, refreshBusiness } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('store');

  // Add this block - WhatsApp message template state
  const [orderMessageTemplate, setOrderMessageTemplate] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Local resolved business — may come from context or a direct fetch
  const [business, setBusiness] = useState(null);
  const [businessFetchLoading, setBusinessFetchLoading] = useState(false);

  // Store header state
  const [editingName, setEditingName] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [pendingLogoFile, setPendingLogoFile] = useState(null);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [pendingCoverFile, setPendingCoverFile] = useState(null);
  const coverInputRef = useRef(null);

  // Business settings form state
  const [form, setForm] = useState({
    description: '',
    whatsapp: '',
    email: '',
    address: '',
    city: '',
    country: '',
    currency: 'USD',
    bankName: '',
    bankAccountType: '',
    bankAccountNumber: '',
    bankAccountHolder: '',
    bankRut: '',
    bankEmail: '',
  });

  // Design settings state (valores por defecto; se rellenan desde business.designSettings al cargar)
  const [design, setDesign] = useState({
    theme: 'minimal',
    primaryColor: '#7C3AED',
    font: 'Inter',
    logoUrl: '',
    headerImageUrl: '',
    catalogLayout: 'list',
    storeHeader: {
      showStoreName: true,
      showDescription: true,
      showWhatsAppButton: true,
    },
    cardSettings: {
      showPrice: true,
      showDescription: true,
      showStock: false,
      showWhatsApp: true,
    },
  });

  const toastTimer = useRef(null);
  const fileInputRef = useRef(null);

  // Sync local business from context whenever context updates
  useEffect(() => {
    if (ctxBusiness) {
      console.log('[BusinessConfig] business from context:', ctxBusiness?.id);
      setBusiness(ctxBusiness);
    }
  }, [ctxBusiness]);

  // If context has no business after loading completes, do a direct fetch
  useEffect(() => {
    if (!businessLoading && !ctxBusiness) {
      console.log('[BusinessConfig] context has no business after load — attempting direct fetch');
      setBusinessFetchLoading(true);
      getMyBusiness()?.then(({ data, error }) => {
        if (data) {
          console.log('[BusinessConfig] direct fetch found business:', data?.id);
          setBusiness(data);
        } else {
          console.warn('[BusinessConfig] direct fetch: no business found. error =', error);
        }
        setBusinessFetchLoading(false);
      });
    }
  }, [businessLoading, ctxBusiness]);

  // Populate form and header fields whenever business resolves
  useEffect(() => {
    if (business) {
      console.log('[BusinessConfig] populating form with business id =', business?.id);
      setStoreName(business?.name || '');
      setStoreSlug(business?.slug || '');
      setLogoUrl(business?.logoUrl || '');
      setCoverImageUrl(business?.coverImageUrl || '');
      setForm({
        description: business?.description || '',
        whatsapp: business?.whatsapp || '',
        email: business?.email || '',
        address: business?.address || '',
        city: business?.city || '',
        country: business?.country || '',
        currency: business?.currency || 'USD',
        bankName: business?.bankName || '',
        bankAccountType: business?.bankAccountType || '',
        bankAccountNumber: business?.bankAccountNumber || '',
        bankAccountHolder: business?.bankAccountHolder || '',
        bankRut: business?.bankRut || '',
        bankEmail: business?.bankEmail || '',
      });
      // Populate design settings (merge profundo para no perder cardSettings/storeHeader parciales)
      if (business?.designSettings) {
        const ds = business.designSettings;
        setDesign(prev => ({
          ...prev,
          ...ds,
          storeHeader: { ...prev.storeHeader, ...(ds.storeHeader || {}) },
          cardSettings: { ...prev.cardSettings, ...(ds.cardSettings || {}) },
        }));
      }
      // Populate WhatsApp template
      if (business?.orderMessageTemplate) {
        setOrderMessageTemplate(business?.orderMessageTemplate);
      }
    }
  }, [business?.id]);

  useEffect(() => {
    if (!business?.id) { setLoadingProducts(false); return; }
    loadProducts();
  }, [business?.id]);

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const { data } = await getProducts(business?.id);
      setProducts(data || []);
    } catch (e) {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  };

  const showToast = (message, type = 'success') => {
    if (toastTimer?.current) clearTimeout(toastTimer?.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const handleLogoFileChange = (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogoUrl(url);
    setPendingLogoFile(file);
  };

  const handleCoverFileChange = (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCoverImageUrl(url);
    setPendingCoverFile(file);
  };

  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // Save store header (name, slug, logo)
  const handleSaveName = async () => {
    if (!business?.id) return;
    setIsSaving(true);
    try {
      let finalLogoUrl = logoUrl;
      if (pendingLogoFile) {
        const { url, error: uploadErr } = await uploadBusinessLogo(pendingLogoFile, business?.id);
        if (uploadErr) { showToast('Error al subir logo', 'error'); setIsSaving(false); return; }
        finalLogoUrl = url;
        setPendingLogoFile(null);
        setLogoUrl(url);
      }
      let finalCoverUrl = coverImageUrl;
      if (pendingCoverFile) {
        const { url, error: uploadErr } = await uploadBusinessCover(pendingCoverFile, business?.id);
        if (uploadErr) { showToast('Error al subir imagen de portada', 'error'); setIsSaving(false); return; }
        finalCoverUrl = url;
        setPendingCoverFile(null);
        setCoverImageUrl(url);
      }
      const { error } = await updateBusiness(business?.id, {
        name: storeName,
        slug: storeSlug,
        logoUrl: finalLogoUrl,
        coverImageUrl: finalCoverUrl,
      });
      if (error) { showToast('Error al guardar: ' + error?.message, 'error'); return; }
      await refreshBusiness();
      setEditingName(false);
      showToast('¡Guardado exitosamente!', 'success');
    } catch (e) {
      showToast('Error inesperado', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Save business settings form
  const handleSaveSettings = async () => {
    const bizId = business?.id;
    console.log('[BusinessConfig] handleSaveSettings: business.id =', bizId);
    if (!bizId) {
      showToast('No se encontró el negocio. Intenta recargar la página.', 'error');
      return;
    }
    setIsSaving(true);
    const payload = {
      description: form?.description,
      whatsapp: form?.whatsapp,
      email: form?.email,
      address: form?.address,
      city: form?.city,
      country: form?.country,
      currency: form?.currency,
      bankName: form?.bankName,
      bankAccountType: form?.bankAccountType,
      bankAccountNumber: form?.bankAccountNumber,
      bankAccountHolder: form?.bankAccountHolder,
      bankRut: form?.bankRut,
      bankEmail: form?.bankEmail,
    };
    console.log('[BusinessConfig] handleSaveSettings: payload =', payload);
    try {
      const { data: updated, error } = await updateBusiness(bizId, payload);
      console.log('[BusinessConfig] handleSaveSettings: response =', { updated, error });
      if (error) {
        showToast('Error al guardar: ' + (error?.message || JSON.stringify(error)), 'error');
        return;
      }
      if (updated) setBusiness(updated);
      await refreshBusiness();
      showToast('¡Configuración guardada!', 'success');
    } catch (e) {
      console.error('[BusinessConfig] handleSaveSettings exception:', e);
      showToast('Error inesperado: ' + (e?.message || 'Intenta de nuevo'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Save design settings
  const handleSaveDesign = async () => {
    const bizId = business?.id;
    if (!bizId) { showToast('No se encontró el negocio.', 'error'); return; }
    setIsSaving(true);
    try {
      const { data: updated, error } = await updateBusiness(bizId, { designSettings: design });
      if (error) { showToast('Error al guardar diseño: ' + (error?.message || ''), 'error'); return; }
      if (updated) setBusiness(updated);
      await refreshBusiness();
      showToast('¡Diseño guardado!', 'success');
    } catch (e) {
      showToast('Error inesperado: ' + (e?.message || ''), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    const bizId = business?.id;
    if (!bizId) {
      showToast('No se encontró el negocio.', 'error');
      return;
    }
    setIsSavingTemplate(true);
    try {
      const { data: updated, error } = await updateBusiness(bizId, { orderMessageTemplate });
      if (error) {
        showToast('Error al guardar plantilla: ' + (error?.message || ''), 'error');
        return;
      }
      if (updated) setBusiness(updated);
      await refreshBusiness();
      showToast('¡Plantilla guardada!', 'success');
    } catch (e) {
      showToast('Error inesperado: ' + (e?.message || ''), 'error');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const isLoading = businessLoading || businessFetchLoading;
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';
  const catalogUrl = `${window.location?.origin}/catalog/${storeSlug || business?.slug || 'mi-tienda'}`;

  const inputClass = [
    'w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-all',
    'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
  ]?.join(' ');
  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: '#ffffff',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-caption)',
  };

  const tabs = [
    { id: 'store', label: 'Mi Tienda', icon: 'Store' },
    { id: 'settings', label: 'Configuración', icon: 'Settings' },
    { id: 'design', label: 'Diseño', icon: 'Palette' },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f7f7f9' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <div
        className="transition-all min-h-screen"
        style={{ marginLeft: sidebarWidth, transition: 'margin var(--transition-base)' }}
      >
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 border-b flex items-center justify-between px-6 lg:px-8"
          style={{
            backgroundColor: '#ffffff',
            borderColor: 'var(--color-border)',
            height: '60px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 lg:w-0 flex-shrink-0" aria-hidden="true" />
            <h1
              className="text-base font-bold text-foreground"
              style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}
            >
              Mi Tienda
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={catalogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
            >
              <span className="truncate max-w-[200px]">
                {catalogUrl?.replace('https://', '')?.replace('http://', '')}
              </span>
              <Icon name="ExternalLink" size={14} color="var(--color-primary)" />
            </a>
          </div>
        </header>

        {/* Tabs */}
        <div
          className="flex items-center gap-1 px-6 lg:px-10 border-b"
          style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)' }}
        >
          {tabs?.map(tab => (
            <button
              key={tab?.id}
              onClick={() => setActiveTab(tab?.id)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-px"
              style={{
                borderColor: activeTab === tab?.id ? 'var(--color-primary)' : 'transparent',
                color: activeTab === tab?.id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-caption)',
              }}
            >
              <Icon name={tab?.icon} size={15} color={activeTab === tab?.id ? 'var(--color-primary)' : 'var(--color-text-secondary)'} />
              {tab?.label}
            </button>
          ))}
        </div>

        {/* Tab: Mi Tienda */}
        {activeTab === 'store' && (
          <div className="flex gap-0 min-h-[calc(100vh-108px)]">
            {/* Center content */}
            <div className="flex-1 px-6 lg:px-10 py-8 max-w-3xl">
              <StoreHeaderCard
                storeName={storeName}
                storeSlug={storeSlug}
                logoUrl={logoUrl}
                coverImageUrl={coverImageUrl}
                businessLogoUrl={business?.logoUrl}
                businessCoverImageUrl={business?.coverImageUrl}
                pendingLogoFile={!!pendingLogoFile}
                pendingCoverFile={!!pendingCoverFile}
                editingName={editingName}
                isSaving={isSaving}
                onEditName={() => setEditingName(true)}
                onCancelEdit={() => { setEditingName(false); setStoreName(business?.name || ''); }}
                onSaveName={handleSaveName}
                onSaveLogoAndCover={handleSaveName}
                onNameChange={setStoreName}
                onSlugChange={setStoreSlug}
                onLogoClick={() => fileInputRef?.current?.click()}
                fileInputRef={fileInputRef}
                onLogoFileChange={handleLogoFileChange}
                coverInputRef={coverInputRef}
                onCoverFileChange={handleCoverFileChange}
                onCoverClick={() => coverInputRef?.current?.click()}
              />
              <div className="mt-6">
                <ProductListPanel
                  products={products}
                  loading={loadingProducts}
                  onAddProduct={() => navigate('/product-editor')}
                  onEditProduct={(id) => navigate(`/product-editor?id=${id}`)}
                  onReload={loadProducts}
                  currency={business?.currency || 'USD'}
                />
              </div>
            </div>
            {/* Right: mobile preview */}
            <div
              className="hidden xl:flex flex-col items-center justify-start py-8 px-6 flex-shrink-0"
              style={{ width: '380px', borderLeft: '1px solid var(--color-border)', backgroundColor: '#f7f7f9' }}
            >
              <MobilePreviewPanel
                storeName={storeName || business?.name || 'Mi Tienda'}
                storeSlug={storeSlug || business?.slug || ''}
                logoUrl={logoUrl}
                products={products}
                currency={business?.currency || 'USD'}
                design={design}
              />
            </div>
          </div>
        )}

        {/* Tab: Configuración */}
        {activeTab === 'settings' && (
          <div className="px-6 lg:px-10 py-8 max-w-2xl">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(139,92,246,0.2)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <span className="ml-3 text-sm" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Cargando datos del negocio...</span>
              </div>
            ) : !business?.id ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
                  <Icon name="Building2" size={28} color="var(--color-primary)" />
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>No se encontró tu negocio</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-caption)' }}>Parece que aún no tienes un negocio registrado.</p>
                </div>
                <button
                  onClick={() => navigate('/business-registration')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 100%)' }}
                >
                  <Icon name="Plus" size={15} color="#fff" />
                  Crear negocio
                </button>
              </div>
            ) : (
            <div
              className="rounded-2xl border p-6 lg:p-8"
              style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}
                >
                  <Icon name="Building2" size={18} color="var(--color-primary)" />
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Datos del negocio</h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Esta información aparece en tu catálogo público</p>
                </div>
              </div>

              <div className="flex flex-col gap-5">
                {/* Description */}
                <SettingsField label="Descripción del negocio" hint="Aparece en la página principal de tu catálogo">
                  <textarea
                    rows={3}
                    className={inputClass}
                    style={inputStyle}
                    placeholder="Ej: Tienda de ropa y accesorios para toda la familia..."
                    value={form?.description}
                    onChange={e => handleFormChange('description', e?.target?.value)}
                  />
                </SettingsField>

                {/* WhatsApp */}
                <SettingsField label="Número de WhatsApp" hint="Incluye el código de país. Ej: +521234567890">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">
                      <Icon name="MessageCircle" size={16} color="#25D366" />
                    </span>
                    <input
                      type="tel"
                      className={inputClass}
                      style={{ ...inputStyle, paddingLeft: '2.25rem' }}
                      placeholder="+521234567890"
                      value={form?.whatsapp}
                      onChange={e => handleFormChange('whatsapp', e?.target?.value)}
                    />
                  </div>
                </SettingsField>

                {/* Email */}
                <SettingsField label="Correo electrónico" hint="Correo de contacto del negocio (opcional)">
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

                {/* Address */}
                <SettingsField label="Dirección" hint="Dirección física del negocio (opcional)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">
                      <Icon name="MapPin" size={16} color="var(--color-text-tertiary)" />
                    </span>
                    <input
                      type="text"
                      className={inputClass}
                      style={{ ...inputStyle, paddingLeft: '2.25rem' }}
                      placeholder="Calle, número, colonia..."
                      value={form?.address}
                      onChange={e => handleFormChange('address', e?.target?.value)}
                    />
                  </div>
                </SettingsField>

                {/* City + Country */}
                <div className="grid grid-cols-2 gap-4">
                  <SettingsField label="Ciudad">
                    <input
                      type="text"
                      className={inputClass}
                      style={inputStyle}
                      placeholder="Ciudad de México"
                      value={form?.city}
                      onChange={e => handleFormChange('city', e?.target?.value)}
                    />
                  </SettingsField>
                  <SettingsField label="País">
                    <input
                      type="text"
                      className={inputClass}
                      style={inputStyle}
                      placeholder="México"
                      value={form?.country}
                      onChange={e => handleFormChange('country', e?.target?.value)}
                    />
                  </SettingsField>
                </div>

                {/* Currency */}
                <SettingsField label="Moneda" hint="Moneda usada para mostrar precios en tu catálogo">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">
                      <Icon name="DollarSign" size={16} color="var(--color-text-tertiary)" />
                    </span>
                    <select
                      className={inputClass}
                      style={{ ...inputStyle, paddingLeft: '2.25rem', cursor: 'pointer' }}
                      value={form?.currency}
                      onChange={e => handleFormChange('currency', e?.target?.value)}
                    >
                      {CURRENCIES?.map(c => (
                        <option key={c?.value} value={c?.value}>{c?.label}</option>
                      ))}
                    </select>
                  </div>
                </SettingsField>

                {/* Bank account section */}
                <div className="pt-4 mt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}
                    >
                      <Icon name="Landmark" size={14} color="var(--color-primary)" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Datos bancarios</h3>
                      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Para recibir pagos por transferencia bancaria</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-5">
                    {/* Banco */}
                    <SettingsField label="Banco" hint="Nombre del banco donde recibes transferencias">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2">
                          <Icon name="Building2" size={16} color="var(--color-text-tertiary)" />
                        </span>
                        <input
                          type="text"
                          className={inputClass}
                          style={{ ...inputStyle, paddingLeft: '2.25rem' }}
                          placeholder="Ej: Banco de Chile, BancoEstado, Santander..."
                          value={form?.bankName}
                          onChange={e => handleFormChange('bankName', e?.target?.value)}
                        />
                      </div>
                    </SettingsField>

                    {/* Tipo de cuenta */}
                    <SettingsField label="Tipo de cuenta">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2">
                          <Icon name="CreditCard" size={16} color="var(--color-text-tertiary)" />
                        </span>
                        <select
                          className={inputClass}
                          style={{ ...inputStyle, paddingLeft: '2.25rem', cursor: 'pointer' }}
                          value={form?.bankAccountType}
                          onChange={e => handleFormChange('bankAccountType', e?.target?.value)}
                        >
                          <option value="">Seleccionar tipo...</option>
                          <option value="cuenta_corriente">Cuenta Corriente</option>
                          <option value="cuenta_vista">Cuenta Vista</option>
                          <option value="cuenta_ahorro">Cuenta de Ahorro</option>
                          <option value="cuenta_rut">Cuenta RUT</option>
                        </select>
                      </div>
                    </SettingsField>

                    {/* Número de cuenta */}
                    <SettingsField label="Número de cuenta">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2">
                          <Icon name="Hash" size={16} color="var(--color-text-tertiary)" />
                        </span>
                        <input
                          type="text"
                          className={inputClass}
                          style={{ ...inputStyle, paddingLeft: '2.25rem' }}
                          placeholder="Ej: 00123456789"
                          value={form?.bankAccountNumber}
                          onChange={e => handleFormChange('bankAccountNumber', e?.target?.value)}
                        />
                      </div>
                    </SettingsField>

                    {/* Nombre titular + RUT */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <SettingsField label="Nombre titular">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2">
                            <Icon name="User" size={16} color="var(--color-text-tertiary)" />
                          </span>
                          <input
                            type="text"
                            className={inputClass}
                            style={{ ...inputStyle, paddingLeft: '2.25rem' }}
                            placeholder="Nombre completo"
                            value={form?.bankAccountHolder}
                            onChange={e => handleFormChange('bankAccountHolder', e?.target?.value)}
                          />
                        </div>
                      </SettingsField>
                      <SettingsField label="RUT" hint="Ej: 12.345.678-9">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2">
                            <Icon name="IdCard" size={16} color="var(--color-text-tertiary)" />
                          </span>
                          <input
                            type="text"
                            className={inputClass}
                            style={{ ...inputStyle, paddingLeft: '2.25rem' }}
                            placeholder="12.345.678-9"
                            value={form?.bankRut}
                            onChange={e => handleFormChange('bankRut', e?.target?.value)}
                          />
                        </div>
                      </SettingsField>
                    </div>

                    {/* Email bancario */}
                    <SettingsField label="Email" hint="Correo asociado a la cuenta bancaria (para transferencias)">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2">
                          <Icon name="Mail" size={16} color="var(--color-text-tertiary)" />
                        </span>
                        <input
                          type="email"
                          className={inputClass}
                          style={{ ...inputStyle, paddingLeft: '2.25rem' }}
                          placeholder="transferencias@ejemplo.com"
                          value={form?.bankEmail}
                          onChange={e => handleFormChange('bankEmail', e?.target?.value)}
                        />
                      </div>
                    </SettingsField>
                  </div>
                </div>
              </div>

              {/* Save button */}
              <div className="mt-8 flex items-center justify-end gap-3 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  onClick={() => {
                    if (business) {
                      setForm({
                        description: business?.description || '',
                        whatsapp: business?.whatsapp || '',
                        email: business?.email || '',
                        address: business?.address || '',
                        city: business?.city || '',
                        country: business?.country || '',
                        currency: business?.currency || 'USD',
                        bankName: business?.bankName || '',
                        bankAccountType: business?.bankAccountType || '',
                        bankAccountNumber: business?.bankAccountNumber || '',
                        bankAccountHolder: business?.bankAccountHolder || '',
                        bankRut: business?.bankRut || '',
                        bankEmail: business?.bankEmail || '',
                      });
                    }
                  }}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
                  style={{
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                    backgroundColor: '#ffffff',
                    fontFamily: 'var(--font-caption)',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 100%)',
                    fontFamily: 'var(--font-caption)',
                    boxShadow: '0 2px 8px rgba(139,92,246,0.35)',
                  }}
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Icon name="Save" size={14} color="#fff" />
                      Guardar configuración
                    </>
                  )}
                </button>
              </div>
            </div>
            )}
            {business?.id && (
              <WhatsAppMessageTemplate
                value={orderMessageTemplate}
                onChange={setOrderMessageTemplate}
                isSaving={isSavingTemplate}
                onSave={handleSaveTemplate}
              />
            )}
          </div>
        )}

        {/* Tab: Diseño */}
        {activeTab === 'design' && (
          <div className="flex gap-0 min-h-[calc(100vh-108px)]">
            {/* Left: customization form */}
            <div className="flex-1 px-6 lg:px-10 py-8 overflow-y-auto">
              <DesignCustomization
                design={design}
                onChange={setDesign}
                businessId={business?.id}
                isSaving={isSaving}
                onSave={handleSaveDesign}
                showToast={showToast}
              />
            </div>
            {/* Right: live mobile preview */}
            <div
              className="hidden xl:flex flex-col items-center justify-start py-8 px-6 flex-shrink-0"
              style={{ width: '380px', borderLeft: '1px solid var(--color-border)', backgroundColor: '#f7f7f9' }}
            >
              <MobilePreviewPanel
                storeName={storeName || business?.name || 'Mi Tienda'}
                storeSlug={storeSlug || business?.slug || ''}
                logoUrl={logoUrl}
                products={products}
                currency={business?.currency || 'USD'}
                design={design}
              />
            </div>
          </div>
        )}
      </div>
      {/* Hidden file input for logo */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoFileChange}
      />
      {toast && (
        <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}