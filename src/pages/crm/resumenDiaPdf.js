/**
 * resumenDiaPdf.js — RESUMEN-DEL-DIA-2.
 *
 * Capa de presentación PURA para Impresión/PDF del Resumen del día. NO hace
 * ninguna llamada a getDailySummary ni a supabase, y NO hace aritmética más
 * allá de formateo trivial (formatMoney) -- todo número/label/flag que emite
 * se lee directamente de un único `summary` (el mismo objeto en memoria que
 * ya usa CrmResumenDia.jsx), nunca se recalcula. Esto es lo que garantiza que
 * pantalla, impresión y PDF muestren siempre los mismos números.
 *
 * Mismo vocabulario/orden de labels que CrmResumenDia.jsx (CATEGORY_LABELS,
 * STOCK_TYPE_LABELS, METHOD_ORDER) -- duplicado acá deliberadamente porque
 * son mapas pequeños y este archivo no debe depender de un componente de
 * página (con hooks, react-router, etc.) para funcionar en Node/vitest.
 */
import { formatMoney } from 'utils/formatMoney';
import { PAYMENT_METHOD_LABELS } from 'services/crmService';

// Mismo vocabulario de categorías que CrmResumenDia.jsx / CrmCostos.jsx /
// crm_cost_items_category_check -- no se inventan categorías nuevas acá.
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

// Mismo orden que CrmResumenDia.jsx (METHOD_ORDER) y que
// DAILY_SUMMARY_METHOD_ORDER en crmService.js -- 'credit' (cuenta corriente)
// nunca aparece acá a propósito: getCashDayPayments ya lo excluye del dato
// de origen, así que no hay ningún camino para que se filtre como "recibido".
const METHOD_ORDER = ['cash', 'card', 'debit_card', 'credit_card', 'bank_transfer', 'mercado_pago', 'check', 'other'];

const NO_DATA_MESSAGES = {
  sales: 'No pudimos obtener las ventas de este día.',
  collections: 'No pudimos obtener el dinero recibido de este día.',
  expenses: 'No pudimos obtener los gastos de este día.',
  cash: 'No pudimos obtener el estado de caja de este día.',
  inventory: 'No pudimos obtener la información de inventario de este día.',
  profitability: 'No pudimos calcular el saldo del día porque faltan datos de ventas o de gastos.',
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

function fmtDateLong(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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

// ─── Sección: Ventas ────────────────────────────────────────────────────────
function buildSalesViewModel(sales, currency) {
  const available = !!sales?.available;
  if (!available) {
    return { available: false, message: NO_DATA_MESSAGES.sales };
  }
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
  };
}

// ─── Sección: Dinero recibido ───────────────────────────────────────────────
function buildCollectionsViewModel(collections, currency) {
  const available = !!collections?.available;
  const base = {
    available,
    message: available ? null : NO_DATA_MESSAGES.collections,
    total: money(collections?.total, available, currency),
    byMethod: available
      ? METHOD_ORDER
          .filter(m => Number(collections.byMethod[m]) > 0)
          .map(m => ({ method: m, label: methodLabel(m), ...money(collections.byMethod[m], true, currency) }))
      : [],
    pendingTodayAvailable: !!collections?.pendingTodayAvailable,
    pendingToday: money(collections?.pendingToday, !!collections?.pendingTodayAvailable, currency),
  };
  return base;
}

// ─── Sección: Gastos y egresos ──────────────────────────────────────────────
function buildExpensesViewModel(expenses, currency) {
  const available = !!expenses?.available;
  if (!available) {
    return { available: false, message: NO_DATA_MESSAGES.expenses };
  }
  const byCategory = Object.entries(expenses.byCategory || {})
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ key, label: CATEGORY_LABELS[key] || key, ...money(value, true, currency) }));
  return {
    available: true,
    total: money(expenses.total, true, currency),
    cashOutflowsNonExpense: money(expenses.cashOutflowsNonExpense, true, currency),
    byCategory,
  };
}

// ─── Sección: Saldo antes de costo de mercadería ────────────────────────────
function buildProfitabilityViewModel(profitability, currency) {
  const available = !!profitability?.available;
  if (!available) {
    return { available: false, message: NO_DATA_MESSAGES.profitability };
  }
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
  if (!available) {
    return { available: false, message: NO_DATA_MESSAGES.cash, sessions: [] };
  }
  const sessions = (cash.sessions || []).map(session => {
    const base = {
      id: session.id,
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
      if (session.liveEstimateUnavailable || !session.liveEstimate) {
        return { ...base, message: NO_DATA_MESSAGES.generic };
      }
      const le = session.liveEstimate;
      return {
        ...base,
        liveEstimate: {
          initialAmount: money(session.initial_amount, true, currency),
          cashReceived: money(le.cashReceived, true, currency),
          cashManualIn: money(le.cashManualIn, true, currency),
          cashOutflow: money(le.cashOutflow, true, currency),
          expectedCash: money(le.expectedCash, true, currency),
          receivedByMethod: METHOD_ORDER
            .filter(m => m !== 'cash' && Number(le.receivedByMethod[m]) > 0)
            .map(m => ({ method: m, label: methodLabel(m), ...money(le.receivedByMethod[m], true, currency) })),
        },
      };
    }

    // Sesión cerrada.
    if (session.reconciliationUnavailable) {
      return { ...base, message: NO_DATA_MESSAGES.generic };
    }
    if (session.reconciliation) {
      return {
        ...base,
        reconciliation: session.reconciliation.map(row => ({
          id: row.id,
          method: row.payment_method,
          label: methodLabel(row.payment_method),
          expected: money(row.expected_amount, true, currency),
          reconciled: money(row.reconciled_amount, true, currency),
          difference: money(row.difference, true, currency),
          differenceSign: Number(row.difference) > 0 ? 1 : Number(row.difference) < 0 ? -1 : 0,
        })),
      };
    }
    return { ...base, noReconciliation: true };
  });

  return { available: true, sessions };
}

// ─── Sección: Inventario ─────────────────────────────────────────────────────
function buildInventoryViewModel(inventory) {
  const available = !!inventory?.available;
  if (!available) {
    return { available: false, message: NO_DATA_MESSAGES.inventory };
  }
  return {
    available: true,
    movementsSummary: { ...inventory.movementsSummary },
    notableMovements: (inventory.notableMovements || []).map(m => ({
      productName: m.productName || 'Producto',
      typeLabel: STOCK_TYPE_LABELS[m.type] || m.type,
      quantity: m.quantity,
      createdAtLabel: fmtTime(m.created_at),
    })),
    lowStockCount: inventory.lowStockCount,
    isLowStockForToday: inventory.isLowStockForToday,
  };
}

// ─── Sección: Alertas ────────────────────────────────────────────────────────
function buildAlertsViewModel(alerts) {
  return (alerts || []).map(a => ({ severity: a.severity, type: a.type, message: a.message }));
}

/**
 * Construye el view-model de presentación (impresión/PDF) a partir de un
 * `summary` YA obtenido con getDailySummary(businessId, date). Nunca vuelve a
 * consultar datos ni recalcula totales -- solo formatea/etiqueta lo que ya
 * viene en `summary`.
 *
 * @param {object} summary - retorno de getDailySummary.
 * @param {{businessName?: string, currency?: string, logoUrl?: string}} businessInfo
 * @param {string} date - YYYY-MM-DD (mismo valor pasado a getDailySummary).
 */
export function buildResumenDiaPdfViewModel(summary, businessInfo = {}, date) {
  const s = summary || {};
  const currency = businessInfo?.currency || 'CLP';
  const metadata = s.metadata || {};
  const reportDate = date || s.date;

  return {
    meta: {
      businessName: businessInfo?.businessName || null,
      logoUrl: businessInfo?.logoUrl || null,
      currency,
      date: reportDate,
      dateLabel: fmtDateLong(reportDate),
      generatedAt: metadata.generated_at || null,
      generatedAtLabel: metadata.generated_at ? fmtDateTime(metadata.generated_at) : null,
      isToday: metadata.is_today ?? null,
      historicalLimitations: metadata.historical_limitations || [],
    },
    sales: buildSalesViewModel(s.sales, currency),
    collections: buildCollectionsViewModel(s.collections, currency),
    expenses: buildExpensesViewModel(s.expenses, currency),
    profitability: buildProfitabilityViewModel(s.profitability, currency),
    cash: buildCashViewModel(s.cash, currency),
    inventory: buildInventoryViewModel(s.inventory),
    alerts: buildAlertsViewModel(s.alerts),
  };
}

// ─── Filename ────────────────────────────────────────────────────────────────

// Equivalente local a slugifyProductName (waBusinessService.js) pero para el
// nombre del negocio, con fallback 'walinka' en vez de 'producto'. No se
// importa esa función directamente porque es específica de productos.
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
 * Genera el nombre de archivo del PDF: <slug-del-negocio>-resumen-YYYY-MM-DD.pdf
 * (fallback 'walinka-resumen-YYYY-MM-DD.pdf' si el nombre está vacío/nulo o
 * sanitiza a nada).
 */
export function buildResumenDiaPdfFilename(businessName, date) {
  const slug = slugifyBusinessName(businessName);
  const dateStr = String(date || '').slice(0, 10) || 'sin-fecha';
  return `${slug}-resumen-${dateStr}.pdf`;
}
