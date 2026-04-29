import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { isRestaurantBusiness } from '../../utils/businessType';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import ImageUploadSection from './components/ImageUploadSection';
import ProductFormFields from './components/ProductFormFields';
import ProductToggles from './components/ProductToggles';
import ProductPreview from './components/ProductPreview';
import SaveBar from './components/SaveBar';
import ProductOptionsSection from './components/ProductOptionsSection';
import VideoUploadSection from './components/VideoUploadSection';
import { useAuth } from '../../contexts/AuthContext';
import {
  getProduct,
  createProduct,
  createProductDraft,
  deleteProduct,
  updateProduct,
  uploadProductImage,
  uploadProductMainImage,
  getProducts,
  getMyBusiness,
  getCategoriesByRubroId,
  getBusinessCategories,
  getEffectivePlanSlug,
} from '../../services/waBusinessService';
import { convertUnsupportedImageToJpeg } from '../../utils/imageUploadUtils';
import { useToast } from '../../components/ui/Toast';
import { useConfirmedEmailGuard } from '../../hooks/useConfirmedEmailGuard';
import { supabase } from '../../lib/supabase';
import { getBusinessLocale } from '../../lib/locale/businessLocale';
import { resolveVentaAiProductDescriptionEndpoint } from '../../lib/ai/resolveVentaAiProductDescriptionUrl.js';
import { appendCacheBust } from '../../services/mediaUploadService';

const EMPTY_FORM = {
  nombre: '',
  precio: '',
  descripcion: '',
  longDescription: '',
  categoria: '',
  stock: '',
  activo: true,
  featured: false,
  isMainFeatured: false,
  onSale: false,
  compareAtPrice: '',
  hasOptions: false,
  optionsDescription: '',
  addOns: [],
  comboConfig: {
    enabled: false,
    groups: [],
  },
};

const ADDON_LIMIT = 5;
const ADDON_SEARCH_MIN = 2;
const ADDON_SEARCH_MAX_RESULTS = 10;

const buildAddonId = () => `addon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const buildComboId = (prefix = 'combo') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeAddon = (addon, index = 0) => {
  if (!addon || typeof addon !== 'object') return null;

  if (addon?.type === 'product') {
    return {
      id: addon?.id || `addon-product-${addon?.productId || index}`,
      type: 'product',
      productId: addon?.productId || null,
      active: addon?.active !== false,
    };
  }

  const priceValue = Number(addon?.price);
  return {
    id: addon?.id || `addon-manual-${index}`,
    type: 'manual',
    emoji: addon?.emoji || '',
    label: addon?.label || '',
    price: Number.isFinite(priceValue) && priceValue >= 0 ? Math.round(priceValue) : 0,
    active: addon?.active !== false,
  };
};

const normalizeComboItem = (item, index = 0) => {
  if (!item || typeof item !== 'object') return null;
  const priceValue = Number(item?.price);
  return {
    id: item?.id || `combo-item-${index}`,
    label: item?.label || '',
    price: Number.isFinite(priceValue) && priceValue >= 0 ? Math.round(priceValue) : 0,
  };
};

const normalizeComboGroup = (group, index = 0) => {
  if (!group || typeof group !== 'object') return null;
  const maxValue = Number(group?.maxSelections);
  return {
    id: group?.id || `combo-group-${index}`,
    label: group?.label || '',
    required: group?.required === true,
    maxSelections: Number.isFinite(maxValue) && maxValue > 0 ? Math.round(maxValue) : 1,
    items: Array.isArray(group?.items)
      ? group.items.map((item, itemIndex) => normalizeComboItem(item, itemIndex)).filter(Boolean)
      : [],
  };
};

const normalizeComboConfig = (config) => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {
      enabled: false,
      groups: [],
    };
  }

  return {
    enabled: config?.enabled === true,
    groups: Array.isArray(config?.groups)
      ? config.groups.map((group, index) => normalizeComboGroup(group, index)).filter(Boolean)
      : [],
  };
};

const isReusableComboGroup = (group) => {
  if (!group || typeof group !== 'object') return false;
  const label = String(group?.label || '').trim();
  if (!label) return false;
  const items = Array.isArray(group?.items) ? group.items : [];
  return items.some((item) => String(item?.label || '').trim());
};

const cloneComboGroup = (group, { labelSuffix = '' } = {}) => {
  const normalizedGroup = normalizeComboGroup(group);
  if (!normalizedGroup || !isReusableComboGroup(normalizedGroup)) return null;
  const nextLabel = normalizedGroup.label?.trim() || 'Grupo';
  return {
    id: buildComboId('combo-group'),
    label: labelSuffix ? `${nextLabel}${labelSuffix}` : nextLabel,
    required: normalizedGroup.required === true,
    maxSelections: Math.max(1, Number(normalizedGroup.maxSelections) || 1),
    items: normalizedGroup.items
      .filter((item) => String(item?.label || '').trim())
      .map((item) => ({
        id: buildComboId('combo-item'),
        label: item.label,
        price: Math.max(0, Number(item.price) || 0),
      })),
  };
};

export default function ProductEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const productId = searchParams?.get('id');
  const isEditing = !!productId;
  const { business, user, businessLoading, refreshBusiness } = useAuth();
  const refreshAttempted = React.useRef(false);
  const imagesRef = React.useRef([]);
  const previousImagesRef = React.useRef([]);
  const uploadRequestTokensRef = React.useRef({});
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [images, setImages] = useState([]);
  const [currentProductId, setCurrentProductId] = useState(productId || null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [video, setVideo] = useState(null);
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pageLoading, setPageLoading] = useState(isEditing);
  const [rubroCategories, setRubroCategories] = useState([]);
  const [businessCategories, setBusinessCategories] = useState([]);
  const [businessProducts, setBusinessProducts] = useState([]);
  const [comboImportOpen, setComboImportOpen] = useState(false);
  const [selectedReusableProductId, setSelectedReusableProductId] = useState('');
  const [selectedReusableGroupId, setSelectedReusableGroupId] = useState('');
  const [addonCreationMode, setAddonCreationMode] = useState(null);
  const [addonSearchQuery, setAddonSearchQuery] = useState('');
  const [manualAddonDraft, setManualAddonDraft] = useState({ emoji: '', label: '', price: '' });
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);
  const [publicCode, setPublicCode] = useState('');
  const toast = useToast();
  const effectiveProductId = currentProductId || productId || null;
  const isEditingFlow = !!effectiveProductId;

  const effectivePlan = getEffectivePlanSlug(business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt);
  const canUseAi = effectivePlan === 'pro' || effectivePlan === 'business';
  const guard = useConfirmedEmailGuard();
  const locale = getBusinessLocale(business, {
    preferredCountryCode: user?.user_metadata?.country_code ?? null,
  });
  const initialActivoRef = React.useRef(null);
  const isRestaurant = isRestaurantBusiness(business);
  const normalizedAddOns = Array.isArray(formData?.addOns)
    ? formData.addOns.map((addon, index) => normalizeAddon(addon, index)).filter(Boolean)
    : [];
  const normalizedComboConfig = normalizeComboConfig(formData?.comboConfig);
  const comboGroups = normalizedComboConfig.groups;
  const reusableComboProducts = businessProducts.reduce((acc, candidate) => {
    if (!candidate?.id || candidate.id === effectiveProductId) return acc;
    const candidateComboConfig = normalizeComboConfig(candidate?.comboConfig);
    if (!candidateComboConfig?.enabled) return acc;
    const validGroups = candidateComboConfig.groups
      .filter((group) => isReusableComboGroup(group))
      .map((group) => ({
        ...group,
        sourceProductId: candidate.id,
        sourceProductName: candidate?.name || 'Producto sin nombre',
      }));
    if (validGroups.length === 0) return acc;
    acc.push({
      id: candidate.id,
      name: candidate?.name || 'Producto sin nombre',
      category: candidate?.category || '',
      groups: validGroups,
    });
    return acc;
  }, []);
  const selectedReusableProduct = reusableComboProducts.find((product) => product.id === selectedReusableProductId) || null;
  const selectedReusableGroup = selectedReusableProduct?.groups.find((group) => group.id === selectedReusableGroupId) || null;
  const productAddonIds = new Set(
    normalizedAddOns
      .filter((addon) => addon?.type === 'product' && addon?.productId)
      .map((addon) => addon.productId),
  );
  const addonSearchTerm = addonSearchQuery.trim().toLowerCase();
  const availableAddonResults = addonSearchTerm.length >= ADDON_SEARCH_MIN
    ? businessProducts
        .filter((candidate) => {
          if (!candidate?.id || candidate.id === effectiveProductId) return false;
          if (productAddonIds.has(candidate.id)) return false;
          const haystack = [candidate?.name, candidate?.category].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(addonSearchTerm);
        })
        .slice(0, ADDON_SEARCH_MAX_RESULTS)
    : [];
  const formatAddonPrice = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 'Precio no disponible';
    try {
      return new Intl.NumberFormat(locale?.locale || 'es-CL', {
        style: 'currency',
        currency: locale?.currencyCode || 'CLP',
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return amount.toLocaleString(locale?.locale || 'es-CL');
    }
  };

  const revokeBlobUrl = React.useCallback((url) => {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }, []);

  useEffect(() => {
    if (!isEditing || !productId) return;
    const loadProduct = async () => {
      setPageLoading(true);
      try {
        const { data, error } = await getProduct(productId);
        if (error || !data) { navigate('/product-management'); return; }
        setCurrentProductId(data?.id || productId);
        initialActivoRef.current = data?.isActive !== undefined ? data?.isActive : true;
        setFormData({
          nombre: data?.name || '',
          precio: data?.price != null ? Number(data.price) : '',
          descripcion: data?.description || '',
          longDescription: data?.longDescription || '',
          categoria: data?.category ?? '',
          stock: '',
          activo: data?.isActive !== undefined ? data?.isActive : true,
          featured: data?.featured || false,
          isMainFeatured: data?.isMainFeatured === true,
          onSale: data?.onSale || false,
          compareAtPrice: data?.compareAtPrice != null ? Number(data.compareAtPrice) : '',
          hasOptions: data?.hasOptions || false,
          optionsDescription: data?.optionsDescription || '',
          addOns: Array.isArray(data?.addOns) ? data.addOns : [],
          comboConfig: normalizeComboConfig(data?.comboConfig),
        });
        const loadedImages = Array.isArray(data?.images) && data.images.length > 0
          ? data.images.map((url, i) => ({
              id: `loaded-${i}-${url}`,
              url,
              persistedUrl: url,
              alt: data?.name,
              name: `product-image-${i}`,
              status: 'uploaded',
            }))
          : (data?.imageUrl
              ? [{
                  id: 1,
                  url: data.imageUrl,
                  persistedUrl: data.imageUrl,
                  alt: data?.name,
                  name: 'product-image',
                  status: 'uploaded',
                }]
              : []);
        if (loadedImages.length) setImages(loadedImages);
        setImagePreviewUrl(data?.imageUrl || loadedImages?.[0]?.url || null);
        setImageUploadError('');
        setImageUploading(false);
        if (data?.videoUrl) {
          setVideo({
            videoUrl: data.videoUrl,
            videoThumbnailUrl: data.videoThumbnailUrl || null,
            videoPath: data.videoPath || null,
            videoThumbnailPath: data.videoThumbnailPath || null,
          });
        }
        setPublicCode(data?.publicCode || '');
      } catch (e) { navigate('/product-management'); }
      finally { setPageLoading(false); }
    };
    loadProduct();
  }, [productId, isEditing]);

  useEffect(() => {
    if (saveSuccess) { const t = setTimeout(() => setSaveSuccess(false), 3000); return () => clearTimeout(t); }
  }, [saveSuccess]);

  useEffect(() => {
    const previousImages = previousImagesRef.current || [];
    const currentUrls = new Set((images || []).map((img) => img?.url).filter(Boolean));
    previousImages.forEach((img) => {
      if (img?.url?.startsWith?.('blob:') && !currentUrls.has(img.url)) {
        revokeBlobUrl(img.url);
      }
    });
    previousImagesRef.current = images || [];
    imagesRef.current = images || [];
  }, [images, revokeBlobUrl]);

  useEffect(() => {
    return () => {
      (imagesRef.current || []).forEach((img) => {
        revokeBlobUrl(img?.url);
      });
    };
  }, [revokeBlobUrl]);

  useEffect(() => {
    const firstImage = images?.[0] || null;
    if (!firstImage) {
      setImagePreviewUrl(null);
      setImageUploadError('');
      setImageUploading(false);
      return;
    }
    setImagePreviewUrl(firstImage?.url || null);
    if (firstImage?.status !== 'uploading') {
      setImageUploading(false);
    }
    if (firstImage?.status !== 'error' && imageUploadError) {
      setImageUploadError('');
    }
  }, [images]);

  // Si el contexto no tiene negocio pero el usuario está autenticado, intentar refrescar una vez
  useEffect(() => {
    if (user && !business && !businessLoading && !refreshAttempted.current) {
      refreshAttempted.current = true;
      refreshBusiness();
    }
  }, [user, business, businessLoading, refreshBusiness]);

  // Categorías del rubro (globales) + propias del negocio — se cargan cuando useCategories está activo
  useEffect(() => {
    if (!business?.designSettings?.useCategories) {
      setRubroCategories([]);
      setBusinessCategories([]);
      return;
    }
    if (business?.rubroId) {
      getCategoriesByRubroId(business.rubroId).then(({ data }) => setRubroCategories(data || []));
    }
    if (business?.id) {
      getBusinessCategories(business.id).then(({ data }) => setBusinessCategories(data || []));
    }
  }, [business?.id, business?.rubroId, business?.designSettings?.useCategories]);

  useEffect(() => {
    if (!business?.id || !isRestaurant) {
      setBusinessProducts([]);
      return;
    }

    let cancelled = false;
    getProducts(business.id).then(({ data }) => {
      if (!cancelled) {
        setBusinessProducts(Array.isArray(data) ? data : []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [business?.id, isRestaurant]);

  useEffect(() => {
    setSelectedReusableGroupId('');
  }, [selectedReusableProductId]);

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors?.[field]) setErrors(prev => { const e = { ...prev }; delete e?.[field]; return e; });
  };

  const updateAddOns = React.useCallback((updater) => {
    setFormData((prev) => {
      const nextAddOns = typeof updater === 'function' ? updater(Array.isArray(prev?.addOns) ? prev.addOns : []) : updater;
      return { ...prev, addOns: nextAddOns };
    });
  }, []);

  const updateComboConfig = React.useCallback((updater) => {
    setFormData((prev) => {
      const current = normalizeComboConfig(prev?.comboConfig);
      const nextComboConfig = typeof updater === 'function' ? updater(current) : updater;
      return {
        ...prev,
        comboConfig: normalizeComboConfig(nextComboConfig),
      };
    });
  }, []);

  const addComboGroup = React.useCallback(() => {
    updateComboConfig((current) => ({
      ...current,
      enabled: true,
      groups: [
        ...current.groups,
        {
          id: buildComboId('combo-group'),
          label: '',
          required: false,
          maxSelections: 1,
          items: [
            {
              id: buildComboId('combo-item'),
              label: '',
              price: 0,
            },
          ],
        },
      ],
    }));
  }, [updateComboConfig]);

  const updateComboGroup = React.useCallback((groupId, updates) => {
    updateComboConfig((current) => ({
      ...current,
      groups: current.groups.map((group) => (
        group?.id === groupId
          ? {
              ...group,
              ...updates,
              maxSelections: updates?.maxSelections !== undefined
                ? Math.max(1, Number(updates.maxSelections) || 1)
                : group.maxSelections,
            }
          : group
      )),
    }));
  }, [updateComboConfig]);

  const removeComboGroup = React.useCallback((groupId) => {
    updateComboConfig((current) => ({
      ...current,
      groups: current.groups.filter((group) => group?.id !== groupId),
    }));
  }, [updateComboConfig]);

  const addComboItem = React.useCallback((groupId) => {
    updateComboConfig((current) => ({
      ...current,
      groups: current.groups.map((group) => (
        group?.id === groupId
          ? {
              ...group,
              items: [
                ...group.items,
                {
                  id: buildComboId('combo-item'),
                  label: '',
                  price: 0,
                },
              ],
            }
          : group
      )),
    }));
  }, [updateComboConfig]);

  const updateComboItem = React.useCallback((groupId, itemId, updates) => {
    updateComboConfig((current) => ({
      ...current,
      groups: current.groups.map((group) => (
        group?.id === groupId
          ? {
              ...group,
              items: group.items.map((item) => (
                item?.id === itemId
                  ? {
                      ...item,
                      ...updates,
                      price: updates?.price !== undefined ? Math.max(0, Number(updates.price) || 0) : item.price,
                    }
                  : item
              )),
            }
          : group
      )),
    }));
  }, [updateComboConfig]);

  const removeComboItem = React.useCallback((groupId, itemId) => {
    updateComboConfig((current) => ({
      ...current,
      groups: current.groups.map((group) => (
        group?.id === groupId
          ? {
              ...group,
              items: group.items.filter((item) => item?.id !== itemId),
            }
          : group
      )),
    }));
  }, [updateComboConfig]);

  const duplicateComboGroup = React.useCallback((groupId) => {
    updateComboConfig((current) => {
      const sourceGroup = current.groups.find((group) => group?.id === groupId);
      const clonedGroup = cloneComboGroup(sourceGroup, { labelSuffix: ' (copia)' });
      if (!clonedGroup) return current;
      return {
        ...current,
        groups: [...current.groups, clonedGroup],
      };
    });
  }, [updateComboConfig]);

  const importReusableComboGroup = React.useCallback(() => {
    const clonedGroup = cloneComboGroup(selectedReusableGroup);
    if (!clonedGroup) return;
    updateComboConfig((current) => ({
      ...current,
      enabled: true,
      groups: [...current.groups, clonedGroup],
    }));
    setComboImportOpen(false);
    setSelectedReusableProductId('');
    setSelectedReusableGroupId('');
  }, [selectedReusableGroup, updateComboConfig]);

  const addProductAddon = React.useCallback((candidate) => {
    if (!candidate?.id) return;
    updateAddOns((current) => {
      const normalizedCurrent = Array.isArray(current) ? current.map((addon, index) => normalizeAddon(addon, index)).filter(Boolean) : [];
      if (normalizedCurrent.length >= ADDON_LIMIT) return current;
      if (candidate.id === effectiveProductId) return current;
      if (normalizedCurrent.some((addon) => addon?.type === 'product' && addon?.productId === candidate.id)) return current;
      return [
        ...normalizedCurrent,
        { id: buildAddonId(), type: 'product', productId: candidate.id, active: true },
      ];
    });
    setAddonSearchQuery('');
    setAddonCreationMode(null);
  }, [effectiveProductId, updateAddOns]);

  const addManualAddon = React.useCallback(() => {
    const label = manualAddonDraft?.label?.trim() || '';
    if (!label) return;
    updateAddOns((current) => {
      const normalizedCurrent = Array.isArray(current) ? current.map((addon, index) => normalizeAddon(addon, index)).filter(Boolean) : [];
      if (normalizedCurrent.length >= ADDON_LIMIT) return current;
      const parsedPrice = manualAddonDraft?.price === '' ? 0 : Number(manualAddonDraft.price);
      return [
        ...normalizedCurrent,
        {
          id: buildAddonId(),
          type: 'manual',
          emoji: manualAddonDraft?.emoji || '',
          label,
          price: Number.isFinite(parsedPrice) && parsedPrice >= 0 ? Math.round(parsedPrice) : 0,
          active: true,
        },
      ];
    });
    setManualAddonDraft({ emoji: '', label: '', price: '' });
    setAddonCreationMode(null);
  }, [manualAddonDraft, updateAddOns]);

  const handleImproveWithAi = React.useCallback(async (text, productName) => {
    setIsImprovingDescription(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.warning('Inicia sesión para usar esta función');
        return;
      }
      const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
      const { ventaAiUrl, useVentaAi } = resolveVentaAiProductDescriptionEndpoint();
      if (useVentaAi && !business?.id) {
        toast.error('Carga el negocio antes de usar la IA.');
        return;
      }
      const endpoint = useVentaAi
        ? ventaAiUrl
        : `${supabaseUrl}/functions/v1/improve-product-description`;
      console.log('[Mejorar con IA] Endpoint:', useVentaAi ? '(canónica: /api/v1/ai/generate-product-description)' : '(deprecado: edge improve-product-description)');
      const inputText = (text || '').slice(0, 300);
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
                ...(effectiveProductId ? { productId: effectiveProductId } : {}),
                text: inputText,
                productName: productName || '',
                maxDescriptionLength: 300,
              }
            : {
                text: inputText,
                productName: productName || '',
                maxDescriptionLength: 300,
              },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        console.error('[Mejorar con IA] Error API:', res.status, data?.code);
        if (res.status === 429) {
          toast.error('Demasiadas solicitudes. Espera un momento e intenta de nuevo.');
        } else if (res.status === 504) {
          toast.error('El servicio de IA tardó demasiado. Intenta de nuevo.');
        } else {
          toast.error('No pudimos generar la respuesta en este momento. Intenta nuevamente en unos segundos.');
        }
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

      const hashtags = Array.isArray(data?.hashtags) && data.hashtags.length > 0
        ? data.hashtags.filter((h) => typeof h === 'string').map((h) => `#${h}`).join(' ')
        : null;
      if (useVentaAi && data?.cached === true) {
        toast.success(
          hashtags
            ? `⚡ Generado previamente (caché) — ${hashtags}`
            : '⚡ Generado previamente (caché)',
        );
      } else if (hashtags) {
        toast.success(`Hashtags sugeridos: ${hashtags}`);
      }
    } catch (err) {
      console.error('[Mejorar con IA] Excepción:', err);
      toast.error('Error de conexión. Intenta de nuevo.');
    } finally {
      setIsImprovingDescription(false);
    }
  }, [toast, business?.id, effectiveProductId]);

  const buildDraftPayload = React.useCallback(() => ({
    name: formData?.nombre?.trim() || 'Producto en edicion',
    price: formData?.precio,
    description: formData?.descripcion?.trim() || null,
    category: formData?.categoria?.trim() || null,
  }), [formData]);

  const ensureProductIdForMainImageUpload = React.useCallback(async () => {
    if (currentProductId) {
      return { productId: currentProductId, createdDraft: false };
    }
    if (!business?.id) {
      throw new Error('Negocio no cargado. Espera un momento o recarga la pagina.');
    }

    const { data, error } = await createProductDraft(business.id, buildDraftPayload());
    if (error || !data?.id) {
      throw new Error(error?.message || 'No se pudo crear el borrador del producto para subir la imagen.');
    }

    setCurrentProductId(data.id);
    initialActivoRef.current = data?.isActive !== undefined ? data.isActive : false;
    return { productId: data.id, createdDraft: true };
  }, [business?.id, buildDraftPayload, currentProductId]);

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
        revokeBlobUrl(img?.url);
        return { ...img, url, status: 'uploaded', file: undefined, error: undefined };
      }));
    } catch (e) {
      console.error('[ProductEditor] Excepción en upload', e);
      const errMsg = e?.message || (e?.error?.message) || 'Error de conexión al subir. Revisa la consola.';
      setImages(prev => prev?.map(img => img?.id === imageId ? { ...img, status: 'error', error: errMsg } : img));
    }
  }, [business?.id, productId, revokeBlobUrl]);

  const handleMainAwareUploadRequested = React.useCallback(async (imageId, file, meta = {}) => {
    if (!file) {
      return;
    }

    const isMainImage = meta?.isMainImage === true || imageId === (images?.[0]?.id || imageId);
    const selectedImage = (images || []).find((img) => img?.id === imageId) || null;
    const selectedImageIndex = Math.max(0, (images || []).findIndex((img) => img?.id === imageId));
    const requestToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    uploadRequestTokensRef.current[imageId] = requestToken;

    if (!business?.id) {
      const message = 'Negocio no cargado. Espera un momento o recarga la pagina.';
      if (isMainImage) {
        setImageUploading(false);
        setImageUploadError(message);
      }
      setImages(prev => prev?.map(img => img?.id === imageId ? { ...img, status: 'error', error: message } : img));
      return;
    }

    if (isMainImage) {
      setImageUploading(true);
      setImageUploadError('');
      if (selectedImage?.url) setImagePreviewUrl(selectedImage.url);
    }

    setImages(prev => prev?.map(img => img?.id === imageId ? { ...img, status: 'uploading', error: undefined } : img));

    let fileToUpload = file;
    let ensuredProductId = currentProductId;
    let createdDraftForUpload = false;
    try {
      fileToUpload = await convertUnsupportedImageToJpeg(file);
    } catch (e) {
      const message = e?.message || 'No se pudo procesar la imagen.';
      if (isMainImage) {
        setImageUploading(false);
        setImageUploadError(message);
      }
      setImages(prev => prev?.map(img => img?.id === imageId ? { ...img, status: 'error', error: message } : img));
      return;
    }

    try {
      let persistedUrl = null;
      let renderUrl = null;

      if (isMainImage) {
        const ensureResult = await ensureProductIdForMainImageUpload();
        ensuredProductId = ensureResult?.productId;
        createdDraftForUpload = ensureResult?.createdDraft === true;
        const uploaded = await uploadProductMainImage({
          file: fileToUpload,
          businessId: business.id,
          productId: ensuredProductId,
        });
        if (uploadRequestTokensRef.current[imageId] !== requestToken) {
          return;
        }
        const nextVersion = Date.now();
        persistedUrl = uploaded.url;
        renderUrl = appendCacheBust(uploaded.url, nextVersion);
        setImagePreviewUrl(renderUrl);
      } else {
        const ensureResult = currentProductId
          ? { productId: currentProductId, createdDraft: false }
          : await ensureProductIdForMainImageUpload();
        ensuredProductId = ensureResult?.productId;
        createdDraftForUpload = ensureResult?.createdDraft === true;
        const galleryIndex = Math.max(0, selectedImageIndex - 1);
        const { url, error: uploadErr } = await uploadProductImage(fileToUpload, business.id, ensuredProductId, galleryIndex);
        if (uploadErr) {
          throw new Error(uploadErr?.message || 'No se pudo subir la imagen.');
        }
        if (uploadRequestTokensRef.current[imageId] !== requestToken) {
          return;
        }
        persistedUrl = url;
        renderUrl = url;
      }

      setImages(prev => prev?.map(img => {
        if (img?.id !== imageId) return img;
        revokeBlobUrl(img?.url);
        return {
          ...img,
          url: renderUrl,
          persistedUrl,
          status: 'uploaded',
          file: undefined,
          error: undefined,
        };
      }));

      if (isMainImage) {
        setImageUploading(false);
        setImageUploadError('');
      }
    } catch (e) {
      const shouldHandleLatest = uploadRequestTokensRef.current[imageId] === requestToken;
      const errMsg = e?.message || (e?.error?.message) || 'Error de conexion al subir la imagen.';
      const shouldDeleteDraft = createdDraftForUpload && typeof ensuredProductId === 'string';
      if (shouldDeleteDraft) {
        const { error: deleteError } = await deleteProduct(ensuredProductId);
        if (!deleteError) {
          setCurrentProductId(null);
          initialActivoRef.current = null;
        }
      }
      if (isMainImage && shouldHandleLatest) {
        setImageUploading(false);
        setImageUploadError(errMsg);
      }
      if (shouldHandleLatest) {
        setImages(prev => prev?.map(img => img?.id === imageId ? { ...img, status: 'error', error: errMsg } : img));
      }
    }
  }, [business?.id, currentProductId, ensureProductIdForMainImageUpload, images, revokeBlobUrl]);

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
    const wouldActivate = formData?.activo === true && (isEditingFlow ? initialActivoRef.current !== true : true);
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
      const persistedImages = (images || [])
        ?.filter(i => (i?.status === 'uploaded' && (i?.persistedUrl || i?.url)) || (i?.persistedUrl || (i?.url && !i?.url?.startsWith?.('blob:'))))
        ?.map(i => i?.persistedUrl || i?.url?.split?.('?')?.[0] || i?.url)
        ?.filter(Boolean) ?? [];
      const finalImageUrl = persistedImages?.[0] || null;
      const rawCompareAt = formData?.compareAtPrice;
      const compareAtNum = rawCompareAt !== '' && rawCompareAt != null ? Number(rawCompareAt) : NaN;
      const productData = {
        name: formData?.nombre,
        description: formData?.descripcion || null,
        price: Math.round(Number(formData?.precio)),
        imageUrl: finalImageUrl,
        images: persistedImages?.length ? persistedImages : (finalImageUrl ? [finalImageUrl] : []),
        isDraft: false,
        isActive: formData?.activo,
        featured: formData?.featured,
        isMainFeatured: formData?.isMainFeatured === true,
        onSale: formData?.onSale,
        compareAtPrice: !isNaN(compareAtNum) ? Math.round(compareAtNum) : null,
        hasOptions: formData?.hasOptions,
        optionsDescription: formData?.hasOptions ? (formData?.optionsDescription || null) : null,
        longDescription: formData?.longDescription?.trim() || null,
        category: formData?.categoria?.trim() || null,
        addOns: normalizedAddOns,
        comboConfig: isRestaurant && normalizedComboConfig.enabled
          ? {
              enabled: true,
              groups: comboGroups.map((group) => ({
                id: group.id,
                label: group.label?.trim() || '',
                required: group.required === true,
                maxSelections: Math.max(1, Number(group.maxSelections) || 1),
                items: group.items.map((item) => ({
                  id: item.id,
                  label: item.label?.trim() || '',
                  price: Math.max(0, Number(item.price) || 0),
                })),
              })),
            }
          : null,
      };
      const result = currentProductId
        ? await updateProduct(currentProductId, productData)
        : await createProduct(biz?.id, productData);
      if (result?.error) { setErrors({ general: result?.error?.message || 'Error al guardar el producto.' }); return; }
      if (!currentProductId && result?.data?.id) {
        setCurrentProductId(result.data.id);
      }
      setIsSaving(false);
      setSaveSuccess(true);
      if (andNew) {
        setFormData({ ...EMPTY_FORM });
        setImages([]);
        setCurrentProductId(null);
        setImagePreviewUrl(null);
        setImageUploading(false);
        setImageUploadError('');
        setVideo(null);
        setPublicCode('');
        setAddonCreationMode(null);
        setAddonSearchQuery('');
        setManualAddonDraft({ emoji: '', label: '', price: '' });
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
              {isEditingFlow ? 'Editar producto' : 'Nuevo producto'}
            </h1>
          )}
          subtitle={(
            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 mt-0.5">
              <button onClick={() => navigate('/dashboard')} className="text-xs hover:underline" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Dashboard</button>
              <Icon name="ChevronRight" size={11} color="var(--color-muted-foreground)" />
              <button onClick={() => navigate('/product-management')} className="text-xs hover:underline" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Productos</button>
              <Icon name="ChevronRight" size={11} color="var(--color-muted-foreground)" />
              <span className="text-xs" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{isEditingFlow ? 'Editar' : 'Nuevo'}</span>
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
                  <ImageUploadSection
                    images={images}
                    onImagesChange={setImages}
                    businessId={business?.id}
                    onUploadRequested={handleMainAwareUploadRequested}
                    disabled={imageUploading}
                    uploadMessage={imageUploading ? 'Subiendo imagen principal...' : ''}
                    uploadError={imageUploadError}
                  />
                </div>

                {/* Video del producto */}
                <div
                  className="p-5 md:p-6 rounded-xl border"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}>
                      <Icon name="Video" size={15} color="var(--color-primary)" />
                    </div>
                    <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Video del producto</h2>
                  </div>
                  <VideoUploadSection
                    productId={effectiveProductId}
                    businessId={business?.id}
                    video={video}
                    onVideoChange={setVideo}
                  />
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
                    currencyCode={locale.currencyCode}
                    locale={locale.locale}
                    useCategories={business?.designSettings?.useCategories === true && (!!business?.rubroId || businessCategories.length > 0)}
                    businessCategories={businessCategories}
                    rubroCategories={rubroCategories}
                    onImproveWithAi={canUseAi ? handleImproveWithAi : undefined}
                    isImprovingDescription={isImprovingDescription}
                    publicCode={isEditingFlow ? publicCode : ''}
                    businessId={business?.id}
                    onCategoryCreated={(cat) => {
                      setBusinessCategories((prev) => [...prev, cat]);
                      toast.success(`Categoría «${cat.name}» creada`);
                    }}
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
                    slug={business?.slug ?? ''}
                    onActiveChange={(val) => handleFieldChange('activo', val)}
                    onFeaturedChange={(val) => handleFieldChange('featured', val)}
                    onOnSaleChange={(val) => handleFieldChange('onSale', val)}
                  />
                </div>

                <div
                  className="p-5 md:p-6 rounded-xl border"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(217,119,6,0.08)' }}>
                      <Icon name="Sparkles" size={15} color="#D97706" />
                    </div>
                    <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Destacado principal</h2>
                  </div>
                  <p className="text-xs mb-4" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    Muéstralo arriba de tu catálogo como el producto más importante.
                  </p>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData?.isMainFeatured === true}
                    onClick={() => handleFieldChange('isMainFeatured', !(formData?.isMainFeatured === true))}
                    className="w-full flex items-center justify-between p-4 rounded-xl border transition-all duration-200"
                    style={{
                      borderColor: formData?.isMainFeatured ? 'rgba(217,119,6,0.25)' : 'var(--color-border)',
                      backgroundColor: formData?.isMainFeatured ? 'rgba(217,119,6,0.06)' : 'transparent',
                    }}
                  >
                    <div className="text-left pr-4">
                      <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
                        Destacar este producto arriba del catálogo
                      </p>
                      <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-muted-foreground)' }}>
                        {isRestaurant
                          ? 'En modo restaurante se verá como Menú del día.'
                          : 'En tienda se verá como Producto destacado.'}
                      </p>
                    </div>
                    <span
                      className="relative inline-flex items-center w-12 h-6 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: formData?.isMainFeatured ? '#D97706' : 'var(--color-muted-foreground)',
                        transition: 'background-color 0.2s ease',
                      }}
                    >
                      <span
                        className="inline-block w-5 h-5 bg-white rounded-full shadow-sm"
                        style={{
                          transform: formData?.isMainFeatured ? 'translateX(26px)' : 'translateX(2px)',
                          transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                        }}
                      />
                    </span>
                  </button>
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

                {isRestaurant && (
                  <div
                    className="p-5 md:p-6 rounded-xl border"
                    style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                  >
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(14,165,233,0.10)' }}>
                        <Icon name="ChefHat" size={18} color="#0284c7" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Arma tu combo</h2>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(14,165,233,0.10)', color: '#0284c7', fontFamily: 'var(--font-caption)' }}>Restaurant</span>
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                          Crea pasos de selección para que el cliente arme su pedido antes de escribir por WhatsApp.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateComboConfig((current) => ({ ...current, enabled: !current.enabled }))}
                        className="relative inline-flex h-8 w-14 items-center rounded-full transition-colors"
                        style={{ backgroundColor: normalizedComboConfig.enabled ? '#0284c7' : 'rgba(148,163,184,0.45)' }}
                        aria-pressed={normalizedComboConfig.enabled}
                      >
                        <span
                          className="h-7 w-7 rounded-full bg-white shadow-sm"
                          style={{
                            transform: normalizedComboConfig.enabled ? 'translateX(27px)' : 'translateX(2px)',
                            transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                          }}
                        />
                      </button>
                    </div>

                    <p className="text-xs mb-4" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      {normalizedComboConfig.enabled
                        ? 'Activa grupos obligatorios u opcionales, define el máximo de elecciones y suma extras al total.'
                        : 'Actívalo si este producto necesita pasos como elegir acompañamiento, bebida o tamaño.'}
                    </p>

                    {normalizedComboConfig.enabled && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={addComboGroup}
                            className="inline-flex items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm font-medium transition-colors hover:border-sky-400"
                            style={{ borderColor: 'var(--color-border)', color: '#0284c7', fontFamily: 'var(--font-caption)' }}
                          >
                            <Icon name="Plus" size={14} color="currentColor" />
                            Agregar grupo
                          </button>
                          <button
                            type="button"
                            onClick={() => setComboImportOpen((prev) => !prev)}
                            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:border-sky-400"
                            style={{
                              borderColor: comboImportOpen ? '#0284c7' : 'var(--color-border)',
                              color: comboImportOpen ? '#0284c7' : 'var(--color-foreground)',
                              fontFamily: 'var(--font-caption)',
                            }}
                          >
                            <Icon name="CopyPlus" size={14} color="currentColor" />
                            Usar grupo existente
                          </button>
                        </div>

                        {comboImportOpen && (
                          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
                            {reusableComboProducts.length === 0 ? (
                              <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                Aún no tienes grupos guardados en otros productos.
                              </p>
                            ) : (
                              <>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                      Producto
                                    </label>
                                    <select
                                      value={selectedReusableProductId}
                                      onChange={(e) => setSelectedReusableProductId(e.target.value)}
                                      className="w-full text-sm bg-transparent border rounded-md px-3 py-2 focus:outline-none"
                                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                                    >
                                      <option value="">Selecciona un producto</option>
                                      {reusableComboProducts.map((candidate) => (
                                        <option key={candidate.id} value={candidate.id}>
                                          {candidate.name}{candidate.category ? ` · ${candidate.category}` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                      Grupo
                                    </label>
                                    <select
                                      value={selectedReusableGroupId}
                                      onChange={(e) => setSelectedReusableGroupId(e.target.value)}
                                      disabled={!selectedReusableProduct}
                                      className="w-full text-sm bg-transparent border rounded-md px-3 py-2 focus:outline-none disabled:opacity-60"
                                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                                    >
                                      <option value="">Selecciona un grupo</option>
                                      {(selectedReusableProduct?.groups || []).map((group) => (
                                        <option key={group.id} value={group.id}>
                                          {group.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                {selectedReusableGroup && (
                                  <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
                                    <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                                      {selectedReusableGroup.label}
                                    </p>
                                    <p className="text-xs mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                      {selectedReusableGroup.required ? 'Obligatorio' : 'Opcional'}
                                      {selectedReusableGroup.maxSelections > 1 ? ` · Hasta ${selectedReusableGroup.maxSelections} selecciones` : ' · Una selección'}
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                      {selectedReusableGroup.items.map((item) => `${item.label} (${formatAddonPrice(item.price)})`).join(' · ')}
                                    </p>
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={importReusableComboGroup}
                                    disabled={!selectedReusableGroup}
                                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
                                    style={{ backgroundColor: '#0284c7', fontFamily: 'var(--font-caption)' }}
                                  >
                                    <Icon name="Download" size={14} color="#FFFFFF" />
                                    Copiar grupo
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setComboImportOpen(false);
                                      setSelectedReusableProductId('');
                                      setSelectedReusableGroupId('');
                                    }}
                                    className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors"
                                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        {comboGroups.length === 0 && (
                          <div className="rounded-xl border border-dashed p-4 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                            Todavía no agregaste grupos. Crea uno para empezar tu combo.
                          </div>
                        )}

                        {comboGroups.map((group, groupIndex) => (
                          <div key={group.id} className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
                            <div className="flex items-start gap-3">
                              <div className="flex-1 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                    Grupo {groupIndex + 1}
                                  </label>
                                  <input
                                    type="text"
                                    value={group.label}
                                    onChange={(e) => updateComboGroup(group.id, { label: e.target.value })}
                                    placeholder="Ej: Elige tu acompañamiento"
                                    className="w-full text-sm bg-transparent border rounded-md px-3 py-2 focus:outline-none"
                                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                    Máx. selecciones
                                  </label>
                                  <input
                                    type="number"
                                    value={group.maxSelections}
                                    onChange={(e) => updateComboGroup(group.id, { maxSelections: e.target.value })}
                                    min={1}
                                    className="w-full text-sm bg-transparent border rounded-md px-3 py-2 focus:outline-none"
                                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeComboGroup(group.id)}
                                className="p-2 rounded-lg transition-colors hover:text-red-500"
                                style={{ color: 'var(--color-muted-foreground)' }}
                                title="Quitar grupo"
                              >
                                <Icon name="Trash2" size={16} color="currentColor" />
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => duplicateComboGroup(group.id)}
                                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:border-sky-400"
                                style={{ borderColor: 'var(--color-border)', color: '#0284c7', fontFamily: 'var(--font-caption)' }}
                              >
                                <Icon name="Copy" size={14} color="currentColor" />
                                Duplicar grupo
                              </button>
                            </div>

                            <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                              <input
                                type="checkbox"
                                checked={group.required === true}
                                onChange={(e) => updateComboGroup(group.id, { required: e.target.checked })}
                                className="rounded border-gray-300"
                              />
                              Selección obligatoria
                            </label>

                            <div className="space-y-2">
                              {group.items.map((item) => (
                                <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center" style={{ borderColor: 'var(--color-border)' }}>
                                  <input
                                    type="text"
                                    value={item.label}
                                    onChange={(e) => updateComboItem(group.id, item.id, { label: e.target.value })}
                                    placeholder="Nombre de la opción"
                                    className="flex-1 text-sm bg-transparent border rounded-md px-3 py-2 focus:outline-none"
                                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                                  />
                                  <input
                                    type="number"
                                    value={item.price}
                                    onChange={(e) => updateComboItem(group.id, item.id, { price: e.target.value })}
                                    min={0}
                                    placeholder="0"
                                    className="w-full sm:w-28 text-sm bg-transparent border rounded-md px-3 py-2 focus:outline-none text-right"
                                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeComboItem(group.id, item.id)}
                                    className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm transition-colors hover:text-red-500"
                                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                                  >
                                    Quitar
                                  </button>
                                </div>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => addComboItem(group.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm font-medium transition-colors hover:border-sky-400"
                              style={{ borderColor: 'var(--color-border)', color: '#0284c7', fontFamily: 'var(--font-caption)' }}
                            >
                              <Icon name="Plus" size={14} color="currentColor" />
                              Agregar opción
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Add-ons - visible solo para negocios restaurant */}
                {isRestaurant && (
                  <div
                    className="p-5 md:p-6 rounded-xl border"
                    style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(234,88,12,0.08)' }}>
                        <Icon name="UtensilsCrossed" size={15} color="#ea580c" />
                      </div>
                      <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Complementos sugeridos</h2>
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgba(234,88,12,0.08)', color: '#ea580c', fontFamily: 'var(--font-caption)' }}>Restaurante</span>
                    </div>
                    <p className="text-xs mb-4" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      Agrega productos del catálogo o extras manuales para aumentar el pedido.
                    </p>

                    <div className="space-y-2 mb-3">
                      {normalizedAddOns.map((addon) => {
                        const relatedProduct = addon?.type === 'product'
                          ? businessProducts.find((candidate) => candidate?.id === addon?.productId)
                          : null;

                        return (
                          <div key={addon.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                                    {addon?.type === 'product' ? (relatedProduct?.name || 'Producto no disponible') : (addon?.label || 'Complemento manual')}
                                  </span>
                                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium uppercase" style={{ backgroundColor: addon?.type === 'product' ? 'rgba(59,130,246,0.10)' : 'rgba(234,88,12,0.10)', color: addon?.type === 'product' ? '#2563eb' : '#ea580c', fontFamily: 'var(--font-caption)' }}>
                                    {addon?.type === 'product' ? 'producto' : 'manual'}
                                  </span>
                                </div>

                                {addon?.type === 'product' ? (
                                  <div className="space-y-1">
                                    <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                      {relatedProduct?.category?.trim()
                                        ? `${relatedProduct.category} · ${formatAddonPrice(relatedProduct?.price)}`
                                        : formatAddonPrice(relatedProduct?.price)}
                                    </p>
                                    {!relatedProduct && (
                                      <p className="text-xs" style={{ color: '#b45309', fontFamily: 'var(--font-caption)' }}>
                                        El producto relacionado ya no está disponible. Puedes quitar este complemento.
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                      type="text"
                                      value={addon?.emoji || ''}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        updateAddOns((current) => current.map((item, index) => {
                                          const normalized = normalizeAddon(item, index);
                                          return normalized?.id === addon.id ? { ...normalized, emoji: value } : normalized;
                                        }));
                                      }}
                                      placeholder="Em"
                                      className="w-12 text-center text-base bg-transparent border rounded-md p-1 focus:outline-none"
                                      style={{ borderColor: 'var(--color-border)' }}
                                      maxLength={2}
                                    />
                                    <input
                                      type="text"
                                      value={addon?.label || ''}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        updateAddOns((current) => current.map((item, index) => {
                                          const normalized = normalizeAddon(item, index);
                                          return normalized?.id === addon.id ? { ...normalized, label: value } : normalized;
                                        }));
                                      }}
                                      placeholder="Nombre del extra"
                                      className="flex-1 text-sm bg-transparent border rounded-md px-2 py-1 focus:outline-none"
                                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                                    />
                                    <input
                                      type="number"
                                      value={addon?.price ?? ''}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        updateAddOns((current) => current.map((item, index) => {
                                          const normalized = normalizeAddon(item, index);
                                          return normalized?.id === addon.id
                                            ? { ...normalized, price: value === '' ? 0 : Math.max(0, Number(value)) }
                                            : normalized;
                                        }));
                                      }}
                                      placeholder="0"
                                      className="w-full sm:w-28 text-sm bg-transparent border rounded-md px-2 py-1 focus:outline-none text-right"
                                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                                      min={0}
                                    />
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateAddOns((current) => current.map((item, index) => {
                                    const normalized = normalizeAddon(item, index);
                                    return normalized?.id === addon.id ? { ...normalized, active: !normalized.active } : normalized;
                                  }))}
                                  className="p-1.5 rounded-md transition-colors"
                                  style={{ color: addon.active ? '#059669' : 'var(--color-muted-foreground)' }}
                                  title={addon.active ? 'Visible' : 'Oculto'}
                                >
                                  <Icon name={addon.active ? 'Eye' : 'EyeOff'} size={14} color="currentColor" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateAddOns((current) => current.filter((item, index) => normalizeAddon(item, index)?.id !== addon.id))}
                                  className="p-1.5 rounded-md transition-colors hover:text-red-500"
                                  style={{ color: 'var(--color-muted-foreground)' }}
                                  title="Eliminar"
                                >
                                  <Icon name="Trash2" size={14} color="currentColor" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        {normalizedAddOns.length}/{ADDON_LIMIT} complementos
                      </p>
                      {normalizedAddOns.length < ADDON_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setAddonCreationMode((prev) => prev ? null : 'chooser')}
                          className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border border-dashed transition-colors hover:border-orange-400"
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                        >
                          <Icon name="Plus" size={14} color="currentColor" />
                          + Agregar complemento
                        </button>
                      )}
                    </div>

                    {normalizedAddOns.length >= ADDON_LIMIT && (
                      <p className="text-xs mb-3" style={{ color: '#b45309', fontFamily: 'var(--font-caption)' }}>
                        Llegaste al máximo de 5 complementos por producto.
                      </p>
                    )}

                    {addonCreationMode && normalizedAddOns.length < ADDON_LIMIT && (
                      <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-background)' }}>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setAddonCreationMode('product')}
                            className="px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
                            style={{
                              borderColor: addonCreationMode === 'product' ? '#2563eb' : 'var(--color-border)',
                              color: addonCreationMode === 'product' ? '#2563eb' : 'var(--color-foreground)',
                              fontFamily: 'var(--font-caption)',
                            }}
                          >
                            Buscar producto existente
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddonCreationMode('manual')}
                            className="px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
                            style={{
                              borderColor: addonCreationMode === 'manual' ? '#ea580c' : 'var(--color-border)',
                              color: addonCreationMode === 'manual' ? '#ea580c' : 'var(--color-foreground)',
                              fontFamily: 'var(--font-caption)',
                            }}
                          >
                            Crear complemento manual
                          </button>
                        </div>

                        {addonCreationMode === 'product' && (
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={addonSearchQuery}
                              onChange={(e) => setAddonSearchQuery(e.target.value)}
                              placeholder="Busca por nombre o categoría"
                              className="w-full text-sm bg-transparent border rounded-md px-3 py-2 focus:outline-none"
                              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                            />
                            {addonSearchTerm.length < ADDON_SEARCH_MIN ? (
                              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                Escribe al menos 2 caracteres para buscar productos del catálogo.
                              </p>
                            ) : availableAddonResults.length === 0 ? (
                              <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                No encontramos productos disponibles para agregar.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {availableAddonResults.map((candidate) => (
                                  <div key={candidate.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                                        {candidate?.name || 'Producto sin nombre'}
                                      </p>
                                      <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                                        {candidate?.category?.trim()
                                          ? `${candidate.category} · ${formatAddonPrice(candidate?.price)}`
                                          : formatAddonPrice(candidate?.price)}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => addProductAddon(candidate)}
                                      className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
                                      style={{ borderColor: '#2563eb', color: '#2563eb', fontFamily: 'var(--font-caption)' }}
                                    >
                                      Agregar
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {addonCreationMode === 'manual' && (
                          <div className="space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input
                                type="text"
                                value={manualAddonDraft.emoji}
                                onChange={(e) => setManualAddonDraft((prev) => ({ ...prev, emoji: e.target.value }))}
                                placeholder="Em"
                                className="w-14 text-center text-base bg-transparent border rounded-md p-2 focus:outline-none"
                                style={{ borderColor: 'var(--color-border)' }}
                                maxLength={2}
                              />
                              <input
                                type="text"
                                value={manualAddonDraft.label}
                                onChange={(e) => setManualAddonDraft((prev) => ({ ...prev, label: e.target.value }))}
                                placeholder="Nombre del extra"
                                className="flex-1 text-sm bg-transparent border rounded-md px-3 py-2 focus:outline-none"
                                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                              />
                              <input
                                type="number"
                                value={manualAddonDraft.price}
                                onChange={(e) => setManualAddonDraft((prev) => ({ ...prev, price: e.target.value }))}
                                placeholder="0"
                                className="w-full sm:w-28 text-sm bg-transparent border rounded-md px-3 py-2 focus:outline-none text-right"
                                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}
                                min={0}
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setManualAddonDraft({ emoji: '', label: '', price: '' });
                                  setAddonCreationMode(null);
                                }}
                                className="px-3 py-2 rounded-lg text-sm font-medium border"
                                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={addManualAddon}
                                disabled={!manualAddonDraft?.label?.trim()}
                                className="px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                                style={{ backgroundColor: '#ea580c', fontFamily: 'var(--font-caption)' }}
                              >
                                Agregar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
                    currencyCode={locale.currencyCode}
                    locale={locale.locale}
                    descripcion={formData?.descripcion}
                    activo={formData?.activo}
                    featured={formData?.featured}
                    onSale={formData?.onSale}
                    images={images}
                    mainImageOverrideUrl={imagePreviewUrl}
                  />
                </div>
              </div>

            </div>
        </DashboardLayoutContent>

        <SaveBar
          isEditing={isEditingFlow}
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

