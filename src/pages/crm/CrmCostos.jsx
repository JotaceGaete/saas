import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { canUseFeature } from 'config/planFeatures';
import { formatMoney } from 'utils/formatMoney';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import {
  getCostItems,
  createCostItem,
  updateCostItem,
  deleteCostItem,
  getPurchaseTotalsForPeriod,
} from 'services/crmService';
import { getEffectivePlanSlug } from 'services/waBusinessService';

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const CATEGORIES = [
  { value: 'rent',      label: 'Arriendo' },
  { value: 'salaries',  label: 'Sueldos' },
  { value: 'utilities', label: 'Servicios básicos' },
  { value: 'services',  label: 'Servicios / Software' },
  { value: 'taxes',     label: 'Impuestos / Contabilidad' },
  { value: 'supplies',  label: 'Insumos' },
  { value: 'other',     label: 'Otros gastos' },
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

const CATEGORY_META = {
  rent:      { icon: 'Home',        color: '#2563eb', bg: '#eff6ff' },
  salaries:  { icon: 'Users',       color: '#7c3aed', bg: '#f5f3ff' },
  utilities: { icon: 'Zap',         color: '#d97706', bg: '#fffbeb' },
  services:  { icon: 'Globe',       color: '#0891b2', bg: '#ecfeff' },
  taxes:     { icon: 'FileText',    color: '#dc2626', bg: '#fef2f2' },
  supplies:  { icon: 'Package',     color: '#059669', bg: '#ecfdf5' },
  other:     { icon: 'Tag',         color: '#6b7280', bg: '#f9fafb' },
};

const fmt = (n) => formatMoney(n, 'CLP');

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

// ─── Modal añadir/editar costo fijo (sin cambios de lógica) ───────────────────

function CostItemModal({ item, businessId, month, year, onClose, onSaved }) {
  const isEdit = !!item?.id;
  const [category, setCategory] = useState(item?.category || 'rent');
  const [label,    setLabel]    = useState(item?.name || '');
  const [amount,   setAmount]   = useState(item?.amount?.toString() || '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Ingresa un monto válido'); return; }
    setSaving(true);
    try {
      const fields = {
        category,
        name: label.trim() || CATEGORY_LABELS[category] || 'Costo',
        amount: amt,
      };
      if (isEdit) {
        await updateCostItem(item.id, fields);
      } else {
        await createCostItem(businessId, month, year, fields);
      }
      onSaved();
    } catch (e) {
      setError('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">{isEdit ? 'Editar costo' : 'Agregar costo fijo'}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{MONTHS[month - 1]} {year}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <Icon name="X" size={16} />
          </button>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Categoría</label>
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); if (!label) setLabel(''); }}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Descripción (opcional)</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={CATEGORY_LABELS[category] || 'Descripción'}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Monto mensual</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">$</span>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Agregar costo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Fila de costo fijo modernizada ───────────────────────────────────────────

function CostRow({ item, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const fromCash = item.source === 'cash_outflow';
  const meta = CATEGORY_META[item.category] || CATEGORY_META.other;

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    await deleteCostItem(item.id);
    onDelete();
  };

  return (
    <div className={`group flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition-colors border-b border-gray-50 last:border-0 ${fromCash ? 'opacity-90' : ''}`}>
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
        style={{ backgroundColor: meta.bg }}
      >
        <Icon name={fromCash ? 'Wallet' : meta.icon} size={15} color={fromCash ? '#ea580c' : meta.color} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-800 truncate">{item.name || CATEGORY_LABELS[item.category] || 'Costo'}</p>
          {fromCash && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
              <Icon name="Wallet" size={9} />
              Desde caja
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">{CATEGORY_LABELS[item.category] || item.category}</p>
      </div>

      {/* Amount */}
      <span className="text-base font-black text-gray-900 tabular-nums shrink-0">{fmt(item.amount)}</span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {fromCash ? (
          <span title="Registrado desde Caja — editar desde el módulo de Caja" className="p-1.5 text-gray-300 cursor-not-allowed select-none">
            <Icon name="Lock" size={13} />
          </span>
        ) : (
          <>
            <button
              onClick={() => onEdit(item)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            >
              <Icon name="Pencil" size={13} />
            </button>
            <button
              onClick={handleDelete}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                confirming ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'text-gray-400 hover:bg-red-100 hover:text-red-500'
              }`}
              title={confirming ? 'Confirmar eliminar' : 'Eliminar'}
            >
              {confirming ? <Icon name="Check" size={13} /> : <Icon name="Trash2" size={13} />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Panel costos fijos ───────────────────────────────────────────────────────

function FixedCostsPanel({ items, businessId, month, year, onReload }) {
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const total = items.reduce((s, i) => s + (i.amount || 0), 0);

  const handleEdit = (item) => { setEditItem(item); setShowModal(true); };
  const handleClose = () => { setShowModal(false); setEditItem(null); };
  const handleSaved = () => { handleClose(); onReload(); };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <Icon name="Building2" size={16} color="#2563eb" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Costos fijos mensuales</p>
            <p className="text-[11px] text-gray-400">Arriendos, sueldos, servicios y otros costos recurrentes</p>
          </div>
        </div>
        <button
          onClick={() => { setEditItem(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95 shrink-0"
        >
          <Icon name="Plus" size={13} />
          Agregar costo
        </button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="py-12 text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
            <Icon name="Building2" size={22} color="#93c5fd" />
          </div>
          <p className="text-sm font-semibold text-gray-600">Sin costos fijos registrados</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">Agrega arriendos, sueldos, servicios básicos, etc.</p>
          <button
            onClick={() => { setEditItem(null); setShowModal(true); }}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors"
          >
            <Icon name="Plus" size={13} />
            Agregar primer costo
          </button>
        </div>
      ) : (
        <div>
          {items.map(item => (
            <CostRow key={item.id} item={item} onEdit={handleEdit} onDelete={onReload} />
          ))}
        </div>
      )}

      {/* Footer total */}
      {items.length > 0 && (
        <div className="flex items-center justify-between px-5 py-3 bg-blue-50/60 border-t border-blue-100">
          <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Total costos fijos</span>
          <span className="text-lg font-black text-blue-900 tabular-nums">{fmt(total)}</span>
        </div>
      )}

      {showModal && (
        <CostItemModal
          item={editItem}
          businessId={businessId}
          month={month}
          year={year}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ─── Card de Compras ──────────────────────────────────────────────────────────

function ComprasLinkPanel({ purchaseTotals, navigate }) {
  const mercaderiaTotal  = purchaseTotals?.totals?.mercaderia?.total  || 0;
  const operacionalTotal = purchaseTotals?.totalOperational           || 0;
  const hasData = mercaderiaTotal > 0 || operacionalTotal > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center">
          <Icon name="FileInput" size={16} color="#e11d48" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">Compras y Facturas recibidas</p>
          <p className="text-[11px] text-gray-400">Mercadería, gastos con y sin IVA</p>
        </div>
      </div>

      <div className="px-5 py-4">
        {hasData ? (
          <div className="space-y-2 mb-4">
            {mercaderiaTotal > 0 && (
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                  <span className="text-xs font-medium text-gray-600">Mercadería</span>
                </div>
                <span className="text-sm font-black text-gray-800 tabular-nums">{fmt(mercaderiaTotal)}</span>
              </div>
            )}
            {operacionalTotal > 0 && (
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-xs font-medium text-gray-600">Gastos operativos</span>
                </div>
                <span className="text-sm font-black text-gray-800 tabular-nums">{fmt(operacionalTotal)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4 py-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
              <Icon name="ShoppingCart" size={18} color="#d1d5db" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-500">Sin compras registradas este período</p>
              <p className="text-xs text-gray-400 mt-0.5">Cuando registres compras y facturas, las verás aquí</p>
            </div>
          </div>
        )}

        <button
          onClick={() => navigate('/crm/compras')}
          className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2"
        >
          <Icon name="ExternalLink" size={14} />
          Ir a Compras y Facturas
        </button>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, palette = 'gray' }) {
  const palettes = {
    gray:   { border: 'border-gray-100',   iconBg: 'bg-gray-50',     iconColor: 'text-gray-400',    val: 'text-gray-900'    },
    blue:   { border: 'border-blue-100',   iconBg: 'bg-blue-50',     iconColor: 'text-blue-500',    val: 'text-blue-900'    },
    violet: { border: 'border-violet-100', iconBg: 'bg-violet-50',   iconColor: 'text-violet-500',  val: 'text-violet-900'  },
    rose:   { border: 'border-rose-100',   iconBg: 'bg-rose-50',     iconColor: 'text-rose-500',    val: 'text-rose-700'    },
    amber:  { border: 'border-amber-100',  iconBg: 'bg-amber-50',    iconColor: 'text-amber-500',   val: 'text-amber-800'   },
  };
  const p = palettes[palette] || palettes.gray;

  return (
    <div className={`bg-white rounded-2xl border ${p.border} p-4 hover:shadow-md transition-shadow`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${p.iconBg}`}>
        <Icon name={icon} size={16} className={p.iconColor} />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{label}</p>
      <p className={`text-xl font-black tabular-nums leading-none ${p.val}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Resumen sidebar ──────────────────────────────────────────────────────────

function ResumenSidebar({ totalMes, totalFijos, totalOperacional, costItems, month, year }) {
  const days = daysInMonth(month, year);
  const avgDaily = totalMes > 0 ? Math.round(totalMes / days) : 0;
  const maxItem = costItems.length > 0
    ? costItems.reduce((a, b) => (b.amount > a.amount ? b : a), costItems[0])
    : null;

  const items = [
    {
      icon: 'Wallet',
      label: 'Total costos del mes',
      value: fmt(totalMes),
      color: 'text-gray-900',
      bg: 'bg-gray-50',
      iconColor: 'text-gray-500',
    },
    {
      icon: 'TrendingUp',
      label: 'Flujos del período',
      value: fmt(totalMes),
      color: 'text-blue-800',
      bg: 'bg-blue-50',
      iconColor: 'text-blue-500',
    },
    {
      icon: 'Calendar',
      label: 'Promedio diario',
      value: fmt(avgDaily),
      color: 'text-rose-700',
      bg: 'bg-rose-50',
      iconColor: 'text-rose-500',
    },
    {
      icon: 'CalendarDays',
      label: 'Días del período',
      value: `${days} días`,
      color: 'text-violet-800',
      bg: 'bg-violet-50',
      iconColor: 'text-violet-500',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Resumen del período</p>
        </div>
        <div className="divide-y divide-gray-50">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 px-4 py-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.bg}`}>
                <Icon name={item.icon} size={14} className={item.iconColor} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-400 leading-none mb-0.5">{item.label}</p>
                <p className={`text-sm font-black tabular-nums ${item.color}`}>{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {maxItem && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Mayor gasto registrado</p>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: (CATEGORY_META[maxItem.category] || CATEGORY_META.other).bg }}
            >
              <Icon
                name={(CATEGORY_META[maxItem.category] || CATEGORY_META.other).icon}
                size={15}
                color={(CATEGORY_META[maxItem.category] || CATEGORY_META.other).color}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 truncate">{maxItem.name || CATEGORY_LABELS[maxItem.category]}</p>
              <p className="text-[11px] text-gray-400">{CATEGORY_LABELS[maxItem.category]}</p>
            </div>
            <span className="text-sm font-black text-gray-900 tabular-nums shrink-0">{fmt(maxItem.amount)}</span>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
            <Icon name="Info" size={13} className="text-blue-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-blue-900">Centro de costos</p>
            <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
              Compara costos vs ventas y mide la rentabilidad desde el Termómetro.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CrmCostos() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const planSlug = getEffectivePlanSlug(
    business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt
  );
  const isPro = canUseFeature(planSlug, 'fixedCosts');

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const [costItems,      setCostItems]      = useState([]);
  const [purchaseTotals, setPurchaseTotals] = useState(null);
  const [loading,        setLoading]        = useState(true);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [items, pt] = await Promise.all([
      getCostItems(business.id, month, year),
      getPurchaseTotalsForPeriod(business.id, month, year),
    ]);
    setCostItems(items || []);
    setPurchaseTotals(pt);
    setLoading(false);
  }, [business?.id, month, year]);

  useEffect(() => { load(); }, [load]);

  const totalFijos       = costItems.reduce((s, i) => s + (i.amount || 0), 0);
  const totalOperacional = purchaseTotals?.totalOperational || 0;
  const totalMes         = totalFijos + totalOperacional;
  const days             = daysInMonth(month, year);
  const avgDaily         = totalMes > 0 ? Math.round(totalMes / days) : 0;

  if (!isPro) {
    return (
      <DashboardAppShell>
        <PanelHeader
          title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Costos</h1>}
          subtitle={<p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Gestión de costos fijos y gastos</p>}
        />
        <DashboardLayoutContent>
          <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <Icon name="Calculator" size={24} color="#2563eb" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Funcionalidad Business</h3>
            <p className="text-sm text-gray-500 max-w-sm">Requiere el plan Business.</p>
          </div>
        </DashboardLayoutContent>
      </DashboardAppShell>
    );
  }

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
            Costos
          </h1>
        }
        subtitle={
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            Gestión de costos fijos y gastos de tu negocio
          </p>
        }
      />

      <DashboardLayoutContent>
        <div className="mx-auto max-w-5xl space-y-5 pb-10">

          {/* ── Toolbar de período ──────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Selector mes/año */}
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
              <Icon name="Calendar" size={14} className="text-gray-400 shrink-0" />
              <select
                value={month}
                onChange={e => setMonth(+e.target.value)}
                className="text-sm font-semibold text-gray-700 border-0 focus:outline-none bg-transparent"
              >
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <span className="text-gray-200 select-none">·</span>
              <select
                value={year}
                onChange={e => setYear(+e.target.value)}
                className="text-sm font-semibold text-gray-700 border-0 focus:outline-none bg-transparent"
              >
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Termómetro */}
            <button
              onClick={() => navigate('/crm/cost-center')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-bold border border-indigo-200 transition-all hover:-translate-y-0.5 active:scale-95"
            >
              <Icon name="BarChart2" size={15} />
              Ver Termómetro
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent" />
              <p className="text-sm font-medium text-gray-400">Cargando costos…</p>
            </div>
          ) : (
            <>
              {/* ── Hero card ──────────────────────────────────────────────── */}
              <div
                className="relative rounded-3xl overflow-hidden p-6 text-white"
                style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2746 100%)',
                  boxShadow: '0 20px 60px rgba(15,23,42,0.35)',
                }}
              >
                {/* Subtle glow */}
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: 'radial-gradient(ellipse at 80% 50%, #3b82f6 0%, transparent 60%)',
                  }}
                />
                {/* Wave lines */}
                <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none overflow-hidden">
                  {[0,1,2,3].map(i => (
                    <div
                      key={i}
                      className="absolute rounded-full border border-white/40"
                      style={{
                        width: `${180 + i * 80}px`,
                        height: `${180 + i * 80}px`,
                        top: '50%',
                        right: `-${60 + i * 40}px`,
                        transform: 'translateY(-50%)',
                      }}
                    />
                  ))}
                </div>

                <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  {/* Left: big total */}
                  <div>
                    <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-2">
                      TOTAL COSTOS DEL MES · {MONTHS[month - 1].toUpperCase()} {year}
                    </p>
                    <p className="text-4xl lg:text-5xl font-black tabular-nums leading-none mb-3" style={{ letterSpacing: '-0.03em' }}>
                      {fmt(totalMes)}
                    </p>
                    <div className="flex flex-wrap gap-4">
                      {totalFijos > 0 && (
                        <div>
                          <p className="text-white/40 text-[10px] uppercase tracking-widest mb-0.5">Costos fijos</p>
                          <p className="text-white/90 text-sm font-bold tabular-nums">{fmt(totalFijos)}</p>
                        </div>
                      )}
                      {totalOperacional > 0 && (
                        <div>
                          <p className="text-white/40 text-[10px] uppercase tracking-widest mb-0.5">Compras / Gastos</p>
                          <p className="text-white/90 text-sm font-bold tabular-nums">{fmt(totalOperacional)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: metric pills */}
                  <div className="flex flex-wrap lg:flex-col gap-2 lg:items-end">
                    <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-3 py-2">
                      <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center">
                        <Icon name="TrendingUp" size={12} className="text-blue-300" />
                      </div>
                      <div>
                        <p className="text-white/40 text-[9px] uppercase tracking-widest">Promedio diario</p>
                        <p className="text-white text-sm font-black tabular-nums">{fmt(avgDaily)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-3 py-2">
                      <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center">
                        <Icon name="Hash" size={12} className="text-emerald-300" />
                      </div>
                      <div>
                        <p className="text-white/40 text-[9px] uppercase tracking-widest">Registros</p>
                        <p className="text-white text-sm font-black">{costItems.length}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-3 py-2">
                      <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center">
                        <Icon name="CalendarDays" size={12} className="text-violet-300" />
                      </div>
                      <div>
                        <p className="text-white/40 text-[9px] uppercase tracking-widest">Días del mes</p>
                        <p className="text-white text-sm font-black">{days} días</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── KPI row ────────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard
                  icon="Wallet"
                  label="Total del mes"
                  value={fmt(totalMes)}
                  palette="gray"
                />
                <KpiCard
                  icon="Building2"
                  label="Costos fijos"
                  value={fmt(totalFijos)}
                  sub={`${costItems.length} registro${costItems.length !== 1 ? 's' : ''}`}
                  palette="blue"
                />
                <KpiCard
                  icon="ShoppingCart"
                  label="Compras / Gastos"
                  value={fmt(totalOperacional)}
                  palette="rose"
                />
                <KpiCard
                  icon="BarChart2"
                  label="Promedio diario"
                  value={fmt(avgDaily)}
                  sub={`${days} días en el período`}
                  palette="amber"
                />
              </div>

              {/* ── Main 2-col layout ──────────────────────────────────────── */}
              <div className="flex flex-col lg:flex-row gap-5">
                {/* Left column */}
                <div className="flex-1 min-w-0 space-y-4">
                  <FixedCostsPanel
                    items={costItems}
                    businessId={business.id}
                    month={month}
                    year={year}
                    onReload={load}
                  />
                  <ComprasLinkPanel purchaseTotals={purchaseTotals} navigate={navigate} />
                </div>

                {/* Right sidebar */}
                <div className="w-full lg:w-72 shrink-0">
                  <ResumenSidebar
                    totalMes={totalMes}
                    totalFijos={totalFijos}
                    totalOperacional={totalOperacional}
                    costItems={costItems}
                    month={month}
                    year={year}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
