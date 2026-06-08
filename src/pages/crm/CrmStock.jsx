import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import Icon from 'components/AppIcon';
import { formatMoney } from 'utils/formatMoney';
import { useAuth } from '../../contexts/AuthContext';
import {
  getCrmStockProducts,
  getCrmStockMovements,
  registerStockMovement,
  updateStockMinimo,
} from '../../services/crmService';

// ─── Tipos de movimiento ──────────────────────────────────────────────────────

const MOVEMENT_TYPES = {
  entrada:          { label: 'Entrada manual',     icon: 'TrendingUp',      color: 'text-green-600',  bg: 'bg-green-50 border-green-300' },
  salida:           { label: 'Salida manual',      icon: 'TrendingDown',    color: 'text-red-600',    bg: 'bg-red-50 border-red-300' },
  ajuste:           { label: 'Ajuste',             icon: 'SlidersHorizontal', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-300' },
  entrada_manual:   { label: 'Entrada manual',     icon: 'TrendingUp',      color: 'text-green-600',  bg: 'bg-green-50' },
  salida_manual:    { label: 'Salida manual',      icon: 'TrendingDown',    color: 'text-red-600',    bg: 'bg-red-50' },
  venta_tpv:        { label: 'Venta TPV',          icon: 'Monitor',         color: 'text-orange-600', bg: 'bg-orange-50' },
  venta_catalogo:   { label: 'Venta catálogo',     icon: 'ShoppingCart',    color: 'text-purple-600', bg: 'bg-purple-50' },
  compra_mercaderia:{ label: 'Compra mercadería',  icon: 'PackagePlus',     color: 'text-teal-600',   bg: 'bg-teal-50' },
  devolucion:       { label: 'Devolución',         icon: 'RotateCcw',       color: 'text-indigo-600', bg: 'bg-indigo-50' },
};

const MANUAL_TYPES = ['entrada', 'salida', 'ajuste'];

const TYPE_LABELS = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' };

const fmt = (n) => formatMoney(n, 'CLP');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stockStatus(p) {
  if (p.stock_actual == null) return 'sin_control';
  if (p.stock_actual === 0)   return 'agotado';
  if (p.stock_minimo != null && p.stock_actual <= p.stock_minimo) return 'bajo';
  return 'ok';
}

const STATUS_CONFIG = {
  ok:          { label: 'OK',           color: 'text-green-700',  bg: 'bg-green-100',  dot: 'bg-green-500' },
  bajo:        { label: 'Stock bajo',   color: 'text-yellow-700', bg: 'bg-yellow-100', dot: 'bg-yellow-500' },
  agotado:     { label: 'Agotado',      color: 'text-red-700',    bg: 'bg-red-100',    dot: 'bg-red-500' },
  sin_control: { label: 'Sin control',  color: 'text-gray-500',   bg: 'bg-gray-100',   dot: 'bg-gray-400' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.sin_control;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color} ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function catalogStatus(p) {
  if (!p.is_active) return { label: 'Oculto',      color: 'text-gray-500', bg: 'bg-gray-100' };
  if (p.soldOut)    return { label: 'Agotado',     color: 'text-orange-700', bg: 'bg-orange-100' };
  return               { label: 'Disponible',  color: 'text-emerald-700', bg: 'bg-emerald-100' };
}

// ─── Buscador con dropdown ────────────────────────────────────────────────────

function ProductSearch({ products, onSelect }) {
  const [query, setQuery]     = useState('');
  const [open,  setOpen]      = useState(false);
  const ref                   = useRef(null);

  const results = query.trim().length > 0
    ? products.filter(p => {
        const q = query.toLowerCase();
        return (
          p.name?.toLowerCase().includes(q) ||
          (p.public_code && p.public_code.toLowerCase().includes(q)) ||
          (p.sku         && p.sku.toLowerCase().includes(q)) ||
          (p.barcode     && p.barcode.toLowerCase().includes(q))
        );
      }).slice(0, 8)
    : [];

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (p) => {
    setQuery('');
    setOpen(false);
    onSelect(p);
  };

  return (
    <div ref={ref} className="relative w-full max-w-xl">
      <div className="relative">
        <Icon name="Search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar por código interno o nombre del producto…"
          className="w-full border-2 border-gray-200 focus:border-blue-400 rounded-2xl pl-11 pr-4 py-3.5 text-sm bg-white shadow-sm focus:outline-none focus:shadow-md transition-all placeholder:text-gray-400"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 p-1">
            <Icon name="X" size={15} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
          {results.map(p => {
            const status = stockStatus(p);
            const cfg    = STATUS_CONFIG[status];
            return (
              <button
                key={p.id}
                onClick={() => choose(p)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
              >
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <Icon name="Package" size={16} className="text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {p.public_code && (
                      <span className="text-xs text-blue-600 font-mono">{p.public_code}</span>
                    )}
                    {p.sku && (
                      <span className="text-xs text-gray-500 font-mono">SKU: {p.sku}</span>
                    )}
                    {p.barcode && (
                      <span className="text-xs text-gray-500 font-mono">{p.barcode}</span>
                    )}
                    {p.category && <span className="text-xs text-gray-400">{p.category}</span>}
                  </div>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>
                  {p.stock_actual == null
                    ? 'Sin configurar'
                    : status === 'agotado'
                      ? `${p.stock_actual} 🔴`
                      : status === 'bajo'
                        ? `${p.stock_actual} ⚠️`
                        : p.stock_actual
                  }
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && query.trim().length > 0 && results.length === 0 && (
        <div className="absolute z-30 w-full mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-xl px-4 py-4 text-sm text-gray-400 text-center">
          Sin resultados para "{query}"
        </div>
      )}
    </div>
  );
}

// ─── Vista por defecto — resumen + críticos ────────────────────────────────────

function DefaultView({ products, recentMovements, loadingMov, onSelectProduct }) {
  const withControl = products.filter(p => p.stock_actual != null);
  const critical    = products.filter(p => {
    const s = stockStatus(p);
    return s === 'agotado' || s === 'bajo';
  });
  const hasMovements = recentMovements.length > 0;

  // CAMBIO 1 + 2: onboarding cuando nadie tiene control de stock
  if (withControl.length === 0 && products.length > 0) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        {/* CAMBIO 2: alerta */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5">
          <Icon name="AlertTriangle" size={17} color="#d97706" className="shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-snug">
            <strong>Ningún producto tiene control de stock activado.</strong>{' '}
            Busca un producto y regístralo para comenzar a controlar tu inventario.
          </p>
        </div>

        {/* CAMBIO 1: card de onboarding */}
        <div className="bg-white rounded-2xl border border-blue-100 overflow-hidden">
          <div className="px-5 pt-6 pb-5 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Icon name="PackageSearch" size={28} color="#3b82f6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Cómo comenzar</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-xs">
                Busca un producto por nombre o código, luego registra su stock inicial y define un mínimo de alerta.
              </p>
            </div>
            <div className="flex flex-col gap-2 text-sm text-gray-600 w-full max-w-xs mt-1">
              <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                <span>Busca el producto en el campo de arriba</span>
              </div>
              <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
                <span>Registra una <strong>entrada</strong> con el stock actual</span>
              </div>
              <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
                <span>Define el stock mínimo para recibir alertas</span>
              </div>
            </div>
          </div>
        </div>

        {/* CAMBIO 3: tipos de movimiento (siempre visible cuando no hay movimientos) */}
        <MovementTypesCard />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-black text-gray-900">{products.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Productos</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-black text-gray-700">{withControl.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Con control</p>
        </div>
        <div className={`rounded-2xl border p-4 text-center ${critical.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
          <p className={`text-2xl font-black ${critical.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{critical.length}</p>
          <p className={`text-xs mt-0.5 ${critical.length > 0 ? 'text-red-400' : 'text-gray-400'}`}>Críticos</p>
        </div>
      </div>

      {/* CAMBIO 6: Productos críticos — prominente arriba */}
      {critical.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-red-100 flex items-center gap-2 bg-red-50/60">
            <Icon name="AlertTriangle" size={15} color="#dc2626" />
            <p className="text-sm font-bold text-red-700">Atención: {critical.length} producto{critical.length !== 1 ? 's' : ''} con stock crítico</p>
          </div>
          <div className="divide-y divide-gray-50">
            {critical.slice(0, 8).map(p => (
              <button
                key={p.id}
                onClick={() => onSelectProduct(p)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-red-50/40 transition-colors text-left"
              >
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <Icon name="Package" size={14} className="text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  {p.public_code && <p className="text-xs font-mono text-blue-500">{p.public_code}</p>}
                </div>
                <StatusBadge status={stockStatus(p)} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* CAMBIO 3: Tarjeta educativa — solo cuando no hay movimientos aún */}
      {!hasMovements && <MovementTypesCard />}

      {/* Últimos movimientos */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <Icon name="Activity" size={15} color="#6b7280" />
          <p className="text-sm font-bold text-gray-800">Últimos movimientos</p>
        </div>
        {loadingMov ? (
          <div className="py-8 flex justify-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recentMovements.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin movimientos registrados aún</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentMovements.map(m => {
              const cfg = MOVEMENT_TYPES[m.type] || MOVEMENT_TYPES.entrada;
              return (
                <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    <Icon name={cfg.icon} size={13} className={cfg.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 truncate">{m.product_name || '—'}</p>
                    <p className="text-xs text-gray-400">{cfg.label} · {new Date(m.created_at).toLocaleDateString('es-CL')}</p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${cfg.color}`}>
                    {m.type === 'ajuste' ? `=${m.quantity}` : m.type === 'salida' || m.type === 'salida_manual' || m.type === 'venta_tpv' || m.type === 'venta_catalogo' ? `-${m.quantity}` : `+${m.quantity}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ayuda */}
      <div className="text-center py-2">
        <p className="text-sm text-gray-400">Usa el buscador para encontrar un producto y gestionar su stock</p>
      </div>
    </div>
  );
}

// CAMBIO 3: tarjeta educativa de tipos de movimiento
function MovementTypesCard() {
  const types = [
    { icon: 'TrendingUp',   color: 'text-green-600', bg: 'bg-green-50', label: 'Entrada', desc: 'Recibes mercadería o haces un ingreso manual.' },
    { icon: 'TrendingDown', color: 'text-red-600',   bg: 'bg-red-50',   label: 'Salida',  desc: 'Retiras unidades fuera del sistema de ventas.' },
    { icon: 'SlidersHorizontal', color: 'text-blue-600', bg: 'bg-blue-50', label: 'Ajuste', desc: 'Corrige el stock total (inventario físico).' },
  ];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
        <Icon name="BookOpen" size={15} color="#6b7280" />
        <p className="text-sm font-bold text-gray-800">Tipos de movimiento</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        {types.map(t => (
          <div key={t.label} className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${t.bg}`}>
              <Icon name={t.icon} size={15} className={t.color} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{t.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Panel movimiento inline ───────────────────────────────────────────────────

function MovementPanel({ product, businessId, onDone }) {
  const [type,     setType]     = useState('entrada');
  const [quantity, setQuantity] = useState('');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  const isAdjust   = type === 'ajuste';
  const qty        = parseFloat(quantity);
  const preview    = product.stock_actual != null && !isAdjust && !isNaN(qty)
    ? type === 'entrada'
      ? product.stock_actual + qty
      : Math.max(0, product.stock_actual - qty)
    : null;

  const submit = async () => {
    if (!qty || qty < 0 || (!isAdjust && qty <= 0)) { setError('Ingresa una cantidad válida'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await registerStockMovement(businessId, { productId: product.id, type, quantity: qty, notes });
    setSaving(false);
    if (err) { setError(err.message || 'Error al registrar'); return; }
    setSuccess(true);
    setTimeout(() => { setSuccess(false); setQuantity(''); setNotes(''); onDone(); }, 800);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-800">Registrar movimiento</p>
      </div>
      <div className="px-5 py-4 space-y-4">

        {/* Tipo */}
        <div className="grid grid-cols-3 gap-2">
          {MANUAL_TYPES.map(t => {
            const cfg = MOVEMENT_TYPES[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-semibold transition-colors ${
                  type === t ? `${cfg.bg} ${cfg.color}` : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Icon name={cfg.icon} size={17} />
                {TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>

        {/* Cantidad */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">
            {isAdjust ? 'Nuevo stock total' : 'Cantidad'}
          </label>
          <input
            type="number" min={isAdjust ? 0 : 1} step="1"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            placeholder={isAdjust ? 'Stock total resultante' : '0'}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {preview !== null && (
            <p className="text-xs text-gray-400 mt-1.5">
              {product.stock_actual} → <strong className="text-gray-700">{preview}</strong>
            </p>
          )}
        </div>

        {/* Notas */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">Nota (opcional)</label>
          <input
            type="text" value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ej: Compra proveedor X, devolución…"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <button
          onClick={submit}
          disabled={saving || success}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
            success
              ? 'bg-green-500 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60'
          }`}
        >
          {success ? (
            <><Icon name="Check" size={15} />Registrado</>
          ) : saving ? (
            <><div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />Guardando…</>
          ) : (
            'Registrar movimiento'
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Stock mínimo inline ───────────────────────────────────────────────────────

function MinimoEditor({ product, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState('');
  const [saving,  setSaving]  = useState(false);

  const start  = () => { setVal(product.stock_minimo ?? ''); setEditing(true); };
  const cancel = () => setEditing(false);
  const save   = async () => {
    setSaving(true);
    await onSave(product.id, val === '' ? null : +val);
    setSaving(false);
    setEditing(false);
  };

  if (!editing) return (
    <button onClick={start} className={`text-sm underline underline-offset-2 tabular-nums ${product.stock_minimo != null ? 'text-gray-500 hover:text-blue-600' : 'text-gray-400 hover:text-blue-500 italic'}`}>
      {product.stock_minimo != null ? product.stock_minimo : 'No configurado'}
    </button>
  );

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number" min="0" step="1" autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        className="w-16 border border-blue-400 rounded-lg px-2 py-1 text-sm focus:outline-none text-center"
      />
      <button onClick={save} disabled={saving} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50">
        {saving ? <div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /> : <Icon name="Check" size={14} />}
      </button>
      <button onClick={cancel} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
        <Icon name="X" size={14} />
      </button>
    </div>
  );
}

// ─── Ficha del producto ────────────────────────────────────────────────────────

function ProductCard({ product, businessId, onBack, onMinimoSave, onMovementDone, movements, loadingMov }) {
  const status  = stockStatus(product);
  const catSt   = catalogStatus(product);

  return (
    <div className="space-y-4 max-w-2xl mx-auto">

      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-600 transition-colors">
        <Icon name="ArrowLeft" size={15} />
        Volver
      </button>

      {/* Ficha principal */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-5 flex items-start gap-4">
          {/* Imagen */}
          {product.thumbnail_url ? (
            <img src={product.thumbnail_url} alt={product.name}
              className="w-20 h-20 rounded-xl object-cover shrink-0 border border-gray-100" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Icon name="Package" size={28} className="text-gray-300" />
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 leading-snug">{product.name}</h2>

            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {product.public_code && (
                <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg font-mono font-semibold">
                  <Icon name="Hash" size={11} />{product.public_code}
                </span>
              )}
              {product.sku && (
                <span className="flex items-center gap-1 text-xs bg-gray-50 text-gray-700 border border-gray-200 px-2 py-0.5 rounded-lg font-mono">
                  SKU: {product.sku}
                </span>
              )}
              {product.barcode && (
                <span className="flex items-center gap-1 text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-lg font-mono">
                  <Icon name="Barcode" size={11} />{product.barcode}
                </span>
              )}
              {product.category && (
                <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-lg">{product.category}</span>
              )}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${catSt.color} ${catSt.bg}`}>
                {catSt.label}
              </span>
            </div>

            {product.price != null && (
              <p className="text-sm font-bold text-gray-700 mt-2">{fmt(product.price)}</p>
            )}
          </div>
        </div>

        {/* Stock metrics */}
        <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Stock actual</p>
            {product.stock_actual != null ? (
              <p className={`text-3xl font-black leading-none tabular-nums ${
                status === 'agotado' ? 'text-red-600' :
                status === 'bajo'    ? 'text-yellow-600' :
                status === 'ok'      ? 'text-green-600' : 'text-gray-400'
              }`}>
                {product.stock_actual}
              </p>
            ) : (
              <p className="text-xs text-gray-400 italic leading-snug mt-1">No configurado</p>
            )}
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1.5">Stock mínimo</p>
            <MinimoEditor product={product} onSave={onMinimoSave} />
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1.5">Estado</p>
            <StatusBadge status={status} />
          </div>
        </div>
        {/* CAMBIO 4: CTA cuando no hay stock configurado */}
        {product.stock_actual == null && (
          <div className="border-t border-dashed border-blue-100 px-5 py-3 bg-blue-50/40 flex items-center justify-between gap-3">
            <p className="text-xs text-blue-700 leading-snug">
              Registra una <strong>entrada</strong> abajo para configurar el stock inicial de este producto.
            </p>
          </div>
        )}
      </div>

      {/* Panel de movimiento */}
      <MovementPanel product={product} businessId={businessId} onDone={onMovementDone} />

      {/* Historial */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Icon name="ClipboardList" size={15} color="#6b7280" />
          <p className="text-sm font-bold text-gray-800">Historial de movimientos</p>
        </div>

        {loadingMov ? (
          <div className="py-8 flex justify-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : movements.length === 0 ? (
          <div className="py-10 text-center">
            <Icon name="ClipboardList" size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Sin movimientos registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {movements.map(m => {
              const cfg = MOVEMENT_TYPES[m.type] || MOVEMENT_TYPES.entrada;
              const isOut = ['salida', 'salida_manual', 'venta_tpv', 'venta_catalogo'].includes(m.type);
              const isAdj = m.type === 'ajuste';
              return (
                <div key={m.id} className="px-5 py-3.5 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    <Icon name={cfg.icon} size={14} className={cfg.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">{cfg.label}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400">
                        {new Date(m.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {m.notes && <span className="text-xs text-gray-500 italic truncate max-w-40">{m.notes}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-base font-black tabular-nums ${isOut ? 'text-red-600' : isAdj ? 'text-blue-600' : 'text-green-600'}`}>
                      {isAdj ? `= ${m.quantity}` : isOut ? `−${m.quantity}` : `+${m.quantity}`}
                    </p>
                    {m.stock_after != null && (
                      <p className="text-[10px] text-gray-400">→ {m.stock_after}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CrmStock() {
  const { business }                  = useAuth();
  const [products, setProducts]       = useState([]);
  const [loading,  setLoading]        = useState(true);
  const [selected, setSelected]       = useState(null); // product object
  const [movements, setMovements]     = useState([]);
  const [loadingMov, setLoadingMov]   = useState(false);
  const [recentMov, setRecentMov]     = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Cargar productos
  const loadProducts = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmStockProducts(business.id);
    setProducts(data || []);
    setLoading(false);
  }, [business?.id]);

  // Cargar movimientos recientes (todos, para la vista por defecto)
  const loadRecentMovements = useCallback(async () => {
    if (!business?.id) return;
    setLoadingRecent(true);
    const { data } = await getCrmStockMovements(business.id, null);
    setRecentMov((data || []).slice(0, 15));
    setLoadingRecent(false);
  }, [business?.id]);

  // Cargar movimientos del producto seleccionado
  const loadProductMovements = useCallback(async (productId) => {
    if (!business?.id) return;
    setLoadingMov(true);
    const { data } = await getCrmStockMovements(business.id, productId);
    setMovements(data || []);
    setLoadingMov(false);
  }, [business?.id]);

  useEffect(() => { loadProducts(); loadRecentMovements(); }, [loadProducts, loadRecentMovements]);

  const handleSelect = (p) => {
    setSelected(p);
    loadProductMovements(p.id);
  };

  const handleBack = () => {
    setSelected(null);
    setMovements([]);
  };

  // Después de un movimiento: refrescar producto y movimientos
  const handleMovementDone = async () => {
    await loadProducts();
    if (selected) loadProductMovements(selected.id);
    loadRecentMovements();
    // Sync stock_actual en el producto seleccionado
    setProducts(prev => {
      const updated = prev.find(p => p.id === selected?.id);
      if (updated) setSelected(updated);
      return prev;
    });
  };

  // Sync selected product cuando cambia la lista
  useEffect(() => {
    if (!selected) return;
    const fresh = products.find(p => p.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMinimoSave = async (productId, value) => {
    await updateStockMinimo(productId, value);
    await loadProducts();
  };

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <>
            <CrmBreadcrumb section="Stock" />
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
              Control de stock
            </h1>
          </>
        }
        subtitle={
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            {loading ? 'Cargando…' : `${products.length} producto${products.length !== 1 ? 's' : ''}`}
          </p>
        }
      />

      <DashboardLayoutContent>
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Buscador — siempre visible */}
            {!selected && (
              <div className="max-w-2xl mx-auto">
                <ProductSearch products={products} onSelect={handleSelect} />
              </div>
            )}

            {selected ? (
              <ProductCard
                product={selected}
                businessId={business.id}
                onBack={handleBack}
                onMinimoSave={handleMinimoSave}
                onMovementDone={handleMovementDone}
                movements={movements}
                loadingMov={loadingMov}
              />
            ) : (
              <DefaultView
                products={products}
                recentMovements={recentMov}
                loadingMov={loadingRecent}
                onSelectProduct={handleSelect}
              />
            )}
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
