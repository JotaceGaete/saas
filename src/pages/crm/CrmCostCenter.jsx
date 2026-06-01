import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from 'contexts/AuthContext';
import { CRM_EARLY_ACCESS_MODE } from 'config/crmConfig';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import {
  getCostCenter,
  upsertCostCenter,
  getCostItems,
  createCostItem,
  updateCostItem,
  deleteCostItem,
  bulkCreateCostItems,
  getCrmSalesTotalsForPeriod,
  getCrmPurchases,
  createCrmPurchase,
  deleteCrmPurchase,
} from 'services/crmService';
import { getEffectivePlanSlug } from 'services/waBusinessService';

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const BUSINESS_TYPES = [
  { id: 'almacen',     label: 'Almacén / Minimarket', icon: '🏪' },
  { id: 'restaurant',  label: 'Restaurant / Cafetería', icon: '🍽️' },
  { id: 'peluqueria',  label: 'Peluquería / Barbería', icon: '✂️' },
  { id: 'taller',      label: 'Taller / Ferretería', icon: '🔧' },
  { id: 'ropa',        label: 'Tienda de ropa', icon: '👗' },
  { id: 'otro',        label: 'Otro', icon: '⊕' },
];

const CATEGORY_LABELS = {
  rent:      'Arriendo',
  salaries:  'Sueldos',
  utilities: 'Servicios básicos',
  services:  'Servicios / Software',
  taxes:     'Impuestos / Contabilidad',
  supplies:  'Insumos',
  other:     'Otros gastos',
};

function fmt(n) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
  }).format(n || 0);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ─── Asistente de configuración ───────────────────────────────────────────────

const TOTAL_STEPS = 4;

function StepBar({ step }) {
  return (
    <div className="flex gap-1.5 mb-8">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${
            i < step ? 'bg-blue-600' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

function MoneyInput({ value, onChange, placeholder = '0' }) {
  return (
    <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus-within:border-blue-400 transition-colors">
      <span className="text-sm text-gray-400 mr-2 select-none font-medium">$</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-sm text-gray-900 border-0 focus:outline-none bg-transparent"
      />
    </div>
  );
}

function CheckRow({ label, checked, onToggle, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <button
          type="button"
          onClick={onToggle}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            checked
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-gray-50 border-gray-200 text-gray-400'
          }`}
        >
          {checked ? 'Sí' : 'No aplica'}
        </button>
      </div>
      {checked && <div>{children}</div>}
    </div>
  );
}

function Onboarding({ businessId, month, year, onDone }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Paso 1
  const [bizType, setBizType] = useState('');

  // Paso 2 — gastos
  const [hasRent, setHasRent]             = useState(false);
  const [rent, setRent]                   = useState('');
  const [hasSalaries, setHasSalaries]     = useState(false);
  const [salaries, setSalaries]           = useState('');
  const [utilities, setUtilities]         = useState('');

  // Paso 3 — compras
  const [hasPurchases, setHasPurchases]   = useState(false);
  const [purchases, setPurchases]         = useState('');
  const [usesVat, setUsesVat]             = useState(true);

  // Paso 4 — meta y días
  const [profitGoal, setProfitGoal]       = useState('');
  const [openDays, setOpenDays]           = useState('22');

  const finish = async () => {
    setSaving(true);
    try {
      // Guardar configuración del mes
      await upsertCostCenter(businessId, month, year, {
        open_days: clamp(+openDays || 22, 1, 31),
        vat_rate: 19,
        uses_vat: usesVat,
        profit_goal: profitGoal !== '' ? +profitGoal : null,
        business_type: bizType || null,
        onboarding_done: true,
      });

      // Construir partidas desde respuestas
      const items = [];
      if (hasRent && +rent > 0)
        items.push({ name: 'Arriendo del local', amount: +rent, type: 'fixed', category: 'rent' });
      if (hasSalaries && +salaries > 0)
        items.push({ name: 'Sueldos', amount: +salaries, type: 'fixed', category: 'salaries' });
      if (+utilities > 0)
        items.push({ name: 'Servicios básicos (luz, agua, internet)', amount: +utilities, type: 'fixed', category: 'utilities' });

      if (items.length > 0) {
        await bulkCreateCostItems(businessId, month, year, items);
      }

      onDone();
    } catch (err) {
      console.error('Onboarding save error:', err);
      setSaving(false);
    }
  };

  const canNext1 = bizType !== '';
  const canNext4 = openDays !== '' && +openDays >= 1;

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
        <StepBar step={step} />

        {/* ── Paso 1: Tipo de negocio ─────────────────────────── */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">¿Qué tipo de negocio tienes?</h2>
            <p className="text-sm text-gray-400 mb-6">Esto nos ayuda a configurar todo más rápido.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BUSINESS_TYPES.map(bt => (
                <button
                  key={bt.id}
                  type="button"
                  onClick={() => setBizType(bt.id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    bizType === bt.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className="text-2xl">{bt.icon}</span>
                  <span className="text-xs font-medium text-gray-700 leading-tight">{bt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Paso 2: Gastos ──────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">¿Cuánto gastas al mes?</h2>
              <p className="text-sm text-gray-400">No tiene que ser exacto — un aproximado está bien.</p>
            </div>

            <CheckRow label="¿Pagas arriendo?" checked={hasRent} onToggle={() => setHasRent(v => !v)}>
              <MoneyInput value={rent} onChange={setRent} placeholder="Ej: 300.000" />
            </CheckRow>

            <CheckRow label="¿Tienes empleados o te pagas un sueldo?" checked={hasSalaries} onToggle={() => setHasSalaries(v => !v)}>
              <MoneyInput value={salaries} onChange={setSalaries} placeholder="Total sueldos del mes" />
            </CheckRow>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Luz, agua, internet (suma total mensual)
              </label>
              <MoneyInput value={utilities} onChange={setUtilities} placeholder="Ej: 50.000" />
            </div>
          </div>
        )}

        {/* ── Paso 3: Compras ─────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">¿Compras para vender?</h2>
              <p className="text-sm text-gray-400">Mercadería, insumos, materias primas.</p>
            </div>

            <CheckRow label="¿Compras productos o insumos para vender?" checked={hasPurchases} onToggle={() => setHasPurchases(v => !v)}>
              <MoneyInput value={purchases} onChange={setPurchases} placeholder="Aprox. al mes" />
            </CheckRow>

            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700 mb-3">¿Cobras IVA en tus ventas?</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setUsesVat(true)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    usesVat ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
                  }`}
                >
                  Sí, cobro con IVA
                </button>
                <button
                  type="button"
                  onClick={() => setUsesVat(false)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    !usesVat ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
                  }`}
                >
                  No / No sé
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Paso 4: Meta ────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">¿Cuánto quieres ganar?</h2>
              <p className="text-sm text-gray-400">Lo que queda en tu bolsillo después de pagar todo.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Meta de ganancia mensual</label>
              <MoneyInput value={profitGoal} onChange={setProfitGoal} placeholder="Ej: 500.000" />
              <p className="text-xs text-gray-400">Opcional. Te ayuda a calcular cuánto necesitas vender.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">¿Cuántos días abrirás este mes?</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={openDays}
                  onChange={e => setOpenDays(e.target.value)}
                  className="w-20 text-center text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-400"
                />
                <span className="text-sm text-gray-500">días</span>
              </div>
            </div>
          </div>
        )}

        {/* Navegación */}
        <div className="flex justify-between items-center mt-8">
          {step > 1 ? (
            <button type="button" onClick={() => setStep(s => s - 1)}
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1.5">
              <Icon name="ChevronLeft" size={15} />
              Atrás
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !canNext1}
              className="text-sm bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium flex items-center gap-1.5"
            >
              Siguiente
              <Icon name="ChevronRight" size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={saving || !canNext4}
              className="text-sm bg-blue-600 text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium"
            >
              {saving ? 'Guardando...' : 'Ver mi panel →'}
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        Puedes editar estos datos en cualquier momento.
      </p>
    </div>
  );
}

// ─── Acordeón ────────────────────────────────────────────────────────────────

function Accordion({ title, icon, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Icon name={icon} size={15} color="#6b7280" />
          {title}
          {badge && <span className="ml-1 text-sm font-bold text-gray-900">{badge}</span>}
        </span>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={16} color="#9ca3af" />
      </button>
      {open && <div className="px-5 pb-5 border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ─── Fila de gasto ────────────────────────────────────────────────────────────

function ExpenseRow({ item, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item);

  const save = async () => {
    await onUpdate(item.id, {
      name: draft.name,
      amount: +draft.amount,
      category: draft.category,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className="border-b border-gray-100 bg-blue-50/30">
        <td className="py-2 px-3">
          <input autoFocus value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
        </td>
        <td className="py-2 px-3">
          <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 bg-white">
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </td>
        <td className="py-2 px-3 text-right">
          <input type="number" min="0" value={draft.amount}
            onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
            className="w-28 text-sm text-right border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
        </td>
        <td className="py-2 px-3">
          <div className="flex gap-1">
            <button onClick={save} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors">Guardar</button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded transition-colors">Cancelar</button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-100 last:border-0 group hover:bg-gray-50/40 transition-colors">
      <td className="py-2.5 px-3 text-sm text-gray-900">{item.name}</td>
      <td className="py-2.5 px-3 text-sm text-gray-400">{CATEGORY_LABELS[item.category] || item.category}</td>
      <td className="py-2.5 px-3 text-sm font-semibold text-gray-900 text-right">{fmt(item.amount)}</td>
      <td className="py-2.5 px-3 w-14">
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => { setDraft(item); setEditing(true); }} className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors">
            <Icon name="Pencil" size={13} />
          </button>
          <button onClick={() => onDelete(item.id)} className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
            <Icon name="Trash2" size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddExpenseForm({ onAdd }) {
  const [form, setForm] = useState({ name: '', amount: '', category: 'other' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    setSaving(true);
    await onAdd({ name: form.name, amount: +form.amount, type: 'fixed', category: form.category });
    setForm({ name: '', amount: '', category: 'other' });
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="flex gap-2 flex-wrap items-end pt-4 mt-2 border-t border-gray-100">
      <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        placeholder="Nombre del gasto..."
        className="flex-1 min-w-32 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
        required />
      <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-white">
        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 bg-white focus-within:border-blue-400">
        <span className="text-xs text-gray-400 mr-1 select-none">$</span>
        <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          placeholder="0"
          className="w-24 text-sm text-gray-900 border-0 focus:outline-none bg-transparent" required />
      </div>
      <button type="submit" disabled={saving}
        className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
        {saving ? '...' : '+ Agregar'}
      </button>
    </form>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────

function Dashboard({
  center, items, sales,
  month, year,
  onUpdateItem, onDeleteItem, onAddItem,
  onEditSettings, businessId,
}) {
  const now = new Date();

  const effectiveSalesMonth = (center?.manual_sales_month != null) ? +center.manual_sales_month : sales.salesMonth;
  const effectiveSalesToday = (center?.manual_sales_today != null) ? +center.manual_sales_today : sales.salesToday;

  const totalExpenses = items.reduce((s, i) => s + (i.amount || 0), 0);
  const profitGoal = center?.profit_goal || 0;
  const goalMonth = totalExpenses + profitGoal;
  const goalDay = center?.open_days > 0 ? goalMonth / center.open_days : 0;

  const progressPct = goalMonth > 0 ? Math.min(100, Math.round((effectiveSalesMonth / goalMonth) * 100)) : null;

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const daysElapsed = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate();
  const projectedMonth = daysElapsed > 0
    ? (effectiveSalesToday / daysElapsed) * (center?.open_days || 22)
    : 0;

  const leftToGoal = Math.max(0, goalMonth - effectiveSalesMonth);

  // Semáforo basado en meta (no solo costos)
  let semColor, semBg, semEmoji, semTitle, semSub;
  if (goalMonth === 0) {
    semColor = 'text-gray-500'; semBg = 'bg-gray-50'; semEmoji = '⚪';
    semTitle = 'Configura tus gastos';
    semSub = 'Aún no tienes gastos registrados este mes.';
  } else if (progressPct >= 100) {
    semColor = 'text-green-700'; semBg = 'bg-green-50'; semEmoji = '🟢';
    semTitle = '¡Llegaste a tu meta!';
    semSub = `Vendiste ${fmt(effectiveSalesMonth)} de ${fmt(goalMonth)}.`;
  } else if (progressPct >= 90) {
    semColor = 'text-yellow-700'; semBg = 'bg-yellow-50'; semEmoji = '🟡';
    semTitle = 'Casi llegas';
    semSub = `Te faltan ${fmt(leftToGoal)} para cubrir todo.`;
  } else if (progressPct >= 60) {
    semColor = 'text-orange-600'; semBg = 'bg-orange-50'; semEmoji = '🟠';
    semTitle = 'Vas a la mitad del camino';
    semSub = `Te faltan ${fmt(leftToGoal)} para cubrir todo.`;
  } else {
    semColor = 'text-red-700'; semBg = 'bg-red-50'; semEmoji = '🔴';
    semTitle = 'Aún lejos de cubrir gastos';
    semSub = `Te faltan ${fmt(leftToGoal)} para cubrir todo.`;
  }

  const vatRate = center?.vat_rate || 19;
  const usesVat = center?.uses_vat !== false;

  return (
    <div className="space-y-4">

      {/* Semáforo */}
      <div className={`rounded-2xl px-5 py-4 ${semBg} flex items-center gap-4`}>
        <span className="text-4xl leading-none">{semEmoji}</span>
        <div className="min-w-0">
          <p className={`text-base font-bold ${semColor}`}>{semTitle}</p>
          <p className="text-sm text-gray-500">{semSub}</p>
        </div>
        {progressPct !== null && (
          <span className={`ml-auto text-2xl font-bold shrink-0 ${semColor}`}>{progressPct}%</span>
        )}
      </div>

      {/* Barra de progreso */}
      {goalMonth > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 px-5 py-4">
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-sm font-semibold text-gray-700">Avance del mes</span>
            <span className="text-xs text-gray-400">{fmt(effectiveSalesMonth)} de {fmt(goalMonth)}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                progressPct >= 100 ? 'bg-green-500' :
                progressPct >= 90 ? 'bg-yellow-400' :
                progressPct >= 60 ? 'bg-orange-400' : 'bg-red-400'
              }`}
              style={{ width: `${progressPct || 0}%` }}
            />
          </div>
          {leftToGoal > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Te faltan <span className="font-semibold text-gray-700">{fmt(leftToGoal)}</span> para llegar a tu meta
            </p>
          )}
        </div>
      )}

      {/* Tarjetas: hoy y este mes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 font-medium mb-1">Vendiste hoy</p>
          <p className="text-2xl font-bold text-blue-700">{fmt(effectiveSalesToday)}</p>
          {goalDay > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Necesitas <span className="font-medium text-gray-600">{fmt(goalDay)}</span> al día
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 font-medium mb-1">Llevas vendido este mes</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(effectiveSalesMonth)}</p>
          {projectedMonth > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Proyección: <span className={`font-medium ${projectedMonth >= goalMonth ? 'text-green-600' : 'text-orange-500'}`}>{fmt(projectedMonth)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Mis gastos del mes */}
      <Accordion title="Mis gastos del mes" icon="Receipt" badge={fmt(totalExpenses)} defaultOpen={items.length === 0}>
        <div className="pt-4">
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs font-medium text-gray-400 pb-2 px-3">Gasto</th>
                    <th className="text-left text-xs font-medium text-gray-400 pb-2 px-3 hidden sm:table-cell">Categoría</th>
                    <th className="text-right text-xs font-medium text-gray-400 pb-2 px-3">Monto</th>
                    <th className="w-14" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <ExpenseRow key={item.id} item={item} onUpdate={onUpdateItem} onDelete={onDeleteItem} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200">
                    <td colSpan={2} className="py-2.5 px-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">Total gastos</td>
                    <td className="py-2.5 px-3 text-sm font-bold text-gray-900 text-right">{fmt(totalExpenses)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mb-2">No tienes gastos registrados aún.</p>
          )}
          <AddExpenseForm onAdd={onAddItem} />
        </div>
      </Accordion>

      {/* Compras registradas */}
      <PurchasesSection
        businessId={businessId}
        month={month}
        year={year}
        usesVat={usesVat}
        vatRate={vatRate}
        effectiveSalesMonth={effectiveSalesMonth}
      />

      {/* Ajustes avanzados */}
      <Accordion title="Ajustes avanzados" icon="Settings">
        <AdvancedSettings center={center} businessId={businessId} month={month} year={year} onSave={onEditSettings} />
      </Accordion>

    </div>
  );
}

// ─── Compras registradas ──────────────────────────────────────────────────────

function PurchasesSection({ businessId, month, year, usesVat, vatRate, effectiveSalesMonth }) {
  const [purchases, setPurchases] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ supplier: '', description: '', amount: '', purchase_date: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCrmPurchases(businessId, month, year).then(data => {
      setPurchases(data);
      setLoaded(true);
    });
  }, [businessId, month, year]);

  const totalPurchases = purchases.reduce((s, p) => s + (p.amount || 0), 0);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.amount) return;
    setSaving(true);
    const p = await createCrmPurchase(businessId, month, year, {
      supplier: form.supplier || null,
      description: form.description || null,
      amount: +form.amount,
      purchase_date: form.purchase_date,
    });
    setPurchases(prev => [...prev, p]);
    setForm({ supplier: '', description: '', amount: '', purchase_date: new Date().toISOString().slice(0, 10) });
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await deleteCrmPurchase(id);
    setPurchases(prev => prev.filter(p => p.id !== id));
  };

  const rate = (vatRate || 19) / 100;
  const vatSales = usesVat ? effectiveSalesMonth * rate / (1 + rate) : 0;
  const vatPurchases = usesVat ? totalPurchases * rate / (1 + rate) : 0;
  const vatNet = vatSales - vatPurchases;

  return (
    <Accordion
      title="Compras registradas"
      icon="ShoppingCart"
      badge={totalPurchases > 0 ? fmt(totalPurchases) : null}
    >
      <div className="pt-4 space-y-4">
        {/* Tabla de compras */}
        {loaded && purchases.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 pb-2 px-3">Proveedor</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-2 px-3 hidden sm:table-cell">Descripción</th>
                  <th className="text-left text-xs font-medium text-gray-400 pb-2 px-3">Fecha</th>
                  <th className="text-right text-xs font-medium text-gray-400 pb-2 px-3">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0 group hover:bg-gray-50/40 transition-colors">
                    <td className="py-2.5 px-3 text-sm text-gray-900">{p.supplier || <span className="text-gray-300 italic">—</span>}</td>
                    <td className="py-2.5 px-3 text-sm text-gray-400 hidden sm:table-cell">{p.description || '—'}</td>
                    <td className="py-2.5 px-3 text-sm text-gray-500 whitespace-nowrap">
                      {p.purchase_date
                        ? new Date(p.purchase_date + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
                        : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-sm font-semibold text-gray-900 text-right">{fmt(p.amount)}</td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 transition-all"
                      >
                        <Icon name="Trash2" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={3} className="py-2.5 px-3 text-xs font-semibold text-gray-500">Total compras</td>
                  <td className="py-2.5 px-3 text-sm font-bold text-gray-900 text-right">{fmt(totalPurchases)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : loaded ? (
          <p className="text-sm text-gray-400">No hay compras registradas este mes.</p>
        ) : null}

        {/* Formulario agregar */}
        <form onSubmit={handleAdd} className="flex gap-2 flex-wrap items-end pt-3 border-t border-gray-100">
          <input
            value={form.supplier}
            onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
            placeholder="Proveedor (opcional)"
            className="flex-1 min-w-28 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
          />
          <input
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            className="flex-1 min-w-28 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
          />
          <input
            type="date"
            value={form.purchase_date}
            onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-white"
          />
          <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 bg-white focus-within:border-blue-400">
            <span className="text-xs text-gray-400 mr-1 select-none">$</span>
            <input
              type="number"
              min="0"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="Total factura"
              className="w-28 text-sm text-gray-900 border-0 focus:outline-none bg-transparent"
              required
            />
          </div>
          <button type="submit" disabled={saving}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium whitespace-nowrap">
            {saving ? '...' : '+ Agregar'}
          </button>
        </form>

        {/* IVA estimado desde compras reales */}
        {usesVat && totalPurchases > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-3">IVA estimado</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">IVA de tus ventas</p>
                <p className="text-base font-bold text-gray-900">{fmt(vatSales)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">IVA de tus compras</p>
                <p className="text-base font-bold text-gray-900">{fmt(vatPurchases)}</p>
              </div>
              <div className={`rounded-xl p-3 ${vatNet > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <p className="text-xs text-gray-400 mb-1">Lo que le debes al SII</p>
                <p className={`text-base font-bold ${vatNet > 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(vatNet)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              Estimación referencial al {vatRate}%. No reemplaza tu contador.
            </p>
          </div>
        )}
        {usesVat && totalPurchases === 0 && loaded && (
          <p className="text-xs text-gray-400 pt-3 border-t border-gray-100">
            Registra compras para ver el IVA estimado del mes.
          </p>
        )}
      </div>
    </Accordion>
  );
}

// ─── Ajustes avanzados ────────────────────────────────────────────────────────

function AdvancedSettings({ center, businessId, month, year, onSave }) {
  const [openDays, setOpenDays]         = useState(center?.open_days ?? 22);
  const [vatRate, setVatRate]           = useState(center?.vat_rate ?? 19);
  const [usesVat, setUsesVat]           = useState(center?.uses_vat !== false);
  const [profitGoal, setProfitGoal]     = useState(center?.profit_goal ?? '');
  const [manualToday, setManualToday]   = useState(center?.manual_sales_today ?? '');
  const [manualMonth, setManualMonth]   = useState(center?.manual_sales_month ?? '');
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  const save = async () => {
    setSaving(true);
    const c = await upsertCostCenter(businessId, month, year, {
      open_days: clamp(+openDays || 22, 1, 31),
      vat_rate: +vatRate || 19,
      uses_vat: usesVat,
      profit_goal: profitGoal !== '' ? +profitGoal : null,
      manual_sales_today: manualToday !== '' ? +manualToday : null,
      manual_sales_month: manualMonth !== '' ? +manualMonth : null,
      onboarding_done: true,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSave(c);
  };

  return (
    <div className="pt-4 space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Días hábiles del mes</label>
          <input type="number" min="1" max="31" value={openDays} onChange={e => setOpenDays(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Meta de ganancia ($)</label>
          <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 focus-within:border-blue-400">
            <span className="text-xs text-gray-400 mr-1">$</span>
            <input type="number" min="0" value={profitGoal} onChange={e => setProfitGoal(e.target.value)}
              placeholder="0"
              className="w-full text-sm border-0 focus:outline-none bg-transparent" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Tasa IVA %</label>
          <input type="number" min="0" max="50" step="0.5" value={vatRate} onChange={e => setVatRate(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Corrección ventas hoy</label>
          <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 focus-within:border-blue-400">
            <span className="text-xs text-gray-400 mr-1">$</span>
            <input type="number" min="0" value={manualToday} onChange={e => setManualToday(e.target.value)}
              placeholder="Automático"
              className="w-full text-sm border-0 focus:outline-none bg-transparent placeholder-gray-300" />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Corrección ventas del mes</label>
          <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 focus-within:border-blue-400">
            <span className="text-xs text-gray-400 mr-1">$</span>
            <input type="number" min="0" value={manualMonth} onChange={e => setManualMonth(e.target.value)}
              placeholder="Automático"
              className="w-full text-sm border-0 focus:outline-none bg-transparent placeholder-gray-300" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            onClick={() => setUsesVat(v => !v)}
            className={`w-9 h-5 rounded-full transition-colors ${usesVat ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform shadow ${usesVat ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-gray-600">Cobro IVA en mis ventas</span>
        </label>
      </div>

      <button onClick={save} disabled={saving}
        className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
        {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar'}
      </button>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CrmCostCenter() {
  const { business } = useAuth();
  const planSlug = getEffectivePlanSlug(
    business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt
  );
  const isPro = CRM_EARLY_ACCESS_MODE || planSlug === 'business';

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());

  const [center, setCenter] = useState(null);
  const [items, setItems]   = useState([]);
  const [sales, setSales]   = useState({ salesMonth: 0, salesToday: 0 });
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [c, its, s] = await Promise.all([
      getCostCenter(business.id, month, year),
      getCostItems(business.id, month, year),
      getCrmSalesTotalsForPeriod(business.id, month, year),
    ]);
    setCenter(c);
    setItems(its);
    setSales(s);
    setShowOnboarding(!c?.onboarding_done);
    setLoading(false);
  }, [business?.id, month, year]);

  useEffect(() => { load(); }, [load]);

  const handleOnboardingDone = () => {
    load();
    setShowOnboarding(false);
  };

  const handleAddItem = async (fields) => {
    const it = await createCostItem(business.id, month, year, fields);
    setItems(prev => [...prev, it]);
  };

  const handleUpdateItem = async (id, fields) => {
    const it = await updateCostItem(id, fields);
    setItems(prev => prev.map(x => x.id === id ? it : x));
  };

  const handleDeleteItem = async (id) => {
    await deleteCostItem(id);
    setItems(prev => prev.filter(x => x.id !== id));
  };

  if (!isPro) {
    return (
      <DashboardLayoutContent>
        <PanelHeader title="¿Estoy ganando dinero?" subtitle="Termómetro financiero de tu negocio" />
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
            <Icon name="BarChart2" size={24} color="#2563eb" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Funcionalidad Business</h3>
          <p className="text-sm text-gray-500 max-w-sm">
            El termómetro financiero requiere el plan Business. Actualiza tu plan para acceder.
          </p>
        </div>
      </DashboardLayoutContent>
    );
  }

  return (
    <DashboardLayoutContent>
      <PanelHeader
        title="¿Estoy ganando dinero?"
        subtitle={showOnboarding ? 'Cuéntanos sobre tu negocio — 2 minutos' : `${MONTHS[month - 1]} ${year}`}
      />

      {/* Selector de mes — solo en panel */}
      {!showOnboarding && !loading && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
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
          <button
            type="button"
            onClick={() => setShowOnboarding(true)}
            className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
          >
            <Icon name="Edit3" size={13} />
            Editar mis datos
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : showOnboarding ? (
        <Onboarding
          businessId={business.id}
          month={month}
          year={year}
          onDone={handleOnboardingDone}
        />
      ) : (
        <Dashboard
          center={center}
          items={items}
          sales={sales}
          month={month}
          year={year}
          onAddItem={handleAddItem}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
          onEditSettings={(c) => setCenter(c)}
          businessId={business.id}
        />
      )}
    </DashboardLayoutContent>
  );
}
