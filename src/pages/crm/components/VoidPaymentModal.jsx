import React, { useState } from 'react';
import Icon from 'components/AppIcon';
import { formatMoney } from '../../../utils/formatMoney';

const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo',
  bank_transfer: 'Transferencia',
  card: 'Tarjeta',
  check: 'Cheque',
  credit: 'Cta. cte.',
  other: 'Otro',
};

/**
 * Modal de anulación de pago.
 * Props:
 *   payment  — objeto crm_payments
 *   currency — string (ej: 'CLP')
 *   busy     — boolean
 *   error    — string | null
 *   onConfirm(reason: string) — callback
 *   onCancel() — callback
 */
export default function VoidPaymentModal({ payment, currency, busy, error, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');

  if (!payment) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) { setLocalError('El motivo es obligatorio.'); return; }
    onConfirm(reason.trim());
  };

  const displayError = error || localError;

  const fmtTime = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Icon name="Ban" size={15} className="text-red-500" />
            Anular pago
          </h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600" aria-label="Cancelar">
            <Icon name="X" size={17} />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">¿Anular este pago?</p>
          <p className="mt-1 text-red-700">
            {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}
            {' — '}
            <strong>{formatMoney(payment.amount, payment.currency || currency)}</strong>
          </p>
          <p className="mt-0.5 text-xs text-red-600">{fmtTime(payment.created_at)}</p>
          <p className="mt-1.5 text-xs text-red-600">
            El pago quedará en el historial marcado como anulado y no contará en los totales ni en la caja.
          </p>
        </div>

        {payment.invoice_id && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-semibold">Este pago está asociado a una nota de venta.</p>
            <p className="mt-1">La anulación recalculará automáticamente el estado de la nota.</p>
          </div>
        )}

        {displayError === 'CASH_SESSION_REQUIRED' ? (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
            <div className="flex items-start gap-2 text-sm text-amber-800">
              <Icon name="AlertTriangle" size={14} className="shrink-0 mt-0.5" />
              <span className="font-semibold">Debes abrir una caja antes de anular un pago de una sesión cerrada.</span>
            </div>
            <a href="/crm/caja" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors">
              <Icon name="Landmark" size={12} />
              Abrir caja
            </a>
          </div>
        ) : displayError ? (
          <p className="mb-3 text-xs text-red-500">{displayError}</p>
        ) : null}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">
            Motivo de anulación <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={e => { setReason(e.target.value); setLocalError(''); }}
            placeholder="Ej: Pago duplicado, monto incorrecto, cliente solicitó reverso…"
            autoFocus
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
          />
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
