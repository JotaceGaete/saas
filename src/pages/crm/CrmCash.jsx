import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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

function computeExpectedCash(session, payments = [], movements = []) {
  const initial    = toNumber(session?.initial_amount);
  const cashIn     = payments
    .filter(p => !p.voided_at && p.payment_method === 'cash')
    .reduce((s, p) => s + toNumber(p.amount), 0);
  const manualIn   = movements
    .filter(m => !m.voided_at && m.direction === 'in' && (!m.payment_method || m.payment_method === 'cash'))
    .reduce((s, m) => s + toNumber(m.amount), 0);
  const manualOut  = movements
    .filter(m => !m.voided_at && m.direction === 'out' && (!m.payment_method || m.payment_method === 'cash'))
    .reduce((s, m) => s + toNumber(m.amount), 0);
  return initial + cashIn + manualIn - manualOut;
}

// ─── Arqueo Modal (4 pasos — sin cambios) ─────────────────────────────────────

function ArqueoModal({ session, payments, movements, currency, busy, onConfirm, onCancel }) {
  const [step, setStep]           = useState(1);
  const [counted, setCounted]     = useState('');
  const [notes, setNotes]         = useState('');
  const [saveError, setSaveError] = useState('');

  const initial    = toNumber(session?.initial_amount);
  const cashIn     = payments
    .filter(p => !p.voided_at && p.payment_method === 'cash')
    .reduce((s, p) => s + toNumber(p.amount), 0);
  const otherIn    = payments
    .filter(p => !p.voided_at && p.payment_method !== 'cash')
    .reduce((s, p) => s + toNumber(p.amount), 0);
  const manualIn   = movements
    .filter(m => !m.voided_at && m.direction === 'in' && (!m.payment_method || m.payment_method === 'cash'))
    .reduce((s, m) => s + toNumber(m.amount), 0);
  const manualOut  = movements
    .filter(m => !m.voided_at && m.direction === 'out' && (!m.payment_method || m.payment_method === 'cash'))
    .reduce((s, m) => s + toNumber(m.amount), 0);
  const expected   = initial + cashIn + manualIn - manualOut;

  const countedNum = parseMoneyInput(counted);
  const diff       = Number.isFinite(countedNum) ? countedNum - expected : null;

  const diffColor = diff === null
    ? 'text-gray-400'
    : Math.abs(diff) < 1
      ? 'text-emerald-600'
      : Math.abs(diff) < expected * 0.05
        ? 'text-amber-600'
        : 'text-red-600';

  const diffEmoji = diff === null ? '' : Math.abs(diff) < 1 ? '🟢' : Math.abs(diff) < expected * 0.05 ? '🟠' : '🔴';

  const canStep3 = Number.isFinite(countedNum) && countedNum >= 0;
  const needsNote = diff !== null && Math.abs(diff) >= 1;
  const canFinish = canStep3 && (!needsNote || notes.trim().length >= 5);

  const handleConfirm = () => {
    setSaveError('');
    if (!canFinish) {
      setSaveError(needsNote && notes.trim().length < 5
        ? 'La observación es obligatoria cuando hay diferencia.'
        : 'Ingresa el monto contado.');
      return;
    }
    onConfirm({
      expectedCash:   expected,
      countedCash:    countedNum,
      cashDifference: diff,
      closingNotes:   notes.trim() || null,
    });
  };

  const fmt = (v) => formatMoney(v, currency);

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Arqueo de caja</h3>
            <p className="text-xs text-gray-400">Paso {step} de 4</p>
          </div>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <Icon name="X" size={17} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          {[1,2,3,4].map(s => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-gray-900' : 'bg-gray-100'}`} />
          ))}
        </div>

        <div className="px-5 py-4">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Resumen de la caja</p>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                <Row label="Fondo inicial" value={fmt(initial)} />
                <Row label="Cobros en efectivo" value={fmt(cashIn)} color="text-emerald-700" />
                {otherIn > 0 && <Row label="Otros cobros (no efectivo)" value={fmt(otherIn)} color="text-gray-400" note="no afectan caja física" />}
                {manualIn > 0 && <Row label="Entradas manuales (caja)" value={fmt(manualIn)} color="text-emerald-700" />}
                {manualOut > 0 && <Row label="Salidas manuales (caja)" value={`−${fmt(manualOut)}`} color="text-red-600" />}
                <Row label="Efectivo esperado" value={fmt(expected)} bold />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cuenta el efectivo físico</p>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={fmtMoneyInput(counted)}
                  onChange={e => setCounted(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full rounded-xl border border-gray-200 py-3 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              {Number.isFinite(countedNum) && (
                <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Esperado</span>
                    <span className="font-bold text-gray-900">{fmt(expected)}</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-gray-500">Contado</span>
                    <span className="font-bold text-gray-900">{fmt(countedNum)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-gray-200 pt-2">
                    <span className="font-semibold text-gray-700">{diffEmoji} Diferencia</span>
                    <span className={`font-black ${diffColor}`}>
                      {diff > 0 ? '+' : ''}{fmt(diff ?? 0)}
                      {diff > 0 ? ' (sobrante)' : diff < 0 ? ' (faltante)' : ' (cuadra)'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              {needsNote ? (
                <>
                  <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3">
                    <Icon name="AlertTriangle" size={18} className="mt-0.5 shrink-0 text-amber-600" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-800">Diferencia detectada: {diffEmoji} {diff > 0 ? '+' : ''}{fmt(diff)}</p>
                      <p className="text-amber-700">Observación obligatoria.</p>
                    </div>
                  </div>
                  <textarea
                    autoFocus
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Explica la diferencia..."
                    rows={3}
                    className="w-full resize-none rounded-xl border border-gray-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  {notes.trim().length > 0 && notes.trim().length < 5 && (
                    <p className="text-xs text-red-500">Mínimo 5 caracteres.</p>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                    <Icon name="CheckCircle" size={24} className="text-emerald-600" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">La caja cuadra perfectamente 🟢</p>
                  <p className="text-xs text-gray-400">No se requiere observación.</p>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Observación opcional..."
                    rows={2}
                    className="w-full resize-none rounded-xl border border-gray-200 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Confirmar cierre</p>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                <Row label="Efectivo esperado" value={fmt(expected)} />
                <Row label="Efectivo contado" value={fmt(countedNum)} />
                <Row
                  label={`Diferencia ${diffEmoji}`}
                  value={`${diff > 0 ? '+' : ''}${fmt(diff ?? 0)}`}
                  color={diffColor}
                  bold
                />
                {notes.trim() && (
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-500">Observación</span>
                    <span className="max-w-[55%] text-right font-medium text-gray-700">{notes.trim()}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400">
                Estos valores quedarán registrados de forma inmutable. No se pueden modificar después del cierre.
              </p>
              {saveError && <p className="text-xs text-red-500">{saveError}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2 border-t border-gray-100 px-5 py-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              Atrás
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={step === 2 && !canStep3}
              className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-40"
            >
              Siguiente
              <Icon name="ChevronRight" size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || !canFinish}
              className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-40"
            >
              {busy && <Icon name="Loader2" size={15} className="animate-spin" />}
              Cerrar caja
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color = 'text-gray-900', bold = false, note }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="text-gray-500">
        {label}
        {note && <span className="ml-1 text-[10px] text-gray-400">({note})</span>}
      </span>
      <span className={`font-${bold ? 'black' : 'semibold'} ${color}`}>{value}</span>
    </div>
  );
}

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

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const KPI_PALETTES = {
  gray:   { bg: 'bg-white',      border: 'border-gray-100',   iconBg: 'bg-gray-50',     iconColor: 'text-gray-400',    val: 'text-gray-900',    label: 'text-gray-400' },
  green:  { bg: 'bg-white',      border: 'border-emerald-100',iconBg: 'bg-emerald-50',  iconColor: 'text-emerald-500', val: 'text-emerald-700', label: 'text-emerald-400' },
  red:    { bg: 'bg-white',      border: 'border-red-100',    iconBg: 'bg-red-50',      iconColor: 'text-red-400',     val: 'text-red-600',     label: 'text-red-400' },
  blue:   { bg: 'bg-white',      border: 'border-blue-100',   iconBg: 'bg-blue-50',     iconColor: 'text-blue-500',    val: 'text-blue-800',    label: 'text-blue-400' },
  violet: { bg: 'bg-white',      border: 'border-violet-100', iconBg: 'bg-violet-50',   iconColor: 'text-violet-500',  val: 'text-violet-800',  label: 'text-violet-400' },
};

function KpiCard({ label, value, icon, palette = 'gray' }) {
  const p = KPI_PALETTES[palette] || KPI_PALETTES.gray;
  return (
    <div className={`rounded-2xl border ${p.border} ${p.bg} p-4 hover:shadow-md transition-shadow`}>
      <div className={`mb-3 w-9 h-9 rounded-xl flex items-center justify-center ${p.iconBg}`}>
        <Icon name={icon} size={17} className={p.iconColor} />
      </div>
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${p.label}`}>{label}</p>
      <p className={`text-2xl font-black tabular-nums leading-none ${p.val}`}>{value}</p>
    </div>
  );
}

// ─── Cash Timeline ─────────────────────────────────────────────────────────────

function TimelineEntry({ entry, currency, onEditPayment, onVoidPayment, onVoidMovement, sessionOpen, isLast }) {
  const isVoided  = !!entry.voided_at;
  const isPayment = entry._row_kind === 'payment';
  const isOut     = !isPayment && entry.direction === 'out';

  const typeMeta = isPayment
    ? { label: 'Cobro', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'ArrowDownLeft', dotColor: 'bg-emerald-500' }
    : isOut
      ? { label: 'Salida', bg: 'bg-red-50', text: 'text-red-600', icon: 'ArrowUpRight', dotColor: 'bg-red-400' }
      : { label: 'Entrada', bg: 'bg-blue-50', text: 'text-blue-600', icon: 'ArrowDownLeft', dotColor: 'bg-blue-400' };

  const amountColor = isVoided
    ? 'text-gray-300 line-through'
    : isOut
      ? 'text-red-600'
      : 'text-emerald-600';

  return (
    <div className="flex gap-4 group">
      {/* Timeline spine */}
      <div className="flex flex-col items-center shrink-0 pt-1">
        <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-white ${isVoided ? 'bg-gray-200' : typeMeta.dotColor}`} />
        {!isLast && <div className="w-px flex-1 bg-gray-100 mt-1" />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-gray-400 tabular-nums shrink-0">{fmtTime(entry.created_at)}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${typeMeta.bg} ${typeMeta.text} ${isVoided ? 'opacity-50' : ''}`}>
              <Icon name={typeMeta.icon} size={10} />
              {typeMeta.label}
            </span>
            {isVoided && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                <Icon name="Ban" size={9} />
                Anulado
              </span>
            )}
          </div>

          {/* Amount */}
          <span className={`text-base font-black tabular-nums shrink-0 ${amountColor}`}>
            {isVoided ? '' : (isOut ? '−' : '+')}
            {formatMoney(entry.amount, entry.currency || currency)}
          </span>
        </div>

        {/* Detail */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
          {isPayment ? (
            <>
              <span className="font-medium text-gray-600">
                {PAYMENT_METHOD_LABELS[entry.payment_method] || PAYMENT_METHOD_LABELS.other}
              </span>
              {(entry.reference || entry.notes) && (
                <span className="text-gray-400">{entry.reference || entry.notes}</span>
              )}
            </>
          ) : (
            <>
              {entry.reason && <span className="font-medium text-gray-600">{entry.reason}</span>}
              {entry.category && <span className="text-gray-400">{getCashMovementCategoryLabel(entry.category)}</span>}
              {entry.notes && <span className="text-gray-400">{entry.notes}</span>}
            </>
          )}
          {isVoided && entry.void_reason && (
            <span className="text-red-400">Motivo: {entry.void_reason}</span>
          )}
        </div>

        {/* Actions (on hover) */}
        {!isVoided && (
          <div className="mt-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {isPayment ? (
              <>
                <button
                  type="button"
                  onClick={() => onEditPayment?.(entry)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Editar
                </button>
                {sessionOpen ? (
                  <button
                    type="button"
                    onClick={() => onVoidPayment?.(entry)}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Anular
                  </button>
                ) : (
                  <span
                    title="No se pueden anular movimientos de una caja cerrada"
                    className="cursor-not-allowed rounded-lg border border-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-300 select-none"
                  >
                    Anular
                  </span>
                )}
              </>
            ) : (
              sessionOpen ? (
                <button
                  type="button"
                  onClick={() => onVoidMovement?.(entry)}
                  className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50 transition-colors"
                >
                  Anular
                </button>
              ) : (
                <span
                  title="No se pueden anular movimientos de una caja cerrada"
                  className="cursor-not-allowed rounded-lg border border-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-300 select-none"
                >
                  Anular
                </span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CashTimeline({ payments, movements, currency, onEditPayment, onVoidPayment, onVoidMovement, sessionOpen }) {
  const entries = mergeEntries(payments, movements);

  if (entries.length === 0) {
    return (
      <div className="py-14 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
          <Icon name="ReceiptText" size={24} className="text-gray-200" />
        </div>
        <p className="text-sm font-semibold text-gray-500">Sin movimientos en esta caja</p>
        <p className="text-xs text-gray-400 mt-1">Los cobros y movimientos aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="px-1 pt-2">
      {entries.map((entry, idx) => (
        <TimelineEntry
          key={entry.id}
          entry={entry}
          currency={currency}
          onEditPayment={onEditPayment}
          onVoidPayment={onVoidPayment}
          onVoidMovement={onVoidMovement}
          sessionOpen={sessionOpen}
          isLast={idx === entries.length - 1}
        />
      ))}
    </div>
  );
}

// ─── Movements Table (used in history detail) ──────────────────────────────────

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
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-gray-700">
                    <div>{fmtTime(entry.created_at)}</div>
                    {isVoided && (
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        <Icon name="Ban" size={10} />
                        Anulado
                      </span>
                    )}
                  </td>
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
                        <div className="mt-0.5 text-[10px] text-gray-400">{getCashMovementCategoryLabel(entry.category)}</div>
                      </div>
                    ) : (
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600">
                          <Icon name="ArrowDownLeft" size={11} />
                          Entrada
                        </span>
                        <div className="mt-0.5 text-[10px] text-gray-400">{getCashMovementCategoryLabel(entry.category)}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {isPayment ? (
                      <>
                        <div className="text-xs text-gray-500">{PAYMENT_METHOD_LABELS[entry.payment_method] || PAYMENT_METHOD_LABELS.other}</div>
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
                  <td className={`whitespace-nowrap px-5 py-3 text-right font-bold ${amountColor}`}>
                    {!isVoided && amountPrefix}{formatMoney(entry.amount, entry.currency || currency)}
                  </td>
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
                          <span className="cursor-not-allowed rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-300 select-none">
                            Anular
                          </span>
                        )}
                      </div>
                    ) : (
                      sessionOpen ? (
                        <button
                          type="button"
                          onClick={() => onVoidMovement?.(entry)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                        >
                          Anular
                        </button>
                      ) : (
                        <span className="cursor-not-allowed rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-300 select-none">
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

// ─── Modals (sin cambios) ──────────────────────────────────────────────────────

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
      if (!payment?.invoice_id) { setInvoiceItems([]); return; }
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
          <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">
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
          <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">
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

  useEffect(() => { setCategory(''); setIsExpense(false); setError(''); }, [direction]);
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
          <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">
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
          <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50">
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

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'movements', label: 'Movimientos', icon: 'ArrowLeftRight' },
  { id: 'summary',   label: 'Resumen',     icon: 'PieChart'       },
  { id: 'history',   label: 'Historial',   icon: 'History'        },
];

function TabBar({ activeTab, onChange }) {
  return (
    <div className="flex gap-1 border-b border-gray-100 mb-0">
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors rounded-t-xl ${
              isActive
                ? 'text-gray-900'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon name={tab.icon} size={15} className={isActive ? 'text-emerald-500' : 'text-gray-300'} />
            {tab.label}
            {isActive && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function CrmCash() {
  const navigate = useNavigate();
  const { business, user } = useAuth();
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
  const [activeTab, setActiveTab] = useState('movements');
  const [editingPayment, setEditingPayment] = useState(null);
  const [voidingPayment, setVoidingPayment] = useState(null);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [voidingMovement, setVoidingMovement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [arqueoSession, setArqueoSession] = useState(null);

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

  useEffect(() => { load(); }, [load]);

  const currentSession  = openSession || sessions[0] || null;
  const currentPayments = currentSession ? (sessionPayments[currentSession.id] || []) : [];
  const currentMvts     = currentSession ? (sessionMovements[currentSession.id] || []) : [];
  const detailSession   = detailSessionId ? sessions.find(s => s.id === detailSessionId) : null;
  const detailPayments  = detailSession ? (sessionPayments[detailSession.id] || []) : [];
  const detailMvts      = detailSession ? (sessionMovements[detailSession.id] || []) : [];

  const daySummary     = useMemo(() => summarizePayments(dayPayments), [dayPayments]);
  const dayTotal       = useMemo(() => totalPayments(dayPayments), [dayPayments]);
  const dayOutflows    = useMemo(() => totalMovementsOut(dayMovements), [dayMovements]);
  const sessionTotal   = useMemo(() => totalPayments(currentPayments), [currentPayments]);
  const sessionOutflows= useMemo(() => totalMovementsOut(currentMvts), [currentMvts]);
  const currentBalance = useMemo(() => calcSessionBalance(currentSession, currentPayments, currentMvts), [currentSession, currentPayments, currentMvts]);
  const detailSummary  = useMemo(() => summarizePayments(detailPayments), [detailPayments]);
  const detailBalance  = useMemo(() => calcSessionBalance(detailSession, detailPayments, detailMvts), [detailSession, detailPayments, detailMvts]);

  const handleOpen = async ({ initialAmount, notes }) => {
    if (!business?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await openCashSession(business.id, { initialAmount, notes, date: today });
    setBusy(false);
    if (error) { setErrorMsg(error.message); return; }
    setShowOpenForm(false);
    await load();
  };

  const handleClose = (sessionId = openSession?.id) => {
    if (!sessionId) return;
    const target = sessions.find(s => s.id === sessionId) || openSession;
    if (!target) return;
    setArqueoSession(target);
  };

  const handleArqueoConfirm = async ({ expectedCash, countedCash, cashDifference, closingNotes }) => {
    if (!arqueoSession?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await closeCashSession(arqueoSession.id, { expectedCash, countedCash, cashDifference, closingNotes });
    setBusy(false);
    if (error) { setErrorMsg(error.message); return; }
    setArqueoSession(null);
    await load();
  };

  const handleReopen = async (sessionId) => {
    if (openSession) { setErrorMsg('Cierra la caja abierta antes de reabrir otra.'); return; }
    setBusy(true);
    setErrorMsg('');
    const { error } = await reopenCashSession(sessionId);
    setBusy(false);
    if (error) { setErrorMsg(error.message); return; }
    await load();
  };

  const handleUpdate = async ({ initialAmount, notes }) => {
    if (!editingSession?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await updateCashSession(editingSession.id, { initial_amount: initialAmount, notes });
    setBusy(false);
    if (error) { setErrorMsg(error.message); return; }
    setEditingSession(null);
    await load();
  };

  const handleUpdatePayment = async (fields) => {
    if (!editingPayment?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await updateCrmPayment(editingPayment.id, fields);
    setBusy(false);
    if (error) { setErrorMsg(error.message); return; }
    setEditingPayment(null);
    await load();
  };

  const handleVoidPayment = async (reason) => {
    if (!voidingPayment?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await voidCrmPayment(voidingPayment.id, reason, business?.id);
    setBusy(false);
    if (error) {
      setErrorMsg(error.code === 'CASH_SESSION_REQUIRED' ? 'CASH_SESSION_REQUIRED' : (error.message || 'Error al anular el pago.'));
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
    const { error } = await createCashMovement(business.id, { ...fields, sessionId: currentSession.id, month: now.getMonth() + 1, year: now.getFullYear() });
    setBusy(false);
    if (error) { setErrorMsg(error.message); return; }
    setShowMovementForm(false);
    await load();
  };

  const handleVoidMovement = async (reason) => {
    if (!voidingMovement?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await voidCashMovement(voidingMovement.id, { voidReason: reason, voidedBy: business?.userId || null });
    setBusy(false);
    if (error) { setErrorMsg(error.message); return; }
    setVoidingMovement(null);
    await load();
  };

  const handleEditSale = (invoiceId) => navigate(`/crm/facturas/${invoiceId}`);
  const openDetail = (sessionId) => { setDetailSessionId(sessionId); setActiveTab('history'); };

  if (!hasAccess) {
    return (
      <DashboardAppShell>
        <PanelHeader
          title={<><CrmBreadcrumb section="Caja diaria" /><h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Caja diaria</h1></>}
          subtitle={<p className="text-xs capitalize" style={{ color: 'var(--color-muted-foreground)' }}>{fmtDate(today)}</p>}
        />
        <DashboardLayoutContent>
          <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
              <Icon name="Lock" size={24} color="#059669" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Funcionalidad Business</h3>
            <p className="max-w-sm text-sm text-gray-500">Caja diaria requiere plan Business/Full.</p>
            <button onClick={() => navigate('/planes')} className="mt-5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
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
          <p className="text-xs capitalize" style={{ color: 'var(--color-muted-foreground)' }}>{fmtDate(today)}</p>
        }
      />

      <DashboardLayoutContent>
        <div className="mx-auto max-w-5xl space-y-5 pb-10">

          {/* ── Errores ──────────────────────────────────────────────────── */}
          {errorMsg === 'CASH_SESSION_REQUIRED' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-3 text-sm text-amber-800">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <Icon name="AlertTriangle" size={15} className="text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">Para anular un pago de una caja cerrada debes tener una caja abierta.</p>
                </div>
                <button onClick={() => setErrorMsg('')} className="text-amber-400 hover:text-amber-600 shrink-0">
                  <Icon name="X" size={14} />
                </button>
              </div>
              <a href="/crm/caja" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors">
                <Icon name="Landmark" size={12} />
                Abrir caja
              </a>
            </div>
          ) : errorMsg ? (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <Icon name="AlertCircle" size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1">{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-600 shrink-0">
                <Icon name="X" size={14} />
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-emerald-500 border-t-transparent" />
              <p className="text-sm font-medium text-gray-400">Cargando caja…</p>
            </div>
          ) : (
            <>
              {/* ── Hero Header ──────────────────────────────────────────────── */}
              <div
                className="rounded-3xl overflow-hidden border border-gray-100 shadow-sm"
                style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 60%, #f0fdf4 100%)' }}
              >
                {/* Top bar */}
                <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4">
                  {/* Left: title + metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      {/* Status badge */}
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ring-1 ${
                        openSession
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-gray-100 text-gray-500 ring-gray-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${openSession ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {openSession ? 'Caja abierta' : 'Caja cerrada'}
                      </span>
                      {currentSession && (
                        <span className="text-sm font-semibold text-gray-600">
                          {turnLabel(currentSession, sessions)}
                        </span>
                      )}
                    </div>

                    <h2 className="text-3xl font-black text-gray-900 leading-none mb-2" style={{ letterSpacing: '-0.03em' }}>
                      Caja diaria
                    </h2>

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1.5 capitalize font-medium text-gray-600">
                        <Icon name="Calendar" size={12} className="text-gray-300" />
                        {fmtDate(today)}
                      </span>
                      {currentSession && (
                        <>
                          <span className="text-gray-200">·</span>
                          <span className="flex items-center gap-1.5">
                            <Icon name="Clock" size={12} className="text-gray-300" />
                            Apertura: <strong className="text-gray-600 ml-0.5">{fmtTime(currentSession.opened_at)}</strong>
                          </span>
                          <span className="text-gray-200">·</span>
                          <span className="flex items-center gap-1.5">
                            <Icon name="User" size={12} className="text-gray-300" />
                            <span className="text-gray-500">
                              {currentSession.opened_by === user?.id
                                ? (user?.user_metadata?.name || user?.email || '—')
                                : 'otro usuario'}
                            </span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {!openSession && (
                      <button
                        onClick={() => setShowOpenForm(true)}
                        className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-95"
                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 16px rgba(16,185,129,0.30)' }}
                      >
                        <Icon name="Plus" size={15} />
                        Abrir caja
                      </button>
                    )}
                    {openSession && (
                      <button
                        onClick={() => handleClose(openSession.id)}
                        disabled={busy}
                        className="flex items-center gap-2 px-4 h-10 rounded-xl bg-gray-900 text-sm font-bold text-white hover:bg-gray-800 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
                      >
                        <Icon name="LockKeyhole" size={14} />
                        Cerrar caja
                      </button>
                    )}
                    {currentSession && (
                      <button
                        onClick={() => setEditingSession(currentSession)}
                        className="flex items-center gap-2 px-4 h-10 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all hover:-translate-y-0.5 active:scale-95"
                      >
                        <Icon name="Pencil" size={14} />
                        Editar
                      </button>
                    )}
                    {currentSession?.status === 'closed' && (
                      <button
                        onClick={() => handleReopen(currentSession.id)}
                        className="flex items-center gap-2 px-4 h-10 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-all hover:-translate-y-0.5 active:scale-95"
                      >
                        <Icon name="RotateCcw" size={14} />
                        Reabrir
                      </button>
                    )}
                  </div>
                </div>

                {/* Metrics strip */}
                {currentSession && (
                  <div className="flex flex-wrap gap-x-8 gap-y-2 px-6 pb-5 border-t border-gray-100/60 pt-4">
                    {toNumber(currentSession.initial_amount) > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Fondo inicial</p>
                        <p className="text-xl font-black text-gray-700 tabular-nums">
                          {formatMoney(toNumber(currentSession.initial_amount), business?.currency)}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-0.5">Cobros</p>
                      <p className="text-xl font-black text-emerald-600 tabular-nums">
                        {formatMoney(sessionTotal, business?.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-0.5">Salidas</p>
                      <p className="text-xl font-black text-red-500 tabular-nums">
                        {sessionOutflows > 0 ? `−${formatMoney(sessionOutflows, business?.currency)}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Saldo en caja</p>
                      <p className="text-2xl font-black text-gray-900 tabular-nums" style={{ letterSpacing: '-0.02em' }}>
                        {formatMoney(currentBalance, business?.currency)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── KPI Cards ──────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <KpiCard label="Fondo inicial" value={formatMoney(toNumber(currentSession?.initial_amount), business?.currency)} icon="Wallet" palette="gray" />
                <KpiCard label="Cobros del turno" value={formatMoney(sessionTotal, business?.currency)} icon="TrendingUp" palette="green" />
                <KpiCard label="Salidas" value={sessionOutflows > 0 ? `−${formatMoney(sessionOutflows, business?.currency)}` : '—'} icon="TrendingDown" palette="red" />
                <KpiCard label="Saldo disponible" value={formatMoney(currentBalance, business?.currency)} icon="CreditCard" palette="blue" />
                <KpiCard label="Cajas hoy" value={sessions.length} icon="CalendarDays" palette="violet" />
              </div>

              {/* ── Tab panel ──────────────────────────────────────────────── */}
              <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
                {/* Tab header */}
                <div className="flex items-center justify-between gap-3 px-4 pt-1 border-b border-gray-100">
                  <TabBar activeTab={activeTab} onChange={setActiveTab} />

                  {/* Registrar movimiento — only when caja open */}
                  {openSession && activeTab === 'movements' && (
                    <button
                      type="button"
                      onClick={() => setShowMovementForm(true)}
                      className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
                    >
                      <Icon name="ArrowLeftRight" size={13} />
                      Registrar movimiento
                    </button>
                  )}
                </div>

                {/* Tab content */}
                <div className="p-5">
                  <AnimatePresence mode="wait">
                    {activeTab === 'movements' && (
                      <motion.div
                        key="movements"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                      >
                        {currentSession ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-gray-900">{turnLabel(currentSession, sessions)}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {turnTimeRange(currentSession)} · Saldo: {formatMoney(currentBalance, business?.currency)}
                                </p>
                              </div>
                            </div>
                            <CashTimeline
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
                          <div className="py-12 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                              <Icon name="Wallet" size={22} className="text-gray-200" />
                            </div>
                            <p className="text-sm font-semibold text-gray-500">No hay caja activa hoy</p>
                            <button
                              onClick={() => setShowOpenForm(true)}
                              className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 mx-auto transition-colors"
                            >
                              <Icon name="Plus" size={14} />
                              Abrir caja
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {activeTab === 'summary' && (
                      <motion.div
                        key="summary"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4"
                      >
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Por método de pago — resumen del día</p>
                        <MethodBreakdown summary={daySummary} currency={business?.currency} />
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Total cobrado hoy</p>
                            <p className="text-2xl font-black text-gray-900 tabular-nums">{formatMoney(dayTotal, business?.currency)}</p>
                          </div>
                          {dayOutflows > 0 && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-0.5">Salidas del día</p>
                              <p className="text-2xl font-black text-red-600 tabular-nums">−{formatMoney(dayOutflows, business?.currency)}</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {activeTab === 'history' && (
                      <motion.div
                        key="history"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="space-y-4"
                      >
                        {sessions.length === 0 ? (
                          <div className="py-12 text-center">
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                              <Icon name="Wallet" size={22} className="text-gray-200" />
                            </div>
                            <p className="text-sm text-gray-400">Todavía no hay cajas abiertas hoy.</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {sessions.map(session => {
                              const payments  = sessionPayments[session.id] || [];
                              const movements = sessionMovements[session.id] || [];
                              const total     = calcSessionBalance(session, payments, movements);
                              const isOpen    = session.status === 'open';
                              return (
                                <div key={session.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between first:pt-0 last:pb-0">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-sm text-gray-900">{turnLabel(session, sessions)}</span>
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${
                                        isOpen ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-gray-100 text-gray-500 ring-gray-200'
                                      }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                        {isOpen ? 'Abierta' : 'Cerrada'}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mt-1">
                                      <span>{turnTimeRange(session)}</span>
                                      <span>Inicial: {formatMoney(toNumber(session.initial_amount), business?.currency)}</span>
                                      <span className="font-semibold text-gray-700">Saldo: {formatMoney(total, business?.currency)}</span>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      onClick={() => openDetail(session.id)}
                                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                      Ver detalle
                                    </button>
                                    <button
                                      onClick={() => setEditingSession(session)}
                                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                      Editar
                                    </button>
                                    {isOpen ? (
                                      <button
                                        onClick={() => handleClose(session.id)}
                                        disabled={busy}
                                        className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                                      >
                                        Cerrar
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleReopen(session.id)}
                                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
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

                        {/* Session detail */}
                        {detailSession && (
                          <div className="space-y-3 border-t border-gray-100 pt-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-gray-900">{turnLabel(detailSession, sessions)}</p>
                                <p className="mt-0.5 text-xs text-gray-400">
                                  {turnTimeRange(detailSession)} · Inicial: {formatMoney(toNumber(detailSession.initial_amount), business?.currency)} · Saldo: {formatMoney(detailBalance, business?.currency)}
                                </p>
                              </div>
                              <button
                                onClick={() => setDetailSessionId(null)}
                                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                              >
                                Ocultar
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* ── Info box ──────────────────────────────────────────────── */}
              <div className="rounded-2xl border border-blue-100 bg-[#EFF6FF] p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon name="Info" size={15} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-900">Cada caja es independiente</p>
                  <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                    Los saldos no se combinan entre cajas. Esto permite llevar un control preciso por turno o por responsable.
                  </p>
                </div>
              </div>

              {/* ── Modales ───────────────────────────────────────────────── */}
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
              {arqueoSession && (
                <ArqueoModal
                  session={arqueoSession}
                  payments={sessionPayments[arqueoSession.id] || []}
                  movements={sessionMovements[arqueoSession.id] || []}
                  currency={business?.currency}
                  busy={busy}
                  onConfirm={handleArqueoConfirm}
                  onCancel={() => setArqueoSession(null)}
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
                  payment={{ ...voidingMovement, payment_method: 'cash', invoice_id: null }}
                  currency={business?.currency}
                  busy={busy}
                  onConfirm={handleVoidMovement}
                  onCancel={() => setVoidingMovement(null)}
                />
              )}
            </>
          )}
        </div>
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
