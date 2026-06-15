import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { getBusinessBySlug, getPublicOfferProducts, getPublicProducts } from '../../services/waBusinessService';
import { CartProvider, useCart } from '../../contexts/CartContext';
import { formatPrice as formatPriceUtil, resolveCatalogCurrency } from '../../utils/formatPrice';
import { getBusinessLocale } from '../../lib/locale/businessLocale';
import { resolveCatalogTheme } from '../../utils/catalogTheme';
import { getPublicCatalogUrl, getPublicOffersUrl } from '../../config/appUrl';
import { openWhatsAppUrl } from '../../utils/openWhatsAppUrl';
import CatalogLayout from '../public-catalog/CatalogLayout';
import { ProductCard, ProductModal, getProductCardImage, getProductImages } from '../public-catalog';
import CatalogStoreHeader from '../public-catalog/CatalogStoreHeader';
import PremiumLoader from '../../components/ui/PremiumLoader';
import BrandingFooter from '../../components/BrandingFooter';
import Icon from '../../components/AppIcon';
import CatalogImage from '../../components/CatalogImage';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { getDiscountPercent } from '../../utils/offerHelpers';

function OfferCard({ product, formatPrice, theme, onOpen }) {
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const { addItem, updateQuantity, items } = useCart();
  const cartItem = items?.find((i) => i?.id === product?.id);
  const qty = cartItem?.quantity || 0;
  const [bump, setBump] = useState(false);
  const discount = getDiscountPercent(product?.price, product?.compareAtPrice);
  const qtyTopClass = discount !== null ? 'top-[1.85rem]' : 'top-1';

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

  return (
    <div
      className="group flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-white text-left transition-[transform,box-shadow] duration-200 ease-out will-change-transform md:hover:-translate-y-1 md:hover:scale-[1.01] md:hover:shadow-lg active:scale-[0.98]"
      style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <button
        type="button"
        onClick={() => onOpen?.(product)}
        className="relative block w-full shrink-0 overflow-hidden rounded-t-2xl bg-gray-50 text-left"
        aria-label={`Ver detalles de ${product?.name || 'producto'}`}
      >
        <div className="relative w-full aspect-[4/5] min-h-0">
          {getProductCardImage(product) ? (
            <CatalogImage
              src={getProductCardImage(product)}
              originalSrc={getProductImages(product)?.[0] || getProductCardImage(product)}
              alt={product?.name}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              variant="product"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-100">
              <Icon name="ImageOff" size={32} color="#D1D5DB" />
            </div>
          )}
          {discount !== null && (
            <span
              className="absolute left-1.5 top-1.5 z-[1] rounded-md px-1.5 py-0.5 text-[10px] font-black text-white shadow-sm"
              style={{ backgroundColor: '#EF4444' }}
            >
              -{discount}% OFF
            </span>
          )}
          {qty > 0 && (
            <div
              className={`absolute left-1 ${qtyTopClass} flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white shadow`}
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
            >
              {qty}
            </div>
          )}
        </div>
      </button>

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5 rounded-b-2xl bg-white px-2.5 pb-2.5 pt-2">
        <div className="flex min-h-0 w-full flex-col gap-1">
          <button
            type="button"
            onClick={() => onOpen?.(product)}
            className="h-[2.45rem] w-full shrink-0 overflow-hidden text-left sm:h-[2.7rem]"
          >
            <h3 className="line-clamp-2 h-full w-full min-w-0 overflow-hidden text-ellipsis break-words text-[11px] font-bold leading-[1.25] text-gray-900 sm:text-xs sm:leading-[1.3] [overflow-wrap:anywhere]">
              {(product?.name || '').trim() || 'Producto'}
            </h3>
          </button>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 pt-1">
          <div className="flex flex-col gap-0.5">
            <p className="shrink-0 text-xl font-bold leading-none tracking-tight text-gray-900">
              {formatPrice(product?.price)}
            </p>
            {discount !== null && (
              <p className="text-xs leading-none text-gray-400 line-through">
                {formatPrice(product.compareAtPrice)}
              </p>
            )}
          </div>
          {qty === 0 ? (
            <button
              type="button"
              onClick={handleAdd}
              className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white transition-[transform,filter] duration-150 ease-out md:hover:brightness-[1.08] active:scale-95 ${bump ? 'scale-105' : ''}`}
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white">
                <Icon name="Plus" size={13} color="#FFFFFF" strokeWidth={2.5} />
              </span>
              Agregar
            </button>
          ) : (
            <div
              className={`flex items-center justify-between overflow-hidden rounded-xl transition-all duration-150 ${bump ? 'scale-105' : ''}`}
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
            >
              <button
                type="button"
                onClick={handleDecrease}
                className="flex h-9 w-9 items-center justify-center text-white transition-colors hover:bg-white/20 active:scale-90 sm:h-10 sm:w-10"
              >
                <Icon name="Minus" size={14} color="#FFFFFF" />
              </button>
              <span className="text-sm font-black text-white">{qty}</span>
              <button
                type="button"
                onClick={handleIncrease}
                className="flex h-9 w-9 items-center justify-center text-white transition-colors hover:bg-white/20 active:scale-90 sm:h-10 sm:w-10"
              >
                <Icon name="Plus" size={14} color="#FFFFFF" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CartBar({ business, formatPrice, offersUrl }) {
  const { items, total, itemCount } = useCart();
  const [sent, setSent] = useState(false);

  if (itemCount === 0) return null;

  const handleOrder = () => {
    if (!business?.whatsapp) return;
    const lines = items.map((i) => {
      const label = i.publicCode ? `${i.publicCode} - ${i.name}` : i.name;
      return `- ${i.quantity} ${label}`;
    });
    let message = '';
    if (offersUrl) message += `${offersUrl}\n\n`;
    message += `Hola, me interesan estas ofertas de ${business.name}.\n\nPedido:\n${lines.join('\n')}`;
    message += `\n\nTotal: ${formatPrice(total)}`;
    openWhatsAppUrl(`https://wa.me/${business.whatsapp}?text=${encodeURIComponent(message)}`);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2">
      <div
        className="pointer-events-auto mx-auto flex max-w-lg items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-xl"
        style={{ backgroundColor: '#25D366' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-black text-white">
            {itemCount}
          </div>
          <span className="truncate text-sm font-bold text-white">{formatPrice(total)}</span>
        </div>
        <button
          type="button"
          onClick={handleOrder}
          className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-4 py-2 text-xs font-bold transition-all active:scale-95"
          style={{ color: '#128C7E' }}
        >
          <Icon name="MessageCircle" size={14} color="#128C7E" />
          {sent ? 'Enviado' : 'Pedir por WhatsApp'}
        </button>
      </div>
    </div>
  );
}


function PublicOffersContent() {
  const { slug } = useParams();
  const isDesktop = useIsDesktop();
  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [fallbackProducts, setFallbackProducts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    if (!slug) return;

    let alive = true;

    const loadOffers = async () => {
      setStatus('loading');
      setFallbackProducts([]);

      const bizResult = await getBusinessBySlug(slug);
      if (!alive) return;

      if (bizResult.error) {
        setStatus('error');
        return;
      }
      if (!bizResult.data) {
        setStatus('not-found');
        return;
      }

      const biz = bizResult.data;
      setBusiness(biz);

      const { data: offerProducts, error: offerError } = await getPublicOfferProducts(biz.id);
      if (!alive) return;
      if (offerError) {
        setStatus('error');
        return;
      }

      const loadedOffers = offerProducts || [];
      setProducts(loadedOffers);

      if (loadedOffers.length === 0) {
        const { data: catalogProducts } = await getPublicProducts(biz.id);
        if (!alive) return;
        setFallbackProducts((catalogProducts || []).slice(0, 6));
      }

      setStatus('ok');
    };

    loadOffers();
    return () => {
      alive = false;
    };
  }, [slug]);

  const locale = business ? getBusinessLocale(business) : null;
  const currency = business ? resolveCatalogCurrency(business, null) : null;
  const formatPrice = (amount) =>
    locale && currency
      ? formatPriceUtil(amount, currency, locale.countryCode)
      : `$${Number(amount || 0).toFixed(2)}`;

  const theme = resolveCatalogTheme(business?.designSettings || null);
  const catalogUrl = business?.slug ? getPublicCatalogUrl(business.slug) : null;
  const offersUrl = business?.slug ? getPublicOffersUrl(business.slug) : null;
  const hasOffers = products.length > 0;
  const hasFallbackProducts = fallbackProducts.length > 0;

  // Categorías derivadas exclusivamente de los productos en oferta
  const offerCategories = useMemo(() => {
    if (!products.length) return [];
    const seen = new Set();
    const cats = [];
    for (const p of products) {
      const cat = (p?.category || '').trim();
      if (cat && !seen.has(cat)) { seen.add(cat); cats.push(cat); }
    }
    const hasOtros = products.some((p) => !(p?.category || '').trim());
    if (hasOtros) cats.push('Otros');
    // Solo mostrar barra si hay 2+ categorías distintas
    return cats.length >= 2 ? cats : [];
  }, [products]);

  const hasCategoryBar = offerCategories.length >= 2;

  // Resetear selección cuando cambien los productos
  useEffect(() => { setSelectedCategory('all'); }, [products]);

  const filteredOfferProducts = useMemo(() => {
    if (!hasCategoryBar || selectedCategory === 'all') return products;
    return products.filter((p) =>
      selectedCategory === 'Otros'
        ? !(p?.category || '').trim()
        : (p?.category || '').trim() === selectedCategory
    );
  }, [products, selectedCategory, hasCategoryBar]);
  const pageTitle = business ? `Ofertas de ${business.name}` : 'Ofertas';
  const openCatalog = () => {
    if (catalogUrl && typeof window !== 'undefined') window.location.href = catalogUrl;
  };

  const buildSingleWhatsAppMessage = (product) => {
    if (!product) return '';
    const label = product.publicCode ? `${product.publicCode} - ${product.name}` : product.name || 'Producto';
    let msg = `Hola, me interesa este producto en oferta de ${business?.name || 'la tienda'}:\n\n- ${label}\nPrecio: ${formatPrice(product.price)}`;
    if (offersUrl) msg += `\n\n${offersUrl}`;
    return msg;
  };

  const buildSingleWhatsAppUrl = (product) => {
    if (!business?.whatsapp || !product) return '#';
    return `https://wa.me/${business.whatsapp}?text=${encodeURIComponent(buildSingleWhatsAppMessage(product))}`;
  };

  return (
    <CatalogLayout theme={theme} isDesktop={isDesktop} className="min-h-screen font-catalog antialiased">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={business ? `Ofertas y promociones de ${business.name}` : 'Ofertas'} />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <CatalogStoreHeader
        business={business}
        theme={theme}
        slug={slug}
        isDesktop={isDesktop}
        badgeLabel="Ofertas"
        onBack={null}
      />

      {status === 'ok' && (
        <div className="mx-auto max-w-7xl px-4 pb-2 pt-5">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: theme?.textColor || '#111111' }}>
              Ofertas activas
            </h1>
            <p className="text-sm" style={{ color: theme?.isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }}>
              {hasOffers
                ? `${products.length} ${products.length === 1 ? 'producto en oferta' : 'productos en oferta'} · Descuentos para aprovechar hoy`
                : 'Hoy no hay ofertas activas, pero puedes explorar el catálogo completo.'}
            </p>
          </div>
        </div>
      )}

      <main className="pb-28">
        <section className="mx-auto max-w-7xl px-4 py-2">
          {status === 'loading' && (
            <PremiumLoader business={business} context="catalog" text="Preparando ofertas..." />
          )}

          {status === 'not-found' && (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-24 text-center">
              <Icon name="Store" size={40} color="#D1D5DB" />
              <h2 className="text-lg font-bold text-gray-800">Negocio no encontrado</h2>
              <p className="text-sm text-gray-500">
                El enlace que seguiste no corresponde a ningun negocio activo.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-24 text-center">
              <Icon name="AlertCircle" size={40} color="#F87171" />
              <h2 className="text-lg font-bold text-gray-800">No pudimos cargar las ofertas</h2>
              <p className="text-sm text-gray-500">
                Verifica tu conexion e intenta recargar la pagina.
              </p>
              {catalogUrl && (
                <a href={catalogUrl} className="mt-2 text-sm underline" style={{ color: theme?.primaryColor }}>
                  Ir al catalogo completo
                </a>
              )}
            </div>
          )}

          {status === 'ok' && !hasOffers && (
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-10 text-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-3xl"
                style={{ background: theme?.primaryRgba?.(0.1) || 'rgba(37,211,102,0.1)' }}
              >
                <Icon name="Sparkles" size={28} color={theme?.primaryColor || '#25D366'} />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">Hoy no hay ofertas activas</h2>
              <p className="max-w-2xl text-sm leading-relaxed text-gray-600 sm:text-base">
                Igual puedes explorar el catalogo completo de {business?.name || 'este negocio'} y encontrar productos disponibles para pedir ahora mismo.
              </p>
              {catalogUrl && (
                <a
                  href={catalogUrl}
                  className="mt-2 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-white transition-all hover:brightness-105 active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${theme?.primaryColor || '#25D366'}, ${theme?.primaryColorDark || '#128C7E'})` }}
                >
                  <Icon name="ShoppingBag" size={16} color="#fff" />
                  Explorar catalogo
                </a>
              )}
            </div>
          )}

          {status === 'ok' && hasOffers && (
            <>
              {hasCategoryBar && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className="rounded-full px-4 py-1.5 text-xs font-bold border transition-all active:scale-95"
                    style={
                      selectedCategory === 'all'
                        ? { background: `linear-gradient(135deg, ${theme?.primaryColor || '#25D366'}, ${theme?.primaryColorDark || '#128C7E'})`, borderColor: 'transparent', color: '#ffffff' }
                        : { background: theme?.sectionBg || 'rgba(0,0,0,0.04)', borderColor: theme?.borderColor || '#e5e7eb', color: theme?.chipText || theme?.primaryColor || '#25D366' }
                    }
                  >
                    Todos ({products.length})
                  </button>
                  {offerCategories.map((cat) => {
                    const count = products.filter((p) =>
                      cat === 'Otros' ? !(p?.category || '').trim() : (p?.category || '').trim() === cat
                    ).length;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className="rounded-full px-4 py-1.5 text-xs font-bold border transition-all active:scale-95"
                        style={
                          selectedCategory === cat
                            ? { background: `linear-gradient(135deg, ${theme?.primaryColor || '#25D366'}, ${theme?.primaryColorDark || '#128C7E'})`, borderColor: 'transparent', color: '#ffffff' }
                            : { background: theme?.sectionBg || 'rgba(0,0,0,0.04)', borderColor: theme?.borderColor || '#e5e7eb', color: theme?.chipText || theme?.primaryColor || '#25D366' }
                        }
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
              {hasCategoryBar && selectedCategory !== 'all' && (
                <p className="mb-3 text-xs" style={{ color: theme?.isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>
                  {filteredOfferProducts.length} de {products.length} {products.length === 1 ? 'producto' : 'productos'}
                </p>
              )}
              <div
                className="grid items-stretch gap-3 md:gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
              >
                {filteredOfferProducts.map((product) => (
                  <OfferCard
                    key={product.id}
                    product={product}
                    formatPrice={formatPrice}
                    theme={theme}
                    onOpen={setSelectedProduct}
                  />
                ))}
              </div>
            </>
          )}

          {status === 'ok' && !hasOffers && hasFallbackProducts && (
            <div className="mx-auto w-full max-w-[1200px] pt-4">
              <div className="mb-5 flex flex-col items-center gap-2 text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.24em]" style={{ color: theme?.primaryColorDark || '#128C7E' }}>
                  Recomendados
                </p>
                <h3 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                  Mientras tanto, mira productos del catalogo
                </h3>
                <p className="max-w-2xl text-sm text-gray-600">
                  Seleccionamos algunos productos disponibles para que sigas explorando sin encontrarte con una pantalla vacia.
                </p>
              </div>
              <div
                className="grid items-stretch gap-3 md:gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
              >
                {fallbackProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    formatPrice={formatPrice}
                    onOpen={openCatalog}
                    onCtaClick={openCatalog}
                    ctaLabel="Ver en catalogo"
                    readOnly
                    theme={theme}
                    cardSettings={{ showPrice: true, showDescription: true, showStock: false, showWhatsApp: false }}
                    compact={false}
                  />
                ))}
              </div>
            </div>
          )}

          {status === 'ok' && !hasOffers && !hasFallbackProducts && catalogUrl && (
            <div className="mx-auto flex max-w-2xl justify-center px-4 pb-8 pt-2">
              <a
                href={catalogUrl}
                className="inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-bold transition-colors hover:bg-white"
                style={{
                  borderColor: theme?.primaryRgba?.(0.22) || 'rgba(37,211,102,0.22)',
                  color: theme?.primaryColorDark || '#128C7E',
                  backgroundColor: theme?.primaryRgba?.(0.08) || 'rgba(37,211,102,0.08)',
                }}
              >
                <Icon name="ArrowRight" size={16} color={theme?.primaryColorDark || '#128C7E'} />
                Ver todos los productos
              </a>
            </div>
          )}
        </section>
      </main>

      {status === 'ok' && hasOffers && business?.whatsapp && (
        <CartBar business={business} formatPrice={formatPrice} offersUrl={offersUrl} />
      )}

      <BrandingFooter business={business} />

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          business={business}
          slug={slug}
          formatPrice={formatPrice}
          whatsAppUrl={buildSingleWhatsAppUrl(selectedProduct)}
          whatsAppMessage={buildSingleWhatsAppMessage(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
          theme={theme}
          cardSettings={{ showPrice: true, showDescription: true }}
        />
      )}
    </CatalogLayout>
  );
}

export default function PublicOffers() {
  return (
    <CartProvider>
      <PublicOffersContent />
    </CartProvider>
  );
}
