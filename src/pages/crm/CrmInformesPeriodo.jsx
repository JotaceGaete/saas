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
import { getPeriodSummary, getLocalDateString, computeComparisonPeriod } from 'services/crmService';
import { PERIOD_PRESETS, getPresetRange } from './periodReportPresets';
import { buildPeriodReportViewModel, buildPeriodReportFilename } from './periodReportPdf';
// getResumenDiaHeaderActionSlots NO es específico de Resumen del día pese al
// nombre -- (isMobileHeader, actions) => {children, mobileActions} es
// genérico (PanelHeader monta children+mobileActions SIEMPRE, alterna cuál
// se ve por CSS; con un <PDFDownloadLink> dentro hay que montar solo UNO).
// Se reutiliza tal cual en vez de duplicar la misma función acá.
import { getResumenDiaHeaderActionSlots } from './resumenDiaPdf';
import CrmPeriodReportPdfDocument from './CrmPeriodReportPdfDocument';
import CrmPeriodReportPrintView from './CrmPeriodReportPrintView';

// REPORTES-PERIODO-1 — mismo mecanismo de impresión que RESUMEN-DEL-DIA-2
// (ver CrmResumenDia.jsx para el post-mortem completo del bug de páginas
// fantasma). Nombres de clase propios (informe-periodo-*) para no compartir
// estado con CrmResumenDia.jsx si ambas páginas llegaran a montarse en el
// mismo árbol alguna vez (no ocurre hoy, pero evita acoplarlas).
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
    height: auto !important;
    min-height: 0 !important;
  }

  body * {
    visibility: hidden !important;
  }

  .informe-periodo-screen-only {
    display: none !important;
  }

  .panel-root,
  .panel-main {
    min-height: 0 !important;
    height: auto !important;
    overflow: visible !important;
  }

  .informe-periodo-print-sheet,
  .informe-periodo-print-sheet * {
    visibility: visible !important;
  }

  .informe-periodo-print-sheet {
    display: block !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
  }

  .informe-periodo-print-sheet .print-avoid-break {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .informe-periodo-print-sheet .print-heading {
    break-after: avoid !important;
    page-break-after: avoid !important;
  }

  .informe-periodo-print-sheet table {
    border-collapse: collapse !important;
  }

  .informe-periodo-print-sheet tr {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .informe-periodo-print-sheet thead {
    display: table-header-group !important;
  }
}
`;

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
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

function KpiCard({ label, value, hint, tone = 'text-gray-900', emphasize = false, unavailable = false, comparison, comparisonLabel }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      {unavailable ? (
        <p className="mt-1.5 flex items-center gap-1 text-sm font-bold text-red-500">
          <Icon name="AlertCircle" size={13} />
          No disponible
        </p>
      ) : (
        <p className={`mt-1.5 tabular-nums font-black leading-tight ${emphasize ? 'text-2xl' : 'text-lg'} ${tone}`}>{value}</p>
      )}
      {hint && !unavailable && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
      {comparison && !unavailable && (
        <ComparisonBadge comparison={comparison} label={comparisonLabel} />
      )}
    </div>
  );
}

// Nunca "subió=bueno / bajó=malo" -- descriptivo únicamente, con la fecha
// del período comparado siempre visible al lado (ticket §4: "Nunca mostrar
// solo +12% sin explicar contra qué período").
function ComparisonBadge({ comparison, label }) {
  if (!comparison || comparison.state === 'unavailable') {
    return <p className="mt-1.5 text-[11px] text-gray-400">Sin datos del período anterior para comparar.</p>;
  }
  if (comparison.state === 'both_zero') {
    return <p className="mt-1.5 text-[11px] text-gray-400">Igual que {label} ($0).</p>;
  }
  if (comparison.state === 'no_base') {
    return <p className="mt-1.5 text-[11px] text-gray-500">Sin base comparable en {label} ($0).</p>;
  }
  const up = comparison.deltaPct > 0;
  const flat = Math.abs(comparison.deltaPct) < 0.05;
  return (
    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-500">
      <Icon name={flat ? 'Minus' : up ? 'ArrowUp' : 'ArrowDown'} size={11} />
      {flat ? '' : `${up ? '+' : ''}${comparison.deltaPct.toFixed(1)}%`} vs {label}
    </p>
  );
}

function EmptyRow({ children }) {
  return <p className="py-6 text-center text-sm text-gray-400">{children}</p>;
}

function UnavailableNotice({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <Icon name="AlertCircle" size={15} className="mt-0.5 shrink-0" />
      <span>{children || 'No pudimos obtener esta información. Intenta recargar en unos minutos.'}</span>
    </div>
  );
}

function PeriodSelector({ presetKey, fromDate, toDate, onPreset, onCustomChange }) {
  const today = getLocalDateString();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PERIOD_PRESETS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPreset(p.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${presetKey === p.key ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {presetKey === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">
            Desde
            <input
              type="date"
              value={fromDate}
              max={toDate || today}
              onChange={e => e.target.value && onCustomChange({ from: e.target.value, to: toDate })}
              className="ml-2 rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-500">
            Hasta
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={today}
              onChange={e => e.target.value && onCustomChange({ from: fromDate, to: e.target.value })}
              className="ml-2 rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function SalesByDayChart({ dailySeries, currency }) {
  if (!dailySeries) return <UnavailableNotice>No pudimos obtener la evolución de ventas de este período.</UnavailableNotice>;
  const data = dailySeries.map(d => ({ label: fmtDateShort(d.date), total: d.net }));
  const max = Math.max(...data.map(d => d.total), 0);
  if (max <= 0) return <EmptyRow>Sin ventas registradas en este período.</EmptyRow>;
  // Para rangos largos, recharts ya deja de mostrar todas las etiquetas del
  // eje X (interval="preserveStartEnd" + auto) -- se prioriza granularidad
  // diaria completa (ticket §5) antes que agregación semanal/mensual, que
  // queda fuera de alcance de REPORTES-PERIODO-1 salvo que se demuestre un
  // problema real de rendimiento.
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: 'rgba(17,24,39,0.04)' }}
            formatter={(value) => [formatMoney(value, currency), 'Ventas netas']}
            contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="total" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.total === max ? '#059669' : 'rgba(5,150,105,0.25)'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HorizontalBarChart({ entries, currency, positiveColor, label }) {
  if (!entries.length) return <EmptyRow>{label}</EmptyRow>;
  const max = Math.max(...entries.map(d => d.value), 0);
  return (
    <div style={{ height: Math.max(120, entries.length * 34) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={entries} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} width={130} />
          <Tooltip cursor={{ fill: 'rgba(17,24,39,0.04)' }} formatter={(value) => [formatMoney(value, currency), '']} contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e5e7eb' }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
            {entries.map((d, i) => <Cell key={i} fill={d.value === max ? positiveColor : `${positiveColor}40`} />)}
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

export default function CrmInformesPeriodo() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const today = getLocalDateString();

  const [presetKey, setPresetKey] = useState('thisMonth');
  const [range, setRange] = useState(() => getPresetRange('thisMonth', today) || { from: today, to: today });
  const [summary, setSummary] = useState(null);
  const [comparisonSummary, setComparisonSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [isMobileHeader, setIsMobileHeader] = useState(() => (typeof window === 'undefined' ? false : window.innerWidth < 1024));
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    const handler = (e) => setIsMobileHeader(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const currency = business?.currency || 'CLP';

  const handlePreset = useCallback((key) => {
    setPresetKey(key);
    if (key === 'custom') return; // conserva el rango actual hasta que el usuario elija fechas
    const r = getPresetRange(key, today);
    if (r) setRange(r);
  }, [today]);

  const handleCustomChange = useCallback((r) => setRange(r), []);

  const load = useCallback(async () => {
    if (!business?.id || !range?.from || !range?.to) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const comparison = computeComparisonPeriod(range.from, range.to);
      const [current, previous] = await Promise.all([
        getPeriodSummary(business.id, range.from, range.to),
        comparison ? getPeriodSummary(business.id, comparison.from, comparison.to) : Promise.resolve(null),
      ]);
      setSummary(current);
      setComparisonSummary(previous);
    } catch (err) {
      setErrorMsg(err?.message || 'No se pudo cargar el informe del período.');
      setSummary(null);
      setComparisonSummary(null);
    }
    setLoading(false);
  }, [business?.id, range?.from, range?.to]);

  useEffect(() => { load(); }, [load]);

  const businessInfo = useMemo(() => ({ businessName: business?.name, currency, logoUrl: business?.logoUrl || business?.logo_url || null }), [business, currency]);
  const vm = useMemo(() => (summary ? buildPeriodReportViewModel(summary, comparisonSummary, businessInfo, range.from, range.to) : null), [summary, comparisonSummary, businessInfo, range.from, range.to]);

  const canExport = !loading && !!summary;
  const pdfFilename = buildPeriodReportFilename(business?.name, range.from, range.to);

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

  const downloadButton = canExport ? (
    <PDFDownloadLink
      document={<CrmPeriodReportPdfDocument periodSummary={summary} comparisonSummary={comparisonSummary} business={business} fromDate={range.from} toDate={range.to} />}
      fileName={pdfFilename}
      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 lg:flex-none lg:px-4"
    >
      {({ loading: pdfLoading }) => pdfLoading
        ? <><Icon name="Loader2" size={14} className="animate-spin" />Preparando…</>
        : <><Icon name="Download" size={14} />Descargar PDF</>
      }
    </PDFDownloadLink>
  ) : (
    <button type="button" disabled className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white opacity-40 lg:flex-none lg:px-4">
      <Icon name="Download" size={14} />
      Descargar PDF
    </button>
  );

  const reportActions = (<>{printButton}{downloadButton}</>);
  const headerActionSlots = getResumenDiaHeaderActionSlots(isMobileHeader, reportActions);

  const sales = vm?.sales;
  const collections = vm?.collections;
  const expenses = vm?.expenses;
  const cash = vm?.cash;
  const inventory = vm?.inventory;
  const profitability = vm?.profitability;
  const kpis = vm?.kpis;
  const alerts = vm?.alerts || [];

  const resultTone = useMemo(() => {
    const r = profitability?.value ?? 0;
    if (r > 0) return 'text-emerald-700';
    if (r < 0) return 'text-red-600';
    return 'text-gray-500';
  }, [profitability]);

  const expensesEntries = useMemo(() => (expenses?.available ? expenses.byCategory.map(c => ({ label: c.label, value: c.value || 0 })) : []), [expenses]);
  const methodEntries = useMemo(() => (collections?.available ? collections.byMethod.map(m => ({ label: m.label, value: m.value || 0 })) : []), [collections]);

  return (
    <DashboardAppShell>
      <style>{PRINT_STYLE}</style>
      <PanelHeader
        title={
          <>
            <CrmBreadcrumb section="Informes" />
            <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
              Informe del negocio
            </h1>
          </>
        }
        subtitle={vm ? <p className="text-xs capitalize" style={{ color: 'var(--color-muted-foreground)' }}>{vm.meta.rangeLabel}</p> : null}
        mobileActions={headerActionSlots.mobileActions}
      >
        {headerActionSlots.children}
      </PanelHeader>

      <DashboardLayoutContent innerClassName="lg:max-w-6xl">
        <div className="flex flex-col gap-2">
          <PeriodSelector presetKey={presetKey} fromDate={range.from} toDate={range.to} onPreset={handlePreset} onCustomChange={handleCustomChange} />
          {vm?.meta?.comparisonRangeLabel && (
            <p className="text-xs text-gray-400">Comparado con: <span className="font-semibold text-gray-600">{vm.meta.comparisonRangeLabel}</span></p>
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
        ) : !summary || !vm ? (
          <EmptyRow>No se pudo cargar el informe.</EmptyRow>
        ) : vm.meta.invalidRange ? (
          <UnavailableNotice>{alerts[0]?.message || 'Rango de fechas inválido.'}</UnavailableNotice>
        ) : (
          <>
          <div className="informe-periodo-screen-only flex flex-col gap-5 md:gap-6">
            {/* KPIs principales -------------------------------------------------- */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="Ventas netas" value={sales.available ? formatMoney(sales.net.value, currency) : undefined} unavailable={!sales.available} tone="text-blue-700" emphasize comparison={kpis.netSales.comparison} comparisonLabel={vm.meta.comparisonRangeLabel} />
              <KpiCard label="Dinero recibido" value={collections.available ? formatMoney(collections.total.value, currency) : undefined} unavailable={!collections.available} tone="text-emerald-700" emphasize comparison={kpis.collected.comparison} comparisonLabel={vm.meta.comparisonRangeLabel} />
              <KpiCard label="Gastos registrados" value={expenses.available ? formatMoney(expenses.total.value, currency) : undefined} unavailable={!expenses.available} tone="text-red-600" comparison={kpis.expenses.comparison} comparisonLabel={vm.meta.comparisonRangeLabel} />
              <KpiCard label="Saldo antes de costo de mercadería" value={profitability.available ? `${profitability.positive ? '+' : ''}${profitability.formatted}` : undefined} unavailable={!profitability.available} tone={resultTone} hint="No es la ganancia — no incluye costo de mercadería" comparison={kpis.profitability.comparison} comparisonLabel={vm.meta.comparisonRangeLabel} />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="N° de ventas" value={sales.available ? kpis.salesCount : undefined} unavailable={!sales.available} />
              <KpiCard label="Ticket promedio" value={sales.available ? formatMoney(kpis.avgTicket.value, currency) : undefined} unavailable={!sales.available} />
              <KpiCard label="Unidades vendidas" value={sales.available ? kpis.unitsSold : undefined} unavailable={!sales.available} />
              {kpis.pendingGeneratedAvailable && (
                <KpiCard label="Cuentas por cobrar generadas" value={formatMoney(kpis.pendingGenerated.value, currency)} hint="Ventas del período aún no cobradas" />
              )}
            </div>

            {/* Ventas en el tiempo -------------------------------------------------- */}
            <Section title="Ventas por día" subtitle="Incluye días sin actividad ($0) para no distorsionar la evolución" icon="TrendingUp">
              <SalesByDayChart dailySeries={sales.available ? sales.dailySeries : null} currency={currency} />
              {sales.available && sales.activityDays && (
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div className="rounded-xl border border-gray-100 px-3 py-2">
                    <p className="text-gray-400">Día con más ventas</p>
                    <p className="mt-0.5 font-bold text-gray-800">{sales.activityDays.maxDay ? `${sales.activityDays.maxDay.dateLabel} · ${sales.activityDays.maxDay.formatted}` : '—'}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 px-3 py-2">
                    <p className="text-gray-400">Día con menos ventas</p>
                    <p className="mt-0.5 font-bold text-gray-800">{sales.activityDays.minDay ? `${sales.activityDays.minDay.dateLabel} · ${sales.activityDays.minDay.formatted}` : '—'}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 px-3 py-2">
                    <p className="text-gray-400">Días con ventas</p>
                    <p className="mt-0.5 font-bold text-gray-800">{sales.activityDays.daysWithSales}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 px-3 py-2">
                    <p className="text-gray-400">Días sin ventas</p>
                    <p className="mt-0.5 font-bold text-gray-800">{sales.activityDays.daysWithoutSales}</p>
                  </div>
                </div>
              )}
            </Section>

            {/* Ventas: canales y productos -------------------------------------------- */}
            <Section title="Ventas" subtitle="Notas de venta emitidas en el período (excluye anuladas)" icon="ShoppingBag">
              {!sales.available ? (
                <UnavailableNotice>No pudimos obtener las ventas de este período.</UnavailableNotice>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <KpiCard label="Bruta" value={formatMoney(sales.gross.value, currency)} />
                    <KpiCard label="Descuentos" value={formatMoney(sales.discount.value, currency)} />
                    <KpiCard label="Neta" value={formatMoney(sales.net.value, currency)} tone="text-blue-700" />
                    <KpiCard label="Unidades vendidas" value={sales.unitsSold} />
                  </div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Ventas por canal</p>
                      <ul className="space-y-2 text-sm">
                        {sales.byChannel.map(c => (
                          <li key={c.key} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                            <span className="font-medium text-gray-700">{c.label}</span>
                            <span className="tabular-nums text-gray-500">{c.formatted}</span>
                          </li>
                        ))}
                      </ul>
                      {sales.voidedCount > 0 && <p className="mt-2 text-xs text-gray-400">{sales.voidedCount} venta{sales.voidedCount === 1 ? '' : 's'} anulada{sales.voidedCount === 1 ? '' : 's'} en el período.</p>}
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Productos más vendidos (Top 10)</p>
                      {sales.topProducts.length === 0 ? (
                        <EmptyRow>Sin ventas de productos en este período.</EmptyRow>
                      ) : (
                        <ul className="space-y-2">
                          {sales.topProducts.map((p, i) => (
                            <li key={p.productId || i} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2 text-sm">
                              <span className="min-w-0 truncate font-medium text-gray-700">{p.name}</span>
                              <span className="shrink-0 tabular-nums text-gray-500">{p.quantity} un · {p.formatted}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </Section>

            {/* Dinero recibido -------------------------------------------------------- */}
            <Section title="Dinero recibido" subtitle="Pagos efectivamente recibidos en el período, por medio" icon="Wallet">
              {!collections.available ? (
                <UnavailableNotice>No pudimos obtener el dinero recibido de este período.</UnavailableNotice>
              ) : (
                <>
                  <HorizontalBarChart entries={methodEntries} currency={currency} positiveColor="#059669" label="Sin cobros registrados en este período." />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-3">
                    <span className="text-sm font-semibold text-emerald-800">Total recibido</span>
                    <span className="tabular-nums text-lg font-black text-emerald-700">{collections.total.formatted}</span>
                  </div>
                  {collections.vendidoVsCobrado?.available && (
                    <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl bg-gray-50 p-3 text-xs sm:grid-cols-2">
                      <p className="text-gray-500">Vendido en el período: <strong className="text-gray-800">{collections.vendidoVsCobrado.sold.formatted}</strong></p>
                      <p className="text-gray-500">Cobrado en el período: <strong className="text-gray-800">{collections.vendidoVsCobrado.collected.formatted}</strong></p>
                      <p className="text-gray-500">De ventas del período: <strong className="text-gray-800">{collections.vendidoVsCobrado.collectedForPeriodSales.formatted}</strong></p>
                      <p className="text-gray-500">De deudas anteriores: <strong className="text-gray-800">{collections.vendidoVsCobrado.collectedForPriorDebt.formatted}</strong></p>
                      {collections.vendidoVsCobrado.collectedForFutureInvoices?.value > 0 && (
                        <p className="text-gray-500 sm:col-span-2">De facturas con fecha posterior al período (dato inconsistente): <strong className="text-gray-800">{collections.vendidoVsCobrado.collectedForFutureInvoices.formatted}</strong></p>
                      )}
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* Gastos ------------------------------------------------------------------ */}
            <Section title="Gastos" subtitle="Gastos variables del período y otros egresos de caja que no son gasto" icon="Receipt">
              {!expenses.available ? (
                <UnavailableNotice>No pudimos obtener los gastos de este período.</UnavailableNotice>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <KpiCard label="Gastos registrados" value={expenses.total.formatted} tone="text-red-600" />
                    <KpiCard label="Otros egresos de caja" value={expenses.cashOutflowsNonExpense.formatted} hint="Retiros, traslados — no son gasto" />
                    <KpiCard label="Total egresado" value={formatMoney((expenses.total.value || 0) + (expenses.cashOutflowsNonExpense.value || 0), currency)} />
                  </div>
                  <div className="mt-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Gastos por categoría</p>
                    <HorizontalBarChart entries={expensesEntries} currency={currency} positiveColor="#b91c1c" label="Sin gastos registrados en este período." />
                  </div>
                </>
              )}
            </Section>

            {/* Caja y conciliación ------------------------------------------------------ */}
            <Section title="Caja y conciliación" subtitle="Sesiones de caja del período" icon="Landmark" right={<button type="button" onClick={() => navigate('/crm/caja')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Ir a Caja</button>}>
              {!cash.available ? (
                <UnavailableNotice>No pudimos obtener el estado de caja de este período.</UnavailableNotice>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <KpiCard label="N° de sesiones" value={summary.cash.sessionsCount} />
                    <KpiCard label="Cerradas" value={summary.cash.closedCount} />
                    <KpiCard label="Abiertas" value={summary.cash.openCount} />
                    <KpiCard label="Con diferencia" value={summary.cash.sessionsWithDifference} tone={summary.cash.sessionsWithDifference > 0 ? 'text-amber-600' : 'text-gray-900'} />
                  </div>
                  {summary.cash.totalDifferenceAvailable && (
                    <p className="mb-3 text-xs text-gray-500">Diferencia acumulada (sesiones cerradas con arqueo conocido): <strong className="tabular-nums">{formatMoney(summary.cash.totalDifference, currency)}</strong></p>
                  )}
                  {cash.sessions.length === 0 ? (
                    <EmptyRow>No hubo caja abierta en este período.</EmptyRow>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                            <th className="pb-1.5 pr-3 font-semibold">Fecha</th>
                            <th className="pb-1.5 pr-3 font-semibold">Estado</th>
                            <th className="pb-1.5 pr-3 font-semibold">Esperado</th>
                            <th className="pb-1.5 pr-3 font-semibold">Conciliado</th>
                            <th className="pb-1.5 font-semibold">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cash.sessions.map(s => (
                            <tr key={s.id} className="border-t border-gray-50">
                              <td className="py-1.5 pr-3 text-gray-600">{s.dateLabel}</td>
                              <td className="py-1.5 pr-3">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${s.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {s.status === 'open' ? 'Abierta' : 'Cerrada'}
                                </span>
                              </td>
                              {s.isLiveEstimate ? (
                                <>
                                  <td className="py-1.5 pr-3 tabular-nums text-gray-500" colSpan={2}>{s.liveEstimateUnavailable ? 'No disponible' : `Caja abierta — valores provisionales (${s.liveEstimate?.expectedCash?.formatted || '—'})`}</td>
                                  <td className="py-1.5 tabular-nums text-gray-400">—</td>
                                </>
                              ) : s.noReconciliation ? (
                                <td className="py-1.5 pr-3 text-gray-400" colSpan={3}>Sin arqueo registrado</td>
                              ) : s.message ? (
                                <td className="py-1.5 pr-3 text-red-600" colSpan={3}>{s.message}</td>
                              ) : (
                                <>
                                  <td className="py-1.5 pr-3 tabular-nums text-gray-500">{s.expected?.formatted}</td>
                                  <td className="py-1.5 pr-3 tabular-nums text-gray-500">{s.reconciled?.formatted}</td>
                                  <td className={`py-1.5 tabular-nums font-semibold ${s.differenceSign === 0 ? 'text-gray-400' : s.differenceSign > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{s.differenceSign > 0 ? '+' : ''}{s.difference?.formatted}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* Inventario --------------------------------------------------------------- */}
            <Section title="Inventario" subtitle="Movimientos de stock del período" icon="Boxes" right={<button type="button" onClick={() => navigate('/crm/stock')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Ver movimientos</button>}>
              {!inventory.available ? (
                <UnavailableNotice>No pudimos obtener la información de inventario de este período.</UnavailableNotice>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <KpiCard label="Entradas" value={inventory.movementsSummary.entrada} />
                    <KpiCard label="Salidas" value={inventory.movementsSummary.salida} />
                    <KpiCard label="Ajustes" value={inventory.movementsSummary.ajuste} />
                    <KpiCard label="Bajo stock mínimo (actual)" value={inventory.lowStockCount} hint="Estado ACTUAL, no histórico del período" tone={inventory.lowStockCount > 0 ? 'text-amber-600' : 'text-gray-900'} />
                  </div>
                  {inventory.topOutflowProducts.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Productos con mayor salida</p>
                      <ul className="space-y-1.5">
                        {inventory.topOutflowProducts.map((p, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2 text-sm">
                            <span className="font-medium text-gray-700">{p.name}</span>
                            <span className="tabular-nums text-gray-500">{p.quantity} un</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* Alertas -------------------------------------------------------------------- */}
            <Section title="Alertas del período" icon="Bell">
              {alerts.length === 0 ? (
                <p className="flex items-center gap-2 py-4 text-sm text-gray-400">
                  <Icon name="CheckCircle2" size={16} className="text-emerald-500" />
                  No se detectaron alertas relevantes para este período.
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
          </div>

          {/* Hoja imprimible dedicada -- ver PRINT_STYLE arriba. */}
          <div className="informe-periodo-print-sheet hidden">
            <CrmPeriodReportPrintView periodSummary={summary} comparisonSummary={comparisonSummary} business={business} fromDate={range.from} toDate={range.to} />
          </div>
          </>
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
