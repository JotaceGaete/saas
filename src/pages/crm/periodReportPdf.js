/**
 * periodReportPdf.js — REPORTES-PERIODO-1.
 *
 * Capa de presentación PURA para el Informe por período (pantalla, impresión
 * y PDF). Mismo patrón que resumenDiaPdf.js: NO llama a getPeriodSummary ni
 * a supabase, y NO hace aritmética más allá de formateo trivial (formatMoney)
 * y computePeriodComparison (que a su vez es puro y determinista, ya
 * probado por separado en crmService.periodComparison.test.js). Todo
 * número/label/flag que emite se lee de `periodSummary`/`comparisonSummary`
 * (el mismo objeto en memoria que ya calculó getPeriodSummary) -- nunca se
 * recalcula un total financiero acá.
 *
 *   getPeriodSummary → periodSummary ─┐
 *   getPeriodSummary (período ant.) → comparisonSummary ─┤
 *                                                          ├─▶ buildPeriodReportViewModel ─▶ { Screen, PrintView, PDFDocument }
 *                                                         ─┘
 */
import { formatMoney } from 'utils/formatMoney';
import { PAYMENT_METHOD_LABELS, computePeriodComparison } from 'services/crmService';

// Mismo vocabulario que CrmResumenDia.jsx / crm_cost_items_category_check --
// no se inventan categorías nuevas.
export const CATEGORY_LABELS = {
  rent: 'Arriendo',
  salaries: 'Sueldos',
  utilities: 'Servicios básicos',
  services: 'Servicios / Software',
  taxes: 'Impuestos / Contabilidad',
  supplies: 'Insumos',
  other: 'Otros gastos',
};

export const STOCK_TYPE_LABELS = { entrada: 'Entradas', salida: 'Salidas', ajuste: 'Ajustes' };

// Mismo orden que DAILY_SUMMARY_METHOD_ORDER en crmService.js -- 'credit'
// (cuenta corriente) nunca aparece: getPeriodSummary ya lo excluye del dato
// de origen (misma consulta con .neq('payment_method','credit') que usa
// getDailySummary).
const METHOD_ORDER = ['cash', 'card', 'debit_card', 'credit_card', 'bank_transfer', 'mercado_pago', 'check', 'other'];

const NO_DATA_MESSAGES = {
  sales: 'No pudimos obtener las ventas de este período.',
  collections: 'No pudimos obtener el dinero recibido de este período.',
  expenses: 'No pudimos obtener los gastos de este período.',
  cash: 'No pudimos obtener el estado de caja de este período.',
  inventory: 'No pudimos obtener la información de inventario de este período.',
  profitability: 'No pudimos calcular el saldo del período porque faltan datos de ventas o de gastos.',
  generic: 'No se pudo obtener esta información.',
};

function money(value, available, currency) {
  if (!available || value == null) return { value: null, formatted: null };
  return { value, formatted: formatMoney(value, currency) };
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function fmtDateShort(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

function fmtDateLong(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function methodLabel(method) {
  return PAYMENT_METHOD_LABELS[method] || method;
}

/** "1–30 septiembre 2026" (mismo mes) o "16 sep 2026 – 3 oct 2026" (cruza mes/año). */
export function formatDateRangeLabel(fromDate, toDate) {
  const from = parseLocalDate(fromDate);
  const to = parseLocalDate(toDate);
  if (!from || !to) return '';
  const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
  if (sameMonth) {
    const monthYear = to.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    return `${from.getDate()}–${to.getDate()} ${monthYear}`;
  }
  return `${fmtDateShort(fromDate)} ${from.getFullYear()} – ${fmtDateShort(toDate)} ${to.getFullYear()}`;
}

function buildComparisonEntry(currentValue, currentAvailable, previousValue, previousAvailable, currency) {
  const previous = previousAvailable ? previousValue : null;
  const current = currentAvailable ? currentValue : null;
  const comparison = computePeriodComparison(current, previous);
  return {
    ...comparison,
    currentFormatted: currentAvailable ? formatMoney(currentValue, currency) : null,
    previousFormatted: previousAvailable ? formatMoney(previousValue, currency) : null,
  };
}

// ─── Sección: KPIs + comparación ───────────────────────────────────────────
function buildKpisViewModel(summary, comparisonSummary, currency) {
  const sales = summary?.sales;
  const collections = summary?.collections;
  const expenses = summary?.expenses;
  const profitability = summary?.profitability;
  const cSales = comparisonSummary?.sales;
  const cCollections = comparisonSummary?.collections;
  const cExpenses = comparisonSummary?.expenses;
  const cProfitability = comparisonSummary?.profitability;

  return {
    netSales: {
      ...money(sales?.net, sales?.available, currency),
      comparison: comparisonSummary ? buildComparisonEntry(sales?.net, sales?.available, cSales?.net, cSales?.available, currency) : null,
    },
    collected: {
      ...money(collections?.total, collections?.available, currency),
      comparison: comparisonSummary ? buildComparisonEntry(collections?.total, collections?.available, cCollections?.total, cCollections?.available, currency) : null,
    },
    expenses: {
      ...money(expenses?.total, expenses?.available, currency),
      comparison: comparisonSummary ? buildComparisonEntry(expenses?.total, expenses?.available, cExpenses?.total, cExpenses?.available, currency) : null,
    },
    profitability: {
      ...money(profitability?.estimatedResult, profitability?.available, currency),
      comparison: comparisonSummary ? buildComparisonEntry(profitability?.estimatedResult, profitability?.available, cProfitability?.estimatedResult, cProfitability?.available, currency) : null,
    },
    salesCount: sales?.available ? sales.count : null,
    avgTicket: money(sales?.avgTicket, sales?.available, currency),
    unitsSold: sales?.available ? sales.unitsSold : null,
    pendingGenerated: money(sales?.pendingGenerated, !!sales?.pendingGeneratedAvailable, currency),
    pendingGeneratedAvailable: !!sales?.pendingGeneratedAvailable,
  };
}

// ─── Sección: Ventas ────────────────────────────────────────────────────────
function buildSalesViewModel(sales, currency) {
  const available = !!sales?.available;
  if (!available) return { available: false, message: NO_DATA_MESSAGES.sales };
  return {
    available: true,
    gross: money(sales.gross, true, currency),
    discount: money(sales.discount, true, currency),
    net: money(sales.net, true, currency),
    count: sales.count,
    avgTicket: money(sales.avgTicket, true, currency),
    unitsSold: sales.unitsSold,
    voidedCount: sales.voidedCount,
    byChannel: [
      { key: 'pos', label: 'TPV (caja física)', ...money(sales.byChannel.pos, true, currency) },
      { key: 'crmManual', label: 'Notas de venta manuales', ...money(sales.byChannel.crmManual, true, currency) },
      { key: 'online', label: 'Tienda online', ...money(sales.byChannel.online, true, currency) },
    ],
    topProducts: (sales.topProducts || []).map(p => ({
      productId: p.productId || null,
      name: p.name || 'Producto',
      quantity: p.quantity,
      ...money(p.subtotal, true, currency),
    })),
    dailySeries: (sales.dailySeries || []).map(d => ({ date: d.date, dateLabel: fmtDateShort(d.date), net: d.net })),
    activityDays: sales.activityDays ? {
      daysWithSales: sales.activityDays.daysWithSales,
      daysWithoutSales: sales.activityDays.daysWithoutSales,
      maxDay: sales.activityDays.maxDay ? { date: sales.activityDays.maxDay.date, dateLabel: fmtDateLong(sales.activityDays.maxDay.date), ...money(sales.activityDays.maxDay.net, true, currency) } : null,
      minDay: sales.activityDays.minDay ? { date: sales.activityDays.minDay.date, dateLabel: fmtDateLong(sales.activityDays.minDay.date), ...money(sales.activityDays.minDay.net, true, currency) } : null,
    } : null,
  };
}

// ─── Sección: Dinero recibido ───────────────────────────────────────────────
function buildCollectionsViewModel(collections, sales, currency) {
  const available = !!collections?.available;
  const vvc = collections?.vendidoVsCobrado;
  return {
    available,
    message: available ? null : NO_DATA_MESSAGES.collections,
    total: money(collections?.total, available, currency),
    byMethod: available
      ? METHOD_ORDER.filter(m => Number(collections.byMethod[m]) > 0).map(m => ({ method: m, label: methodLabel(m), ...money(collections.byMethod[m], true, currency) }))
      : [],
    vendidoVsCobrado: vvc ? {
      available: vvc.available,
      sold: money(vvc.sold, sales?.available, currency),
      collected: money(vvc.collected, available, currency),
      collectedForPeriodSales: vvc.available ? money(vvc.collectedForPeriodSales, true, currency) : null,
      collectedForPriorDebt: vvc.available ? money(vvc.collectedForPriorDebt, true, currency) : null,
      collectedUnlinked: vvc.available ? money(vvc.collectedUnlinked, true, currency) : null,
    } : null,
  };
}

// ─── Sección: Gastos ──────────────────────────────────────────────────────
function buildExpensesViewModel(expenses, currency) {
  const available = !!expenses?.available;
  if (!available) return { available: false, message: NO_DATA_MESSAGES.expenses };
  const total = Number(expenses.total) || 0;
  const byCategory = Object.entries(expenses.byCategory || {})
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ key, label: CATEGORY_LABELS[key] || key, pct: total > 0 ? round1((value / total) * 100) : 0, ...money(value, true, currency) }))
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  return {
    available: true,
    total: money(expenses.total, true, currency),
    cashOutflowsNonExpense: money(expenses.cashOutflowsNonExpense, true, currency),
    byCategory,
  };
}

function round1(n) { return Math.round(Number(n || 0) * 10) / 10; }

// ─── Sección: Saldo antes de costo de mercadería ────────────────────────────
function buildProfitabilityViewModel(profitability, currency) {
  const available = !!profitability?.available;
  if (!available) return { available: false, message: NO_DATA_MESSAGES.profitability };
  return {
    available: true,
    ...money(profitability.estimatedResult, true, currency),
    positive: profitability.estimatedResult > 0,
    negative: profitability.estimatedResult < 0,
    disclaimer: profitability.disclaimer,
  };
}

// ─── Sección: Caja y conciliación ───────────────────────────────────────────
function buildCashViewModel(cash, currency) {
  const available = !!cash?.available;
  if (!available) return { available: false, message: NO_DATA_MESSAGES.cash, sessions: [] };
  const sessions = (cash.sessions || []).map(session => {
    const base = {
      id: session.id,
      dateLabel: fmtDateShort(session.date),
      status: session.status,
      openedAtLabel: fmtTime(session.opened_at),
      closedAtLabel: session.closed_at ? fmtTime(session.closed_at) : null,
      isLiveEstimate: !!session.isLiveEstimate,
      liveEstimateUnavailable: !!session.liveEstimateUnavailable,
      reconciliationUnavailable: !!session.reconciliationUnavailable,
      reconciliation: null,
      liveEstimate: null,
    };
    if (session.isLiveEstimate) {
      if (session.liveEstimateUnavailable || !session.liveEstimate) return { ...base, message: NO_DATA_MESSAGES.generic };
      const le = session.liveEstimate;
      return {
        ...base,
        liveEstimate: {
          expectedCash: money(le.expectedCash, true, currency),
          receivedByMethod: METHOD_ORDER.filter(m => m !== 'cash' && Number(le.receivedByMethod[m]) > 0).map(m => ({ method: m, label: methodLabel(m), ...money(le.receivedByMethod[m], true, currency) })),
        },
      };
    }
    if (session.reconciliationUnavailable) return { ...base, message: NO_DATA_MESSAGES.generic };
    if (session.reconciliation) {
      const totalExpected = session.reconciliation.reduce((s, r) => s + Number(r.expected_amount || 0), 0);
      const totalReconciled = session.reconciliation.reduce((s, r) => s + Number(r.reconciled_amount || 0), 0);
      const totalDiff = session.reconciliation.reduce((s, r) => s + Number(r.difference || 0), 0);
      return {
        ...base,
        expected: money(totalExpected, true, currency),
        reconciled: money(totalReconciled, true, currency),
        difference: money(totalDiff, true, currency),
        differenceSign: Math.abs(totalDiff) < 0.01 ? 0 : totalDiff > 0 ? 1 : -1,
      };
    }
    return { ...base, noReconciliation: true };
  });
  return { available: true, sessions };
}

// ─── Sección: Inventario ─────────────────────────────────────────────────────
function buildInventoryViewModel(inventory) {
  const available = !!inventory?.available;
  if (!available) return { available: false, message: NO_DATA_MESSAGES.inventory };
  return {
    available: true,
    movementsSummary: { ...inventory.movementsSummary },
    topOutflowProducts: (inventory.topOutflowProducts || []).map(p => ({ name: p.name || 'Producto', quantity: p.quantity })),
    lowStockCount: inventory.lowStockCount,
    isLowStockForToday: inventory.isLowStockForToday,
  };
}

// ─── Sección: Alertas ────────────────────────────────────────────────────────
function buildAlertsViewModel(alerts) {
  return (alerts || []).map(a => ({ severity: a.severity, type: a.type, message: a.message }));
}

/**
 * Construye el view-model de presentación (pantalla/impresión/PDF) a partir
 * de un `periodSummary` YA obtenido con getPeriodSummary(businessId, from, to)
 * y, opcionalmente, el `comparisonSummary` del período anterior comparable
 * (también obtenido con getPeriodSummary). Nunca vuelve a consultar datos ni
 * recalcula totales financieros -- solo formatea/etiqueta y aplica
 * computePeriodComparison (puro).
 */
export function buildPeriodReportViewModel(periodSummary, comparisonSummary, businessInfo = {}, fromDate, toDate) {
  const s = periodSummary || {};
  const currency = businessInfo?.currency || 'CLP';
  const metadata = s.metadata || {};
  const from = fromDate || s.from;
  const to = toDate || s.to;

  return {
    meta: {
      businessName: businessInfo?.businessName || null,
      logoUrl: businessInfo?.logoUrl || null,
      currency,
      from, to,
      rangeLabel: formatDateRangeLabel(from, to),
      comparisonRangeLabel: comparisonSummary ? formatDateRangeLabel(comparisonSummary.from, comparisonSummary.to) : null,
      generatedAt: metadata.generated_at || null,
      generatedAtLabel: metadata.generated_at ? fmtDateTime(metadata.generated_at) : null,
      historicalLimitations: metadata.historical_limitations || [],
      invalidRange: !!metadata.invalid_range,
    },
    kpis: buildKpisViewModel(s, comparisonSummary, currency),
    sales: buildSalesViewModel(s.sales, currency),
    collections: buildCollectionsViewModel(s.collections, s.sales, currency),
    expenses: buildExpensesViewModel(s.expenses, currency),
    profitability: buildProfitabilityViewModel(s.profitability, currency),
    cash: buildCashViewModel(s.cash, currency),
    inventory: buildInventoryViewModel(s.inventory),
    alerts: buildAlertsViewModel(s.alerts),
  };
}

// ─── Filename ────────────────────────────────────────────────────────────────
function slugifyBusinessName(name) {
  const slug = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'walinka';
}

/**
 * Genera el nombre del archivo PDF: <slug-del-negocio>-informe-YYYY-MM-DD-a-YYYY-MM-DD.pdf
 * (fallback 'walinka-informe-...' si el nombre del negocio está vacío/nulo).
 */
export function buildPeriodReportFilename(businessName, fromDate, toDate) {
  const slug = slugifyBusinessName(businessName);
  const from = String(fromDate || '').slice(0, 10) || 'sin-fecha';
  const to = String(toDate || '').slice(0, 10) || 'sin-fecha';
  return `${slug}-informe-${from}-a-${to}.pdf`;
}
