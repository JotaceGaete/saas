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
import { getOperatingDaysForMonth, calculateFixedCostPerOperatingDay } from 'lib/finance/operatingCalendar';

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

// Icono + acento pastel por categoría -- solo presentación, no altera datos.
// "other"/categorías desconocidas caen en un icono neutral.
const CATEGORY_STYLE = {
  rent:      { icon: 'Building2', bg: 'bg-blue-50',    fg: 'text-blue-600' },
  salaries:  { icon: 'Users',     bg: 'bg-violet-50',  fg: 'text-violet-600' },
  utilities: { icon: 'Zap',       bg: 'bg-amber-50',   fg: 'text-amber-600' },
  services:  { icon: 'Wifi',      bg: 'bg-cyan-50',    fg: 'text-cyan-600' },
  taxes:     { icon: 'Landmark',  bg: 'bg-slate-100',  fg: 'text-slate-600' },
  supplies:  { icon: 'Package',   bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  other:     { icon: 'Tag',       bg: 'bg-slate-100',  fg: 'text-slate-500' },
};
const DEFAULT_CATEGORY_STYLE = { icon: 'Receipt', bg: 'bg-slate-100', fg: 'text-slate-500' };

const fmt = (n, currency = 'CLP') => formatMoney(n, currency);

// ─── Selector de período (header) ─────────────────────────────────────────────
// Mismo patrón ya validado en CrmCostCenter.jsx (el Termómetro, al que esta
// misma pantalla enlaza): flechas anterior/siguiente + una única etiqueta de
// texto, en vez de dos <select> pegados uno al otro -- eso era la causa de
// que "Septiembre" y "2026" se vieran encimados.

function PeriodSelector({ month, year, onChange }) {
  const changeMonth = (delta) => {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) { nextMonth = 12; nextYear -= 1; }
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    onChange(nextMonth, nextYear);
  };

  return (
    <div className="inline-flex w-full items-center justify-between gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm sm:w-auto">
      <button
        type="button"
        onClick={() => changeMonth(-1)}
        aria-label="Mes anterior"
        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Icon name="ChevronLeft" size={16} />
      </button>
      <span className="flex items-center gap-1.5 px-1">
        <Icon name="Calendar" size={14} className="text-slate-400 shrink-0" />
        <span className="min-w-36 text-center text-sm font-semibold text-slate-800">{MONTHS[month - 1]} {year}</span>
      </span>
      <button
        type="button"
        onClick={() => changeMonth(1)}
        aria-label="Mes siguiente"
        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Icon name="ChevronRight" size={16} />
      </button>
    </div>
  );
}

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

function FixedCostRow({ item, onEdit, onDelete, currency = 'CLP' }) {
  const [confirming, setConfirming] = useState(false);
  const fromCash = item.source === 'cash_outflow';
  const style = fromCash
    ? { icon: 'Wallet', bg: 'bg-orange-50', fg: 'text-orange-600' }
    : (CATEGORY_STYLE[item.category] || DEFAULT_CATEGORY_STYLE);

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    await deleteCostItem(item.id);
    onDelete();
  };

  return (
    <div className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.bg}`}>
        <Icon name={style.icon} size={17} className={style.fg} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="truncate font-medium text-slate-900">{item.name || CATEGORY_LABELS[item.category] || 'Costo'}</p>
          {fromCash && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
              <Icon name="Wallet" size={9} />
              Desde caja
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">{CATEGORY_LABELS[item.category] || item.category}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="font-semibold tabular-nums text-slate-900">{fmt(item.amount, currency)}</span>
        {fromCash ? (
          <span
            title="Registrado desde Caja — editar desde el módulo de Caja"
            className="p-2 text-slate-300 cursor-not-allowed select-none"
          >
            <Icon name="Lock" size={14} />
          </span>
        ) : (
          <div className="flex items-center gap-0.5 opacity-50 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              onClick={() => onEdit(item)}
              aria-label={`Editar ${item.name || CATEGORY_LABELS[item.category] || 'costo'}`}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <Icon name="Pencil" size={14} />
            </button>
            <button
              onClick={handleDelete}
              aria-label={confirming ? 'Confirmar eliminar' : `Eliminar ${item.name || CATEGORY_LABELS[item.category] || 'costo'}`}
              className={`rounded-lg p-2 transition-colors ${
                confirming ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'text-slate-400 hover:bg-slate-100 hover:text-red-500'
              }`}
              title={confirming ? 'Confirmar eliminar' : 'Eliminar'}
            >
              {confirming ? <Icon name="Check" size={14} /> : <Icon name="Trash2" size={14} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tarjeta costos fijos ───────────────────────────────────────────────────────

function FixedCostsCard({ items, businessId, month, year, onReload, currency = 'CLP' }) {
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem]   = useState(null);
  // CAJA-COSTOS-1 — el total de esta tarjeta ("Costos fijos mensuales")
  // debe sumar SOLO type='fixed'. Antes sumaba todos los items sin
  // filtrar, incluidos los variables creados automáticamente desde Caja
  // (source='cash_outflow'), inflando el total fijo -- ver auditoría
  // CAJA vs COSTOS. Esos items variables siguen visibles en la misma
  // lista (no se ocultan datos), solo se excluyen de este total.
  const fixedItems = items.filter(i => i.type === 'fixed');
  const variableItems = items.filter(i => i.type !== 'fixed');
  const total = fixedItems.reduce((s, i) => s + (i.amount || 0), 0);
  const variableTotal = variableItems.reduce((s, i) => s + (i.amount || 0), 0);

  const handleEdit = (item) => { setEditItem(item); setShowModal(true); };
  const handleClose = () => { setShowModal(false); setEditItem(null); };
  const handleSaved = () => { handleClose(); onReload(); };
  const handleAdd = () => { setEditItem(null); setShowModal(true); };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50">
            <Icon name="Building2" size={16} className="text-blue-600" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">Costos fijos mensuales</p>
            <p className="text-sm text-slate-500">Arriendo, servicios, sueldos y otros gastos recurrentes.</p>
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Icon name="Plus" size={14} />
          Agregar costo
        </button>
      </div>

      <div className="border-t border-slate-100">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center px-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
              <Icon name="Building2" size={22} className="text-slate-300" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-500">Sin costos fijos registrados</p>
            <p className="mt-1 max-w-xs text-sm text-slate-400">Agrega arriendo, sueldos, servicios básicos y otros gastos que se repiten cada mes.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {items.map(item => (
              <FixedCostRow key={item.id} item={item} onEdit={handleEdit} onDelete={onReload} currency={currency} />
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-600">Total costos fijos</span>
            <span className="text-lg font-bold tabular-nums text-slate-900">{fmt(total, currency)}</span>
          </div>
          {variableTotal > 0 && (
            <p className="mt-1.5 text-xs text-slate-400">
              No incluye {fmt(variableTotal, currency)} en gastos variables desde Caja (marcados "Desde caja" arriba).
            </p>
          )}
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

// ─── Hero financiero ───────────────────────────────────────────────────────────
// OPERATING-CALENDAR-1 — el "costo fijo diario" del hero usa el MISMO helper
// que el Termómetro (CrmCostCenter.jsx): días operativos configurados en
// wa_businesses.operating_days, no una constante fija de "días laborales"
// (antes: totalFijos / 20). Sin operatingDays configurado, operatingDaysInMonth
// = días calendario del mes -- modo legacy, ver src/lib/finance/operatingCalendar.js.

function CostsSummaryHero({
  totalFijos, totalVariableCash = 0, totalOperacional, currency, navigate,
  operatingDaysInMonth, fixedCostPerOperatingDay, operatingDaysConfigured, monthLabel,
}) {
  // CAJA-COSTOS-1 — totalFijos ya no incluye los costos variables creados
  // desde Caja (ver CrmCostos() más abajo); totalVariableCash los suma
  // aparte para que "Total costos del mes" siga siendo el total real y no
  // pierda esos montos silenciosamente.
  const totalMes = totalFijos + totalVariableCash + totalOperacional;
  const fijosShare = totalMes > 0 ? Math.round((totalFijos / totalMes) * 100) : 0;
  const variableShare = totalMes > 0 ? Math.round((totalVariableCash / totalMes) * 100) : 0;
  const comprasShare = Math.max(0, 100 - fijosShare - variableShare);

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-sm sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Total costos del mes</p>
          <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{fmt(totalMes, currency)}</p>

          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/40">Costos fijos</p>
              <p className="text-sm font-semibold tabular-nums text-white/90">{fmt(totalFijos, currency)}</p>
            </div>
            {totalVariableCash > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-white/40">Otros gastos (Caja)</p>
                <p className="text-sm font-semibold tabular-nums text-white/90">{fmt(totalVariableCash, currency)}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/40">Compras</p>
              <p className="text-sm font-semibold tabular-nums text-white/90">{fmt(totalOperacional, currency)}</p>
            </div>
          </div>

          {totalMes > 0 && (
            <div className="mt-4 max-w-xs">
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-blue-400" style={{ width: `${fijosShare}%` }} />
                {totalVariableCash > 0 && <div className="h-full bg-rose-400" style={{ width: `${variableShare}%` }} />}
                <div className="h-full bg-amber-400" style={{ width: `${comprasShare}%` }} />
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-white/40">
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" />Fijos {fijosShare}%</span>
                {totalVariableCash > 0 && (
                  <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />Otros {variableShare}%</span>
                )}
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Compras {comprasShare}%</span>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/crm/cost-center')}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/15 sm:w-auto"
        >
          <Icon name="BarChart2" size={15} />
          Ver Termómetro del Negocio
        </button>
      </div>

      {totalFijos > 0 && (
        <div className="mt-6 flex items-start gap-3 border-t border-white/10 pt-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Icon name="CalendarDays" size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-white/40">Costo fijo por día operativo</p>
            <p className="text-lg font-bold tabular-nums text-white">{fmt(fixedCostPerOperatingDay, currency)}</p>
            <p className="text-[11px] text-white/40">Basado en {operatingDaysInMonth} días operativos en {monthLabel}.</p>
            {!operatingDaysConfigured && (
              <p className="mt-1.5 text-[11px] text-amber-300/90">
                Estimación basada en todos los días del mes.{' '}
                <button
                  type="button"
                  onClick={() => navigate('/business-configuration?tab=operations')}
                  className="font-semibold underline hover:text-amber-200"
                >
                  Configura tus días de operación
                </button>{' '}
                para mejorar el cálculo.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tarjeta Compras y facturas ────────────────────────────────────────────────

function PurchasesCard({ purchaseTotals, navigate, currency = 'CLP', monthLabel }) {
  const hasError = Boolean(purchaseTotals?.error);
  const mercaderiaTotal  = purchaseTotals?.totals?.mercaderia?.total  || 0;
  const operacionalTotal = purchaseTotals?.totalOperational           || 0;
  const otherTotal       = purchaseTotals?.totals?.other?.total       || 0;
  const totalAmountAll   = purchaseTotals?.totalAmountAll             || 0;
  const hasData = mercaderiaTotal > 0 || operacionalTotal > 0 || otherTotal > 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
          <Icon name="Receipt" size={16} className="text-slate-600" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">Compras y facturas recibidas</p>
          <p className="text-sm text-slate-500">Mercadería, insumos y gastos variables.</p>
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-5">
        {hasError ? (
          <p className="mb-4 text-sm text-red-600">No se pudieron cargar las compras del período.</p>
        ) : hasData ? (
          <div className="mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Compras del mes</span>
              <span className="font-semibold tabular-nums text-slate-900">{fmt(totalAmountAll, currency)}</span>
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-3">
              {mercaderiaTotal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                    Mercadería
                  </span>
                  <span className="text-sm font-medium tabular-nums text-slate-700">{fmt(mercaderiaTotal, currency)}</span>
                </div>
              )}
              {operacionalTotal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                    Gastos operativos
                  </span>
                  <span className="text-sm font-medium tabular-nums text-slate-700">{fmt(operacionalTotal, currency)}</span>
                </div>
              )}
              {otherTotal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                    Otros / Servicios
                  </span>
                  <span className="text-sm font-medium tabular-nums text-slate-700">{fmt(otherTotal, currency)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-5 flex flex-col items-center py-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
              <Icon name="ReceiptText" size={22} className="text-slate-300" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-600">No has registrado compras o facturas en {monthLabel}.</p>
            <p className="mt-1 text-sm text-slate-400">Regístralas para conocer el costo real de operación de tu negocio.</p>
          </div>
        )}

        <button
          onClick={() => navigate('/proveedores')}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Icon name={hasData ? 'ExternalLink' : 'Plus'} size={14} />
          {hasData ? 'Ir a Compras y Facturas' : 'Registrar compra o factura'}
        </button>
      </div>
    </div>
  );
}

// ─── Tip Walinka ───────────────────────────────────────────────────────────────

function WalinkaFinancialTip() {
  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
          <Icon name="Lightbulb" size={14} className="text-blue-600" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-900">Tip Walinka</p>
          <p className="mt-1 text-sm leading-relaxed text-blue-800/80">
            Registrar tus compras y facturas permite que el Termómetro calcule mejor la rentabilidad real de tu negocio.
          </p>
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
    // Mismo rango [from, to) que usaba crmService.getPurchaseTotalsForPeriod.
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to   = new Date(year, month, 1).toISOString().slice(0, 10);
    const [items, pt] = await Promise.all([
      getCostItems(business.id, month, year),
      getSupplierPurchaseTotalsForPeriod(business.id, from, to),
    ]);
    setCostItems(items || []);
    setPurchaseTotals(pt);
    setLoading(false);
  }, [business?.id, month, year]);

  useEffect(() => { load(); }, [load]);

  const handlePeriodChange = (nextMonth, nextYear) => { setMonth(nextMonth); setYear(nextYear); };

  // CAJA-COSTOS-1 — totalFijos (usado por el hero, el total del mes y el
  // costo fijo por día operativo) debe sumar SOLO type='fixed'. Antes
  // sumaba todo costItems sin filtrar, incluidos los variables creados
  // automáticamente desde una salida de Caja (source='cash_outflow'),
  // inflando el total mostrado como "fijo" -- ver auditoría CAJA vs
  // COSTOS y FixedCostsCard más abajo (mismo criterio, mismo filtro).
  const totalFijos      = costItems.filter(i => i.type === 'fixed').reduce((s, i) => s + (i.amount || 0), 0);
  // Costos variables ya existentes (hoy, únicamente los creados desde Caja
  // con propósito new_expense, source='cash_outflow') -- se muestran aparte
  // para que "Total costos del mes" no pierda estos montos.
  const totalVariableCash = costItems.filter(i => i.type !== 'fixed').reduce((s, i) => s + (i.amount || 0), 0);
  const totalOperacional = purchaseTotals?.totalOperational || 0;

  // OPERATING-CALENDAR-1 — mismo helper que CrmCostCenter.jsx (Termómetro).
  const operatingDays = business?.operatingDays ?? null;
  const operatingDaysInMonth = getOperatingDaysForMonth(operatingDays, month, year);
  const fixedCostPerOperatingDay = calculateFixedCostPerOperatingDay(totalFijos, operatingDaysInMonth);
  const operatingDaysConfigured = operatingDays != null;

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

  const periodSelector = <PeriodSelector month={month} year={year} onChange={handlePeriodChange} />;

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
            Controla los gastos de tu negocio y entiende cuánto necesitas vender para cubrirlos.
          </p>
        }
        mobileActions={periodSelector}
      >
        {periodSelector}
      </PanelHeader>

      <DashboardLayoutContent innerClassName="lg:max-w-7xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {purchaseTotals?.error && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-600">
                <Icon name="AlertTriangle" size={16} className="shrink-0 mt-0.5" />
                <span>
                  No se pudieron cargar las compras del período. El total de costos del mes y el
                  desglose de compras/gastos pueden estar incompletos.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="flex flex-col gap-6 xl:col-span-2">
                <CostsSummaryHero
                  totalFijos={totalFijos}
                  totalVariableCash={totalVariableCash}
                  totalOperacional={totalOperacional}
                  currency={business?.currency}
                  navigate={navigate}
                  operatingDaysInMonth={operatingDaysInMonth}
                  fixedCostPerOperatingDay={fixedCostPerOperatingDay}
                  operatingDaysConfigured={operatingDaysConfigured}
                  monthLabel={MONTHS[month - 1]}
                />

                <FixedCostsCard
                  items={costItems}
                  businessId={business.id}
                  month={month}
                  year={year}
                  onReload={load}
                  currency={business?.currency}
                />
              </div>

              <div className="flex flex-col gap-6 xl:col-span-1">
                <PurchasesCard
                  purchaseTotals={purchaseTotals}
                  navigate={navigate}
                  currency={business?.currency}
                  monthLabel={MONTHS[month - 1]}
                />
                <WalinkaFinancialTip />
              </div>
            </div>
          </>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
