import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  getCashMovementCategoryLabel,
  closeCashSession,
  createCashMovement,
  getCashDayMovements,
  getCashDayPayments,
  getCashSessionMovements,
  getCashSessionPayments,
  getCashSessionsForDate,
  getCrmInvoice,
  getLocalDateString,
  getOpenCashSession,
  openCashSession,
  reopenCashSession,
  updateCrmPayment,
  updateCashSession,
  voidCashMovement,
  voidCrmPayment,
} from 'services/crmService';

const METHOD_ORDER = ['cash', 'card', 'bank_transfer', 'check', 'other'];

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

function totalMovementsOut(movements = []) {
  return movements.filter(m => !m.voided_at && m.direction === 'out').reduce((s, m) => s + toNumber(m.amount), 0);
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

function SectionButton({ open, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
    >
      <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={15} />
      {children}
    </button>
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

function MovementsTable({ payments, movements, currency, onEditPayment, onVoidPayment, onVoidMovement, sessionOpen }) {
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

function VoidPaymentModal({ payment, currency, busy, onConfirm, onCancel }) {
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

function CashMovementModal({ defaultDirection = 'out', busy, onSubmit, onCancel }) {
  const [direction,  setDirection]  = useState(defaultDirection);
  const [amount,     setAmount]     = useState('');
  const [reason,     setReason]     = useState('');
  const [category,   setCategory]   = useState('');
  const [isExpense,  setIsExpense]  = useState(false);
  const [notes,      setNotes]      = useState('');
  const [error,      setError]      = useState('');

  const categories    = direction === 'out' ? CASH_MOVEMENT_CATEGORIES_OUT : CASH_MOVEMENT_CATEGORIES_IN;
  const selectedCat   = categories.find(c => c.value === category);
  const canBeExpense  = direction === 'out' && (selectedCat?.isExpense ?? false);

  // Resetear categoría al cambiar dirección
  useEffect(() => { setCategory(''); setIsExpense(false); setError(''); }, [direction]);
  // Si la nueva categoría no puede ser gasto, desmarcar automáticamente
  useEffect(() => { if (!canBeExpense) setIsExpense(false); }, [canBeExpense]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || parseMoneyInput(amount) <= 0) { setError('Ingresa un monto válido.'); return; }
    if (!reason.trim()) { setError('El motivo es obligatorio.'); return; }
    if (!category) { setError('Selecciona una categoría.'); return; }
    onSubmit({
      direction,
      amount:    parseMoneyInput(amount),
      reason:    reason.trim(),
      category,
      isExpense: canBeExpense && isExpense,
      notes:     notes.trim() || null,
    });
  };

  const isOut = direction === 'out';

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

          {/* Registrar como gasto — solo visible para categorías que son gastos */}
          {canBeExpense && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-3">
              <input
                type="checkbox"
                checked={isExpense}
                onChange={e => setIsExpense(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <div>
                <p className="text-sm font-semibold text-orange-800">Registrar también como gasto del negocio</p>
                <p className="text-xs text-orange-600 mt-0.5">
                  Aparecerá en Costos del mes y afectará la utilidad en el Centro de Costos.
                </p>
              </div>
            </label>
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
  const { business } = useAuth();
  const today = getLocalDateString();
  const [openSession, setOpenSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionPayments, setSessionPayments] = useState({});
  const [sessionMovements, setSessionMovements] = useState({});
  const [dayPayments, setDayPayments] = useState([]);
  const [dayMovements, setDayMovements] = useState([]);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [detailSessionId, setDetailSessionId] = useState(null);
  const [showDayBreakdown, setShowDayBreakdown] = useState(false);
  const [showMovements, setShowMovements] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [voidingPayment, setVoidingPayment] = useState(null);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [voidingMovement, setVoidingMovement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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

    const [openRes, sessionsRes, dayPaymentsRes, dayMovementsRes] = await Promise.all([
      getOpenCashSession(business.id),
      getCashSessionsForDate(business.id, today),
      getCashDayPayments(business.id, today),
      getCashDayMovements(business.id, today),
    ]);

    const firstError = openRes.error || sessionsRes.error || dayPaymentsRes.error;
    if (firstError) {
      setErrorMsg(firstError.message);
      setLoading(false);
      return;
    }

    const sessionsList = sessionsRes.data || [];
    const [paymentsEntries, movementsEntries] = await Promise.all([
      Promise.all(sessionsList.map(async session => {
        const res = await getCashSessionPayments(business.id, session);
        return [session.id, res.error ? [] : (res.data || [])];
      })),
      Promise.all(sessionsList.map(async session => {
        const res = await getCashSessionMovements(business.id, session.id);
        return [session.id, res.error ? [] : (res.data || [])];
      })),
    ]);

    setOpenSession(openRes.data || null);
    setSessions(sessionsList);
    setSessionPayments(Object.fromEntries(paymentsEntries));
    setSessionMovements(Object.fromEntries(movementsEntries));
    setDayPayments(dayPaymentsRes.data || []);
    setDayMovements(dayMovementsRes.data || []);
    setShowOpenForm(sessionsList.length === 0 && !openRes.data);
    setLoading(false);
  }, [business?.id, hasAccess, today]);

  useEffect(() => {
    load();
  }, [load]);

  const currentSession  = openSession || sessions[0] || null;
  const currentPayments = currentSession ? (sessionPayments[currentSession.id] || []) : [];
  const currentMvts     = currentSession ? (sessionMovements[currentSession.id] || []) : [];
  const detailSession   = detailSessionId ? sessions.find(s => s.id === detailSessionId) : null;
  const detailPayments  = detailSession ? (sessionPayments[detailSession.id] || []) : [];
  const detailMvts      = detailSession ? (sessionMovements[detailSession.id] || []) : [];

  const daySummary     = useMemo(() => summarizePayments(dayPayments), [dayPayments]);
  const dayTotal       = useMemo(() => totalPayments(dayPayments), [dayPayments]);
  const dayOutflows    = useMemo(() => totalMovementsOut(dayMovements), [dayMovements]);
  const currentBalance = useMemo(() => calcSessionBalance(currentSession, currentPayments, currentMvts), [currentSession, currentPayments, currentMvts]);
  const detailSummary  = useMemo(() => summarizePayments(detailPayments), [detailPayments]);
  const detailBalance  = useMemo(() => calcSessionBalance(detailSession, detailPayments, detailMvts), [detailSession, detailPayments, detailMvts]);

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

  const handleClose = async (sessionId = openSession?.id) => {
    if (!sessionId) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await closeCashSession(sessionId);
    setBusy(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
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
    setErrorMsg('');
    const { error } = await voidCrmPayment(voidingPayment.id, {
      voidReason: reason,
      voidedBy: business?.userId || null,
    });
    setBusy(false);
    if (error) {
      setErrorMsg(error.message);
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
    setErrorMsg('');
    const { error } = await voidCashMovement(voidingMovement.id, {
      voidReason: reason,
      voidedBy: business?.userId || null,
    });
    setBusy(false);
    if (error) { setErrorMsg(error.message); return; }
    setVoidingMovement(null);
    await load();
  };

  const handleEditSale = (invoiceId) => {
    navigate(`/crm/facturas/${invoiceId}`);
  };

  const openDetail = (sessionId) => {
    setDetailSessionId(sessionId);
    setShowHistory(true);
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
        <div className="mx-auto max-w-5xl space-y-4">
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
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className={`mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                      openSession ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      <Icon name={openSession ? 'UnlockKeyhole' : 'LockKeyhole'} size={13} />
                      Estado: {openSession ? 'Caja abierta' : 'Caja cerrada'}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                      <span className="capitalize">{fmtDate(today)}</span>
                      <span>{currentSession ? turnLabel(currentSession, sessions) : 'Sin caja abierta'}</span>
                    </div>
                    {currentSession && (
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                        <span>
                          Cobros: <strong className="text-emerald-700">{formatMoney(dayTotal, business?.currency)}</strong>
                        </span>
                        {dayOutflows > 0 && (
                          <span>
                            Salidas: <strong className="text-red-600">−{formatMoney(dayOutflows, business?.currency)}</strong>
                          </span>
                        )}
                        <span>
                          Saldo en caja: <strong className="text-gray-900">{formatMoney(currentBalance, business?.currency)}</strong>
                        </span>
                      </div>
                    )}
                    <div className="mt-2 space-y-1 text-xs text-gray-400">
                      <p>La caja registra pagos reales, no ventas pendientes.</p>
                      <p>Puedes abrir mas de una caja por dia para cambios de turno.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
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
                        onClick={() => handleClose(openSession.id)}
                        disabled={busy}
                        className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
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

              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cobros del día</p>
                    <p className="mt-1 text-lg font-black text-emerald-700">{formatMoney(dayTotal, business?.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Salidas del día</p>
                    <p className="mt-1 text-lg font-black text-red-600">{dayOutflows > 0 ? `−${formatMoney(dayOutflows, business?.currency)}` : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Saldo actual</p>
                    <p className="mt-1 text-lg font-black text-gray-900">{formatMoney(currentBalance, business?.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cajas hoy</p>
                    <p className="mt-1 text-lg font-black text-gray-900">{sessions.length}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <SectionButton open={showMovements} onClick={() => setShowMovements(value => !value)}>
                  Ver movimientos
                </SectionButton>
                <SectionButton open={showDayBreakdown} onClick={() => setShowDayBreakdown(value => !value)}>
                  Ver desglose del dia
                </SectionButton>
                <SectionButton open={showHistory} onClick={() => setShowHistory(value => !value)}>
                  Ver historial de cajas
                </SectionButton>
                {openSession && (
                  <button
                    type="button"
                    onClick={() => setShowMovementForm(true)}
                    className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
                  >
                    <Icon name="ArrowUpRight" size={15} />
                    Registrar movimiento
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
                  onConfirm={handleVoidPayment}
                  onCancel={() => setVoidingPayment(null)}
                />
              )}

              {showMovementForm && (
                <CashMovementModal
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
                  onConfirm={handleVoidMovement}
                  onCancel={() => setVoidingMovement(null)}
                />
              )}

              {showMovements && currentSession && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-gray-100 bg-white p-4">
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
              )}

              {showDayBreakdown && (
                <MethodBreakdown summary={daySummary} currency={business?.currency} />
              )}

              {showHistory && (
                <div className="rounded-2xl border border-gray-100 bg-white p-4">
                  {sessions.length === 0 ? (
                    <div className="py-8 text-center">
                      <Icon name="Wallet" size={30} className="mx-auto mb-3 text-gray-200" />
                      <p className="text-sm font-semibold text-gray-600">Todavia no hay cajas abiertas hoy.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {sessions.map(session => {
                        const payments  = sessionPayments[session.id] || [];
                        const movements = sessionMovements[session.id] || [];
                        const total     = calcSessionBalance(session, payments, movements);
                        return (
                          <div key={session.id} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0 text-sm text-gray-700">
                              <span className="font-bold text-gray-900">{turnLabel(session, sessions)}</span>
                              <span className="mx-2 text-gray-300">|</span>
                              <span>{session.status === 'open' ? 'Abierta' : 'Cerrada'}</span>
                              <span className="mx-2 text-gray-300">|</span>
                              <span>{turnTimeRange(session)}</span>
                              <span className="mx-2 text-gray-300">|</span>
                              <span className="font-bold text-gray-900">{formatMoney(total, business?.currency)}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => openDetail(session.id)}
                                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                              >
                                Ver detalle
                              </button>
                              <button
                                onClick={() => setEditingSession(session)}
                                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                              >
                                Editar
                              </button>
                              {session.status === 'open' ? (
                                <button
                                  onClick={() => handleClose(session.id)}
                                  disabled={busy}
                                  className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                                >
                                  Cerrar
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleReopen(session.id)}
                                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                                >
                                  Reabrir
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {detailSession && (
                    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{turnLabel(detailSession, sessions)}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            {turnTimeRange(detailSession)} · Saldo: {formatMoney(detailBalance, business?.currency)}
                          </p>
                        </div>
                        <button
                          onClick={() => setDetailSessionId(null)}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
                        >
                          Ocultar detalle
                        </button>
                      </div>
                      <MethodBreakdown summary={detailSummary} currency={business?.currency} />
                      <MovementsTable
                        payments={detailPayments}
                        movements={detailMvts}
                        currency={business?.currency}
                        onEditPayment={setEditingPayment}
                        onVoidPayment={setVoidingPayment}
                        onVoidMovement={setVoidingMovement}
                        sessionOpen={detailSession?.status === 'open'}
                      />
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
