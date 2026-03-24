import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PanelHeader from 'components/ui/PanelHeader';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import Icon from 'components/AppIcon';
import DesignCustomization from '../business-configuration/components/DesignCustomization';
import MobilePreviewPanel from '../business-configuration/components/MobilePreviewPanel';
import { useAuth } from '../../contexts/AuthContext';
import { getMyBusiness, updateBusiness, getProducts } from '../../services/waBusinessService';
import { getCountryLabels } from '../../config/country';
import { getBusinessLocale } from '../../lib/locale/businessLocale';

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
  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [design, setDesign] = useState(defaultDesign);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const locale = getBusinessLocale(business, {
    preferredCountryCode: user?.user_metadata?.country_code ?? null,
  });

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
    <DashboardAppShell backgroundColor="#f7f7f9">
        <PanelHeader
          title={<h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>Diseño</h1>}
          subtitle={<p className="text-xs hidden sm:block" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>Todo lo visual vive aquí.</p>}
        />

        <DashboardLayoutContent className="min-h-[calc(100vh-108px)]" innerClassName="space-y-6">
          {/* minmax(0,1fr): la columna de formulario puede encoger (evita empujar la vista previa fuera del viewport con overflow-x-hidden en main). */}
          <div className="flex flex-col w-full min-w-0 gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-6 xl:gap-8 2xl:gap-10 lg:items-start">
            {/* Columna izquierda: opciones de diseño (scroll con la página en desktop) */}
            <div className="min-w-0 w-full py-6 lg:py-8">
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
            {/* Columna derecha: sticky en lg+ para que el teléfono acompañe al ajustar opciones */}
            <div
              className="flex flex-col items-center justify-start w-full min-w-0 max-w-[380px] mx-auto py-6 lg:mx-0 lg:max-w-none lg:w-full lg:py-8 lg:sticky lg:top-[calc(60px+var(--safe-area-top))] lg:self-start rounded-xl border lg:rounded-2xl lg:z-[1]"
              style={{ borderColor: 'var(--color-border)', backgroundColor: '#f7f7f9' }}
            >
              <p className="text-xs font-semibold mb-3 flex-shrink-0" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-caption)' }}>
                Vista previa
              </p>
              <MobilePreviewPanel
                storeName={business?.name || 'Mi Tienda'}
                storeSlug={business?.slug || ''}
                logoUrl={design?.logoUrl || business?.logoUrl}
                coverImageUrl={design?.headerImageUrl || business?.coverImageUrl}
                products={products}
                currency={business?.currency || locale.currencyCode}
                locale={locale.locale}
                design={design}
              />
            </div>
          </div>
        </DashboardLayoutContent>
      
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </DashboardAppShell>
  );
}
