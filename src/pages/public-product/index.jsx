import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import CatalogImage from '../../components/CatalogImage';
import PremiumLoader from '../../components/ui/PremiumLoader';
import { CartProvider } from '../../contexts/CartContext';
import {
  getPublicProductBySlug,
  recordCatalogWhatsAppClick,
  slugifyProductName,
} from '../../services/waBusinessService';
import { formatPrice as formatPriceUtil, resolveCatalogCurrency } from '../../utils/formatPrice';
import { getBusinessLocale } from '../../lib/locale/businessLocale';
import { getOrderMessageBrandingSuffix } from '../../utils/branding';
import { getPublicCatalogRelativePath, getPublicProductUrl } from '../../config/appUrl';
import { resolveCatalogTheme } from '../../utils/catalogTheme';
import { cfImageUrl, isCfTransformableUrl } from '../../utils/cloudflareImage';
import { openWhatsAppUrl } from '../../utils/openWhatsAppUrl';
import { getProductImages, ProductModal } from '../public-catalog';

function getProductCommercialState(product) {
  if (product?.isActive === false) return 'hidden';
  if (product?.isSoldOut === true) return 'sold_out';
  return 'available';
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function getPublicProductPath(businessSlug, productSlug) {
  const business = String(businessSlug || '').trim();
  const product = String(productSlug || '').trim();
  return business && product ? `/p/${business}/${product}` : '';
}

function hasAdvancedOrder(product) {
  if (product?.hasOptions) return true;
  if (Array.isArray(product?.addOns) && product.addOns.length > 0) return true;
  if (product?.comboConfig?.enabled === true) return true;
  return false;
}

function shouldLogPublicProductPageDebug() {
  if (import.meta.env?.DEV) return true;
  if (typeof window === 'undefined') return false;
  const host = String(window.location?.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (host.endsWith('.localhost') || host.endsWith('.vercel.app')) return true;
  try {
    return window.localStorage?.getItem('wa_public_product_debug') === '1';
  } catch {
    return false;
  }
}

function logPublicProductPageDebug(step, payload = {}) {
  if (!shouldLogPublicProductPageDebug()) return;
  console.debug(`[public-product-page] ${step}`, payload);
}

function ProductNotFound({ onBack }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 font-catalog antialiased">
      <div className="max-w-sm text-center">
        <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-5">
          <Icon name="PackageSearch" size={36} color="#9CA3AF" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Producto no encontrado</h1>
        <p className="text-sm text-gray-500 mb-5">El producto no existe, no esta disponible o el enlace cambio.</p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Ver catalogo
        </button>
      </div>
    </div>
  );
}

function PublicProductInner() {
  const { businessSlug, productSlug } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [product, setProduct] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [useDirectImage, setUseDirectImage] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function loadProductPage() {
      setLoading(true);
      setNotFound(false);
      logPublicProductPageDebug('params', {
        businessSlug,
        productSlug,
        pathname: typeof window !== 'undefined' ? window.location?.pathname : null,
      });

      const { data, error } = await getPublicProductBySlug(businessSlug, productSlug);
      if (cancelled) return;

      const nextBusiness = data?.business || null;
      const nextProduct = data?.product || null;
      const nextProducts = Array.isArray(data?.products) ? data.products : [];
      logPublicProductPageDebug('service_result', {
        hasError: !!error,
        errorMessage: error?.message || null,
        errorCode: error?.code || null,
        businessFound: !!nextBusiness?.id,
        businessId: nextBusiness?.id || null,
        businessSlug: nextBusiness?.slug || null,
        productFound: !!nextProduct?.id,
        productId: nextProduct?.id || null,
        productName: nextProduct?.name || null,
        productPersistedSlug: nextProduct?._slugSource === 'persisted' ? nextProduct?.slug || null : null,
        productGeneratedSlug: nextProduct?._generatedSlug || slugifyProductName(nextProduct?.name),
        productResolvedSlug: nextProduct?.slug || null,
        productSlugSource: nextProduct?._slugSource || null,
        productIsActive: nextProduct?.isActive ?? null,
        candidateCount: nextProducts.length,
      });

      if (error || !nextBusiness || !nextProduct || getProductCommercialState(nextProduct) === 'hidden') {
        logPublicProductPageDebug('show_not_found', {
          reason: error ? 'supabase_error' : !nextBusiness ? 'business_not_found' : !nextProduct ? 'product_not_found' : 'hidden_product',
        });
        setBusiness(nextBusiness);
        setProduct(null);
        setProducts(nextProducts);
        setNotFound(true);
        setLoading(false);
        return;
      }

      setBusiness(nextBusiness);
      setProduct(nextProduct);
      setProducts(nextProducts.length ? nextProducts : [nextProduct]);
      setSelectedImageIndex(0);
      setUseDirectImage(false);
      setShowOptionsModal(false);
      setLoading(false);
    }

    loadProductPage();
    return () => {
      cancelled = true;
    };
  }, [businessSlug, productSlug]);

  const catalogMoney = useMemo(() => getBusinessLocale(business), [business]);
  const businessCurrency = useMemo(
    () => resolveCatalogCurrency(business, catalogMoney),
    [business, catalogMoney],
  );
  const formatPrice = useMemo(
    () => (price) => formatPriceUtil(price, businessCurrency, catalogMoney?.countryCode),
    [businessCurrency, catalogMoney?.countryCode],
  );
  const productImages = useMemo(() => getProductImages(product), [product]);
  const activeImage = productImages[selectedImageIndex] || productImages[0] || null;
  const optimizedImage = activeImage && !useDirectImage ? cfImageUrl(activeImage, 'modal') : activeImage;
  const catalogPath = useMemo(() => getPublicCatalogRelativePath(businessSlug), [businessSlug]);
  const design = business?.designSettings || {};
  const catalogTheme = useMemo(() => resolveCatalogTheme(design), [design]);
  const theme = useMemo(() => ({
    primaryColor: catalogTheme.primaryColor,
    primaryColorDark: catalogTheme.primaryColorDark,
    primaryRgba: catalogTheme.primaryRgba,
  }), [catalogTheme]);
  const cardSettings = useMemo(() => ({
    showPrice: true,
    showDescription: true,
    showStock: false,
    showWhatsApp: true,
    ...design?.cardSettings,
  }), [design?.cardSettings]);
  const resolvedProductSlug = product?.slug || slugifyProductName(product?.name);
  const productUrl = useMemo(
    () => getPublicProductUrl(businessSlug, resolvedProductSlug),
    [businessSlug, resolvedProductSlug],
  );
  const phone = normalizePhone(business?.whatsapp);
  const productState = getProductCommercialState(product);
  const isSoldOut = productState === 'sold_out';
  const hasOptions = hasAdvancedOrder(product);
  const title = `${product?.name || 'Producto'} | ${business?.name || 'Catalogo'}`;
  const plainDescription = String(
    product?.longDescription || product?.description || business?.description || 'Consulta este producto y pide por WhatsApp.',
  ).replace(/\s+/g, ' ').trim();
  const metaDescription = plainDescription.slice(0, 160);
  const whatsAppMessage = useMemo(() => {
    const body = [
      productUrl,
      '',
      `Hola! Me interesa este producto: ${product?.name || 'Producto'}`,
      product?.showPrice !== false ? `Precio: ${formatPrice(product?.price)}` : null,
      business?.name ? `Tienda: ${business.name}` : '',
    ].filter(Boolean).join('\n');
    const branding = getOrderMessageBrandingSuffix(business);
    return branding ? `${body}\n\n${branding}` : body;
  }, [business, formatPrice, product?.name, product?.price, productUrl]);
  const whatsAppUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsAppMessage)}` : '';
  const relatedProducts = useMemo(() => (
    (Array.isArray(products) ? products : [])
      .filter((item) => item?.id && item.id !== product?.id && getProductCommercialState(item) !== 'hidden')
      .slice(0, 4)
  ), [product?.id, products]);
  const ogImage = activeImage || business?.ogImageUrl || business?.logoUrl || business?.coverImageUrl || '';
  const priceLabel = product?.price != null && product?.showPrice !== false ? formatPrice(product.price) : '';
  const shareText = productUrl ? `Mira este producto: ${productUrl}` : '';
  const shareWhatsAppUrl = shareText ? `https://wa.me/?text=${encodeURIComponent(shareText)}` : '';

  useEffect(() => {
    setUseDirectImage(false);
  }, [activeImage]);

  const goToCatalog = () => navigate(catalogPath || '/');
  const goPrevImage = () => {
    if (productImages.length <= 1) return;
    setSelectedImageIndex((index) => (index <= 0 ? productImages.length - 1 : index - 1));
  };
  const goNextImage = () => {
    if (productImages.length <= 1) return;
    setSelectedImageIndex((index) => (index >= productImages.length - 1 ? 0 : index + 1));
  };
  const handleTouchStart = (event) => {
    touchStartX.current = event?.touches?.[0]?.clientX ?? 0;
    touchEndX.current = touchStartX.current;
  };
  const handleTouchMove = (event) => {
    touchEndX.current = event?.touches?.[0]?.clientX ?? 0;
  };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) < 50) return;
    if (diff > 0) goNextImage();
    else goPrevImage();
  };
  const handlePrimaryCta = () => {
    if (isSoldOut) return;
    if (hasOptions) {
      setShowOptionsModal(true);
      return;
    }
    if (whatsAppUrl) {
      recordCatalogWhatsAppClick(businessSlug, typeof window !== 'undefined' ? window.location.pathname : productUrl, 'product_page').catch(() => {});
      openWhatsAppUrl(whatsAppUrl);
    }
  };

  if (loading) {
    return <PremiumLoader fullScreen business={business} context="catalog" />;
  }

  if (notFound || !business || !product) {
    return <ProductNotFound onBack={goToCatalog} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28 font-catalog antialiased text-gray-950">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:type" content="product" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={productUrl} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        {priceLabel && <meta property="product:price:amount" content={String(product.price)} />}
        {businessCurrency && <meta property="product:price:currency" content={businessCurrency} />}
        <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={metaDescription} />
        {productUrl && <link rel="canonical" href={productUrl} />}
      </Helmet>

      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/92 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button type="button" onClick={goToCatalog} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-700">
            <Icon name="ArrowLeft" size={18} />
          </button>
          <button type="button" onClick={goToCatalog} className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500">Catalogo</p>
            <p className="truncate text-sm font-bold text-gray-950">{business.name || 'Tienda'}</p>
          </button>
          {business.logoUrl ? (
            <CatalogImage
              src={business.logoUrl}
              originalSrc={business.logoUrl}
              alt={business.name || 'Logo'}
              variant="logo"
              className="h-10 w-10 rounded-full border border-gray-200 bg-white"
              imgClassName="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white">
              <Icon name="Store" size={17} />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl">
        <section className="bg-white">
          <div
            className="relative aspect-square w-full touch-pan-y overflow-hidden bg-gray-100 sm:aspect-[4/3]"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {activeImage ? (
              <CatalogImage
                src={optimizedImage}
                originalSrc={activeImage}
                alt={product.name || 'Producto'}
                variant="product"
                loading="eager"
                fetchPriority="high"
                className="h-full w-full"
                imgClassName="h-full w-full object-cover"
                onError={() => {
                  if (!useDirectImage && activeImage && isCfTransformableUrl(activeImage)) setUseDirectImage(true);
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Icon name="ImageOff" size={34} color="#94A3B8" />
              </div>
            )}
            {productImages.length > 1 && (
              <>
                <button type="button" onClick={goPrevImage} className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/88 text-gray-900 shadow">
                  <Icon name="ChevronLeft" size={19} />
                </button>
                <button type="button" onClick={goNextImage} className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/88 text-gray-900 shadow">
                  <Icon name="ChevronRight" size={19} />
                </button>
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {productImages.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      aria-label={`Ver imagen ${index + 1}`}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`h-2 rounded-full transition-all ${index === selectedImageIndex ? 'w-6 bg-white' : 'w-2 bg-white/60'}`}
                    />
                  ))}
                </div>
              </>
            )}
            {isSoldOut && (
              <div className="absolute left-4 top-4 rounded-full bg-white px-3 py-1 text-xs font-bold text-orange-700 shadow">
                Agotado
              </div>
            )}
          </div>
        </section>

        <section className="space-y-5 bg-white px-4 py-5 sm:px-6">
          <div>
            {product.category && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{product.category}</p>}
            <h1 className="text-2xl font-black leading-tight text-gray-950 sm:text-3xl">{product.name}</h1>
            {priceLabel && (
              <div className="mt-3 flex items-end gap-2">
                <p className="text-3xl font-black text-gray-950">{priceLabel}</p>
                {product.compareAtPrice > product.price && (
                  <p className="pb-1 text-sm font-semibold text-gray-400 line-through">{formatPrice(product.compareAtPrice)}</p>
                )}
              </div>
            )}
          </div>

          {plainDescription && (
            <div className="rounded-2xl bg-gray-50 p-4">
              <h2 className="mb-2 text-sm font-bold text-gray-950">Descripcion</h2>
              <p className="whitespace-pre-line text-sm leading-6 text-gray-700">{plainDescription}</p>
            </div>
          )}

          {(product.hasOptions || product.optionsDescription) && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                  <Icon name="ListChecks" size={17} color="#111827" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-950">Variantes y opciones</h2>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-gray-600">
                    {product.optionsDescription || 'Este producto tiene opciones disponibles. Puedes revisarlas al pedir por WhatsApp.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {product.videoUrl && (
            <div className="overflow-hidden rounded-2xl bg-black">
              <video
                src={product.videoUrl}
                poster={product.videoThumbnailUrl || undefined}
                controls
                playsInline
                className="aspect-video w-full"
              />
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              {business.logoUrl ? (
                <CatalogImage
                  src={business.logoUrl}
                  originalSrc={business.logoUrl}
                  alt={business.name || 'Logo'}
                  variant="logo"
                  className="h-12 w-12 rounded-2xl border border-gray-200"
                  imgClassName="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 text-white">
                  <Icon name="Store" size={20} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-gray-950">{business.name || 'Tienda'}</p>
                <p className="truncate text-xs text-gray-500">Atencion directa por WhatsApp</p>
              </div>
              <button type="button" onClick={goToCatalog} className="rounded-full bg-gray-100 px-3 py-2 text-xs font-bold text-gray-800">
                Ver catalogo
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-bold text-gray-950">Compartir producto</h2>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(productUrl).catch(() => {})}
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gray-100 px-2 py-3 text-xs font-bold text-gray-800"
              >
                <Icon name="Copy" size={17} />
                Copiar
              </button>
              <a
                href={shareWhatsAppUrl}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gray-100 px-2 py-3 text-xs font-bold text-gray-800"
              >
                <Icon name="MessageCircle" size={17} />
                WhatsApp
              </a>
              <button
                type="button"
                onClick={() => productUrl && window.open(productUrl, '_blank', 'noopener,noreferrer')}
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gray-100 px-2 py-3 text-xs font-bold text-gray-800"
              >
                <Icon name="ExternalLink" size={17} />
                Abrir
              </button>
            </div>
          </div>

          {relatedProducts.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-bold text-gray-950">Tambien te puede interesar</h2>
              <div className="grid grid-cols-2 gap-3">
                {relatedProducts.map((item) => {
                  const itemSlug = item.slug || slugifyProductName(item.name);
                  const itemPath = getPublicProductPath(businessSlug, itemSlug);
                  const itemImage = getProductImages(item)?.[0] || null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => itemPath && navigate(itemPath)}
                      className="overflow-hidden rounded-2xl border border-gray-200 bg-white text-left"
                    >
                      <CatalogImage
                        src={itemImage ? cfImageUrl(itemImage, 'card') : null}
                        originalSrc={itemImage}
                        alt={item.name || 'Producto'}
                        variant="product"
                        className="aspect-square w-full bg-gray-100"
                        imgClassName="h-full w-full object-cover"
                      />
                      <div className="p-3">
                        <p className="line-clamp-2 text-sm font-bold text-gray-950">{item.name}</p>
                        <p className="mt-1 text-sm font-black text-gray-900">
                          {item?.showPrice !== false ? formatPrice(item.price) : 'Consultar precio'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-gray-500">{business.name}</p>
            <p className="truncate text-base font-black text-gray-950">{priceLabel || product.name}</p>
          </div>
          <button
            type="button"
            disabled={isSoldOut || (!hasOptions && !whatsAppUrl)}
            onClick={handlePrimaryCta}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
            style={{ backgroundColor: isSoldOut || (!hasOptions && !whatsAppUrl) ? undefined : theme.primaryColor }}
          >
            <Icon name={hasOptions ? 'ShoppingBag' : 'MessageCircle'} size={18} />
            {isSoldOut ? 'Agotado' : hasOptions ? 'Ver opciones' : 'Pedir'}
          </button>
        </div>
      </div>

      {showOptionsModal && (
        <ProductModal
          product={product}
          products={products}
          business={business}
          slug={businessSlug}
          formatPrice={formatPrice}
          whatsAppUrl={whatsAppUrl}
          whatsAppMessage={whatsAppMessage}
          onClose={() => setShowOptionsModal(false)}
          theme={theme}
          cardSettings={cardSettings}
          useCategories={design?.useCategories === true}
        />
      )}
    </div>
  );
}

export default function PublicProductPage() {
  return (
    <CartProvider>
      <PublicProductInner />
    </CartProvider>
  );
}
