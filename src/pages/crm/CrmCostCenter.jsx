import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from 'contexts/AuthContext';
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
  getCrmSalesTotalsForPeriod,
} from 'services/crmService';
import { getEffectivePlanSlug } from 'services/waBusinessService';

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const CATEGORY_LABELS = {
  rent: 'Arriendo',
  salaries: 'Sueldos',
  utilities: 'Servicios básicos',
  services: 'Servicios / Software',
  taxes: 'Impuestos / Contabilidad',
  supplies: 'Insumos',
  other: 'Otros',
};

function fmt(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n || 0);
}

function pct(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

// ─── Semáforo ────────────────────────────────────────────────────────────────
function Semaphore({ salesMonth, totalCosts }) {
  const ratio = totalCosts > 0 ? salesMonth / totalCosts : null;
  let color, label, bg;
  if (ratio === null) {
    color = 'text-gray-400'; bg = 'bg-gray-100'; label = 'Sin datos';
  } else if (ratio >= 1) {
    color = 'text-green-700'; bg = 'bg-green-50'; label = 'Rentable';
  } else if (ratio >= 0.9) {
    color = 'text-yellow-700'; bg = 'bg-yellow-50'; label = 'En equilibrio';
  } else {
    color = 'text-red-700'; bg = 'bg-red-50'; label = 'Bajo costos';
  }

  const coveragePct = ratio !== null ? Math.round(ratio * 100) : null;

  return (
    <div className={`rounded-2xl p-5 ${bg} flex items-center gap-4`}>
      <div className={`text-5xl leading-none ${color}`}>
        {ratio === null ? '●' : ratio >= 1 ? '🟢' : ratio >= 0.9 ? '🟡' : '🔴'}
      </div>
      <div>
        <p className={`text-lg font-bold ${color}`}>{label}</p>
        {coveragePct !== null && (
          <p className="text-sm text-gray-500">
            Las ventas cubren el <span className={`font-semibold ${color}`}>{coveragePct}%</span> de los costos
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Tarjeta métrica ─────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent || 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Fila de partida de costo ─────────────────────────────────────────────────
function CostItemRow({ item, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item);

  const save = async () => {
    await onUpdate(item.id, { name: draft.name, amount: +draft.amount, type: draft.type, category: draft.category, notes: draft.notes });
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className="border-b border-gray-100 bg-blue-50/30">
        <td className="py-2 px-3">
          <input
            autoFocus
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
          />
        </td>
        <td className="py-2 px-3">
          <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 bg-white">
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </td>
        <td className="py-2 px-3">
          <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 bg-white">
            <option value="fixed">Fijo</option>
            <option value="variable">Variable</option>
          </select>
        </td>
        <td className="py-2 px-3 text-right">
          <input
            type="number"
            min="0"
            value={draft.amount}
            onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
            className="w-28 text-sm text-right border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400"
          />
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
      <td className="py-2.5 px-3 text-sm text-gray-500">{CATEGORY_LABELS[item.category] || item.category}</td>
      <td className="py-2.5 px-3">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.type === 'fixed' ? 'bg-gray-100 text-gray-600' : 'bg-purple-50 text-purple-700'}`}>
          {item.type === 'fixed' ? 'Fijo' : 'Variable'}
        </span>
      </td>
      <td className="py-2.5 px-3 text-sm font-semibold text-gray-900 text-right">{fmt(item.amount)}</td>
      <td className="py-2.5 px-3">
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

// ─── Formulario nueva partida ─────────────────────────────────────────────────
function AddCostItemForm({ onAdd }) {
  const [form, setForm] = useState({ name: '', amount: '', type: 'fixed', category: 'other' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    setSaving(true);
    await onAdd({ name: form.name, amount: +form.amount, type: form.type, category: form.category });
    setForm({ name: '', amount: '', type: 'fixed', category: 'other' });
    setSaving(false);
  };

  return (
    <form onSubmit={submit} className="flex gap-2 flex-wrap items-end pt-3 border-t border-gray-100">
      <input
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        placeholder="Nombre del costo..."
        className="flex-1 min-w-32 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
        required
      />
      <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-white">
        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 bg-white">
        <option value="fixed">Fijo</option>
        <option value="variable">Variable</option>
      </select>
      <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 bg-white focus-within:border-blue-400">
        <span className="text-xs text-gray-400 mr-1 select-none">$</span>
        <input
          type="number"
          min="0"
          value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          placeholder="0"
          className="w-24 text-sm text-gray-900 border-0 focus:outline-none bg-transparent"
          required
        />
      </div>
      <button type="submit" disabled={saving}
        className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
        {saving ? 'Guardando...' : '+ Agregar'}
      </button>
    </form>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function CrmCostCenter() {
  const { business } = useAuth();
  const planSlug = getEffectivePlanSlug(business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt);
  const isPro = planSlug === 'business';

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [center, setCenter] = useState(null);
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState({ salesMonth: 0, salesToday: 0 });
  const [loading, setLoading] = useState(true);
  const [savingCenter, setSavingCenter] = useState(false);

  // campos de configuración del mes
  const [openDays, setOpenDays] = useState(22);
  const [vatRate, setVatRate] = useState(19);
  const [purchasesGross, setPurchasesGross] = useState(0);
  const [manualSalesToday, setManualSalesToday] = useState('');
  const [manualSalesMonth, setManualSalesMonth] = useState('');

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
    if (c) {
      setOpenDays(c.open_days ?? 22);
      setVatRate(c.vat_rate ?? 19);
      setPurchasesGross(c.monthly_purchases_gross ?? 0);
      setManualSalesToday(c.manual_sales_today ?? '');
      setManualSalesMonth(c.manual_sales_month ?? '');
    } else {
      setOpenDays(22);
      setVatRate(19);
      setPurchasesGross(0);
      setManualSalesToday('');
      setManualSalesMonth('');
    }
    setLoading(false);
  }, [business?.id, month, year]);

  useEffect(() => { load(); }, [load]);

  const saveCenter = async () => {
    setSavingCenter(true);
    const c = await upsertCostCenter(business.id, month, year, {
      open_days: +openDays,
      vat_rate: +vatRate,
      monthly_purchases_gross: +purchasesGross || 0,
      manual_sales_today: manualSalesToday !== '' ? +manualSalesToday : null,
      manual_sales_month: manualSalesMonth !== '' ? +manualSalesMonth : null,
    });
    setCenter(c);
    setSavingCenter(false);
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

  // ─── Cálculos ──────────────────────────────────────────────────────────────
  const effectiveSalesMonth = manualSalesMonth !== '' ? +manualSalesMonth : sales.salesMonth;
  const effectiveSalesToday = manualSalesToday !== '' ? +manualSalesToday : sales.salesToday;

  const totalCosts = items.reduce((s, i) => s + (i.amount || 0), 0);
  const fixedCosts = items.filter(i => i.type === 'fixed').reduce((s, i) => s + (i.amount || 0), 0);
  const variableCosts = items.filter(i => i.type === 'variable').reduce((s, i) => s + (i.amount || 0), 0);

  const rate = (vatRate || 19) / 100;
  const vatDebit = effectiveSalesMonth * rate / (1 + rate);
  const vatCredit = (purchasesGross || 0) * rate / (1 + rate);
  const vatNet = vatDebit - vatCredit;

  const daysElapsed = month === now.getMonth() + 1 && year === now.getFullYear()
    ? now.getDate()
    : new Date(year, month, 0).getDate();
  const dailyCostTarget = openDays > 0 ? totalCosts / openDays : 0;
  const projectedMonth = daysElapsed > 0 ? (effectiveSalesToday / daysElapsed) * (openDays || 22) : 0;

  if (!isPro) {
    return (
      <DashboardLayoutContent>
        <PanelHeader title="Centro de Costos" subtitle="Termómetro financiero de tu negocio" />
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
            <Icon name="BarChart2" size={24} color="#2563eb" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Funcionalidad Business</h3>
          <p className="text-sm text-gray-500 max-w-sm">El Centro de Costos requiere el plan Business. Actualiza tu plan para acceder.</p>
        </div>
      </DashboardLayoutContent>
    );
  }

  return (
    <DashboardLayoutContent>
      <PanelHeader
        title="Centro de Costos"
        subtitle="Termómetro financiero mensual"
      />

      {/* Selector de mes */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <Icon name="Calendar" size={15} color="#6b7280" />
          <select value={month} onChange={e => setMonth(+e.target.value)}
            className="text-sm text-gray-900 border-0 focus:outline-none bg-transparent pr-1">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)}
            className="text-sm text-gray-900 border-0 focus:outline-none bg-transparent pr-1">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <span className="text-sm text-gray-400">
          {MONTHS[month - 1]} {year}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">

          {/* Semáforo */}
          <Semaphore salesMonth={effectiveSalesMonth} totalCosts={totalCosts} />

          {/* Tarjetas métricas */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="Ventas del mes"
              value={fmt(effectiveSalesMonth)}
              sub={manualSalesMonth !== '' ? 'Manual' : 'Desde facturas'}
              accent="text-blue-700"
            />
            <MetricCard
              label="Total costos"
              value={fmt(totalCosts)}
              sub={`${pct(effectiveSalesMonth, totalCosts)}% cubierto`}
            />
            <MetricCard
              label="Ventas hoy"
              value={fmt(effectiveSalesToday)}
              sub={`Meta día: ${fmt(dailyCostTarget)}`}
            />
            <MetricCard
              label="Proyección mes"
              value={fmt(projectedMonth)}
              sub="A ritmo actual"
              accent={projectedMonth >= totalCosts ? 'text-green-700' : 'text-red-600'}
            />
          </div>

          {/* IVA referencial */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Icon name="Receipt" size={15} color="#6b7280" />
              IVA Referencial
            </h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-400 mb-1">IVA Débito (ventas)</p>
                <p className="text-lg font-bold text-gray-900">{fmt(vatDebit)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">IVA Crédito (compras)</p>
                <p className="text-lg font-bold text-gray-900">{fmt(vatCredit)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">IVA a pagar (neto)</p>
                <p className={`text-lg font-bold ${vatNet > 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(vatNet)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">
              Cálculo referencial: ventas × {vatRate}% / {100 + +vatRate}%. No reemplaza contabilidad formal.
            </p>
          </div>

          {/* Partidas de costo */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Icon name="List" size={15} color="#6b7280" />
              Partidas de costo
              <span className="ml-auto text-sm font-bold text-gray-900">{fmt(totalCosts)}</span>
            </h3>

            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-400 pb-2 px-3">Nombre</th>
                      <th className="text-left text-xs font-medium text-gray-400 pb-2 px-3">Categoría</th>
                      <th className="text-left text-xs font-medium text-gray-400 pb-2 px-3">Tipo</th>
                      <th className="text-right text-xs font-medium text-gray-400 pb-2 px-3">Monto</th>
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <CostItemRow
                        key={item.id}
                        item={item}
                        onUpdate={handleUpdateItem}
                        onDelete={handleDeleteItem}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-100">
                      <td colSpan={3} className="py-2 px-3 text-xs text-gray-400">
                        Fijos: {fmt(fixedCosts)} · Variables: {fmt(variableCosts)}
                      </td>
                      <td className="py-2 px-3 text-right text-sm font-bold text-gray-900">{fmt(totalCosts)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-4">No hay partidas registradas para este mes.</p>
            )}

            <AddCostItemForm onAdd={handleAddItem} />
          </div>

          {/* Configuración del mes */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Icon name="Settings" size={15} color="#6b7280" />
              Configuración del mes
            </h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Días hábiles</label>
                <input type="number" min="1" max="31" value={openDays}
                  onChange={e => setOpenDays(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">IVA %</label>
                <input type="number" min="0" max="50" step="0.5" value={vatRate}
                  onChange={e => setVatRate(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Compras brutas del mes</label>
                <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 focus-within:border-blue-400">
                  <span className="text-xs text-gray-400 mr-1">$</span>
                  <input type="number" min="0" value={purchasesGross}
                    onChange={e => setPurchasesGross(e.target.value)}
                    className="w-full text-sm border-0 focus:outline-none bg-transparent" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Override ventas hoy</label>
                <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 focus-within:border-blue-400">
                  <span className="text-xs text-gray-400 mr-1">$</span>
                  <input type="number" min="0" value={manualSalesToday}
                    onChange={e => setManualSalesToday(e.target.value)}
                    placeholder="Auto"
                    className="w-full text-sm border-0 focus:outline-none bg-transparent placeholder-gray-300" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Override ventas mes</label>
                <div className="flex items-center border border-gray-200 rounded-lg px-2 py-2 focus-within:border-blue-400">
                  <span className="text-xs text-gray-400 mr-1">$</span>
                  <input type="number" min="0" value={manualSalesMonth}
                    onChange={e => setManualSalesMonth(e.target.value)}
                    placeholder="Automático desde facturas"
                    className="w-full text-sm border-0 focus:outline-none bg-transparent placeholder-gray-300" />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <button onClick={saveCenter} disabled={savingCenter}
                className="text-sm bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
                {savingCenter ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          </div>

        </div>
      )}
    </DashboardLayoutContent>
  );
}
