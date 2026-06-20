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

const fmt = (n) => formatMoney(n, 'CLP');

// ─── Modal para añadir/editar costo fijo ──────────────────────────────────────

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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{isEdit ? 'Editar costo' : 'Agregar costo fijo'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Categoría</label>
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); if (!label) setLabel(''); }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Descripción (opcional)</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={CATEGORY_LABELS[category] || 'Descripción'}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Monto mensual</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold">
            {saving ? 'Guardando...' : isEdit ? 'Guardar' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Fila de costo fijo ───────────────────────────────────────────────────────

function CostRow({ item, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    await deleteCostItem(item.id);
    onDelete();
  };

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Icon name="Tag" size={13} color="#2563eb" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{item.name || CATEGORY_LABELS[item.category] || 'Costo'}</p>
          <p className="text-[11px] text-gray-400">{CATEGORY_LABELS[item.category] || item.category}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-bold text-gray-800">{fmt(item.amount)}</span>
        <button onClick={() => onEdit(item)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <Icon name="Pencil" size={13} />
        </button>
        <button
          onClick={handleDelete}
          className={`p-1.5 rounded-lg text-sm font-medium transition-colors ${
            confirming ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'text-gray-400 hover:bg-gray-100 hover:text-red-500'
          }`}
          title={confirming ? 'Confirmar eliminar' : 'Eliminar'}
        >
          {confirming ? <Icon name="Check" size={13} /> : <Icon name="Trash2" size={13} />}
        </button>
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
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
            <Icon name="Building2" size={15} color="#2563eb" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">Costos fijos mensuales</p>
            <p className="text-[11px] text-gray-400">Arriendo, sueldos, servicios, etc.</p>
          </div>
        </div>
        <button
          onClick={() => { setEditItem(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
        >
          <Icon name="Plus" size={12} />
          Agregar
        </button>
      </div>

      <div className="px-5">
        {items.length === 0 ? (
          <div className="py-8 text-center">
            <Icon name="Building2" size={28} color="#d1d5db" className="mx-auto mb-2" />
            <p className="text-sm text-gray-400">Sin costos fijos registrados</p>
            <p className="text-xs text-gray-300 mt-0.5">Agrega arriendo, sueldos, servicios básicos, etc.</p>
          </div>
        ) : (
          items.map(item => (
            <CostRow key={item.id} item={item} onEdit={handleEdit} onDelete={onReload} />
          ))
        )}
      </div>

      {items.length > 0 && (
        <div className="px-5 py-3 bg-blue-50 border-t border-blue-100 flex justify-between items-center">
          <span className="text-xs font-semibold text-blue-700">Total costos fijos</span>
          <span className="text-base font-black text-blue-900">{fmt(total)}</span>
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

// ─── Widget Compras (link) ────────────────────────────────────────────────────

function ComprasLinkPanel({ purchaseTotals, navigate }) {
  const mercaderiaTotal  = purchaseTotals?.totals?.mercaderia?.total  || 0;
  const operacionalTotal = purchaseTotals?.totalOperational           || 0;
  const hasData = mercaderiaTotal > 0 || operacionalTotal > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center">
          <Icon name="FileInput" size={15} color="#e11d48" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">Compras y Facturas recibidas</p>
          <p className="text-[11px] text-gray-400">Mercadería, gastos con y sin IVA</p>
        </div>
      </div>

      <div className="px-5 py-4">
        {hasData ? (
          <div className="space-y-2 mb-4">
            {mercaderiaTotal > 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                  <span className="text-xs text-gray-500">Mercadería</span>
                </div>
                <span className="text-sm font-semibold text-gray-700">{fmt(mercaderiaTotal)}</span>
              </div>
            )}
            {operacionalTotal > 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-xs text-gray-500">Gastos operativos</span>
                </div>
                <span className="text-sm font-semibold text-gray-700">{fmt(operacionalTotal)}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-4">Sin compras registradas este período</p>
        )}
        <button
          onClick={() => navigate('/crm/compras')}
          className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <Icon name="ExternalLink" size={14} />
          Ir a Compras y Facturas
        </button>
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

  const totalFijos      = costItems.reduce((s, i) => s + (i.amount || 0), 0);
  const totalOperacional = purchaseTotals?.totalOperational || 0;
  const totalMes         = totalFijos + totalOperacional;

  if (!isPro) {
    return (
      <DashboardAppShell>
        <PanelHeader title="Costos" subtitle="Gestión de costos fijos y compras" />
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
            {MONTHS[month - 1]} {year}
          </p>
        }
      />

      <DashboardLayoutContent>
        {/* Selector de período */}
        <div className="flex items-center gap-2 mb-5 max-w-lg mx-auto flex-wrap">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-3 py-2">
            <Icon name="Calendar" size={14} color="#9ca3af" />
            <select value={month} onChange={e => setMonth(+e.target.value)}
              className="text-sm text-gray-700 border-0 focus:outline-none bg-transparent pr-1">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(+e.target.value)}
              className="text-sm text-gray-700 border-0 focus:outline-none bg-transparent pr-1">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Link al Termómetro */}
          <button
            onClick={() => navigate('/crm/cost-center')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors"
          >
            <Icon name="BarChart2" size={13} />
            Ver Termómetro
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 max-w-lg mx-auto">

            {/* Resumen total del mes */}
            {totalMes > 0 && (
              <div className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 p-4 text-white">
                <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">Total costos del mes</p>
                <p className="text-3xl font-black tabular-nums">{fmt(totalMes)}</p>
                <div className="mt-3 flex gap-4 flex-wrap">
                  {totalFijos > 0 && (
                    <div>
                      <p className="text-white/50 text-[10px] uppercase tracking-wide">Fijos</p>
                      <p className="text-white/90 text-sm font-bold">{fmt(totalFijos)}</p>
                    </div>
                  )}
                  {totalOperacional > 0 && (
                    <div>
                      <p className="text-white/50 text-[10px] uppercase tracking-wide">Compras/Gastos</p>
                      <p className="text-white/90 text-sm font-bold">{fmt(totalOperacional)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Panel costos fijos */}
            <FixedCostsPanel
              items={costItems}
              businessId={business.id}
              month={month}
              year={year}
              onReload={load}
            />

            {/* Link a Compras */}
            <ComprasLinkPanel purchaseTotals={purchaseTotals} navigate={navigate} />

          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
