import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getBusinessBySlug, getPublicProducts } from '../../services/waBusinessService';
import Icon from '../../components/AppIcon';
import { CartProvider, useCart } from '../../contexts/CartContext';

// Helpers para aplicar color principal del negocio en el catálogo
function hexToRgb(hex) {
  const h = hex?.replace(/^#/, '');
  if (h?.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  if (h?.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [37, 211, 102]; // fallback verde
}
function darkenHex(hex, pct = 0.2) {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 - pct;
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x * f))).toString(16).padStart(2, '0')).join('')}`;
}
function hexToRgba(hex, alpha = 0.4) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function PublicCatalog() {
  const { slug } = useParams();
  return (
    <CartProvider>
      <CatalogInner slug={slug} />
    </CartProvider>
  );
}

function CatalogInner({ slug }) {
  const [business, setBusiness] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState([0, 0]);
  const [maxPrice, setMaxPrice] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { itemCount } = useCart();

  useEffect(() => {
    if (!slug) return;
    loadCatalog();
  }, [slug]);

  const loadCatalog = async () => {
    setLoading(true);
    const { data: biz, error: bizErr } = await getBusinessBySlug(slug);
    if (bizErr || !biz) { setNotFound(true); setLoading(false); return; }
    setBusiness(biz);
    const { data: prods } = await getPublicProducts(biz?.id);
    const loadedProducts = prods || [];
    setProducts(loadedProducts);
    if (loadedProducts?.length > 0) {
      const prices = loadedProducts?.map(p => p?.price || 0);
      const max = Math.max(...prices);
      setMaxPrice(max);
      setPriceRange([0, max]);
    }
    setLoading(false);
  };

  const formatPrice = (price) => {
    const currency = business?.currency || 'USD';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0 })?.format(price);
  };

  // Derive unique categories from products
  const categories = useMemo(() => {
    const cats = new Set();
    products?.forEach(p => {
      if (p?.category) cats?.add(p?.category);
    });
    return Array.from(cats)?.sort();
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products?.filter(p => {
      const matchesSearch = !searchQuery?.trim() ||
        p?.name?.toLowerCase()?.includes(searchQuery?.toLowerCase()) ||
        p?.description?.toLowerCase()?.includes(searchQuery?.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || p?.category === selectedCategory;
      const matchesPrice = p?.price >= priceRange?.[0] && p?.price <= priceRange?.[1];
      return matchesSearch && matchesCategory && matchesPrice;
    });
  }, [products, searchQuery, selectedCategory, priceRange]);

  const hasActiveFilters = searchQuery?.trim() || selectedCategory !== 'all' || priceRange?.[0] > 0 || priceRange?.[1] < maxPrice;

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setPriceRange([0, maxPrice]);
  };

  const buildSingleWhatsAppUrl = (product) => {
    const storeName = business?.name || 'la tienda';
    const phone = business?.whatsapp?.replace(/\D/g, '');
    let message = `Hola! Me interesa el producto:\n\n*${product?.name}*\nPrecio: ${formatPrice(product?.price)}\n\nTienda: ${storeName}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  const openProduct = (product) => setSelectedProduct(product);
  const closeProduct = () => setSelectedProduct(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-t-transparent rounded-full animate-spin" style={{ borderColor: '#25D366', borderTopColor: 'transparent' }} />
          <p className="text-sm text-gray-500 font-medium">Cargando catálogo...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
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

  const whatsappPhone = business?.whatsapp?.replace(/\D/g, '');
  const storeWhatsAppUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Hola! Vi tu catálogo en línea.`)}` : null;

  const design = business?.designSettings || {};
  const primaryColor = design?.primaryColor || '#25D366';
  const primaryColorDark = darkenHex(primaryColor);
  const theme = { primaryColor, primaryColorDark, primaryRgba: (a) => hexToRgba(primaryColor, a) };
  const cardSettings = { showPrice: true, showDescription: true, showStock: false, showWhatsApp: true, ...design?.cardSettings };
  const storeHeader = { showStoreName: true, showDescription: true, showWhatsAppButton: true, ...design?.storeHeader };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Store Header ── */}
      <div className="bg-white shadow-sm">
        {/* Cover image / gradient banner */}
        <div
          className="h-36 sm:h-48 w-full relative overflow-hidden"
          style={{
            background: business?.coverImageUrl
              ? undefined
              : `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 50%, ${primaryColorDark} 100%)`
          }}
        >
          {business?.coverImageUrl && (
            <img
              src={business?.coverImageUrl}
              alt="Portada de la tienda"
              className="w-full h-full object-cover"
            />
          )}
          {/* Subtle overlay for readability */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.35) 100%)' }} />
        </div>

        {/* Logo + info row */}
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-end gap-4 -mt-12 mb-3 relative z-10">
            {/* Circular logo */}
            <div className="flex-shrink-0">
              {business?.logoUrl ? (
                <img
                  src={business?.logoUrl}
                  alt={business?.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-xl"
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-full border-4 border-white shadow-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)' }}
                >
                  <Icon name="Store" size={36} color="#FFFFFF" />
                </div>
              )}
            </div>

            {/* WhatsApp contact button */}
            {storeHeader?.showWhatsAppButton !== false && storeWhatsAppUrl && (
              <div className="ml-auto mb-1">
                <a
                  href={storeWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white transition-all duration-150 hover:opacity-90 active:scale-95"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})`,
                    boxShadow: `0 4px 16px ${theme.primaryRgba(0.4)}`
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="#FFFFFF">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <span>Contactar</span>
                </a>
              </div>
            )}
          </div>

          {/* Store name, location, description, badge */}
          <div className="pb-5">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {storeHeader?.showStoreName !== false && (
                <h1 className="text-2xl font-extrabold text-gray-900 leading-tight" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {business?.name}
                </h1>
              )}
              {/* Store active badge */}
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: theme.primaryRgba(0.12), color: primaryColorDark }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: primaryColor }} />
                Activa
              </span>
            </div>
            {business?.city && (
              <div className="flex items-center gap-1 mb-2">
                <Icon name="MapPin" size={13} color="#9CA3AF" />
                <span className="text-sm text-gray-400">{business?.city}</span>
              </div>
            )}
            {storeHeader?.showDescription !== false && business?.description && (
              <p className="text-sm text-gray-500 leading-relaxed max-w-lg">{business?.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Search & Filters Bar (sticky) ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-3">
          {/* Search input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Icon name="Search" size={16} color="#9CA3AF" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e?.target?.value)}
              placeholder="Buscar productos..."
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all bg-gray-50"
              style={{ '--tw-ring-color': primaryColor }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-3 flex items-center">
                <Icon name="X" size={14} color="#9CA3AF" />
              </button>
            )}
          </div>

          {/* Category filter bar */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 overflow-x-auto flex-1 scrollbar-hide pb-0.5">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  selectedCategory === 'all' ?'text-white border-transparent shadow-sm' :'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                }`}
                style={selectedCategory === 'all' ? { background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` } : {}}
              >
                Todos
              </button>
              {categories?.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    selectedCategory === cat
                      ? 'text-white border-transparent shadow-sm'
                      : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                  }`}
                  style={selectedCategory === cat ? { background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` } : {}}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Filters toggle */}
            <button
              onClick={() => setFiltersOpen(prev => !prev)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                filtersOpen || (priceRange?.[0] > 0 || priceRange?.[1] < maxPrice)
                  ? 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50' :'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
              }`}
              style={filtersOpen || (priceRange?.[0] > 0 || priceRange?.[1] < maxPrice) ? { borderColor: primaryColor, color: primaryColorDark, backgroundColor: theme.primaryRgba(0.08) } : {}}
            >
              <Icon name="SlidersHorizontal" size={13} color={filtersOpen || (priceRange?.[0] > 0 || priceRange?.[1] < maxPrice) ? primaryColorDark : '#6B7280'} />
              Precio
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex-shrink-0 text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                <Icon name="X" size={14} color="currentColor" />
              </button>
            )}
          </div>

          {/* Expanded price range filter */}
          {filtersOpen && maxPrice > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
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

      {/* ── Products Grid ── */}
      <div className="max-w-2xl mx-auto px-4 py-5 pb-36">
        {/* Product count */}
        <p className="text-xs text-gray-400 font-medium mb-4">
          {filteredProducts?.length} {filteredProducts?.length === 1 ? 'producto' : 'productos'}
          {hasActiveFilters && products?.length !== filteredProducts?.length && (
            <span> de {products?.length}</span>
          )}
        </p>

        {filteredProducts?.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              {hasActiveFilters ? (
                <Icon name="SearchX" size={28} color="#9CA3AF" />
              ) : (
                <Icon name="Package" size={28} color="#9CA3AF" />
              )}
            </div>
            <p className="text-sm font-medium text-gray-400">
              {hasActiveFilters ? 'No hay productos con estos filtros' : 'No hay productos disponibles'}
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
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filteredProducts?.map(product => (
              <ProductCard
                key={product?.id}
                product={product}
                formatPrice={formatPrice}
                onOpen={openProduct}
                theme={theme}
                cardSettings={cardSettings}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Cart Button */}
      <FloatingCartButton onOpen={() => setCartOpen(true)} formatPrice={formatPrice} theme={theme} />

      {/* Order Panel */}
      {cartOpen && (
        <OrderPanel
          business={business}
          formatPrice={formatPrice}
          onClose={() => setCartOpen(false)}
          theme={theme}
        />
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          business={business}
          formatPrice={formatPrice}
          whatsAppUrl={buildSingleWhatsAppUrl(selectedProduct)}
          onClose={closeProduct}
          theme={theme}
          cardSettings={cardSettings}
        />
      )}
    </div>
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
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-5 pt-2 pointer-events-none">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={onOpen}
            className="pointer-events-auto w-full flex items-center justify-center gap-2.5 px-5 py-4 rounded-2xl text-white font-bold text-sm transition-all duration-300"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`,
              boxShadow: `0 8px 32px ${primaryRgba(0.45)}, 0 2px 8px rgba(0,0,0,0.12)`,
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
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-5 pt-2 pointer-events-none">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onOpen}
          className={`pointer-events-auto w-full flex items-center gap-3 px-5 py-4 rounded-2xl text-white font-bold text-sm transition-all duration-300 ${
            bump ? 'scale-[1.03]' : 'scale-100'
          }`}
          style={{
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`,
            boxShadow: `0 8px 32px ${primaryRgba(0.45)}, 0 2px 8px rgba(0,0,0,0.12)`,
          }}
        >
          {/* Cart icon */}
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/20 flex-shrink-0">
            <Icon name="ShoppingCart" size={18} color="#FFFFFF" />
          </div>
          {/* Label */}
          <div className="flex-1 text-left">
            <span className="text-[15px] font-bold">Ver pedido</span>
            <span className="text-white/80 mx-2">•</span>
            <span className="text-[13px] font-semibold text-white/90">
              {itemCount} {itemCount === 1 ? 'producto' : 'productos'}
            </span>
          </div>
          {/* Total */}
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
function OrderPanel({ business, formatPrice, onClose, theme }) {
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const primaryRgba = theme?.primaryRgba || (() => 'rgba(37,211,102,0.35)');
  const { items, updateQuantity, removeItem, total, clearCart } = useCart();
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleBackdrop = (e) => {
    if (e?.target === e?.currentTarget) onClose();
  };

  const sendWhatsApp = () => {
    const phone = business?.whatsapp?.replace(/\D/g, '');
    if (!phone) return;
    const lines = items?.map(item => `• ${item?.name} x${item?.quantity} — ${formatPrice(item?.price * item?.quantity)}`);
    let message = `Hola, quiero hacer este pedido:\n\n${lines?.join('\n')}\n\n*Total estimado: ${formatPrice(total)}*`;
    if (customerName?.trim()) message += `\n\nNombre: ${customerName?.trim()}`;
    if (notes?.trim()) message += `\nComentario: ${notes?.trim()}`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
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
            <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>Tu pedido</h2>
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
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Items */}
          {items?.map(item => (
            <div key={item?.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
              {/* Image */}
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                {item?.imageUrl ? (
                  <img src={item?.imageUrl} alt={item?.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Icon name="ImageOff" size={20} color="#D1D5DB" />
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{item?.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatPrice(item?.price)} c/u</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{formatPrice(item?.price * item?.quantity)}</p>
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

          {/* Total */}
          <div className="flex items-center justify-between rounded-2xl px-4 py-3 border" style={{ backgroundColor: primaryRgba(0.08), borderColor: primaryRgba(0.25) }}>
            <span className="text-sm font-semibold text-gray-700">Total estimado</span>
            <span className="text-lg font-black" style={{ color: primaryColorDark }}>{formatPrice(total)}</span>
          </div>

          {/* Customer name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tu nombre <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e?.target?.value)}
              placeholder="Ej: Juan García"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
              style={{ ['--tw-ring-color']: primaryColor }}
            />
          </div>

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
          <button
            onClick={sendWhatsApp}
            className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-base font-bold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
            style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`, boxShadow: `0 8px 24px ${primaryRgba(0.35)}` }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Enviar pedido por WhatsApp
          </button>
          <button
            onClick={() => { clearCart(); onClose(); }}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
          >
            Vaciar pedido
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product, formatPrice, onOpen, theme, cardSettings }) {
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const showPrice = cardSettings?.showPrice !== false;
  const showDescription = cardSettings?.showDescription !== false;
  const { addItem, updateQuantity, items } = useCart();
  const cartItem = items?.find(i => i?.id === product?.id);
  const qty = cartItem?.quantity || 0;
  const [bump, setBump] = useState(false);

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
      className="group text-left rounded-2xl overflow-hidden bg-white flex flex-col"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)' }}
    >
      {/* Image */}
      <button onClick={() => onOpen(product)} className="block w-full text-left">
        <div className="aspect-square overflow-hidden bg-gray-50 relative">
          {product?.imageUrl ? (
            <img
              src={product?.imageUrl}
              alt={product?.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <Icon name="ImageOff" size={32} color="#D1D5DB" />
            </div>
          )}
          {/* Qty badge */}
          {qty > 0 && (
            <div
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shadow-md"
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
            >
              {qty}
            </div>
          )}
          {/* Options badge */}
          {product?.hasOptions && (
            <div
              className="absolute bottom-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
              style={{ backgroundColor: 'rgba(234,179,8,0.9)', color: '#713f12' }}
            >
              <Icon name="ListChecks" size={9} color="#713f12" />
              Opciones
            </div>
          )}
        </div>
      </button>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        {product?.category && (
          <span className="inline-block text-[10px] font-semibold rounded-md px-1.5 py-0.5 mb-1.5 self-start" style={{ color: primaryColorDark, backgroundColor: theme?.primaryRgba?.(0.12) || 'rgba(37,211,102,0.12)' }}>
            {product?.category}
          </span>
        )}
        <h3 className="text-xs font-semibold text-gray-800 line-clamp-2 mb-2 leading-snug flex-1">
          {product?.name}
        </h3>
        {showDescription && product?.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-2 leading-snug">{product?.description}</p>
        )}
        {/* Price — prominent (solo si está activado en diseño) */}
        {showPrice && (
          <p className="text-base font-extrabold text-gray-900 mb-3 leading-none">
            {formatPrice(product?.price)}
          </p>
        )}
        {!showPrice && <div className="mb-3" />}

        {/* Add / Quantity selector */}
        {qty === 0 ? (
          <button
            onClick={handleAdd}
            className={`w-full py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-white transition-all duration-150 active:scale-95 ${
              bump ? 'scale-105' : ''
            }`}
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
          >
            <Icon name="Plus" size={13} color="#FFFFFF" />
            Agregar
          </button>
        ) : (
          <div
            className={`flex items-center justify-between rounded-xl overflow-hidden transition-all duration-150 ${
              bump ? 'scale-105' : ''
            }`}
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
          >
            <button
              onClick={handleDecrease}
              className="flex items-center justify-center w-9 h-9 text-white hover:bg-white/20 transition-colors active:scale-90"
            >
              <Icon name="Minus" size={14} color="#FFFFFF" />
            </button>
            <span className="text-sm font-black text-white">{qty}</span>
            <button
              onClick={handleIncrease}
              className="flex items-center justify-center w-9 h-9 text-white hover:bg-white/20 transition-colors active:scale-90"
            >
              <Icon name="Plus" size={14} color="#FFFFFF" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Product Modal ────────────────────────────────────────────────────────────
function ProductModal({ product, business, formatPrice, whatsAppUrl, onClose, theme, cardSettings }) {
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const primaryRgba = theme?.primaryRgba || (() => 'rgba(37,211,102,0.35)');
  const showPrice = cardSettings?.showPrice !== false;
  const showDescription = cardSettings?.showDescription !== false;
  const { addItem, items } = useCart();
  const cartItem = items?.find(i => i?.id === product?.id);
  const qty = cartItem?.quantity || 0;

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdrop}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl"
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div className="relative">
          <div className="aspect-square w-full bg-gray-50 overflow-hidden">
            {product?.imageUrl ? (
              <img src={product?.imageUrl} alt={product?.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Icon name="ImageOff" size={48} color="#D1D5DB" />
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center transition-all hover:bg-black/60 active:scale-90"
          >
            <Icon name="X" size={18} color="#FFFFFF" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}>
              <Icon name="Store" size={11} color="#FFFFFF" />
            </div>
            <span className="text-xs text-gray-400 font-medium">{business?.name}</span>
            {product?.category && (
              <span className="ml-auto text-[10px] font-semibold rounded-md px-1.5 py-0.5" style={{ color: primaryColorDark, backgroundColor: primaryRgba(0.12) }}>{product?.category}</span>
            )}
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2 leading-tight" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            {product?.name}
          </h2>

          {showDescription && product?.description && (
            <p className="text-sm text-gray-500 leading-relaxed mb-4">{product?.description}</p>
          )}

          {product?.hasOptions && product?.optionsDescription && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl mb-4"
              style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)' }}
            >
              <Icon name="ListChecks" size={15} color="#92400e" className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-800 mb-0.5">Opciones:</p>
                <p className="text-xs text-amber-700 leading-relaxed">{product?.optionsDescription}</p>
              </div>
            </div>
          )}

          {showPrice && (
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-3xl font-bold text-gray-900">{formatPrice(product?.price)}</span>
            </div>
          )}
          {!showPrice && <div className="mb-5" />}

          {/* Add to cart button */}
          <button
            onClick={() => { addItem(product); onClose(); }}
            className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl text-base font-bold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98] mb-3"
            style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`, boxShadow: `0 8px 24px ${primaryRgba(0.35)}` }}
          >
            <Icon name="ShoppingCart" size={20} color="#FFFFFF" />
            {qty > 0 ? `Agregar otro (${qty} en pedido)` : 'Agregar al pedido'}
          </button>

          {/* Direct WhatsApp for single product */}
          <a
            href={whatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all"
          >
            <Icon name="MessageCircle" size={16} color="#6B7280" />
            Solo este producto por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
