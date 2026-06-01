import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from 'contexts/AuthContext';
import { CRM_EARLY_ACCESS_MODE } from 'config/crmConfig';
import { formatMoney, fmtMoneyInput, parseMoneyInput } from 'utils/formatMoney';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import DashboardAppShell from 'components/ui/DashboardAppShell';
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
  getCrmDailySalesForPeriod,
  getVariableExpenses,
  createVariableExpense,
  updateVariableExpense,
  deleteVariableExpense,
} from 'services/crmService';
import { getEffectivePlanSlug } from 'services/waBusinessService';

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const BUSINESS_TYPES = [
  { id: 'almacen',    label: 'Almacén / Minimarket', icon: '🏪' },
  { id: 'restaurant', label: 'Restaurant / Café',     icon: '🍽️' },
  { id: 'peluqueria', label: 'Peluquería / Barbería', icon: '✂️' },
  { id: 'taller',     label: 'Taller / Ferretería',   icon: '🔧' },
  { id: 'ropa',       label: 'Tienda de ropa',         icon: '👗' },
  { id: 'otro',       label: 'Otro',                   icon: '⊕' },
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

const VAR_CATEGORY_LABELS = {
  cleaning:  'Limpieza',
  services:  'Servicios menores',
  repairs:   'Reparaciones',
  food:      'Comida / Café',
  transport: 'Transporte',
  supplies:  'Insumos',
  other:     'Otros',
};

const fmt = (n) => formatMoney(n, 'CLP');
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function todayISO() { return new Date().toISOString().slice(0, 10); }
function dayFromDate(dateStr) { return dateStr ? parseInt(dateStr.slice(8, 10), 10) : null; }
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

// ─── Estado del negocio ───────────────────────────────────────────────────────

function getState(salesToday, dailyCost) {
  if (dailyCost <= 0) return 'unconfigured';
  if (salesToday >= dailyCost) return 'winning';
  if (salesToday >= dailyCost * 0.75) return 'breaking';
  return 'losing';
}

const STATE = {
  winning: {
    emoji: '😊',
    label: 'Hoy vas ganando',
    bg: 'from-green-500 to-emerald-600',
    badge: 'bg-green-600/30 text-white',
    dotBg: 'bg-green-500',
  },
  breaking: {
    emoji: '😐',
    label: 'Estás cerca del equilibrio',
    bg: 'from-yellow-400 to-amber-500',
    badge: 'bg-yellow-600/30 text-white',
    dotBg: 'bg-yellow-400',
  },
  losing: {
    emoji: '😟',
    label: 'Hoy estás perdiendo dinero',
    bg: 'from-red-500 to-rose-600',
    badge: 'bg-red-600/30 text-white',
    dotBg: 'bg-red-400',
  },
  unconfigured: {
    emoji: '🏪',
    label: 'Activa tu termómetro',
    bg: 'from-blue-500 to-blue-600',
    badge: 'bg-blue-600/30 text-white',
    dotBg: 'bg-gray-300',
  },
};

// ─── Barra animada ────────────────────────────────────────────────────────────

function AnimatedBar({ pct, colorClass, height = 'h-4' }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(Math.min(100, pct)), 80);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div className={`w-full ${height} bg-white/20 rounded-full overflow-hidden`}>
      <div
        className={`h-full rounded-full ${colorClass} transition-all duration-700 ease-out`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ─── Tarjeta héroe ────────────────────────────────────────────────────────────

function HeroCard({ state, salesToday, dailyCost, varExpensesToday, totalExpenses, openDays }) {
  const s = STATE[state];
  // effectiveCost = costo fijo diario + gastos variables de hoy
  const effectiveCost = dailyCost + (varExpensesToday || 0);
  const pct = effectiveCost > 0 ? Math.round((salesToday / effectiveCost) * 100) : 0;
  const remaining = Math.max(0, effectiveCost - salesToday);
  const surplus   = Math.max(0, salesToday - effectiveCost);
  const hasVar    = varExpensesToday > 0;

  const subText = {
    winning:      `Ya cubriste el costo de hoy.\nTodo lo que vendas ahora es ganancia.`,
    breaking:     `Casi llegas — te faltan ${fmt(Math.ceil(remaining))} más para cubrir el día.`,
    losing:       hasVar
      ? `Hoy tu negocio necesita cubrir ${fmt(Math.ceil(effectiveCost))} considerando gastos extra.`
      : `Todavía no cubres los gastos de hoy.\nTe faltan ${fmt(Math.ceil(remaining))}.`,
    unconfigured: 'Registra tus gastos mensuales para ver tu termómetro.',
  }[state] || '';

  return (
    <div className={`rounded-2xl bg-gradient-to-br ${s.bg} p-7 shadow-lg select-none`}>
      {/* Encabezado */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1 min-w-0 pr-4">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-2">Estado hoy</p>
          <p className="text-3xl font-black leading-tight text-white">{s.label}</p>
          <p className="text-white/80 text-sm mt-2 leading-relaxed whitespace-pre-line">{subText}</p>
        </div>
        <span className="text-6xl leading-none shrink-0">{s.emoji}</span>
      </div>

      {/* Barra + números */}
      {effectiveCost > 0 && (
        <>
          <AnimatedBar pct={pct} colorClass="bg-white/70" height="h-4" />
          <div className="flex justify-between items-baseline mt-3">
            <span className="font-black text-white text-2xl tabular-nums">{fmt(salesToday)}</span>
            <span className="text-white/60 text-sm">de {fmt(Math.ceil(effectiveCost))} hoy</span>
          </div>

          {surplus > 0 && (
            <div className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${s.badge}`}>
              <Icon name="TrendingUp" size={13} />
              Vas {fmt(Math.floor(surplus))} arriba 🎯
            </div>
          )}

          {/* Desglose meta diaria */}
          <div className="mt-4 pt-4 border-t border-white/20 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-white/50 text-xs">Costo fijo diario</p>
              <p className="text-white/70 text-sm font-semibold">{fmt(Math.ceil(dailyCost))}</p>
            </div>
            {hasVar && (
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-xs">Gastos extra hoy</p>
                <p className="text-white/70 text-sm font-semibold">+{fmt(varExpensesToday)}</p>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-white/10">
              <p className="text-white/70 text-xs font-semibold">Necesitas cubrir hoy</p>
              <p className="text-white font-bold text-base">{fmt(Math.ceil(effectiveCost))}</p>
            </div>
          </div>
        </>
      )}

      {state === 'unconfigured' && (
        <div className="mt-4 pt-4 border-t border-white/20">
          <p className="text-white/60 text-xs">Usa "Mis gastos del mes" para comenzar.</p>
        </div>
      )}
    </div>
  );
}

// ─── Hoyo financiero ──────────────────────────────────────────────────────────

function HoyoCard({ totalExpenses, varExpensesMonth, salesMonth }) {
  const totalCosts = totalExpenses + (varExpensesMonth || 0);
  const gap = totalCosts - salesMonth;
  const covered = gap <= 0;
  const pct = totalCosts > 0 ? Math.min(100, Math.round((salesMonth / totalCosts) * 100)) : 0;
  const close = !covered && pct >= 80;
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setBarWidth(pct), 120); return () => clearTimeout(t); }, [pct]);

  if (totalCosts === 0) return null;

  return (
    <div className={`rounded-2xl border-2 p-5 transition-colors ${
      covered ? 'bg-green-50 border-green-200' :
      close   ? 'bg-yellow-50 border-yellow-200' :
                'bg-white border-gray-200'
    }`}>
      <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${
        covered ? 'text-green-500' : close ? 'text-yellow-500' : 'text-gray-400'
      }`}>
        {covered ? '🎉 ¡Saliste del agua!' : 'Lo que te falta para salir del agua'}
      </p>

      {/* Número protagonista */}
      <div className="mb-1">
        <p className={`text-5xl font-black leading-none tabular-nums ${
          covered ? 'text-green-600' : close ? 'text-yellow-600' : 'text-red-600'
        }`}>
          {covered ? '+' : '-'}{fmt(Math.abs(gap))}
        </p>
      </div>
      <p className={`text-sm mb-4 ${covered ? 'text-green-700 font-semibold' : 'text-gray-500'}`}>
        {covered
          ? 'Ya cubriste todos los gastos del mes.'
          : `Te faltan ${fmt(Math.abs(gap))} para cubrir los gastos del mes.`}
      </p>

      {/* Barra de cierre del hoyo */}
      <div className="space-y-2">
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              covered ? 'bg-green-500' : close ? 'bg-yellow-400' : 'bg-red-400'
            }`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>Ventas: <span className="font-semibold text-gray-600">{fmt(salesMonth)}</span></span>
          <span>{pct}% de {fmt(totalCosts)}</span>
        </div>
      </div>

      {/* Desglose de costos cuando hay gastos variables */}
      {varExpensesMonth > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Gastos fijos</span>
            <span className="font-medium text-gray-600">{fmt(totalExpenses)}</span>
          </div>
          <div className="flex justify-between">
            <span>Gastos variables</span>
            <span className="font-medium text-gray-600">+{fmt(varExpensesMonth)}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-gray-100 font-semibold text-gray-500">
            <span>Total a cubrir</span>
            <span>{fmt(totalCosts)}</span>
          </div>
        </div>
      )}

      {/* Mensajes de estado */}
      {covered && (
        <p className="text-sm text-green-600 mt-3">
          Desde este momento cada venta suma directamente a tu utilidad. 💪
        </p>
      )}
      {!covered && close && (
        <p className="text-sm text-yellow-700 font-medium mt-3">
          Vas muy bien — casi llegas 💪
        </p>
      )}
    </div>
  );
}

// ─── Calendario GitHub-style ──────────────────────────────────────────────────

function CalendarDot({ day, month, year, state, sales, varExp, dailyCost, isToday }) {
  const [showTip, setShowTip] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!showTip) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setShowTip(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTip]);

  const DOT_COLOR = {
    winning:      'bg-green-500 hover:bg-green-400',
    breaking:     'bg-yellow-400 hover:bg-yellow-300',
    losing:       'bg-red-400 hover:bg-red-300',
    future:       'bg-gray-100',
    nodata:       'bg-gray-200 hover:bg-gray-300',
    unconfigured: 'bg-gray-100',
  };

  const isFuture = state === 'future' || state === 'unconfigured';
  const effectiveCost = dailyCost + (varExp || 0);
  const diff = effectiveCost > 0 ? (sales || 0) - effectiveCost : null;
  const dateLabel = new Date(year, month - 1, day).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });

  // Align tooltip to avoid going off-screen edges
  const tipAlign = 'left-1/2 -translate-x-1/2';

  return (
    <div ref={ref} className="relative flex items-center justify-center aspect-square">
      <button
        type="button"
        disabled={isFuture}
        onClick={() => !isFuture && setShowTip(v => !v)}
        className={`w-full h-full rounded-md transition-colors ${DOT_COLOR[state] || 'bg-gray-100'} ${
          isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''
        } ${isFuture ? 'cursor-default' : 'cursor-pointer'}`}
      />
      {showTip && (
        <div className={`absolute bottom-full ${tipAlign} mb-2 z-30 bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl min-w-36`}>
          <p className="font-bold mb-1.5 text-white capitalize">{dateLabel}</p>
          <div className="space-y-0.5">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Ventas</span>
              <span className="font-semibold">{fmt(sales || 0)}</span>
            </div>
            {dailyCost > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Meta fija</span>
                <span className="font-semibold">{fmt(Math.ceil(dailyCost))}</span>
              </div>
            )}
            {varExp > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Gastos extra</span>
                <span className="font-semibold">+{fmt(varExp)}</span>
              </div>
            )}
            {diff !== null && (
              <div className="flex justify-between gap-4 pt-1 border-t border-gray-700 mt-1">
                <span className="text-gray-400">Resultado</span>
                <span className={`font-bold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {diff >= 0 ? '+' : ''}{fmt(Math.round(diff))}
                </span>
              </div>
            )}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

function HealthCalendar({ month, year, dailySales, dailyCost, dailyVarExpenses }) {
  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayDay = isCurrentMonth ? now.getDate() : daysInMonth;
  const firstDow = new Date(year, month - 1, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    if (d > todayDay) return { d, state: 'future', sales: 0, varExp: 0 };
    const sales = dailySales[d] || 0;
    const varExp = (dailyVarExpenses || {})[d] || 0;
    if (dailyCost <= 0) return { d, state: 'nodata', sales, varExp };
    return { d, state: getState(sales, dailyCost + varExp), sales, varExp };
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-gray-800">Historial del mes</p>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-500 inline-block" />Ganó</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-400 inline-block" />Empató</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-400 inline-block" />Perdió</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {['L','M','X','J','V','S','D'].map(d => (
          <div key={d} className="text-center text-xs text-gray-300 font-medium pb-0.5">{d}</div>
        ))}
        {Array.from({ length: offset }, (_, i) => <div key={`off-${i}`} />)}
        {days.map(({ d, state, sales, varExp }) => (
          <CalendarDot
            key={d}
            day={d}
            month={month}
            year={year}
            state={state}
            varExp={varExp}
            sales={sales}
            dailyCost={dailyCost}
            isToday={isCurrentMonth && d === todayDay}
          />
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center mt-3">Toca un día para ver detalles</p>
    </div>
  );
}

// ─── Panel de gastos ──────────────────────────────────────────────────────────

function ExpensesPanel({ items, onAdd, onUpdate, onDelete, totalExpenses, dailyCost }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [addForm, setAddForm] = useState({ name: '', amount: '', category: 'other' });
  const [saving, setSaving] = useState(false);

  const saveEdit = async () => {
    await onUpdate(editId, { name: draft.name, amount: parseMoneyInput(draft.amount), category: draft.category });
    setEditId(null);
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name || !addForm.amount) return;
    setSaving(true);
    await onAdd({ name: addForm.name, amount: parseMoneyInput(addForm.amount), type: 'fixed', category: addForm.category });
    setAddForm({ name: '', amount: '', category: 'other' });
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <Icon name="Receipt" size={15} color="#6b7280" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-800">Mis gastos del mes</p>
            <p className="text-xs text-gray-400">{items.length} gasto{items.length !== 1 ? 's' : ''} · {fmt(totalExpenses)}</p>
          </div>
        </div>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={16} color="#9ca3af" />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-2">
          {items.map(item => (
            editId === item.id ? (
              <div key={item.id} className="flex gap-2 flex-wrap items-center bg-blue-50 rounded-xl p-3">
                <input autoFocus value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  className="flex-1 min-w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-white" />
                <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <div className="flex items-center border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus-within:border-blue-400">
                  <span className="text-xs text-gray-400 mr-1">$</span>
                  <input type="text" inputMode="numeric"
                    value={fmtMoneyInput(draft.amount)}
                    onChange={e => setDraft(d => ({ ...d, amount: e.target.value.replace(/\D/g, '') }))}
                    className="w-24 text-sm text-right border-0 focus:outline-none bg-transparent" />
                </div>
                <button onClick={saveEdit} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">Guardar</button>
                <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg">Cancelar</button>
              </div>
            ) : (
              <div key={item.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 group transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{CATEGORY_LABELS[item.category] || item.category}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-bold text-gray-900">{fmt(item.amount)}</p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setDraft({ ...item, amount: String(item.amount) }); setEditId(item.id); }}
                      className="p-1 text-gray-300 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                      <Icon name="Pencil" size={13} />
                    </button>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="p-1 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                      <Icon name="Trash2" size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          ))}

          <form onSubmit={submitAdd} className="flex gap-2 flex-wrap items-center pt-3 mt-1 border-t border-gray-100">
            <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nombre del gasto..."
              className="flex-1 min-w-28 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
              required />
            <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none bg-white">
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 bg-white focus-within:border-blue-400">
              <span className="text-xs text-gray-400 mr-1">$</span>
              <input type="text" inputMode="numeric"
                value={fmtMoneyInput(addForm.amount)}
                onChange={e => setAddForm(f => ({ ...f, amount: e.target.value.replace(/\D/g, '') }))}
                placeholder="0"
                className="w-24 text-sm text-gray-900 border-0 focus:outline-none bg-transparent" required />
            </div>
            <button type="submit" disabled={saving}
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium whitespace-nowrap">
              {saving ? '…' : '+ Agregar'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Panel de gastos variables ────────────────────────────────────────────────

function VariableExpensesPanel({ varExpenses, onAdd, onUpdate, onDelete, varExpensesToday, varExpensesMonth }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [form, setForm] = useState({ name: '', category: 'other', amount: '', date: todayISO() });
  const [saving, setSaving] = useState(false);

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    setSaving(true);
    await onAdd({ name: form.name, category: form.category, amount: parseMoneyInput(form.amount), date: form.date });
    setForm({ name: '', category: 'other', amount: '', date: todayISO() });
    setSaving(false);
  };

  const saveEdit = async () => {
    await onUpdate(editId, {
      name: draft.name,
      category: draft.category,
      amount: parseMoneyInput(draft.amount),
      date: draft.date,
    });
    setEditId(null);
  };

  const badge = varExpensesMonth > 0
    ? `${varExpenses.length} · ${fmt(varExpensesMonth)}`
    : `${varExpenses.length}`;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
            <Icon name="ShoppingBag" size={15} color="#f97316" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-800">Otros gastos del negocio</p>
            <p className="text-xs text-gray-400">
              {varExpensesMonth > 0
                ? `${varExpenses.length} gasto${varExpenses.length !== 1 ? 's' : ''} · ${fmt(varExpensesMonth)} este mes`
                : 'Gastos del día, compras menores…'}
            </p>
          </div>
        </div>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={16} color="#9ca3af" />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4">
          {/* Lista de gastos variables */}
          <div className="space-y-2 mb-4">
            {varExpenses.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-3">No hay gastos registrados este mes.</p>
            )}
            {varExpenses.map(item => (
              editId === item.id ? (
                <div key={item.id} className="bg-blue-50 rounded-xl p-3 space-y-2">
                  <input autoFocus value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-white"
                    placeholder="Nombre del gasto" />
                  <div className="flex gap-2 flex-wrap">
                    <select value={draft.category}
                      onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none bg-white flex-1">
                      {Object.entries(VAR_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input type="date" value={draft.date}
                      onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none bg-white" />
                  </div>
                  <div className="flex items-center border border-gray-200 rounded-lg px-3 py-2 bg-white focus-within:border-blue-400">
                    <span className="text-xs text-gray-400 mr-1">$</span>
                    <input type="text" inputMode="numeric"
                      value={fmtMoneyInput(draft.amount)}
                      onChange={e => setDraft(d => ({ ...d, amount: e.target.value.replace(/\D/g, '') }))}
                      className="flex-1 text-sm text-gray-900 border-0 focus:outline-none bg-transparent" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">Guardar</button>
                    <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div key={item.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 group transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{item.description || '—'}</p>
                    <p className="text-xs text-gray-400">
                      {VAR_CATEGORY_LABELS[item.supplier] || item.supplier || 'Otros'} · {fmtDate(item.purchase_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <p className="text-sm font-bold text-gray-900">{fmt(item.amount)}</p>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setDraft({ name: item.description || '', category: item.supplier || 'other', amount: String(item.amount), date: item.purchase_date || todayISO() });
                          setEditId(item.id);
                        }}
                        className="p-1.5 text-gray-300 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                        <Icon name="Pencil" size={13} />
                      </button>
                      <button
                        onClick={() => onDelete(item.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                        <Icon name="Trash2" size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            ))}
          </div>

          {/* Formulario de añadir */}
          <form onSubmit={submitAdd} className="space-y-2 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Agregar gasto</p>
            <input value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="¿Qué compraste o pagaste?"
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-400"
              required />
            <div className="flex gap-2 flex-wrap">
              <select value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none bg-white flex-1">
                {Object.entries(VAR_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none bg-white" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus-within:border-blue-400">
                <span className="text-xs text-gray-400 mr-2 select-none font-medium">$</span>
                <input type="text" inputMode="numeric"
                  value={fmtMoneyInput(form.amount)}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/\D/g, '') }))}
                  placeholder="0"
                  className="flex-1 text-sm text-gray-900 border-0 focus:outline-none bg-transparent"
                  required />
              </div>
              <button type="submit" disabled={saving}
                className="text-sm bg-orange-500 text-white px-5 py-2.5 rounded-xl hover:bg-orange-600 disabled:opacity-50 font-bold whitespace-nowrap">
                {saving ? '…' : '+ Agregar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

function MoneyField({ label, value, onChange, placeholder = '0' }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus-within:border-blue-400 transition-colors">
        <span className="text-sm text-gray-400 mr-2 select-none font-medium">$</span>
        <input
          type="text"
          inputMode="numeric"
          value={fmtMoneyInput(value)}
          onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
          placeholder={placeholder}
          className="flex-1 text-sm text-gray-900 border-0 focus:outline-none bg-transparent"
        />
      </div>
    </div>
  );
}

function StepBar({ step, total }) {
  return (
    <div className="flex gap-1.5 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < step ? 'bg-blue-600' : 'bg-gray-200'}`} />
      ))}
    </div>
  );
}

function Onboarding({ businessId, month, year, onDone }) {
  const [step, setStep]         = useState(1);
  const [saving, setSaving]     = useState(false);
  const [bizType, setBizType]   = useState('');
  const [rent, setRent]         = useState('');
  const [salaries, setSalaries] = useState('');
  const [utilities, setUtilities] = useState('');
  const [other, setOther]       = useState('');
  const [openDays, setOpenDays] = useState('22');

  const totalMonthly = parseMoneyInput(rent) + parseMoneyInput(salaries) + parseMoneyInput(utilities) + parseMoneyInput(other);
  const dailyPreview = totalMonthly > 0 && +openDays > 0 ? Math.ceil(totalMonthly / +openDays) : 0;

  const finish = async () => {
    setSaving(true);
    try {
      await upsertCostCenter(businessId, month, year, {
        open_days: clamp(+openDays || 22, 1, 31),
        vat_rate: 19, uses_vat: true, profit_goal: null,
        business_type: bizType || null, onboarding_done: true,
      });
      const items = [];
      if (parseMoneyInput(rent) > 0)      items.push({ name: 'Arriendo', amount: parseMoneyInput(rent), type: 'fixed', category: 'rent' });
      if (parseMoneyInput(salaries) > 0)  items.push({ name: 'Sueldos', amount: parseMoneyInput(salaries), type: 'fixed', category: 'salaries' });
      if (parseMoneyInput(utilities) > 0) items.push({ name: 'Servicios básicos', amount: parseMoneyInput(utilities), type: 'fixed', category: 'utilities' });
      if (parseMoneyInput(other) > 0)     items.push({ name: 'Otros gastos', amount: parseMoneyInput(other), type: 'fixed', category: 'other' });
      if (items.length > 0) await bulkCreateCostItems(businessId, month, year, items);
      onDone();
    } catch (err) {
      console.error('Onboarding error:', err);
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
        <StepBar step={step} total={3} />

        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">¿Qué tipo de negocio tienes?</h2>
            <p className="text-sm text-gray-400 mb-6">Para personalizar tu termómetro.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BUSINESS_TYPES.map(bt => (
                <button key={bt.id} type="button" onClick={() => setBizType(bt.id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    bizType === bt.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <span className="text-2xl">{bt.icon}</span>
                  <span className="text-xs font-medium text-gray-700 leading-tight text-center">{bt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">¿Cuánto gastas al mes?</h2>
              <p className="text-sm text-gray-400">No tiene que ser exacto — un aproximado está bien.</p>
            </div>
            <MoneyField label="Arriendo del local" value={rent} onChange={setRent} placeholder="Ej: 300.000" />
            <MoneyField label="Sueldos (incluye el tuyo)" value={salaries} onChange={setSalaries} placeholder="Ej: 800.000" />
            <MoneyField label="Luz, agua, internet" value={utilities} onChange={setUtilities} placeholder="Ej: 50.000" />
            <MoneyField label="Otros gastos fijos" value={other} onChange={setOther} placeholder="Ej: 100.000" />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">¿Cuántos días abrirás este mes?</h2>
              <p className="text-sm text-gray-400">Calculamos cuánto necesitas vender cada día.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button type="button" onClick={() => setOpenDays(d => String(Math.max(1, +d - 1)))}
                  className="w-11 h-11 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-xl font-medium">−</button>
                <span className="w-12 text-center text-lg font-bold text-gray-900">{openDays}</span>
                <button type="button" onClick={() => setOpenDays(d => String(Math.min(31, +d + 1)))}
                  className="w-11 h-11 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-xl font-medium">+</button>
              </div>
              <span className="text-sm text-gray-500">días al mes</span>
            </div>

            {dailyPreview > 0 && (
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white">
                <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider mb-1">Tu meta diaria</p>
                <p className="text-4xl font-black">{fmt(dailyPreview)}</p>
                <p className="text-sm text-blue-200 mt-2">
                  Si vendes más que esto cada día, tu negocio está sano 💪
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center mt-8">
          {step > 1
            ? <button type="button" onClick={() => setStep(s => s - 1)}
                className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1.5">
                <Icon name="ChevronLeft" size={15} />Atrás
              </button>
            : <div />}

          {step < 3
            ? <button type="button" onClick={() => setStep(s => s + 1)}
                disabled={step === 1 && !bizType}
                className="text-sm bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40 font-medium flex items-center gap-1.5">
                Siguiente<Icon name="ChevronRight" size={15} />
              </button>
            : <button type="button" onClick={finish} disabled={saving || !openDays || +openDays < 1}
                className="text-sm bg-blue-600 text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40 font-medium">
                {saving ? 'Guardando...' : 'Activar termómetro →'}
              </button>}
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-4">Puedes editar tus datos en cualquier momento.</p>
    </div>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

function Dashboard({ center, items, varExpenses, sales, dailySales, month, year,
  onUpdateItem, onDeleteItem, onAddItem,
  onAddVar, onUpdateVar, onDeleteVar,
  onEditSettings, businessId }) {
  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const today = todayISO();

  const totalExpenses = items.reduce((s, i) => s + (i.amount || 0), 0);
  const openDays = center?.open_days || 22;
  const dailyCost = openDays > 0 && totalExpenses > 0 ? totalExpenses / openDays : 0;

  // Gastos variables agregados
  const varExpensesMonth = varExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const varExpensesToday = varExpenses
    .filter(e => e.purchase_date === today)
    .reduce((s, e) => s + (e.amount || 0), 0);

  // Mapa día → total variables (para calendario)
  const dailyVarExpenses = {};
  for (const e of varExpenses) {
    const d = dayFromDate(e.purchase_date);
    if (d) dailyVarExpenses[d] = (dailyVarExpenses[d] || 0) + (e.amount || 0);
  }

  const salesToday = isCurrentMonth ? sales.salesToday : 0;
  const salesMonth = sales.salesMonth;

  // Estado de hoy considera gastos variables
  const effectiveDailyCost = dailyCost + (isCurrentMonth ? varExpensesToday : 0);
  const todayState = getState(salesToday, effectiveDailyCost);

  return (
    <div className="space-y-4 max-w-lg mx-auto">

      {/* Tarjeta héroe */}
      <HeroCard
        state={isCurrentMonth ? todayState : 'unconfigured'}
        salesToday={salesToday}
        dailyCost={dailyCost}
        varExpensesToday={isCurrentMonth ? varExpensesToday : 0}
        totalExpenses={totalExpenses}
        openDays={openDays}
      />

      {/* Hoyo financiero */}
      <HoyoCard
        totalExpenses={totalExpenses}
        varExpensesMonth={varExpensesMonth}
        salesMonth={salesMonth}
      />

      {/* Calendario */}
      <HealthCalendar
        month={month}
        year={year}
        dailySales={dailySales}
        dailyCost={dailyCost}
        dailyVarExpenses={dailyVarExpenses}
      />

      {/* Gastos variables */}
      <VariableExpensesPanel
        varExpenses={varExpenses}
        onAdd={onAddVar}
        onUpdate={onUpdateVar}
        onDelete={onDeleteVar}
        varExpensesToday={varExpensesToday}
        varExpensesMonth={varExpensesMonth}
      />

      {/* Gastos fijos del mes */}
      <ExpensesPanel
        items={items}
        onAdd={onAddItem}
        onUpdate={onUpdateItem}
        onDelete={onDeleteItem}
        totalExpenses={totalExpenses}
        dailyCost={dailyCost}
      />

      {/* Ajustes mínimos */}
      <SettingsPanel center={center} businessId={businessId} month={month} year={year} onSave={onEditSettings} />
    </div>
  );
}

// ─── Panel de ajustes ─────────────────────────────────────────────────────────

function SettingsPanel({ center, businessId, month, year, onSave }) {
  const [open, setOpen] = useState(false);
  const [openDays, setOpenDays] = useState(center?.open_days ?? 22);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const save = async () => {
    setSaving(true);
    const c = await upsertCostCenter(businessId, month, year, {
      open_days: clamp(+openDays || 22, 1, 31),
      vat_rate: center?.vat_rate ?? 19,
      uses_vat: center?.uses_vat !== false,
      profit_goal: null, onboarding_done: true,
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSave(c);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <Icon name="Settings" size={15} color="#6b7280" />
          </div>
          <p className="text-sm font-bold text-gray-800">Ajustes</p>
        </div>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={16} color="#9ca3af" />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Días hábiles del mes</label>
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button type="button" onClick={() => setOpenDays(d => Math.max(1, +d - 1))}
                  className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 font-medium">−</button>
                <span className="w-10 text-center text-sm font-bold text-gray-900">{openDays}</span>
                <button type="button" onClick={() => setOpenDays(d => Math.min(31, +d + 1))}
                  className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 font-medium">+</button>
              </div>
              <span className="text-sm text-gray-500">días</span>
            </div>
          </div>
          <button onClick={save} disabled={saving}
            className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar'}
          </button>
        </div>
      )}
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
  const [year,  setYear]  = useState(now.getFullYear());

  const [center,         setCenter]        = useState(null);
  const [items,          setItems]         = useState([]);
  const [varExpenses,    setVarExpenses]   = useState([]);
  const [sales,          setSales]         = useState({ salesMonth: 0, salesToday: 0 });
  const [dailySales,     setDailySales]    = useState({});
  const [loading,        setLoading]       = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [c, its, s, ds, ve] = await Promise.all([
      getCostCenter(business.id, month, year),
      getCostItems(business.id, month, year),
      getCrmSalesTotalsForPeriod(business.id, month, year),
      getCrmDailySalesForPeriod(business.id, month, year),
      getVariableExpenses(business.id, month, year),
    ]);
    setCenter(c); setItems(its); setSales(s); setDailySales(ds); setVarExpenses(ve);
    setShowOnboarding(!c?.onboarding_done);
    setLoading(false);
  }, [business?.id, month, year]);

  useEffect(() => { load(); }, [load]);

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

  const handleAddVar = async (fields) => {
    const it = await createVariableExpense(business.id, month, year, fields);
    setVarExpenses(prev => [it, ...prev]);
  };
  const handleUpdateVar = async (id, fields) => {
    const it = await updateVariableExpense(id, fields);
    setVarExpenses(prev => prev.map(x => x.id === id ? it : x));
  };
  const handleDeleteVar = async (id) => {
    await deleteVariableExpense(id);
    setVarExpenses(prev => prev.filter(x => x.id !== id));
  };

  if (!isPro) {
    return (
      <DashboardAppShell>
        <PanelHeader title="Termómetro del negocio" subtitle="Salud financiera diaria" />
        <DashboardLayoutContent>
          <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <Icon name="BarChart2" size={24} color="#2563eb" />
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
            Termómetro del negocio
          </h1>
        }
        subtitle={
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            {showOnboarding ? 'Configuración inicial' : `${MONTHS[month - 1]} ${year}`}
          </p>
        }
      />

      <DashboardLayoutContent>
        {!showOnboarding && !loading && (
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
            <button type="button" onClick={() => setShowOnboarding(true)}
              className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 transition-colors">
              <Icon name="Edit3" size={13} />Editar mis datos
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
            onDone={() => { load(); setShowOnboarding(false); }}
          />
        ) : (
          <Dashboard
            center={center}
            items={items}
            varExpenses={varExpenses}
            sales={sales}
            dailySales={dailySales}
            month={month}
            year={year}
            onAddItem={handleAddItem}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            onAddVar={handleAddVar}
            onUpdateVar={handleUpdateVar}
            onDeleteVar={handleDeleteVar}
            onEditSettings={(c) => setCenter(c)}
            businessId={business.id}
          />
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
