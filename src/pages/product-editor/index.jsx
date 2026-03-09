import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import ImageUploadSection from './components/ImageUploadSection';
import ProductFormFields from './components/ProductFormFields';
import VariantManager from './components/VariantManager';
import ProductToggles from './components/ProductToggles';
import ProductPreview from './components/ProductPreview';
import SaveBar from './components/SaveBar';
import ProductOptionsSection from './components/ProductOptionsSection';
import { useAuth } from '../../contexts/AuthContext';
import { getProduct, createProduct, updateProduct, uploadProductImage } from '../../services/waBusinessService';

const EMPTY_FORM = {
  nombre: '',
  precio: '',
  currency: 'USD',
  descripcion: '',
  categoria: '',
  stock: '',
  activo: true,
  featured: false,
  hasOptions: false,
  optionsDescription: '',
};

export default function ProductEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const productId = searchParams?.get('id');
  const isEditing = !!productId;
  const { business } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [images, setImages] = useState([]);
  const [variants, setVariants] = useState([]);
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEditing);

  useEffect(() => {
    if (business?.currency) setFormData(prev => ({ ...prev, currency: business?.currency }));
  }, [business?.currency]);

  useEffect(() => {
    if (!isEditing || !productId) return;
    const loadProduct = async () => {
      setPageLoading(true);
      try {
        const { data, error } = await getProduct(productId);
        if (error || !data) { navigate('/product-management'); return; }
        setFormData({
          nombre: data?.name || '',
          precio: String(data?.price || ''),
          currency: business?.currency || 'USD',
          descripcion: data?.description || '',
          categoria: '',
          stock: '',
          activo: data?.isActive !== undefined ? data?.isActive : true,
          featured: data?.featured || false,
          hasOptions: data?.hasOptions || false,
          optionsDescription: data?.optionsDescription || '',
        });
        if (data?.imageUrl) setImages([{ id: 1, url: data?.imageUrl, alt: data?.name, name: 'product-image' }]);
      } catch (e) { navigate('/product-management'); }
      finally { setPageLoading(false); }
    };
    loadProduct();
  }, [productId, isEditing]);

  useEffect(() => {
    if (saveSuccess) { const t = setTimeout(() => setSaveSuccess(false), 3000); return () => clearTimeout(t); }
  }, [saveSuccess]);

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors?.[field]) setErrors(prev => { const e = { ...prev }; delete e?.[field]; return e; });
  };

  const validate = () => {
    const newErrors = {};
    if (!formData?.nombre?.trim()) newErrors.nombre = 'El nombre del producto es obligatorio.';
    if (!formData?.precio || isNaN(parseFloat(formData?.precio)) || parseFloat(formData?.precio) <= 0) newErrors.precio = 'Ingresa un precio válido mayor a 0.';
    return newErrors;
  };

  const handleSave = async (andNew = false) => {
    const validationErrors = validate();
    if (Object.keys(validationErrors)?.length > 0) { setErrors(validationErrors); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!business?.id) { setErrors({ general: 'No se encontró el negocio. Configura tu negocio primero.' }); return; }
    setIsSaving(true);
    try {
      let imageUrl = null;
      const firstImage = images?.[0];
      if (firstImage?.file) {
        const { url, error: uploadErr } = await uploadProductImage(firstImage?.file, business?.id);
        if (!uploadErr) imageUrl = url;
      } else if (firstImage?.url && !firstImage?.url?.startsWith('blob:')) {
        imageUrl = firstImage?.url;
      }
      const productData = {
        name: formData?.nombre,
        description: formData?.descripcion || null,
        price: formData?.precio,
        imageUrl,
        isActive: formData?.activo,
        featured: formData?.featured,
        hasOptions: formData?.hasOptions,
        optionsDescription: formData?.hasOptions ? (formData?.optionsDescription || null) : null,
      };
      const result = isEditing
        ? await updateProduct(productId, productData)
        : await createProduct(business?.id, productData);
      if (result?.error) { setErrors({ general: result?.error?.message || 'Error al guardar el producto.' }); return; }
      setIsSaving(false);
      setSaveSuccess(true);
      if (andNew) {
        setFormData({ ...EMPTY_FORM, currency: business?.currency || 'USD' });
        setImages([]);
        setVariants([]);
        setErrors({});
        setSaveSuccess(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setTimeout(() => navigate('/product-management'), 1400);
      }
    } catch (e) { setErrors({ general: 'Error inesperado al guardar.' }); }
    finally { setIsSaving(false); }
  };

  const handleCancel = () => navigate('/product-management');
  const sidebarWidth = sidebarCollapsed ? 64 : 240;

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Cargando producto...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <div
        className="flex flex-col min-h-screen"
        style={{ marginLeft: `${sidebarWidth}px`, transition: 'margin-left var(--transition-base)' }}
      >
        {/* Header */}
        <header
          className="sticky top-0 z-10 flex items-center gap-3 px-4 md:px-6 border-b"
          style={{
            backgroundColor: 'var(--color-card)',
            borderColor: 'var(--color-border)',
            boxShadow: 'var(--shadow-xs)',
            height: '60px',
          }}
        >
          <button
            onClick={handleCancel}
            className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors"
            aria-label="Volver"
          >
            <Icon name="ArrowLeft" size={17} color="var(--color-foreground)" />
          </button>
          <div className="flex-1 min-w-0">
            <h1
              className="text-base font-bold truncate"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
            >
              {isEditing ? 'Editar producto' : 'Nuevo producto'}
            </h1>
            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 mt-0.5">
              <button onClick={() => navigate('/dashboard')} className="text-xs hover:underline" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Dashboard</button>
              <Icon name="ChevronRight" size={11} color="var(--color-muted-foreground)" />
              <button onClick={() => navigate('/product-management')} className="text-xs hover:underline" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Productos</button>
              <Icon name="ChevronRight" size={11} color="var(--color-muted-foreground)" />
              <span className="text-xs" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{isEditing ? 'Editar' : 'Nuevo'}</span>
            </nav>
          </div>
          {/* Quick status chips */}
          <div className="hidden md:flex items-center gap-2">
            <span
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{
                backgroundColor: formData?.activo ? 'rgba(5,150,105,0.1)' : 'rgba(107,107,107,0.1)',
                color: formData?.activo ? '#059669' : 'var(--color-muted-foreground)',
                fontFamily: 'var(--font-caption)',
              }}
            >
              <Icon name={formData?.activo ? 'Eye' : 'EyeOff'} size={11} color={formData?.activo ? '#059669' : 'var(--color-muted-foreground)'} />
              {formData?.activo ? 'Visible' : 'Oculto'}
            </span>
            {formData?.featured && (
              <span
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  backgroundColor: 'rgba(217,119,6,0.1)',
                  color: '#D97706',
                  fontFamily: 'var(--font-caption)',
                }}
              >
                <Icon name="Star" size={11} color="#D97706" />
                Destacado
              </span>
            )}
          </div>
        </header>

        {/* Main content */}
        <div className="flex-1 px-4 md:px-6 lg:px-8 py-6 pb-0 page-enter">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

              {/* ── LEFT COLUMN: Form ── */}
              <div className="lg:col-span-2 space-y-5">

                {/* Error banner */}
                {Object.keys(errors)?.length > 0 && (
                  <div
                    className="flex items-start gap-3 p-4 rounded-xl border"
                    style={{ backgroundColor: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}
                    role="alert"
                  >
                    <Icon name="AlertCircle" size={17} color="var(--color-error)" className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>Por favor corrige los siguientes errores:</p>
                      <ul className="mt-1 space-y-0.5">
                        {Object.values(errors)?.map((err, i) => (
                          <li key={i} className="text-xs" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>• {err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Image gallery */}
                <div
                  className="p-5 md:p-6 rounded-xl border"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}>
                      <Icon name="Images" size={15} color="var(--color-primary)" />
                    </div>
                    <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Galería de imágenes</h2>
                    <span className="ml-auto text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      {images?.length}/5
                    </span>
                  </div>
                  <ImageUploadSection images={images} onImagesChange={setImages} businessId={business?.id} />
                </div>

                {/* Basic info */}
                <div
                  className="p-5 md:p-6 rounded-xl border"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}>
                      <Icon name="FileText" size={15} color="var(--color-primary)" />
                    </div>
                    <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Información básica</h2>
                  </div>
                  <ProductFormFields formData={formData} errors={errors} onChange={handleFieldChange} />
                </div>

                {/* Visibility & Featured toggles */}
                <div
                  className="p-5 md:p-6 rounded-xl border"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}>
                      <Icon name="Settings2" size={15} color="var(--color-primary)" />
                    </div>
                    <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Visibilidad y estado</h2>
                  </div>
                  <ProductToggles
                    activo={formData?.activo}
                    featured={formData?.featured}
                    onActiveChange={(val) => handleFieldChange('activo', val)}
                    onFeaturedChange={(val) => handleFieldChange('featured', val)}
                  />
                </div>

                {/* Product Options */}
                <div
                  className="p-5 md:p-6 rounded-xl border"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(37,211,102,0.08)' }}>
                      <Icon name="ListChecks" size={15} color="#16a34a" />
                    </div>
                    <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Opciones del producto</h2>
                  </div>
                  <ProductOptionsSection
                    hasOptions={formData?.hasOptions}
                    optionsDescription={formData?.optionsDescription}
                    onHasOptionsChange={(val) => handleFieldChange('hasOptions', val)}
                    onOptionsDescriptionChange={(val) => handleFieldChange('optionsDescription', val)}
                  />
                </div>

                {/* Advanced / Variants */}
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between p-5 md:p-6 hover:bg-muted/50 transition-colors"
                    aria-expanded={showAdvanced}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}>
                        <Icon name="Sliders" size={15} color="var(--color-primary)" />
                      </div>
                      <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Variantes y opciones avanzadas</span>
                    </div>
                    <Icon name={showAdvanced ? 'ChevronUp' : 'ChevronDown'} size={16} color="var(--color-muted-foreground)" />
                  </button>
                  {showAdvanced && (
                    <div className="px-5 md:px-6 pb-5 md:pb-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <div className="pt-4">
                        <VariantManager variants={variants} onVariantsChange={setVariants} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom spacer for SaveBar */}
                <div className="h-4" />
              </div>

              {/* ── RIGHT COLUMN: Live Preview ── */}
              <div className="lg:col-span-1">
                <div
                  className="sticky top-20 p-5 rounded-xl border"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <ProductPreview
                    nombre={formData?.nombre}
                    precio={formData?.precio}
                    currency={formData?.currency}
                    descripcion={formData?.descripcion}
                    activo={formData?.activo}
                    featured={formData?.featured}
                    images={images}
                  />
                </div>
              </div>

            </div>
          </div>
        </div>

        <SaveBar
          isEditing={isEditing}
          isSaving={isSaving}
          saveSuccess={saveSuccess}
          onSave={() => handleSave(false)}
          onSaveAndNew={() => handleSave(true)}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}