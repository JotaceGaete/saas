/**
 * QuickProductsSection — Acceso rápido en el TPV.
 *
 * Persiste en localStorage por businessId.
 * Preparado para migrar a crm_pos_quick_products (Supabase) en el futuro:
 * solo cambiar loadIds/saveIds por llamadas al servicio.
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Icon from 'components/AppIcon';

// ─── Límites ──────────────────────────────────────────────────────────────────

const QUICK_LIMIT_DESKTOP = 12;
const QUICK_LIMIT_OTHER   = 8;

// ─── Storage ──────────────────────────────────────────────────────────────────

function storageKey(businessId) {
  return `walinka:pos:quick-products:${businessId}`;
}

function loadIds(businessId) {
  if (!businessId) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(businessId)));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveIds(businessId, ids) {
  if (!businessId) return;
  try {
    localStorage.setItem(storageKey(businessId), JSON.stringify(ids));
  } catch { /* ignore */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function getImageSrc(product) {
  if (product.thumbnail_url)  return product.thumbnail_url;
  if (product.card_image_url) return product.card_image_url;
  if (product.image_url)      return product.image_url;
  if (Array.isArray(product.images) && product.images.length > 0) {
    const first = product.images[0];
    return typeof first === 'string' ? first : (first?.url || first?.src || null);
  }
  return null;
}

// ─── QuickProductPickerModal ───────────────────────────────────────────────────

function QuickProductPickerModal({ allProducts, posProducts, pinnedIds, limit, onPin, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const atLimit  = pinnedIds.length >= limit;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fallback a posProducts si allProducts aún no ha cargado
  const pool          = allProducts.length > 0 ? allProducts : posProducts;
  const stillLoading  = allProducts.length === 0 && posProducts.length === 0;
  const usingFallback = allProducts.length === 0 && posProducts.length > 0;

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return pool
      .filter(p =>
        normalize(p.name).includes(q) ||
        (p.sku         && normalize(p.sku).includes(q)) ||
        (p.public_code && normalize(p.public_code).includes(q)) ||
        (p.barcode     && normalize(p.barcode).includes(q))
      )
      .slice(0, 12);
  }, [query, pool]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2">
            <Icon name="Pin" size={15} className="text-blue-500" />
            ¿Qué producto deseas fijar?
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <Icon name="X" size={18} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pt-3 pb-2 space-y-2">
          <div className="relative">
            <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar producto…"
              className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <Icon name="X" size={13} />
              </button>
            )}
          </div>
          {atLimit && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Icon name="AlertCircle" size={13} />
              Límite de {limit} productos alcanzado. Quita uno para agregar otro.
            </p>
          )}
          {usingFallback && !atLimit && (
            <p className="text-[10px] text-amber-600 flex items-center gap-1">
              <Icon name="AlertCircle" size={10} />
              Buscando en productos del TPV. El catálogo completo aún carga…
            </p>
          )}
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 px-2 pb-3">
          {stillLoading ? (
            <div className="py-10 text-center flex flex-col items-center gap-2 text-gray-400">
              <Icon name="Loader2" size={20} className="animate-spin text-gray-300" />
              <p className="text-sm">Cargando productos…</p>
            </div>
          ) : !query.trim() ? (
            <div className="py-10 text-center flex flex-col items-center gap-2">
              <Icon name="Search" size={24} className="text-gray-200" />
              <p className="text-sm text-gray-400">Escribe para buscar</p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              Sin resultados para <strong>"{query}"</strong>
            </div>
          ) : (
            <div className="space-y-0.5">
              {results.map(p => {
                const alreadyPinned = pinnedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => !alreadyPinned && !atLimit && onPin(p.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      alreadyPinned
                        ? 'bg-emerald-50 cursor-default'
                        : atLimit
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-blue-50 active:bg-blue-100 cursor-pointer'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                      {p.category && <p className="text-[11px] text-gray-400 truncate">{p.category}</p>}
                    </div>
                    {alreadyPinned ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-white border border-emerald-200 px-2 py-1 rounded-full">
                        <Icon name="CheckCircle2" size={10} />
                        Fijado
                      </span>
                    ) : (
                      <Icon name="Pin" size={14} className="text-gray-300 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── QuickProductCard ──────────────────────────────────────────────────────────

const QuickProductCard = React.memo(function QuickProductCard({ product, onAdd, onUnpin, fmt }) {
  const src = getImageSrc(product);

  return (
    <div className="relative group">
      <button
        onClick={() => onAdd(product)}
        className="w-full flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white p-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md active:scale-[0.98]"
      >
        {/* Thumbnail */}
        <div className="overflow-hidden rounded-lg aspect-[4/3] w-full bg-gray-50 flex items-center justify-center">
          {src ? (
            <img src={src} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <span className="text-2xl font-black text-gray-200 select-none">
              {(product.name || '?')[0].toUpperCase()}
            </span>
          )}
        </div>
        {/* Info */}
        <div className="px-0.5 pb-0.5">
          <p className="text-[11px] font-bold text-gray-800 leading-tight line-clamp-2 min-h-[26px]">{product.name}</p>
          <p className="text-xs font-black text-blue-600 mt-0.5 truncate">{fmt(product.price || 0)}</p>
        </div>
      </button>

      {/* Unpin button — only on hover */}
      <button
        onClick={e => { e.stopPropagation(); onUnpin(product.id); }}
        title="Quitar de Acceso rápido"
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:border-red-200 hover:text-red-500"
      >
        <Icon name="X" size={9} />
      </button>
    </div>
  );
});

// ─── QuickProductsSection ─────────────────────────────────────────────────────

export function QuickProductsSection({ businessId, allProducts, posProducts, isDesktop, addToCart, fmt }) {
  const limit = isDesktop ? QUICK_LIMIT_DESKTOP : QUICK_LIMIT_OTHER;

  const [pinnedIds,   setPinnedIds]   = useState(() => loadIds(businessId));
  const [showPicker,  setShowPicker]  = useState(false);
  const [toast,       setToast]       = useState(null);
  const toastTimer = useRef(null);

  // Re-sync when businessId changes (e.g. admin switching businesses)
  useEffect(() => {
    setPinnedIds(loadIds(businessId));
  }, [businessId]);

  // Resolve pinned IDs → product objects (silently drops deleted products)
  const pool = useMemo(
    () => (allProducts.length > 0 ? allProducts : posProducts),
    [allProducts, posProducts],
  );

  const pinnedProducts = useMemo(
    () => pinnedIds.map(id => pool.find(p => p.id === id)).filter(Boolean),
    [pinnedIds, pool],
  );

  const atLimit = pinnedIds.length >= limit;

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const handlePin = useCallback((productId) => {
    setPinnedIds(prev => {
      if (prev.includes(productId) || prev.length >= limit) return prev;
      const next = [...prev, productId];
      saveIds(businessId, next);
      return next;
    });
    setShowPicker(false);
    const product = pool.find(p => p.id === productId);
    showToast(product ? `"${product.name}" fijado en Acceso rápido` : 'Producto fijado');
  }, [businessId, limit, pool, showToast]);

  const handleUnpin = useCallback((productId) => {
    setPinnedIds(prev => {
      const next = prev.filter(id => id !== productId);
      saveIds(businessId, next);
      return next;
    });
  }, [businessId]);

  const handleAdd = useCallback((product) => {
    addToCart(product);
  }, [addToCart]);

  return (
    <>
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between min-h-[22px]">
          <div className="flex items-center gap-1.5">
            <Icon name="Pin" size={13} className="text-gray-400" />
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Acceso rápido</span>
            {pinnedProducts.length > 0 && (
              <span className="text-[10px] text-gray-400 font-medium">({pinnedProducts.length}/{limit})</span>
            )}
          </div>
          {atLimit ? (
            <span className="text-[10px] text-amber-600 font-semibold">Límite alcanzado</span>
          ) : (
            <button
              onClick={() => setShowPicker(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Icon name="Plus" size={11} />
              Agregar
            </button>
          )}
        </div>

        {/* Grid de productos fijados */}
        {pinnedProducts.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {pinnedProducts.map(p => (
              <QuickProductCard
                key={p.id}
                product={p}
                onAdd={handleAdd}
                onUnpin={handleUnpin}
                fmt={fmt}
              />
            ))}
            {/* Tarjeta "Agregar" — solo si hay espacio */}
            {!atLimit && (
              <button
                onClick={() => setShowPicker(true)}
                className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 bg-white text-gray-300 hover:border-blue-300 hover:text-blue-400 hover:bg-blue-50 transition-all aspect-[4/3] min-h-[72px]"
              >
                <Icon name="Plus" size={16} />
                <span className="text-[10px] font-semibold">Agregar</span>
              </button>
            )}
          </div>
        ) : (
          /* Empty state */
          <button
            onClick={() => setShowPicker(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 bg-white text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
          >
            <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <Icon name="Pin" size={14} className="text-gray-400" />
            </span>
            <span className="text-sm font-semibold">Fijar productos frecuentes</span>
            <Icon name="Plus" size={14} className="ml-auto shrink-0" />
          </button>
        )}

        {/* Toast de confirmación */}
        {toast && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-700">
            <Icon name="CheckCircle2" size={13} />
            {toast}
          </div>
        )}
      </div>

      {/* Modal de búsqueda/selección */}
      {showPicker && (
        <QuickProductPickerModal
          allProducts={allProducts}
          posProducts={posProducts}
          pinnedIds={pinnedIds}
          limit={limit}
          onPin={handlePin}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
