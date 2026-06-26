import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
const TYPE_LABELS  = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' };
const fmt          = (n) => formatMoney(n, 'CLP');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stockStatus(p) {
  if (p.stock_actual == null) return 'sin_control';
  if (p.stock_actual === 0)   return 'agotado';
  if (p.stock_minimo != null && p.stock_actual <= p.stock_minimo) return 'bajo';
  return 'ok';
}

const STATUS_CONFIG = {
  ok:          { label: 'OK',          color: 'text-emerald-700', bg: 'bg-emerald-50',  dot: 'bg-emerald-500', ring: 'ring-emerald-200' },
  bajo:        { label: 'Stock bajo',  color: 'text-amber-700',   bg: 'bg-amber-50',    dot: 'bg-amber-500',   ring: 'ring-amber-200' },
  agotado:     { label: 'Agotado',     color: 'text-red-700',     bg: 'bg-red-50',      dot: 'bg-red-500',     ring: 'ring-red-200' },
  sin_control: { label: 'Sin control', color: 'text-gray-500',    bg: 'bg-gray-100',    dot: 'bg-gray-400',    ring: 'ring-gray-200' },
};

function catalogStatus(p) {
  if (!p.is_active) return { label: 'Oculto',     color: 'text-gray-500',   bg: 'bg-gray-100' };
  if (p.soldOut)    return { label: 'Agotado',    color: 'text-orange-700', bg: 'bg-orange-100' };
  return               { label: 'Disponible', color: 'text-emerald-700', bg: 'bg-emerald-100' };
}

function relativeDate(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7)  return `Hace ${diff} días`;
  return new Date(dateStr).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.sin_control;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${cfg.color} ${cfg.bg} ${cfg.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function StockKpiCard({ label, value, icon, palette, active, onClick, subtitle }) {
  const palettes = {
    blue:   { bg: 'bg-[#EFF6FF]', activeBg: 'bg-blue-600',   text: 'text-blue-700',   activeText: 'text-white',   iconBg: 'bg-blue-100',   activeIconBg: 'bg-blue-500',  val: 'text-blue-900',   ring: 'ring-blue-200'   },
    green:  { bg: 'bg-[#ECFDF5]', activeBg: 'bg-emerald-600', text: 'text-emerald-700',activeText: 'text-white',   iconBg: 'bg-emerald-100',activeIconBg: 'bg-emerald-500',val: 'text-emerald-900',ring: 'ring-emerald-200'},
    amber:  { bg: 'bg-[#FEF3C7]', activeBg: 'bg-amber-500',   text: 'text-amber-700',  activeText: 'text-white',   iconBg: 'bg-amber-100',  activeIconBg: 'bg-amber-400', val: 'text-amber-900',  ring: 'ring-amber-200'  },
    red:    { bg: 'bg-[#FEF2F2]', activeBg: 'bg-red-600',     text: 'text-red-700',    activeText: 'text-white',   iconBg: 'bg-red-100',    activeIconBg: 'bg-red-500',   val: 'text-red-900',    ring: 'ring-red-200'    },
    gray:   { bg: 'bg-gray-50',   activeBg: 'bg-gray-700',    text: 'text-gray-600',   activeText: 'text-white',   iconBg: 'bg-gray-100',   activeIconBg: 'bg-gray-600',  val: 'text-gray-800',   ring: 'ring-gray-200'   },
  };
  const p = palettes[palette] || palettes.blue;

  return (
    <button
      onClick={onClick}
      className={`group relative rounded-2xl border p-4 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
        active
          ? `${p.activeBg} border-transparent shadow-lg ring-2 ${p.ring}`
          : `${p.bg} border-transparent hover:border-white hover:ring-1 ${p.ring}`
      }`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 transition-colors ${active ? p.activeIconBg : p.iconBg}`}>
        <Icon name={icon} size={16} className={active ? 'text-white' : p.text} />
      </div>
      <p className={`text-2xl font-black tabular-nums leading-none mb-1 ${active ? 'text-white' : p.val}`}>{value}</p>
      <p className={`text-xs font-semibold ${active ? 'text-white/80' : p.text}`}>{label}</p>
      {subtitle && <p className={`text-[10px] mt-0.5 ${active ? 'text-white/60' : 'text-gray-400'}`}>{subtitle}</p>}
      {active && (
        <div className="absolute top-3 right-3">
          <Icon name="ChevronDown" size={14} className="text-white/70" />
        </div>
      )}
    </button>
  );
}

// ─── Alert elegante para stock crítico ────────────────────────────────────────

function StockAlertBanner({ critical, onReponer }) {
  if (critical.length === 0) return null;
  const agotados = critical.filter(p => stockStatus(p) === 'agotado');
  const bajos    = critical.filter(p => stockStatus(p) === 'bajo');

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
          <Icon name="AlertTriangle" size={17} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900">
            {critical.length} producto{critical.length !== 1 ? 's' : ''} requieren{critical.length === 1 ? ' atención' : ' atención'}
          </p>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {agotados.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {agotados.length} agotado{agotados.length !== 1 ? 's' : ''}
              </span>
            )}
            {bajos.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                {bajos.length} bajo mínimo
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onReponer}
          className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-2 rounded-xl transition-colors"
        >
          <Icon name="Package" size={13} />
          Ver críticos
        </button>
      </div>
    </div>
  );
}

// ─── Timeline de movimientos recientes ───────────────────────────────────────

function MovementTimeline({ movements, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="h-4 bg-gray-100 rounded w-40 mb-4 animate-pulse" />
        {[1,2,3].map(i => (
          <div key={i} className="flex gap-3 mb-4">
            <div className="w-8 h-8 rounded-xl bg-gray-100 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-gray-100 rounded w-3/4 animate-pulse" />
              <div className="h-3 bg-gray-50 rounded w-1/2 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Icon name="Activity" size={13} className="text-indigo-500" />
          </div>
          <p className="text-sm font-bold text-gray-800">Últimos movimientos</p>
        </div>
        {movements.length > 0 && (
          <span className="text-xs text-gray-400 font-medium">{movements.length}</span>
        )}
      </div>

      {movements.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
            <Icon name="Activity" size={20} className="text-gray-300" />
          </div>
          <p className="text-sm text-gray-400 font-medium">Sin movimientos registrados aún</p>
          <p className="text-xs text-gray-300 mt-1">Los ajustes de stock aparecerán aquí</p>
        </div>
      ) : (
        <div className="px-5 py-3 divide-y divide-gray-50">
          {movements.map((m, i) => {
            const cfg   = MOVEMENT_TYPES[m.type] || MOVEMENT_TYPES.entrada;
            const isOut = ['salida', 'salida_manual', 'venta_tpv', 'venta_catalogo'].includes(m.type);
            const isAdj = m.type === 'ajuste';
            const qty   = isAdj ? `= ${m.quantity}` : isOut ? `−${m.quantity}` : `+${m.quantity}`;
            return (
              <div key={m.id} className="py-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon name={cfg.icon} size={14} className={cfg.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.product_name || '—'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-gray-400">{cfg.label}</span>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs text-gray-400">{relativeDate(m.created_at)}</span>
                    {m.notes && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-xs text-gray-400 italic truncate max-w-32">{m.notes}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className={`text-sm font-black tabular-nums shrink-0 ${isOut ? 'text-red-500' : isAdj ? 'text-blue-500' : 'text-emerald-500'}`}>
                  {qty}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tabla de productos críticos ──────────────────────────────────────────────

function CriticalProductsTable({ products, onSelect }) {
  if (products.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center">
            <Icon name="AlertOctagon" size={13} className="text-red-500" />
          </div>
          <p className="text-sm font-bold text-gray-800">Productos críticos</p>
        </div>
        <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">{products.length}</span>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-400">Producto</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-400">SKU</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-400">Stock</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-400">Mínimo</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-400">Estado</th>
              <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-400">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {products.map(p => {
              const status = stockStatus(p);
              return (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      {p.thumbnail_url ? (
                        <img src={p.thumbnail_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <Icon name="Package" size={14} className="text-gray-300" />
                        </div>
                      )}
                      <span className="font-semibold text-gray-800 truncate max-w-48">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-xs font-mono text-gray-500">{p.sku || p.public_code || '—'}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-base font-black tabular-nums ${status === 'agotado' ? 'text-red-600' : 'text-amber-600'}`}>
                      {p.stock_actual ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm text-gray-500 tabular-nums">{p.stock_minimo ?? '—'}</span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => onSelect(p)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Icon name="SlidersHorizontal" size={12} />
                      Reponer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden divide-y divide-gray-50">
        {products.map(p => {
          const status = stockStatus(p);
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
            >
              {p.thumbnail_url ? (
                <img src={p.thumbnail_url} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Icon name="Package" size={16} className="text-gray-300" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {p.public_code && <span className="text-xs font-mono text-blue-500">{p.public_code}</span>}
                  {p.stock_minimo != null && <span className="text-xs text-gray-400">mín: {p.stock_minimo}</span>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-lg font-black tabular-nums ${status === 'agotado' ? 'text-red-600' : 'text-amber-600'}`}>
                  {p.stock_actual ?? '—'}
                </p>
                <StatusBadge status={status} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Buscador premium ─────────────────────────────────────────────────────────

function ProductSearch({ products, onSelect }) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const ref               = useRef(null);

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

  const choose = (p) => { setQuery(''); setOpen(false); onSelect(p); };

  return (
    <div ref={ref} className="relative w-full">
      <div className="relative">
        <Icon name="Search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar producto por nombre, código o SKU…"
          className="w-full border border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 rounded-2xl pl-11 pr-10 py-3.5 text-sm bg-white shadow-sm focus:outline-none transition-all placeholder:text-gray-400"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 p-1 rounded-lg transition-colors">
            <Icon name="X" size={15} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-30 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
          {results.map(p => {
            const status = stockStatus(p);
            const cfg    = STATUS_CONFIG[status];
            return (
              <button
                key={p.id}
                onClick={() => choose(p)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50/50 transition-colors text-left border-b border-gray-50 last:border-0"
              >
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <Icon name="Package" size={16} className="text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {p.public_code && <span className="text-xs text-blue-600 font-mono">{p.public_code}</span>}
                    {p.sku         && <span className="text-xs text-gray-400 font-mono">SKU: {p.sku}</span>}
                    {p.category    && <span className="text-xs text-gray-400">{p.category}</span>}
                  </div>
                </div>
                <StatusBadge status={status} />
              </button>
            );
          })}
        </div>
      )}

      {open && query.trim().length > 0 && results.length === 0 && (
        <div className="absolute z-30 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl px-4 py-6 text-sm text-gray-400 text-center">
          <Icon name="SearchX" size={20} className="mx-auto mb-2 text-gray-300" />
          Sin resultados para "{query}"
        </div>
      )}
    </div>
  );
}

// ─── Fila de producto en lista filtrada ───────────────────────────────────────

function ProductListRow({ product, onSelect }) {
  const status = stockStatus(product);
  return (
    <button
      onClick={() => onSelect(product)}
      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
    >
      {product.thumbnail_url ? (
        <img src={product.thumbnail_url} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <Icon name="Package" size={15} className="text-gray-400" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {product.public_code && <span className="text-xs font-mono text-blue-600">{product.public_code}</span>}
          {product.stock_minimo != null && <span className="text-xs text-gray-400">mín: {product.stock_minimo}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right hidden sm:block">
          {product.stock_actual != null ? (
            <p className={`text-base font-black tabular-nums leading-none ${
              status === 'agotado' ? 'text-red-600' :
              status === 'bajo'    ? 'text-amber-600' :
              'text-emerald-600'
            }`}>{product.stock_actual}</p>
          ) : (
            <p className="text-xs text-gray-400 italic">—</p>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5">stock</p>
        </div>
        <StatusBadge status={status} />
        <span className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg">
          <Icon name="SlidersHorizontal" size={12} />
          <span className="hidden sm:inline">Ajustar</span>
          <Icon name="ChevronRight" size={12} className="sm:hidden" />
        </span>
      </div>
    </button>
  );
}

// ─── Lista filtrada de productos ──────────────────────────────────────────────

function FilteredProductList({ products, filter, onSelect }) {
  const filtered = useMemo(() => {
    if (filter === 'criticos') {
      return products.filter(p => ['agotado', 'bajo'].includes(stockStatus(p)));
    }
    if (filter === 'con_control') {
      return products.filter(p => p.stock_actual != null).sort((a, b) => {
        const aCrit = ['agotado', 'bajo'].includes(stockStatus(a)) ? 0 : 1;
        const bCrit = ['agotado', 'bajo'].includes(stockStatus(b)) ? 0 : 1;
        return aCrit - bCrit;
      });
    }
    return [...products].sort((a, b) => {
      const aCtrl = a.stock_actual != null ? 0 : 1;
      const bCtrl = b.stock_actual != null ? 0 : 1;
      if (aCtrl !== bCtrl) return aCtrl - bCtrl;
      const aCrit = ['agotado', 'bajo'].includes(stockStatus(a)) ? 0 : 1;
      const bCrit = ['agotado', 'bajo'].includes(stockStatus(b)) ? 0 : 1;
      return aCrit - bCrit;
    });
  }, [products, filter]);

  const filterLabels = {
    criticos:    'Productos críticos',
    con_control: 'Productos con control de stock',
    todos:       'Todos los productos',
  };
  const emptyMessages = {
    criticos:    'No hay productos críticos.',
    con_control: 'No hay productos con control de stock activo.',
    todos:       'No hay productos.',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-800">{filterLabels[filter]}</p>
        <span className="text-xs text-gray-400 font-semibold bg-gray-100 px-2 py-0.5 rounded-full">{filtered.length}</span>
      </div>
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
            <Icon name="PackageSearch" size={20} className="text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">{emptyMessages[filter]}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {filtered.map(p => (
            <ProductListRow key={p.id} product={p} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Card educativa de tipos de movimiento ────────────────────────────────────

function MovementTypesCard() {
  const types = [
    { icon: 'TrendingUp',        color: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Entrada', desc: 'Recibes mercadería o haces un ingreso manual.' },
    { icon: 'TrendingDown',      color: 'text-red-500',     bg: 'bg-red-50',     label: 'Salida',  desc: 'Retiras unidades fuera del sistema de ventas.' },
    { icon: 'SlidersHorizontal', color: 'text-blue-600',    bg: 'bg-blue-50',    label: 'Ajuste',  desc: 'Corrige el stock total (inventario físico).' },
  ];
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center">
          <Icon name="BookOpen" size={13} className="text-gray-400" />
        </div>
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

// ─── Vista por defecto ────────────────────────────────────────────────────────

function DefaultView({ products, recentMovements, loadingMov, onSelectProduct }) {
  const [activeFilter, setActiveFilter] = useState(null);

  const withControl = products.filter(p => p.stock_actual != null);
  const critical    = products.filter(p => ['agotado', 'bajo'].includes(stockStatus(p)));
  const agotados    = products.filter(p => stockStatus(p) === 'agotado');

  const toggleFilter = (f) => setActiveFilter(prev => prev === f ? null : f);

  // Onboarding cuando nadie tiene control de stock
  if (withControl.length === 0 && products.length > 0) {
    return (
      <div className="space-y-5 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Icon name="AlertTriangle" size={17} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-snug">
            <strong>Ningún producto tiene control de stock activado.</strong>{' '}
            Busca un producto y regístralo para comenzar a controlar tu inventario.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-blue-100 p-6 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
            <Icon name="PackageSearch" size={28} className="text-blue-500" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Cómo comenzar</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              Busca un producto por nombre o código, luego registra su stock inicial y define un mínimo de alerta.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-gray-600 w-full max-w-xs">
            {['Busca el producto en el campo de arriba', 'Registra una entrada con el stock actual', 'Define el stock mínimo para recibir alertas'].map((step, i) => (
              <div key={i} className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5 text-left">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span dangerouslySetInnerHTML={{ __html: step.replace('<strong>', '<strong>').replace('</strong>', '</strong>') }} />
              </div>
            ))}
          </div>
        </div>

        <MovementTypesCard />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* KPI cards — 4 columnas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StockKpiCard
          label="Productos"
          value={products.length}
          icon="Package"
          palette="blue"
          active={activeFilter === 'todos'}
          onClick={() => toggleFilter('todos')}
        />
        <StockKpiCard
          label="Con stock"
          value={withControl.length}
          icon="CheckCircle"
          palette="green"
          active={activeFilter === 'con_control'}
          onClick={() => toggleFilter('con_control')}
          subtitle={`${products.length - withControl.length} sin configurar`}
        />
        <StockKpiCard
          label="Stock bajo"
          value={critical.length - agotados.length}
          icon="TrendingDown"
          palette="amber"
          active={activeFilter === 'bajo'}
          onClick={() => toggleFilter('bajo')}
        />
        <StockKpiCard
          label="Sin stock"
          value={agotados.length}
          icon="AlertOctagon"
          palette="red"
          active={activeFilter === 'criticos'}
          onClick={() => toggleFilter('criticos')}
        />
      </div>

      {/* Lista filtrada — aparece al hacer clic en KPI */}
      {activeFilter && activeFilter !== 'bajo' && (
        <FilteredProductList
          products={products}
          filter={activeFilter}
          onSelect={onSelectProduct}
        />
      )}

      {activeFilter === 'bajo' && (
        <FilteredProductList
          products={products.filter(p => stockStatus(p) === 'bajo')}
          filter="criticos"
          onSelect={onSelectProduct}
        />
      )}

      {/* Contenido por defecto cuando no hay filtro activo */}
      {!activeFilter && (
        <>
          {/* Alert elegante para stock crítico */}
          <StockAlertBanner
            critical={critical}
            onReponer={() => toggleFilter('criticos')}
          />

          {/* Tabla de críticos */}
          {critical.length > 0 && (
            <CriticalProductsTable products={critical.slice(0, 10)} onSelect={onSelectProduct} />
          )}

          {/* Card educativa solo cuando no hay movimientos */}
          {recentMovements.length === 0 && !loadingMov && <MovementTypesCard />}

          {/* Timeline de últimos movimientos */}
          <MovementTimeline movements={recentMovements} loading={loadingMov} />

          <p className="text-xs text-gray-400 text-center pb-2">
            Haz clic en las métricas de arriba para filtrar, o busca un producto directamente
          </p>
        </>
      )}
    </div>
  );
}

// ─── Panel de movimiento ──────────────────────────────────────────────────────

function MovementPanel({ product, businessId, onDone }) {
  const [type,     setType]     = useState('entrada');
  const [quantity, setQuantity] = useState('');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  const isAdjust = type === 'ajuste';
  const qty      = parseFloat(quantity);
  const preview  = product.stock_actual != null && !isAdjust && !isNaN(qty)
    ? type === 'entrada' ? product.stock_actual + qty : Math.max(0, product.stock_actual - qty)
    : null;

  const submit = async () => {
    if (!qty || qty < 0 || (!isAdjust && qty <= 0)) { setError('Ingresa una cantidad válida'); return; }
    setSaving(true); setError('');
    const { error: err } = await registerStockMovement(businessId, { productId: product.id, type, quantity: qty, notes });
    setSaving(false);
    if (err) { setError(err.message || 'Error al registrar'); return; }
    setSuccess(true);
    setTimeout(() => { setSuccess(false); setQuantity(''); setNotes(''); onDone(); }, 800);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
          <Icon name="SlidersHorizontal" size={13} className="text-blue-500" />
        </div>
        <p className="text-sm font-bold text-gray-800">Registrar movimiento</p>
      </div>
      <div className="px-5 py-5 space-y-4">

        {/* Tipo */}
        <div className="grid grid-cols-3 gap-2">
          {MANUAL_TYPES.map(t => {
            const cfg = MOVEMENT_TYPES[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                  type === t
                    ? `${cfg.bg} ${cfg.color} shadow-sm`
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300'
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
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">
            {isAdjust ? 'Nuevo stock total' : 'Cantidad'}
          </label>
          <input
            type="number" min={isAdjust ? 0 : 1} step="1"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            placeholder={isAdjust ? 'Stock total resultante' : '0'}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all"
          />
          {preview !== null && (
            <p className="text-xs text-gray-400 mt-1.5">
              {product.stock_actual} → <strong className="text-gray-700">{preview}</strong>
            </p>
          )}
        </div>

        {/* Notas */}
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">Nota <span className="font-normal text-gray-400">(opcional)</span></label>
          <input
            type="text" value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ej: Compra proveedor X, devolución…"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl">
            <Icon name="AlertCircle" size={13} className="shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={saving || success}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            success
              ? 'bg-emerald-500 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 hover:shadow-md active:scale-[0.98]'
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

// ─── Panel de stock mínimo ────────────────────────────────────────────────────

function MinimoPanel({ product, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  const hasMinimo = product.stock_minimo != null;

  const start  = () => { setVal(product.stock_minimo ?? ''); setError(''); setEditing(true); };
  const cancel = () => { setEditing(false); setError(''); };

  const save = async () => {
    const parsed = val === '' ? null : Number(val);
    if (val !== '' && (isNaN(parsed) || parsed < 0)) { setError('Ingresa un número válido (0 o mayor)'); return; }
    setSaving(true); setError('');
    await onSave(product.id, parsed);
    setSaving(false); setEditing(false); setSuccess(true);
    setTimeout(() => setSuccess(false), 2000);
  };

  const clear = async () => {
    setSaving(true);
    await onSave(product.id, null);
    setSaving(false); setEditing(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center">
            <Icon name="Bell" size={13} className="text-amber-500" />
          </div>
          <p className="text-sm font-bold text-gray-800">Alerta de stock mínimo</p>
        </div>
        {success && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
            <Icon name="Check" size={13} />Guardado
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        {editing ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              Recibirás una alerta cuando el stock llegue a este nivel o por debajo. Deja en blanco para desactivar.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" step="1" autoFocus
                value={val}
                onChange={e => { setVal(e.target.value); setError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                placeholder="Ej: 5"
                className={`flex-1 border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all ${
                  error ? 'border-red-300 focus:ring-red-400' : 'border-gray-200 focus:ring-blue-500 focus:border-blue-400'
                }`}
              />
              <button
                onClick={save} disabled={saving}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60 shrink-0"
              >
                {saving
                  ? <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  : <Icon name="Check" size={14} />
                }
                Guardar
              </button>
              <button onClick={cancel} className="p-2.5 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors shrink-0">
                <Icon name="X" size={15} />
              </button>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            {hasMinimo && (
              <button
                onClick={clear} disabled={saving}
                className="text-xs text-gray-400 hover:text-red-500 underline underline-offset-2 transition-colors"
              >
                Quitar alerta de stock mínimo
              </button>
            )}
          </div>
        ) : hasMinimo ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-gray-800 tabular-nums">{product.stock_minimo}</span>
                <span className="text-xs text-gray-400">unidades mínimas</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {product.stock_actual != null
                  ? product.stock_actual <= product.stock_minimo
                    ? '⚠️ Stock actual por debajo del mínimo'
                    : `Quedan ${product.stock_actual - product.stock_minimo} unidades sobre el mínimo`
                  : 'Registra stock para activar el control'
                }
              </p>
            </div>
            <button
              onClick={start}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 px-3 py-2 rounded-xl transition-colors shrink-0"
            >
              <Icon name="Pencil" size={13} />
              Editar
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-400">
              Sin alerta configurada.{' '}
              <span className="text-gray-500">El stock no generará avisos.</span>
            </p>
            <button
              onClick={start}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition-colors shrink-0 whitespace-nowrap"
            >
              <Icon name="Bell" size={13} />
              Configurar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ficha del producto ────────────────────────────────────────────────────────

function ProductCard({ product, businessId, onBack, onMinimoSave, onMovementDone, movements, loadingMov }) {
  const status = stockStatus(product);
  const catSt  = catalogStatus(product);

  return (
    <div className="space-y-4 max-w-2xl mx-auto">

      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-600 transition-colors group"
      >
        <Icon name="ArrowLeft" size={15} className="group-hover:-translate-x-0.5 transition-transform" />
        Volver al inventario
      </button>

      {/* Ficha principal */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="p-5 flex items-start gap-4">
          {product.thumbnail_url ? (
            <img src={product.thumbnail_url} alt={product.name}
              className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-gray-100" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center shrink-0">
              <Icon name="Package" size={28} className="text-gray-300" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 leading-snug">{product.name}</h2>

            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {product.public_code && (
                <span className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-lg font-mono font-semibold">
                  <Icon name="Hash" size={11} />{product.public_code}
                </span>
              )}
              {product.sku && (
                <span className="text-xs bg-gray-50 text-gray-700 border border-gray-200 px-2 py-0.5 rounded-lg font-mono">
                  SKU: {product.sku}
                </span>
              )}
              {product.barcode && (
                <span className="flex items-center gap-1 text-xs bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-lg font-mono">
                  <Icon name="Barcode" size={11} />{product.barcode}
                </span>
              )}
              {product.category && (
                <span className="text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">{product.category}</span>
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
        <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1 font-medium">Stock actual</p>
            {product.stock_actual != null ? (
              <p className={`text-4xl font-black leading-none tabular-nums ${
                status === 'agotado' ? 'text-red-600' :
                status === 'bajo'    ? 'text-amber-600' :
                status === 'ok'      ? 'text-emerald-600' : 'text-gray-400'
              }`}>
                {product.stock_actual}
              </p>
            ) : (
              <p className="text-xs text-gray-400 italic leading-snug mt-1">No configurado</p>
            )}
          </div>
          <div className="text-center flex flex-col items-center justify-center">
            <p className="text-xs text-gray-400 mb-2 font-medium">Estado</p>
            <StatusBadge status={status} />
          </div>
        </div>
        {product.stock_actual == null && (
          <div className="border-t border-dashed border-blue-100 px-5 py-3 bg-blue-50/40">
            <p className="text-xs text-blue-700 leading-snug">
              Registra una <strong>entrada</strong> abajo para configurar el stock inicial de este producto.
            </p>
          </div>
        )}
      </div>

      {/* Stock mínimo */}
      <MinimoPanel product={product} onSave={onMinimoSave} />

      {/* Movimiento */}
      <MovementPanel product={product} businessId={businessId} onDone={onMovementDone} />

      {/* Historial */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center">
            <Icon name="ClipboardList" size={13} className="text-gray-400" />
          </div>
          <p className="text-sm font-bold text-gray-800">Historial de movimientos</p>
        </div>

        {loadingMov ? (
          <div className="py-8 flex justify-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : movements.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <Icon name="ClipboardList" size={20} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">Sin movimientos registrados</p>
          </div>
        ) : (
          <div className="px-5 py-3 divide-y divide-gray-50">
            {movements.map(m => {
              const cfg   = MOVEMENT_TYPES[m.type] || MOVEMENT_TYPES.entrada;
              const isOut = ['salida', 'salida_manual', 'venta_tpv', 'venta_catalogo'].includes(m.type);
              const isAdj = m.type === 'ajuste';
              return (
                <div key={m.id} className="py-3.5 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    <Icon name={cfg.icon} size={14} className={cfg.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">{cfg.label}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400">{relativeDate(m.created_at)}</span>
                      {m.notes && (
                        <>
                          <span className="text-gray-200">·</span>
                          <span className="text-xs text-gray-400 italic truncate max-w-40">{m.notes}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-base font-black tabular-nums ${isOut ? 'text-red-500' : isAdj ? 'text-blue-500' : 'text-emerald-500'}`}>
                      {isAdj ? `= ${m.quantity}` : isOut ? `−${m.quantity}` : `+${m.quantity}`}
                    </p>
                    {m.stock_after != null && (
                      <p className="text-[10px] text-gray-400 tabular-nums">→ {m.stock_after}</p>
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
  const { business }                       = useAuth();
  const [products,       setProducts]      = useState([]);
  const [loading,        setLoading]       = useState(true);
  const [selected,       setSelected]      = useState(null);
  const [movements,      setMovements]     = useState([]);
  const [loadingMov,     setLoadingMov]    = useState(false);
  const [recentMov,      setRecentMov]     = useState([]);
  const [loadingRecent,  setLoadingRecent] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await getCrmStockProducts(business.id);
    setProducts(data || []);
    setLoading(false);
  }, [business?.id]);

  const loadRecentMovements = useCallback(async () => {
    if (!business?.id) return;
    setLoadingRecent(true);
    const { data } = await getCrmStockMovements(business.id, null);
    setRecentMov((data || []).slice(0, 15));
    setLoadingRecent(false);
  }, [business?.id]);

  const loadProductMovements = useCallback(async (productId) => {
    if (!business?.id) return;
    setLoadingMov(true);
    const { data } = await getCrmStockMovements(business.id, productId);
    setMovements(data || []);
    setLoadingMov(false);
  }, [business?.id]);

  useEffect(() => { loadProducts(); loadRecentMovements(); }, [loadProducts, loadRecentMovements]);

  const handleSelect = (p) => { setSelected(p); loadProductMovements(p.id); };
  const handleBack   = ()  => { setSelected(null); setMovements([]); };

  const handleMovementDone = async () => {
    await loadProducts();
    if (selected) loadProductMovements(selected.id);
    loadRecentMovements();
    setProducts(prev => {
      const updated = prev.find(p => p.id === selected?.id);
      if (updated) setSelected(updated);
      return prev;
    });
  };

  useEffect(() => {
    if (!selected) return;
    const fresh = products.find(p => p.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMinimoSave = async (productId, value) => {
    await updateStockMinimo(productId, value);
    await loadProducts();
  };

  const withControl = products.filter(p => p.stock_actual != null);
  const critical    = products.filter(p => ['agotado', 'bajo'].includes(stockStatus(p)));

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
            {loading
              ? 'Cargando…'
              : `${products.length} producto${products.length !== 1 ? 's' : ''} · ${withControl.length} con control${critical.length > 0 ? ` · ${critical.length} crítico${critical.length !== 1 ? 's' : ''}` : ''}`
            }
          </p>
        }
      />

      <DashboardLayoutContent>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Cargando inventario…</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Buscador — siempre visible cuando no hay producto seleccionado */}
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
