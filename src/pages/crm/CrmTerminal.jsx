import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useIsDesktop } from 'hooks/useMediaQuery';
import { getCrmCustomers, getPosProducts, getAllActiveProducts, createPosInvoice, getOpenCashSession, createCrmCustomer } from '../../services/crmService';
import { getEffectivePlanSlug } from '../../services/waBusinessService';
import { canUseFeature } from '../../config/planFeatures';
import CrmThermalTicket from './components/CrmThermalTicket';
import { QuickCustomerModal } from './components/QuickCustomerModal';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import { formatMoney, fmtMoneyInput, parseMoneyInput } from '../../utils/formatMoney';

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Efectivo',      icon: 'Banknote' },
  { value: 'bank_transfer', label: 'Transferencia', icon: 'ArrowLeftRight' },
  { value: 'card',          label: 'Tarjeta',       icon: 'CreditCard' },
  { value: 'check',         label: 'Cheque',        icon: 'BadgeCheck' },
  { value: 'other',         label: 'Otro',          icon: 'MoreHorizontal' },
  { value: 'credit',        label: 'Cta. cte.',     icon: 'BookUser' },
];

const REAL_PAYMENT_METHODS = PAYMENT_METHODS.filter((method) => method.value !== 'credit');

const fmt = (n, currency) => formatMoney(n, currency);

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
        className="aspect-[5/4] w-full object-cover rounded-xl"
        loading="lazy"
      />
    );
  }
  const initial = (product.name || '?')[0].toUpperCase();
  return (
    <div className="aspect-[5/4] w-full rounded-xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center text-3xl font-black text-gray-300 select-none">
      {initial}
    </div>
  );
}

function ManualItemModal({ onAdd, onClose, currency }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { setErr('Ingresa un nombre para el artículo.'); return; }
    const parsedPrice = parseMoneyInput(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) { setErr('Precio inválido.'); return; }
    const parsedQty = Math.max(1, Math.round(+qty) || 1);
    onAdd({ name: trimmedName, unit_price: parsedPrice, quantity: parsedQty, note: note.trim() || null });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex justify-between items-center px-5 py-4 border-b">
          <h2 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <Icon name="PenLine" size={16} className="text-purple-500" />
            Artículo manual
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <Icon name="X" size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Servicio técnico, Traslado, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Precio unitario *</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={fmtMoneyInput(price)}
                  onChange={e => setPrice(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full pl-6 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
              <input
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={e => setQty(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nota (opcional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Descripción adicional…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">
              Cancelar
            </button>
            <button type="submit" className="flex-1 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">
              Agregar al carrito
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ── ErrorBoundary específico del TPV ─────────────────────────────────────────
// Clase separada de ErrorBoundary.jsx para mostrar "Recargar terminal"
// en lugar de redirigir al inicio, preservando el contexto de caja.
class CrmTerminalBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) {
    console.error('[CrmTerminal] error capturado por boundary:', error, info?.componentStack?.slice(0, 300));
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="text-center p-8 max-w-sm">
          <div className="text-5xl mb-4" role="img" aria-label="Error">⚠️</div>
          <h2 className="text-xl font-semibold text-neutral-800 mb-2">El terminal encontró un problema</h2>
          <p className="text-neutral-500 text-sm mb-6">
            No se perdió ninguna venta. Recarga para continuar.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-5 rounded-lg transition-colors"
          >
            Recargar terminal
          </button>
        </div>
      </div>
    );
  }
}

function CrmTerminalUI() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const isDesktop = useIsDesktop();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const effectivePlan = getEffectivePlanSlug(
    business?.planSlug,
    business?.planExpiresAt,
    business?.trialExpiresAt
  );
  const hasAccess = canUseFeature(effectivePlan, 'pos');

  // posProducts: solo show_in_pos=true — se muestran en la grilla sin búsqueda
  // allProducts: todos los activos — se cargan en background para búsqueda global
  const [posProducts, setPosProducts]   = useState([]);
  const [allProducts, setAllProducts]   = useState([]);
  const [posLoading,  setPosLoading]    = useState(true);
  const [posFallback, setPosFallback]   = useState(false); // true si migración pos no aplicada
  const [diagVisible, setDiagVisible]   = useState(false);
  const allProductsRef = useRef([]);    // ref para findExactProduct sin re-render
  const customers = useRef([]);
  const [customersDisplay, setCustomersDisplay] = useState([]);
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('');
  const [payments, setPayments] = useState([{ id: 'payment_1', method: 'cash', amount: '' }]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [payMode, setPayMode] = useState(false);
  const [lastAddedKey, setLastAddedKey] = useState(null);
  const cartListRef = useRef(null);

  // Ticket modal state — set after successful (or locally-fallback) sale
  const [ticketData, setTicketData] = useState(null);

  const searchRef = useRef(null);
  const printedTicketRef = useRef(null);

  const printTicketOnce = useCallback((ticketId) => {
    if (!ticketId) return;
    if (printedTicketRef.current === ticketId) return;
    printedTicketRef.current = ticketId;
    window.print();
  }, []);

  useEffect(() => {
    if (!ticketData) return;
    const ticketId = ticketData.sale?.id ?? ticketData.sale?.invoice_number;
    printTicketOnce(String(ticketId));
  }, [ticketData, printTicketOnce]);

  // Debounce search → debouncedSearch
  useEffect(() => {
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 260);
    return () => clearTimeout(searchDebounceRef.current);
  }, [search]);

  useEffect(() => {
    if (!business?.id || !hasAccess) return;

    // Carga rápida: solo productos visibles en TPV
    getPosProducts(business.id).then((result) => {
      const list = result.data || [];
      const fallback = !!result._fallback;
      console.log('[TPV-diag] getPosProducts →', {
        total: list.length,
        fallback,
        sample: list.slice(0, 3).map(p => ({ id: p.id, name: p.name, show_in_pos: p.show_in_pos })),
      });
      setPosProducts(list);
      setPosFallback(fallback);
      setPosLoading(false);
    });

    // Carga en background: todos los activos para búsqueda global
    getAllActiveProducts(business.id).then(({ data, error }) => {
      const list = data || [];
      console.log('[TPV-diag] getAllActiveProducts →', {
        total: list.length,
        error: error?.message ?? null,
        sample: list.slice(0, 3).map(p => ({ id: p.id, name: p.name })),
      });
      setAllProducts(list);
      allProductsRef.current = list;
    });

    getCrmCustomers(business.id).then(({ data }) => {
      customers.current = data || [];
      setCustomersDisplay(data || []);
    });
  }, [business?.id, hasAccess]);

  const handleCreateCustomer = async (fields) => {
    const { data, error } = await createCrmCustomer(business.id, fields);
    if (error) return { error };
    customers.current = [data, ...customers.current];
    setCustomersDisplay([data, ...customersDisplay]);
    setCustomerId(data.id);
    setShowNewCustomer(false);
    return { data };
  };

  const categories = useMemo(() => {
    const cats = [...new Set(posProducts.map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [posProducts]);

  // Sin búsqueda: grilla de productos TPV (show_in_pos), filtrada por categoría.
  // Con búsqueda: resultados de todos los productos activos.
  const isSearching = debouncedSearch.trim().length > 0;

  // Normaliza texto para búsqueda: minúsculas + sin acentos
  const normalize = (s) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const filtered = useMemo(() => {
    if (isSearching) {
      const q = normalize(debouncedSearch);
      // Si no hay productos en allProducts todavía, buscamos en posProducts como fallback
      const pool = allProducts.length > 0 ? allProducts : posProducts;
      const results = pool.filter(p =>
        normalize(p.name).includes(q) ||
        (p.public_code && normalize(p.public_code).includes(q)) ||
        (p.sku         && normalize(p.sku).includes(q)) ||
        (p.barcode     && normalize(p.barcode).includes(q)) ||
        (p.category    && normalize(p.category).includes(q))
      ).slice(0, 50);
      console.log(`[TPV-diag] search "${debouncedSearch}" → pool=${pool.length} results=${results.length}`);
      return results;
    }
    let list = posProducts;
    if (activeCategory) list = list.filter(p => p.category === activeCategory);
    return list.slice(0, 40);
  }, [posProducts, allProducts, debouncedSearch, isSearching, activeCategory]);

  // Busca coincidencia exacta de barcode/sku/public_code para lector de código de barras.
  // Siempre busca en TODOS los productos activos para no perder productos no visibles en grilla.
  const findExactProduct = useCallback((code) => {
    const c = code.trim().toLowerCase();
    if (!c) return null;
    const pool = allProductsRef.current.length > 0 ? allProductsRef.current : posProducts;
    return (
      pool.find(p => p.barcode     && p.barcode.toLowerCase()     === c) ||
      pool.find(p => p.sku         && p.sku.toLowerCase()         === c) ||
      pool.find(p => p.public_code && p.public_code.toLowerCase() === c) ||
      null
    );
  }, [posProducts]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i._key === product.id);
      if (existing) {
        setLastAddedKey(product.id);
        return prev.map(i => i._key === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      setLastAddedKey(product.id);
      return [...prev, {
        _key: product.id,
        product_id: product.id,
        name: product.name,
        unit_price: product.price || 0,
        quantity: 1,
      }];
    });
  };

  const addManualItem = ({ name, unit_price, quantity, note }) => {
    const _key = `manual_${Date.now()}`;
    setLastAddedKey(_key);
    setCart(prev => [...prev, { _key, product_id: null, name, unit_price, quantity, note: note || null }]);
  };

  useEffect(() => {
    if (!lastAddedKey) return;
    const el = cartListRef.current?.querySelector(`[data-key="${lastAddedKey}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t = setTimeout(() => setLastAddedKey(null), 900);
    return () => clearTimeout(t);
  }, [lastAddedKey]);

  const updateQty = (_key, delta) => {
    setCart(prev =>
      prev
        .map(i => i._key === _key ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0)
    );
  };

  const removeItem = (_key) => {
    setCart(prev => prev.filter(i => i._key !== _key));
  };

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discountAmount = Math.min(parseMoneyInput(discount), subtotal);
  const total = subtotal - discountAmount;
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const selectedCustomer = customersDisplay.find(c => c.id === customerId) || null;
  const parsedPayments = payments
    .map((payment) => ({
      ...payment,
      amountNumber: parseMoneyInput(payment.amount),
    }))
    .filter((payment) => payment.amountNumber > 0);
  const nonCashTotal = parsedPayments
    .filter((payment) => payment.method !== 'cash')
    .reduce((sum, payment) => sum + payment.amountNumber, 0);
  const cashTendered = parsedPayments
    .filter((payment) => payment.method === 'cash')
    .reduce((sum, payment) => sum + payment.amountNumber, 0);
  const cashApplied = Math.min(cashTendered, Math.max(0, total - nonCashTotal));
  const paidTotal = Math.min(total, nonCashTotal + cashApplied);
  const pendingBalance = Math.max(0, total - paidTotal);
  const change = Math.max(0, cashTendered - cashApplied);
  const hasNonCashOverpay = nonCashTotal > total;
  const requiresCustomerForPending = pendingBalance > 0;
  const isPaymentInvalid = hasNonCashOverpay || (requiresCustomerForPending && !customerId);
  const paymentStatusLabel = pendingBalance <= 0 ? 'Pagada' : paidTotal > 0 ? 'Parcial' : 'Pendiente';
  const appliedPayments = parsedPayments
    .reduce((acc, payment) => {
      if (payment.method !== 'cash') {
        acc.push({ method: payment.method, amount: payment.amountNumber });
        return acc;
      }
      const alreadyApplied = acc
        .filter((entry) => entry.method === 'cash')
        .reduce((sum, entry) => sum + entry.amount, 0);
      const remainingCash = Math.max(0, cashApplied - alreadyApplied);
      const amount = Math.min(payment.amountNumber, remainingCash);
      if (amount > 0) acc.push({ method: 'cash', amount });
      return acc;
    }, [])
    .map((payment) => ({ ...payment, amount: +payment.amount.toFixed(2) }));

  const resetForm = () => {
    setCart([]);
    setCustomerId('');
    setDiscount('');
    setPayments([{ id: `payment_${Date.now()}`, method: 'cash', amount: '' }]);
    setNotes('');
    setSearch('');
    setActiveCategory('');
    setErrorMsg(null);
    setPayMode(false);
    setLastAddedKey(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const updatePayment = (id, updates) => {
    setPayments((prev) => prev.map((payment) => (
      payment.id === id ? { ...payment, ...updates } : payment
    )));
  };

  const addPayment = () => {
    setPayments((prev) => [
      ...prev,
      { id: `payment_${Date.now()}_${prev.length}`, method: 'card', amount: '' },
    ]);
  };

  const removePayment = (id) => {
    setPayments((prev) => {
      const next = prev.filter((payment) => payment.id !== id);
      return next.length > 0 ? next : [{ id: `payment_${Date.now()}`, method: 'cash', amount: '' }];
    });
  };

  const handleRegister = async () => {
    if (cart.length === 0) return;
    setBusy(true);
    setErrorMsg(null);

    if (hasNonCashOverpay) {
      setBusy(false);
      setErrorMsg('Solo el efectivo puede generar vuelto.');
      return;
    }

    // El saldo pendiente pasa a cuenta corriente y requiere cliente registrado.
    if (requiresCustomerForPending && !customerId) {
      setBusy(false);
      setErrorMsg('CREDIT_NO_CUSTOMER');
      return;
    }

    // Guard: real payments require open cash session. Pure current account does not touch caja.
    if (appliedPayments.length > 0) {
      const { data: openSession } = await getOpenCashSession(business.id);
      if (!openSession) {
        setBusy(false);
        setErrorMsg('NO_OPEN_CASH');
        return;
      }
    }

    const saleSnapshot = {
      items: [...cart],
      customer: selectedCustomer,
      paymentMethod: pendingBalance > 0 ? 'credit' : (appliedPayments[0]?.method || 'credit'),
      payments: appliedPayments,
      discountAmount,
      subtotal,
      total,
      amountReceived: cashTendered > 0 ? cashTendered : null,
      change: change > 0 ? change : null,
      initialPaymentAmount: pendingBalance > 0 && paidTotal > 0 ? paidTotal : null,
      initialPaymentMethod: pendingBalance > 0 ? (appliedPayments[0]?.method || null) : null,
      pendingBalance,
      paymentStatus: paymentStatusLabel,
      notes: notes || null,
      createdAt: new Date().toISOString(),
    };

    const { data, error } = await createPosInvoice(business.id, {
      customerId: customerId || null,
      items: cart,
      discount: discountAmount,
      paymentMethod: pendingBalance > 0 ? 'credit' : (appliedPayments[0]?.method || 'credit'),
      notes: notes || null,
      currency: business?.currency || 'CLP',
      payments: appliedPayments,
    });

    setBusy(false);

    if (error) {
      setErrorMsg(error.message || 'No se pudo registrar el pago de la venta.');
      return;
    }

    setTicketData({ sale: data, ...saleSnapshot });
  };

  const handleCloseTicket = () => {
    setTicketData(null);
  };

  const handleReprint = useCallback(() => {
    window.print();
  }, []);

  const handleNewSale = () => {
    setTicketData(null);
    resetForm();
  };

  // ── Sidebar layout helpers ──────────────────────────────────────────────────
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';
  const mainMarginLeft = isDesktop ? sidebarWidth : 0;

  const collapseMenuBtn = isDesktop ? (
    <button
      onClick={() => setSidebarCollapsed(prev => !prev)}
      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        fontFamily: 'var(--font-caption)',
        color: 'var(--color-muted-foreground)',
        borderColor: 'var(--color-border)',
      }}
      title={sidebarCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
      aria-label={sidebarCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
    >
      <Icon name={sidebarCollapsed ? 'PanelLeftOpen' : 'PanelLeftClose'} size={14} color="currentColor" />
      {sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
    </button>
  ) : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>

      {/* Sidebar — siempre visible en desktop, solo colapsable */}
      <BusinessSidebar
        isCollapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      {/* Main */}
      <main
        className="flex flex-col min-h-screen"
        style={{ marginLeft: mainMarginLeft, transition: 'margin-left var(--transition-base)' }}
      >

        {/* ── PLAN GATE ──────────────────────────────────────────────────────── */}
        {!hasAccess && (
          <>
            <PanelHeader
              title={<><CrmBreadcrumb section="Terminal TPV" /><h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Terminal de ventas</h1></>}
            >
              {collapseMenuBtn}
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
                <div className="min-w-0">
                  <CrmBreadcrumb section="Terminal TPV" />
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-black tracking-tight text-gray-950 sm:text-2xl" style={{ fontFamily: 'var(--font-heading)' }}>Terminal de ventas</h1>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      TPV activo
                    </span>
                  </div>
                </div>
              }
              subtitle={
                <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  Registra ventas rápidas desde tu catálogo
                </p>
              }
            >
              {collapseMenuBtn}
            </PanelHeader>

            <div className="w-full px-4 py-4 pb-24 sm:px-5 md:px-6 lg:px-8 lg:pb-8">
              <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,65fr)_minmax(340px,35fr)] lg:items-start xl:gap-5">

                {/* ── LEFT: search + categories + products ── */}
                <div className="min-w-0 flex flex-col gap-2.5">

                  {/* ── Panel de diagnóstico — solo en entorno de desarrollo ── */}
                  {import.meta.env.DEV && diagVisible && (
                    <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-xs font-mono space-y-1.5">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon name="Bug" size={13} color="#7c3aed" />
                        <span className="font-bold text-purple-800 text-[11px] not-italic" style={{ fontFamily: 'var(--font-caption)' }}>Diagnóstico TPV</span>
                        {posFallback && (
                          <span className="ml-auto text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                            ⚠️ Migración POS no aplicada — modo fallback
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-purple-700">
                        <span>Productos activos (total):</span>
                        <strong>{allProducts.length}</strong>
                        <span>Productos visibles TPV:</span>
                        <strong>{posProducts.length}{posFallback ? ' (todos — sin filtro show_in_pos)' : ''}</strong>
                        <span>Resultados búsqueda actual:</span>
                        <strong>{isSearching ? filtered.length : '—  (sin búsqueda activa)'}</strong>
                        <span>Búsqueda activa:</span>
                        <strong>{debouncedSearch || '(vacía)'}</strong>
                        <span>Pool de búsqueda:</span>
                        <strong>{allProducts.length > 0 ? `allProducts (${allProducts.length})` : `posProducts fallback (${posProducts.length})`}</strong>
                      </div>
                      {allProducts.length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-purple-600 hover:text-purple-800">Ver primeros 5 productos</summary>
                          <ul className="mt-1 space-y-0.5 pl-2 border-l-2 border-purple-200">
                            {allProducts.slice(0, 5).map(p => (
                              <li key={p.id} className="text-purple-700">
                                <strong>{p.name}</strong>
                                {' · '}sku:{p.sku || '—'}{' · '}code:{p.public_code || '—'}{' · '}show_in_pos:{String(p.show_in_pos ?? '(no field)')}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}

                  {/* Error banner */}
                  {errorMsg === 'NO_OPEN_CASH' ? (
                    <div className="flex flex-col gap-2 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
                      <div className="flex items-start gap-2">
                        <Icon name="AlertTriangle" size={16} color="currentColor" className="shrink-0 mt-0.5" />
                        <span className="font-semibold">Debes abrir caja antes de registrar una venta.</span>
                        <button onClick={() => setErrorMsg(null)} className="ml-auto shrink-0 text-amber-400 hover:text-amber-600">
                          <Icon name="X" size={14} color="currentColor" />
                        </button>
                      </div>
                      <button
                        onClick={() => navigate('/crm/caja')}
                        className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors"
                      >
                        <Icon name="Landmark" size={13} color="currentColor" />
                        Ir a Caja diaria
                      </button>
                    </div>
                  ) : errorMsg === 'CREDIT_NO_CUSTOMER' ? (
                    <div className="flex flex-col gap-2 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
                      <div className="flex items-start gap-2">
                        <Icon name="AlertTriangle" size={16} color="currentColor" className="shrink-0 mt-0.5" />
                        <span className="font-semibold">Las ventas en cuenta corriente requieren un cliente registrado.</span>
                        <button onClick={() => setErrorMsg(null)} className="ml-auto shrink-0 text-amber-400 hover:text-amber-600">
                          <Icon name="X" size={14} color="currentColor" />
                        </button>
                      </div>
                    </div>
                  ) : errorMsg ? (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                      <Icon name="AlertCircle" size={16} color="currentColor" className="shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                      <button onClick={() => setErrorMsg(null)} className="ml-auto shrink-0 text-red-400 hover:text-red-600">
                        <Icon name="X" size={14} color="currentColor" />
                      </button>
                    </div>
                  ) : null}

                  {/* Search */}
                  <div className="relative rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
                    <Icon name="Search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      ref={searchRef}
                      autoFocus
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      onKeyDown={e => {
                        if (e.key !== 'Enter') return;
                        const exact = findExactProduct(search);
                        if (exact) {
                          addToCart(exact);
                          setSearch('');
                          e.preventDefault();
                        } else if (filtered.length === 1) {
                          addToCart(filtered[0]);
                          setSearch('');
                          e.preventDefault();
                        }
                      }}
                      placeholder="Buscar por nombre, SKU o código de barras…"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-gray-50 focus:bg-white transition-colors"
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

                  <div className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <div className="flex min-w-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-2">
                      <Icon name="UserRound" size={14} className="text-gray-400" />
                      <select
                        value={customerId}
                        onChange={e => setCustomerId(e.target.value)}
                        className="min-w-0 flex-1 bg-transparent py-2.5 text-xs font-semibold text-gray-700 focus:outline-none"
                      >
                        <option value="">Consumidor final</option>
                        {customersDisplay.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}{c.company ? ` - ${c.company}` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomer(true)}
                        title="Nuevo cliente"
                        className="rounded-lg p-1 text-blue-600 hover:bg-blue-50"
                      >
                        <Icon name="UserPlus" size={14} />
                      </button>
                    </div>
                    <button
                      onClick={() => setShowManualModal(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5 text-xs font-bold text-purple-700 transition-colors hover:bg-purple-100"
                    >
                      <Icon name="PenLine" size={14} />
                      Manual
                    </button>
                    <button
                      onClick={() => setSearch('')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      <Icon name="Eraser" size={14} />
                      Limpiar
                    </button>
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

                  {/* Manual item button */}
                  <button
                    onClick={() => setShowManualModal(true)}
                    className="hidden"
                  >
                    <Icon name="PenLine" size={14} />
                    Artículo manual
                  </button>

                  {/* Indicador de modo búsqueda */}
                  {isSearching && (
                    <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
                      <Icon name="Search" size={12} />
                      <span>Buscando en todos los productos activos</span>
                      <button onClick={() => setSearch('')} className="ml-auto text-blue-400 hover:text-blue-600">
                        <Icon name="X" size={12} />
                      </button>
                    </div>
                  )}

                  {/* Product grid */}
                  {posLoading && !isSearching ? (
                    <div className="text-center py-16 text-gray-300 text-sm">
                      <Icon name="Loader2" size={28} className="mx-auto mb-2 animate-spin" />
                      Cargando productos…
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="text-center py-14 text-gray-400 text-sm">
                      <Icon name="PackageSearch" size={36} className="mx-auto mb-3 text-gray-200" />
                      {isSearching
                        ? `Sin resultados para "${debouncedSearch}"`
                        : posProducts.length === 0
                          ? (
                            <div className="flex flex-col items-center gap-3 py-4">
                              <Icon name="ShoppingBag" size={44} className="text-gray-200" />
                              <div className="space-y-1 text-center">
                                <p className="font-semibold text-gray-700 text-base">No tienes productos visibles en el TPV</p>
                                {allProducts.length > 0 ? (
                                  <p className="text-sm text-gray-400">
                                    Tienes <strong className="text-gray-600">{allProducts.length} producto{allProducts.length !== 1 ? 's' : ''}</strong> registrado{allProducts.length !== 1 ? 's' : ''}, pero ninguno está marcado para venderse desde el Terminal de Ventas.
                                  </p>
                                ) : (
                                  <p className="text-sm text-gray-400">Agrega productos a tu catálogo para poder venderlos desde aquí.</p>
                                )}
                              </div>
                              {allProducts.length > 0 && (
                                <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
                                  <span>Productos cargados:</span>
                                  <strong className="text-gray-700">{allProducts.length}</strong>
                                  <span className="mx-1 text-gray-300">·</span>
                                  <span>Visibles en TPV:</span>
                                  <strong className="text-gray-700">0</strong>
                                </div>
                              )}
                              <button
                                onClick={() => navigate('/product-management')}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                              >
                                <Icon name="Package" size={15} />
                                {allProducts.length > 0 ? 'Configurar productos para TPV' : 'Ir a productos'}
                              </button>
                              <p className="text-[11px] text-gray-400 text-center max-w-xs">
                                Abre el editor de cada producto y activa la opción <strong>"Visible en TPV"</strong> para que aparezca aquí.
                              </p>
                            </div>
                          )
                          : 'Sin productos en esta categoría'
                      }
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {filtered.map(p => (
                        <button
                          key={p.id}
                          onClick={() => addToCart(p)}
                          className="group flex flex-col gap-2.5 rounded-2xl border border-gray-200 bg-white p-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg active:scale-[0.98]"
                        >
                          <ProductThumb product={p} />
                          <div className="min-w-0 px-1 pb-1">
                            {p.category && (
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide truncate mb-1">{p.category}</p>
                            )}
                            <p className="min-h-[32px] text-sm font-bold text-gray-900 line-clamp-2 leading-snug group-hover:text-blue-700">{p.name}</p>
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              <p className="truncate text-base font-black text-blue-600">{fmt(p.price, business?.currency)}</p>
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                                <Icon name="Plus" size={15} />
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── RIGHT: cart + checkout ──────────────────────────────────
                    Desktop 3-zone flex column (lg:flex lg:flex-col):
                      Zone 1 lg:flex-none        — customer selector
                      Zone 2 lg:flex-1 lg:min-h-0 — cart card; items scroll inside
                      Zone 3 lg:flex-none        — compact checkout controls +
                                                   totals + cobrar (always visible)

                    Key: cart card is a DIRECT flex-1 child of the column.
                    Checkout controls are flex-none BELOW the cart so they
                    never compress it. Compacted to ~280px leaving ~200px+
                    for the cart on 768px screens.

                    Mobile: normal flow; fixed bottom bar handles cobrar.        */}
                <div className="w-full min-w-0 lg:sticky lg:top-4 lg:flex lg:h-[calc(100vh-5rem)] lg:flex-col">

                  {/* ── Zone 1: Customer ── flex-none ─────────────────────── */}
                  <div className="rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm lg:flex-none">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">Total venta</p>
                        <p className="mt-1 truncate text-2xl font-black tracking-tight text-gray-950 xl:text-3xl">{fmt(total, business?.currency)}</p>
                      </div>
                      {payMode ? (
                        <button
                          onClick={() => setPayMode(false)}
                          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-100"
                        >
                          <Icon name="ChevronLeft" size={13} />
                          Editar
                        </button>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black text-gray-600">
                          {cartCount} art.
                        </span>
                      )}
                    </div>
                    {payMode && (
                    <div className="mt-3 grid grid-cols-3 gap-1.5">
                      <div className="rounded-xl bg-gray-50 px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase text-gray-400">Items</p>
                        <p className="text-lg font-black text-gray-900">{cartCount}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50 px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase text-emerald-600">Pagado</p>
                        <p className="truncate text-xs font-black text-emerald-800 xl:text-sm">{fmt(paidTotal, business?.currency)}</p>
                      </div>
                      <div className="rounded-xl bg-amber-50 px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase text-amber-600">Pendiente</p>
                        <p className="truncate text-xs font-black text-amber-800 xl:text-sm">{fmt(pendingBalance, business?.currency)}</p>
                      </div>
                    </div>
                    )}
                  </div>

                  <div className={payMode ? 'mt-2.5 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm lg:flex-none' : 'hidden'}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide">Cliente</label>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomer(true)}
                        className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600 hover:bg-blue-100"
                      >
                        <Icon name="UserPlus" size={11} />
                        Nuevo cliente
                      </button>
                    </div>
                    <select
                      value={customerId}
                      onChange={e => setCustomerId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                    >
                      <option value="">👤 Consumidor final</option>
                      {customersDisplay.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.company ? ` — ${c.company}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* ── Zone 2: Cart card ── flex-1 min-h-0 ──────────────────
                      On desktop this is a flex column:
                        header  → flex-none
                        items   → flex-1 min-h-0 overflow-y-auto
                      This is the key change: cart fills ALL available middle
                      space regardless of how many items are in it.             */}
                  {!payMode && (
                  <div className="mt-2.5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm
                                  lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">

                    {/* Cart header — flex-none */}
                    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3 lg:flex-none">
                      <div className="flex items-center gap-2">
                        <Icon name="ShoppingCart" size={14} className="text-gray-500" />
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

                    {/* Cart items — flex-1 min-h-0 overflow-y-auto on desktop;
                        max-h cap on mobile so the page doesn't get too long.   */}
                    {cart.length === 0 ? (
                      <div className="px-4 py-10 text-center lg:flex-1 lg:flex lg:flex-col lg:items-center lg:justify-center">
                        <Icon name="ShoppingCart" size={32} className="mx-auto mb-2 text-gray-200" />
                        <p className="text-gray-400 text-sm">Toca un producto para agregarlo</p>
                      </div>
                    ) : (
                      <div
                        ref={cartListRef}
                        className="divide-y divide-gray-100 max-h-52 overflow-y-auto
                                      lg:flex-1 lg:min-h-0 lg:max-h-none lg:overflow-y-auto">
                        {cart.map(item => (
                          <div
                            key={item._key}
                            data-key={item._key}
                            className={`px-3 py-2.5 flex items-center gap-2 transition-colors duration-700 ${lastAddedKey === item._key ? 'bg-emerald-50' : ''}`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-800 truncate leading-snug flex items-center gap-1">
                                {item.product_id == null && <span className="text-[9px] bg-purple-100 text-purple-600 px-1 py-0.5 rounded font-bold shrink-0">M</span>}
                                {lastAddedKey === item._key && <Icon name="Check" size={11} className="text-emerald-500 shrink-0" />}
                                {item.name}
                              </p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{fmt(item.unit_price, business?.currency)} c/u</p>
                              {item.note && <p className="text-[10px] text-gray-400 italic truncate">{item.note}</p>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => updateQty(item._key, -1)}
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
                                onClick={() => updateQty(item._key, 1)}
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
                                onClick={() => removeItem(item._key)}
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
                  )}

                  {/* ── Zone 3: Checkout controls ── flex-none ───────────────
                      Compacted to ~280px so the cart gets 200px+ on 768px.
                      Discount + Notes in one row. Payment as 4-button row.
                      Desktop totals+cobrar block is hidden on mobile.          */}
                  <div className="flex flex-col gap-2 mt-2.5 lg:flex-none lg:shrink-0">

                    {/* Discount + Notes — single compact row */}
                    {!payMode && (
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={fmtMoneyInput(discount)}
                          onChange={e => setDiscount(e.target.value.replace(/\D/g, ''))}
                          placeholder="Descuento"
                          className="w-full pl-6 pr-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <input
                        type="text"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Notas..."
                        className="flex-1 px-2.5 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    )}

                    {/* Payment method — 4 buttons in one row */}
                    {payMode && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-2.5 space-y-2 lg:max-h-[42vh] lg:overflow-y-auto">
                      {/* Atajo: Venta a crédito */}
                      <button
                        type="button"
                        onClick={() => setPayments(prev => prev.map(p => ({ ...p, amount: '' })))}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
                      >
                        <span className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                          <Icon name="BookUser" size={14} className="text-amber-600" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-amber-800 leading-tight">Vender a cuenta corriente</span>
                          <span className="block text-[10px] text-amber-600 leading-tight mt-0.5">Deja el total como pendiente · requiere cliente registrado</span>
                        </span>
                      </button>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-800">Pagos</p>
                          <p className="text-[11px] text-gray-500">Total: {fmt(total, business?.currency)}</p>
                        </div>
                        <button
                          onClick={addPayment}
                          className="h-8 px-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1"
                        >
                          <Icon name="Plus" size={13} />
                          Agregar
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {payments.map((payment) => (
                          <div key={payment.id} className="flex items-center gap-1.5">
                            <select
                              value={payment.method}
                              onChange={(e) => updatePayment(payment.id, { method: e.target.value })}
                              className="w-[116px] border border-gray-200 rounded-lg px-2 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {REAL_PAYMENT_METHODS.map((method) => (
                                <option key={method.value} value={method.value}>{method.label}</option>
                              ))}
                            </select>
                            <div className="relative flex-1 min-w-0">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">$</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={fmtMoneyInput(payment.amount)}
                                onChange={(e) => updatePayment(payment.id, { amount: e.target.value.replace(/\D/g, '') })}
                                placeholder="Monto"
                                className="w-full pl-5 pr-2 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                              />
                            </div>
                            <button
                              onClick={() => removePayment(payment.id)}
                              title="Eliminar pago"
                              aria-label="Eliminar pago"
                              className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500"
                            >
                              <Icon name="Trash2" size={13} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        <div className="rounded-lg bg-emerald-50 px-2 py-1.5">
                          <p className="text-[10px] text-emerald-700 font-semibold">Pagado</p>
                          <p className="text-xs font-bold text-emerald-800">{fmt(paidTotal, business?.currency)}</p>
                        </div>
                        <div className={`rounded-lg px-2 py-1.5 ${pendingBalance > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                          <p className={`text-[10px] font-semibold ${pendingBalance > 0 ? 'text-amber-700' : 'text-gray-500'}`}>Pendiente</p>
                          <p className={`text-xs font-bold ${pendingBalance > 0 ? 'text-amber-800' : 'text-gray-700'}`}>{fmt(pendingBalance, business?.currency)}</p>
                        </div>
                        <div className={`rounded-lg px-2 py-1.5 ${change > 0 ? 'bg-blue-50' : 'bg-gray-50'}`}>
                          <p className={`text-[10px] font-semibold ${change > 0 ? 'text-blue-700' : 'text-gray-500'}`}>Vuelto</p>
                          <p className={`text-xs font-bold ${change > 0 ? 'text-blue-800' : 'text-gray-700'}`}>{fmt(change, business?.currency)}</p>
                        </div>
                      </div>

                      {hasNonCashOverpay && (
                        <p className="text-xs font-semibold text-red-600">Solo efectivo puede generar vuelto.</p>
                      )}
                      {requiresCustomerForPending && !customerId && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
                          <p className="text-xs font-semibold text-amber-800 leading-snug">
                            Faltan <strong>{fmt(pendingBalance, business?.currency)}</strong> por pagar.
                            Agrega otro medio de pago o selecciona un cliente para vender a cuenta corriente.
                          </p>
                          <button
                            type="button"
                            onClick={addPayment}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-2.5 py-1.5 transition-colors"
                          >
                            <Icon name="Plus" size={12} />
                            Agregar medio de pago
                          </button>
                        </div>
                      )}
                    </div>
                    )}

                    {/* Pago recibido — solo efectivo */}
                    {/* Totals + Cobrar — desktop only; mobile uses fixed bar */}
                    <div className="hidden lg:flex flex-col gap-2.5 rounded-2xl bg-gray-950 px-4 py-4 shadow-xl">
                      <div className="space-y-1">
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
                      <div className="flex justify-between items-end border-t border-gray-800 pt-3">
                        <span className="text-sm font-bold text-gray-300">Total</span>
                        <span className="truncate text-2xl font-black tracking-tight text-white xl:text-3xl">{fmt(total, business?.currency)}</span>
                      </div>
                      {!payMode ? (
                        <button
                          onClick={() => setPayMode(true)}
                          disabled={cart.length === 0}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-base font-black text-white shadow-lg shadow-emerald-950/30 transition-all hover:-translate-y-0.5 hover:bg-emerald-400 disabled:translate-y-0 disabled:bg-gray-800 disabled:text-gray-500 disabled:shadow-none xl:py-4 xl:text-lg"
                        >
                          <Icon name="CreditCard" size={18} />
                          Cobrar
                        </button>
                      ) : requiresCustomerForPending && !customerId ? (
                        <div className="flex gap-2">
                          <button
                            disabled
                            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gray-800 py-3.5 text-sm font-black text-gray-500 shadow-none cursor-not-allowed xl:py-4"
                          >
                            <Icon name="AlertCircle" size={16} />
                            Falta pagar {fmt(pendingBalance, business?.currency)}
                          </button>
                          <button
                            type="button"
                            onClick={addPayment}
                            className="shrink-0 flex items-center justify-center gap-1.5 rounded-2xl bg-blue-600 hover:bg-blue-700 px-3.5 py-3.5 text-xs font-bold text-white transition-colors xl:py-4"
                            title="Agregar pago"
                          >
                            <Icon name="Plus" size={15} />
                            <span className="hidden xl:inline">Agregar pago</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleRegister}
                          disabled={cart.length === 0 || busy || isPaymentInvalid}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-base font-black text-white shadow-lg shadow-emerald-950/30 transition-all hover:-translate-y-0.5 hover:bg-emerald-400 disabled:translate-y-0 disabled:bg-gray-800 disabled:text-gray-500 disabled:shadow-none xl:py-4 xl:text-lg"
                        >
                          {busy
                            ? <><Icon name="Loader2" size={18} className="animate-spin" />Registrando…</>
                            : <><Icon name={pendingBalance > 0 ? 'BookUser' : 'Zap'} size={18} />Completar venta</>
                          }
                        </button>
                      )}
                      <p className="text-center text-xs text-gray-400">{paymentStatusLabel}</p>
                    </div>

                  </div>{/* end zone 3 */}

                </div>{/* end right column */}
              </div>{/* end flex row */}
            </div>{/* end outer padding container */}

            {/* ── Mobile sticky bottom bar ────────────────────────────────────
                Fixed at viewport bottom on small screens (lg:hidden).
                pb-24 on outer container prevents overlap with content.          */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 shadow-2xl px-3 py-2.5 flex items-center gap-3" style={{ zIndex: 150 }}>
              <div className="flex-1 min-w-0">
                {discountAmount > 0 && (
                  <p className="text-[10px] text-gray-500 line-through leading-none mb-0.5">
                    {fmt(subtotal, business?.currency)}
                  </p>
                )}
                <p className="truncate text-lg font-bold text-white leading-tight">{fmt(total, business?.currency)}</p>
                {payMode ? (
                <p className={`text-[10px] mt-0.5 ${isPaymentInvalid ? 'text-amber-400' : 'text-gray-400'}`}>
                  {requiresCustomerForPending && !customerId
                    ? `Faltan ${fmt(pendingBalance, business?.currency)} · selecciona cliente`
                    : `Pagado ${fmt(paidTotal, business?.currency)} · Pendiente ${fmt(pendingBalance, business?.currency)}`
                  }
                </p>
                ) : cartCount > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{cartCount} artículo{cartCount !== 1 ? 's' : ''}</p>
                )}
              </div>
              {!payMode ? (
                <button
                  onClick={() => setPayMode(true)}
                  disabled={cart.length === 0}
                  className="shrink-0 px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm transition-colors flex items-center gap-2"
                >
                  <Icon name="CreditCard" size={16} />
                  Cobrar
                </button>
              ) : requiresCustomerForPending && !customerId ? (
                <button
                  type="button"
                  onClick={addPayment}
                  className="shrink-0 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors flex items-center gap-2"
                >
                  <Icon name="Plus" size={16} />
                  + Pago
                </button>
              ) : (
                <button
                  onClick={handleRegister}
                  disabled={cart.length === 0 || busy || isPaymentInvalid}
                  className="shrink-0 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold text-sm transition-colors flex items-center gap-2"
                >
                  {busy
                    ? <><Icon name="Loader2" size={16} className="animate-spin" />Procesando…</>
                    : <><Icon name={pendingBalance > 0 ? 'BookUser' : 'Zap'} size={16} />Completar</>
                  }
                </button>
              )}
            </div>

          </>
        )}

      </main>

      {/* Manual item modal */}
      {showManualModal && (
        <ManualItemModal
          currency={business?.currency}
          onAdd={addManualItem}
          onClose={() => setShowManualModal(false)}
        />
      )}

      {/* Thermal ticket modal — rendered outside main flow to avoid layout issues */}
      {ticketData && (
        <CrmThermalTicket
          business={business}
          sale={ticketData.sale}
          items={ticketData.items}
          customer={ticketData.customer}
          paymentMethod={ticketData.paymentMethod}
          payments={ticketData.payments}
          discountAmount={ticketData.discountAmount}
          subtotal={ticketData.subtotal}
          total={ticketData.total}
          amountReceived={ticketData.amountReceived}
          change={ticketData.change}
          initialPaymentAmount={ticketData.initialPaymentAmount}
          initialPaymentMethod={ticketData.initialPaymentMethod}
          pendingBalance={ticketData.pendingBalance}
          notes={ticketData.notes}
          createdAt={ticketData.createdAt}
          onNewSale={handleNewSale}
          onClose={handleCloseTicket}
          onReprint={handleReprint}
        />
      )}

      {showNewCustomer && (
        <QuickCustomerModal
          onSave={handleCreateCustomer}
          onClose={() => setShowNewCustomer(false)}
        />
      )}

    </div>
  );
}

export default function CrmTerminal() {
  return (
    <CrmTerminalBoundary>
      <CrmTerminalUI />
    </CrmTerminalBoundary>
  );
}
