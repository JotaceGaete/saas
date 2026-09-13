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
} from 'services/crmService';
import { getSupplierPurchaseTotalsForPeriod } from 'services/supplierInvoiceService';
import { getEffectivePlanSlug } from 'services/waBusinessService';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CATEGORIES = [
  { value: 'rent', label: 'Arriendo' },
  { value: 'salaries', label: 'Sueldos' },
  { value: 'utilities', label: 'Servicios básicos' },
  { value: 'services', label: 'Servicios / Software' },
  { value: 'taxes', label: 'Impuestos / Contabilidad' },
  { value: 'supplies', label: 'Insumos' },
  { value: 'other', label: 'Otros gastos' },
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

const fmt = (n, currency = 'CLP') => formatMoney(n, currency);

// ─── Modal para añadir/editar costo fijo ──────────────────────────────────────

function CostItemModal({ item, businessId, month, year, onClose, onSaved }) {
  const isEdit = !!item?.id;
  const [category, setCategory] = useState(item?.category || 'rent');
  const [label, setLabel] = useState(item?.name || '');
  const [amount, setAmount] = useState(item?.amount?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full space-y-4 rounded-t-2xl bg-white p-5 sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{isEdit ? 'Editar costo' : 'Agregar costo fijo'}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">Categoría</label>
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); if (!label) setLabel(''); }}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">Descripción (opcional)</label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={CATEGORY_LABELS[category] || 'Descripción'}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">Monto mensual</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
        </div>

        {error && <p className="text-xs text-rose-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button type="button" onClick={save} disabled={saving}
            className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {saving ? 'Guardando...' : isEdit ? 'Guardar' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Fila de costo fijo ───────────────────────────────────────────────────────

function CostRow({ item, onEdit, onDelete, currency }) {
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    await deleteCostItem(item.id);
    onDelete();
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Icon name="Tag" size={13} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{item.name || CATEGORY_LABELS[item.category] || 'Costo'}</p>
          <p className="text-[11px] text-slate-400">{CATEGORY_LABELS[item.category] || item.category}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-bold tabular-nums text-slate-800">{fmt(item.amount, currency)}</span>
        <button type="button" onClick={() => onEdit(item)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Editar">
          <Icon name="Pencil" size={13} />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className={`rounded-lg p-1.5 text-sm font-medium transition-colors ${confirming ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'text-slate-400 hover:bg-slate-100 hover:text-rose-500'}`}
          title={confirming ? 'Confirmar eliminar' : 'Eliminar'}
          aria-label={confirming ? 'Confirmar eliminar' : 'Eliminar'}
        >
          {confirming ? <Icon name="Check" size={13} /> : <Icon name="Trash2" size={13} />}
        </button>
      </div>
    </div>
  );
}

// ─── Panel: Costos Fijos Mensuales ─────────────────────────────────────────────

function FixedCostsPanel({ items, businessId, month, year, onReload, currency }) {
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  // Este panel representa exclusivamente costos fijos configurados manualmente;
  // los variables (incluidos los sincronizados desde Caja) tienen su propio
  // tratamiento en el Termómetro y no deben aparecer acá.
  const fixedItems = items.filter(item => item.type === 'fixed' && item.source !== 'cash_outflow');
  const total = fixedItems.reduce((s, i) => s + (i.amount || 0), 0);

  const openCreate = () => { setEditItem(null); setShowModal(true); };
  const handleEdit = item => { setEditItem(item); setShowModal(true); };
  const handleClose = () => { setShowModal(false); setEditItem(null); };
  const handleSaved = () => { handleClose(); onReload(); };

  return (
    <section aria-label="Costos Fijos Mensuales" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Icon name="Building2" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Costos Fijos Mensuales</h2>
            <p className="text-xs text-slate-500">Arriendo, sueldos, servicios y más</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        >
          <Icon name="Plus" size={13} />Agregar
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total presupuestado</p>
          <p className="text-lg font-bold tabular-nums text-slate-900">{fmt(total, currency)}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {fixedItems.length} ítems
        </span>
      </div>

      <div className="mt-3">
        {fixedItems.length === 0 ? (
          <div className="py-8 text-center">
            <Icon name="Building2" size={26} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">Sin costos fijos configurados</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">
              Registra tus gastos recurrentes para calcular automáticamente tu punto de equilibrio diario.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Icon name="Plus" size={13} />Agregar
            </button>
          </div>
        ) : (
          fixedItems.map(item => (
            <CostRow key={item.id} item={item} onEdit={handleEdit} onDelete={onReload} currency={currency} />
          ))
        )}
      </div>

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
    </section>
  );
}

// ─── Panel: Compras y Facturas ─────────────────────────────────────────────────

function PurchaseLine({ dot, label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-xs text-slate-500"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</span>
      <span className="text-sm font-semibold tabular-nums text-slate-700">{value}</span>
    </div>
  );
}

function PurchasesPanel({ purchaseTotals, navigate, currency }) {
  const hasError = Boolean(purchaseTotals?.error);
  const mercaderiaTotal = purchaseTotals?.totals?.mercaderia?.total || 0;
  const operacionalTotal = purchaseTotals?.totalOperational || 0;
  const otherTotal = purchaseTotals?.totals?.other?.total || 0;
  // Suma informativa de todo lo registrado en el período (mercadería + gastos
  // con y sin IVA + otros/pendientes). No reemplaza ni reinterpreta las reglas
  // del Termómetro: totalOperational sigue siendo la única cifra "operativa".
  const totalRegistrado = purchaseTotals?.totalAmountAll || 0;
  const hasData = totalRegistrado > 0;

  return (
    <section aria-label="Compras y Facturas" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <Icon name="FileInput" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Compras y Facturas</h2>
            <p className="text-xs text-slate-500">Mercadería e insumos del período</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/proveedores')}
          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <Icon name="Plus" size={13} />Cargar
        </button>
      </div>

      {hasError ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <Icon name="AlertTriangle" size={14} className="mt-0.5 shrink-0" />
          <span>No se pudieron cargar las compras del período.</span>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total registrado en compras</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{fmt(totalRegistrado, currency)}</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {hasData ? 'Con facturas' : 'Sin facturas'}
            </span>
          </div>

          <div className="mt-3">
            {hasData ? (
              <div className="space-y-2">
                {mercaderiaTotal > 0 && <PurchaseLine dot="bg-blue-400" label="Mercadería" value={fmt(mercaderiaTotal, currency)} />}
                {operacionalTotal > 0 && <PurchaseLine dot="bg-amber-400" label="Gastos operativos" value={fmt(operacionalTotal, currency)} />}
                {otherTotal > 0 && <PurchaseLine dot="bg-slate-400" label="Otros / Servicios / pendientes" value={fmt(otherTotal, currency)} />}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Icon name="FileInput" size={26} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-500">Sin compras en este período</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">
                  Ingresa tus facturas para mantener actualizado el control de compras y proveedores.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => navigate('/proveedores')}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Ir al módulo completo de Compras
        <Icon name="ArrowRight" size={14} />
      </button>
    </section>
  );
}

// ─── Header: selector de período + acceso al Termómetro ───────────────────────

function HeaderActions({ month, year, onMonth, onYear, navigate }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
        <Icon name="Calendar" size={14} className="text-slate-400" />
        <select
          aria-label="Mes"
          value={month}
          onChange={e => onMonth(+e.target.value)}
          className="border-0 bg-transparent pr-1 text-sm text-slate-700 focus:outline-none"
        >
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select
          aria-label="Año"
          value={year}
          onChange={e => onYear(+e.target.value)}
          className="border-0 bg-transparent pr-1 text-sm text-slate-700 focus:outline-none"
        >
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <button
        type="button"
        onClick={() => navigate('/crm/cost-center')}
        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <Icon name="BarChart3" size={13} />Ver Termómetro
      </button>
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
  const [year, setYear] = useState(now.getFullYear());

  const [costItems, setCostItems] = useState([]);
  const [purchaseTotals, setPurchaseTotals] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    // Mismo rango [from, to) que usaba crmService.getPurchaseTotalsForPeriod.
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = new Date(year, month, 1).toISOString().slice(0, 10);
    const [items, pt] = await Promise.all([
      getCostItems(business.id, month, year),
      getSupplierPurchaseTotalsForPeriod(business.id, from, to),
    ]);
    setCostItems(items || []);
    setPurchaseTotals(pt);
    setLoading(false);
  }, [business?.id, month, year]);

  useEffect(() => { load(); }, [load]);

  if (!isPro) {
    return (
      <DashboardAppShell>
        <PanelHeader title="Costos" subtitle="Gestión de costos fijos y compras" />
        <DashboardLayoutContent>
          <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Icon name="BarChart3" size={24} className="text-slate-600" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Funcionalidad Business</h3>
            <p className="max-w-sm text-sm text-slate-500">Requiere el plan Business.</p>
          </div>
        </DashboardLayoutContent>
      </DashboardAppShell>
    );
  }

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Icon name="BarChart3" size={16} />
            </span>
            <h1 className="text-base font-bold text-slate-900">Centro de Costos y Egresos</h1>
          </div>
        }
        subtitle={
          <p className="text-xs text-slate-500">Gestión de gastos fijos y facturación de proveedores</p>
        }
        mobileActions={<HeaderActions month={month} year={year} onMonth={setMonth} onYear={setYear} navigate={navigate} />}
      >
        <HeaderActions month={month} year={year} onMonth={setMonth} onYear={setYear} navigate={navigate} />
      </PanelHeader>

      <DashboardLayoutContent innerClassName="lg:max-w-5xl">
        {loading ? (
          <div className="flex items-center justify-center py-16" role="status">
            <Icon name="Loader2" size={24} className="animate-spin text-slate-400" />
            <span className="sr-only">Cargando costos</span>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <FixedCostsPanel
              items={costItems}
              businessId={business.id}
              month={month}
              year={year}
              onReload={load}
              currency={business?.currency}
            />
            <PurchasesPanel purchaseTotals={purchaseTotals} navigate={navigate} currency={business?.currency} />
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
