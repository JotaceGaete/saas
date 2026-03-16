import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import Icon from 'components/AppIcon';
import DesignCustomization from '../business-configuration/components/DesignCustomization';
import MobilePreviewPanel from '../business-configuration/components/MobilePreviewPanel';
import { useAuth } from '../../contexts/AuthContext';
import { getMyBusiness, updateBusiness, getProducts } from '../../services/waBusinessService';
import { getCountryLabels } from '../../config/country';

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
  const { user, business: ctxBusiness, businessLoading, refreshBusiness } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [design, setDesign] = useState(defaultDesign);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const defaultCountryLabels = getCountryLabels();
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const loading = businessLoading && !ctxBusiness;

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
      setDesign(prev => ({
        ...prev,
        ...ds,
        catalogViewMode: ds?.catalogViewMode === 'compact' ? 'compact' : 'featured',
        useCategories: ds?.useCategories === true,
        categories: Array.isArray(ds?.categories) ? ds.categories : prev.categories,
        storeHeader: { ...prev.storeHeader, ...(ds.storeHeader || {}) },
        cardSettings: { ...prev.cardSettings, ...(ds.cardSettings || {}) },
      }));
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

  const handleSaveDesign = useCallback(async () => {
    if (!business?.id) {
      showToast('No se encontró el negocio.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await updateBusiness(business.id, { designSettings: design });
      if (error) {
        showToast('Error al guardar: ' + (error?.message || ''), 'error');
        return;
      }
      await refreshBusiness?.();
      setBusiness(prev => prev ? { ...prev, designSettings: design } : null);
      showToast('¡Diseño guardado!', 'success');
    } catch (e) {
      showToast(e?.message || 'Error inesperado', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [business, design, refreshBusiness, showToast]);

  if (!user) return null;

  if (loading && !business) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <svg className="animate-spin" width={32} height={32} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (!business?.id) {
    navigate('/business-registration', { replace: true });
    return null;
  }

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: '#f7f7f9' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main
        className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden transition-all"
        style={{ marginLeft: isDesktop ? sidebarWidth : 0 }}
      >
        <header
          className="sticky top-0 z-30 border-b flex items-center justify-between px-4 py-4"
          style={{ backgroundColor: '#ffffff', borderColor: 'var(--color-border)' }}
        >
          <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            Diseño
          </h1>
          <p className="text-xs hidden sm:block" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
            Todo lo visual vive aquí.
          </p>
        </header>

        <div className="w-full max-w-6xl mx-auto px-4 py-6 lg:py-8 min-h-[calc(100vh-108px)] pb-24 lg:pb-8">
          <div className="flex flex-col lg:grid lg:grid-cols-[1fr_minmax(340px,380px)] lg:gap-8 xl:gap-10">
            <div className="min-w-0 py-6 lg:py-8 overflow-y-auto">
              <DesignCustomization
                design={design}
                onChange={setDesign}
                businessId={business?.id}
                isSaving={isSaving}
                onSave={handleSaveDesign}
                showToast={showToast}
                designOnly
              />
            </div>
            <div
              className="flex flex-col items-center justify-start py-6 lg:py-8 lg:sticky lg:top-24 lg:self-start w-full max-w-[380px] lg:max-w-none mx-auto lg:mx-0 rounded-xl border lg:rounded-2xl"
              style={{ borderColor: 'var(--color-border)', backgroundColor: '#f7f7f9' }}
            >
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                Vista previa
              </p>
              <MobilePreviewPanel
                storeName={business?.name || 'Mi Tienda'}
                storeSlug={business?.slug || ''}
                logoUrl={design?.logoUrl || business?.logoUrl}
                coverImageUrl={design?.headerImageUrl || business?.coverImageUrl}
                products={products}
                currency={business?.currency || defaultCountryLabels.currency}
                design={design}
              />
            </div>
          </div>
        </div>
      </main>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
