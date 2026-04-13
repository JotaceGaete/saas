import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { getBusinessBySlug, getPublicOfferProducts } from '../../services/waBusinessService';
import { CartProvider, useCart } from '../../contexts/CartContext';
import { formatPrice as formatPriceUtil, resolveCatalogCurrency } from '../../utils/formatPrice';
import { getBusinessLocale } from '../../lib/locale/businessLocale';
import { resolveCatalogTheme } from '../../utils/catalogTheme';
import { cfImageUrl, buildCfImageErrorHandler } from '../../utils/cloudflareImage';
import { getPublicCatalogUrl, getPublicOffersUrl } from '../../config/appUrl';
import { openWhatsAppUrl } from '../../utils/openWhatsAppUrl';
import CatalogLayout from '../public-catalog/CatalogLayout';
import BrandingFooter from '../../components/BrandingFooter';
import Icon from '../../components/AppIcon';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { getDiscountPercent } from '../../utils/offerHelpers';

// SEO note: this page is intentionally noindex for now.
// og:title/og:image are not set — add them when an OG endpoint is available for /ofertas.

// ─── OfferCard ────────────────────────────────────────────────────────────────
function OfferCard({ product, formatPrice, theme }) {
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const { addItem, updateQuantity, items } = useCart();
  const cartItem = items?.find(i => i?.id === product?.id);
  const qty = cartItem?.quantity || 0;
  const [bump, setBump] = useState(false);
  const discount = getDiscountPercent(product?.price, product?.compareAtPrice);
  // Shift the qty bubble down when the discount badge occupies the top-left corner
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
      className="group flex h-full min-h-0 flex-col rounded-2xl bg-white text-left overflow-hidden will-change-transform transition-[transform,box-shadow] duration-200 ease-out md:hover:-translate-y-1 md:hover:scale-[1.01] md:hover:shadow-lg active:scale-[0.98]"
      style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* Imagen */}
      <div className="relative block w-full shrink-0 overflow-hidden bg-gray-50 rounded-t-2xl">
        <div className="relative w-full aspect-[4/5] min-h-0">
          {product?.imageUrl ? (
            <img
              src={cfImageUrl(product.imageUrl, 'thumbnail')}
              alt={product?.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={buildCfImageErrorHandler(product.imageUrl)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-100">
              <Icon name="ImageOff" size={32} color="#D1D5DB" />
            </div>
          )}
          {/* Badge % OFF — only when there is a real higher compare_at_price */}
          {discount !== null && (
            <span
              className="absolute left-1.5 top-1.5 z-[1] rounded-md px-1.5 py-0.5 text-[10px] font-black text-white shadow-sm"
              style={{ backgroundColor: '#EF4444' }}
            >
              -{discount}% OFF
            </span>
          )}
          {/* Qty bubble — shifts down when the discount badge is present */}
          {qty > 0 && (
            <div
              className={`absolute left-1 ${qtyTopClass} flex items-center justify-center rounded-full h-6 w-6 text-[11px] font-black text-white shadow`}
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
            >
              {qty}
            </div>
          )}
        </div>
      </div>

      {/* Bloque inferior */}
      <div className="flex min-h-0 flex-1 flex-col justify-between bg-white gap-1.5 rounded-b-2xl px-2.5 pb-2.5 pt-2">
        {/* Name — fixed 2-line container so cards align regardless of text length */}
        <div className="flex min-h-0 w-full flex-col gap-1">
          <div className="w-full shrink-0 overflow-hidden h-[2.45rem] sm:h-[2.7rem]">
            <h3 className="line-clamp-2 h-full w-full min-w-0 overflow-hidden text-ellipsis break-words text-gray-900 text-[11px] font-bold leading-[1.25] sm:text-xs sm:leading-[1.3] [overflow-wrap:anywhere]">
              {(product?.name || '').trim() || 'Producto'}
            </h3>
          </div>
        </div>

        {/* Price block + add-to-cart */}
        <div className="w-full shrink-0 flex flex-col gap-2 pt-1">
          <div className="flex flex-col gap-0.5">
            <p className="shrink-0 font-bold leading-none tracking-tight text-gray-900 text-xl">
              {formatPrice(product?.price)}
            </p>
            {/* Strikethrough only when compare_at_price is strictly greater than current price */}
            {discount !== null && (
              <p className="text-xs text-gray-400 line-through leading-none">
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
              <span className="inline-flex items-center justify-center rounded-full bg-white/20 text-white h-6 w-6">
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
                className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 text-white transition-colors hover:bg-white/20 active:scale-90"
              >
                <Icon name="Minus" size={14} color="#FFFFFF" />
              </button>
              <span className="text-sm font-black text-white">{qty}</span>
              <button
                type="button"
                onClick={handleIncrease}
                className="flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 text-white transition-colors hover:bg-white/20 active:scale-90"
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

// ─── CartBar ──────────────────────────────────────────────────────────────────
// TODO(offers-order): save order to Supabase (wa_orders) before opening WhatsApp,
// same as the main catalog flow (createOrder). Currently only opens WA without persisting.
function CartBar({ business, formatPrice, offersUrl }) {
  const { items, total, itemCount } = useCart();
  const [sent, setSent] = useState(false);

  if (itemCount === 0) return null;

  const handleOrder = () => {
    if (!business?.whatsapp) return;
    // Format matches the catalog convention: URL header + product lines + total
    const lines = items.map(i => {
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
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2 pointer-events-none">
      <div
        className="pointer-events-auto mx-auto max-w-lg rounded-2xl px-4 py-3 flex items-center justify-between gap-3 shadow-xl"
        style={{ backgroundColor: '#25D366' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white text-xs font-black">
            {itemCount}
          </div>
          <span className="text-sm font-bold text-white truncate">{formatPrice(total)}</span>
        </div>
        <button
          type="button"
          onClick={handleOrder}
          className="flex-shrink-0 flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold transition-all active:scale-95 whitespace-nowrap"
          style={{ color: '#128C7E' }}
        >
          <Icon name="MessageCircle" size={14} color="#128C7E" />
          {sent ? '¡Enviado!' : 'Pedir por WhatsApp'}
        </button>
      </div>
    </div>
  );
}

// ─── Content ──────────────────────────────────────────────────────────────────
function PublicOffersContent() {
  const { slug } = useParams();
  const isDesktop = useIsDesktop();
  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  // 'loading' | 'not-found' | 'error' | 'ok'
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!slug) return;
    setStatus('loading');
    getBusinessBySlug(slug).then(async (bizResult) => {
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
      const { data: prods, error: prodErr } = await getPublicOfferProducts(biz.id);
      if (prodErr) {
        setStatus('error');
        return;
      }
      setProducts(prods || []);
      setStatus('ok');
    });
  }, [slug]);

  const locale = business ? getBusinessLocale(business) : null;
  const currency = business ? resolveCatalogCurrency(business, null) : null;
  const formatPrice = (amount) =>
    locale && currency
      ? formatPriceUtil(amount, currency, locale.countryCode)
      : `$${Number(amount || 0).toFixed(2)}`;

  const theme = resolveCatalogTheme(business?.design || null);
  const catalogUrl = business?.slug ? getPublicCatalogUrl(business.slug) : null;
  const offersUrl = business?.slug ? getPublicOffersUrl(business.slug) : null;
  const hasOffers = products.length > 0;
  const pageTitle = business ? `Ofertas de ${business.name}` : 'Ofertas';

  return (
    <CatalogLayout theme={theme} isDesktop={isDesktop} className="min-h-screen">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={business ? `Ofertas y promociones de ${business.name}` : 'Ofertas'} />
        {/* noindex: this page is a sharing tool, not a landing page for organic search */}
        <meta name="robots" content="noindex,nofollow" />
        {/* TODO(offers-seo): add og:title, og:image, og:url once an OG image endpoint
            exists for /ofertas. Until then, WhatsApp will show a plain link preview. */}
      </Helmet>

      {/* Header */}
      <header
        className="sticky top-0 z-40 w-full"
        style={{ backgroundColor: theme?.primaryColor || '#25D366' }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl" aria-hidden>🏷️</span>
            <div className="min-w-0">
              <p className="text-white/80 text-[10px] font-semibold uppercase tracking-wider leading-none">Ofertas</p>
              <h1 className="text-white font-bold text-sm leading-tight truncate">
                {business?.name || slug}
              </h1>
            </div>
          </div>
          {catalogUrl && (
            <a
              href={catalogUrl}
              className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-white text-xs font-semibold hover:bg-white/30 transition-colors whitespace-nowrap"
            >
              <Icon name="ShoppingBag" size={12} color="#fff" />
              Ver catálogo
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-5 pb-28">

        {/* Loading */}
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <svg className="animate-spin" width={32} height={32} viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="rgba(0,0,0,0.1)" strokeWidth="3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke={theme?.primaryColor || '#25D366'} strokeWidth="3" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-gray-400">Cargando ofertas…</p>
          </div>
        )}

        {/* Business not found */}
        {status === 'not-found' && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-4">
            <Icon name="Store" size={40} color="#D1D5DB" />
            <h2 className="text-lg font-bold text-gray-800">Negocio no encontrado</h2>
            <p className="text-sm text-gray-500">
              El enlace que seguiste no corresponde a ningún negocio activo.
            </p>
          </div>
        )}

        {/* Generic error (network, Supabase, etc.) */}
        {status === 'error' && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-4">
            <Icon name="AlertCircle" size={40} color="#F87171" />
            <h2 className="text-lg font-bold text-gray-800">No pudimos cargar las ofertas</h2>
            <p className="text-sm text-gray-500">
              Verifica tu conexión e intenta recargar la página.
            </p>
            {catalogUrl && (
              <a href={catalogUrl} className="mt-2 text-sm underline" style={{ color: theme?.primaryColor }}>
                Ir al catálogo completo
              </a>
            )}
          </div>
        )}

        {/* No active offers */}
        {status === 'ok' && !hasOffers && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-4">
            <span className="text-5xl" aria-hidden>🏷️</span>
            <h2 className="text-lg font-bold text-gray-800">Sin ofertas activas</h2>
            <p className="text-sm text-gray-500">
              {business?.name || 'Este negocio'} no tiene ofertas activas en este momento.
            </p>
            {catalogUrl && (
              <a
                href={catalogUrl}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all active:scale-95"
                style={{ background: `linear-gradient(135deg, ${theme?.primaryColor || '#25D366'}, ${theme?.primaryColorDark || '#128C7E'})` }}
              >
                <Icon name="ShoppingBag" size={14} color="#fff" />
                Ver catálogo completo
              </a>
            )}
          </div>
        )}

        {/* Offers grid */}
        {status === 'ok' && hasOffers && (
          <>
            <p className="text-xs text-gray-500 mb-4">
              {products.length} {products.length === 1 ? 'producto en oferta' : 'productos en oferta'}
            </p>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
            >
              {products.map(product => (
                <OfferCard
                  key={product.id}
                  product={product}
                  formatPrice={formatPrice}
                  theme={theme}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Cart bar — only when offers loaded and business has WhatsApp */}
      {status === 'ok' && hasOffers && business?.whatsapp && (
        <CartBar business={business} formatPrice={formatPrice} offersUrl={offersUrl} />
      )}

      <BrandingFooter business={business} />
    </CatalogLayout>
  );
}

// ─── Root (wraps CartProvider) ────────────────────────────────────────────────
export default function PublicOffers() {
  return (
    <CartProvider>
      <PublicOffersContent />
    </CartProvider>
  );
}
