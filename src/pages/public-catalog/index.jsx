import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getBusinessBySlug, getPublicProducts, getCategoriesByRubroId } from '../../services/waBusinessService';
import Icon from '../../components/AppIcon';
import { CartProvider, useCart } from '../../contexts/CartContext';
import { formatCLP } from '../../utils/formatCLP';
import { useIsDesktop } from '../../hooks/useMediaQuery';

// Normalizar imágenes del producto: array (vacío o con URLs)
function getProductImages(product) {
  const list = Array.isArray(product?.images) && product.images.length > 0
    ? product.images
    : (product?.imageUrl ? [product.imageUrl] : []);
  // Quitar duplicados manteniendo orden (por si imageUrl repite el primero de images)
  const seen = new Set();
  return list.filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

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
  const [rubroCategories, setRubroCategories] = useState([]);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState([0, 0]);
  const [maxPrice, setMaxPrice] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { itemCount } = useCart();
  const isDesktop = useIsDesktop();

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
    if (biz?.rubroId && biz?.designSettings?.useCategories) {
      const { data: cats } = await getCategoriesByRubroId(biz.rubroId);
      setRubroCategories(cats || []);
    } else {
      setRubroCategories([]);
    }
    setLoading(false);
  };

  const formatPrice = (price) => formatCLP(price);

  // Derivar useCategories y categoryNames desde business y rubroCategories (antes de useMemos)
  const design = business?.designSettings || {};
  const useCategories = design?.useCategories === true && !!business?.rubroId;
  const categoryNames = (rubroCategories || []).map((c) => c?.name?.trim()).filter(Boolean);

  // Categorías para tabs: solo cuando useCategories está activo (Todos + definidas + Otros)
  const categories = useMemo(() => {
    if (!useCategories) return [];
    return ['all', ...categoryNames, 'Otros'];
  }, [useCategories, categoryNames]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products?.filter(p => {
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

  // Bloques por categoría: solo cuando useCategories; orden = orden de categorías; solo bloques con productos
  const productsByBlock = useMemo(() => {
    if (!useCategories || categories?.length === 0) return null;
    const order = categories.filter((c) => c !== 'all');
    const blocks = [];
    for (const cat of order) {
      const prods = filteredProducts.filter((p) =>
        cat === 'Otros' ? !p?.category?.trim() : p?.category === cat
      );
      if (prods.length > 0) blocks.push({ categoryName: cat, products: prods });
    }
    return blocks;
  }, [useCategories, categories, filteredProducts]);

  // Para render: con categorías y "Todos" → varios bloques; con categoría elegida → un solo bloque
  const blocksToRender =
    !useCategories || !categories?.length
      ? null
      : selectedCategory === 'all'
        ? productsByBlock
        : filteredProducts?.length > 0
          ? [{ categoryName: selectedCategory, products: filteredProducts }]
          : [];

  const hasActiveFilters = searchQuery?.trim() || (useCategories && selectedCategory !== 'all') || priceRange?.[0] > 0 || priceRange?.[1] < maxPrice;

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

  const primaryColor = design?.primaryColor || '#25D366';
  const primaryColorDark = darkenHex(primaryColor);
  const coverFit = design?.coverFit === 'contain' ? 'contain' : 'cover';
  const coverPosition = ['top', 'center', 'bottom'].includes(design?.coverPosition) ? design.coverPosition : 'center';
  const theme = { primaryColor, primaryColorDark, primaryRgba: (a) => hexToRgba(primaryColor, a) };
  const cardSettings = { showPrice: true, showDescription: true, showStock: false, showWhatsApp: true, ...design?.cardSettings };
  const storeHeader = { showStoreName: true, showDescription: true, showWhatsAppButton: true, ...design?.storeHeader };
  const catalogViewMode = design?.catalogViewMode === 'compact' ? 'compact' : 'featured';
  // En escritorio siempre tarjetas grandes (como en la imagen); compact solo en móvil
  const useCompactCard = catalogViewMode === 'compact' && !isDesktop;
  const gridClass =
    isDesktop
      ? 'grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4'
      : catalogViewMode === 'compact'
        ? 'grid grid-cols-2 gap-2 sm:gap-3'
        : 'grid grid-cols-1 gap-3 sm:gap-4';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Cabecera móvil: Volver + nombre/logo — solo en móvil, navegación clara sin hamburguesa */}
      {!loading && !notFound && business && (
        <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm md:hidden" role="banner">
          <div className="flex items-center h-14 px-4 gap-3">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="flex-shrink-0 flex items-center justify-center w-10 h-10 -ml-1 rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              aria-label="Volver"
            >
              <Icon name="ArrowLeft" size={22} color="currentColor" />
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-2.5">
              {business?.logoUrl ? (
                <img src={business.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}>
                  <Icon name="Store" size={16} color="#FFFFFF" />
                </div>
              )}
              <span className="font-bold text-gray-900 truncate text-base" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                {business?.name}
              </span>
            </div>
          </div>
        </header>
      )}

      {/* ── Header: banner + tarjeta de identidad ── */}
      <div className="bg-white shadow-sm pt-14 md:pt-0">
        {/* 1. Banner — solo fondo visual, sin texto encima */}
        <div
          className="h-[80px] sm:h-[110px] md:h-[130px] w-full relative overflow-hidden"
          style={{
            background: business?.coverImageUrl
              ? (coverFit === 'contain' ? primaryColor : undefined)
              : `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 50%, ${primaryColorDark} 100%)`
          }}
        >
          {business?.coverImageUrl && (
            <img
              src={business?.coverImageUrl}
              alt=""
              role="presentation"
              className="w-full h-full"
              style={{
                objectFit: coverFit,
                objectPosition: coverFit === 'cover' ? coverPosition : 'center',
              }}
            />
          )}
        </div>

        {/* 2. Tarjeta de identidad superpuesta (todo el contenido sobre fondo blanco) */}
        <div className="max-w-5xl mx-auto px-4 -mt-6 sm:-mt-8 relative z-10">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Izquierda: logo + nombre + badge + descripción */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 min-w-0 flex-1">
                <div className="flex-shrink-0">
                  {business?.logoUrl ? (
                    <img
                      src={business?.logoUrl}
                      alt={business?.name}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-gray-100"
                    />
                  ) : (
                    <div
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center border-2 border-gray-100"
                      style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
                    >
                      <Icon name="Store" size={28} color="#FFFFFF" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {storeHeader?.showStoreName !== false && (
                      <h1
                        className="text-2xl font-bold text-gray-900 leading-tight tracking-tight"
                        style={{ fontFamily: 'DM Sans, sans-serif' }}
                      >
                        {business?.name}
                      </h1>
                    )}
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0"
                      style={{ background: theme.primaryRgba(0.12), color: primaryColorDark }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: primaryColor }} />
                      Activa
                    </span>
                  </div>
                  {business?.city && (
                    <div className="flex items-center gap-1 mb-1">
                      <Icon name="MapPin" size={12} color="#9CA3AF" />
                      <span className="text-xs text-gray-500">{business?.city}</span>
                    </div>
                  )}
                  {storeHeader?.showDescription !== false && business?.description && (
                    <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">{business?.description}</p>
                  )}
                </div>
              </div>
              {/* Derecha: botón Contactar */}
              {storeHeader?.showWhatsAppButton !== false && storeWhatsAppUrl && (
                <div className="flex-shrink-0 md:pl-4 w-full md:w-auto">
                  <a
                    href={storeWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full md:w-auto px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})`,
                      boxShadow: `0 2px 10px ${theme.primaryRgba(0.35)}`,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Contactar
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Buscador — debajo de la tarjeta */}
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Icon name="Search" size={16} color="#9CA3AF" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e?.target?.value)}
              placeholder="Buscar productos..."
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all bg-gray-50"
              style={{ '--tw-ring-color': primaryColor }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-3 flex items-center">
                <Icon name="X" size={14} color="#9CA3AF" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Filtros (sticky) — menos espacio vertical. Categorías solo si useCategories ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-2 space-y-2">
          {/* Category filter bar (solo cuando el negocio tiene categorías activadas) */}
          <div className="flex items-center gap-2">
            {useCategories && categories?.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden flex-1 scrollbar-hide pb-0.5 min-w-0 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`flex-shrink-0 snap-start px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    selectedCategory === 'all' ? 'text-white border-transparent shadow-sm' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
                  }`}
                  style={selectedCategory === 'all' ? { background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` } : {}}
                >
                  Todos
                </button>
                {categories.filter((c) => c !== 'all').map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex-shrink-0 snap-start px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
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
            )}

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
            <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
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

      {/* ── Products: listado plano o bloques por categoría ── */}
      <div className="max-w-7xl mx-auto px-4 py-3 pb-32 sm:pb-36">
        {/* Product count */}
        <p className="text-xs text-gray-400 font-medium mb-3">
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
        ) : blocksToRender && blocksToRender.length > 0 ? (
          /* Bloques por categoría (tabs + secciones con título) */
          <div className="space-y-8 md:space-y-10">
            {blocksToRender.map((block) => (
              <section key={block.categoryName} className="scroll-mt-24">
                <h2 className="text-base md:text-lg font-bold text-gray-900 mb-3 md:mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  {block.categoryName}
                </h2>
                <div className={gridClass}>
                  {block.products?.map((product) => (
                    <ProductCard
                      key={product?.id}
                      product={product}
                      formatPrice={formatPrice}
                      onOpen={openProduct}
                      theme={theme}
                      cardSettings={cardSettings}
                      useCategories={useCategories}
                      compact={useCompactCard}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          /* Listado plano (sin categorías o sin bloques) */
          <div className={gridClass}>
            {filteredProducts?.map((product) => (
              <ProductCard
                key={product?.id}
                product={product}
                formatPrice={formatPrice}
                onOpen={openProduct}
                theme={theme}
                cardSettings={cardSettings}
                useCategories={useCategories}
                compact={useCompactCard}
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
          useCategories={useCategories}
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
            className="pointer-events-auto w-full flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl text-white font-bold text-sm transition-all duration-300 shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`,
              boxShadow: `0 4px 20px ${primaryRgba(0.4)}, 0 2px 6px rgba(0,0,0,0.1)`,
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
          className={`pointer-events-auto w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-white font-bold text-sm transition-all duration-300 ${
            bump ? 'scale-[1.03]' : 'scale-100'
          }`}
          style={{
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%)`,
            boxShadow: `0 4px 20px ${primaryRgba(0.4)}, 0 2px 6px rgba(0,0,0,0.1)`,
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
// compact: vista compacta (2 cols móvil), tarjeta pequeña; una sola imagen + badge +N si hay más
function ProductCard({ product, formatPrice, onOpen, theme, cardSettings, useCategories = false, compact = false }) {
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

  const imgs = getProductImages(product);
  const extraImages = imgs.length > 1 ? imgs.length - 1 : 0;

  return (
    <div
      className={`group text-left overflow-hidden bg-white flex flex-col h-full transition-all duration-200 ease-out md:hover:translate-y-[-4px] md:hover:shadow-lg ${
        compact ? 'rounded-xl' : 'rounded-2xl'
      }`}
      style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* Una sola imagen; badge +N si hay más */}
      <button onClick={() => onOpen(product)} className={`block w-full text-left min-h-0 flex flex-col ${compact ? 'flex-[5]' : 'flex-[7]'}`}>
        <div className={`w-full flex-1 min-h-0 overflow-hidden bg-gray-50 relative ${compact ? 'rounded-t-xl min-h-[72px]' : 'rounded-t-2xl'}`}>
          {imgs[0] ? (
            <img
              src={imgs[0]}
              alt={product?.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center bg-gray-100 ${compact ? 'min-h-[72px]' : 'min-h-[120px]'}`}>
              <Icon name="ImageOff" size={compact ? 20 : 32} color="#D1D5DB" />
            </div>
          )}
          {extraImages > 0 && (
            <div
              className="absolute top-1 right-1 flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold text-white shadow"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
            >
              <Icon name="Images" size={8} color="#fff" />
              +{extraImages}
            </div>
          )}
          {qty > 0 && (
            <div
              className={`absolute top-1 left-1 rounded-full flex items-center justify-center text-white shadow ${compact ? 'w-5 h-5 text-[10px] font-black' : 'w-6 h-6 text-[11px] font-black'}`}
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
            >
              {qty}
            </div>
          )}
          {product?.hasOptions && (
            <div
              className="absolute bottom-1 left-1 flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold"
              style={{ backgroundColor: 'rgba(234,179,8,0.9)', color: '#713f12' }}
            >
              <Icon name="ListChecks" size={8} color="#713f12" />
              Opciones
            </div>
          )}
        </div>
      </button>

      <div className={`flex flex-col min-h-0 ${compact ? 'p-1.5 flex-[3]' : 'p-2 flex-[3]'}`}>
        {useCategories && product?.category && (
          <span className="inline-block text-[10px] font-semibold rounded px-1 py-0.5 mb-0.5 self-start" style={{ color: primaryColorDark, backgroundColor: theme?.primaryRgba?.(0.12) || 'rgba(37,211,102,0.12)' }}>
            {product?.category}
          </span>
        )}
        <h3 className={`text-gray-800 line-clamp-2 leading-snug flex-1 min-h-0 ${compact ? 'text-[11px] font-semibold mb-0.5' : 'text-xs font-semibold mb-1'}`}>
          {product?.name}
        </h3>
        {showDescription && product?.description && (
          <p className={`text-gray-500 leading-snug ${compact ? 'text-[10px] line-clamp-1 mb-0.5' : 'text-xs line-clamp-2 mb-1'}`}>{product?.description}</p>
        )}
        {showPrice && (
          <p className={`font-extrabold text-gray-900 leading-none ${compact ? 'text-sm mb-1' : 'text-lg mb-2'}`}>
            {formatPrice(product?.price)}
          </p>
        )}
        {!showPrice && <div className={compact ? 'mb-1' : 'mb-2'} />}

        {qty === 0 ? (
          <button
            onClick={handleAdd}
            className={`w-full rounded-xl flex items-center justify-center gap-0.5 text-white transition-all duration-150 active:scale-95 ${bump ? 'scale-105' : ''} ${
              compact ? 'py-1.5 text-[11px] font-bold rounded-lg' : 'py-2 sm:py-1.5 text-xs font-bold'
            }`}
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
          >
            <Icon name="Plus" size={compact ? 10 : 12} color="#FFFFFF" />
            Agregar
          </button>
        ) : (
          <div
            className={`flex items-center justify-between rounded-xl overflow-hidden transition-all duration-150 ${bump ? 'scale-105' : ''} ${compact ? 'rounded-lg' : ''}`}
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}
          >
            <button
              onClick={handleDecrease}
              className={`flex items-center justify-center text-white hover:bg-white/20 transition-colors active:scale-90 ${compact ? 'w-6 h-6' : 'w-8 h-8 sm:w-9 sm:h-9'}`}
            >
              <Icon name="Minus" size={compact ? 10 : 14} color="#FFFFFF" />
            </button>
            <span className={`text-white font-black ${compact ? 'text-xs' : 'text-sm'}`}>{qty}</span>
            <button
              onClick={handleIncrease}
              className={`flex items-center justify-center text-white hover:bg-white/20 transition-colors active:scale-90 ${compact ? 'w-6 h-6' : 'w-8 h-8 sm:w-9 sm:h-9'}`}
            >
              <Icon name="Plus" size={compact ? 10 : 14} color="#FFFFFF" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Product Modal ────────────────────────────────────────────────────────────
function ProductModal({ product, business, formatPrice, whatsAppUrl, onClose, theme, cardSettings, useCategories = false }) {
  const primaryColor = theme?.primaryColor || '#25D366';
  const primaryColorDark = theme?.primaryColorDark || '#128C7E';
  const primaryRgba = theme?.primaryRgba || (() => 'rgba(37,211,102,0.35)');
  const showPrice = cardSettings?.showPrice !== false;
  const showDescription = cardSettings?.showDescription !== false;
  const { addItem, items } = useCart();
  const cartItem = items?.find(i => i?.id === product?.id);
  const qty = cartItem?.quantity || 0;

  const productImages = getProductImages(product);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const touchStartX = React.useRef(0);
  const touchEndX = React.useRef(0);

  useEffect(() => { setSelectedIndex(0); }, [product?.id]);
  const mainUrl = productImages[selectedIndex];

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
          <div
            className="aspect-square w-full bg-gray-100 overflow-hidden relative select-none touch-pan-y flex items-center justify-center"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {mainUrl ? (
              <img src={mainUrl} alt={product?.name} className="w-full h-full object-contain" draggable={false} />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Icon name="ImageOff" size={48} color="#D1D5DB" />
              </div>
            )}
            {/* Navegación anterior/siguiente cuando hay más de una imagen */}
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
          {/* Miniaturas debajo de la imagen principal */}
          {productImages.length > 1 && (
            <div className="flex gap-1.5 p-2 overflow-x-auto bg-gray-50 border-b" style={{ borderColor: 'var(--color-border)' }}>
              {productImages.map((url, i) => (
                <button
                  key={url + i}
                  type="button"
                  onClick={() => setSelectedIndex(i)}
                  className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all"
                  style={{
                    borderColor: selectedIndex === i ? primaryColor : 'transparent',
                    boxShadow: selectedIndex === i ? `0 0 0 2px ${primaryColor}` : 'none',
                  }}
                >
                  <img src={url} alt={`${product?.name} ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColorDark})` }}>
              <Icon name="Store" size={11} color="#FFFFFF" />
            </div>
            <span className="text-xs text-gray-400 font-medium">{business?.name}</span>
            {useCategories && product?.category && (
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
