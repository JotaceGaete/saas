import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import { CRM_EARLY_ACCESS_MODE } from 'config/crmConfig';
import { formatMoney } from 'utils/formatMoney';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import {
  getCostCenter,
  upsertCostCenter,
  getCrmSalesTotalsForPeriod,
  getCrmDailySalesForPeriod,
  getPurchaseTotalsForPeriod,
  getPurchaseInvoices,
} from 'services/crmService';
import { getEffectivePlanSlug } from 'services/waBusinessService';

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const fmt = (n) => formatMoney(n, 'CLP');
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function dayFromDate(dateStr) { return dateStr ? parseInt(dateStr.slice(8, 10), 10) : null; }

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
  },
  breaking: {
    emoji: '😐',
    label: 'Estás cerca del equilibrio',
    bg: 'from-yellow-400 to-amber-500',
    badge: 'bg-yellow-600/30 text-white',
  },
  losing: {
    emoji: '😟',
    label: 'Hoy estás perdiendo dinero',
    bg: 'from-red-500 to-rose-600',
    badge: 'bg-red-600/30 text-white',
  },
  unconfigured: {
    emoji: '🏪',
    label: 'Sin datos de gastos aún',
    bg: 'from-blue-500 to-blue-600',
    badge: 'bg-blue-600/30 text-white',
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

function HeroCard({ state, salesToday, dailyCost }) {
  const s = STATE[state];
  const pct      = dailyCost > 0 ? Math.round((salesToday / dailyCost) * 100) : 0;
  const remaining = Math.max(0, dailyCost - salesToday);
  const surplus   = Math.max(0, salesToday - dailyCost);

  const subText = {
    winning:      `Ya cubriste el costo de hoy.\nTodo lo que vendas ahora es ganancia.`,
    breaking:     `Casi llegas — te faltan ${fmt(Math.ceil(remaining))} más para cubrir el día.`,
    losing:       `Todavía no cubres los gastos de hoy.\nTe faltan ${fmt(Math.ceil(remaining))}.`,
    unconfigured: 'Registra compras en la sección "Compras" para activar el termómetro.',
  }[state] || '';

  return (
    <div className={`rounded-2xl bg-gradient-to-br ${s.bg} p-7 shadow-lg select-none`}>
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1 min-w-0 pr-4">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-2">Estado hoy</p>
          <p className="text-3xl font-black leading-tight text-white">{s.label}</p>
          <p className="text-white/80 text-sm mt-2 leading-relaxed whitespace-pre-line">{subText}</p>
        </div>
        <span className="text-6xl leading-none shrink-0">{s.emoji}</span>
      </div>

      {dailyCost > 0 && (
        <>
          <AnimatedBar pct={pct} colorClass="bg-white/70" height="h-4" />
          <div className="flex justify-between items-baseline mt-3">
            <span className="font-black text-white text-2xl tabular-nums">{fmt(salesToday)}</span>
            <span className="text-white/60 text-sm">de {fmt(Math.ceil(dailyCost))} hoy</span>
          </div>

          {surplus > 0 && (
            <div className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${s.badge}`}>
              <Icon name="TrendingUp" size={13} />
              Vas {fmt(Math.floor(surplus))} arriba 🎯
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-white/20">
            <div className="flex items-center justify-between">
              <p className="text-white/60 text-xs">Costo diario promedio</p>
              <p className="text-white/80 text-sm font-semibold">{fmt(Math.ceil(dailyCost))}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Hoyo financiero ──────────────────────────────────────────────────────────

function HoyoCard({ totalCosts, salesMonth }) {
  const gap     = totalCosts - salesMonth;
  const covered = gap <= 0;
  const pct     = totalCosts > 0 ? Math.min(100, Math.round((salesMonth / totalCosts) * 100)) : 0;
  const close   = !covered && pct >= 80;
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

      {covered && (
        <p className="text-sm text-green-600 mt-3">
          Desde este momento cada venta suma directamente a tu utilidad. 💪
        </p>
      )}
      {!covered && close && (
        <p className="text-sm text-yellow-700 font-medium mt-3">Vas muy bien — casi llegas 💪</p>
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
  const diff = dailyCost > 0 ? (sales || 0) - dailyCost : null;
  const dateLabel = new Date(year, month - 1, day).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });

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
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 bg-gray-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl min-w-36">
          <p className="font-bold mb-1.5 text-white capitalize">{dateLabel}</p>
          <div className="space-y-0.5">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Ventas</span>
              <span className="font-semibold">{fmt(sales || 0)}</span>
            </div>
            {dailyCost > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Meta diaria</span>
                <span className="font-semibold">{fmt(Math.ceil(dailyCost))}</span>
              </div>
            )}
            {varExp > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-400">Gastos día</span>
                <span className="font-semibold">{fmt(varExp)}</span>
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
    const sales  = dailySales[d] || 0;
    const varExp = (dailyVarExpenses || {})[d] || 0;
    if (dailyCost <= 0) return { d, state: 'nodata', sales, varExp };
    return { d, state: getState(sales, dailyCost), sales, varExp };
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
            key={d} day={d} month={month} year={year}
            state={state} sales={sales} varExp={varExp}
            dailyCost={dailyCost}
            isToday={isCurrentMonth && d === todayDay}
          />
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center mt-3">Toca un día para ver detalles</p>
    </div>
  );
}

// ─── Widget Compras ───────────────────────────────────────────────────────────

function ComprasWidget({ purchaseTotals, navigate }) {
  const mercaderiaTotal  = purchaseTotals?.totals?.mercaderia?.total  || 0;
  const operacionalTotal = purchaseTotals?.totalOperational           || 0;
  const hasData = mercaderiaTotal > 0 || operacionalTotal > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
          <Icon name="FileInput" size={16} color="#e11d48" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-800">Compras del período</p>
          {hasData ? (
            <div className="flex gap-3 flex-wrap mt-0.5">
              {mercaderiaTotal > 0 && (
                <span className="text-xs text-blue-600">
                  Mercadería: <strong>{fmt(mercaderiaTotal)}</strong>
                </span>
              )}
              {operacionalTotal > 0 && (
                <span className="text-xs text-amber-600">
                  Gastos: <strong>{fmt(operacionalTotal)}</strong>
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">Sin compras registradas este período</p>
          )}
        </div>
      </div>
      <button
        onClick={() => navigate('/crm/compras')}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors"
      >
        <Icon name="Plus" size={12} />
        Registrar
      </button>
    </div>
  );
}

// ─── Panel IVA estimado ───────────────────────────────────────────────────────

function IvaSummaryPanel({ salesMonth, purchaseTotals, vatRate }) {
  const rate = vatRate || 19;
  const ivaVentas  = salesMonth > 0 ? +(salesMonth * rate / (100 + rate)).toFixed(0) : 0;
  const ivaCompras = purchaseTotals?.totalTaxCredit  || 0;
  const ivaNeto    = Math.max(0, ivaVentas - ivaCompras);
  const mercaderiaTotal  = purchaseTotals?.totals?.mercaderia?.total  || 0;
  const operacionalTotal = purchaseTotals?.totalOperational           || 0;

  if (!salesMonth && !ivaCompras && !mercaderiaTotal && !operacionalTotal) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
          <Icon name="Percent" size={15} color="#4f46e5" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-800">Resumen IVA estimado</p>
          <p className="text-[10px] text-gray-400">Tasa {rate}% · Cálculo referencial</p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Ventas del período</span>
          <span className="text-sm font-semibold text-gray-800">{fmt(salesMonth)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">IVA ventas estimado</span>
          <span className="text-sm font-semibold text-emerald-700">{fmt(ivaVentas)}</span>
        </div>

        {ivaCompras > 0 && (
          <>
            <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
              <span className="text-xs text-gray-500">IVA compras (crédito fiscal)</span>
              <span className="text-sm font-semibold text-blue-700">− {fmt(ivaCompras)}</span>
            </div>
            <div className="flex justify-between items-center bg-indigo-50 rounded-lg px-3 py-2">
              <span className="text-xs font-bold text-indigo-800">IVA neto estimado</span>
              <span className="text-base font-bold text-indigo-900">{fmt(ivaNeto)}</span>
            </div>
          </>
        )}

        {(mercaderiaTotal > 0 || operacionalTotal > 0) && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            {mercaderiaTotal > 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                  <span className="text-xs text-gray-500">Compra mercadería</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-700">{fmt(mercaderiaTotal)}</span>
                  <p className="text-[9px] text-blue-500 leading-none">inventario</p>
                </div>
              </div>
            )}
            {operacionalTotal > 0 && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-xs text-gray-500">Gastos operativos</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-700">{fmt(operacionalTotal)}</span>
                  <p className="text-[9px] text-amber-500 leading-none">afecta rentabilidad</p>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
          ⚠️ Estimación referencial. No reemplaza la declaración tributaria oficial.
        </p>
      </div>
    </div>
  );
}

// ─── Panel de ajustes ─────────────────────────────────────────────────────────

function SettingsPanel({ center, businessId, month, year, onSave }) {
  const [open, setOpen]     = useState(false);
  const [openDays, setOpenDays] = useState(center?.open_days ?? 22);
  const [vatRate,  setVatRate]  = useState(center?.vat_rate  ?? 19);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const save = async () => {
    setSaving(true);
    const c = await upsertCostCenter(businessId, month, year, {
      open_days: clamp(+openDays || 22, 1, 31),
      vat_rate:  clamp(+vatRate  || 19, 0, 100),
      uses_vat: true,
      profit_goal: null,
      onboarding_done: true,
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
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Tasa IVA (%)</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" max="100" step="0.5"
                value={vatRate}
                onChange={e => setVatRate(e.target.value)}
                className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-400">% (Chile 19%, Argentina 21%)</span>
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

// ─── Dashboard principal ──────────────────────────────────────────────────────

function Dashboard({ center, sales, dailySales, purchaseTotals, purchases, month, year, onEditSettings, businessId, navigate }) {
  const now = new Date();
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();
  const today = now.toISOString().slice(0, 10);

  const openDays        = center?.open_days || 22;
  const totalOperacional = purchaseTotals?.totalOperational || 0;
  // dailyCost = gastos operativos amortizados por día hábil
  const dailyCost       = openDays > 0 && totalOperacional > 0 ? totalOperacional / openDays : 0;

  // Mapa día → gastos operativos (gasto_con_iva + gasto_sin_iva) para el calendario
  const dailyVarExpenses = {};
  for (const p of (purchases || [])) {
    if (p.purchase_type === 'mercaderia') continue;
    const d = dayFromDate(p.invoice_date);
    if (d) dailyVarExpenses[d] = (dailyVarExpenses[d] || 0) + (p.total_amount || 0);
  }

  const salesToday  = isCurrentMonth ? sales.salesToday  : 0;
  const salesMonth  = sales.salesMonth;
  const todayState  = getState(salesToday, dailyCost);

  return (
    <div className="space-y-4 max-w-lg mx-auto">

      {/* Tarjeta héroe */}
      <HeroCard
        state={isCurrentMonth ? todayState : 'unconfigured'}
        salesToday={salesToday}
        dailyCost={dailyCost}
      />

      {/* Hoyo financiero */}
      <HoyoCard
        totalCosts={totalOperacional}
        salesMonth={salesMonth}
      />

      {/* Calendario */}
      <HealthCalendar
        month={month} year={year}
        dailySales={dailySales}
        dailyCost={dailyCost}
        dailyVarExpenses={dailyVarExpenses}
      />

      {/* Widget de compras — fuente única de datos */}
      <ComprasWidget purchaseTotals={purchaseTotals} navigate={navigate} />

      {/* Resumen IVA */}
      <IvaSummaryPanel
        salesMonth={salesMonth}
        purchaseTotals={purchaseTotals}
        vatRate={center?.vat_rate || 19}
      />

      {/* Ajustes */}
      <SettingsPanel center={center} businessId={businessId} month={month} year={year} onSave={onEditSettings} />
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CrmCostCenter() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const planSlug = getEffectivePlanSlug(
    business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt
  );
  const isPro = CRM_EARLY_ACCESS_MODE || planSlug === 'business';

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const [center,         setCenter]         = useState(null);
  const [sales,          setSales]          = useState({ salesMonth: 0, salesToday: 0 });
  const [dailySales,     setDailySales]     = useState({});
  const [purchaseTotals, setPurchaseTotals] = useState(null);
  const [purchases,      setPurchases]      = useState([]);
  const [loading,        setLoading]        = useState(true);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const [c, s, ds, pt, pr] = await Promise.all([
      getCostCenter(business.id, month, year),
      getCrmSalesTotalsForPeriod(business.id, month, year),
      getCrmDailySalesForPeriod(business.id, month, year),
      getPurchaseTotalsForPeriod(business.id, month, year),
      getPurchaseInvoices(business.id, { month, year }),
    ]);
    setCenter(c);
    setSales(s);
    setDailySales(ds);
    setPurchaseTotals(pt);
    setPurchases(pr.data || []);
    setLoading(false);
  }, [business?.id, month, year]);

  useEffect(() => { load(); }, [load]);

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
            {MONTHS[month - 1]} {year}
          </p>
        }
      />

      <DashboardLayoutContent>
        {/* Selector de período */}
        {!loading && (
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
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Dashboard
            center={center}
            sales={sales}
            dailySales={dailySales}
            purchaseTotals={purchaseTotals}
            purchases={purchases}
            month={month}
            year={year}
            onEditSettings={(c) => setCenter(c)}
            businessId={business.id}
            navigate={navigate}
          />
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
