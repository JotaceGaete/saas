import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { updateBusiness, getMyBusiness, getRubros } from '../../services/waBusinessService';
import StoreCreationStep from '../business-registration/components/StoreCreationStep';
import WhatsAppMessageTemplate from './components/WhatsAppMessageTemplate';
import ChileWhatsAppField from 'components/ChileWhatsAppField';
import ArgentinaWhatsAppField from 'components/ArgentinaWhatsAppField';
import { getCountryCode, getCountryLabels } from '../../config/country';
import CatalogAndOrdersConfig from './components/CatalogAndOrdersConfig';
import InstallAppBlock from './components/InstallAppBlock';

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [orderMessageTemplate, setOrderMessageTemplate] = useState('');
  const [business, setBusiness] = useState(null);
  const [businessFetchLoading, setBusinessFetchLoading] = useState(false);

  const defaultCountryLabels = getCountryLabels();
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
    country: defaultCountryLabels.countryName,
    currency: defaultCountryLabels.currency,
    rubroId: '',
  });
  const [rubros, setRubros] = useState([]);

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
        country: business?.country || defaultCountryLabels.countryName,
        currency: business?.currency || defaultCountryLabels.currency,
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
      if (business?.orderMessageTemplate) setOrderMessageTemplate(business?.orderMessageTemplate);
      setBankForm({
        bankName: business?.bankName || '',
        bankAccountType: business?.bankAccountType || '',
        bankAccountNumber: business?.bankAccountNumber || '',
        bankAccountHolder: business?.bankAccountHolder || '',
        bankRut: business?.bankRut || '',
        bankEmail: business?.bankEmail || '',
      });
    }
  }, [business?.id]);

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

  const handleSaveSettings = async () => {
    const bizId = business?.id;
    if (!bizId) {
      showToast('No se encontró el negocio. Intenta recargar la página.', 'error');
      return;
    }
    setIsSaving(true);
    const payload = {
      name: form?.name?.trim() || business?.name,
      slug: (form?.slug?.trim() || business?.slug || '').replace(/\s+/g, '-').toLowerCase(),
      description: form?.description,
      whatsapp: form?.whatsapp,
      email: form?.email,
      address: form?.address,
      city: form?.city,
      region: form?.region,
      country: form?.country || defaultCountryLabels.countryName,
      currency: form?.currency || defaultCountryLabels.currency,
      rubroId: form?.rubroId || null,
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
      showToast('¡Configuración guardada!', 'success');
    } catch (e) {
      console.error('[BusinessConfig] handleSaveSettings exception:', e);
      showToast('Error inesperado: ' + (e?.message || 'Intenta de nuevo'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = businessLoading || businessFetchLoading;
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

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

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: '#f7f7f9' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <div
        role="main"
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden transition-all"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0, transition: 'margin-left var(--transition-base)' }}
      >
        <header
          className="sticky top-0 z-30 border-b flex items-center justify-between px-4 sm:px-4 lg:px-4"
          style={{
            backgroundColor: '#ffffff',
            borderColor: 'var(--color-border)',
            height: '60px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <h1 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
            Configuración
          </h1>
        </header>

        <div className="px-4 sm:px-5 lg:px-5 py-6 lg:py-8 max-w-2xl pb-20 lg:pb-8">
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
            <div
              className="rounded-2xl border p-6 lg:p-8 mb-8"
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
                <SettingsField label="Enlace del catálogo (slug)" hint="Parte de la URL pública. Solo letras, números y guiones.">
                  <div className="flex items-center gap-2">
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>/c/</span>
                    <input
                      type="text"
                      className={inputClass}
                      style={inputStyle}
                      placeholder="mi-tienda"
                      value={form?.slug}
                      onChange={e => handleFormChange('slug', (e?.target?.value || '').replace(/\s+/g, '-').toLowerCase())}
                    />
                  </div>
                </SettingsField>
                <SettingsField label="Rubro principal" hint="Define el sector de tu negocio. Las categorías de productos se filtran por este rubro.">
                  <select
                    value={form?.rubroId ?? ''}
                    onChange={e => handleFormChange('rubroId', e?.target?.value)}
                    className={inputClass}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">Sin rubro</option>
                    {rubros?.map((r) => (
                      <option key={r?.id} value={r?.id}>{r?.name}</option>
                    ))}
                  </select>
                </SettingsField>

                {/* Description */}
                <SettingsField
                  label="Descripción del negocio"
                  hint="Aparece destacada en la página principal de tu catálogo. Máximo 280 caracteres."
                >
                  <textarea
                    rows={3}
                    maxLength={280}
                    className={inputClass}
                    style={inputStyle}
                    placeholder="Ej: Tienda de ropa y accesorios para toda la familia..."
                    value={form?.description}
                    onChange={e => handleFormChange('description', e?.target?.value)}
                  />
                  <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                    {(form?.description ?? '').length}/280
                  </p>
                </SettingsField>

                {/* WhatsApp según país (Argentina +54 10 dígitos / Chile +56 9 dígitos) */}
                {getCountryCode() === 'AR' ? (
                  <ArgentinaWhatsAppField
                    label="Número de WhatsApp"
                    hint={defaultCountryLabels.whatsappHint}
                    value={form?.whatsapp}
                    onChange={(v) => handleFormChange('whatsapp', v)}
                  />
                ) : (
                  <ChileWhatsAppField
                    label="Número de WhatsApp"
                    hint={defaultCountryLabels.whatsappHint}
                    value={form?.whatsapp}
                    onChange={(v) => handleFormChange('whatsapp', v)}
                  />
                )}

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

                {/* Dirección: etiquetas según país (Comuna/Región vs Ciudad/Provincia) */}
                <SettingsField label="Dirección" hint="Calle, número, depto (opcional)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">
                      <Icon name="MapPin" size={16} color="var(--color-text-tertiary)" />
                    </span>
                    <input
                      type="text"
                      className={inputClass}
                      style={{ ...inputStyle, paddingLeft: '2.25rem' }}
                      placeholder={defaultCountryLabels.addressPlaceholder}
                      value={form?.address}
                      onChange={e => handleFormChange('address', e?.target?.value)}
                    />
                  </div>
                </SettingsField>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <SettingsField label={defaultCountryLabels.cityLabel} hint={defaultCountryLabels.cityPlaceholder}>
                    <input
                      type="text"
                      className={inputClass}
                      style={inputStyle}
                      placeholder={defaultCountryLabels.cityPlaceholder}
                      value={form?.city}
                      onChange={e => handleFormChange('city', e?.target?.value)}
                    />
                  </SettingsField>
                  <SettingsField label={defaultCountryLabels.regionLabel} hint={defaultCountryLabels.regionPlaceholder}>
                    <input
                      type="text"
                      className={inputClass}
                      style={inputStyle}
                      placeholder={defaultCountryLabels.regionPlaceholder}
                      value={form?.region}
                      onChange={e => handleFormChange('region', e?.target?.value)}
                    />
                  </SettingsField>
                </div>

                <SettingsField label="País" hint={`Fijo para ${defaultCountryLabels.countryName}`}>
                  <div
                    className={inputClass}
                    style={{ ...inputStyle, cursor: 'default', backgroundColor: 'var(--color-muted)' }}
                  >
                    {defaultCountryLabels.countryName}
                  </div>
                </SettingsField>
              </div>

              <div className="mt-8 flex items-center justify-end gap-3 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  onClick={() => {
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
                        country: business?.country || defaultCountryLabels.countryName,
                        currency: business?.currency || defaultCountryLabels.currency,
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

            {/* Información para el catálogo (horario, dirección, envíos, retiro) */}
            <div className="rounded-2xl border p-6 lg:p-8 mb-8" style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
                  <Icon name="Info" size={18} color="var(--color-primary)" />
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Información para el catálogo</h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Horario, dirección, envíos y retiro en tienda (opcional, para dar más confianza)</p>
                </div>
              </div>
              <div className="flex flex-col gap-5">
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
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>
                    Mostrar dirección en el catálogo
                  </label>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Si está activado, se muestra la dirección (calle, ciudad, etc.) y un enlace para ver en mapa</p>
                  <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={design?.showAddress === true}
                      onChange={e => setDesign(prev => ({ ...prev, showAddress: e?.target?.checked }))}
                      className="w-4 h-4 rounded border-gray-300"
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Mostrar dirección</span>
                  </label>
                </div>
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
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-caption)' }}>
                    Retiro en tienda
                  </label>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Mostrar en el catálogo que se puede retirar en tu local</p>
                  <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={design?.retiroEnTienda === true}
                      onChange={e => setDesign(prev => ({ ...prev, retiroEnTienda: e?.target?.checked }))}
                      className="w-4 h-4 rounded border-gray-300"
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Ofrecer retiro en tienda</span>
                  </label>
                </div>
              </div>
              <p className="text-xs mt-4" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                Guarda los cambios con el botón &quot;Guardar configuración&quot; de la sección Datos del negocio.
              </p>
            </div>

            <div className="rounded-2xl border p-6 lg:p-8 mb-8" style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
                  <Icon name="ShoppingBag" size={18} color="var(--color-primary)" />
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Pedidos y catálogo</h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Categorías, vista, layout y opciones de tarjeta</p>
                </div>
              </div>
              <CatalogAndOrdersConfig design={design} onChange={setDesign} />
            </div>

            {/* Mensajes y pagos: plantilla WhatsApp + datos para transferencia */}
            {business?.id && (
              <div className="rounded-2xl border p-6 lg:p-8 mb-8" style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
                    <Icon name="MessageCircle" size={18} color="var(--color-primary)" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Mensajes y pagos</h2>
                    <p className="text-xs" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Plantilla de pedido y datos para cobros por transferencia</p>
                  </div>
                </div>
                <WhatsAppMessageTemplate
                  value={orderMessageTemplate}
                  onChange={setOrderMessageTemplate}
                  isSaving={isSaving}
                  onSave={handleSaveSettings}
                />
                <div className="pt-6 mt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}>
                      <Icon name="Landmark" size={14} color="var(--color-primary)" />
                    </div>
                    <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-text-primary)' }}>Cobros por transferencia</h3>
                  </div>
                  <p className="text-xs mb-4" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                    Usa estos datos para responder al cliente o completar mensajes de pago sin escribir siempre lo mismo.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <SettingsField label="Banco" hint="Nombre del banco donde recibes transferencias">
                      <input type="text" className={inputClass} style={inputStyle} placeholder={defaultCountryLabels.bankPlaceholder} value={bankForm?.bankName} onChange={e => setBankForm(prev => ({ ...prev, bankName: e.target.value }))} />
                    </SettingsField>
                    <SettingsField label="Tipo de cuenta">
                      <select className={inputClass} style={{ ...inputStyle, cursor: 'pointer' }} value={bankForm?.bankAccountType} onChange={e => setBankForm(prev => ({ ...prev, bankAccountType: e.target.value }))}>
                        <option value="">Seleccionar...</option>
                        {(defaultCountryLabels.bankAccountTypes || []).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
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
                    <SettingsField label={defaultCountryLabels.idNumberLabel} hint={defaultCountryLabels.idNumberPlaceholder}>
                      <input type="text" className={inputClass} style={inputStyle} placeholder={defaultCountryLabels.idNumberPlaceholder} value={bankForm?.bankRut} onChange={e => setBankForm(prev => ({ ...prev, bankRut: e.target.value }))} />
                    </SettingsField>
                    <div className="sm:col-span-2">
                      <SettingsField label="Email (transferencias)">
                        <input type="email" className={inputClass} style={inputStyle} placeholder="transferencias@ejemplo.com" value={bankForm?.bankEmail} onChange={e => setBankForm(prev => ({ ...prev, bankEmail: e.target.value }))} />
                      </SettingsField>
                    </div>
                  </div>
                  <p className="text-xs mt-4" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                    Guarda los cambios con el botón &quot;Guardar configuración&quot; de la sección Datos del negocio.
                  </p>
                </div>
              </div>
            )}

            <InstallAppBlock />
          </>
          )}
        </div>
      </div>
      {toast && (
        <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}