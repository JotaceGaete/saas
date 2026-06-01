import React, { useState, useEffect, useCallback } from 'react';
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

const fmt = (n) => formatMoney(n, 'CLP');

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// ─── Semáforo diario ──────────────────────────────────────────────────────────

function semaphoreForDay(salesToday, dailyCost) {
  if (dailyCost <= 0) return null;
  if (salesToday >= dailyCost) return 'green';
  if (salesToday >= dailyCost * 0.7) return 'yellow';
  return 'red';
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
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [bizType,    setBizType]    = useState('');
  const [rent,       setRent]       = useState('');
  const [salaries,   setSalaries]   = useState('');
  const [utilities,  setUtilities]  = useState('');
  const [other,      setOther]      = useState('');
  const [openDays,   setOpenDays]   = useState('22');

  const finish = async () => {
    setSaving(true);
    try {
      await upsertCostCenter(businessId, month, year, {
        open_days: clamp(+openDays || 22, 1, 31),
        vat_rate: 19,
        uses_vat: true,
        profit_goal: null,
        business_type: bizType || null,
        onboarding_done: true,
      });

      const items = [];
      if (parseMoneyInput(rent) > 0)
        items.push({ name: 'Arriendo del local', amount: parseMoneyInput(rent), type: 'fixed', category: 'rent' });
      if (parseMoneyInput(salaries) > 0)
        items.push({ name: 'Sueldos', amount: parseMoneyInput(salaries), type: 'fixed', category: 'salaries' });
      if (parseMoneyInput(utilities) > 0)
        items.push({ name: 'Servicios básicos', amount: parseMoneyInput(utilities), type: 'fixed', category: 'utilities' });
      if (parseMoneyInput(other) > 0)
        items.push({ name: 'Otros gastos', amount: parseMoneyInput(other), type: 'fixed', category: 'other' });

      if (items.length > 0) await bulkCreateCostItems(businessId, month, year, items);
      onDone();
    } catch (err) {
      console.error('Onboarding error:', err);
      setSaving(false);
    }
  };

  const TOTAL_STEPS = 3;

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
        <StepBar step={step} total={TOTAL_STEPS} />

        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">¿Qué tipo de negocio tienes?</h2>
            <p className="text-sm text-gray-400 mb-6">Para personalizar tu termómetro.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BUSINESS_TYPES.map(bt => (
                <button
                  key={bt.id}
                  type="button"
                  onClick={() => setBizType(bt.id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    bizType === bt.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className="text-2xl">{bt.icon}</span>
                  <span className="text-xs font-medium text-gray-700 leading-tight">{bt.label}</span>
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
              <p className="text-sm text-gray-400">Esto calcula cuánto necesitas vender cada día.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setOpenDays(d => String(Math.max(1, +d - 1)))}
                  className="w-11 h-11 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-xl font-medium"
                >−</button>
                <span className="w-12 text-center text-lg font-bold text-gray-900">{openDays}</span>
                <button
                  type="button"
                  onClick={() => setOpenDays(d => String(Math.min(31, +d + 1)))}
                  className="w-11 h-11 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-xl font-medium"
                >+</button>
              </div>
              <span className="text-sm text-gray-500">días al mes</span>
            </div>

            {/* Vista previa del costo diario */}
            {(parseMoneyInput(rent) + parseMoneyInput(salaries) + parseMoneyInput(utilities) + parseMoneyInput(other)) > 0 && (
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-xs text-blue-600 font-medium mb-0.5">Tu costo diario será</p>
                <p className="text-2xl font-bold text-blue-700">
                  {fmt(Math.round(
                    (parseMoneyInput(rent) + parseMoneyInput(salaries) + parseMoneyInput(utilities) + parseMoneyInput(other))
                    / Math.max(1, +openDays || 22)
                  ))}
                </p>
                <p className="text-xs text-blue-400 mt-1">Si un día vendes más que esto, estás cubriendo gastos.</p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center mt-8">
          {step > 1 ? (
            <button type="button" onClick={() => setStep(s => s - 1)}
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1.5">
              <Icon name="ChevronLeft" size={15} />Atrás
            </button>
          ) : <div />}

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !bizType}
              className="text-sm bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium flex items-center gap-1.5"
            >
              Siguiente<Icon name="ChevronRight" size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              disabled={saving || !openDays || +openDays < 1}
              className="text-sm bg-blue-600 text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium"
            >
              {saving ? 'Guardando...' : 'Ver mi termómetro →'}
            </button>
          )}
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mt-4">Puedes editar estos datos en cualquier momento.</p>
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
    await onUpdate(item.id, { name: draft.name, amount: parseMoneyInput(draft.amount), category: draft.category });
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className="border-b border-gray-100 bg-blue-50/30">
        <td className="py-2 px-3">
          <input autoFocus value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400" />
        </td>
        <td className="py-2 px-3 hidden sm:table-cell">
          <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none bg-white">
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </td>
        <td className="py-2 px-3 text-right">
          <div className="flex items-center border border-gray-200 rounded px-2 py-1 justify-end">
            <span className="text-xs text-gray-400 mr-1">$</span>
            <input type="text" inputMode="numeric"
              value={fmtMoneyInput(draft.amount)}
              onChange={e => setDraft(d => ({ ...d, amount: e.target.value.replace(/\D/g, '') }))}
              className="w-24 text-sm text-right border-0 focus:outline-none bg-transparent" />
          </div>
        </td>
        <td className="py-2 px-3">
          <div className="flex gap-1">
            <button onClick={save} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">Guardar</button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded">Cancelar</button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-100 last:border-0 group hover:bg-gray-50/40 transition-colors">
      <td className="py-2.5 px-3 text-sm text-gray-900">{item.name}</td>
      <td className="py-2.5 px-3 text-sm text-gray-400 hidden sm:table-cell">{CATEGORY_LABELS[item.category] || item.category}</td>
      <td className="py-2.5 px-3 text-sm font-semibold text-gray-900 text-right">{fmt(item.amount)}</td>
      <td className="py-2.5 px-3 w-14">
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => { setDraft({ ...item, amount: String(item.amount) }); setEditing(true); }}
            className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors">
            <Icon name="Pencil" size={13} />
          </button>
          <button onClick={() => onDelete(item.id)}
            className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
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
    await onAdd({ name: form.name, amount: parseMoneyInput(form.amount), type: 'fixed', category: form.category });
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
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none bg-white">
        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 bg-white focus-within:border-blue-400">
        <span className="text-xs text-gray-400 mr-1 select-none">$</span>
        <input type="text" inputMode="numeric"
          value={fmtMoneyInput(form.amount)}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/\D/g, '') }))}
          placeholder="0"
          className="w-24 text-sm text-gray-900 border-0 focus:outline-none bg-transparent" required />
      </div>
      <button type="submit" disabled={saving}
        className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
        {saving ? '...' : '+ Agregar'}
      </button>
    </form>
  );
}

// ─── Calendario de salud ──────────────────────────────────────────────────────

function HealthCalendar({ month, year, dailySales, dailyCost, openDays }) {
  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayDay = isCurrentMonth ? now.getDate() : daysInMonth;

  const DAY_COLORS = {
    green:  { bg: 'bg-green-500',  title: 'Cubriste gastos' },
    yellow: { bg: 'bg-yellow-400', title: 'Cerca del equilibrio' },
    red:    { bg: 'bg-red-400',    title: 'No cubriste gastos' },
    future: { bg: 'bg-gray-100',   title: 'Día futuro' },
    nodata: { bg: 'bg-gray-200',   title: 'Sin ventas registradas' },
  };

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    if (d > todayDay) return { d, state: 'future' };
    const sales = dailySales[d] || 0;
    if (dailyCost <= 0) return { d, state: 'nodata', sales };
    const sem = semaphoreForDay(sales, dailyCost);
    return { d, state: sem, sales };
  });

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-sm font-semibold text-gray-700 mb-4">Salud del mes</p>
      <div className="grid grid-cols-7 gap-1.5">
        {['L','M','X','J','V','S','D'].map(d => (
          <div key={d} className="text-center text-xs text-gray-300 font-medium pb-1">{d}</div>
        ))}
        {/* Offset for first day of month */}
        {(() => {
          const firstDow = new Date(year, month - 1, 1).getDay();
          const offset = firstDow === 0 ? 6 : firstDow - 1;
          return Array.from({ length: offset }, (_, i) => <div key={`off-${i}`} />);
        })()}
        {days.map(({ d, state, sales }) => {
          const color = DAY_COLORS[state] || DAY_COLORS.nodata;
          const isToday = isCurrentMonth && d === todayDay;
          return (
            <div
              key={d}
              title={`Día ${d}: ${sales != null ? fmt(sales) : '—'} — ${color.title}`}
              className={`relative aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all
                ${state === 'future' ? 'text-gray-300' : 'text-white'}
                ${color.bg}
                ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
              `}
            >
              {d}
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 justify-center text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-500 inline-block" />Cubrió</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-yellow-400 inline-block" />Cerca</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-400 inline-block" />Faltó</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gray-200 inline-block" />Sin dato</span>
      </div>
    </div>
  );
}

// ─── Ajustes ─────────────────────────────────────────────────────────────────

function Settings({ center, businessId, month, year, onSave }) {
  const [openDays, setOpenDays] = useState(center?.open_days ?? 22);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const save = async () => {
    setSaving(true);
    const c = await upsertCostCenter(businessId, month, year, {
      open_days: clamp(+openDays || 22, 1, 31),
      vat_rate: center?.vat_rate ?? 19,
      uses_vat: center?.uses_vat !== false,
      profit_goal: null,
      onboarding_done: true,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSave(c);
  };

  return (
    <div className="pt-4 space-y-4">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Días hábiles del mes</label>
        <div className="flex items-center gap-3">
          <input type="number" min="1" max="31" value={openDays} onChange={e => setOpenDays(e.target.value)}
            className="w-20 text-center text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400" />
          <span className="text-sm text-gray-500">días</span>
        </div>
      </div>
      <button onClick={save} disabled={saving}
        className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
        {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar'}
      </button>
    </div>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

function Dashboard({ center, items, sales, dailySales, month, year, onUpdateItem, onDeleteItem, onAddItem, onEditSettings, businessId }) {
  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const totalExpenses = items.reduce((s, i) => s + (i.amount || 0), 0);
  const openDays = center?.open_days || 22;
  const dailyCost = openDays > 0 ? totalExpenses / openDays : 0;

  const salesMonth = sales.salesMonth;
  const salesToday = sales.salesToday;

  // Agujero financiero del mes: positivo = falta cubrir, negativo = superávit
  const gap = totalExpenses - salesMonth;

  // Semáforo de hoy
  const todaySem = semaphoreForDay(salesToday, dailyCost);

  const SEM_CONFIG = {
    green:  { emoji: '🟢', bg: 'bg-green-50',  border: 'border-green-200',  title: '¡Hoy cubriste tus gastos!', titleColor: 'text-green-700' },
    yellow: { emoji: '🟡', bg: 'bg-yellow-50', border: 'border-yellow-200', title: 'Casi llegas al punto de equilibrio', titleColor: 'text-yellow-700' },
    red:    { emoji: '🔴', bg: 'bg-red-50',    border: 'border-red-200',    title: 'Hoy no cubriste los gastos del día', titleColor: 'text-red-700' },
    null:   { emoji: '⚪', bg: 'bg-gray-50',   border: 'border-gray-200',   title: 'Registra tus gastos para ver el termómetro', titleColor: 'text-gray-500' },
  };

  const sem = SEM_CONFIG[todaySem] || SEM_CONFIG[null];

  return (
    <div className="space-y-4">

      {/* Semáforo de hoy */}
      <div className={`rounded-2xl px-5 py-4 border ${sem.bg} ${sem.border}`}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl leading-none">{sem.emoji}</span>
          <div>
            <p className={`text-base font-bold ${sem.titleColor}`}>{sem.title}</p>
            {isCurrentMonth && (
              <p className="text-sm text-gray-500">
                Hoy: <span className="font-semibold text-gray-700">{fmt(salesToday)}</span>
                {dailyCost > 0 && <> · Necesitas al día: <span className="font-semibold text-gray-700">{fmt(Math.ceil(dailyCost))}</span></>}
              </p>
            )}
            {!isCurrentMonth && (
              <p className="text-sm text-gray-400">Mes histórico</p>
            )}
          </div>
        </div>
        {dailyCost > 0 && isCurrentMonth && (
          <div className="h-2 bg-white/70 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${todaySem === 'green' ? 'bg-green-500' : todaySem === 'yellow' ? 'bg-yellow-400' : 'bg-red-400'}`}
              style={{ width: `${Math.min(100, Math.round((salesToday / dailyCost) * 100))}%` }}
            />
          </div>
        )}
      </div>

      {/* Agujero financiero del mes */}
      {totalExpenses > 0 && (
        <div className={`rounded-2xl px-5 py-4 border ${gap <= 0 ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {isCurrentMonth ? 'Resultado del mes hasta hoy' : `Resultado de ${MONTHS[month - 1]}`}
          </p>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className={`text-3xl font-black tracking-tight ${gap <= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {gap <= 0 ? '+' : '-'}{fmt(Math.abs(gap))}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                {gap <= 0
                  ? `Superávit — cubriste todos tus gastos y te sobra`
                  : `Falta para cubrir gastos del mes`}
              </p>
            </div>
            <div className="text-right text-xs text-gray-400 space-y-0.5 shrink-0">
              <p>Gastos: <span className="font-semibold text-gray-600">{fmt(totalExpenses)}</span></p>
              <p>Ventas: <span className="font-semibold text-gray-600">{fmt(salesMonth)}</span></p>
            </div>
          </div>
          {totalExpenses > 0 && (
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
              <div
                className={`h-full rounded-full transition-all ${gap <= 0 ? 'bg-green-500' : salesMonth / totalExpenses > 0.7 ? 'bg-yellow-400' : 'bg-red-400'}`}
                style={{ width: `${Math.min(100, Math.round((salesMonth / totalExpenses) * 100))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Tarjetas pequeñas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 font-medium mb-1">
            {isCurrentMonth ? 'Vendiste hoy' : 'Total del mes'}
          </p>
          <p className="text-2xl font-bold text-blue-700">{fmt(isCurrentMonth ? salesToday : salesMonth)}</p>
          {dailyCost > 0 && isCurrentMonth && (
            <p className="text-xs text-gray-400 mt-1">Meta diaria: <span className="font-medium text-gray-600">{fmt(Math.ceil(dailyCost))}</span></p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400 font-medium mb-1">Costo mensual</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalExpenses)}</p>
          {dailyCost > 0 && (
            <p className="text-xs text-gray-400 mt-1">{fmt(Math.ceil(dailyCost))} por día hábil</p>
          )}
        </div>
      </div>

      {/* Calendario de salud */}
      <HealthCalendar
        month={month}
        year={year}
        dailySales={dailySales}
        dailyCost={dailyCost}
        openDays={openDays}
      />

      {/* Gastos del mes */}
      <Accordion title="Gastos del mes" icon="Receipt" badge={fmt(totalExpenses)} defaultOpen={items.length === 0}>
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
                    <td colSpan={2} className="py-2.5 px-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">Total</td>
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

      {/* Ajustes */}
      <Accordion title="Ajustes" icon="Settings">
        <Settings center={center} businessId={businessId} month={month} year={year} onSave={onEditSettings} />
      </Accordion>

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

  const [center,      setCenter]      = useState(null);
  const [items,       setItems]       = useState([]);
  const [sales,       setSales]       = useState({ salesMonth: 0, salesToday: 0 });
  const [dailySales,  setDailySales]  = useState({});
  const [loading,     setLoading]     = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [c, its, s, ds] = await Promise.all([
      getCostCenter(business.id, month, year),
      getCostItems(business.id, month, year),
      getCrmSalesTotalsForPeriod(business.id, month, year),
      getCrmDailySalesForPeriod(business.id, month, year),
    ]);
    setCenter(c);
    setItems(its);
    setSales(s);
    setDailySales(ds);
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
            <p className="text-sm text-gray-500 max-w-sm">
              El termómetro financiero requiere el plan Business. Actualiza tu plan para acceder.
            </p>
          </div>
        </DashboardLayoutContent>
      </DashboardAppShell>
    );
  }

  return (
    <DashboardAppShell>
      <PanelHeader
        title={<h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Termómetro del negocio</h1>}
        subtitle={<p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
          {showOnboarding ? 'Cuéntanos sobre tu negocio' : `${MONTHS[month - 1]} ${year}`}
        </p>}
      />

      <DashboardLayoutContent>
        {!showOnboarding && !loading && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
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
            sales={sales}
            dailySales={dailySales}
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
    </DashboardAppShell>
  );
}
