import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { canUseFeature } from 'config/planFeatures';
import { formatMoney } from 'utils/formatMoney';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { getOperatingCostItemsForPeriod, getOperatingSalesForPeriod } from 'services/crmService';
import { getSupplierInvoicesForPeriod } from 'services/supplierInvoiceService';
import { getEffectivePlanSlug } from 'services/waBusinessService';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const RECOGNIZED_EXPENSE_TYPES = new Set(['gasto_con_iva', 'gasto_sin_iva']);
const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'ARS', 'CRC', 'COP', 'GTQ', 'PYG', 'UYU', 'BOB']);

export function monetaryTolerance(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency || 'CLP').toUpperCase()) ? 1 : 0.01;
}

export function classifyDailyResult({ result, tolerance, future = false, calculable = true, hasData = true }) {
  if (future || !calculable || !hasData) return 'nodata';
  if (result > tolerance) return 'winning';
  if (result < -tolerance) return 'losing';
  return 'breaking';
}

function dayOf(date) {
  const value = String(date || '');
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? Number(value.slice(8, 10)) : null;
}

export function calculateOperatingSnapshot({ costItems = [], purchases = [], dailySales = {}, month, year }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const fixedItems = costItems.filter(item => item.type === 'fixed' && !item.excluded);
  const variableItems = costItems.filter(item => item.type === 'variable' && !item.excluded);
  const fixedCosts = fixedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const variableExpenses = variableItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  let supplierExpenses = 0;
  let merchandise = 0;
  let pendingClassification = 0;
  const supplierByDay = {};

  for (const purchase of purchases) {
    const amount = Number(purchase.totalAmount || 0);
    const ambiguous = !RECOGNIZED_EXPENSE_TYPES.has(purchase.purchaseType) && purchase.purchaseType !== 'mercaderia';
    if (purchase.documentType === 'nota_credito' || ambiguous) {
      pendingClassification += amount;
      continue;
    }
    if (purchase.purchaseType === 'mercaderia') {
      merchandise += amount;
      continue;
    }
    supplierExpenses += amount;
    const day = dayOf(purchase.issueDate);
    if (day) supplierByDay[day] = (supplierByDay[day] || 0) + amount;
  }

  const variableByDay = {};
  for (const item of variableItems) {
    const day = dayOf(item.economicDate);
    if (day) variableByDay[day] = (variableByDay[day] || 0) + Number(item.amount || 0);
  }

  const fixedDaily = fixedCosts / daysInMonth;
  const directExpenses = supplierExpenses + variableExpenses;
  return {
    fixedCosts, variableExpenses, supplierExpenses, directExpenses,
    merchandise, pendingClassification, fixedDaily,
    daily(day) {
      const sales = Number(dailySales[day] || 0);
      const supplier = Number(supplierByDay[day] || 0);
      const variable = Number(variableByDay[day] || 0);
      return { sales, supplier, variable, fixed: fixedDaily, result: sales - supplier - variable - fixedDaily };
    },
  };
}

function HeaderActions({ navigate }) {
  return <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
    <button type="button" onClick={() => navigate('/crm/costos')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <Icon name="Settings" size={15} />Configurar costos fijos
    </button>
    <button type="button" onClick={() => navigate('/proveedores')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <Icon name="Plus" size={15} />Registrar gasto / compra
    </button>
  </div>;
}

function KpiCard({ label, value, available = true, tone = 'slate', note }) {
  const colors = { blue: 'bg-blue-50 text-blue-700', amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700', emerald: 'bg-emerald-50 text-emerald-700', slate: 'bg-slate-50 text-slate-700' };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-2 inline-block rounded-lg px-2 py-1 text-xl font-bold tabular-nums sm:text-2xl ${available ? colors[tone] : 'bg-slate-100 text-slate-500'}`}>{available ? value : 'No disponible'}</p>
    {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
  </div>;
}

const DAY_STATE = {
  winning: { label: 'Rentable', cell: 'border-emerald-200 bg-emerald-50 text-emerald-800', result: 'text-emerald-700' },
  breaking: { label: 'En equilibrio', cell: 'border-amber-200 bg-amber-50 text-amber-800', result: 'text-amber-700' },
  losing: { label: 'Bajo equilibrio', cell: 'border-rose-200 bg-rose-50 text-rose-800', result: 'text-rose-700' },
  nodata: { label: 'Sin datos', cell: 'border-slate-200 bg-slate-50 text-slate-400', result: 'text-slate-400' },
};

function DayDetail({ day, values, state, fmt }) {
  const rows = [['Ventas', values.sales], ['Gastos directos de proveedor', -values.supplier], ['Otros gastos variables', -values.variable], ['Costo fijo prorrateado', -values.fixed]];
  return <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-live="polite">
    <div className="flex items-center justify-between gap-3"><p className="font-semibold text-slate-900">Detalle del día {day}</p><span className="text-xs font-semibold text-slate-600">{DAY_STATE[state].label}</span></div>
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      {rows.map(([label, amount]) => <div key={label} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="font-medium tabular-nums text-slate-800">{amount > 0 ? '+' : amount < 0 ? '−' : ''}{fmt(Math.abs(amount))}</dd></div>)}
      <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 sm:col-span-2"><dt className="font-semibold text-slate-700">Resultado operativo estimado</dt><dd className={`font-bold tabular-nums ${DAY_STATE[state].result}`}>{values.result > 0 ? '+' : values.result < 0 ? '−' : ''}{fmt(Math.abs(values.result))}</dd></div>
    </dl>
  </div>;
}

function OperatingCalendar({ month, year, snapshot, calculable, tolerance, fmt }) {
  const now = new Date();
  const currentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const [selectedDay, setSelectedDay] = useState(null);
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const future = currentMonth && day > now.getDate();
    const values = snapshot.daily(day);
    const hasData = snapshot.fixedCosts > 0 || values.sales > 0 || values.supplier > 0 || values.variable > 0;
    const state = classifyDailyResult({ result: values.result, tolerance, future, calculable, hasData });
    return { day, values, state, future };
  });
  const selected = days.find(item => item.day === selectedDay);

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-bold text-slate-900">Resultado diario</h2><p className="text-xs text-slate-500">Ventas menos gastos del día y costo fijo prorrateado.</p></div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">{Object.entries(DAY_STATE).map(([key, value]) => <span key={key} className="inline-flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-full border ${value.cell}`} />{value.label}</span>)}</div>
    </div>
    <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2">
      {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(label => <div key={label} className="pb-1 text-center text-xs font-semibold text-slate-400">{label}</div>)}
      {Array.from({ length: offset }, (_, index) => <div key={`offset-${index}`} />)}
      {days.map(({ day, values, state, future }) => <button key={day} type="button" disabled={future || !calculable} onClick={() => setSelectedDay(day)} aria-label={`${day}: ${DAY_STATE[state].label}`} aria-pressed={selectedDay === day} className={`min-h-16 rounded-xl border p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-20 sm:p-2 ${DAY_STATE[state].cell} ${selectedDay === day ? 'ring-2 ring-blue-500' : ''}`}>
        <span className="block text-xs font-bold">{day}</span><span className={`mt-1 block truncate text-[10px] font-semibold tabular-nums sm:text-xs ${DAY_STATE[state].result}`}>{state === 'nodata' ? '—' : `${values.result > 0 ? '+' : values.result < 0 ? '−' : ''}${fmt(Math.abs(values.result))}`}</span><span className="mt-1 hidden text-[10px] sm:block">{DAY_STATE[state].label}</span>
      </button>)}
    </div>
    {selected && <DayDetail day={selected.day} values={selected.values} state={selected.state} fmt={fmt} />}
  </section>;
}

function SummaryBlock({ icon, title, amount, description, tone = 'slate' }) {
  const colors = { blue: 'bg-blue-50 text-blue-700', rose: 'bg-rose-50 text-rose-700', amber: 'bg-amber-50 text-amber-700', slate: 'bg-slate-100 text-slate-700' };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colors[tone]}`}><Icon name={icon} size={16} /></span><div><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{amount}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p></div></div></div>;
}

export default function CrmCostCenter() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const planSlug = getEffectivePlanSlug(business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt);
  const isPro = canUseFeature(planSlug, 'costCenter');
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [sales, setSales] = useState(null);
  const [costs, setCosts] = useState(null);
  const [purchases, setPurchases] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const [salesResult, costResult, purchaseResult] = await Promise.allSettled([
      getOperatingSalesForPeriod(business.id, month, year, business.currency),
      getOperatingCostItemsForPeriod(business.id, month, year),
      getSupplierInvoicesForPeriod(business.id, from, to),
    ]);
    setSales(salesResult.status === 'fulfilled' ? salesResult.value : { salesMonth: 0, dailySales: {}, crmTotal: 0, catalogTotal: 0, legacyCatalogRows: 0, incompatibleCurrencyRows: 0, errors: { crm: salesResult.reason || new Error('Error de ventas'), catalog: null } });
    setCosts(costResult.status === 'fulfilled' ? costResult.value : { data: null, error: costResult.reason || new Error('Error de costos') });
    setPurchases(purchaseResult.status === 'fulfilled' ? purchaseResult.value : { data: null, error: purchaseResult.reason || new Error('Error de compras') });
    setLoading(false);
  }, [business?.id, business?.currency, month, year]);

  useEffect(() => { load(); }, [load]);
  const costItems = costs?.data || [];
  const purchaseRows = purchases?.data || [];
  const snapshot = useMemo(() => calculateOperatingSnapshot({ costItems, purchases: purchaseRows, dailySales: sales?.dailySales || {}, month, year }), [costItems, purchaseRows, sales, month, year]);
  const salesAvailable = Boolean(sales) && !sales.errors.crm && !sales.errors.catalog && sales.incompatibleCurrencyRows === 0;
  const costsAvailable = Boolean(costs) && !costs.error;
  const purchasesAvailable = Boolean(purchases) && !purchases.error;
  const calculable = salesAvailable && costsAvailable && purchasesAvailable;
  const salesMonth = Number(sales?.salesMonth || 0);
  const result = salesMonth - snapshot.fixedCosts - snapshot.directExpenses;
  const tolerance = monetaryTolerance(business?.currency);
  const hasPeriodData = salesMonth > 0 || snapshot.fixedCosts > 0 || snapshot.directExpenses > 0 || snapshot.merchandise > 0 || snapshot.pendingClassification > 0;
  const resultState = !calculable || !hasPeriodData ? 'Sin datos' : result > tolerance ? 'Rentable' : result < -tolerance ? 'Bajo equilibrio' : 'En equilibrio';
  const fmt = value => formatMoney(value, business?.currency || 'CLP');

  const changeMonth = delta => {
    let nextMonth = month + delta, nextYear = year;
    if (nextMonth < 1) { nextMonth = 12; nextYear -= 1; }
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    setMonth(nextMonth); setYear(nextYear);
  };

  if (!isPro) return <DashboardAppShell><PanelHeader title="Termómetro del negocio" subtitle="Ventas, costos y resultado operativo del período." /><DashboardLayoutContent><div className="py-24 text-center"><h2 className="font-semibold text-slate-900">Funcionalidad Business</h2><p className="mt-2 text-sm text-slate-500">Requiere el plan Business.</p></div></DashboardLayoutContent></DashboardAppShell>;

  return <DashboardAppShell>
    <PanelHeader title={<h1 className="text-base font-bold text-slate-900">Termómetro del negocio</h1>} subtitle={<p className="text-xs text-slate-500">Ventas, costos y resultado operativo del período.</p>} mobileActions={<HeaderActions navigate={navigate} />}><HeaderActions navigate={navigate} /></PanelHeader>
    <DashboardLayoutContent innerClassName="lg:max-w-7xl">
      <div className="flex items-center justify-center"><div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm"><button type="button" onClick={() => changeMonth(-1)} aria-label="Mes anterior" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500"><Icon name="ChevronLeft" size={16} /></button><span className="min-w-36 text-center text-sm font-semibold text-slate-800">{MONTHS[month - 1]} {year}</span><button type="button" onClick={() => changeMonth(1)} aria-label="Mes siguiente" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500"><Icon name="ChevronRight" size={16} /></button></div></div>

      {loading ? <div className="flex items-center justify-center py-20" role="status"><Icon name="Loader2" size={26} className="animate-spin text-blue-500" /><span className="sr-only">Cargando termómetro</span></div> : <>
        {(!calculable || sales?.legacyCatalogRows > 0 || costs?.data?.some(item => item.missingMovement)) && <div className="space-y-2" role="alert">
          {sales?.errors.crm && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">No se pudieron cargar las ventas CRM/TPV.</p>}
          {sales?.errors.catalog && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">No se pudieron cargar las ventas del catálogo.</p>}
          {costs?.error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">No se pudieron cargar los costos configurados.</p>}
          {purchases?.error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">No se pudieron cargar las compras y gastos de proveedor.</p>}
          {sales?.incompatibleCurrencyRows > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Hay {sales.incompatibleCurrencyRows} venta(s) del catálogo en una moneda distinta de {business?.currency || 'CLP'}. Se excluyeron y el resultado queda sin calcular.</p>}
          {sales?.legacyCatalogRows > 0 && <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Se reconocieron {sales.legacyCatalogRows} venta(s) legacy del catálogo usando su fecha de actualización porque no tenían paid_at.</p>}
          {costs?.data?.some(item => item.missingMovement) && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Hay gastos vinculados a movimientos de Caja que ya no están disponibles. Se conservaron como gastos variables.</p>}
        </div>}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores del período">
          <KpiCard label="Ventas del mes" value={fmt(salesMonth)} available={salesAvailable} tone="blue" note={salesAvailable ? `CRM/TPV ${fmt(sales.crmTotal)} · Catálogo ${fmt(sales.catalogTotal)}` : undefined} />
          <KpiCard label="Costos fijos" value={fmt(snapshot.fixedCosts)} available={costsAvailable} tone="amber" note="Solo partidas configuradas como fijas." />
          <KpiCard label="Gastos directos" value={fmt(snapshot.directExpenses)} available={costsAvailable && purchasesAvailable} tone="rose" note="Proveedor reconocido + otros gastos variables." />
          <KpiCard label="Resultado operativo estimado" value={`${result > 0 ? '+' : result < 0 ? '−' : ''}${fmt(Math.abs(result))}`} available={calculable} tone={result > tolerance ? 'emerald' : result < -tolerance ? 'rose' : 'amber'} note={resultState} />
        </section>

        <OperatingCalendar month={month} year={year} snapshot={snapshot} calculable={calculable} tolerance={tolerance} fmt={fmt} />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Composición de costos">
          <SummaryBlock icon="Building2" title="Costos fijos" amount={costsAvailable ? fmt(snapshot.fixedCosts) : 'No disponible'} description="Partidas mensuales configuradas como fijas." tone="blue" />
          <SummaryBlock icon="Receipt" title="Gastos directos" amount={costsAvailable && purchasesAvailable ? fmt(snapshot.directExpenses) : 'No disponible'} description={`Proveedor ${fmt(snapshot.supplierExpenses)} · Variables ${fmt(snapshot.variableExpenses)}`} tone="rose" />
          <SummaryBlock icon="Package" title="Compras de mercadería" amount={purchasesAvailable ? fmt(snapshot.merchandise) : 'No disponible'} description="Se muestran por separado y no reducen el resultado operativo." tone="amber" />
          <SummaryBlock icon="CircleHelp" title="Pendientes de clasificar" amount={purchasesAvailable ? fmt(snapshot.pendingClassification) : 'No disponible'} description="Servicios, otros, tipo vacío y notas de crédito sin tratamiento automático." />
        </section>
      </>}
    </DashboardLayoutContent>
  </DashboardAppShell>;
}
