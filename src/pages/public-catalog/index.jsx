import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import CatalogLayout from './CatalogLayout';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { getBusinessBySlug, getPublicProducts, getCategoriesByRubroId, getBusinessCategories, recordCatalogVisit, recordCatalogWhatsAppClick, createOrder } from '../../services/waBusinessService';
import { collectVisitAttribution } from '../../utils/analytics';
import Icon from '../../components/AppIcon';
import { CartProvider, useCart } from '../../contexts/CartContext';
import { formatPrice as formatPriceUtil, resolveCatalogCurrency } from '../../utils/formatPrice';
import { getBusinessLocale } from '../../lib/locale/businessLocale';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useAuth } from '../../contexts/AuthContext';
import PremiumLoader from '../../components/ui/PremiumLoader';
import {
  getPublicCatalogBaseUrl,
  getPublicCatalogRelativePath,
  getPublicCatalogUrl,
  getWhatsAppOrderCatalogUrl,
} from '../../config/appUrl';
import BrandingFooter from '../../components/BrandingFooter';
import CatalogImage from '../../components/CatalogImage';
import { hasViralBranding, getOrderMessageBrandingSuffix } from '../../utils/branding';
import { isRestaurantBusiness } from '../../utils/businessType';
import { normalizeOptionalCustomerPhone } from '../../utils/customerPhone';
import { cfImageUrl, isCfTransformableUrl } from '../../utils/cloudflareImage';
import CheckoutPhoneOptional from '../../components/checkout/CheckoutPhoneOptional';
import { getCountryLabels, DELIVERY_ADDRESS_FIELD_HINT } from '../../config/country';
import { resolveCatalogSeoContent } from '../../utils/catalogDynamicSeo';
import {
  buildLocalBusinessJsonLd,
  detectCatalogRegion,
  getCatalogOgImageUrl,
  getCatalogShareDescription,
  getCatalogShareDocumentTitle,
  resolveCatalogFooterText,
  stringifyJsonLd,
} from '../../utils/catalogSeo';
import { getProductCardTrustBadge } from '../../utils/productCardBadge';
import { getDiscountPercent } from '../../utils/offerHelpers';
import { resolveCatalogTheme, hexToRgb, hexToRgba, darkenHex } from '../../utils/catalogTheme';
import { openWhatsAppUrl } from '../../utils/openWhatsAppUrl';
import CatalogStoreHeader from './CatalogStoreHeader';

function isWhatsAppWebView() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  return ua.includes('WhatsApp');
}

const SLOW_TYPES = new Set(['slow-2g', '2g', '3g']);

function getNavConnection() {
  if (typeof navigator === 'undefined') return null;
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
}

function useSlowConnection() {
  const [isSlow, setIsSlow] = useState(() => {
    const conn = getNavConnection();
    return conn ? SLOW_TYPES.has(conn.effectiveType) : false;
  });
  useEffect(() => {
    const conn = getNavConnection();
    if (!conn) return;
    const handler = () => setIsSlow(SLOW_TYPES.has(conn.effectiveType));
    conn.addEventListener('change', handler);
    return () => conn.removeEventListener('change', handler);
  }, []);
  return isSlow;
}

// Normalizar imágenes del producto: la primera es siempre imageUrl (misma que la tarjeta);
// el resto viene de product.images para galería. Así el modal usa la misma URL que la tarjeta.
function withMediaVersion(url, version) {
  if (!url) return null;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(version)}`;
}

export function getProductImages(product) {
  const primary = product?.imageUrl || null;
  const extra = Array.isArray(product?.images) && product.images.length > 0 ? product.images : [];
  const seen = new Set();
  const result = [];
  if (primary) {
    result.push(primary);
    seen.add(primary);
  }
  for (const url of extra) {
    if (url && !seen.has(url)) {
      result.push(url);
      seen.add(url);
    }
  }
  return result;
}

export function getProductCardImage(product) {
  return product?.cardImageUrl || product?.thumbnailUrl || getProductImages(product)?.[0] || null;
}

function getProductCommercialState(product) {
  if (product?.isActive === false) return 'hidden';
  if (product?.isSoldOut === true) return 'sold_out';
  return 'available';
}

function logCfCacheStatusIfPossible(url) {
  if (!import.meta.env.DEV) return;
  if (typeof window === 'undefined' || !url || typeof fetch !== 'function') return;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 1800);

  fetch(url, {
    method: 'HEAD',
    cache: 'force-cache',
    signal: controller.signal,
  })
    .then((response) => {
      const cacheStatus = response.headers.get('cf-cache-status');
      console.debug('[CatalogImageDebug] cf-cache-status', {
        optimizedUrl: url,
        cacheStatus: cacheStatus || 'unavailable',
        status: response.status,
      });
    })
    .catch((error) => {
      console.debug('[CatalogImageDebug] cf-cache-status unavailable', {
        optimizedUrl: url,
        reason: error?.name || error?.message || 'unknown',
      });
    })
    .finally(() => {
      window.clearTimeout(timeoutId);
    });
}


// SocialLinks, CatalogInfoBlock, CatalogInfoGrid → moved to CatalogStoreHeader.jsx

export default function PublicCatalog() {
  const { slug } = useParams();
  return (
    <CartProvider>
      <CatalogInner slug={slug} />
    </CartProvider>
  );
}

function CatalogInner({ slug }) {
  const navigate = useNavigate();
  const { user, business: authBusiness } = useAuth();
  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [rubroCategories, setRubroCategories] = useState([]);
  const [bizCategories, setBizCategories] = useState([]);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState([0, 0]);
  const [maxPrice, setMaxPrice] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) return 16;
    const conn = getNavConnection();
    if (conn && SLOW_TYPES.has(conn.effectiveType)) return 4;
    return 8;
  });
  const [activeFeaturedIndex, setActiveFeaturedIndex] = useState(0);
  const [isFeaturedHovered, setIsFeaturedHovered] = useState(false);
  const [isFeaturedAutoplayPaused, setIsFeaturedAutoplayPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  /** Desktop: si el carril de categorías puede seguir scrolleando a izquierda/derecha (para flechas). */
  const [categoryScrollMore, setCategoryScrollMore] = useState({ left: false, right: false });
  const featuredTouchStartX = useRef(0);
  const featuredTouchEndX = useRef(0);
  const featuredSwipeTriggeredRef = useRef(false);
  const featuredTouchInteractionRef = useRef(false);
  const featuredAutoplayResumeTimeoutRef = useRef(null);

  const { itemCount } = useCart();
  const isDesktop = useIsDesktop();
  const isSlowConnection = useSlowConnection();
  const isFastMode = !isDesktop && isSlowConnection;
  const isOwner = !!(user && business && authBusiness && business.id === authBusiness.id);
  if (typeof window !== 'undefined' && window.__AUTH_DEBUG__ && business) {
    console.log('[PublicCatalog] viewMode:', isOwner ? 'owner' : 'public', { hasUser: !!user, catalogBizId: business?.id, authBizId: authBusiness?.id });
  }

  useEffect(() => {
    if (!slug) return;
    loadCatalog();
  }, [slug]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePreference);
      return () => mediaQuery.removeEventListener('change', updatePreference);
    }
    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  const loadCatalog = async () => {
    setLoading(true);
    const { data: biz, error: bizErr } = await getBusinessBySlug(slug);
    if (bizErr || !biz) { setNotFound(true); setLoading(false); return; }
    setBusiness(biz);
    const path = typeof window !== 'undefined' ? window.location?.pathname || getPublicCatalogRelativePath(slug) : getPublicCatalogRelativePath(slug);
    const attribution = collectVisitAttribution();
    recordCatalogVisit(slug, path, attribution)
      .then((r) => console.log('[public-catalog] recordCatalogVisit result', { slug, recorded: r?.recorded, throttled: r?.throttled, error: r?.error }))
      .catch((e) => console.error('[public-catalog] recordCatalogVisit error', slug, e));
    const { data: prods } = await getPublicProducts(biz?.id);
    const loadedProducts = prods || [];
    setProducts(loadedProducts);
    if (loadedProducts?.length > 0) {
      const prices = loadedProducts?.map(p => p?.price || 0);
      const max = Math.max(...prices);
      setMaxPrice(max);
      setPriceRange([0, max]);
    }
    if (biz?.designSettings?.useCategories) {
      // Cargar en paralelo: categorías del rubro (globales) + propias del negocio
      const [rubroResult, bizResult] = await Promise.all([
        biz?.rubroId ? getCategoriesByRubroId(biz.rubroId) : Promise.resolve({ data: [] }),
        biz?.id ? getBusinessCategories(biz.id) : Promise.resolve({ data: [] }),
      ]);
      setRubroCategories(rubroResult.data || []);
      setBizCategories(bizResult.data || []);
    } else {
      setRubroCategories([]);
      setBizCategories([]);
    }
    setLoading(false);
  };

  const catalogMoney = useMemo(() => getBusinessLocale(business), [business]);
  const countryLabels = useMemo(() => getCountryLabels(catalogMoney.countryCode), [catalogMoney.countryCode]);
  const businessCurrency = useMemo(
    () => resolveCatalogCurrency(business, catalogMoney),
    [business, catalogMoney],
  );
  const formatPrice = useCallback(
    (price) => formatPriceUtil(price, businessCurrency, catalogMoney?.countryCode),
    [businessCurrency, catalogMoney?.countryCode],
  );

  // Derivar useCategories y categoryNames desde business, rubros y categorías propias
  const design = business?.designSettings || {};
  // useCategories activo si el toggle está on y hay al menos una fuente de categorías
  const useCategories = design?.useCategories === true && (!!business?.rubroId || bizCategories.length > 0);
  // Categorías propias primero, luego globales del rubro; deduplicar por nombre
  const categoryNames = useMemo(() => {
    const bizNames = bizCategories.map((c) => c?.name?.trim()).filter(Boolean);
    const rubroNames = (rubroCategories || []).map((c) => c?.name?.trim()).filter(Boolean);
    const seen = new Set(bizNames.map((n) => n.toLowerCase()));
    const merged = [...bizNames];
    for (const name of rubroNames) {
      if (!seen.has(name.toLowerCase())) merged.push(name);
    }
    return merged;
  }, [bizCategories, rubroCategories]);

  // Categorías visibles en el filtro: solo las que tienen al menos un producto activo
  const visibleCategories = useMemo(() => {
    if (!useCategories || !products?.length) return [];
    const withProducts = categoryNames.filter((name) =>
      products.some((p) => getProductCommercialState(p) !== 'hidden' && (p?.category || '').trim() === name)
    );
    const hasOtros = products.some((p) => getProductCommercialState(p) !== 'hidden' && !(p?.category || '').trim());
    return [...withProducts, ...(hasOtros ? ['Otros'] : [])];
  }, [useCategories, categoryNames, products]);

  /** "Todos" siempre visible si hay chips de categoría (incluye el caso de una sola categoría, p. ej. solo Otros). */
  const showTodosButton = visibleCategories.length > 0;

  // Filtered products (por búsqueda, categoría seleccionada y precio)
  const filteredProducts = useMemo(() => {
    return products?.filter(p => {
      if (getProductCommercialState(p) === 'hidden') return false;
      const matchesSearch = !searchQuery?.trim() ||
        p?.name?.toLowerCase()?.includes(searchQuery?.toLowerCase()) ||
        p?.description?.toLowerCase()?.includes(searchQuery?.toLowerCase());
      const matchesCategory = !useCategories
        ? true
        : selectedCategory === 'all'
          ? true
          : selectedCategory === 'Otros'
            ? !p?.category?.trim()
            : p?.category === selectedCategory;
      const matchesPrice = p?.price >= priceRange?.[0] && p?.price <= priceRange?.[1];
      return matchesSearch && matchesCategory && matchesPrice;
    });
  }, [products, searchQuery, selectedCategory, priceRange, useCategories]);

  // Orden: sortOrder ASC → onSale DESC (tiebreaker, mismo sort_order) → createdAt DESC
  const sortedProducts = useMemo(() => {
    if (!filteredProducts?.length) return [];
    return [...filteredProducts].sort((a, b) => {
      const orderA = a?.sortOrder != null ? Number(a.sortOrder) : Infinity;
      const orderB = b?.sortOrder != null ? Number(b.sortOrder) : Infinity;
      if (orderA !== orderB) return orderA - orderB;
      // Dentro del mismo sort_order: productos en oferta primero
      const saleA = a?.onSale ? 1 : 0;
      const saleB = b?.onSale ? 1 : 0;
      if (saleA !== saleB) return saleB - saleA;
      const dateA = new Date(a?.createdAt || 0).getTime();
      const dateB = new Date(b?.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [filteredProducts]);

  useEffect(() => {
    if (typeof window === 'undefined' || sortedProducts.length <= 0) return undefined;

    const preloadUrls = sortedProducts
      .slice(0, isDesktop ? 6 : 4)
      .map((product) => {
        const cardImage = getProductCardImage(product);
        if (!cardImage) return null;
        return product?.thumbnailUrl || product?.cardImageUrl ? cardImage : cfImageUrl(cardImage, 'card');
      })
      .filter(Boolean);

    if (preloadUrls.length <= 0) return undefined;
    const isDev = import.meta.env.DEV;

    const preloaders = preloadUrls.map((optimizedUrl, index) => {
      if (isDev) {
        console.debug('[CatalogImageDebug] preload optimizedUrl', { optimizedUrl, index });
      }
      const img = new window.Image();
      img.decoding = 'async';
      img.src = optimizedUrl;
      return img;
    });

    if (isDev) {
      preloadUrls.slice(0, 2).forEach((optimizedUrl) => {
        logCfCacheStatusIfPossible(optimizedUrl);
      });
    }

    return () => {
      preloaders.forEach((img) => {
        img.src = '';
      });
    };
  }, [isDesktop, sortedProducts]);

  const hasActiveFilters = searchQuery?.trim() || (useCategories && selectedCategory !== 'all') || priceRange?.[0] > 0 || priceRange?.[1] < maxPrice;

  useEffect(() => {
    if (isDesktop) setVisibleCount(16);
    else if (isSlowConnection) setVisibleCount(4);
    else setVisibleCount(8);
  }, [searchQuery, selectedCategory, priceRange, isDesktop, isSlowConnection]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setPriceRange([0, maxPrice]);
  };

  const categoryScrollRef = useRef(null);
  const hasCategoryBar = useCategories && visibleCategories.length > 0;

  useEffect(() => {
    const el = categoryScrollRef.current;
    if (!el) return;

    const canScrollX = () => el.scrollWidth > el.clientWidth + 1;

    /** Rueda vertical → scroll horizontal; Shift+rueda; respeta deltaMode (líneas/píxeles). Trackpad horizontal: nativo. */
    const onWheel = (e) => {
      if (!canScrollX()) return;
      const { deltaX, deltaY, deltaMode, shiftKey } = e;

      const LINE = 1;
      const PAGE = 2;

      if (shiftKey && deltaY !== 0) {
        e.preventDefault();
        let dy = deltaY;
        if (deltaMode === LINE) dy *= 32;
        else if (deltaMode === PAGE) dy *= el.clientWidth;
        el.scrollLeft += dy;
        return;
      }

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 0.5) {
        return;
      }

      if (deltaY === 0) return;

      e.preventDefault();
      let dy = deltaY;
      if (deltaMode === LINE) dy *= 32;
      else if (deltaMode === PAGE) dy *= el.clientWidth;
      el.scrollLeft += dy;
    };

    let ptrDown = false;
    let startX = 0;
    let startScroll = 0;
    let dragMoved = false;
    let activePointerId = null;
    let suppressClickUntil = 0;

    const onPointerDown = (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button !== 0) return;
      // No capturar ni arrastrar si el clic es sobre un chip de categoría (evita romper onClick en desktop).
      const t = e.target;
      if (t && typeof t.closest === 'function' && t.closest('button')) return;
      ptrDown = true;
      dragMoved = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      activePointerId = e.pointerId;
      el.style.cursor = 'grabbing';
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    };

    const onPointerMove = (e) => {
      if (!ptrDown || e.pointerId !== activePointerId) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 3) dragMoved = true;
      if (dragMoved) el.scrollLeft = startScroll - dx;
    };

    const endPointer = (e) => {
      if (!ptrDown) return;
      if (e?.pointerId != null && e.pointerId !== activePointerId) return;
      const didDrag = dragMoved;
      ptrDown = false;
      activePointerId = null;
      el.style.cursor = '';
      try {
        if (e?.pointerId != null) el.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      if (didDrag) {
        suppressClickUntil = Date.now() + 400;
      }
      dragMoved = false;
    };

    const onClickCapture = (e) => {
      if (Date.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('lostpointercapture', endPointer);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endPointer);
      el.removeEventListener('pointercancel', endPointer);
      el.removeEventListener('lostpointercapture', endPointer);
      el.removeEventListener('click', onClickCapture, true);
      el.style.cursor = '';
    };
  }, [hasCategoryBar, visibleCategories.length]);

  const updateCategoryScrollEdges = useCallback(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const scrollWidth = el.scrollWidth;
    const clientWidth = el.clientWidth;
    const maxScroll = Math.max(0, Math.ceil(scrollWidth - clientWidth));
    const eps = 2;
    setCategoryScrollMore({
      left: scrollLeft > eps,
      right: maxScroll > eps && scrollLeft < maxScroll - eps,
    });
  }, []);

  const scrollCategoryStrip = useCallback(
    (direction) => {
      const el = categoryScrollRef.current;
      if (!el) return;
      const step = Math.max(220, Math.round(el.clientWidth * 0.72));
      el.scrollBy({ left: direction * step, behavior: 'smooth' });
      [180, 400, 650].forEach((ms) => window.setTimeout(updateCategoryScrollEdges, ms));
    },
    [updateCategoryScrollEdges]
  );

  useEffect(() => {
    const el = categoryScrollRef.current;
    if (!el || !hasCategoryBar) return;
    const onScroll = () => updateCategoryScrollEdges();
    const scheduleMeasure = () => {
      updateCategoryScrollEdges();
      requestAnimationFrame(() => {
        updateCategoryScrollEdges();
        requestAnimationFrame(updateCategoryScrollEdges);
      });
    };
    scheduleMeasure();
    const t1 = window.setTimeout(scheduleMeasure, 100);
    const t2 = window.setTimeout(scheduleMeasure, 400);
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro;
    let roParent;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleMeasure);
      ro.observe(el);
      const parent = el.parentElement;
      if (parent) {
        roParent = new ResizeObserver(scheduleMeasure);
        roParent.observe(parent);
      }
    }
    window.addEventListener('resize', scheduleMeasure);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      roParent?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [hasCategoryBar, visibleCategories.length, updateCategoryScrollEdges]);

  const buildSingleWhatsAppMessage = (product) => {
    const storeName = business?.name || 'la tienda';
    const code = product?.publicCode;
    const catalogUrl = slug ? getWhatsAppOrderCatalogUrl(slug) : '';
    const body = code
      ? `Hola, quiero este producto: ${code} - ${product?.name}\n\nPrecio: ${formatPrice(product?.price)}\n\nTienda: ${storeName}`
      : `Hola! Me interesa el producto:\n\n*${product?.name}*\nPrecio: ${formatPrice(product?.price)}\n\nTienda: ${storeName}`;
    let message = catalogUrl ? `${catalogUrl}\n\n${body}` : body;
    const branding = getOrderMessageBrandingSuffix(business);
    if (branding) message += `${catalogUrl ? '\n\n\n' : '\n\n'}${branding}`;
    return message;
  };

  const buildSingleWhatsAppUrl = (product) => {
    const phone = business?.whatsapp?.replace(/\D/g, '');
    const message = buildSingleWhatsAppMessage(product);
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  const openProduct = (product) => {
    if (getProductCommercialState(product) === 'hidden') return;
    setSelectedProduct(product);
  };
  const closeProduct = () => setSelectedProduct(null);
  const handleFeaturedOpen = (product) => {
    if (featuredSwipeTriggeredRef.current) {
      featuredSwipeTriggeredRef.current = false;
      return;
    }
    openProduct(product);
  };
  const clearFeaturedAutoplayResumeTimeout = useCallback(() => {
    if (featuredAutoplayResumeTimeoutRef.current) {
      window.clearTimeout(featuredAutoplayResumeTimeoutRef.current);
      featuredAutoplayResumeTimeoutRef.current = null;
    }
  }, []);

  const pauseFeaturedAutoplay = useCallback((options = {}) => {
    const { resumeDelayMs = 6000, fromTouch = false } = options;
    setIsFeaturedAutoplayPaused(true);
    if (fromTouch) featuredTouchInteractionRef.current = true;
    clearFeaturedAutoplayResumeTimeout();
    if (resumeDelayMs <= 0) return;
    featuredAutoplayResumeTimeoutRef.current = window.setTimeout(() => {
      featuredTouchInteractionRef.current = false;
      setIsFeaturedAutoplayPaused(false);
      featuredAutoplayResumeTimeoutRef.current = null;
    }, resumeDelayMs);
  }, [clearFeaturedAutoplayResumeTimeout]);

  const mainFeaturedProduct = useMemo(() => {
    if (!Array.isArray(products)) return null;
    return products.find((product) =>
      getProductCommercialState(product) !== 'hidden' && (
        product?.isMainFeatured === true ||
        product?.is_main_featured === true
      )
    ) || null;
  }, [products]);

  const featuredProducts = useMemo(
    () => (mainFeaturedProduct ? [mainFeaturedProduct] : []),
    [mainFeaturedProduct]
  );

  useEffect(() => {
    if (featuredProducts.length <= 0) {
      setActiveFeaturedIndex(0);
      return;
    }
    setActiveFeaturedIndex((current) => Math.min(current, featuredProducts.length - 1));
  }, [featuredProducts.length]);

  useEffect(() => {
    if (!isFeaturedHovered && !featuredTouchInteractionRef.current) {
      setIsFeaturedAutoplayPaused(false);
    }
  }, [isFeaturedHovered, featuredProducts.length]);

  useEffect(() => {
    if (featuredProducts.length <= 1 || prefersReducedMotion || isFeaturedAutoplayPaused || isFeaturedHovered) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setActiveFeaturedIndex((current) => {
        if (featuredProducts.length <= 0) return 0;
        return current >= featuredProducts.length - 1 ? 0 : current + 1;
      });
    }, 6000);
    return () => window.clearInterval(intervalId);
  }, [featuredProducts.length, isFeaturedAutoplayPaused, isFeaturedHovered, prefersReducedMotion]);

  useEffect(() => {
    if (typeof window === 'undefined' || featuredProducts.length <= 1) return undefined;
    const imagesToPreload = featuredProducts
      .map((product, index) => {
        if (index === activeFeaturedIndex) return null;
        const imageUrl = getProductImages(product)?.[0];
        if (!imageUrl) return null;
        return cfImageUrl(imageUrl, isDesktop ? 'card' : 'thumbnail');
      })
      .filter(Boolean);
    imagesToPreload.forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
    return undefined;
  }, [activeFeaturedIndex, featuredProducts, isDesktop]);

  const goToFeatured = useCallback((nextIndex) => {
    setActiveFeaturedIndex(() => {
      if (featuredProducts.length <= 0) return 0;
      return ((nextIndex % featuredProducts.length) + featuredProducts.length) % featuredProducts.length;
    });
  }, [featuredProducts.length]);

  const goPrevFeatured = useCallback(() => {
    goToFeatured(activeFeaturedIndex - 1);
  }, [activeFeaturedIndex, goToFeatured]);

  const goNextFeatured = useCallback(() => {
    goToFeatured(activeFeaturedIndex + 1);
  }, [activeFeaturedIndex, goToFeatured]);

  const handleFeaturedTouchStart = useCallback((e) => {
    featuredSwipeTriggeredRef.current = false;
    pauseFeaturedAutoplay({ resumeDelayMs: 8000, fromTouch: true });
    featuredTouchStartX.current = e?.touches?.[0]?.clientX ?? 0;
    featuredTouchEndX.current = featuredTouchStartX.current;
  }, [pauseFeaturedAutoplay]);

  const handleFeaturedTouchMove = useCallback((e) => {
    featuredTouchEndX.current = e?.touches?.[0]?.clientX ?? 0;
  }, []);

  const handleFeaturedTouchEnd = useCallback(() => {
    if (featuredProducts.length <= 1) return;
    const diff = featuredTouchStartX.current - featuredTouchEndX.current;
    if (Math.abs(diff) < 50) return;
    featuredSwipeTriggeredRef.current = true;
    if (diff > 0) goNextFeatured();
    else goPrevFeatured();
  }, [featuredProducts.length, goNextFeatured, goPrevFeatured]);

  useEffect(() => () => {
    clearFeaturedAutoplayResumeTimeout();
  }, [clearFeaturedAutoplayResumeTimeout]);

  const gridProducts = useMemo(() => {
    if (!sortedProducts?.length) return [];
    if (!mainFeaturedProduct?.id) return sortedProducts;
    return sortedProducts.filter((product) => product?.id !== mainFeaturedProduct.id);
  }, [mainFeaturedProduct?.id, sortedProducts]);
  const visibleProducts = useMemo(() => gridProducts.slice(0, visibleCount), [gridProducts, visibleCount]);
  const hasMoreProducts = gridProducts.length > visibleCount;

  const totalGridProducts = useMemo(() => {
    if (!Array.isArray(products)) return 0;
    return products.filter((product) =>
      getProductCommercialState(product) !== 'hidden' &&
      (!mainFeaturedProduct?.id || product?.id !== mainFeaturedProduct.id)
    ).length;
  }, [mainFeaturedProduct?.id, products]);

  if (loading) {
    return <PremiumLoader fullScreen business={business} context="catalog" />;
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 font-catalog antialiased">
        <div className="text-center">
          <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
            <Icon name="Store" size={36} color="#9CA3AF" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Catálogo no encontrado</h1>
          <p className="text-sm text-gray-500">El negocio que buscas no existe o no está disponible.</p>
        </div>
      </div>
    );
  }

  const catalogTheme = resolveCatalogTheme(design);
  const { primaryColor, primaryColorDark, primaryRgba, bgColor, textColor } = catalogTheme;
  const cardImageProfile = isDesktop ? 'thumbnail' : isFastMode ? 'cardFastMobile' : 'cardMobile';
  const theme = { primaryColor, primaryColorDark, primaryRgba };
  const cardSettings = { showPrice: true, showDescription: true, showStock: false, showWhatsApp: true, ...design?.cardSettings };
  const catalogViewMode = design?.catalogViewMode === 'compact' ? 'compact' : 'featured';
  const useCompactCard = catalogViewMode === 'compact' && !isDesktop;
  // Grid con min-width para que las tarjetas no queden demasiado angostas ni demasiado anchas
  const gridClass =
    isDesktop
      ? 'grid items-stretch gap-3 md:gap-4'
      : catalogViewMode === 'compact'
        ? 'grid grid-cols-2 items-stretch gap-2 sm:gap-3'
        : 'grid grid-cols-1 items-stretch gap-3 sm:gap-4';
  const gridStyle = isDesktop
    ? { gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }
    : catalogViewMode === 'compact'
      ? {}
      : {};

  const storeName = business?.name || 'Catálogo';
  const isRestaurant = isRestaurantBusiness(business);
  const catalogFooterText = resolveCatalogFooterText({ business, products });
  const activeFeaturedProduct = featuredProducts[activeFeaturedIndex] || null;
  const activeFeaturedImage = activeFeaturedProduct ? getProductImages(activeFeaturedProduct)?.[0] || null : null;
  const activeFeaturedTitle = isRestaurant && (activeFeaturedProduct?.isMainFeatured === true || activeFeaturedProduct?.is_main_featured === true)
    ? '🍽️ Menú del día'
    : '🔥 Producto destacado';
  const featuredPrimaryCta = isRestaurant ? 'Pedir por WhatsApp' : 'Ver producto';
  const featuredSecondaryCta = isRestaurant ? 'Ver producto' : 'Consultar por WhatsApp';
  const hasFeaturedWhatsApp = !!business?.whatsapp?.replace(/\D/g, '');
  const activeFeaturedDescription = (() => {
    const raw = String(activeFeaturedProduct?.description || '').trim();
    if (!raw) return '';
    return raw.length > 140 ? `${raw.slice(0, 137).trim()}...` : raw;
  })();
  const baseUrl = getPublicCatalogBaseUrl();
  const host =
    typeof window !== 'undefined' && window?.location?.host ? window.location.host : '';
  const seoInput = {
    storeName: business?.name,
    city: business?.city,
    region: business?.region,
    country: business?.country,
    currency: business?.currency,
    countryCode: business?.routingCountryCode ?? business?.countryCode,
    host,
  };
  const shareDocumentTitle = getCatalogShareDocumentTitle(business?.name);
  const catalogSeoContent = business
    ? resolveCatalogSeoContent({
        business,
        products,
        businessCategories: [...bizCategories, ...rubroCategories],
      })
    : null;
  const shareDescription = catalogSeoContent?.metaDescription || getCatalogShareDescription(business);
  const ogDescription = catalogSeoContent?.ogDescription || shareDescription;
  const ogRegion = detectCatalogRegion(seoInput);
  const canonicalUrl = getPublicCatalogUrl(slug);
  const ogImage = getCatalogOgImageUrl(business, baseUrl);
  const showGridEmptyState = gridProducts.length === 0 && (!mainFeaturedProduct || hasActiveFilters);
  const jsonLd =
    business && canonicalUrl
      ? buildLocalBusinessJsonLd({
          name: business?.name || 'Catálogo',
          imageUrl: ogImage,
          city: business?.city,
          region: business?.region,
          country: business?.country,
          countryCode: business?.countryCode,
          telephone: business?.whatsapp,
          url: canonicalUrl,
          currency: business?.currency,
          host,
        })
      : null;
  const openFeaturedWhatsApp = (product) => {
    if (!product) return;
    const url = buildSingleWhatsAppUrl(product);
    if (url) openWhatsAppUrl(url);
  };

  return (
    <CatalogLayout
      theme={catalogTheme}
      isDesktop={isDesktop}
      className="min-h-screen font-catalog antialiased"
      style={{
        '--cat-bg':      bgColor,
        '--cat-text':    textColor,
        '--cat-card':    catalogTheme.cardBg,
        '--cat-border':  catalogTheme.borderColor,
        '--cat-primary': primaryColor,
        color:           textColor,
      }}
    >
      {/* Open Graph: título/descripción del negocio; og:image = /api/og-catalog (misma regla que api/seo y worker). */}
      {!loading && !notFound && business && (
        <Helmet>
          <title>{shareDocumentTitle}</title>
          <meta name="description" content={shareDescription} />
          <meta name="robots" content="index, follow" />
          <meta property="og:type" content="website" />
          <meta property="og:url" content={canonicalUrl} />
          <meta property="og:title" content={shareDocumentTitle} />
          <meta property="og:description" content={ogDescription} />
          <meta property="og:image" content={ogImage} />
          {typeof ogImage === 'string' && ogImage.startsWith('https://') && (
            <meta property="og:image:secure_url" content={ogImage} />
          )}
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:locale" content={ogRegion.ogLocale} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:url" content={canonicalUrl} />
          <meta name="twitter:title" content={shareDocumentTitle} />
          <meta name="twitter:description" content={ogDescription} />
          <meta name="twitter:image" content={ogImage} />
          <link rel="canonical" href={canonicalUrl} />
          {jsonLd && (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: stringifyJsonLd(jsonLd) }}
            />
          )}
        </Helmet>
      )}

      {/* ── Cabecera del negocio (reutilizada en /ofertas) ── */}
      <CatalogStoreHeader
        business={business}
        theme={catalogTheme}
        slug={slug}
        isDesktop={isDesktop}
        onBack={isOwner ? () => navigate('/dashboard') : null}
      />

      {activeFeaturedProduct && (
        <div className="w-full px-4 pt-4 lg:max-w-5xl lg:mx-auto">
          <section
            className="overflow-hidden rounded-[28px] border shadow-sm"
            onMouseEnter={() => {
              clearFeaturedAutoplayResumeTimeout();
              setIsFeaturedHovered(true);
              setIsFeaturedAutoplayPaused(true);
            }}
            onMouseLeave={() => {
              setIsFeaturedHovered(false);
              if (!featuredTouchInteractionRef.current) {
                setIsFeaturedAutoplayPaused(false);
              }
            }}
            style={{
              background: catalogTheme.sectionBg,
              borderColor: catalogTheme.borderColor,
              boxShadow: catalogTheme.isDark ? '0 10px 30px rgba(0,0,0,0.24)' : '0 12px 30px rgba(15,23,42,0.08)',
            }}
          >
            <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleFeaturedOpen(activeFeaturedProduct)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleFeaturedOpen(activeFeaturedProduct);
                  }
                }}
                className="relative block h-[260px] w-full overflow-hidden bg-gray-100 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:h-[320px] lg:h-[360px]"
                aria-label={`Ver ${activeFeaturedProduct?.name || 'producto destacado'}`}
                onTouchStart={handleFeaturedTouchStart}
                onTouchMove={handleFeaturedTouchMove}
                onTouchEnd={handleFeaturedTouchEnd}
                style={{ ['--tw-ring-color']: primaryColor }}
              >
                {activeFeaturedImage ? (
                  <CatalogImage
                    key={`${activeFeaturedProduct?.id || activeFeaturedProduct?.name || 'featured'}-${activeFeaturedIndex}`}
                    src={cfImageUrl(activeFeaturedImage, isDesktop ? 'card' : 'thumbnail')}
                    originalSrc={activeFeaturedImage}
                    alt={activeFeaturedProduct?.name || 'Producto destacado'}
                    className="h-full w-full"
                    imgClassName="h-full w-full object-cover transition-transform duration-300 md:hover:scale-105"
                    variant="product"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Icon name={isRestaurant ? 'UtensilsCrossed' : 'Sparkles'} size={44} color="#9CA3AF" />
                  </div>
                )}
                {featuredProducts.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        pauseFeaturedAutoplay({ resumeDelayMs: 8000 });
                        goPrevFeatured();
                      }}
                      className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95"
                      aria-label="Producto destacado anterior"
                    >
                      <Icon name="ChevronLeft" size={20} color="#FFFFFF" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        pauseFeaturedAutoplay({ resumeDelayMs: 8000 });
                        goNextFeatured();
                      }}
                      className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-all hover:bg-black/60 active:scale-95"
                      aria-label="Siguiente producto destacado"
                    >
                      <Icon name="ChevronRight" size={20} color="#FFFFFF" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 backdrop-blur-sm">
                      {featuredProducts.map((product, index) => (
                        <button
                          key={product?.id || product?.publicCode || `featured-dot-${index}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            pauseFeaturedAutoplay({ resumeDelayMs: 8000 });
                            goToFeatured(index);
                          }}
                          className="h-2.5 w-2.5 rounded-full transition-all"
                          style={{
                            backgroundColor: index === activeFeaturedIndex ? '#FFFFFF' : 'rgba(255,255,255,0.45)',
                            transform: index === activeFeaturedIndex ? 'scale(1.1)' : 'scale(1)',
                          }}
                          aria-label={`Ver destacado ${index + 1}: ${product?.name || 'Producto'}`}
                          aria-pressed={index === activeFeaturedIndex}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="p-5 sm:p-6 md:p-7 flex flex-col justify-center">
                <span
                  className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-black tracking-[0.04em]"
                  style={{
                    background: isRestaurant ? 'rgba(234,88,12,0.12)' : 'rgba(217,119,6,0.12)',
                    color: isRestaurant ? '#C2410C' : '#B45309',
                  }}
                >
                  {activeFeaturedTitle}
                </span>

                <button
                  type="button"
                  onClick={() => openProduct(activeFeaturedProduct)}
                  className="mt-4 text-left hover:underline decoration-2 underline-offset-2 focus-visible:outline-none"
                >
                  <h2 className="text-2xl sm:text-[2rem] font-black tracking-tight" style={{ color: textColor }}>
                    {activeFeaturedProduct?.name}
                  </h2>
                </button>

                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <span className="text-xl font-black tabular-nums" style={{ color: primaryColorDark }}>
                    {formatPrice(activeFeaturedProduct?.price)}
                  </span>
                  {activeFeaturedProduct?.category?.trim() && (
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{ background: catalogTheme.cardBg, color: catalogTheme.chipText, border: `1px solid ${catalogTheme.borderColor}` }}
                    >
                      {activeFeaturedProduct.category}
                    </span>
                  )}
                </div>

                {activeFeaturedDescription && (
                  <p className="mt-3 text-sm sm:text-[15px] leading-6" style={{ color: catalogTheme.isDark ? 'rgba(255,255,255,0.72)' : '#4B5563' }}>
                    {activeFeaturedDescription}
                  </p>
                )}

                <div className="mt-5 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => ((isRestaurant && hasFeaturedWhatsApp) ? openFeaturedWhatsApp(activeFeaturedProduct) : openProduct(activeFeaturedProduct))}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white transition-all active:scale-[0.98]"
                    style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
                  >
                    <Icon name={(isRestaurant && hasFeaturedWhatsApp) ? 'MessageCircle' : 'Eye'} size={16} color="#FFFFFF" />
                    {(isRestaurant && hasFeaturedWhatsApp) ? featuredPrimaryCta : 'Ver producto'}
                  </button>

                  {(!isRestaurant || hasFeaturedWhatsApp) && (
                    <button
                      type="button"
                      onClick={() => (isRestaurant ? openProduct(activeFeaturedProduct) : openFeaturedWhatsApp(activeFeaturedProduct))}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-all active:scale-[0.98]"
                      style={{
                        background: catalogTheme.cardBg,
                        color: textColor,
                        border: `1px solid ${catalogTheme.borderColor}`,
                      }}
                    >
                      <Icon name={isRestaurant ? 'Eye' : 'MessageCircle'} size={16} color="currentColor" />
                      {featuredSecondaryCta}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── Buscador + categorías + precio (sticky): siempre accesibles al hacer scroll ── */}
      <div
        className="sticky z-30 backdrop-blur-md shadow-sm top-[calc(56px+var(--safe-area-top))] md:top-0"
        style={{
          backgroundColor: hexToRgba(bgColor, 0.96),
          borderBottom: `1px solid ${catalogTheme.borderColor}`,
        }}
      >
        <div className="w-full px-4 py-3 space-y-3 lg:max-w-5xl lg:mx-auto">
          <div className="max-w-3xl mx-auto w-full">
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Icon name="Search" size={16} color="#9CA3AF" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e?.target?.value)}
                placeholder={isRestaurant ? 'Buscar en el menú...' : 'Buscar productos...'}
                className="w-full pl-9 pr-9 py-2.5 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{
                  '--tw-ring-color': primaryColor,
                  backgroundColor: catalogTheme.sectionBg,
                  borderColor: catalogTheme.borderColor,
                  color: textColor,
                }}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-3 flex items-center" aria-label="Limpiar búsqueda">
                  <Icon name="X" size={14} color="#9CA3AF" />
                </button>
              )}
            </div>
          </div>
          {/* Categorías: scroll horizontal usable; Precio en fila aparte en móvil para no tapar chips */}
          <div
            className={
              hasCategoryBar
                ? 'flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-2'
                : 'flex items-center gap-2'
            }
          >
            {hasCategoryBar && (
              <div className="relative min-w-0 w-full sm:flex-1 sm:basis-0 sm:min-w-0 overflow-hidden">
                {/* Flechas solo lg+ (escritorio): el carril sigue con scroll táctil en móvil/tablet */}
                <div
                  className={`hidden lg:block absolute left-0 top-0 bottom-0 z-[25] w-12 transition-opacity duration-150 pointer-events-none ${
                    categoryScrollMore.left ? 'opacity-100' : 'opacity-0'
                  }`}
                  aria-hidden={!categoryScrollMore.left}
                >
                  <div
                    className="absolute inset-0 to-transparent pointer-events-none"
                    style={{ background: `linear-gradient(to right, ${bgColor} 45%, ${hexToRgba(bgColor, 0.8)} 70%, transparent 100%)` }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => scrollCategoryStrip(-1)}
                    aria-label="Categorías anteriores"
                    disabled={!categoryScrollMore.left}
                    className="pointer-events-auto absolute left-0 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full shadow-sm backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-0"
                    style={{ '--tw-ring-color': primaryColor, background: catalogTheme.sectionBg, border: `1px solid ${catalogTheme.borderColor}` }}
                  >
                    <Icon name="ChevronLeft" size={20} color={primaryColorDark} />
                  </button>
                </div>
                <div
                  className={`hidden lg:block absolute right-0 top-0 bottom-0 z-[25] w-12 transition-opacity duration-150 pointer-events-none ${
                    categoryScrollMore.right ? 'opacity-100' : 'opacity-0'
                  }`}
                  aria-hidden={!categoryScrollMore.right}
                >
                  <div
                    className="absolute inset-0 to-transparent pointer-events-none"
                    style={{ background: `linear-gradient(to left, ${bgColor} 45%, ${hexToRgba(bgColor, 0.8)} 70%, transparent 100%)` }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => scrollCategoryStrip(1)}
                    aria-label="Más categorías"
                    disabled={!categoryScrollMore.right}
                    className="pointer-events-auto absolute right-0 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full shadow-sm backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-0"
                    style={{ '--tw-ring-color': primaryColor, background: catalogTheme.sectionBg, border: `1px solid ${catalogTheme.borderColor}` }}
                  >
                    <Icon name="ChevronRight" size={20} color={primaryColorDark} />
                  </button>
                </div>
                <div
                  ref={categoryScrollRef}
                  className="flex flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x pb-0.5 pl-2 pr-2 sm:pl-3 sm:pr-3 lg:pl-12 lg:pr-12 min-w-0 w-full max-w-full cursor-grab select-none scrollbar-hide snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    maskImage: 'linear-gradient(to right, transparent 0px, black 12px, black calc(100% - 12px), transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0px, black 12px, black calc(100% - 12px), transparent 100%)',
                  }}
                >
                  {showTodosButton && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('all')}
                      className="flex-shrink-0 snap-start px-4 py-1.5 rounded-full text-xs font-bold border transition-all shadow-sm"
                      style={
                        selectedCategory === 'all'
                          ? { background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})`, borderColor: 'transparent', color: '#ffffff' }
                          : { background: catalogTheme.sectionBg, borderColor: catalogTheme.borderColor, color: catalogTheme.chipText }
                      }
                    >
                      {isRestaurant ? 'Todo el menú' : 'Todos'}
                    </button>
                  )}
                  {visibleCategories.map((cat) => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className="flex-shrink-0 snap-start px-4 py-1.5 rounded-full text-xs font-bold border transition-all"
                      style={
                        selectedCategory === cat
                          ? { background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})`, borderColor: 'transparent', color: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }
                          : { background: catalogTheme.sectionBg, borderColor: catalogTheme.borderColor, color: catalogTheme.chipText }
                      }
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`flex flex-shrink-0 items-center gap-2 ${hasCategoryBar ? 'self-end sm:self-auto' : ''}`}
            >
              <button
                type="button"
                onClick={() => setFiltersOpen(prev => !prev)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                style={
                  filtersOpen || (priceRange?.[0] > 0 || priceRange?.[1] < maxPrice)
                    ? { borderColor: primaryColor, color: primaryColorDark, backgroundColor: theme.primaryRgba(0.12) }
                    : { background: catalogTheme.sectionBg, borderColor: catalogTheme.borderColor, color: catalogTheme.chipText }
                }
              >
                <Icon name="SlidersHorizontal" size={13} color={filtersOpen || (priceRange?.[0] > 0 || priceRange?.[1] < maxPrice) ? primaryColorDark : catalogTheme.chipText} />
                Precio
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex-shrink-0 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Icon name="X" size={14} color="currentColor" />
                </button>
              )}
            </div>
          </div>

          {/* Expanded price range filter */}
          {filtersOpen && maxPrice > 0 && (
            <div className="rounded-xl p-2.5" style={{ background: catalogTheme.sectionBg, border: `1px solid ${catalogTheme.borderColor}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700">Rango de precio</span>
                <span className="text-xs text-gray-500">
                  {formatPrice(priceRange?.[0])} — {formatPrice(priceRange?.[1])}
                </span>
              </div>
              <PriceRangeSlider
                min={0}
                max={maxPrice}
                value={priceRange}
                onChange={setPriceRange}
                formatPrice={formatPrice}
                theme={theme}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Products: espacio extra abajo para botón flotante y safe area ── */}
      <div
        className="w-full max-w-full overflow-x-hidden px-4 py-3 lg:max-w-7xl lg:mx-auto"
        style={{
          paddingBottom: 'calc(8rem + var(--safe-area-bottom))',
          boxShadow: `inset 0 4px 12px ${catalogTheme.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.04)'}`,
        }}
      >
        {/* Aviso de modo rápido (conexión lenta) */}
        {isFastMode && (
          <p className="text-[11px] mb-2 flex items-center gap-1" style={{ color: catalogTheme.isDark ? 'rgba(255,255,255,0.32)' : '#BBBBBB' }}>
            <Icon name="Wifi" size={11} color="currentColor" />
            Versión liviana para conexión lenta
          </p>
        )}
        {/* Product count */}
        {(gridProducts.length > 0 || showGridEmptyState) && (
          <p className="text-xs font-medium mb-3" style={{ color: catalogTheme.isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
            {gridProducts.length} {gridProducts.length === 1 ? 'producto' : 'productos'}
            {hasActiveFilters && totalGridProducts !== gridProducts.length && (
              <span> de {totalGridProducts}</span>
            )}
          </p>
        )}

        {showGridEmptyState ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: catalogTheme.sectionBg }}>
              {hasActiveFilters ? (
                <Icon name="SearchX" size={28} color="#9CA3AF" />
              ) : (
                <Icon name="Package" size={28} color="#9CA3AF" />
              )}
            </div>
            <p className="text-sm font-medium text-gray-400">
              {searchQuery?.trim()
                ? `No hay resultados para «${searchQuery.trim()}». Prueba con otro término o limpia los filtros.`
                : hasActiveFilters
                  ? 'No hay productos con estos filtros'
                  : 'No hay productos disponibles'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-3 text-xs font-semibold transition-colors hover:opacity-80"
                style={{ color: primaryColor }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : gridProducts.length > 0 ? (
          /* Una sola grilla continua (vista Todos o categoría seleccionada) */
          <>
            <div className={gridClass} style={gridStyle}>
              {visibleProducts.map((product, idx) => (
                <ProductCard
                  key={product?.id}
                  product={product}
                  formatPrice={formatPrice}
                  onOpen={openProduct}
                  theme={theme}
                  cardSettings={cardSettings}
                  useCategories={useCategories}
                  compact={useCompactCard}
                  imageIndex={idx}
                  isDesktop={isDesktop}
                  imageProfile={cardImageProfile}
                  isRestaurant={isRestaurant}
                />
              ))}
            </div>
            {hasMoreProducts && (
              <div className="flex justify-center mt-6 mb-2">
                <button
                  type="button"
                  onClick={() => setVisibleCount(c => c + (isDesktop ? 12 : isFastMode ? 4 : 8))}
                  className="px-6 py-3 rounded-2xl text-sm font-bold border transition-all hover:opacity-80 active:scale-[0.98]"
                  style={{
                    borderColor: primaryColor,
                    color: primaryColorDark,
                    backgroundColor: theme.primaryRgba(0.08),
                  }}
                >
                  Ver más productos ({gridProducts.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </>
        ) : null}

        {!loading && !notFound && business && catalogSeoContent?.visibleDescription && (
          <div className="mt-10 md:mt-14 flex w-full justify-center overflow-x-hidden px-0 sm:px-1">
            <section
              className="w-full max-w-full rounded-2xl px-6 py-8 text-left sm:px-10 sm:py-10 lg:max-w-[min(100%,1200px)]"
              style={{
                background: catalogTheme.sectionBg,
                border: `1px solid ${catalogTheme.borderColor}`,
              }}
              aria-labelledby="catalog-seo-heading"
            >
              <header className="mb-7 sm:mb-8">
                <h2
                  id="catalog-seo-heading"
                  className="text-2xl font-semibold tracking-tight sm:text-3xl"
                  style={{ color: textColor }}
                >
                  Sobre este catálogo
                </h2>
                <div
                  className="mt-4 h-1 w-16 rounded-full opacity-90"
                  style={{ backgroundColor: primaryColor }}
                  aria-hidden
                />
              </header>
              <div className="space-y-7 text-[15px] sm:text-base" style={{ color: catalogTheme.isDark ? 'rgba(255,255,255,0.68)' : '#4B5563' }}>
                <p className="m-0 max-w-none text-pretty leading-[1.85] sm:leading-[1.9]">
                  {catalogSeoContent.visibleDescription}
                </p>
              </div>
            </section>
          </div>
        )}

        {!loading && !notFound && business && catalogFooterText && (
          <footer
            className="mx-auto mt-10 w-full max-w-3xl px-3 text-center sm:mt-12"
            aria-label="Texto del pie de página del catálogo"
          >
            <p
              className="m-0 text-pretty text-sm font-medium leading-7 sm:text-[15px] sm:leading-8"
              style={{ color: catalogTheme.isDark ? 'rgba(255,255,255,0.68)' : '#4B5563' }}
            >
              {catalogFooterText}
            </p>
          </footer>
        )}

        <BrandingFooter business={business} />
      </div>

      {/* Floating Cart Button */}
      <FloatingCartButton onOpen={() => setCartOpen(true)} formatPrice={formatPrice} theme={theme} />

      {/* Order Panel */}
      {cartOpen && (
        <OrderPanel
          business={business}
          slug={slug}
          formatPrice={formatPrice}
          onClose={() => setCartOpen(false)}
          theme={theme}
        />
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          products={products}
          business={business}
          slug={slug}
          formatPrice={formatPrice}
          whatsAppUrl={buildSingleWhatsAppUrl(selectedProduct)}
          whatsAppMessage={buildSingleWhatsAppMessage(selectedProduct)}
          onClose={closeProduct}
          theme={theme}
          cardSettings={cardSettings}
          useCategories={useCategories}
        />
      )}
    </CatalogLayout>
  );
}

// ─── Price Range Slider ───────────────────────────────────────────────────────
function PriceRangeSlider({ min, max, value, onChange, formatPrice, theme }) {
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const handleMinChange = (e) => {
    const newMin = Math.min(Number(e?.target?.value), value?.[1] - 1);
    onChange([newMin, value?.[1]]);
  };

  const handleMaxChange = (e) => {
    const newMax = Math.max(Number(e?.target?.value), value?.[0] + 1);
    onChange([value?.[0], newMax]);
  };

  const minPercent = max > 0 ? ((value?.[0] - min) / (max - min)) * 100 : 0;
  const maxPercent = max > 0 ? ((value?.[1] - min) / (max - min)) * 100 : 100;

  return (
    <div className="space-y-3">
      <div className="relative h-5 flex items-center">
        <div className="absolute w-full h-1.5 rounded-full bg-gray-200" />
        <div
          className="absolute h-1.5 rounded-full"
          style={{
            left: `${minPercent}%`,
            right: `${100 - maxPercent}%`,
            background: `linear-gradient(90deg, ${primaryColor}, ${primaryColorDark})`,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value?.[0]}
          onChange={handleMinChange}
          className="absolute w-full h-1.5 appearance-none bg-transparent cursor-pointer"
          style={{ zIndex: value?.[0] > max - 100 ? 5 : 3 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value?.[1]}
          onChange={handleMaxChange}
          className="absolute w-full h-1.5 appearance-none bg-transparent cursor-pointer"
          style={{ zIndex: 4 }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-[11px] text-gray-400">{formatPrice(min)}</span>
        <span className="text-[11px] text-gray-400">{formatPrice(max)}</span>
      </div>
    </div>
  );
}

// ─── Floating Cart Button ─────────────────────────────────────────────────────
function FloatingCartButton({ onOpen, formatPrice, theme }) {
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const primaryRgba = theme?.primaryRgba || (() => 'rgba(37,211,102,0.45)');
  const { itemCount, total } = useCart();
  const [prevCount, setPrevCount] = useState(0);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    if (itemCount > prevCount && itemCount > 0) {
      setBump(true);
      setTimeout(() => setBump(false), 400);
    }
    setPrevCount(itemCount);
  }, [itemCount]);

  if (itemCount === 0) {
    return (
      <div
        className="fixed left-0 right-0 z-50 px-4 pt-2 pointer-events-none"
        style={{ bottom: 0, paddingBottom: 'calc(20px + var(--safe-area-bottom))' }}
      >
        <div className="max-w-2xl mx-auto">
          <button
            onClick={onOpen}
            className="pointer-events-auto w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl text-white font-bold text-sm transition-all duration-300 shadow-xl ring-2 ring-black/10"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`,
              boxShadow: `0 25px 50px -12px rgba(0,0,0,0.35), 0 12px 28px ${primaryRgba(0.45)}, 0 4px 12px rgba(0,0,0,0.15)`,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFFFFF">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <span>Enviar pedido por WhatsApp</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed left-0 right-0 z-50 px-4 pt-2 pointer-events-none"
      style={{ bottom: 0, paddingBottom: 'calc(20px + var(--safe-area-bottom))' }}
    >
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onOpen}
          className={`pointer-events-auto w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-white font-bold text-sm transition-all duration-300 shadow-xl ring-2 ring-black/10 ${
            bump ? 'scale-[1.03]' : 'scale-100'
          }`}
          style={{
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`,
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.35), 0 12px 28px ${primaryRgba(0.45)}, 0 4px 12px rgba(0,0,0,0.15)`,
          }}
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/20 flex-shrink-0">
            <Icon name="ShoppingCart" size={18} color="#FFFFFF" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <span className="text-[15px] font-bold">Enviar pedido por WhatsApp ({itemCount})</span>
          </div>
          <div
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl bg-white flex items-center justify-center transition-all duration-300 ${
              bump ? 'scale-110' : 'scale-100'
            }`}
          >
            <span className="text-[13px] font-black" style={{ color: primaryColorDark }}>{formatPrice(total)}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Order Panel ──────────────────────────────────────────────────────────────
function OrderPanel({ business, slug, formatPrice, onClose, theme }) {
  // País para placeholder visual del teléfono — solo sugerencia, sin validación por país.
  const checkoutUxCountry =
    business?.routingCountryCode ||
    business?.countryCode ||
    business?.country ||
    null;
  const countryLabels = getCountryLabels(checkoutUxCountry);
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const primaryRgba = theme?.primaryRgba || (() => 'rgba(37,211,102,0.35)');
  const { items, updateQuantity, removeItem, total, clearCart } = useCart();
  const [customerName, setCustomerName] = useState('');
  const [customerPhoneDigits, setCustomerPhoneDigits] = useState('');
  const [serviceType, setServiceType] = useState('mesa');
  const [tableReference, setTableReference] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [checkoutState, setCheckoutState] = useState('idle'); // idle | loading | success | error
  const [sendError, setSendError] = useState(null);
  const [submitInfo, setSubmitInfo] = useState(null);
  const [pendingWhatsappMessage, setPendingWhatsappMessage] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const submitLockRef = useRef(false);
  const isRestaurant = isRestaurantBusiness(business);
  const requiresTable = isRestaurant && serviceType === 'mesa';
  const requiresDeliveryAddress = isRestaurant && serviceType === 'delivery';
  const sending = checkoutState === 'loading';

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleBackdrop = (e) => {
    if (e?.target === e?.currentTarget) onClose();
  };

  const handleCopyMessage = async () => {
    if (!pendingWhatsappMessage) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(pendingWhatsappMessage);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = pendingWhatsappMessage;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedMessage(true);
      window.setTimeout(() => setCopiedMessage(false), 2000);
    } catch {
      setCopiedMessage(false);
    }
  };

  const sendWhatsApp = async () => {
    if (submitLockRef.current) return;
    const nextErrors = {};
    if (!customerName?.trim()) nextErrors.customerName = 'Por favor ingresa tu nombre.';
    if (requiresTable && !tableReference?.trim()) nextErrors.tableReference = 'Por favor ingresa tu mesa.';
    if (requiresDeliveryAddress && !deliveryAddress?.trim()) nextErrors.deliveryAddress = 'Por favor ingresa la dirección de entrega.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    submitLockRef.current = true;
    setSendError(null);
    setSubmitInfo(null);
    setPendingWhatsappMessage('');
    setCopiedMessage(false);
    setCheckoutState('loading');

    try {
      console.info('[catalog-order] creating order...');
      // 1. Guardar pedido en Supabase antes de abrir WhatsApp
      const orderItems = items?.map(item => ({
        productId: item?.id,
        productName: item?.name,
        productPrice: item?.price,
        quantity: item?.quantity,
        subtotal: item?.price * item?.quantity,
        selectedOptions: item?.selectedOptions ?? [],
      }));

      const phoneForOrder = normalizeOptionalCustomerPhone(customerPhoneDigits);

      const { data: order, error: orderError } = await createOrder(business?.id, {
        customerName: customerName?.trim(),
        customerPhone: phoneForOrder,
        serviceType: isRestaurant ? serviceType : null,
        tableReference: isRestaurant && serviceType === 'mesa'
          ? tableReference?.trim()
          : null,
        deliveryAddress: isRestaurant && serviceType === 'delivery'
          ? deliveryAddress?.trim()
          : null,
        totalAmount: total,
        notes: notes?.trim() || null,
      }, orderItems);

      if (orderError) {
        console.error('[catalog-order] error creating order', orderError?.message || orderError);
        const isPlanLimit = orderError?.code === 'PLAN_LIMIT_EXCEEDED' || (orderError?.message && orderError.message.includes('PLAN_LIMIT_EXCEEDED'));
        setSendError(isPlanLimit
          ? 'Tu plan Free permite 30 pedidos por mes. Actualiza a Pro para recibir pedidos ilimitados.'
          : 'No pudimos guardar tu pedido. Intenta nuevamente.');
        setCheckoutState('error');
        return;
      }
      console.info('[catalog-order] order created id=', order?.id || '(unknown)');

      // 2. Pedido guardado correctamente → abrir WhatsApp
      const phone = business?.whatsapp?.replace(/\D/g, '');
      if (phone) {
        const lines = items?.map((item) => {
          const label = item?.publicCode ? `${item.publicCode} - ${item?.name}` : item?.name;
          return `- ${item?.quantity} ${label}`;
        });
        const catalogUrl = slug ? getWhatsAppOrderCatalogUrl(slug) : '';
        let message = '';
        if (catalogUrl) message += `${catalogUrl}\n\n`;
        message += `Hola, quiero hacer un pedido.\n\nNombre: ${customerName?.trim()}`;
        if (phoneForOrder) message += `\nTeléfono: ${phoneForOrder}`;
        if (isRestaurant) {
          const serviceTypeLabel = serviceType === 'delivery'
            ? 'Delivery'
            : serviceType === 'pickup'
              ? 'Retiro en mostrador'
              : 'Mesa';
          message += `\nTipo: ${serviceTypeLabel}`;
          if (serviceType === 'mesa') message += `\nMesa: ${tableReference?.trim()}`;
          if (serviceType === 'delivery') message += `\nDirección: ${deliveryAddress?.trim()}`;
        }
        message += `\n\nPedido:\n${lines?.join('\n')}`;
        if (notes?.trim()) message += `\n\nComentario:\n${notes?.trim()}`;
        if (hasViralBranding(business)) {
          message += `${catalogUrl ? '\n\n\n' : '\n\n'}${getOrderMessageBrandingSuffix(business)}`;
        }
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        const path = typeof window !== 'undefined' ? window.location?.pathname || getPublicCatalogRelativePath(slug) : getPublicCatalogRelativePath(slug);
        recordCatalogWhatsAppClick(slug, path, 'cart_checkout').catch(() => {});
        console.info('[catalog-order] opening whatsapp...');
        if (isWhatsAppWebView()) {
          console.info('[whatsapp-webview] detected, blocking auto-open');
          setCheckoutState('error');
          setSubmitInfo('No podemos abrir WhatsApp desde aquí. Abre este catálogo en Safari o Chrome para enviar tu pedido.');
          setPendingWhatsappMessage(message);
          return;
        }
        const opened = openWhatsAppUrl(url);
        if (!opened) {
          setCheckoutState('error');
          setSubmitInfo('Pedido guardado, pero no pudimos abrir WhatsApp.');
          setPendingWhatsappMessage(message);
          return;
        }
      }

      // 3. Limpiar carrito y cerrar
      setCheckoutState('success');
      setSubmitInfo('Pedido confirmado. Te abrimos WhatsApp para enviarlo.');
      clearCart();
      onClose();
    } catch (e) {
      console.error('[catalog-order] error creating order', e?.message || e);
      setCheckoutState('error');
      setSendError('No pudimos guardar tu pedido. Intenta nuevamente.');
    } finally {
      submitLockRef.current = false;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdrop}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">Tu pedido</h2>
            <p className="text-xs text-gray-400 mt-0.5">{items?.length} {items?.length === 1 ? 'producto' : 'productos'}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center transition-all hover:bg-gray-200 active:scale-90"
          >
            <Icon name="X" size={18} color="#374151" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Detalle del pedido */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Detalle del pedido
              </h3>
              <span className="text-xs text-gray-400">
                {items?.length} {items?.length === 1 ? 'producto' : 'productos'}
              </span>
            </div>
            <div
              className="space-y-3 rounded-2xl bg-gray-50/80 border border-gray-100"
              style={{ maxHeight: '210px', overflowY: 'auto' }}
            >
              {items?.map(item => (
                <div key={item?.id} className="flex items-center gap-3 px-3 py-2.5">
                  {/* Image */}
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                    {item?.imageUrl ? (
                      <CatalogImage
                        src={cfImageUrl(item.imageUrl, 'thumbnail')}
                        originalSrc={item.imageUrl}
                        alt={item?.name}
                        className="w-full h-full"
                        imgClassName="w-full h-full object-cover"
                        variant="product"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="ImageOff" size={18} color="#D1D5DB" />
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item?.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item?.quantity} × {formatPrice(item?.price)} c/u
                    </p>
                    <p className="text-sm font-bold text-gray-900 mt-0.5">
                      {formatPrice(item?.price * item?.quantity)}
                    </p>
                  </div>
                  {/* Quantity controls */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => updateQuantity(item?.id, item?.quantity - 1)}
                      className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center transition-all hover:bg-gray-100 active:scale-90 shadow-sm"
                    >
                      <Icon name="Minus" size={12} color="#374151" />
                    </button>
                    <span className="text-sm font-bold text-gray-900 w-5 text-center">{item?.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item?.id, item?.quantity + 1)}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
                    >
                      <Icon name="Plus" size={12} color="#FFFFFF" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between rounded-2xl px-4 py-3 border" style={{ backgroundColor: primaryRgba(0.08), borderColor: primaryRgba(0.25) }}>
            <span className="text-sm font-semibold text-gray-700">Total estimado</span>
            <span className="text-lg font-black" style={{ color: primaryColorDark }}>{formatPrice(total)}</span>
          </div>

          {/* Customer name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tu nombre <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={customerName}
              onChange={e => {
                setCustomerName(e?.target?.value);
                if (fieldErrors?.customerName) {
                  setFieldErrors((prev) => ({ ...prev, customerName: undefined }));
                }
              }}
              placeholder="Ej: Juan García"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
              style={{ ['--tw-ring-color']: primaryColor }}
            />
            {fieldErrors?.customerName && (
              <p className="text-xs text-red-600 mt-1.5">{fieldErrors.customerName}</p>
            )}
          </div>

          <CheckoutPhoneOptional
            variant="catalog"
            digits={customerPhoneDigits}
            onDigitsChange={setCustomerPhoneDigits}
            focusRingColor={primaryColor}
            uxCountry={checkoutUxCountry}
          />

          {isRestaurant && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tipo de pedido <span className="text-red-500">*</span></label>
                <select
                  value={serviceType}
                  onChange={(e) => {
                    setServiceType(e?.target?.value);
                    if (e?.target?.value !== 'mesa') {
                      setFieldErrors((prev) => ({ ...prev, tableReference: undefined }));
                    }
                    if (e?.target?.value !== 'delivery') {
                      setFieldErrors((prev) => ({ ...prev, deliveryAddress: undefined }));
                    }
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  style={{ ['--tw-ring-color']: primaryColor }}
                >
                  <option value="mesa">Mesa</option>
                  <option value="pickup">Retiro en mostrador</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>

              {serviceType === 'mesa' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mesa <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={tableReference}
                    onChange={(e) => {
                      setTableReference(e?.target?.value);
                      if (fieldErrors?.tableReference) {
                        setFieldErrors((prev) => ({ ...prev, tableReference: undefined }));
                      }
                    }}
                    placeholder="Ej: 7, 12, A3, Terraza, Barra"
                    maxLength={24}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                    style={{ ['--tw-ring-color']: primaryColor }}
                  />
                  {fieldErrors?.tableReference && (
                    <p className="text-xs text-red-600 mt-1.5">{fieldErrors.tableReference}</p>
                  )}
                </div>
              )}

              {serviceType === 'delivery' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Dirección de entrega <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={(e) => {
                      setDeliveryAddress(e?.target?.value);
                      if (fieldErrors?.deliveryAddress) {
                        setFieldErrors((prev) => ({ ...prev, deliveryAddress: undefined }));
                      }
                    }}
                    placeholder={countryLabels.addressPlaceholder}
                    maxLength={160}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                    style={{ ['--tw-ring-color']: primaryColor }}
                  />
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{DELIVERY_ADDRESS_FIELD_HINT}</p>
                  {fieldErrors?.deliveryAddress && (
                    <p className="text-xs text-red-600 mt-1.5">{fieldErrors.deliveryAddress}</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Comentario <span className="text-gray-400 font-normal">(opcional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e?.target?.value)}
              placeholder="Ej: Retiro hoy, Entrega a domicilio..."
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all resize-none"
              style={{ ['--tw-ring-color']: primaryColor }}
            />
          </div>
        </div>

        {/* Footer CTA */}
        <div className="px-5 pb-6 pt-3 flex-shrink-0 border-t border-gray-100 space-y-2">
          {(sendError || submitInfo) && (
            <div
              className={`px-4 py-3 rounded-xl border text-sm text-center ${
                sendError ? 'bg-red-50 border-red-200 text-red-600' : 'bg-blue-50 border-blue-200 text-blue-700'
              }`}
            >
              {sendError || submitInfo}
            </div>
          )}
          {!!pendingWhatsappMessage && (
            <button
              type="button"
              onClick={handleCopyMessage}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              {copiedMessage ? 'Mensaje copiado' : 'Copiar mensaje'}
            </button>
          )}
          <button
            onClick={sendWhatsApp}
            disabled={sending}
            className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-base font-bold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`, boxShadow: `0 8px 24px ${primaryRgba(0.35)}` }}
          >
            {sending ? (
              <>
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                </svg>
                Registrando pedido...
              </>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Enviar pedido por WhatsApp
              </>
            )}
          </button>
          <button
            onClick={() => { clearCart(); onClose(); }}
            disabled={sending}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Vaciar pedido
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
// compact: vista compacta (2 cols móvil), tarjeta pequeña; una sola imagen + badge +N si hay más
export function ProductCard({
  product,
  formatPrice,
  onOpen,
  theme,
  cardSettings,
  useCategories = false,
  compact = false,
  readOnly = false,
  ctaLabel = 'Ver producto',
  onCtaClick,
  imageIndex = 0,
  isDesktop = false,
  imageProfile,
  isRestaurant = false,
}) {
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const showPrice = cardSettings?.showPrice !== false;
  const productState = getProductCommercialState(product);
  const { addItem, updateQuantity, items } = useCart();
  const cartItem = items?.find(i => i?.id === product?.id);
  const qty = cartItem?.quantity || 0;
  const [bump, setBump] = useState(false);
  const isEager = imageIndex < 4;
  const imgProfile = imageProfile ?? (isDesktop ? 'thumbnail' : 'cardMobile');

  if (productState === 'hidden') return null;

  const handleAdd = (e) => {
    e?.stopPropagation();
    addItem(product);
    setBump(true);
    setTimeout(() => setBump(false), 300);
  };

  const handleIncrease = (e) => {
    e?.stopPropagation();
    updateQuantity(product?.id, qty + 1);
    setBump(true);
    setTimeout(() => setBump(false), 300);
  };

  const handleDecrease = (e) => {
    e?.stopPropagation();
    updateQuantity(product?.id, qty - 1);
  };

  const imgs = getProductImages(product);
  const cardImage = getProductCardImage(product);
  const extraImages = imgs.length > 1 ? imgs.length - 1 : 0;
  const trustBadge = getProductCardTrustBadge(product);
  // discount viene del badge para no recalcular; null cuando no hay descuento real
  const discount = trustBadge?.discount ?? null;
  const imgAspect = compact ? 'aspect-square' : 'aspect-[4/5]';
  const roundTop = 'rounded-t-2xl';
  const stateBadge = productState === 'sold_out'
    ? { label: 'Agotado', style: { color: '#9A3412', backgroundColor: 'rgba(251,146,60,0.18)' } }
    : null;
  const qtyTopClass =
    qty > 0 && trustBadge ? (compact ? 'top-7' : 'top-[1.85rem]') : 'top-1';
  // Sombra levemente más intensa para productos en oferta — señal visual sin romper diseño
  const cardShadow = product?.onSale
    ? '0 2px 14px rgba(220,38,38,0.10), 0 1px 4px rgba(0,0,0,0.06)'
    : '0 2px 10px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)';

  return (
    <div
      className="group flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border bg-white text-left will-change-transform transition-[transform,box-shadow] duration-200 ease-out md:hover:-translate-y-1 md:hover:scale-[1.01] md:hover:shadow-lg active:scale-[0.98]"
      style={{ boxShadow: cardShadow, borderColor: theme?.borderColor || '#E5E7EB' }}
    >
      {/* Imagen: aspect-ratio + overflow aquí (no en la card entera) para no recortar el botón */}
      <button
        type="button"
        onClick={() => {
          if (readOnly) onCtaClick?.(product);
          else onOpen?.(product);
        }}
        className={`relative block w-full shrink-0 overflow-hidden bg-gray-50 text-left ${roundTop}`}
      >
        <div className={`relative w-full ${imgAspect} min-h-0`}>
          {cardImage ? (
            <CatalogImage
              src={cardImage === product?.thumbnailUrl || cardImage === product?.cardImageUrl ? cardImage : cfImageUrl(cardImage, imgProfile)}
              originalSrc={cardImage}
              alt={product?.name}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              variant="product"
              loading={isEager ? 'eager' : 'lazy'}
            />
          ) : (
            <div className={`flex h-full w-full items-center justify-center bg-gray-100 ${compact ? 'min-h-[72px]' : ''}`}>
              <Icon name="ImageOff" size={compact ? 20 : 32} color="#D1D5DB" />
            </div>
          )}
          {trustBadge && (
            <span
              className={`absolute left-1 z-[1] max-w-[calc(100%-3rem)] truncate rounded-md px-1.5 py-0.5 text-[9px] font-bold shadow-sm sm:max-w-[11rem] sm:text-[10px] ${compact ? 'top-1' : 'top-1.5'}`}
              style={trustBadge.style}
            >
              {trustBadge.label}
            </span>
          )}
          {stateBadge && (
            <span
              className={`absolute right-1 z-[1] rounded-full px-2 py-1 text-[9px] font-bold shadow-sm sm:text-[10px] ${compact ? 'top-1' : 'top-1.5'}`}
              style={stateBadge.style}
            >
              {stateBadge.label}
            </span>
          )}
          {extraImages > 0 && (
            <div
              className={`absolute right-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold text-white shadow ${compact ? 'top-7' : 'top-[1.85rem]'}`}
              style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
            >
              <Icon name="Images" size={8} color="#fff" />
              +{extraImages}
            </div>
          )}
          {qty > 0 && (
            <div
              className={`absolute left-1 flex items-center justify-center rounded-full text-white shadow ${qtyTopClass} ${compact ? 'h-5 w-5 text-[10px] font-black' : 'h-6 w-6 text-[11px] font-black'}`}
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
            >
              {qty}
            </div>
          )}
          {productState === 'sold_out' && (
            <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: 'rgba(0,0,0,0.32)' }} />
          )}
          {productState === 'available' && product?.hasOptions && (
            <div
              className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold"
              style={{ backgroundColor: 'rgba(234,179,8,0.9)', color: '#713f12' }}
            >
              <Icon name="ListChecks" size={8} color="#713f12" />
              Opciones
            </div>
          )}
          {product?.videoUrl && (
            <div
              className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold text-white shadow"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
            >
              <Icon name="Play" size={8} color="#fff" />
              Video
            </div>
          )}
        </div>
      </button>

      {/* Bloque inferior: min-h-0 permite encoger en grid; título en caja de altura FIJA (2 líneas máx. reales) */}
      <div
        className={`flex min-h-0 flex-1 flex-col justify-between bg-white ${compact ? 'gap-2 rounded-b-2xl p-3' : 'gap-3 rounded-b-2xl p-4'}`}
      >
        {/* Top: category badge + name — only these grow/shrink */}
        <div className="flex min-h-0 w-full flex-col gap-1">
          {useCategories && product?.category && (
            <span
              className="line-clamp-1 max-w-full self-start overflow-hidden rounded px-1 py-0.5 text-[10px] font-semibold text-ellipsis"
              style={{ color: primaryColorDark, backgroundColor: theme?.primaryRgba?.(0.12) || 'rgba(37,211,102,0.12)' }}
            >
              {product?.category}
            </span>
          )}
          {/* Fixed-height container: reserves exact space for 2 lines regardless of content */}
          <div
            className={`w-full shrink-0 overflow-hidden ${compact ? 'h-[2.2rem]' : 'h-[2.45rem] sm:h-[2.7rem]'}`}
          >
            <h3
              className={`line-clamp-2 h-full w-full min-w-0 overflow-hidden text-ellipsis break-words text-gray-900 [overflow-wrap:anywhere] ${
                compact ? 'text-[11px] font-semibold leading-[1.25]' : 'text-[11px] font-bold leading-[1.25] sm:text-xs sm:leading-[1.3]'
              }`}
            >
              {(product?.name || '').trim() || 'Producto'}
            </h3>
          </div>
        </div>

        {/* Bottom: price + button — always anchored at the card bottom */}
        <div className={`w-full shrink-0 flex flex-col ${compact ? 'gap-1.5' : 'gap-2'} pt-1`}>
          {showPrice && (
            <div className="flex flex-col gap-0.5">
              <p className={`shrink-0 font-bold leading-none tracking-tight text-gray-900 ${compact ? 'text-lg' : 'text-xl'}`}>
                {formatPrice(product?.price)}
              </p>
              {/* Precio tachado — solo cuando hay descuento real (compareAtPrice > price) */}
              {discount !== null && (
                <p className={`text-gray-400 line-through leading-none ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                  {formatPrice(product?.compareAtPrice)}
                </p>
              )}
            </div>
          )}
          {productState === 'sold_out' ? (
            <button
              type="button"
              disabled
              className={`flex w-full items-center justify-center gap-1.5 rounded-xl border text-center cursor-not-allowed ${
                compact ? 'rounded-lg py-1.5 text-[11px] font-bold' : 'py-2.5 text-xs font-bold sm:py-3'
              }`}
              style={{ borderColor: 'rgba(107,107,107,0.2)', color: '#9CA3AF', backgroundColor: 'rgba(107,107,107,0.05)' }}
            >
              Agotado
            </button>
          ) : readOnly ? (
            <button
              type="button"
              onClick={() => onCtaClick?.(product)}
              className={`flex w-full items-center justify-center gap-1.5 rounded-xl border text-center transition-[transform,filter] duration-150 ease-out md:hover:brightness-[1.02] active:scale-95 ${
                compact ? 'rounded-lg py-1.5 text-[11px] font-bold' : 'py-2.5 text-xs font-bold sm:py-3'
              }`}
              style={{
                borderColor: theme?.primaryRgba?.(0.24) || 'rgba(37,211,102,0.24)',
                background: theme?.primaryRgba?.(0.08) || 'rgba(37,211,102,0.08)',
                color: primaryColorDark,
              }}
            >
              <Icon name="ArrowRight" size={compact ? 11 : 13} color={primaryColorDark} />
              {ctaLabel}
            </button>
          ) : qty === 0 ? (
            <button
              type="button"
              onClick={handleAdd}
              className={`flex w-full items-center justify-center gap-1.5 rounded-xl text-white transition-[transform,filter] duration-150 ease-out md:hover:brightness-[1.08] active:scale-95 ${bump ? 'scale-105' : ''} ${
                compact ? 'rounded-lg py-1.5 text-[11px] font-bold' : 'py-2.5 text-xs font-bold sm:py-3'
              }`}
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
            >
              <span className={`inline-flex items-center justify-center rounded-full bg-white/20 text-white ${compact ? 'h-5 w-5' : 'h-6 w-6'}`}>
                <Icon name="Plus" size={compact ? 11 : 13} color="#FFFFFF" strokeWidth={2.5} />
              </span>
              {isRestaurant ? 'Pedir' : 'Agregar'}
            </button>
          ) : (
            <div
              className={`flex items-center justify-between overflow-hidden rounded-xl transition-all duration-150 ${bump ? 'scale-105' : ''} ${compact ? 'rounded-lg' : ''}`}
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
            >
              <button
                type="button"
                onClick={handleDecrease}
                className={`flex items-center justify-center text-white transition-colors hover:bg-white/20 active:scale-90 ${compact ? 'h-8 w-8' : 'h-9 w-9 sm:h-10 sm:w-10'}`}
              >
                <Icon name="Minus" size={compact ? 10 : 14} color="#FFFFFF" />
              </button>
              <span className={`font-black text-white ${compact ? 'text-xs' : 'text-sm'}`}>{qty}</span>
              <button
                type="button"
                onClick={handleIncrease}
                className={`flex items-center justify-center text-white transition-colors hover:bg-white/20 active:scale-90 ${compact ? 'h-8 w-8' : 'h-9 w-9 sm:h-10 sm:w-10'}`}
              >
                <Icon name="Plus" size={compact ? 10 : 14} color="#FFFFFF" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Miniatura del modal con fallback si la imagen falla al cargar
function ThumbnailButton({ url, productName, index, isSelected, primaryColor, onSelect }) {
  const [error, setError] = useState(false);
  const [useDirect, setUseDirect] = useState(false);
  if (!url) return null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all bg-gray-100 flex items-center justify-center"
      style={{
        borderColor: isSelected ? primaryColor : 'transparent',
        boxShadow: isSelected ? `0 0 0 2px ${primaryColor}` : 'none',
      }}
    >
      {error ? (
        <Icon name="ImageOff" size={20} color="#D1D5DB" />
      ) : (
        <CatalogImage
          src={useDirect ? url : cfImageUrl(url, 'thumbnail')}
          originalSrc={url}
          alt={`${productName ?? 'Producto'} ${index + 1}`}
          className="w-full h-full"
          imgClassName="w-full h-full object-cover"
          loading="lazy"
          variant="product"
          onError={() => {
            if (!useDirect && isCfTransformableUrl(url)) setUseDirect(true);
            else setError(true);
          }}
        />
      )}
    </button>
  );
}

// ─── Restaurant add-ons ──────────────────────────────────────────────────────
const ENABLE_RESTAURANT_ADDONS = true;
const ENABLE_RESTAURANT_COMBOS = true;

const normalizeComboItem = (item, index = 0) => {
  if (!item || typeof item !== 'object') return null;
  const priceValue = Number(item?.price);
  const label = String(item?.label || '').trim();
  if (!label) return null;
  return {
    id: item?.id || `combo-item-${index}`,
    label,
    price: Number.isFinite(priceValue) && priceValue >= 0 ? Math.round(priceValue) : 0,
    _key: item?.id || `${label}-${index}`,
  };
};

const normalizeComboGroup = (group, index = 0) => {
  if (!group || typeof group !== 'object') return null;
  const label = String(group?.label || '').trim();
  const maxValue = Number(group?.maxSelections);
  const items = Array.isArray(group?.items)
    ? group.items.map((item, itemIndex) => normalizeComboItem(item, itemIndex)).filter(Boolean)
    : [];
  if (!label || items.length === 0) return null;
  return {
    id: group?.id || `combo-group-${index}`,
    label,
    required: group?.required === true,
    maxSelections: Number.isFinite(maxValue) && maxValue > 0 ? Math.round(maxValue) : 1,
    items,
  };
};

const normalizeComboConfig = (comboConfig) => {
  if (!comboConfig || typeof comboConfig !== 'object' || Array.isArray(comboConfig) || comboConfig?.enabled !== true) {
    return null;
  }
  const groups = Array.isArray(comboConfig?.groups)
    ? comboConfig.groups.map((group, index) => normalizeComboGroup(group, index)).filter(Boolean)
    : [];
  return {
    enabled: true,
    groups,
  };
};

// ─── Product Modal ────────────────────────────────────────────────────────────
export function ProductModal({ product, products = [], business, slug, formatPrice, whatsAppUrl, whatsAppMessage, onClose, theme, cardSettings, useCategories = false }) {
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const primaryRgba = theme?.primaryRgba || (() => 'rgba(37,211,102,0.35)');
  const showPrice = cardSettings?.showPrice !== false;
  const productState = getProductCommercialState(product);
  const isRestaurant = isRestaurantBusiness(business);
  const showDescription = cardSettings?.showDescription !== false;
  const { addItem, items } = useCart();
  const cartItem = items?.find(i => i?.id === product?.id);
  const qty = cartItem?.quantity || 0;
  const isSoldOut = productState === 'sold_out';
  const [copiedProductMessage, setCopiedProductMessage] = useState(false);
  const productImages = getProductImages(product);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const touchStartX = React.useRef(0);
  const touchEndX = React.useRef(0);

  useEffect(() => { setSelectedIndex(0); }, [product?.id]);
  const mainUrl = productImages[selectedIndex];
  const mainUrlOptimized = mainUrl ? cfImageUrl(mainUrl, 'modal') : null;
  const [useMainDirect, setUseMainDirect] = useState(false);

  // Reset error/loaded al cambiar de imagen o de producto
  useEffect(() => {
    setImageLoadError(false);
    setImageLoaded(false);
    setUseMainDirect(false);
  }, [mainUrl, product?.id]);

  const goPrev = (e) => { e?.stopPropagation(); setSelectedIndex(i => (i <= 0 ? productImages.length - 1 : i - 1)); };
  const goNext = (e) => { e?.stopPropagation(); setSelectedIndex(i => (i >= productImages.length - 1 ? 0 : i + 1)); };

  const handleTouchStart = (e) => { touchStartX.current = e?.touches?.[0]?.clientX ?? 0; };
  const handleTouchMove = (e) => { touchEndX.current = e?.touches?.[0]?.clientX ?? 0; };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50 && productImages.length > 1) {
      if (diff > 0) setSelectedIndex(i => (i >= productImages.length - 1 ? 0 : i + 1));
      else setSelectedIndex(i => (i <= 0 ? productImages.length - 1 : i - 1));
    }
  };

  const handleBackdrop = (e) => {
    if (e?.target === e?.currentTarget) onClose();
  };

  useEffect(() => {
    const handler = (e) => { if (e?.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const modalDiscount = getDiscountPercent(product?.price, product?.compareAtPrice);
  const stateBadge = productState === 'sold_out'
    ? { label: 'Agotado', style: { color: '#9A3412', backgroundColor: 'rgba(251,146,60,0.18)' } }
    : null;
  const trackWaClick = () => {
    const path = typeof window !== 'undefined' ? window.location?.pathname || getPublicCatalogRelativePath(slug) : getPublicCatalogRelativePath(slug);
    recordCatalogWhatsAppClick(slug, path, 'product_modal').catch(() => {});
  };

  const resolvedComboConfig = (isRestaurant && ENABLE_RESTAURANT_COMBOS)
    ? normalizeComboConfig(product?.comboConfig)
    : null;
  const comboGroups = resolvedComboConfig?.groups || [];

  const [selectedAddons, setSelectedAddons] = useState([]);
  useEffect(() => { setSelectedAddons([]); }, [product?.id]);
  const [selectedComboItems, setSelectedComboItems] = useState({});
  useEffect(() => { setSelectedComboItems({}); }, [product?.id]);

  const resolvedAddons = (isRestaurant && ENABLE_RESTAURANT_ADDONS)
    ? (Array.isArray(product?.addOns)
      ? product.addOns.reduce((acc, addon) => {
          if (!addon || addon?.active === false) return acc;

          if (addon?.type === 'product') {
            const relatedProduct = Array.isArray(products)
              ? products.find((candidate) => candidate?.id === addon?.productId && candidate?.isActive !== false)
              : null;

            if (!relatedProduct || relatedProduct?.id === product?.id) return acc;

            const relatedPrice = Number(relatedProduct?.price);
            acc.push({
              id: addon?.id || `addon-product-${relatedProduct.id}`,
              type: 'product',
              productId: relatedProduct.id,
              label: relatedProduct?.name || 'Complemento',
              price: Number.isFinite(relatedPrice) ? Math.round(relatedPrice) : 0,
              category: relatedProduct?.category || null,
              _key: addon?.id || `addon-product-${relatedProduct.id}`,
            });
            return acc;
          }

          if (!addon?.label) return acc;
          const manualPrice = Number(addon?.price);
          acc.push({
            ...addon,
            type: 'manual',
            price: Number.isFinite(manualPrice) && manualPrice >= 0 ? Math.round(manualPrice) : 0,
            _key: addon?.id || `${addon?.label}-${addon?.price ?? 0}`,
          });
          return acc;
        }, [])
      : [])
    : [];

  const selectedComboDetails = comboGroups.reduce((acc, group) => {
    const selectedKeys = Array.isArray(selectedComboItems?.[group.id]) ? selectedComboItems[group.id] : [];
    const selectedItems = group.items.filter((item) => selectedKeys.includes(item._key));
    if (selectedItems.length > 0) {
      acc.push({
        groupId: group.id,
        groupLabel: group.label,
        items: selectedItems,
      });
    }
    return acc;
  }, []);

  const comboSelectionsTotal = selectedComboDetails.reduce(
    (sum, group) => sum + group.items.reduce((groupSum, item) => groupSum + item.price, 0),
    0,
  );
  const addonsTotal = selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
  const estimatedTotal = (product?.price || 0) + addonsTotal + comboSelectionsTotal;
  const hasRequiredComboMissing = comboGroups.some((group) => {
    if (!group?.required) return false;
    const selectedKeys = Array.isArray(selectedComboItems?.[group.id]) ? selectedComboItems[group.id] : [];
    return selectedKeys.length === 0;
  });
  const hasSelectionAdjustments = selectedAddons.length > 0 || selectedComboDetails.length > 0;

  const toggleComboItem = (group, item) => {
    if (!group?.id || !item?._key) return;
    setSelectedComboItems((prev) => {
      const current = Array.isArray(prev?.[group.id]) ? prev[group.id] : [];
      const alreadySelected = current.includes(item._key);
      if (alreadySelected) {
        return {
          ...prev,
          [group.id]: current.filter((key) => key !== item._key),
        };
      }
      if (current.length >= group.maxSelections) {
        if (group.maxSelections === 1) {
          return {
            ...prev,
            [group.id]: [item._key],
          };
        }
        return prev;
      }
      return {
        ...prev,
        [group.id]: [...current, item._key],
      };
    });
  };

  const effectiveWaMessage = (() => {
    const base = whatsAppMessage || `Hola! Quiero pedir:\n\n*${product?.name}*\nPrecio: ${formatPrice(product?.price)}`;
    if (!isRestaurant) return base;

    const comboLines = selectedComboDetails
      .map((group) => `${group.groupLabel}:\n${group.items.map((item) => `  • ${item.label} +${formatPrice(item.price)}`).join('\n')}`)
      .join('\n');
    const addonLines = selectedAddons.map((addon) => `  • ${addon.label} +${formatPrice(addon.price)}`).join('\n');

    if (!comboLines && !addonLines) return base;

    const sections = [base];
    if (comboLines) sections.push(`Combo:\n${comboLines}`);
    if (addonLines) sections.push(`Complementos:\n${addonLines}`);
    sections.push(`Total estimado: ${formatPrice(estimatedTotal)}`);
    return sections.join('\n\n');
  })();

  const effectiveWaUrl = (() => {
    if (!isRestaurant) return whatsAppUrl;
    if (!hasSelectionAdjustments) return whatsAppUrl;
    const phone = business?.whatsapp?.replace(/\D/g, '');
    if (!phone) return whatsAppUrl;
    return `https://wa.me/${phone}?text=${encodeURIComponent(effectiveWaMessage)}`;
  })();

  if (productState === 'hidden') return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdrop}
    >
      {/* flex flex-col so the sticky bar stays pinned at the bottom of the sheet */}
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        {/* ── Scrollable content ───────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 min-h-0">

          {/* Image section */}
          <div className="relative">
            <div
              className={`${isRestaurant ? 'aspect-[4/3]' : 'aspect-square'} w-full bg-gray-100 overflow-hidden relative select-none touch-pan-y flex items-center justify-center`}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {mainUrl && !imageLoadError ? (
                <>
                  {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                      <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                    </div>
                  )}
                  <CatalogImage
                    src={useMainDirect && mainUrl ? mainUrl : mainUrlOptimized}
                    originalSrc={mainUrl}
                    alt={product?.name ?? 'Producto'}
                    className="w-full h-full"
                    imgClassName="w-full h-full object-cover transition-transform duration-300 ease-in-out sm:hover:scale-[1.2] sm:cursor-zoom-in"
                    imgStyle={{ transition: 'opacity 0.2s ease-out, transform 0.3s ease-in-out' }}
                    draggable={false}
                    variant="product"
                    onLoad={() => setImageLoaded(true)}
                    onError={() => {
                      if (!useMainDirect && mainUrl && isCfTransformableUrl(mainUrl)) {
                        setUseMainDirect(true);
                        setImageLoaded(false);
                      } else {
                        setImageLoadError(true);
                      }
                    }}
                  />
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Icon name="ImageOff" size={48} color="#D1D5DB" />
                </div>
              )}
              {productState === 'sold_out' && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.32)' }}
                >
                  <span className="rounded-full px-3 py-1.5 text-xs font-black text-white shadow" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
                    Agotado
                  </span>
                </div>
              )}
              {productImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center transition-all hover:bg-black/60 active:scale-90 text-white"
                    aria-label="Imagen anterior"
                  >
                    <Icon name="ChevronLeft" size={20} color="#FFFFFF" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center transition-all hover:bg-black/60 active:scale-90 text-white"
                    aria-label="Siguiente imagen"
                  >
                    <Icon name="ChevronRight" size={20} color="#FFFFFF" />
                  </button>
                  <div
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full text-[11px] font-semibold text-white"
                    style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                  >
                    {selectedIndex + 1} / {productImages.length}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center transition-all hover:bg-black/60 active:scale-90 z-10"
              aria-label="Cerrar"
            >
              <Icon name="X" size={18} color="#FFFFFF" />
            </button>
            {productImages.length > 1 && (
              <div className="flex gap-1.5 p-2 overflow-x-auto bg-gray-50 border-b" style={{ borderColor: 'var(--color-border)' }}>
                {productImages.map((url, i) => (
                  <ThumbnailButton
                    key={url + i}
                    url={url}
                    productName={product?.name}
                    index={i}
                    isSelected={selectedIndex === i}
                    primaryColor={primaryColor}
                    onSelect={() => setSelectedIndex(i)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Content ──────────────────────────────────────────────── */}
          <div className={`px-5 pt-5 sm:px-6 ${isRestaurant ? 'pb-4 sm:pb-6' : 'pb-6'}`}>

            {/* Business + category breadcrumb */}
            <div className="mb-3 flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}>
                <Icon name={isRestaurant ? 'UtensilsCrossed' : 'Store'} size={11} color="#FFFFFF" />
              </div>
              <span className="text-xs text-gray-400 font-medium">{business?.name}</span>
              {useCategories && product?.category && (
                <span className="ml-auto text-[10px] font-semibold rounded-md px-1.5 py-0.5" style={{ color: primaryColorDark, backgroundColor: primaryRgba(0.12) }}>{product?.category}</span>
              )}
            </div>

            {stateBadge && (
              <div className="mb-3">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={stateBadge.style}
                >
                  {stateBadge.label}
                </span>
              </div>
            )}

            {/* Title + optional featured badge */}
            <div className="flex items-start gap-2 mb-1">
              <h2 className="text-2xl font-bold leading-tight tracking-tight text-gray-900 flex-1">
                {product?.name}
              </h2>
              {isRestaurant && product?.featured && (
                <span
                  className="flex-shrink-0 mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                  style={{ background: 'rgba(234,88,12,0.1)', color: '#C2410C' }}
                >
                  ⭐ Recomendado
                </span>
              )}
            </div>

            {/* Restaurant: short sub-copy from description */}
            {isRestaurant && showDescription && product?.description && (
              <p className="mb-3 text-sm font-normal leading-relaxed text-gray-500 line-clamp-2">
                {product.description.length > 80 ? product.description.slice(0, 80) + '…' : product.description}
              </p>
            )}

            {/* Restaurant: price right after title (prominent) */}
            {isRestaurant && showPrice && (
              <div className="mb-4 flex items-baseline gap-2 flex-wrap">
                <span className="text-3xl font-extrabold tracking-tight text-gray-900 tabular-nums">{formatPrice(product?.price)}</span>
                {modalDiscount !== null && (
                  <span className="rounded-md px-2 py-0.5 text-sm font-black text-white" style={{ backgroundColor: '#dc2626' }}>
                    -{modalDiscount}% OFF
                  </span>
                )}
                {modalDiscount !== null && (
                  <span className="text-sm text-gray-400 line-through">{formatPrice(product?.compareAtPrice)}</span>
                )}
              </div>
            )}

            {/* Store: full description (original position) */}
            {!isRestaurant && showDescription && product?.description && (
              <p className="mb-5 text-[15px] font-normal leading-[1.65] text-gray-600 sm:text-base">
                {product?.description}
              </p>
            )}

            {/* Restaurant: full description (shown when longer than sub-copy) */}
            {isRestaurant && showDescription && product?.description && product.description.length > 80 && (
              <p className="mb-4 text-[13.5px] font-normal leading-relaxed text-gray-500">
                {product.description}
              </p>
            )}

            {product?.longDescription && (
              <div className="mb-5">
                {showDescription && product?.description && (
                  <div className="my-3 border-t border-gray-100" />
                )}
                <p className="whitespace-pre-line break-words text-[13.5px] font-normal leading-relaxed text-gray-500 sm:text-sm">
                  {product.longDescription}
                </p>
              </div>
            )}

            {product?.videoUrl && (
              <div className="mb-5">
                <video
                  src={withMediaVersion(product.videoUrl, product.updatedAt)}
                  poster={withMediaVersion(product.videoThumbnailUrl, product.updatedAt) || undefined}
                  controls
                  playsInline
                  className="w-full rounded-2xl bg-black"
                  style={{ maxHeight: 300 }}
                />
              </div>
            )}

            {product?.hasOptions && product?.optionsDescription && (
              <div
                className="mb-5 flex items-start gap-2.5 rounded-xl p-3"
                style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)' }}
              >
                <Icon name="ListChecks" size={15} color="#92400e" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-800 mb-0.5">Opciones:</p>
                  <p className="text-xs text-amber-700 leading-relaxed">{product?.optionsDescription}</p>
                </div>
              </div>
            )}

            {/* Store: price in original position */}
            {!isRestaurant && showPrice && (
              <div className="mb-6">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-3xl font-extrabold tracking-tight text-gray-900 tabular-nums">{formatPrice(product?.price)}</span>
                  {modalDiscount !== null && (
                    <span className="rounded-md px-2 py-0.5 text-sm font-black text-white" style={{ backgroundColor: '#dc2626' }}>
                      -{modalDiscount}% OFF
                    </span>
                  )}
                </div>
                {modalDiscount !== null && (
                  <p className="mt-0.5 text-sm text-gray-400 line-through">{formatPrice(product?.compareAtPrice)}</p>
                )}
              </div>
            )}
            {!isRestaurant && !showPrice && <div className="mb-6" />}

            {isRestaurant && comboGroups.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 text-sm font-bold text-gray-800">Arma tu combo</p>
                <div className="space-y-3">
                  {comboGroups.map((group) => {
                    const selectedKeys = Array.isArray(selectedComboItems?.[group.id]) ? selectedComboItems[group.id] : [];
                    return (
                      <div key={group.id} className="rounded-2xl border border-gray-200 p-3">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{group.label}</p>
                            <p className="text-xs text-gray-500">
                              {group.required ? 'Obligatorio' : 'Opcional'}
                              {group.maxSelections > 1 ? ` · Elige hasta ${group.maxSelections}` : ' · Elige 1'}
                            </p>
                          </div>
                          {group.required && selectedKeys.length === 0 && (
                            <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                              Falta elegir
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          {group.items.map((item) => {
                            const checked = selectedKeys.includes(item._key);
                            const groupAtMax = selectedKeys.length >= group.maxSelections;
                            const disabled = !checked && groupAtMax && group.maxSelections > 1;
                            return (
                              <button
                                key={item._key}
                                type="button"
                                onClick={() => toggleComboItem(group, item)}
                                disabled={disabled}
                                className="flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-sm transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                                style={{
                                  borderColor: checked ? primaryColor : '#E5E7EB',
                                  backgroundColor: checked ? primaryRgba(0.06) : '#ffffff',
                                }}
                              >
                                <span className="font-medium text-gray-800">{item.label}</span>
                                <div className="flex items-center gap-2.5 flex-shrink-0">
                                  <span className="text-xs font-semibold text-gray-500">+{formatPrice(item.price)}</span>
                                  <div
                                    className="flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all"
                                    style={{
                                      borderColor: checked ? primaryColor : '#D1D5DB',
                                      backgroundColor: checked ? primaryColor : 'transparent',
                                    }}
                                  >
                                    {checked && <Icon name="Check" size={10} color="#FFFFFF" strokeWidth={3} />}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isRestaurant && resolvedAddons.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-bold text-gray-800">Completa tu pedido</p>
                <div className="flex flex-col gap-2">
                  {resolvedAddons.map((addon) => {
                    const addonKey = addon._key;
                    const checked = selectedAddons.some((a) => a?._key === addonKey);
                    return (
                      <button
                        key={addonKey}
                        type="button"
                        onClick={() => setSelectedAddons(prev =>
                          prev.some((a) => a?._key === addonKey)
                            ? prev.filter((a) => a?._key !== addonKey)
                            : [...prev, addon]
                        )}
                        className="flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-sm transition-all active:scale-[0.98]"
                        style={{
                          borderColor: checked ? primaryColor : '#E5E7EB',
                          backgroundColor: checked ? primaryRgba(0.06) : '#ffffff',
                        }}
                      >
                        <span className="font-medium text-gray-800">{addon.label}</span>
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          <span className="text-xs font-semibold text-gray-500">+{formatPrice(addon.price)}</span>
                          <div
                            className="flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all"
                            style={{
                              borderColor: checked ? primaryColor : '#D1D5DB',
                              backgroundColor: checked ? primaryColor : 'transparent',
                            }}
                          >
                            {checked && <Icon name="Check" size={10} color="#FFFFFF" strokeWidth={3} />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isRestaurant && hasSelectionAdjustments && (
              <div
                className="mb-4 flex items-center justify-between rounded-xl px-3 py-2.5"
                style={{ backgroundColor: primaryRgba(0.08) }}
              >
                <span className="text-sm font-medium text-gray-700">Total estimado</span>
                <span className="text-base font-extrabold tabular-nums" style={{ color: primaryColorDark }}>
                  {formatPrice(estimatedTotal)}
                </span>
              </div>
            )}

            {/* ── CTAs ─────────────────────────────────────────────────── */}
            {isSoldOut ? (
              <div className="flex flex-col items-center gap-3 py-2">
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-base font-bold text-gray-400"
                >
                  <Icon name="PackageX" size={18} color="#9CA3AF" />
                  Agotado
                </button>
                <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 w-full justify-center">
                  <Icon name="Info" size={18} color="#9CA3AF" />
                  <span className="text-sm font-semibold text-gray-500">Este producto está agotado por ahora.</span>
                </div>
              </div>
            ) : isRestaurant ? (
              <>
                {hasRequiredComboMissing && comboGroups.length > 0 && (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    Selecciona las opciones obligatorias del combo para continuar.
                  </div>
                )}
                {/* Primary: Pedir por WhatsApp */}
                <a
                  href={effectiveWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={hasRequiredComboMissing}
                  onClick={(e) => {
                    if (hasRequiredComboMissing) {
                      e.preventDefault();
                      return;
                    }
                    trackWaClick();
                  }}
                  className="mb-2 flex w-full items-center justify-center gap-3 rounded-2xl py-4 text-base font-bold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                    boxShadow: '0 8px 24px rgba(37,211,102,0.35)',
                    opacity: hasRequiredComboMissing ? 0.6 : 1,
                    pointerEvents: hasRequiredComboMissing ? 'none' : 'auto',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Pedir por WhatsApp
                </a>
                {/* Friction copy */}
                <p className="mb-3 text-center text-xs text-gray-400">
                  Te respondemos por WhatsApp en minutos
                </p>
                {/* Secondary: Agregar al pedido */}
                <button
                  onClick={() => { addItem(product); onClose(); }}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold border transition-all duration-150 hover:bg-gray-50 active:scale-[0.98]"
                  style={{ borderColor: primaryColor, color: primaryColorDark }}
                >
                  <Icon name="ShoppingCart" size={16} color={primaryColorDark} />
                  {qty > 0 ? `Agregar otro (${qty} en pedido)` : 'Agregar al pedido'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!effectiveWaMessage) return;
                    navigator.clipboard?.writeText(effectiveWaMessage)?.catch(() => {});
                    setCopiedProductMessage(true);
                    setTimeout(() => setCopiedProductMessage(false), 1800);
                  }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
                >
                  <Icon name={copiedProductMessage ? 'Check' : 'Copy'} size={14} color="#6B7280" />
                  {copiedProductMessage ? 'Texto copiado' : 'Copiar texto del producto'}
                </button>
              </>
            ) : (
              <>
                {/* Store: original CTA order */}
                <button
                  onClick={() => { addItem(product); onClose(); }}
                  className="mb-3 flex w-full items-center justify-center gap-3 rounded-2xl py-4 text-base font-bold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`, boxShadow: `0 8px 24px ${primaryRgba(0.35)}` }}
                >
                  <Icon name="ShoppingCart" size={20} color="#FFFFFF" />
                  {qty > 0 ? `Agregar otro (${qty} en pedido)` : 'Agregar al pedido'}
                </button>
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={trackWaClick}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
                >
                  <Icon name="MessageCircle" size={16} color="#6B7280" />
                  Solo este producto por WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (!whatsAppMessage) return;
                    navigator.clipboard?.writeText(whatsAppMessage)?.catch(() => {});
                    setCopiedProductMessage(true);
                    setTimeout(() => setCopiedProductMessage(false), 1800);
                  }}
                  className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
                >
                  <Icon name={copiedProductMessage ? 'Check' : 'Copy'} size={14} color="#6B7280" />
                  {copiedProductMessage ? 'Texto copiado' : 'Copiar texto del producto'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Sticky bottom bar: restaurant + mobile only ───────────────── */}
        {isRestaurant && productState === 'available' && (
          <div
            className="sm:hidden flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3"
            style={{ paddingBottom: 'calc(12px + var(--safe-area-bottom, 0px))' }}
          >
            <div className="flex items-center gap-3">
              {showPrice && (
                <div className="flex-shrink-0 min-w-0">
                  <span className="text-lg font-extrabold tracking-tight text-gray-900 tabular-nums">
                    {formatPrice(hasSelectionAdjustments ? estimatedTotal : product?.price)}
                  </span>
                  {!hasSelectionAdjustments && modalDiscount !== null && (
                    <span className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-black text-white" style={{ backgroundColor: '#dc2626' }}>
                      -{modalDiscount}%
                    </span>
                  )}
                  {hasSelectionAdjustments && (
                    <span className="ml-1 text-[10px] font-medium text-gray-400">est.</span>
                  )}
                </div>
              )}
              <a
                href={effectiveWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={hasRequiredComboMissing}
                onClick={(e) => {
                  if (hasRequiredComboMissing) {
                    e.preventDefault();
                    return;
                  }
                  trackWaClick();
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                  opacity: hasRequiredComboMissing ? 0.6 : 1,
                  pointerEvents: hasRequiredComboMissing ? 'none' : 'auto',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Pedir por WhatsApp
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
