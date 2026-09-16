import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { PDFDownloadLink } from '@react-pdf/renderer';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import Icon from 'components/AppIcon';
import { useAuth } from 'contexts/AuthContext';
import { formatMoney } from 'utils/formatMoney';
import { PAYMENT_METHOD_LABELS, getDailySummary, getLocalDateString } from 'services/crmService';
import CrmResumenDiaPdfDocument from './CrmResumenDiaPdfDocument';
import { buildResumenDiaPdfFilename, getResumenDiaHeaderActionSlots } from './resumenDiaPdf';

// RESUMEN-DEL-DIA-2 — hoja imprimible: se oculta todo lo demás en @media
// print (sidebar/app-shell, header, selector de fecha, los propios botones
// Imprimir/Descargar) y se muestra SOLO el contenido con esta clase, en
// blanco, tamaño A4. Mismo mecanismo "ocultar todo salvo una clase" que ya
// usan OrderDetailDrawer.jsx (.order-print-sheet) y CrmBarcodes.jsx -- no se
// inventa un mecanismo de impresión distinto.
const PRINT_STYLE = `
@page {
  size: A4;
  margin: 12mm;
}

@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  body * {
    visibility: hidden !important;
  }

  .resumen-dia-print-sheet,
  .resumen-dia-print-sheet * {
    visibility: visible !important;
  }

  .resumen-dia-print-sheet {
    display: flex !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
  }

  .resumen-dia-print-sheet section {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
}
`;

// Mismo vocabulario de categorías que CrmCostos.jsx / crm_cost_items_category_check
// (rent, salaries, utilities, services, taxes, supplies, other) -- no se inventan
// categorías nuevas acá, solo se etiquetan para mostrar.
const CATEGORY_LABELS = {
  rent: 'Arriendo',
  salaries: 'Sueldos',
  utilities: 'Servicios básicos',
  services: 'Servicios / Software',
  taxes: 'Impuestos / Contabilidad',
  supplies: 'Insumos',
  other: 'Otros gastos',
};

const METHOD_ORDER = ['cash', 'card', 'debit_card', 'credit_card', 'bank_transfer', 'mercado_pago', 'check', 'other'];

const STOCK_TYPE_LABELS = { entrada: 'Entradas', salida: 'Salidas', ajuste: 'Ajustes' };

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta, 12, 0, 0, 0);
  const offset = dt.getTimezoneOffset();
  const local = new Date(dt.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function fmtDateLong(dateStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function Section({ title, subtitle, icon, right, children }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gray-100">
              <Icon name={icon} size={15} color="var(--color-foreground)" />
            </span>
          )}
          <div>
            <h2 className="text-sm font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function KpiCard({ label, value, hint, tone = 'text-gray-900', emphasize = false, badge, unavailable = false }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        {badge}
      </div>
      {unavailable ? (
        <p className="mt-1.5 flex items-center gap-1 text-sm font-bold text-red-500">
          <Icon name="AlertCircle" size={13} />
          No disponible
        </p>
      ) : (
        <p className={`mt-1.5 tabular-nums font-black leading-tight ${emphasize ? 'text-2xl' : 'text-lg'} ${tone}`}>
          {value}
        </p>
      )}
      {hint && !unavailable && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function EmptyRow({ children }) {
  return <p className="py-6 text-center text-sm text-gray-400">{children}</p>;
}

// "Sin actividad" (datos reales, todos en cero) y "no pudimos obtener el
// dato" (falló la consulta) son estados DISTINTOS -- este componente es
// SIEMPRE el segundo caso, nunca se reutiliza para un $0 real.
function UnavailableNotice({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <Icon name="AlertCircle" size={15} className="mt-0.5 shrink-0" />
      <span>{children || 'No pudimos obtener esta información. Intenta recargar en unos minutos.'}</span>
    </div>
  );
}

function DateSelector({ date, onChange }) {
  const today = getLocalDateString();
  const yesterday = addDays(today, -1);
  const preset = date === today ? 'today' : date === yesterday ? 'yesterday' : 'custom';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onChange(today)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${preset === 'today' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => onChange(yesterday)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${preset === 'yesterday' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          Ayer
        </button>
      </div>
      <input
        type="date"
        value={date}
        max={today}
        onChange={e => e.target.value && onChange(e.target.value)}
        className={`rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm ${preset === 'custom' ? 'border-gray-900 text-gray-900' : 'border-gray-200 text-gray-500'}`}
      />
    </div>
  );
}

function SalesByHourChart({ byHour, currency }) {
  const data = (byHour || []).map(h => ({ hour: `${String(h.hour).padStart(2, '0')}h`, total: h.total }));
  const max = Math.max(...data.map(d => d.total), 0);
  if (max <= 0) return <EmptyRow>Sin ventas registradas este día.</EmptyRow>;
  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={2} />
          <Tooltip
            cursor={{ fill: 'rgba(17,24,39,0.04)' }}
            formatter={(value) => [formatMoney(value, currency), 'Ventas']}
            labelFormatter={(label) => label}
            contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.total === max ? '#059669' : 'rgba(5,150,105,0.25)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ExpensesByCategoryChart({ byCategory, currency }) {
  const entries = Object.entries(byCategory || {}).filter(([, v]) => v > 0);
  if (!entries.length) return <EmptyRow>Sin gastos registrados este día.</EmptyRow>;
  const data = entries
    .map(([key, value]) => ({ key, label: CATEGORY_LABELS[key] || key, total: value }))
    .sort((a, b) => b.total - a.total);
  const max = Math.max(...data.map(d => d.total), 0);
  return (
    <div style={{ height: Math.max(120, data.length * 34) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} width={140} />
          <Tooltip
            cursor={{ fill: 'rgba(17,24,39,0.04)' }}
            formatter={(value) => [formatMoney(value, currency), 'Gasto']}
            contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={16}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.total === max ? '#b91c1c' : 'rgba(185,28,28,0.25)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const ALERT_ICON = { warning: 'AlertTriangle', info: 'Info', error: 'AlertCircle' };
const ALERT_TONE = {
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', color: 'text-amber-800', icon: '#b45309' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', color: 'text-blue-800', icon: '#1d4ed8' },
  error: { bg: 'bg-red-50', border: 'border-red-200', color: 'text-red-800', icon: '#b91c1c' },
};

export default function CrmResumenDia() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(getLocalDateString());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // PanelHeader monta `children` y `mobileActions` simultáneamente (solo
  // alterna cuál se ve por CSS) -- como reportActions incluye un
  // <PDFDownloadLink> (genera el PDF al montarse), pasarlo a ambos props
  // produciría dos generadores de PDF activos a la vez. Se decide un único
  // slot en JS según el mismo corte `lg` (1024px) que usa PanelHeader --
  // mismo patrón de detección de breakpoint que ya usa CrmDocumentPdf.jsx
  // (isMobile vía matchMedia) para el mismo tipo de problema.
  const [isMobileHeader, setIsMobileHeader] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    const handler = (e) => setIsMobileHeader(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const currency = business?.currency || 'CLP';

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await getDailySummary(business.id, date);
      setSummary(data);
    } catch (err) {
      setErrorMsg(err?.message || 'No se pudo cargar el resumen del día.');
      setSummary(null);
    }
    setLoading(false);
  }, [business?.id, date]);

  useEffect(() => { load(); }, [load]);

  const sales = summary?.sales;
  const collections = summary?.collections;
  const expenses = summary?.expenses;
  const cash = summary?.cash;
  const inventory = summary?.inventory;
  const profitability = summary?.profitability;
  const alerts = summary?.alerts || [];
  const isToday = summary?.metadata?.is_today ?? (date === getLocalDateString());

  const resultTone = useMemo(() => {
    const r = profitability?.estimatedResult ?? 0;
    if (r > 0) return 'text-emerald-700';
    if (r < 0) return 'text-red-600';
    return 'text-gray-500';
  }, [profitability]);

  const canExport = !loading && !!summary;
  const pdfFilename = buildResumenDiaPdfFilename(business?.name, date);

  const printButton = (
    <button
      type="button"
      onClick={() => window.print()}
      disabled={!canExport}
      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 lg:flex-none lg:px-4"
    >
      <Icon name="Printer" size={14} />
      Imprimir
    </button>
  );

  // El PDFDownloadLink de @react-pdf/renderer NO puede renderizar `document`
  // undefined -- por eso solo se monta cuando ya hay `summary` (guardia
  // equivalente a `!summary` que ya usa el resto de esta página). Consume el
  // MISMO `summary` que ya está en memoria: nunca vuelve a llamar a
  // getDailySummary.
  const downloadButton = canExport ? (
    <PDFDownloadLink
      document={<CrmResumenDiaPdfDocument summary={summary} business={business} date={date} />}
      fileName={pdfFilename}
      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 lg:flex-none lg:px-4"
    >
      {({ loading: pdfLoading }) => pdfLoading
        ? <><Icon name="Loader2" size={14} className="animate-spin" />Preparando…</>
        : <><Icon name="Download" size={14} />Descargar PDF</>
      }
    </PDFDownloadLink>
  ) : (
    <button
      type="button"
      disabled
      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white opacity-40 lg:flex-none lg:px-4"
    >
      <Icon name="Download" size={14} />
      Descargar PDF
    </button>
  );

  const reportActions = (
    <>
      {printButton}
      {downloadButton}
    </>
  );

  // Exactamente un slot activo (children O mobileActions, nunca ambos) --
  // ver getResumenDiaHeaderActionSlots: evita montar dos <PDFDownloadLink>
  // simultáneos.
  const headerActionSlots = getResumenDiaHeaderActionSlots(isMobileHeader, reportActions);

  return (
    <DashboardAppShell>
      <style>{PRINT_STYLE}</style>
      <PanelHeader
        title={
          <>
            <CrmBreadcrumb section="Resumen del día" />
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
              Resumen del día
            </h1>
          </>
        }
        subtitle={
          <p className="text-xs capitalize" style={{ color: 'var(--color-muted-foreground)' }}>
            {fmtDateLong(date)}
          </p>
        }
        mobileActions={headerActionSlots.mobileActions}
      >
        {headerActionSlots.children}
      </PanelHeader>

      <DashboardLayoutContent innerClassName="lg:max-w-6xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <DateSelector date={date} onChange={setDate} />
          {!isToday && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              <Icon name="History" size={12} />
              Fecha histórica — algunos datos reflejan el estado actual, no el de ese día
            </span>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <Icon name="AlertCircle" size={16} className="mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
        ) : !summary ? (
          <EmptyRow>No se pudo cargar el resumen.</EmptyRow>
        ) : (
          <div className="resumen-dia-print-sheet flex flex-col gap-5 md:gap-6">
            {/* 1. Cabecera / KPIs ------------------------------------------------ */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <KpiCard
                label="Ventas netas"
                value={sales.available ? formatMoney(sales.net, currency) : undefined}
                unavailable={!sales.available}
                hint="Lo que se vendió hoy"
                tone="text-blue-700"
                emphasize
                badge={<Icon name="ShoppingBag" size={14} color="#1d4ed8" />}
              />
              <KpiCard
                label="Dinero recibido"
                value={collections.available ? formatMoney(collections.total, currency) : undefined}
                unavailable={!collections.available}
                hint="Lo que efectivamente entró en caja/cuentas"
                tone="text-emerald-700"
                emphasize
                badge={<Icon name="Wallet" size={14} color="#059669" />}
              />
              <KpiCard
                label="Gastos"
                value={expenses.available ? formatMoney(expenses.total, currency) : undefined}
                unavailable={!expenses.available}
                hint={expenses.available && expenses.cashOutflowsNonExpense > 0 ? `+ ${formatMoney(expenses.cashOutflowsNonExpense, currency)} en otros egresos` : undefined}
                tone="text-red-600"
              />
              <KpiCard
                label="Saldo antes de costo de mercadería"
                value={profitability.available ? `${profitability.estimatedResult > 0 ? '+' : ''}${formatMoney(profitability.estimatedResult, currency)}` : undefined}
                unavailable={!profitability.available}
                hint="No es la ganancia del día — no incluye costo de mercadería"
                tone={resultTone}
              />
              <KpiCard label="N° de ventas" value={sales.available ? sales.count : undefined} unavailable={!sales.available} />
              <KpiCard label="Ticket promedio" value={sales.available ? formatMoney(sales.avgTicket, currency) : undefined} unavailable={!sales.available} />
            </div>

            {/* 2. Ventas ---------------------------------------------------------- */}
            <Section title="Ventas" subtitle="Notas de venta emitidas este día (excluye anuladas)" icon="TrendingUp">
              {!sales.available ? (
                <UnavailableNotice>No pudimos obtener las ventas de este día. Intenta recargar en unos minutos.</UnavailableNotice>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <KpiCard label="Bruta" value={formatMoney(sales.gross, currency)} />
                    <KpiCard label="Descuentos" value={formatMoney(sales.discount, currency)} />
                    <KpiCard label="Neta" value={formatMoney(sales.net, currency)} tone="text-blue-700" />
                    <KpiCard label="Unidades vendidas" value={sales.unitsSold} />
                  </div>

                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Ventas por hora</p>
                    <SalesByHourChart byHour={sales.byHour} currency={currency} />
                  </div>

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Productos más vendidos</p>
                      {sales.topProducts.length === 0 ? (
                        <EmptyRow>Sin ventas de productos este día.</EmptyRow>
                      ) : (
                        <ul className="space-y-2">
                          {sales.topProducts.map((p, i) => (
                            <li key={p.productId || p.name || i} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2 text-sm">
                              <span className="min-w-0 truncate font-medium text-gray-700">{p.name || 'Producto'}</span>
                              <span className="shrink-0 tabular-nums text-gray-500">{p.quantity} un · {formatMoney(p.subtotal, currency)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Ventas por canal</p>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                          <span className="font-medium text-gray-700">TPV (caja física)</span>
                          <span className="tabular-nums text-gray-500">{formatMoney(sales.byChannel.pos, currency)}</span>
                        </li>
                        <li className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                          <span className="font-medium text-gray-700">Notas de venta manuales</span>
                          <span className="tabular-nums text-gray-500">{formatMoney(sales.byChannel.crmManual, currency)}</span>
                        </li>
                        <li className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                          <span className="font-medium text-gray-700">Tienda online</span>
                          <span className="tabular-nums text-gray-500">{formatMoney(sales.byChannel.online, currency)}</span>
                        </li>
                      </ul>
                      {sales.voidedCount > 0 && (
                        <p className="mt-2 text-xs text-gray-400">{sales.voidedCount} venta{sales.voidedCount === 1 ? '' : 's'} anulada{sales.voidedCount === 1 ? '' : 's'} este día (no incluida{sales.voidedCount === 1 ? '' : 's'} arriba).</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </Section>

            {/* 3. Dinero recibido --------------------------------------------------- */}
            <Section title="Dinero recibido" subtitle="Pagos efectivamente recibidos este día, por medio" icon="Wallet">
              {!collections.available ? (
                <UnavailableNotice>No pudimos obtener el dinero recibido de este día. Intenta recargar en unos minutos.</UnavailableNotice>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {METHOD_ORDER.filter(m => collections.byMethod[m] > 0).map(m => (
                      <div key={m} className="rounded-xl border border-gray-100 px-3 py-2">
                        <p className="text-xs text-gray-400">{PAYMENT_METHOD_LABELS[m] || m}</p>
                        <p className="tabular-nums text-sm font-bold text-gray-800">{formatMoney(collections.byMethod[m], currency)}</p>
                      </div>
                    ))}
                    {METHOD_ORDER.every(m => collections.byMethod[m] <= 0) && <EmptyRow>Sin cobros registrados este día.</EmptyRow>}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-3">
                    <span className="text-sm font-semibold text-emerald-800">Total recibido</span>
                    <span className="tabular-nums text-lg font-black text-emerald-700">{formatMoney(collections.total, currency)}</span>
                  </div>
                </>
              )}
              {collections.pendingTodayAvailable ? (
                collections.pendingToday > 0 && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-amber-700">
                    <Icon name="Clock" size={14} />
                    Ventas de hoy pendientes de cobro: <strong className="tabular-nums">{formatMoney(collections.pendingToday, currency)}</strong>
                  </p>
                )
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
                  <Icon name="AlertCircle" size={14} />
                  No pudimos calcular las ventas pendientes de cobro de este día.
                </p>
              )}
            </Section>

            {/* 4. Gastos y egresos ---------------------------------------------------- */}
            <Section title="Gastos y egresos" subtitle="Gastos variables del día y otros movimientos de caja que no son gasto" icon="Receipt">
              {!expenses.available ? (
                <UnavailableNotice>No pudimos obtener los gastos de este día. Intenta recargar en unos minutos.</UnavailableNotice>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <KpiCard label="Gastos del día" value={formatMoney(expenses.total, currency)} tone="text-red-600" />
                    <KpiCard label="Otros egresos de caja" value={formatMoney(expenses.cashOutflowsNonExpense, currency)} hint="Retiros, traslados — no son gasto" />
                    <KpiCard label="Total egresado" value={formatMoney(expenses.total + expenses.cashOutflowsNonExpense, currency)} />
                  </div>
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Gastos por categoría</p>
                    <ExpensesByCategoryChart byCategory={expenses.byCategory} currency={currency} />
                  </div>
                </>
              )}
            </Section>

            {/* 5. Saldo antes de costo de mercadería ------------------------------ */}
            <Section title="Saldo antes de costo de mercadería" icon="Calculator">
              {!profitability.available ? (
                <UnavailableNotice>No pudimos calcular el saldo del día porque faltan datos de ventas o de gastos. Intenta recargar en unos minutos.</UnavailableNotice>
              ) : (
                <>
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className={`tabular-nums text-3xl font-black ${resultTone}`}>
                        {profitability.estimatedResult > 0 ? '+' : ''}{formatMoney(profitability.estimatedResult, currency)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">Ventas netas − Gastos registrados</p>
                    </div>
                  </div>
                  <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                    <Icon name="AlertTriangle" size={12} className="mr-1 inline align-text-bottom" />
                    Ventas netas menos gastos registrados. No incluye el costo de los productos vendidos, por lo que no representa la ganancia del día.
                  </p>
                  <p className="mt-2 rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
                    <Icon name="Info" size={12} className="mr-1 inline align-text-bottom" />
                    {profitability.disclaimer}
                  </p>
                </>
              )}
            </Section>

            {/* 6. Caja y conciliación ------------------------------------------------ */}
            <Section
              title="Caja y conciliación"
              subtitle="Puede haber más de una caja abierta/cerrada este día (cambios de turno)"
              icon="Landmark"
              right={
                <button
                  type="button"
                  onClick={() => navigate('/crm/caja')}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Ir a Caja
                </button>
              }
            >
              {!cash.available ? (
                <UnavailableNotice>No pudimos obtener el estado de caja de este día. Intenta recargar en unos minutos.</UnavailableNotice>
              ) : cash.sessions.length === 0 ? (
                <EmptyRow>No hubo caja abierta este día.</EmptyRow>
              ) : (
                <div className="space-y-3">
                  {cash.sessions.map(session => (
                    <div key={session.id} className="rounded-xl border border-gray-100 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${session.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${session.status === 'open' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            {session.status === 'open' ? 'Caja abierta' : 'Caja cerrada'}
                          </span>
                          <span className="text-xs text-gray-400">
                            Apertura {fmtTime(session.opened_at)}{session.closed_at ? ` · Cierre ${fmtTime(session.closed_at)}` : ''}
                          </span>
                        </div>
                      </div>

                      {session.isLiveEstimate && session.liveEstimateUnavailable && (
                        <div className="mt-3">
                          <UnavailableNotice>No pudimos obtener el estado de esta caja abierta. Intenta recargar en unos minutos.</UnavailableNotice>
                        </div>
                      )}

                      {session.isLiveEstimate && !session.liveEstimateUnavailable && (
                        <div className="mt-3">
                          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            <Icon name="Clock" size={12} />
                            Caja abierta — estimado en vivo, no es un arqueo definitivo
                          </p>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Efectivo físico esperado</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <KpiCard label="Fondo inicial" value={formatMoney(session.initial_amount, currency)} />
                            <KpiCard label="Cobros en efectivo" value={formatMoney(session.liveEstimate.cashReceived, currency)} tone="text-emerald-700" />
                            <KpiCard label="Salidas en efectivo" value={formatMoney(session.liveEstimate.cashOutflow, currency)} tone="text-red-600" />
                            <KpiCard label="Efectivo esperado en caja" value={formatMoney(session.liveEstimate.expectedCash, currency)} emphasize />
                          </div>

                          {METHOD_ORDER.filter(m => m !== 'cash' && session.liveEstimate.receivedByMethod[m] > 0).length > 0 && (
                            <>
                              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                Recibido por otros medios (no aumenta el efectivo físico)
                              </p>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {METHOD_ORDER.filter(m => m !== 'cash' && session.liveEstimate.receivedByMethod[m] > 0).map(m => (
                                  <KpiCard
                                    key={m}
                                    label={PAYMENT_METHOD_LABELS[m] || m}
                                    value={formatMoney(session.liveEstimate.receivedByMethod[m], currency)}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {!session.isLiveEstimate && session.reconciliationUnavailable && (
                        <div className="mt-3">
                          <UnavailableNotice>No pudimos obtener el arqueo de esta caja. Intenta recargar en unos minutos.</UnavailableNotice>
                        </div>
                      )}

                      {!session.isLiveEstimate && !session.reconciliationUnavailable && session.reconciliation && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                                <th className="pb-1.5 pr-3 font-semibold">Medio</th>
                                <th className="pb-1.5 pr-3 font-semibold">Esperado</th>
                                <th className="pb-1.5 pr-3 font-semibold">Conciliado</th>
                                <th className="pb-1.5 font-semibold">Diferencia</th>
                              </tr>
                            </thead>
                            <tbody>
                              {session.reconciliation.map(row => (
                                <tr key={row.id || row.payment_method} className="border-t border-gray-50">
                                  <td className="py-1.5 pr-3 font-medium text-gray-700">{PAYMENT_METHOD_LABELS[row.payment_method] || row.payment_method}</td>
                                  <td className="py-1.5 pr-3 tabular-nums text-gray-500">{formatMoney(row.expected_amount, currency)}</td>
                                  <td className="py-1.5 pr-3 tabular-nums text-gray-500">{formatMoney(row.reconciled_amount, currency)}</td>
                                  <td className={`py-1.5 tabular-nums font-semibold ${Number(row.difference) === 0 ? 'text-gray-400' : Number(row.difference) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {Number(row.difference) > 0 ? '+' : ''}{formatMoney(row.difference, currency)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {!session.isLiveEstimate && !session.reconciliationUnavailable && !session.reconciliation && (
                        <p className="mt-3 text-xs text-gray-400">Sin arqueo registrado para esta caja (cierre anterior al asistente de conciliación).</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* 7. Inventario -------------------------------------------------------- */}
            <Section
              title="Inventario"
              subtitle="Movimientos de stock registrados este día"
              icon="Boxes"
              right={
                <button
                  type="button"
                  onClick={() => navigate('/crm/stock')}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Ver todos los movimientos
                </button>
              }
            >
              {!inventory.available ? (
                <UnavailableNotice>No pudimos obtener la información de inventario de este día. Intenta recargar en unos minutos.</UnavailableNotice>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <KpiCard label="Entradas" value={inventory.movementsSummary.entrada} />
                    <KpiCard label="Salidas" value={inventory.movementsSummary.salida} />
                    <KpiCard label="Ajustes" value={inventory.movementsSummary.ajuste} />
                    <KpiCard
                      label="Bajo stock mínimo"
                      value={inventory.lowStockCount}
                      hint={inventory.isLowStockForToday ? undefined : 'Refleja el stock actual, no el de esta fecha'}
                      tone={inventory.lowStockCount > 0 ? 'text-amber-600' : 'text-gray-900'}
                    />
                  </div>
                  {inventory.notableMovements.length > 0 && (
                    <ul className="mt-4 space-y-1.5">
                      {inventory.notableMovements.map((m, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-gray-700">{m.productName}</span>
                            <span className="ml-2 text-xs text-gray-400">{STOCK_TYPE_LABELS[m.type] || m.type}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-gray-500">{m.quantity} · {fmtTime(m.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Section>

            {/* 8. Alertas ------------------------------------------------------------- */}
            <Section title="Necesita tu atención" icon="Bell">
              {alerts.length === 0 ? (
                <p className="flex items-center gap-2 py-4 text-sm text-gray-400">
                  <Icon name="CheckCircle2" size={16} className="text-emerald-500" />
                  Sin alertas para este día.
                </p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((a, i) => {
                    const tone = ALERT_TONE[a.severity] || ALERT_TONE.info;
                    return (
                      <li key={i} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${tone.bg} ${tone.border} ${tone.color}`}>
                        <Icon name={ALERT_ICON[a.severity] || 'Info'} size={15} color={tone.icon} className="mt-0.5 shrink-0" />
                        <span>{a.message}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            {/* 9. Walinka IA (placeholder — sin integración real) --------------------- */}
            <Section title="Walinka IA · Tu día en pocas palabras" icon="Sparkles">
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 py-8 text-center">
                <Icon name="Sparkles" size={22} color="#9ca3af" />
                <p className="text-sm font-semibold text-gray-500">Próximamente</p>
                <p className="max-w-sm text-xs text-gray-400">
                  Un resumen en lenguaje simple de cómo te fue hoy, generado por IA. Todavía no está conectado — esta es solo una vista previa del espacio.
                </p>
              </div>
            </Section>
          </div>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
