import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import CrmBreadcrumb from 'components/ui/CrmBreadcrumb';
import Icon from 'components/AppIcon';
import { useAuth } from 'contexts/AuthContext';
import { canUseFeature } from 'config/planFeatures';
import { getEffectivePlanSlug } from 'services/waBusinessService';
import { formatMoney, fmtMoneyInput, parseMoneyInput } from 'utils/formatMoney';
import {
  PAYMENT_METHOD_LABELS,
  CASH_MOVEMENT_CATEGORIES_OUT,
  CASH_MOVEMENT_CATEGORIES_IN,
  CASH_MOVEMENT_PURPOSES,
  getCashMovementCategoryLabel,
  closeCashSessionReconciled,
  createCashMovement,
  getCostItems,
  getCashDayMovements,
  getCashDayPayments,
  getCashSessionMovements,
  getCashSessionPayments,
  getCashSessionReconciliation,
  getCashRecentSessions,
  getCashSessionById,
  getCashSessionsForDate,
  getCrmInvoice,
  getInvoicePaymentSummary,
  getLocalDateString,
  getOpenCashSession,
  openCashSession,
  reopenCashSession,
  updateCrmPayment,
  updateCashSession,
  voidCashMovement,
  voidCrmPayment,
} from 'services/crmService';
import { printService } from 'lib/printing/printService';
import { buildSaleReceipt } from 'lib/printing/receipts/buildSaleReceipt';
import { buildPrinterConfigKey, readPrinterConfig } from 'lib/printing/printerConfigStorage';

const METHOD_ORDER = ['cash', 'card', 'bank_transfer', 'check', 'other'];

// CAJA-CIERRE-CONCILIACION-1 — vocabulario propio del asistente de cierre
// (los 8 medios que acepta crm_close_cash_session). Deliberadamente
// separado de METHOD_ORDER: ese sigue alimentando "Cobros por método de
// pago" (MethodBreakdown) sin cambios, y ampliarlo ahí reclasificaría una
// UI que no pidió cambios. El wizard necesita distinguir debit_card/
// credit_card/mercado_pago, que METHOD_ORDER no conoce.
const RECONCILE_ALL_METHODS = ['cash', 'debit_card', 'credit_card', 'mercado_pago', 'bank_transfer', 'card', 'check', 'other'];

// Pregunta corta y sin jerga contable por medio de pago -- mismo tono que
// pidió el negocio ("Según Walinka deberías tener: Efectivo $58.000 →
// ¿Cuánto contaste?").
const RECONCILE_QUESTION_LABELS = {
  cash: '¿Cuánto contaste?',
  debit_card: '¿Qué total muestra el terminal?',
  credit_card: '¿Qué total muestra el terminal?',
  mercado_pago: '¿Qué total muestra MP?',
  bank_transfer: '¿Qué total confirmaste?',
  card: 'Monto conciliado',
  check: 'Monto conciliado',
  other: 'Monto conciliado',
};

function fmtDate(date) {
  if (!date) return '';
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function fmtTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toNumber(value) {
  return Number(value || 0);
}

function summarizePayments(payments = []) {
  const summary = Object.fromEntries(METHOD_ORDER.map(method => [method, 0]));
  for (const payment of payments) {
    if (payment.voided_at) continue;
    const method = METHOD_ORDER.includes(payment.payment_method) ? payment.payment_method : 'other';
    summary[method] += toNumber(payment.amount);
  }
  return summary;
}

function totalPayments(payments = []) {
  return payments.reduce((sum, payment) => {
    if (payment.voided_at) return sum;
    return sum + toNumber(payment.amount);
  }, 0);
}

// Saldo real de caja = monto inicial + cobros comerciales + entradas manuales - salidas
function calcSessionBalance(session, payments = [], movements = []) {
  const initial   = toNumber(session?.initial_amount);
  const inflows   = payments.filter(p => !p.voided_at).reduce((s, p) => s + toNumber(p.amount), 0);
  const manualIn  = movements.filter(m => !m.voided_at && m.direction === 'in').reduce((s, m) => s + toNumber(m.amount), 0);
  const outs      = movements.filter(m => !m.voided_at && m.direction === 'out').reduce((s, m) => s + toNumber(m.amount), 0);
  return initial + inflows + manualIn - outs;
}

// Efectivo esperado, SOLO para el wizard de cierre (display previo,
// cliente/no confiable -- el servidor lo recalcula 100% en
// crm_close_cash_session y es la fuente de verdad real). Misma fórmula que
// el bloque 'cash' de la RPC: fondo inicial + cobros cash + entradas
// manuales cash - salidas manuales cash.
function calcExpectedCash(session, payments = [], movements = []) {
  const initial = toNumber(session?.initial_amount);
  const cashIn = payments
    .filter(p => !p.voided_at && p.payment_method === 'cash')
    .reduce((s, p) => s + toNumber(p.amount), 0);
  const manualIn = movements
    .filter(m => !m.voided_at && m.direction === 'in' && m.payment_method === 'cash')
    .reduce((s, m) => s + toNumber(m.amount), 0);
  const manualOut = movements
    .filter(m => !m.voided_at && m.direction === 'out' && m.payment_method === 'cash')
    .reduce((s, m) => s + toNumber(m.amount), 0);
  return initial + cashIn + manualIn - manualOut;
}

// Esperado por método NO-efectivo, SOLO para el wizard de cierre. No
// reutiliza summarizePayments (ese sigue sirviendo a MethodBreakdown, sin
// cambios) porque necesita conocer debit_card/credit_card/mercado_pago.
// 'credit' (cuenta corriente) queda deliberadamente excluido -- no es
// dinero recibido en la sesión.
function calcExpectedByMethod(payments = []) {
  const totals = {};
  for (const payment of payments) {
    if (payment.voided_at) continue;
    const method = payment.payment_method;
    if (!method || method === 'cash' || method === 'credit') continue;
    totals[method] = (totals[method] || 0) + toNumber(payment.amount);
  }
  return totals;
}

function totalMovementsOut(movements = []) {
  return movements.filter(m => !m.voided_at && m.direction === 'out').reduce((s, m) => s + toNumber(m.amount), 0);
}

function totalMovementsIn(movements = []) {
  return movements.filter(m => !m.voided_at && m.direction === 'in').reduce((s, m) => s + toNumber(m.amount), 0);
}

// Mismo criterio ya usado en el hero: no hay tabla de perfiles/miembros del
// negocio para resolver un user id a un nombre real, así que solo se puede
// distinguir "vos" (usuario de la sesión actual) de "otro usuario".
function resolveResponsable(session, user) {
  if (!session) return '—';
  if (session.opened_by === user?.id) return user?.user_metadata?.name || user?.email || '—';
  return 'otro usuario';
}

// Mezcla pagos y movimientos en orden cronológico para la tabla unificada
function mergeEntries(payments = [], movements = []) {
  return [
    ...payments.map(p => ({ ...p, _row_kind: 'payment' })),
    ...movements.map(m => ({ ...m, _row_kind: 'movement' })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function turnLabel(session, sessions) {
  const reverseIndex = sessions.length - sessions.findIndex(item => item.id === session.id);
  const note = session.notes ? ` / ${session.notes}` : '';
  return `Caja #${reverseIndex}${note || ' / Turno'}`;
}

function turnTimeRange(session) {
  return session.closed_at
    ? `${fmtTime(session.opened_at)} - ${fmtTime(session.closed_at)}`
    : fmtTime(session.opened_at);
}

// ─── Rediseño UI — KPIs, tabs y menú de acciones de fila ──────────────────────
// Presentación pura: no cambia datos, cálculos ni handlers existentes.

function KpiCard({ label, value, toneClass = 'text-gray-900', emphasize = false }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1.5 tabular-nums font-black ${emphasize ? 'text-2xl' : 'text-lg'} ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

const CASH_TABS = [
  { key: 'movimientos', label: 'Movimientos', icon: 'FileText' },
  { key: 'resumen', label: 'Resumen del día', icon: 'BarChart3' },
  { key: 'historial', label: 'Historial de cajas', icon: 'History' },
];

function CashTabs({ active, onChange }) {
  return (
    <div className="flex w-full flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm sm:w-auto">
      {CASH_TABS.map(tab => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          aria-pressed={active === tab.key}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
            active === tab.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Icon name={tab.icon} size={14} />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// Menú "(...)" para las acciones secundarias de una fila del historial
// (Editar / Reabrir / Cerrar) -- "Ver detalle" queda como acción principal
// fuera del menú.
//
// CAJA-CIERRE-IDEMPOTENTE-1 -- `reconciled` refleja la regla real (una caja
// con conciliación registrada no se puede reabrir), pero solo cuando ya se
// conoce: reconciliationBySession (el caché que alimenta este prop) recién
// se llena cuando el usuario abrió el detalle de ESA fila al menos una vez
// en esta sesión de la página, no para toda la tabla de una vez -- eso
// evitaría un fetch por fila solo para pintar el menú. La autoridad real
// sigue siendo la base de datos (trigger crm_cash_sessions_block_reopen_reconciled,
// 20260923150000): si `reconciled` es undefined (desconocido), "Reabrir"
// queda clickeable y el backend la rechaza igual si corresponde.
function RowActionsMenu({ session, busy, reconciled, onEdit, onReopen, onClose }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <Icon name="MoreHorizontal" size={16} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onEdit(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            <Icon name="Pencil" size={14} />
            Editar
          </button>
          {session.status === 'open' ? (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => { setOpen(false); onClose(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Icon name="LockKeyhole" size={14} />
              Cerrar caja
            </button>
          ) : reconciled ? (
            <button
              type="button"
              role="menuitem"
              disabled
              title="Esta caja ya tiene conciliación registrada y no se puede reabrir."
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-gray-300"
            >
              <Icon name="RotateCcw" size={14} />
              Reabrir
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onReopen(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-emerald-700 hover:bg-emerald-50"
            >
              <Icon name="RotateCcw" size={14} />
              Reabrir
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MethodBreakdown({ summary, currency }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
      {METHOD_ORDER.map(method => (
        <div key={method} className="rounded-xl border border-gray-100 bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {PAYMENT_METHOD_LABELS[method]}
          </p>
          <p className="mt-1 text-sm font-black text-gray-900">
            {formatMoney(summary[method] || 0, currency)}
          </p>
        </div>
      ))}
    </div>
  );
}

function MovementsTable({
  payments, movements, currency, onEditPayment, onVoidPayment, onVoidMovement, sessionOpen,
  readOnly = false, onViewSale, onReprintReceipt, reprintingId,
}) {
  const entries = mergeEntries(payments, movements);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white px-5 py-10 text-center">
        <Icon name="ReceiptText" size={30} className="mx-auto mb-3 text-gray-200" />
        <p className="text-sm font-semibold text-gray-600">Aun no hay movimientos en esta caja.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-5 py-3">Hora</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Detalle</th>
              <th className="px-5 py-3 text-right">Monto</th>
              <th className="px-5 py-3 text-right">Accion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map(entry => {
              const isVoided = !!entry.voided_at;
              const isPayment = entry._row_kind === 'payment';
              const isOut = !isPayment && entry.direction === 'out';

              const amountColor = isVoided
                ? 'text-gray-400 line-through'
                : isOut
                  ? 'text-red-600'
                  : 'text-emerald-700';

              const amountPrefix = isOut ? '−' : '+';

              return (
                <tr key={entry.id} className={isVoided ? 'bg-gray-50 opacity-60' : ''}>
                  {/* Hora */}
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-gray-700">
                    <div>{fmtTime(entry.created_at)}</div>
                    {isVoided && (
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        <Icon name="Ban" size={10} />
                        Anulado
                      </span>
                    )}
                  </td>

                  {/* Tipo */}
                  <td className="whitespace-nowrap px-5 py-3">
                    {isPayment ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        <Icon name="ArrowDownLeft" size={11} />
                        Cobro
                      </span>
                    ) : isOut ? (
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                          <Icon name="ArrowUpRight" size={11} />
                          Salida
                        </span>
                        <div className="mt-0.5 text-[10px] text-gray-400">
                          {getCashMovementCategoryLabel(entry.category)}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600">
                          <Icon name="ArrowDownLeft" size={11} />
                          Entrada
                        </span>
                        <div className="mt-0.5 text-[10px] text-gray-400">
                          {getCashMovementCategoryLabel(entry.category)}
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Detalle */}
                  <td className="px-5 py-3 text-gray-500">
                    {isPayment ? (
                      <>
                        <div className="text-xs text-gray-500">
                          {PAYMENT_METHOD_LABELS[entry.payment_method] || PAYMENT_METHOD_LABELS.other}
                        </div>
                        <div className="text-gray-700">{entry.reference || entry.notes || '—'}</div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium text-gray-700">{entry.reason}</div>
                        {entry.notes && <div className="text-[11px] text-gray-400">{entry.notes}</div>}
                      </>
                    )}
                    {isVoided && entry.void_reason && (
                      <div className="mt-0.5 text-[11px] text-red-500">Motivo: {entry.void_reason}</div>
                    )}
                  </td>

                  {/* Monto */}
                  <td className={`whitespace-nowrap px-5 py-3 text-right font-bold ${amountColor}`}>
                    {!isVoided && amountPrefix}{formatMoney(entry.amount, entry.currency || currency)}
                  </td>

                  {/* Acción */}
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    {isVoided ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : readOnly ? (
                      /* Caja cerrada = histórica/auditable: nunca se modifica un
                         movimiento pasado desde acá. Un cobro con invoice_id real
                         puede consultarse ("Ver venta") sin importar su origen.
                         "Reimprimir" es más estricto -- solo existe un comprobante
                         original que reimprimir cuando la venta se creó vía TPV
                         (crm_create_pos_sale, invoice.source === 'pos'): es el
                         único flujo que hoy imprime algo (CrmTerminal.jsx). Un
                         abono a cuenta corriente o un pago de pedido de catálogo
                         (invoice.source === 'crm') nunca generó un ticket -- y
                         además una misma invoice 'crm' puede acumular varios
                         abonos independientes, así que reconstruir "el" recibo
                         desde el estado actual de la venta no representaría este
                         pago puntual. Un movimiento manual (o un pago sin
                         invoice_id) no tiene ninguna acción válida acá. */
                      isPayment && entry.invoice_id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewSale?.(entry.invoice_id)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                          >
                            Ver venta
                          </button>
                          {entry.invoice?.source === 'pos' && (
                            <button
                              type="button"
                              onClick={() => onReprintReceipt?.(entry)}
                              disabled={reprintingId === entry.id}
                              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {reprintingId === entry.id && <Icon name="Loader2" size={12} className="animate-spin" />}
                              Reimprimir
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )
                    ) : isPayment ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEditPayment?.(entry)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                        >
                          Editar
                        </button>
                        {sessionOpen ? (
                          <button
                            type="button"
                            onClick={() => onVoidPayment?.(entry)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                          >
                            Anular
                          </button>
                        ) : (
                          <span
                            title="No se pueden anular movimientos de una caja cerrada"
                            className="cursor-not-allowed rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-300 select-none"
                          >
                            Anular
                          </span>
                        )}
                      </div>
                    ) : (
                      /* Movimiento operativo — solo anular */
                      sessionOpen ? (
                        <button
                          type="button"
                          onClick={() => onVoidMovement?.(entry)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                        >
                          Anular
                        </button>
                      ) : (
                        <span
                          title="No se pueden anular movimientos de una caja cerrada"
                          className="cursor-not-allowed rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-300 select-none"
                        >
                          Anular
                        </span>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Detalle histórico de una caja (modal) ─────────────────────────────────────
// Reutiliza exactamente los mismos cálculos que ya usa el resto de la página
// (calcSessionBalance, summarizePayments, totalPayments, totalMovementsOut/In)
// y los mismos componentes de presentación (MethodBreakdown, MovementsTable) --
// no duplica lógica de conciliación. `payments`/`movements` llegan ya filtrados
// exclusivamente por session.id (getCashSessionPayments/getCashSessionMovements
// en CrmCash), nunca desde la caja activa ni mezclados con otro turno del mismo
// día -- ver auditoría en el mensaje de commit.
// Tabla Esperado | Conciliado | Diferencia -- snapshot INMUTABLE de
// crm_cash_session_reconciliations. Nunca se recalcula desde
// crm_payments/crm_cash_movements: si algo cambió después del cierre (p.
// ej. una anulación posterior), este número sigue siendo el que el cajero
// realmente vio y confirmó al cerrar.
function ReconciliationSummaryTable({ reconciliation, session, currency }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Arqueo de cierre</p>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Conciliado</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-[11px] font-bold uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-3 py-2">Medio</th>
              <th className="px-3 py-2 text-right">Esperado</th>
              <th className="px-3 py-2 text-right">Conciliado</th>
              <th className="px-3 py-2 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reconciliation.map(row => (
              <tr key={row.id || row.payment_method}>
                <td className="px-3 py-2 font-medium text-gray-700">
                  {PAYMENT_METHOD_LABELS[row.payment_method] || row.payment_method}
                </td>
                <td className="px-3 py-2 text-right text-gray-600">{formatMoney(toNumber(row.expected_amount), currency)}</td>
                <td className="px-3 py-2 text-right text-gray-600">{formatMoney(toNumber(row.reconciled_amount), currency)}</td>
                <td className={`px-3 py-2 text-right font-bold ${
                  toNumber(row.difference) > 0 ? 'text-emerald-700' : toNumber(row.difference) < 0 ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {toNumber(row.difference) > 0 ? '+' : ''}{formatMoney(toNumber(row.difference), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {session.closing_notes && (
        <p className="mt-2 text-xs text-gray-500">Observación: {session.closing_notes}</p>
      )}
    </div>
  );
}

function CashSessionDetailModal({
  session, sessions, payments, movements, currency, user, loadError, reconciliation,
  onClose, onEditPayment, onVoidPayment, onVoidMovement,
  onViewSale, onReprintReceipt, reprintingId, reprintError,
}) {
  if (!session) return null;

  const balance          = calcSessionBalance(session, payments, movements);
  const cobros           = totalPayments(payments);
  const entradasManuales = totalMovementsIn(movements);
  const salidas          = totalMovementsOut(movements);
  const methodSummary    = summarizePayments(payments);
  // cash_difference/expected_cash/counted_cash existen en el esquema
  // (arqueo de cierre) desde antes de este trabajo -- este bloque de
  // fallback (sin snapshot en crm_cash_session_reconciliations) solo
  // aparece cuando el dato realmente existe para esta caja puntual, en vez
  // de mostrar un "—" fijo en todas.
  const hasArqueo = session.cash_difference !== null && session.cash_difference !== undefined;
  const hasReconciliation = Array.isArray(reconciliation) && reconciliation.length > 0;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">{turnLabel(session, sessions)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                session.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {session.status === 'open' ? 'Abierta' : 'Cerrada'}
              </span>
              <span className="text-xs capitalize text-gray-400">{fmtDate(session.date)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="Cerrar detalle">
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loadError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-semibold">No se pudieron cargar todos los movimientos de esta caja</p>
              {loadError.payments && <p className="mt-1">Pagos: {loadError.payments}</p>}
              {loadError.movements && <p className="mt-1">Movimientos: {loadError.movements}</p>}
            </div>
          )}

          {reprintError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-semibold">No se pudo reimprimir el comprobante</p>
              <p className="mt-1">{reprintError}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Responsable</p>
              <p className="mt-0.5 font-medium text-gray-700">{resolveResponsable(session, user)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Apertura</p>
              <p className="mt-0.5 font-medium text-gray-700">{fmtTime(session.opened_at)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Cierre</p>
              <p className="mt-0.5 font-medium text-gray-700">{session.closed_at ? fmtTime(session.closed_at) : '—'}</p>
            </div>
          </div>

          {hasReconciliation ? (
            <ReconciliationSummaryTable reconciliation={reconciliation} session={session} currency={currency} />
          ) : (
            <div className="relative rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Resumen</p>
              {session.status !== 'open' && (
                <span className="absolute right-4 top-4 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  Sin arqueo registrado
                </span>
              )}
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Fondo inicial</span>
                  <span className="font-semibold text-gray-700">{formatMoney(toNumber(session.initial_amount), currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Cobros del turno</span>
                  <span className="font-semibold text-emerald-700">+{formatMoney(cobros, currency)}</span>
                </div>
                {entradasManuales > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Entradas manuales</span>
                    <span className="font-semibold text-blue-600">+{formatMoney(entradasManuales, currency)}</span>
                  </div>
                )}
                {salidas > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Salidas / Gastos</span>
                    <span className="font-semibold text-red-600">−{formatMoney(salidas, currency)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                  <span className="font-bold text-gray-900">Saldo {session.status === 'open' ? 'esperado' : 'final'}</span>
                  <span className="text-base font-black text-gray-900">{formatMoney(balance, currency)}</span>
                </div>
              </div>

              {hasArqueo && (
                <div className="mt-3 space-y-1.5 border-t border-gray-200 pt-3 text-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Arqueo de cierre</p>
                  {session.expected_cash != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Efectivo esperado</span>
                      <span className="font-semibold text-gray-700">{formatMoney(toNumber(session.expected_cash), currency)}</span>
                    </div>
                  )}
                  {session.counted_cash != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Efectivo contado</span>
                      <span className="font-semibold text-gray-700">{formatMoney(toNumber(session.counted_cash), currency)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Diferencia</span>
                    <span className={`font-bold ${
                      session.cash_difference > 0 ? 'text-emerald-700' : session.cash_difference < 0 ? 'text-red-600' : 'text-gray-700'
                    }`}>
                      {session.cash_difference > 0 ? '+' : ''}{formatMoney(toNumber(session.cash_difference), currency)}
                    </span>
                  </div>
                  {session.closing_notes && (
                    <p className="text-xs text-gray-500">{session.closing_notes}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Cobros por método de pago</p>
            <MethodBreakdown summary={methodSummary} currency={currency} />
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Movimientos del turno</p>
            <MovementsTable
              payments={payments}
              movements={movements}
              currency={currency}
              onEditPayment={onEditPayment}
              onVoidPayment={onVoidPayment}
              onVoidMovement={onVoidMovement}
              sessionOpen={session.status === 'open'}
              readOnly={session.status !== 'open'}
              onViewSale={onViewSale}
              onReprintReceipt={onReprintReceipt}
              reprintingId={reprintingId}
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentEditModal({ payment, currency, busy, onSubmit, onCancel, onEditSale }) {
  const [amount, setAmount] = useState(String(payment?.amount || ''));
  const [paymentMethod, setPaymentMethod] = useState(payment?.payment_method || 'cash');
  const [reference, setReference] = useState(payment?.reference || '');
  const [notes, setNotes] = useState(payment?.notes || '');
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    setAmount(String(payment?.amount || ''));
    setPaymentMethod(payment?.payment_method || 'cash');
    setReference(payment?.reference || '');
    setNotes(payment?.notes || '');
  }, [payment]);

  useEffect(() => {
    let cancelled = false;
    async function loadInvoiceItems() {
      if (!payment?.invoice_id) {
        setInvoiceItems([]);
        return;
      }
      setLoadingItems(true);
      const { data } = await getCrmInvoice(payment.invoice_id);
      if (!cancelled) {
        setInvoiceItems(data?.crm_invoice_items || []);
        setLoadingItems(false);
      }
    }
    loadInvoiceItems();
    return () => { cancelled = true; };
  }, [payment?.invoice_id]);

  if (!payment) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      amount: parseMoneyInput(amount),
      payment_method: paymentMethod,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/40 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-900">Editar movimiento</h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600" aria-label="Cancelar">
            <Icon name="X" size={17} />
          </button>
        </div>

        {payment.invoice_id && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Este pago esta asociado a una nota de venta. Cambiar el monto solo corrige la caja, no modifica el detalle del ticket.
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Monto</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={fmtMoneyInput(amount)}
                onChange={e => setAmount(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Metodo de pago</label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {METHOD_ORDER.map(method => (
                <option key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Referencia</label>
            <input
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Nota</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {payment.invoice_id && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Items asociados</p>
                <button
                  type="button"
                  onClick={() => onEditSale(payment.invoice_id)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  Editar venta
                </button>
              </div>
              {loadingItems ? (
                <p className="text-xs text-gray-400">Cargando items...</p>
              ) : invoiceItems.length === 0 ? (
                <p className="text-xs text-gray-400">Sin items asociados visibles.</p>
              ) : (
                <div className="space-y-1">
                  {invoiceItems.map((item, index) => (
                    <div key={item.id || index} className="flex justify-between gap-3 text-xs text-gray-600">
                      <span>{item.quantity}x {item.name}</span>
                      <span className="font-semibold">{formatMoney(item.subtotal || item.unit_price * item.quantity, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy && <Icon name="Loader2" size={15} className="animate-spin" />}
            Guardar movimiento
          </button>
        </div>
      </form>
    </div>
  );
}

function VoidPaymentModal({ payment, currency, busy, submitError, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!payment) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!reason.trim()) { setError('El motivo es obligatorio.'); return; }
    onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/40 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-900">Anular movimiento</h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600" aria-label="Cancelar">
            <Icon name="X" size={17} />
          </button>
        </div>

        {submitError && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-100 p-3 text-sm text-red-800">
            <p className="font-semibold">No se pudo anular el movimiento</p>
            <p className="mt-1">{submitError}</p>
          </div>
        )}

        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">¿Anular este movimiento?</p>
          <p className="mt-1 text-red-700">
            {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}
            {' — '}
            <strong>{formatMoney(payment.amount, payment.currency || currency)}</strong>
            {' — '}
            {fmtTime(payment.created_at)}
          </p>
          <p className="mt-1.5 text-xs text-red-600">
            El movimiento quedará en el historial pero no contará en los totales.
          </p>
        </div>

        {payment.invoice_id && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold">⚠️ Movimiento asociado a una nota de venta</p>
            <p className="mt-1">La anulación solo afectará la caja. No modificará el documento ni el estado de la factura.</p>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">
            Motivo de anulación <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={e => { setReason(e.target.value); setError(''); }}
            placeholder="Ej: Pago duplicado, monto incorrecto…"
            autoFocus
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Icon name="Loader2" size={15} className="animate-spin" />}
            Confirmar anulación
          </button>
        </div>
      </form>
    </div>
  );
}

function CashMovementModal({ defaultDirection = 'out', businessId, currency, busy, onSubmit, onCancel }) {
  const [direction,  setDirection]  = useState(defaultDirection);
  const [amount,     setAmount]     = useState('');
  const [reason,     setReason]     = useState('');
  const [category,   setCategory]   = useState('');
  const [purpose,    setPurpose]    = useState('');
  const [relatedCostItemId, setRelatedCostItemId] = useState('');
  const [fixedCostItems,    setFixedCostItems]    = useState([]);
  const [loadingCostItems,  setLoadingCostItems]  = useState(false);
  const [notes,      setNotes]      = useState('');
  const [error,      setError]      = useState('');

  const categories      = direction === 'out' ? CASH_MOVEMENT_CATEGORIES_OUT : CASH_MOVEMENT_CATEGORIES_IN;
  const isOut            = direction === 'out';
  const selectedPurpose  = CASH_MOVEMENT_PURPOSES.find(p => p.value === purpose);

  // Resetear categoría/propósito al cambiar dirección -- el selector de
  // propósito (CAJA-COSTOS-1) solo aplica a salidas.
  useEffect(() => { setCategory(''); setPurpose(''); setRelatedCostItemId(''); setError(''); }, [direction]);

  // "Pago de un costo registrado": cargar los costos fijos del mes actual
  // para el selector opcional de costo relacionado. Solo type='fixed' en
  // esta primera versión (ver auditoría CAJA-COSTOS-1).
  useEffect(() => {
    let cancelled = false;
    async function loadFixedCostItems() {
      if (purpose !== 'cost_payment' || !businessId) { setFixedCostItems([]); return; }
      setLoadingCostItems(true);
      const now = new Date();
      const items = await getCostItems(businessId, now.getMonth() + 1, now.getFullYear());
      if (!cancelled) {
        setFixedCostItems((items || []).filter(item => item.type === 'fixed'));
        setLoadingCostItems(false);
      }
    }
    loadFixedCostItems();
    return () => { cancelled = true; };
  }, [purpose, businessId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || parseMoneyInput(amount) <= 0) { setError('Ingresa un monto válido.'); return; }
    if (!reason.trim()) { setError('El motivo es obligatorio.'); return; }
    if (!category) { setError('Selecciona una categoría.'); return; }
    if (isOut && !purpose) { setError('Selecciona qué tipo de salida es.'); return; }
    onSubmit({
      direction,
      amount:             parseMoneyInput(amount),
      reason:             reason.trim(),
      category,
      movementPurpose:    isOut ? purpose : null,
      relatedCostItemId:  isOut && purpose === 'cost_payment' ? (relatedCostItemId || null) : null,
      notes:              notes.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/40 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-900">Registrar movimiento de caja</h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600" aria-label="Cancelar">
            <Icon name="X" size={17} />
          </button>
        </div>

        {/* Selector Entrada / Salida */}
        <div className="mb-4 flex rounded-xl border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setDirection('in')}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
              direction === 'in' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon name="ArrowDownLeft" size={14} />
            Entrada
          </button>
          <button
            type="button"
            onClick={() => setDirection('out')}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
              direction === 'out' ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon name="ArrowUpRight" size={14} />
            Salida
          </button>
        </div>

        <div className="space-y-3">
          {/* Monto */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Monto <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={fmtMoneyInput(amount)}
                onChange={e => { setAmount(e.target.value.replace(/\D/g, '')); setError(''); }}
                placeholder="0"
                className={`w-full rounded-xl border py-3 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 ${
                  isOut ? 'border-red-200 focus:ring-red-400' : 'border-blue-200 focus:ring-blue-400'
                }`}
              />
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Categoría <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); setError(''); }}
              className={`w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 ${
                isOut ? 'border-red-200 focus:ring-red-400' : 'border-blue-200 focus:ring-blue-400'
              }`}
            >
              <option value="">— Selecciona —</option>
              {categories.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Motivo */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Motivo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => { setReason(e.target.value); setError(''); }}
              placeholder={isOut ? 'Ej: Rollos térmicos, retiro Juan…' : 'Ej: Fondo adicional de cambio…'}
              className={`w-full rounded-xl border px-3 py-3 text-sm focus:outline-none focus:ring-2 ${
                isOut ? 'border-red-200 focus:ring-red-400' : 'border-blue-200 focus:ring-blue-400'
              }`}
            />
          </div>

          {/* Propósito de la salida (CAJA-COSTOS-1) — separa "salió dinero"
              de "nació un costo nuevo". Sin jerga contable: pregunta
              simple + explicación corta de qué va a pasar. */}
          {isOut && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                ¿Qué tipo de salida es? <span className="text-red-500">*</span>
              </label>
              <select
                value={purpose}
                onChange={e => { setPurpose(e.target.value); setError(''); }}
                className="w-full rounded-xl border border-red-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                <option value="">— Selecciona —</option>
                {CASH_MOVEMENT_PURPOSES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {selectedPurpose && (
                <p className="mt-1.5 text-xs text-gray-500">{selectedPurpose.helper}</p>
              )}
            </div>
          )}

          {/* "Pago de un costo registrado" — vínculo opcional a un costo
              fijo existente, solo para explicar qué representa la salida.
              No modifica el monto del costo ni lo marca como pagado. */}
          {isOut && purpose === 'cost_payment' && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">
                Costo relacionado (opcional)
              </label>
              <select
                value={relatedCostItemId}
                onChange={e => setRelatedCostItemId(e.target.value)}
                disabled={loadingCostItems}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <option value="">— Sin especificar —</option>
                {fixedCostItems.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {formatMoney(item.amount, currency)}
                  </option>
                ))}
              </select>
              {loadingCostItems && <p className="mt-1 text-xs text-gray-400">Cargando costos…</p>}
              {!loadingCostItems && fixedCostItems.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">No hay costos fijos registrados este mes.</p>
              )}
            </div>
          )}

          {/* Notas opcionales */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Notas (opcional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Información adicional…"
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 border border-red-200">{error}</p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
              isOut ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {busy && <Icon name="Loader2" size={15} className="animate-spin" />}
            {isOut ? 'Registrar salida' : 'Registrar entrada'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Asistente de cierre de caja (conciliación por medio de pago) ─────────────
// "Cerrar caja" ya no cierra al primer click: abre este wizard, que muestra
// "lo que Walinka dice que deberías tener" por medio de pago (cálculo
// CLIENTE, solo para mostrar -- crm_close_cash_session recalcula todo
// server-side y es la única fuente de verdad real) y pide el monto
// realmente contado/confirmado por el cajero. Efectivo siempre aparece
// (ritual físico obligatorio aunque el esperado sea $0); los demás medios
// solo si tuvieron actividad real en la sesión -- "+ Agregar medio" permite
// sumar un medio sin actividad para un caso excepcional. El payload manda
// TODAS las filas visibles/agregadas, sin filtrar las que no tienen
// diferencia -- igual que esperan closeCashSessionReconciled/RPC.
function CloseCashSessionWizard({ session, payments, movements, currency, busy, serverError, onSubmit, onCancel }) {
  const expectedCash = calcExpectedCash(session, payments, movements);
  const expectedByMethod = calcExpectedByMethod(payments);

  const [methods, setMethods] = useState(() => {
    const initial = ['cash'];
    for (const method of RECONCILE_ALL_METHODS) {
      if (method === 'cash') continue;
      if (Math.abs(expectedByMethod[method] || 0) > 0) initial.push(method);
    }
    return initial;
  });
  const [amounts, setAmounts] = useState({});
  const [notesByMethod, setNotesByMethod] = useState({});
  const [observation, setObservation] = useState('');
  const [addMethodValue, setAddMethodValue] = useState('');
  const [error, setError] = useState('');

  // CAJA-CIERRE-IDEMPOTENTE-1 -- guardia SÍNCRONA contra doble submit.
  // `busy` (prop, actualizado por setBusy en el padre) no basta: entre el
  // primer click/Enter y que ese estado se propague y deshabilite el botón
  // puede pasar más de un render, y un segundo click/Enter en esa ventana
  // dispararía una segunda llamada a la RPC. submittingRef se marca en el
  // mismo tick del primer submit válido, antes de llamar a onSubmit.
  const submittingRef = useRef(false);
  useEffect(() => {
    if (!busy) submittingRef.current = false;
  }, [busy]);

  const expectedFor = (method) => (method === 'cash' ? expectedCash : (expectedByMethod[method] || 0));
  const availableToAdd = RECONCILE_ALL_METHODS.filter(m => !methods.includes(m));

  const handleAddMethod = () => {
    if (!addMethodValue) return;
    setMethods(prev => [...prev, addMethodValue]);
    setAddMethodValue('');
  };

  const handleRemoveMethod = (method) => {
    if (method === 'cash') return;
    setMethods(prev => prev.filter(m => m !== method));
    setAmounts(prev => {
      const next = { ...prev };
      delete next[method];
      return next;
    });
  };

  let anyDiff = false;
  for (const method of methods) {
    const raw = amounts[method];
    if (raw === undefined || raw === '') continue;
    if (parseMoneyInput(raw) !== expectedFor(method)) anyDiff = true;
  }

  const handleSubmit = (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setError('');
    for (const method of methods) {
      const raw = amounts[method];
      if (raw === undefined || raw === '') {
        setError(`Falta indicar el monto conciliado de ${PAYMENT_METHOD_LABELS[method] || method}.`);
        return;
      }
    }
    if (anyDiff && !observation.trim()) {
      setError('Debes indicar una observación: hay diferencias en la conciliación.');
      return;
    }
    const reconciliations = methods.map(method => ({
      payment_method: method,
      reconciled_amount: parseMoneyInput(amounts[method]),
      notes: (notesByMethod[method] || '').trim() || null,
    }));
    submittingRef.current = true;
    onSubmit({ reconciliations, closingNotes: observation.trim() || null });
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <form onSubmit={handleSubmit} className="flex max-h-full w-full max-w-xl flex-col rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h3 className="text-sm font-bold text-gray-900">Cerrar caja — conciliación</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Cancelar"
          >
            <Icon name="X" size={17} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-xs text-gray-500">
            Según Walinka, esto es lo que deberías tener en cada medio de pago. Compáralo con lo real y cuenta cualquier diferencia.
          </p>

          {(serverError || error) && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {serverError || error}
            </div>
          )}

          <div className="space-y-3">
            {methods.map(method => {
              const expected = expectedFor(method);
              const raw = amounts[method] ?? '';
              const reconciled = raw === '' ? null : parseMoneyInput(raw);
              const diff = reconciled === null ? null : reconciled - expected;
              return (
                <div key={method} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900">{PAYMENT_METHOD_LABELS[method] || method}</p>
                    {method !== 'cash' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMethod(method)}
                        disabled={busy}
                        className="text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                    <span>Según Walinka deberías tener</span>
                    <span className="font-semibold text-gray-700">{formatMoney(expected, currency)}</span>
                  </div>
                  <label className="mt-2 block text-xs font-semibold text-gray-500">
                    {RECONCILE_QUESTION_LABELS[method] || 'Monto conciliado'}
                  </label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={fmtMoneyInput(raw)}
                      onChange={e => { setAmounts(prev => ({ ...prev, [method]: e.target.value.replace(/\D/g, '') })); setError(''); }}
                      placeholder="0"
                      disabled={busy}
                      className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                    />
                  </div>
                  {diff !== null && diff !== 0 && (
                    <p className={`mt-1.5 text-xs font-bold ${diff > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      Diferencia: {diff > 0 ? '+' : ''}{formatMoney(diff, currency)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {availableToAdd.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={addMethodValue}
                onChange={e => setAddMethodValue(e.target.value)}
                disabled={busy}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
              >
                <option value="">+ Agregar medio</option>
                {availableToAdd.map(m => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] || m}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddMethod}
                disabled={!addMethodValue || busy}
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Agregar
              </button>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">
              Observación {anyDiff && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={observation}
              onChange={e => { setObservation(e.target.value); setError(''); }}
              rows={3}
              placeholder={anyDiff ? 'Explica la diferencia encontrada…' : 'Opcional'}
              disabled={busy}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy && <Icon name="Loader2" size={15} className="animate-spin" />}
            {busy ? 'Cerrando…' : 'Cerrar caja'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CashSessionForm({ title, initialValue = '', notesValue = '', busy, submitLabel, onSubmit, onCancel }) {
  const [amount, setAmount] = useState(String(initialValue || ''));
  const [notes, setNotes] = useState(notesValue || '');

  useEffect(() => {
    setAmount(String(initialValue || ''));
    setNotes(notesValue || '');
  }, [initialValue, notesValue]);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      initialAmount: parseMoneyInput(amount),
      notes: notes.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/40 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600" aria-label="Cancelar">
            <Icon name="X" size={17} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Monto inicial</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={fmtMoneyInput(amount)}
                onChange={e => setAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Nota</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: Turno tarde"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy && <Icon name="Loader2" size={15} className="animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CrmCash() {
  const navigate = useNavigate();
  const { business, user } = useAuth();
  const today = getLocalDateString();
  const [openSession, setOpenSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [sessionPayments, setSessionPayments] = useState({});
  const [sessionMovements, setSessionMovements] = useState({});
  const [sessionLoadErrors, setSessionLoadErrors] = useState({});
  const [dayPayments, setDayPayments] = useState([]);
  const [dayMovements, setDayMovements] = useState([]);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [detailSessionId, setDetailSessionId] = useState(null);
  // Barra de navegación secundaria (rediseño): una sola sección visible a la
  // vez, en vez de 3 toggles independientes que podían quedar todos abiertos.
  const [activeTab, setActiveTab] = useState('movimientos');
  const [editingPayment, setEditingPayment] = useState(null);
  const [voidingPayment, setVoidingPayment] = useState(null);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [voidingMovement, setVoidingMovement] = useState(null);
  const [voidError, setVoidError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // CAJA-CIERRE-CONCILIACION-1 — "Cerrar caja" abre este wizard en vez de
  // cerrar al primer click. reconciliationBySession cachea el snapshot
  // (crm_cash_session_reconciliations) por sesión, para el detalle
  // histórico -- [] real (sin filas) se distingue de "todavía no se pidió".
  const [closingSessionId, setClosingSessionId] = useState(null);
  const [closeError, setCloseError] = useState('');
  const [reconciliationBySession, setReconciliationBySession] = useState({});

  const planSlug = getEffectivePlanSlug(
    business?.planSlug,
    business?.planExpiresAt,
    business?.trialExpiresAt
  );
  const hasAccess = canUseFeature(planSlug, 'cashRegister');

  const load = useCallback(async () => {
    if (!business?.id || !hasAccess) return;
    setLoading(true);
    setErrorMsg('');

    const [openRes, sessionsRes, dayPaymentsRes, dayMovementsRes, recentRes] = await Promise.all([
      getOpenCashSession(business.id),
      getCashSessionsForDate(business.id, today),
      getCashDayPayments(business.id, today),
      getCashDayMovements(business.id, today),
      getCashRecentSessions(business.id),
    ]);

    const firstError = openRes.error || sessionsRes.error || dayPaymentsRes.error;
    if (firstError) {
      setErrorMsg(firstError.message);
      setLoading(false);
      return;
    }

    const sessionsList = sessionsRes.data || [];
    // Fall back to today's sessions if the extended history query fails,
    // so a transient error there doesn't wipe out the history panel entirely.
    const recentList = recentRes.error ? sessionsList : (recentRes.data || []);
    if (recentRes.error) setErrorMsg(recentRes.error.message);
    const noSessionToday = sessionsList.length === 0 && !openRes.data;

    // Load payments and movements for all recent sessions (needed for history detail)
    const allUnique = recentList.filter(s => !sessionsList.some(t => t.id === s.id));
    const historyLoad = allUnique.concat(sessionsList);

    const [paymentsResults, movementsResults] = await Promise.all([
      Promise.all(historyLoad.map(async session => {
        const res = await getCashSessionPayments(business.id, session);
        if (res.error) {
          // eslint-disable-next-line no-console
          console.error('[CrmCash] getCashSessionPayments failed', { sessionId: session.id, date: session.date, error: res.error });
        }
        return { id: session.id, data: res.error ? [] : (res.data || []), error: res.error || null };
      })),
      Promise.all(historyLoad.map(async session => {
        const res = await getCashSessionMovements(business.id, session.id);
        if (res.error) {
          // eslint-disable-next-line no-console
          console.error('[CrmCash] getCashSessionMovements failed', { sessionId: session.id, date: session.date, error: res.error });
        }
        return { id: session.id, data: res.error ? [] : (res.data || []), error: res.error || null };
      })),
    ]);

    const loadErrors = {};
    for (const r of paymentsResults) {
      if (r.error) loadErrors[r.id] = { ...(loadErrors[r.id] || {}), payments: r.error.message };
    }
    for (const r of movementsResults) {
      if (r.error) loadErrors[r.id] = { ...(loadErrors[r.id] || {}), movements: r.error.message };
    }

    setOpenSession(openRes.data || null);
    setSessions(sessionsList);
    setAllSessions(recentList);
    setSessionPayments(Object.fromEntries(paymentsResults.map(r => [r.id, r.data])));
    setSessionMovements(Object.fromEntries(movementsResults.map(r => [r.id, r.data])));
    setSessionLoadErrors(loadErrors);
    setDayPayments(dayPaymentsRes.data || []);
    setDayMovements(dayMovementsRes.data || []);
    setShowOpenForm(noSessionToday);
    // When there's no session today, jump to the history tab so past sessions are visible
    if (noSessionToday && recentList.length > 0) setActiveTab('historial');
    setLoading(false);
  }, [business?.id, hasAccess, today]);

  useEffect(() => {
    load();
  }, [load]);

  const currentSession  = openSession || sessions[0] || null;
  const currentPayments = currentSession ? (sessionPayments[currentSession.id] || []) : [];
  const currentMvts     = currentSession ? (sessionMovements[currentSession.id] || []) : [];
  const detailSession   = detailSessionId ? allSessions.find(s => s.id === detailSessionId) : null;
  const detailPayments  = detailSession ? (sessionPayments[detailSession.id] || []) : [];
  const detailMvts      = detailSession ? (sessionMovements[detailSession.id] || []) : [];
  const detailReconciliation = detailSession ? (reconciliationBySession[detailSession.id] ?? null) : null;

  // El wizard puede abrirse tanto desde el botón principal (currentSession,
  // normalmente hoy) como desde el menú "..." de una fila del historial --
  // en ambos casos ya tenemos sus pagos/movimientos cargados en los mapas
  // de `load()` (historyLoad cubre sessionsList + allUnique), sin volver a
  // pedirlos.
  const closingSession  = closingSessionId ? allSessions.find(s => s.id === closingSessionId) || (closingSessionId === currentSession?.id ? currentSession : null) : null;
  const closingPayments = closingSessionId ? (sessionPayments[closingSessionId] || []) : [];
  const closingMvts     = closingSessionId ? (sessionMovements[closingSessionId] || []) : [];

  // Snapshot de conciliación del detalle histórico -- se pide una sola vez
  // por sesión (cache en reconciliationBySession) y nunca se recalcula
  // desde crm_payments/crm_cash_movements.
  useEffect(() => {
    let cancelled = false;
    async function fetchReconciliation() {
      if (!detailSessionId || !business?.id) return;
      if (reconciliationBySession[detailSessionId] !== undefined) return;
      const { data } = await getCashSessionReconciliation(business.id, detailSessionId);
      if (!cancelled) {
        setReconciliationBySession(prev => ({ ...prev, [detailSessionId]: data || [] }));
      }
    }
    fetchReconciliation();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailSessionId, business?.id]);

  const daySummary        = useMemo(() => summarizePayments(dayPayments), [dayPayments]);
  const dayTotal          = useMemo(() => totalPayments(dayPayments), [dayPayments]);
  const dayOutflows       = useMemo(() => totalMovementsOut(dayMovements), [dayMovements]);
  // Métricas de la sesión actual (cuadran exactamente con la tabla)
  const sessionTotal      = useMemo(() => totalPayments(currentPayments), [currentPayments]);
  const sessionOutflows   = useMemo(() => totalMovementsOut(currentMvts), [currentMvts]);
  const sessionSummary    = useMemo(() => summarizePayments(currentPayments), [currentPayments]);
  const currentBalance    = useMemo(() => calcSessionBalance(currentSession, currentPayments, currentMvts), [currentSession, currentPayments, currentMvts]);

  const handleOpen = async ({ initialAmount, notes }) => {
    if (!business?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await openCashSession(business.id, {
      initialAmount,
      notes,
      date: today,
    });
    setBusy(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setShowOpenForm(false);
    await load();
  };

  // "Cerrar caja" ya no cierra directo -- abre el wizard de conciliación
  // (CloseCashSessionWizard). El cierre real ocurre en handleSubmitClose,
  // vía la RPC crm_close_cash_session.
  const handleOpenCloseWizard = (sessionId = openSession?.id) => {
    if (!sessionId) return;
    setCloseError('');
    setClosingSessionId(sessionId);
  };

  // CAJA-CIERRE-IDEMPOTENTE-1 -- crm_close_cash_session ahora puede devolver
  // already_closed=true (reintento idéntico sobre una caja que esta misma
  // conciliación ya había cerrado: doble submit, reintento tras timeout, dos
  // pestañas) o un error de dominio "caja ya cerrada" identificable por
  // error.hint (nunca un 23505 técnico de la UNIQUE). Un error SIN código
  // Postgres reconocible (fetch/timeout/red caída) es ambiguo: no se sabe si
  // el cierre llegó a aplicarse del lado del servidor, así que se relee el
  // estado real antes de decidir qué mostrar.
  const handleSubmitClose = async ({ reconciliations, closingNotes }) => {
    if (!closingSessionId) return;
    const sessionId = closingSessionId;
    setBusy(true);
    setCloseError('');
    const { error } = await closeCashSessionReconciled(sessionId, { reconciliations, closingNotes });
    setBusy(false);

    if (error) {
      if (error.hint === 'crm_cash_session_closed_no_snapshot' || error.hint === 'crm_cash_session_closed_mismatch') {
        // load() limpia errorMsg al empezar -- el aviso se fija DESPUÉS de
        // que termine, si no lo pisaría antes de que se alcance a ver.
        setClosingSessionId(null);
        await load();
        setErrorMsg(error.message || 'Esta caja ya estaba cerrada.');
        return;
      }
      if (!error.code) {
        const { data: freshSession } = await getCashSessionById(sessionId);
        if (freshSession?.status === 'closed') {
          setClosingSessionId(null);
          await load();
          return;
        }
        // Mensaje fijo a propósito -- error.message acá suele ser algo
        // críptico ("Failed to fetch", "NetworkError…"), no apto para
        // mostrar tal cual.
        setCloseError('No se pudo confirmar el cierre. Revisa tu conexión e intenta nuevamente.');
        return;
      }
      setCloseError(error.message || 'No se pudo cerrar la caja.');
      return;
    }

    // already_closed=true (éxito idempotente) se trata igual que un cierre
    // nuevo: mismo resultado visible para el usuario, solo que no escribió
    // nada del lado del servidor.
    setClosingSessionId(null);
    await load();
  };

  const handleReopen = async (sessionId) => {
    if (openSession) {
      setErrorMsg('Cierra la caja abierta antes de reabrir otra.');
      return;
    }
    setBusy(true);
    setErrorMsg('');
    const { error } = await reopenCashSession(sessionId);
    setBusy(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    await load();
  };

  const handleUpdate = async ({ initialAmount, notes }) => {
    if (!editingSession?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await updateCashSession(editingSession.id, {
      initial_amount: initialAmount,
      notes,
    });
    setBusy(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setEditingSession(null);
    await load();
  };

  const handleUpdatePayment = async (fields) => {
    if (!editingPayment?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await updateCrmPayment(editingPayment.id, fields);
    setBusy(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setEditingPayment(null);
    await load();
  };

  const handleVoidPayment = async (reason) => {
    if (!voidingPayment?.id) return;
    setBusy(true);
    setVoidError('');
    const { error } = await voidCrmPayment(voidingPayment.id, {
      voidReason: reason,
      voidedBy: user?.id || null,
    });
    setBusy(false);
    if (error) {
      setVoidError(error.message);
      return;
    }
    setVoidingPayment(null);
    await load();
  };

  const handleCreateMovement = async (fields) => {
    if (!currentSession?.id || !business?.id) return;
    setBusy(true);
    setErrorMsg('');
    const now = new Date();
    const { error } = await createCashMovement(business.id, {
      ...fields,
      sessionId: currentSession.id,
      month:     now.getMonth() + 1,
      year:      now.getFullYear(),
    });
    setBusy(false);
    if (error) { setErrorMsg(error.message); return; }
    setShowMovementForm(false);
    await load();
  };

  const handleVoidMovement = async (reason) => {
    if (!voidingMovement?.id) return;
    setBusy(true);
    setVoidError('');
    const { error } = await voidCashMovement(voidingMovement.id, {
      voidReason: reason,
      voidedBy: user?.id || null,
    });
    setBusy(false);
    if (error) { setVoidError(error.message); return; }
    setVoidingMovement(null);
    await load();
  };

  const handleEditSale = (invoiceId) => {
    navigate(`/crm/facturas/${invoiceId}`);
  };

  // Reimpresión de un comprobante histórico (caja cerrada): solo lee la
  // venta ya guardada (getCrmInvoice/getInvoicePaymentSummary) y reenvía el
  // mismo comprobante a la impresora -- mismo patrón "Reimprimir" ya
  // probado en CrmTerminal.jsx. Nunca crea una venta/pago/movimiento
  // nuevo, no toca stock ni la caja: printService.printReceipt solo envía
  // bytes a la impresora.
  const [reprintingId, setReprintingId] = useState(null);
  const [reprintError, setReprintError] = useState('');

  const handleReprintReceipt = async (payment) => {
    if (!payment?.invoice_id || reprintingId) return;
    setReprintError('');
    const printerConfig = readPrinterConfig(buildPrinterConfigKey(business?.id));
    if (!printerConfig.printerName) {
      setReprintError('No hay una impresora configurada en este equipo. Configúrala en Configuración de impresión.');
      return;
    }
    setReprintingId(payment.id);
    try {
      const [{ data: invoice, error: invErr }, { data: summary, error: sumErr }] = await Promise.all([
        getCrmInvoice(payment.invoice_id),
        getInvoicePaymentSummary(payment.invoice_id),
      ]);
      if (invErr || !invoice) throw new Error(invErr?.message || 'No se pudo cargar la venta original.');
      if (sumErr) throw new Error(sumErr.message);
      // Defensa en profundidad: el botón ya solo se muestra para
      // invoice.source === 'pos' (ver MovementsTable) -- único origen que
      // efectivamente imprimió un comprobante alguna vez (CrmTerminal.jsx).
      // Un abono a cuenta corriente o un pago de pedido de catálogo nunca
      // tuvo un ticket real que reimprimir.
      if (invoice.source !== 'pos') {
        throw new Error('Este pago no tiene un comprobante original para reimprimir.');
      }

      const receipt = buildSaleReceipt({
        business,
        sale: invoice,
        items: (invoice.crm_invoice_items || []).map(item => ({ ...item, note: item.description })),
        customer: invoice.wa_customers,
        payments: summary?.payments || [],
        subtotal: invoice.subtotal,
        discountAmount: invoice.discount_amount,
        total: invoice.total,
        notes: invoice.notes,
        createdAt: invoice.issue_date,
        paperWidthMm: printerConfig.paperWidthMm,
        autoCut: printerConfig.autoCut,
        printLogo: printerConfig.printLogo,
        imageMode: printerConfig.imageMode,
        cutStrategyId: printerConfig.cutStrategyId,
        effectivePrintableWidthDots: printerConfig.effectivePrintableWidthDots,
      });
      await printService.printReceipt(receipt, { printerName: printerConfig.printerName });
    } catch (err) {
      setReprintError(err?.message || 'No se pudo reimprimir el comprobante.');
    } finally {
      setReprintingId(null);
    }
  };

  const openDetail = (sessionId) => {
    setDetailSessionId(sessionId);
    setActiveTab('historial');
  };

  if (!hasAccess) {
    return (
      <DashboardAppShell>
        <PanelHeader title={<><CrmBreadcrumb section="Caja diaria" /><h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Caja diaria</h1></>} subtitle="Pagos reales del negocio" />
        <DashboardLayoutContent>
          <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
              <Icon name="Lock" size={24} color="#059669" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Funcionalidad Business</h3>
            <p className="max-w-sm text-sm text-gray-500">Caja diaria requiere plan Business/Full.</p>
            <button
              onClick={() => navigate('/planes')}
              className="mt-5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
            >
              Ver planes
            </button>
          </div>
        </DashboardLayoutContent>
      </DashboardAppShell>
    );
  }

  return (
    <DashboardAppShell>
      <PanelHeader
        title={
          <><CrmBreadcrumb section="Caja diaria" /><h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Caja diaria</h1></>
        }
        subtitle={
          <p className="text-xs capitalize" style={{ color: 'var(--color-muted-foreground)' }}>
            {fmtDate(today)}
          </p>
        }
      />

      <DashboardLayoutContent>
        <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <Icon name="AlertCircle" size={16} className="mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} className="ml-auto text-red-400 hover:text-red-600" aria-label="Cerrar error">
                <Icon name="X" size={14} />
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                      openSession ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${openSession ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      {openSession ? 'CAJA ABIERTA' : currentSession ? 'CAJA CERRADA' : 'SIN CAJA ABIERTA HOY'}
                    </span>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-base font-bold text-gray-900">
                        {currentSession ? turnLabel(currentSession, sessions) : 'Sin caja abierta'}
                      </span>
                      <span className="capitalize text-sm text-gray-400">{fmtDate(today)}</span>
                    </div>

                    {currentSession && (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                        <span>
                          Responsable:{' '}
                          <span className="font-medium text-gray-700">
                            {resolveResponsable(currentSession, user)}
                          </span>
                        </span>
                        <span>
                          Apertura: <span className="font-medium text-gray-700">{fmtTime(currentSession.opened_at)}</span>
                        </span>
                        {currentSession.closed_at && (
                          <span>
                            Cierre: <span className="font-medium text-gray-700">{fmtTime(currentSession.closed_at)}</span>
                          </span>
                        )}
                      </div>
                    )}

                    <p className="mt-3 text-xs text-gray-400">
                      La caja registra pagos reales, no ventas pendientes. Puedes abrir más de una caja por día para cambios de turno.
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {!openSession && (
                      <button
                        onClick={() => setShowOpenForm(true)}
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
                      >
                        Abrir nueva caja
                      </button>
                    )}
                    {openSession && (
                      <button
                        onClick={() => handleOpenCloseWizard(openSession.id)}
                        disabled={busy}
                        className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Cerrar caja
                      </button>
                    )}
                    {currentSession && (
                      <button
                        onClick={() => setEditingSession(currentSession)}
                        className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
                      >
                        Editar
                      </button>
                    )}
                    {currentSession?.status === 'closed' && (
                      <button
                        onClick={() => handleReopen(currentSession.id)}
                        className="rounded-xl border border-emerald-200 px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
                      >
                        Reabrir
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="my-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <KpiCard
                  label="Fondo inicial"
                  value={formatMoney(toNumber(currentSession?.initial_amount), business?.currency)}
                  toneClass="text-gray-500"
                />
                <KpiCard
                  label="Cobros de la caja"
                  value={`${sessionTotal > 0 ? '+' : ''}${formatMoney(sessionTotal, business?.currency)}`}
                  toneClass="text-emerald-700"
                />
                <KpiCard
                  label="Salidas / Gastos"
                  value={sessionOutflows > 0 ? `−${formatMoney(sessionOutflows, business?.currency)}` : formatMoney(0, business?.currency)}
                  toneClass={sessionOutflows > 0 ? 'text-red-600' : 'text-gray-400'}
                />
                <KpiCard
                  label="Saldo en caja"
                  value={formatMoney(currentBalance, business?.currency)}
                  emphasize
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CashTabs active={activeTab} onChange={setActiveTab} />
                {openSession && (
                  <button
                    type="button"
                    onClick={() => setShowMovementForm(true)}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
                  >
                    <Icon name="Plus" size={15} />
                    Registrar movimiento / gasto
                  </button>
                )}
              </div>

              {showOpenForm && (
                <CashSessionForm
                  title="Abrir nueva caja"
                  busy={busy}
                  submitLabel="Abrir caja"
                  onSubmit={handleOpen}
                  onCancel={() => setShowOpenForm(false)}
                />
              )}

              {editingSession && (
                <CashSessionForm
                  title="Editar caja"
                  initialValue={editingSession.initial_amount || ''}
                  notesValue={editingSession.notes || ''}
                  busy={busy}
                  submitLabel="Guardar cambios"
                  onSubmit={handleUpdate}
                  onCancel={() => setEditingSession(null)}
                />
              )}

              {editingPayment && (
                <PaymentEditModal
                  payment={editingPayment}
                  currency={business?.currency}
                  busy={busy}
                  onSubmit={handleUpdatePayment}
                  onCancel={() => setEditingPayment(null)}
                  onEditSale={handleEditSale}
                />
              )}

              {voidingPayment && (
                <VoidPaymentModal
                  payment={voidingPayment}
                  currency={business?.currency}
                  busy={busy}
                  submitError={voidError}
                  onConfirm={handleVoidPayment}
                  onCancel={() => { setVoidingPayment(null); setVoidError(''); }}
                />
              )}

              {showMovementForm && (
                <CashMovementModal
                  businessId={business?.id}
                  currency={business?.currency}
                  busy={busy}
                  onSubmit={handleCreateMovement}
                  onCancel={() => setShowMovementForm(false)}
                />
              )}

              {voidingMovement && (
                <VoidPaymentModal
                  payment={{
                    ...voidingMovement,
                    payment_method: 'cash',
                    invoice_id: null,
                  }}
                  currency={business?.currency}
                  busy={busy}
                  submitError={voidError}
                  onConfirm={handleVoidMovement}
                  onCancel={() => { setVoidingMovement(null); setVoidError(''); }}
                />
              )}

              {detailSession && (
                <CashSessionDetailModal
                  session={detailSession}
                  sessions={sessions}
                  payments={detailPayments}
                  movements={detailMvts}
                  currency={business?.currency}
                  user={user}
                  loadError={sessionLoadErrors[detailSession.id]}
                  reconciliation={detailReconciliation}
                  onClose={() => { setDetailSessionId(null); setReprintError(''); }}
                  onEditPayment={setEditingPayment}
                  onVoidPayment={setVoidingPayment}
                  onVoidMovement={setVoidingMovement}
                  onViewSale={handleEditSale}
                  onReprintReceipt={handleReprintReceipt}
                  reprintingId={reprintingId}
                  reprintError={reprintError}
                />
              )}

              {closingSession && (
                <CloseCashSessionWizard
                  key={closingSession.id}
                  session={closingSession}
                  payments={closingPayments}
                  movements={closingMvts}
                  currency={business?.currency}
                  busy={busy}
                  serverError={closeError}
                  onSubmit={handleSubmitClose}
                  onCancel={() => { setClosingSessionId(null); setCloseError(''); }}
                />
              )}

              {activeTab === 'movimientos' && (
                currentSession ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                      <p className="text-sm font-bold text-gray-900">{turnLabel(currentSession, sessions)}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {turnTimeRange(currentSession)} · Saldo: {formatMoney(currentBalance, business?.currency)}
                      </p>
                    </div>
                    <MovementsTable
                      payments={currentPayments}
                      movements={currentMvts}
                      currency={business?.currency}
                      onEditPayment={setEditingPayment}
                      onVoidPayment={setVoidingPayment}
                      onVoidMovement={setVoidingMovement}
                      sessionOpen={currentSession?.status === 'open'}
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-100 bg-white px-5 py-10 text-center shadow-sm">
                    <Icon name="Wallet" size={30} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-sm font-semibold text-gray-600">No hay una caja abierta hoy todavía.</p>
                    <p className="mt-1 text-xs text-gray-400">Abre una caja para empezar a registrar movimientos.</p>
                  </div>
                )
              )}

              {activeTab === 'resumen' && (
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                    Resumen del día — por método de pago
                  </p>
                  <MethodBreakdown summary={daySummary} currency={business?.currency} />
                  <p className="mt-3 text-right text-xs text-gray-400">
                    Total del día: <strong className="text-gray-700">{formatMoney(dayTotal, business?.currency)}</strong>
                    {dayOutflows > 0 && (
                      <> · Salidas: <strong className="text-red-600">−{formatMoney(dayOutflows, business?.currency)}</strong></>
                    )}
                  </p>
                </div>
              )}

              {activeTab === 'historial' && (
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  {allSessions.length === 0 ? (
                    <div className="py-8 text-center">
                      <Icon name="Wallet" size={30} className="mx-auto mb-3 text-gray-200" />
                      <p className="text-sm font-semibold text-gray-600">Todavía no hay cajas registradas.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {allSessions.map(session => {
                        const payments  = sessionPayments[session.id] || [];
                        const movements = sessionMovements[session.id] || [];
                        const total     = calcSessionBalance(session, payments, movements);
                        return (
                          <div key={session.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold capitalize text-gray-900">{fmtDate(session.date)}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  session.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {session.status === 'open' ? 'Abierta' : 'Cerrada'}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-gray-400">{turnTimeRange(session)}</p>
                            </div>
                            <div className="flex items-center gap-4 sm:gap-6">
                              <span className="text-sm font-black tabular-nums text-gray-900">
                                {formatMoney(total, business?.currency)}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openDetail(session.id)}
                                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                                >
                                  Ver detalle
                                </button>
                                <RowActionsMenu
                                  session={session}
                                  busy={busy}
                                  reconciled={
                                    reconciliationBySession[session.id] !== undefined
                                      ? reconciliationBySession[session.id]?.length > 0
                                      : undefined
                                  }
                                  onEdit={() => setEditingSession(session)}
                                  onReopen={() => handleReopen(session.id)}
                                  onClose={() => handleOpenCloseWizard(session.id)}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
