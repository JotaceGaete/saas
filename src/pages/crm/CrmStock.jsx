import React, { useEffect, useState } from 'react';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCrmStockProducts,
  registerStockMovement,
  updateStockMinimo,
} from '../../services/crmService';

const TYPE_CONFIG = {
  entrada: { label: 'Entrada', icon: 'TrendingUp', color: 'text-green-600', bg: 'bg-green-50 border-green-300' },
  salida:  { label: 'Salida',  icon: 'TrendingDown', color: 'text-red-600', bg: 'bg-red-50 border-red-300' },
  ajuste:  { label: 'Ajuste', icon: 'SlidersHorizontal', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-300' },
};

function MovementModal({ products, initialProduct, onSave, onClose }) {
  const [productId, setProductId] = useState(initialProduct?.id || '');
  const [type, setType] = useState('entrada');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedProduct = products.find(p => p.id === productId);
  const isAdjust = type === 'ajuste';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productId) { setError('Selecciona un producto.'); return; }
    const qty = +quantity;
    if (!qty || qty < 0 || (!isAdjust && qty <= 0)) { setError('Ingresa una cantidad válida.'); return; }
    setSaving(true);
    const { error: err } = await onSave({ productId, type, quantity: qty, notes });
    if (err) { setError(err.message || 'Error al registrar.'); setSaving(false); return; }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900 text-lg">Registrar movimiento</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <Icon name="X" size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Producto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Producto *</label>
            <select
              value={productId}
              onChange={e => setProductId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Seleccionar producto —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.stock_actual != null ? ` (stock: ${p.stock_actual})` : ' (sin control)'}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de movimiento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de movimiento</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-semibold transition-colors ${
                    type === key ? `${cfg.bg} ${cfg.color}` : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Icon name={cfg.icon} size={18} />
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cantidad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isAdjust ? 'Nuevo stock total *' : 'Cantidad *'}
            </label>
            <input
              type="number"
              min={isAdjust ? 0 : 1}
              step="1"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={isAdjust ? 'Stock total resultante' : 'Cantidad a registrar'}
            />
            {selectedProduct && selectedProduct.stock_actual != null && !isAdjust && (
              <p className="text-xs text-gray-400 mt-1">
                Stock actual: {selectedProduct.stock_actual} →&nbsp;
                <strong className="text-gray-700">
                  {type === 'entrada'
                    ? selectedProduct.stock_actual + (+quantity || 0)
                    : Math.max(0, selectedProduct.stock_actual - (+quantity || 0))}
                </strong>
              </p>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: Compra proveedor X, Devolución cliente…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <Icon name="Loader2" size={15} className="animate-spin" />}
              {saving ? 'Registrando…' : 'Registrar movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MinimoEditor({ product, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => { setVal(product.stock_minimo ?? ''); setEditing(true); };
  const cancel = () => setEditing(false);
  const save = async () => {
    setSaving(true);
    await onSave(product.id, val === '' ? null : +val);
    setSaving(false);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button onClick={start} className="text-sm text-gray-500 hover:text-blue-600 underline underline-offset-2">
        {product.stock_minimo != null ? product.stock_minimo : 'Definir'}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        type="number" min="0" step="1"
        value={val}
        onChange={e => setVal(e.target.value)}
        className="w-16 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none"
        autoFocus
      />
      <button onClick={save} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded">
        {saving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Check" size={14} />}
      </button>
      <button onClick={cancel} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><Icon name="X" size={14} /></button>
    </div>
  );
}

export default function CrmStock() {
  const { business } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | true (sin producto preseleccionado) | product object
  const [search, setSearch] = useState('');

  const load = async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmStockProducts(business.id);
    setProducts(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [business?.id]);

  const handleMovement = async (mov) => {
    const result = await registerStockMovement(business.id, mov);
    if (!result.error) { setModal(null); load(); }
    return result;
  };

  const handleMinimoSave = async (productId, value) => {
    await updateStockMinimo(productId, value);
    load();
  };

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const withStock = filtered.filter(p => p.stock_actual != null);
  const withoutStock = filtered.filter(p => p.stock_actual == null);

  const stockStatus = (p) => {
    if (p.stock_actual == null) return null;
    if (p.stock_actual === 0) return 'agotado';
    if (p.stock_minimo != null && p.stock_actual <= p.stock_minimo) return 'bajo';
    return 'ok';
  };

  const renderProduct = (p) => {
    const status = stockStatus(p);
    return (
      <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {p.thumbnail_url ? (
              <img src={p.thumbnail_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                <Icon name="Package" size={18} className="text-gray-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate text-sm">{p.name}</p>
              {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
            </div>
          </div>

          <div className="flex items-center gap-6 shrink-0">
            {/* Stock actual */}
            <div className="text-center min-w-[48px]">
              <p className="text-xs text-gray-400 mb-0.5">Stock</p>
              <p className={`text-lg font-bold ${
                status === 'agotado' ? 'text-red-500' :
                status === 'bajo' ? 'text-yellow-500' :
                status === 'ok' ? 'text-green-600' : 'text-gray-400'
              }`}>
                {p.stock_actual ?? '—'}
              </p>
            </div>
            {/* Mínimo */}
            <div className="text-center min-w-[56px]">
              <p className="text-xs text-gray-400 mb-1">Mínimo</p>
              <MinimoEditor product={p} onSave={handleMinimoSave} />
            </div>
            {/* Badge */}
            {status === 'bajo' && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Stock bajo</span>}
            {status === 'agotado' && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">Agotado</span>}
            {/* Botón */}
            <button
              onClick={() => setModal(p)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium whitespace-nowrap"
            >
              <Icon name="ArrowUpDown" size={13} />Movimiento
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Control de stock</h1>}
        subtitle={<p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>{loading ? 'Cargando…' : `${products.length} producto${products.length !== 1 ? 's' : ''}`}</p>}
      >
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Icon name="ArrowUpDown" size={16} />
          Nuevo movimiento
        </button>
      </PanelHeader>

      <DashboardLayoutContent>
        <div className="mb-5">
          <div className="relative max-w-sm">
            <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar producto…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Icon name="Loader2" size={32} className="animate-spin text-blue-500" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Icon name="Package" size={48} className="mx-auto mb-3" />
            <p className="font-medium">No hay productos activos en el catálogo.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {withStock.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Icon name="CheckCircle2" size={14} className="text-green-500" />
                  Con control de stock ({withStock.length})
                </h3>
                <div className="space-y-2">{withStock.map(renderProduct)}</div>
              </section>
            )}
            {withoutStock.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Icon name="Circle" size={14} />
                  Sin control de stock — activar con un primer movimiento ({withoutStock.length})
                </h3>
                <div className="space-y-2">{withoutStock.map(renderProduct)}</div>
              </section>
            )}
            {filtered.length === 0 && <p className="text-gray-400 text-sm text-center py-10">Sin resultados para "{search}".</p>}
          </div>
        )}
      </DashboardLayoutContent>

      {modal && (
        <MovementModal
          products={products}
          initialProduct={modal === true ? null : modal}
          onSave={handleMovement}
          onClose={() => setModal(null)}
        />
      )}
    </DashboardAppShell>
  );
}
