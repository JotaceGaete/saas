import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from 'components/AppIcon';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import ImageUploadSection from './components/ImageUploadSection';
import ProductFormFields from './components/ProductFormFields';
import VariantManager from './components/VariantManager';
import ProductToggles from './components/ProductToggles';
import ProductPreview from './components/ProductPreview';
import SaveBar from './components/SaveBar';
import ProductOptionsSection from './components/ProductOptionsSection';
import { useAuth } from '../../contexts/AuthContext';
import { getProduct, createProduct, updateProduct, uploadProductImage, getMyBusiness, getCategoriesByRubroId, getEffectivePlanSlug } from '../../services/waBusinessService';
import { convertUnsupportedImageToJpeg } from '../../utils/imageUploadUtils';
import { useToast } from '../../components/ui/Toast';
import { useConfirmedEmailGuard } from '../../hooks/useConfirmedEmailGuard';
import { supabase } from '../../lib/supabase';

const EMPTY_FORM = {
  nombre: '',
  precio: '',
  descripcion: '',
  categoria: '',
  stock: '',
  activo: true,
  featured: false,
  onSale: false,
  hasOptions: false,
  optionsDescription: '',
};

export default function ProductEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const productId = searchParams?.get('id');
  const isEditing = !!productId;
  const { business, user, businessLoading, refreshBusiness } = useAuth();
  const refreshAttempted = React.useRef(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [images, setImages] = useState([]);
  const [variants, setVariants] = useState([]);
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEditing);
  const [rubroCategories, setRubroCategories] = useState([]);
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);
  const [publicCode, setPublicCode] = useState('');
  const toast = useToast();

  const effectivePlan = getEffectivePlanSlug(business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt);
  const canUseAi = effectivePlan === 'pro' || effectivePlan === 'business';
  const guard = useConfirmedEmailGuard();
  const initialActivoRef = React.useRef(null);

  useEffect(() => {
    if (!isEditing || !productId) return;
    const loadProduct = async () => {
      setPageLoading(true);
      try {
        const { data, error } = await getProduct(productId);
        if (error || !data) { navigate('/product-management'); return; }
        initialActivoRef.current = data?.isActive !== undefined ? data?.isActive : true;
        setFormData({
          nombre: data?.name || '',
          precio: data?.price != null ? Number(data.price) : '',
          descripcion: data?.description || '',
          categoria: data?.category ?? '',
          stock: '',
          activo: data?.isActive !== undefined ? data?.isActive : true,
          featured: data?.featured || false,
          hasOptions: data?.hasOptions || false,
          optionsDescription: data?.optionsDescription || '',
        });
        const loadedImages = Array.isArray(data?.images) && data.images.length > 0
          ? data.images.map((url, i) => ({ id: `loaded-${i}-${url}`, url, alt: data?.name, name: `product-image-${i}`, status: 'uploaded' }))
          : (data?.imageUrl ? [{ id: 1, url: data.imageUrl, alt: data?.name, name: 'product-image', status: 'uploaded' }] : []);
        if (loadedImages.length) setImages(loadedImages);
        setPublicCode(data?.publicCode || '');
      } catch (e) { navigate('/product-management'); }
      finally { setPageLoading(false); }
    };
    loadProduct();
  }, [productId, isEditing]);

  useEffect(() => {
    if (saveSuccess) { const t = setTimeout(() => setSaveSuccess(false), 3000); return () => clearTimeout(t); }
  }, [saveSuccess]);

  // Si el contexto no tiene negocio pero el usuario está autenticado, intentar refrescar una vez
  useEffect(() => {
    if (user && !business && !businessLoading && !refreshAttempted.current) {
      refreshAttempted.current = true;
      refreshBusiness();
    }
  }, [user, business, businessLoading, refreshBusiness]);

  // Categorías del rubro del negocio (para selector cuando useCategories está activo)
  useEffect(() => {
    if (!business?.rubroId || !business?.designSettings?.useCategories) {
      setRubroCategories([]);
      return;
    }
    getCategoriesByRubroId(business.rubroId).then(({ data }) => setRubroCategories(data || []));
  }, [business?.rubroId, business?.designSettings?.useCategories]);

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors?.[field]) setErrors(prev => { const e = { ...prev }; delete e?.[field]; return e; });
  };

  const handleImproveWithAi = React.useCallback(async (text, productName) => {
    setIsImprovingDescription(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.warning('Inicia sesión para usar esta función');
        return;
      }
      const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
      const endpoint = `${supabaseUrl}/functions/v1/improve-product-description`;
      console.log('[Mejorar con IA] Endpoint:', endpoint);
      const inputText = (text || '').slice(0, 300);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({
          text: inputText,
          productName: productName || '',
          maxDescriptionLength: 300,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[Mejorar con IA] Error API:', res.status, res.statusText, data);
        toast.error(data?.error ?? 'No se pudo mejorar la descripción');
        return;
      }
      const improvedTitle = typeof data?.title === 'string' ? data.title.trim() : '';
      const improvedDesc = typeof data?.description === 'string' ? data.description.trim() : '';
      if (!improvedDesc) {
        toast.error('No se obtuvo descripción. Intenta de nuevo.');
        return;
      }
      setFormData((prev) => ({
        ...prev,
        descripcion: improvedDesc.slice(0, 300),
        ...((!prev?.nombre?.trim() && improvedTitle) ? { nombre: improvedTitle.slice(0, 80) } : {}),
      }));

      // Mostrar hashtags en un toast para que el usuario los pueda copiar
      const hashtags = Array.isArray(data?.hashtags) && data.hashtags.length > 0
        ? data.hashtags.filter((h) => typeof h === 'string').map((h) => `#${h}`).join(' ')
        : null;
      if (hashtags) {
        toast.success(`Hashtags sugeridos: ${hashtags}`);
      }
    } catch (err) {
      console.error('[Mejorar con IA] Excepción:', err);
      toast.error('Error de conexión. Intenta de nuevo.');
    } finally {
      setIsImprovingDescription(false);
    }
  }, [toast]);

  const handleUploadRequested = React.useCallback(async (imageId, file) => {
    console.log('[ProductEditor] handleUploadRequested', { imageId, hasFile: !!file, businessId: business?.id ?? null, productId: productId ?? null });
    if (!file) {
      console.warn('[ProductEditor] handleUploadRequested: sin archivo, ignorando');
      return;
    }
    if (!business?.id) {
      console.warn('[ProductEditor] handleUploadRequested: sin business.id, marcando error');
      setImages(prev => prev?.map(img => img?.id === imageId ? { ...img, status: 'error', error: 'Negocio no cargado. Espera un momento o recarga la página.' } : img));
      return;
    }

    setImages(prev => prev?.map(img => img?.id === imageId ? { ...img, status: 'uploading' } : img));
    console.log('[ProductEditor] Estado actualizado a "uploading" para', imageId);

    let fileToUpload = file;
    try {
      fileToUpload = await convertUnsupportedImageToJpeg(file);
    } catch (e) {
      console.error('[ProductEditor] Error al convertir imagen', e);
      setImages(prev => prev?.map(img => img?.id === imageId ? { ...img, status: 'error', error: e?.message || 'No se pudo procesar la imagen' } : img));
      return;
    }

    try {
      console.log('[ProductEditor] Llamando uploadProductImage...');
      const { url, error: uploadErr } = await uploadProductImage(fileToUpload, business.id, productId || undefined);
      console.log('[ProductEditor] uploadProductImage terminó', { hasUrl: !!url, hasError: !!uploadErr, errorMsg: uploadErr?.message });
      setImages(prev => prev?.map(img => {
        if (img?.id !== imageId) return img;
        if (uploadErr) {
          const errMsg = typeof uploadErr?.message === 'string' ? uploadErr.message : (uploadErr?.error_description || JSON.stringify(uploadErr) || 'Error al subir');
          return { ...img, status: 'error', error: errMsg };
        }
        if (img?.url?.startsWith?.('blob:')) URL.revokeObjectURL(img.url);
        return { ...img, url, status: 'uploaded', file: undefined, error: undefined };
      }));
    } catch (e) {
      console.error('[ProductEditor] Excepción en upload', e);
      const errMsg = e?.message || (e?.error?.message) || 'Error de conexión al subir. Revisa la consola.';
      setImages(prev => prev?.map(img => img?.id === imageId ? { ...img, status: 'error', error: errMsg } : img));
    }
  }, [business?.id, productId]);

  const hasPendingOrUploadingImages = (images || []).some(img =>
    img?.status === 'pending' || img?.status === 'uploading' || (img?.file && img?.status !== 'uploaded' && img?.status !== 'error')
  );

  const validate = () => {
    const newErrors = {};
    if (!formData?.nombre?.trim()) newErrors.nombre = 'El nombre del producto es obligatorio.';
    const priceNum = Number(formData?.precio);
    if (formData?.precio === '' || formData?.precio === null || formData?.precio === undefined || !Number.isFinite(priceNum) || priceNum <= 0) newErrors.precio = 'Ingresa un precio válido (entero mayor a 0).';
    return newErrors;
  };

  const handleSave = async (andNew = false) => {
    const validationErrors = validate();
    if (Object.keys(validationErrors)?.length > 0) { setErrors(validationErrors); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const wouldActivate = formData?.activo === true && (isEditing ? initialActivoRef.current !== true : true);
    if (wouldActivate) {
      guard.runIfConfirmed(() => doSave(andNew));
      return;
    }
    await doSave(andNew);
  };

  const doSave = async (andNew = false) => {
    if (hasPendingOrUploadingImages) {
      setErrors(prev => ({ ...prev, general: 'Espera a que terminen de subir todas las imágenes.' }));
      return;
    }
    let biz = business;
    if (!biz?.id) {
      const { data: fetched } = await getMyBusiness();
      if (fetched) {
        biz = fetched;
        refreshBusiness();
      } else {
        setErrors({
          general: 'No se encontró tu negocio. Ve a Mi Tienda para crear o completar la configuración.',
          configPath: '/business-configuration',
        });
        return;
      }
    }
    setIsSaving(true);
    try {
      let imageUrl = null;
      const firstImage = images?.[0];
      const uploadedFirst = firstImage?.status === 'uploaded' && firstImage?.url;
      if (uploadedFirst) {
        imageUrl = firstImage.url;
      } else if (firstImage?.file) {
        let fileToUpload = firstImage.file;
        try {
          fileToUpload = await convertUnsupportedImageToJpeg(firstImage.file);
        } catch (e) {
          setErrors(prev => ({ ...prev, general: 'No se pudo procesar la imagen: ' + (e?.message || 'Usa JPG o PNG.') }));
          return;
        }
        const { url, error: uploadErr } = await uploadProductImage(fileToUpload, biz?.id, productId || undefined);
        if (uploadErr) {
          setErrors(prev => ({ ...prev, general: 'Error al subir la imagen: ' + (uploadErr?.message || 'Intenta de nuevo.') }));
          return;
        }
        imageUrl = url;
      } else if (firstImage?.url && !firstImage?.url?.startsWith('blob:')) {
        imageUrl = firstImage?.url;
      }
      const imagesUrls = (images || [])
        ?.filter(i => (i?.status === 'uploaded' && i?.url) || (i?.url && !i?.url?.startsWith?.('blob:')))
        ?.map(i => i?.url) ?? [];
      const finalImageUrl = imageUrl || imagesUrls?.[0] || null;
      const productData = {
        name: formData?.nombre,
        description: formData?.descripcion || null,
        price: Math.round(Number(formData?.precio)),
        imageUrl: finalImageUrl,
        images: imagesUrls?.length ? imagesUrls : (finalImageUrl ? [finalImageUrl] : []),
        isActive: formData?.activo,
        featured: formData?.featured,
        onSale: formData?.onSale,
        hasOptions: formData?.hasOptions,
        optionsDescription: formData?.hasOptions ? (formData?.optionsDescription || null) : null,
        category: formData?.categoria?.trim() || null,
      };
      const result = isEditing
        ? await updateProduct(productId, productData)
        : await createProduct(biz?.id, productData);
      if (result?.error) { setErrors({ general: result?.error?.message || 'Error al guardar el producto.' }); return; }
      setIsSaving(false);
      setSaveSuccess(true);
      if (andNew) {
        setFormData({ ...EMPTY_FORM });
        setImages([]);
        setVariants([]);
        setPublicCode('');
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
    <DashboardAppShell backgroundColor="var(--color-background)">
        {/* Header — respeta safe-area */}
        <PanelHeader
          leftAction={(
            <button
              onClick={handleCancel}
              className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors"
              aria-label="Volver"
            >
              <Icon name="ArrowLeft" size={17} color="var(--color-foreground)" />
            </button>
          )}
          title={(
            <h1
              className="text-base font-bold truncate"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}
            >
              {isEditing ? 'Editar producto' : 'Nuevo producto'}
            </h1>
          )}
          subtitle={(
            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 mt-0.5">
              <button onClick={() => navigate('/dashboard')} className="text-xs hover:underline" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Dashboard</button>
              <Icon name="ChevronRight" size={11} color="var(--color-muted-foreground)" />
              <button onClick={() => navigate('/product-management')} className="text-xs hover:underline" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Productos</button>
              <Icon name="ChevronRight" size={11} color="var(--color-muted-foreground)" />
              <span className="text-xs" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{isEditing ? 'Editar' : 'Nuevo'}</span>
            </nav>
          )}
        >
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
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
            {formData?.onSale && (
              <span
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  backgroundColor: 'rgba(220,38,38,0.1)',
                  color: '#dc2626',
                  fontFamily: 'var(--font-caption)',
                }}
              >
                <Icon name="Tag" size={11} color="#dc2626" />
                Oferta
              </span>
            )}
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
        </PanelHeader>

        {/* Main content */}
        <DashboardLayoutContent className="page-enter lg:pb-0">
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
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>
                        {errors?.configPath ? 'Configuración requerida' : 'Por favor corrige los siguientes errores:'}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {Object.entries(errors)
                          ?.filter(([k]) => k !== 'configPath')
                          ?.map(([k, err]) => (
                            <li key={k} className="text-xs" style={{ color: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}>• {err}</li>
                          ))}
                      </ul>
                      {errors?.configPath && (
                        <button
                          type="button"
                          onClick={() => navigate(errors.configPath)}
                          className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
                        >
                          Ir a Mi Tienda
                        </button>
                      )}
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
                  <ImageUploadSection images={images} onImagesChange={setImages} businessId={business?.id} onUploadRequested={handleUploadRequested} />
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
                  <ProductFormFields
                    formData={formData}
                    errors={errors}
                    onChange={handleFieldChange}
                    useCategories={business?.designSettings?.useCategories === true && !!business?.rubroId}
                    categories={rubroCategories}
                    onImproveWithAi={canUseAi ? handleImproveWithAi : undefined}
                    isImprovingDescription={isImprovingDescription}
                    publicCode={isEditing ? publicCode : ''}
                  />
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
                    onSale={formData?.onSale}
                    onActiveChange={(val) => handleFieldChange('activo', val)}
                    onFeaturedChange={(val) => handleFieldChange('featured', val)}
                    onOnSaleChange={(val) => handleFieldChange('onSale', val)}
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
                    descripcion={formData?.descripcion}
                    activo={formData?.activo}
                    featured={formData?.featured}
                    onSale={formData?.onSale}
                    images={images}
                  />
                </div>
              </div>

            </div>
        </DashboardLayoutContent>

        <SaveBar
          isEditing={isEditing}
          isSaving={isSaving}
          saveSuccess={saveSuccess}
          saveDisabled={hasPendingOrUploadingImages}
          onSave={() => handleSave(false)}
          onSaveAndNew={() => handleSave(true)}
          onCancel={handleCancel}
        />
    </DashboardAppShell>
  );
}