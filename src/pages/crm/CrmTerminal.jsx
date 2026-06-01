import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { getCrmCustomers, getCrmStockProducts, createPosInvoice } from '../../services/crmService';
import { getEffectivePlanSlug } from '../../services/waBusinessService';
import { CRM_EARLY_ACCESS_MODE } from '../../config/crmConfig';
import CrmThermalTicket from './components/CrmThermalTicket';

const PAYMENT_METHODS = [
  { value: 'efectivo',      label: 'Efectivo',      icon: 'Banknote' },
  { value: 'transferencia', label: 'Transferencia',  icon: 'ArrowLeftRight' },
  { value: 'tarjeta',       label: 'Tarjeta',        icon: 'CreditCard' },
  { value: 'otro',          label: 'Otro',           icon: 'MoreHorizontal' },
];

function fmt(n, currency) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: currency || 'CLP', maximumFractionDigits: 0,
  }).format(n || 0);
}

function getProductImageSrc(product) {
  if (product.thumbnail_url) return product.thumbnail_url;
  if (product.card_image_url) return product.card_image_url;
  if (product.image_url) return product.image_url;
  if (Array.isArray(product.images) && product.images.length > 0) {
    const first = product.images[0];
    return typeof first === 'string' ? first : (first?.url || first?.src || null);
  }
  return null;
}

function ProductThumb({ product }) {
  const src = getProductImageSrc(product);
  if (src) {
    return (
      <img
        src={src}
        alt={product.name}
        className="w-full h-20 object-cover rounded-lg"
        loading="lazy"
      />
    );
  }
  const initial = (product.name || '?')[0].toUpperCase();
  return (
    <div className="w-full h-20 rounded-lg bg-gray-100 flex items-center justify-center text-2xl font-bold text-gray-300 select-none">
      {initial}
    </div>
  );
}

function useSidebarHidden() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('tpv_sidebar_hidden') === 'true'; } catch { return false; }
  });
  const toggle = useCallback(() => {
    setHidden(prev => {
      const next = !prev;
      try { localStorage.setItem('tpv_sidebar_hidden', String(next)); } catch {}
      return next;
    });
  }, []);
  return [hidden, toggle];
}

export default function CrmTerminal() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const isDesktop = useIsDesktop();
  const [sidebarHidden, toggleSidebar] = useSidebarHidden();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const effectivePlan = getEffectivePlanSlug(
    business?.planSlug,
    business?.planExpiresAt,
    business?.trialExpiresAt
  );
  const hasAccess = CRM_EARLY_ACCESS_MODE || effectivePlan === 'business';

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [amountReceived, setAmountReceived] = useState('');

  // Ticket modal state — set after successful (or locally-fallback) sale
  const [ticketData, setTicketData] = useState(null);

  const searchRef = useRef(null);

  useEffect(() => {
    if (!business?.id || !hasAccess) return;
    getCrmStockProducts(business.id).then(({ data }) => setProducts(data || []));
    getCrmCustomers(business.id).then(({ data }) => setCustomers(data || []));
  }, [business?.id, hasAccess]);

  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (activeCategory) list = list.filter(p => p.category === activeCategory);
    if (search.trim()) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    return list.slice(0, 40);
  }, [products, search, activeCategory]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        unit_price: product.price || 0,
        quantity: 1,
      }];
    });
  };

  const updateQty = (product_id, delta) => {
    setCart(prev =>
      prev
        .map(i => i.product_id === product_id ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0)
    );
  };

  const removeItem = (product_id) => {
    setCart(prev => prev.filter(i => i.product_id !== product_id));
  };

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discountAmount = Math.min(parseFloat(discount) || 0, subtotal);
  const total = subtotal - discountAmount;
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const isEfectivo = paymentMethod === 'efectivo';
  const parsedReceived = parseFloat(amountReceived) || 0;
  const change = isEfectivo && parsedReceived > 0 ? parsedReceived - total : 0;
  const isCashShort = isEfectivo && amountReceived !== '' && parsedReceived < total;

  const selectedCustomer = customers.find(c => c.id === customerId) || null;

  const resetForm = () => {
    setCart([]);
    setCustomerId('');
    setDiscount('');
    setPaymentMethod('efectivo');
    setNotes('');
    setSearch('');
    setActiveCategory('');
    setErrorMsg(null);
    setAmountReceived('');
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleRegister = async () => {
    if (cart.length === 0) return;
    setBusy(true);
    setErrorMsg(null);

    const saleSnapshot = {
      items: [...cart],
      customer: selectedCustomer,
      paymentMethod,
      discountAmount,
      subtotal,
      total,
      amountReceived: isEfectivo && parsedReceived > 0 ? parsedReceived : null,
      change: isEfectivo && change > 0 ? change : null,
      notes: notes || null,
      createdAt: new Date().toISOString(),
    };

    const { data, error } = await createPosInvoice(business.id, {
      customerId: customerId || null,
      items: cart,
      discount: discountAmount,
      paymentMethod,
      notes: notes || null,
    });

    setBusy(false);

    if (error) {
      // DB failed — show ticket from local state anyway with a TODO marker
      // TODO: implement dedicated pos_sales table when schema is ready
      console.warn('[TPV] crm_invoices insert failed, showing local ticket:', error.message);
      setTicketData({ sale: null, ...saleSnapshot });
      return;
    }

    setTicketData({ sale: data, ...saleSnapshot });
  };

  const handleCloseTicket = () => {
    setTicketData(null);
  };

  const handleNewSale = () => {
    setTicketData(null);
    resetForm();
  };

  // ── Sidebar layout helpers ──────────────────────────────────────────────────
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';
  const mainMarginLeft = isDesktop && !sidebarHidden ? sidebarWidth : 0;

  const hideMenuBtn = isDesktop && !sidebarHidden ? (
    <button
      onClick={toggleSidebar}
      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        fontFamily: 'var(--font-caption)',
        color: 'var(--color-muted-foreground)',
        borderColor: 'var(--color-border)',
      }}
      title="Ocultar menú lateral"
      aria-label="Ocultar menú lateral"
    >
      <Icon name="PanelLeftClose" size={14} color="currentColor" />
      Ocultar menú
    </button>
  ) : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>

      {/* Sidebar */}
      {!sidebarHidden && (
        <BusinessSidebar
          isCollapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
      )}

      {/* Floating button to reopen sidebar */}
      {sidebarHidden && isDesktop && (
        <button
          onClick={toggleSidebar}
          className="fixed flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium shadow-md hover:bg-muted transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            top: 12, left: 12, zIndex: 40,
            fontFamily: 'var(--font-caption)',
            color: 'var(--color-foreground)',
            borderColor: 'var(--color-border)',
          }}
          title="Mostrar menú lateral"
          aria-label="Mostrar menú lateral"
        >
          <Icon name="PanelLeftOpen" size={14} color="currentColor" />
          Menú
        </button>
      )}

      {/* Main */}
      <main
        className="flex flex-col min-h-screen"
        style={{ marginLeft: mainMarginLeft, transition: 'margin-left var(--transition-base)' }}
      >

        {/* ── PLAN GATE ──────────────────────────────────────────────────────── */}
        {!hasAccess && (
          <>
            <PanelHeader
              title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Terminal de ventas</h1>}
            >
              {hideMenuBtn}
            </PanelHeader>
            <div className="flex flex-col items-center justify-center py-24 gap-4 px-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Icon name="Lock" size={28} className="text-amber-500" />
              </div>
              <p className="text-gray-700 font-semibold text-lg">Disponible en plan Full</p>
              <p className="text-gray-400 text-sm">El Terminal de ventas requiere plan Business/Full.</p>
              <button
                onClick={() => navigate('/planes')}
                className="mt-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm"
              >
                Ver planes
              </button>
            </div>
          </>
        )}

        {/* ── MAIN POS ───────────────────────────────────────────────────────── */}
        {hasAccess && (
          <>
            <PanelHeader
              title={
                <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
                  Terminal de ventas
                </h1>
              }
              subtitle={
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  Registra ventas rápidas desde tu catálogo
                </p>
              }
            >
              {hideMenuBtn}
            </PanelHeader>

            <div className="w-full px-4 py-5 pb-24 sm:px-5 md:px-6 md:py-8 lg:px-8 lg:pb-8">
              <div className="flex flex-col lg:flex-row gap-5 lg:items-start w-full max-w-7xl">

                {/* ── LEFT: search + categories + products ── */}
                <div className="flex-1 min-w-0 flex flex-col gap-3">

                  {/* Error banner */}
                  {errorMsg && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                      <Icon name="AlertCircle" size={16} color="currentColor" className="shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                      <button onClick={() => setErrorMsg(null)} className="ml-auto shrink-0 text-red-400 hover:text-red-600">
                        <Icon name="X" size={14} color="currentColor" />
                      </button>
                    </div>
                  )}

                  {/* Search */}
                  <div className="relative">
                    <Icon name="Search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      ref={searchRef}
                      autoFocus
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar producto por nombre…"
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-white shadow-sm transition-colors"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <Icon name="X" size={15} />
                      </button>
                    )}
                  </div>

                  {/* Category chips */}
                  {categories.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setActiveCategory('')}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          activeCategory === ''
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        Todos
                      </button>
                      {categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setActiveCategory(cat === activeCategory ? '' : cat)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                            activeCategory === cat
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Product grid */}
                  {filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 text-sm">
                      <Icon name="PackageSearch" size={36} className="mx-auto mb-3 text-gray-200" />
                      {search ? `Sin resultados para "${search}"` : 'No hay productos activos'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                      {filtered.map(p => (
                        <button
                          key={p.id}
                          onClick={() => addToCart(p)}
                          className="flex flex-col gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-400 hover:shadow-md transition-all text-left active:scale-95"
                        >
                          <ProductThumb product={p} />
                          <div className="min-w-0">
                            {p.category && (
                              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide truncate mb-0.5">{p.category}</p>
                            )}
                            <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug">{p.name}</p>
                            <p className="text-sm font-bold text-blue-600 mt-1">{fmt(p.price, business?.currency)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── RIGHT: cart + checkout ──
                    3-zone flex column on desktop:
                      Zone 1 (flex-none)              : customer selector
                      Zone 2 (flex-1 min-h-0 overflow): cart items + checkout fields
                      Zone 3 (flex-none)              : totals + cobrar — always visible
                    The column sticks below the 60px header (top-[4.5rem]).
                    Mobile: normal flow; fixed bottom bar handles cobrar.          */}
                <div className="w-full lg:w-72 xl:w-80 shrink-0 lg:sticky lg:top-[4.5rem] lg:flex lg:flex-col lg:h-[calc(100vh-5.5rem)]">

                  {/* ── Zone 1: Customer ───────────────────────────────────── */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4 lg:flex-none">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Cliente</label>
                    <select
                      value={customerId}
                      onChange={e => setCustomerId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    >
                      <option value="">👤 Consumidor final</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.company ? ` — ${c.company}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* ── Zone 2: Cart + checkout fields ─────────────────────
                      Scrolls as a unit on desktop; cobrar in zone 3 stays
                      pinned so it never disappears no matter how many items.
                      On desktop the cart items list has no inner max-h cap —
                      zone 2 handles scroll. Mobile keeps its own max-h cap.  */}
                  <div className="flex flex-col gap-4 mt-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">

                    {/* Cart */}
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon name="ShoppingCart" size={15} className="text-gray-500" />
                          <span className="text-sm font-bold text-gray-700">
                            Carrito
                            {cartCount > 0 && (
                              <span className="ml-1.5 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{cartCount}</span>
                            )}
                          </span>
                        </div>
                        {cart.length > 0 && (
                          <button
                            onClick={resetForm}
                            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
                          >
                            <Icon name="Trash2" size={11} />Vaciar
                          </button>
                        )}
                      </div>

                      {cart.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                          <Icon name="ShoppingCart" size={32} className="mx-auto mb-2 text-gray-200" />
                          <p className="text-gray-400 text-sm">Toca un producto para agregarlo</p>
                        </div>
                      ) : (
                        /* Mobile: inner scroll cap ~6 items.
                           Desktop: no cap — zone 2 outer scroll takes over. */
                        <div className="divide-y divide-gray-100 max-h-52 overflow-y-auto lg:max-h-none lg:overflow-visible">
                          {cart.map(item => (
                            <div key={item.product_id} className="px-3 py-2.5 flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800 truncate leading-snug">{item.name}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">{fmt(item.unit_price, business?.currency)} c/u</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => updateQty(item.product_id, -1)}
                                  title={item.quantity === 1 ? 'Quitar del carrito' : 'Reducir cantidad'}
                                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors text-gray-600"
                                >
                                  {item.quantity === 1
                                    ? <Icon name="Trash2" size={12} color="currentColor" />
                                    : <Icon name="Minus" size={12} color="currentColor" />
                                  }
                                </button>
                                <span className="w-6 text-center text-sm font-bold text-gray-800">{item.quantity}</span>
                                <button
                                  onClick={() => updateQty(item.product_id, 1)}
                                  title="Aumentar cantidad"
                                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors text-gray-600"
                                >
                                  <Icon name="Plus" size={12} color="currentColor" />
                                </button>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-sm font-bold text-gray-900 min-w-[52px] text-right">
                                  {fmt(item.unit_price * item.quantity, business?.currency)}
                                </span>
                                <button
                                  onClick={() => removeItem(item.product_id)}
                                  title="Eliminar producto"
                                  aria-label="Eliminar producto del carrito"
                                  className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors text-red-400 hover:text-red-600"
                                >
                                  <Icon name="Trash2" size={13} color="currentColor" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Discount */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Descuento</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          value={discount}
                          onChange={e => setDiscount(e.target.value)}
                          placeholder="0"
                          className="w-full pl-7 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                        />
                      </div>
                    </div>

                    {/* Payment method */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">Método de pago</label>
                      <div className="grid grid-cols-2 gap-2">
                        {PAYMENT_METHODS.map(m => (
                          <button
                            key={m.value}
                            onClick={() => setPaymentMethod(m.value)}
                            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                              paymentMethod === m.value
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <Icon name={m.icon} size={13} />
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <input
                        type="text"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Notas de la venta (opcional)"
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    {/* Pago recibido + vuelto — solo efectivo */}
                    {isEfectivo && (
                      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                          Pago recibido
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            value={amountReceived}
                            onChange={e => setAmountReceived(e.target.value)}
                            placeholder={String(Math.ceil(total))}
                            className="w-full pl-7 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                          />
                        </div>
                        {amountReceived !== '' && (
                          <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold ${
                            isCashShort
                              ? 'bg-red-50 text-red-600'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            <span>{isCashShort ? 'Faltan' : 'Vuelto'}</span>
                            <span>
                              {isCashShort
                                ? fmt(total - parsedReceived, business?.currency)
                                : fmt(change, business?.currency)
                              }
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                  </div>{/* end zone 2 */}

                  {/* ── Zone 3: Totals + Cobrar ─────────────────────────────
                      Desktop: always visible at the bottom of the sticky col.
                      Mobile: hidden — fixed bottom bar is used instead.       */}
                  <div className="hidden lg:block mt-4 lg:flex-none">
                    <div className="bg-gray-900 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Subtotal</span>
                          <span>{fmt(subtotal, business?.currency)}</span>
                        </div>
                        {discountAmount > 0 && (
                          <div className="flex justify-between text-xs text-red-400">
                            <span>Descuento</span>
                            <span>-{fmt(discountAmount, business?.currency)}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between items-baseline border-t border-gray-700 pt-2">
                        <span className="text-gray-300 text-sm font-semibold">Total</span>
                        <span className="text-3xl font-bold text-white tracking-tight">{fmt(total, business?.currency)}</span>
                      </div>
                      <button
                        onClick={handleRegister}
                        disabled={cart.length === 0 || busy || isCashShort}
                        className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-base transition-colors flex items-center justify-center gap-2 mt-1"
                      >
                        {busy
                          ? <><Icon name="Loader2" size={18} className="animate-spin" />Registrando…</>
                          : <><Icon name="Zap" size={18} />Cobrar</>
                        }
                      </button>
                      {isCashShort && (
                        <p className="text-center text-xs text-red-400">
                          Faltan {fmt(total - parsedReceived, business?.currency)} para completar el pago
                        </p>
                      )}
                    </div>
                  </div>

                </div>{/* end right column */}
              </div>{/* end flex row */}
            </div>{/* end outer padding container */}

            {/* ── Mobile sticky bottom bar ────────────────────────────────────
                Fixed at viewport bottom on small screens (lg:hidden).
                pb-24 on the outer container prevents content overlap.          */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-gray-800 shadow-2xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {discountAmount > 0 && (
                  <p className="text-[10px] text-gray-500 line-through leading-none mb-0.5">
                    {fmt(subtotal, business?.currency)}
                  </p>
                )}
                <p className="text-lg font-bold text-white leading-tight">{fmt(total, business?.currency)}</p>
                {isCashShort && (
                  <p className="text-[10px] text-red-400 mt-0.5">
                    Faltan {fmt(total - parsedReceived, business?.currency)}
                  </p>
                )}
              </div>
              <button
                onClick={handleRegister}
                disabled={cart.length === 0 || busy || isCashShort}
                className="shrink-0 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm transition-colors flex items-center gap-2"
              >
                {busy
                  ? <><Icon name="Loader2" size={16} className="animate-spin" />Procesando…</>
                  : <><Icon name="Zap" size={16} />Cobrar</>
                }
              </button>
            </div>

          </>
        )}

      </main>

      {/* Thermal ticket modal — rendered outside main flow to avoid layout issues */}
      {ticketData && (
        <CrmThermalTicket
          business={business}
          sale={ticketData.sale}
          items={ticketData.items}
          customer={ticketData.customer}
          paymentMethod={ticketData.paymentMethod}
          discountAmount={ticketData.discountAmount}
          subtotal={ticketData.subtotal}
          total={ticketData.total}
          amountReceived={ticketData.amountReceived}
          change={ticketData.change}
          notes={ticketData.notes}
          createdAt={ticketData.createdAt}
          onNewSale={handleNewSale}
          onClose={handleCloseTicket}
        />
      )}

    </div>
  );
}
