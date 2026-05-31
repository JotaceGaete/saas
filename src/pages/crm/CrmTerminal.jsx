import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { getCrmCustomers, getCrmStockProducts, createPosInvoice } from '../../services/crmService';
import { getEffectivePlanSlug } from '../../services/waBusinessService';

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
];

function fmt(n, currency) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: currency || 'CLP', maximumFractionDigits: 0,
  }).format(n || 0);
}

export default function CrmTerminal() {
  const navigate = useNavigate();
  const { business } = useAuth();

  const effectivePlan = getEffectivePlanSlug(
    business?.planSlug,
    business?.planExpiresAt,
    business?.trialExpiresAt
  );
  const hasAccess = effectivePlan === 'business';

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!business?.id || !hasAccess) return;
    getCrmStockProducts(business.id).then(({ data }) => setProducts(data || []));
    getCrmCustomers(business.id).then(({ data }) => setCustomers(data || []));
  }, [business?.id, hasAccess]);

  const filtered = search.trim().length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : products;

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
    setSearch('');
    searchRef.current?.focus();
  };

  const updateQty = (product_id, delta) => {
    setCart(prev => prev
      .map(i => i.product_id === product_id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)
    );
  };

  const removeItem = (product_id) => {
    setCart(prev => prev.filter(i => i.product_id !== product_id));
  };

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discountAmount = Math.min(parseFloat(discount) || 0, subtotal);
  const total = subtotal - discountAmount;

  const resetForm = () => {
    setCart([]);
    setCustomerId('');
    setDiscount('');
    setPaymentMethod('efectivo');
    setNotes('');
    setSearch('');
    searchRef.current?.focus();
  };

  const handleRegister = async () => {
    if (cart.length === 0) return;
    setBusy(true);
    const { data, error } = await createPosInvoice(business.id, {
      customerId: customerId || null,
      items: cart,
      discount: discountAmount,
      paymentMethod,
      notes: notes || null,
    });
    setBusy(false);
    if (error) {
      alert('Error al registrar la venta: ' + error.message);
      return;
    }
    setSuccess(data);
  };

  if (!hasAccess) {
    return (
      <DashboardAppShell>
        <PanelHeader
          title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Terminal de ventas</h1>}
        />
        <DashboardLayoutContent>
          <div className="flex flex-col items-center justify-center py-24 gap-4">
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
        </DashboardLayoutContent>
      </DashboardAppShell>
    );
  }

  if (success) {
    return (
      <DashboardAppShell>
        <PanelHeader
          title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Terminal de ventas</h1>}
        />
        <DashboardLayoutContent>
          <div className="flex flex-col items-center justify-center py-20 gap-5">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
              <Icon name="CheckCircle2" size={40} className="text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">¡Venta registrada!</p>
              <p className="text-gray-500 text-sm mt-1">
                NV-{String(success.invoice_number).padStart(4, '0')} — {fmt(success.total, business?.currency)}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate(`/crm/facturas/${success.id}`)}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                Ver nota de venta
              </button>
              <button
                onClick={() => { setSuccess(null); resetForm(); }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
              >
                Nueva venta
              </button>
            </div>
          </div>
        </DashboardLayoutContent>
      </DashboardAppShell>
    );
  }

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Terminal de ventas</h1>}
        subtitle={<p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Registra ventas rápidas desde tu catálogo</p>}
      />

      <DashboardLayoutContent>
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start">

          {/* LEFT: product search */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="relative">
              <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                ref={searchRef}
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto por nombre…"
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Product grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filtered.slice(0, 30).map(p => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="flex flex-col items-start gap-1 p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all text-left"
                >
                  {p.thumbnail_url && (
                    <img src={p.thumbnail_url} alt={p.name} className="w-full h-20 object-cover rounded-lg mb-1" />
                  )}
                  <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug">{p.name}</p>
                  <p className="text-xs text-blue-600 font-bold">{fmt(p.price, business?.currency)}</p>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-3 text-center py-10 text-gray-400 text-sm">
                  {search ? 'Sin resultados' : 'No hay productos activos'}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: cart + checkout */}
          <div className="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col gap-3">

            {/* Customer selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Cliente</label>
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Consumidor final</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
                ))}
              </select>
            </div>

            {/* Cart items */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-600">Carrito</span>
                {cart.length > 0 && (
                  <button onClick={resetForm} className="text-xs text-red-400 hover:text-red-600">Vaciar</button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                  <Icon name="ShoppingCart" size={24} className="mx-auto mb-2 text-gray-300" />
                  Agrega productos desde la izquierda
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cart.map(item => (
                    <div key={item.product_id} className="px-4 py-2.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">{fmt(item.unit_price, business?.currency)} c/u</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => updateQty(item.product_id, -1)}
                          className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                        >
                          <Icon name="Minus" size={11} />
                        </button>
                        <span className="w-6 text-center text-xs font-semibold">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.product_id, 1)}
                          className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                        >
                          <Icon name="Plus" size={11} />
                        </button>
                      </div>
                      <div className="text-xs font-bold text-gray-800 w-16 text-right shrink-0">
                        {fmt(item.unit_price * item.quantity, business?.currency)}
                      </div>
                      <button onClick={() => removeItem(item.product_id)} className="text-gray-300 hover:text-red-400 shrink-0">
                        <Icon name="X" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Discount */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Descuento (monto)</label>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Payment method */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Método de pago</label>
              <div className="flex gap-2 flex-wrap">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setPaymentMethod(m.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      paymentMethod === m.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Notas (opcional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej. Pago en cuotas, entrega a domicilio…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Totals */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Subtotal</span>
                <span>{fmt(subtotal, business?.currency)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-xs text-red-500">
                  <span>Descuento</span>
                  <span>-{fmt(discountAmount, business?.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-200">
                <span>Total</span>
                <span>{fmt(total, business?.currency)}</span>
              </div>
            </div>

            {/* Register button */}
            <button
              onClick={handleRegister}
              disabled={cart.length === 0 || busy}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="CheckCircle2" size={16} />}
              {busy ? 'Registrando…' : 'Registrar venta'}
            </button>
          </div>
        </div>
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
