import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PanelHeader from 'components/ui/PanelHeader';
import Icon from 'components/AppIcon';
import { useAuth } from 'contexts/AuthContext';
import { CRM_EARLY_ACCESS_MODE } from 'config/crmConfig';
import { getEffectivePlanSlug } from 'services/waBusinessService';
import { formatMoney, fmtMoneyInput, parseMoneyInput } from 'utils/formatMoney';
import {
  PAYMENT_METHOD_LABELS,
  closeCashSession,
  getCashDayPayments,
  getCashSessionPayments,
  getCashSessionsForDate,
  getLocalDateString,
  getOpenCashSession,
  openCashSession,
  reopenCashSession,
  updateCashSession,
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

function emptySummary() {
  return Object.fromEntries(METHOD_ORDER.map(method => [method, 0]));
}

function summarizePayments(payments = []) {
  const summary = emptySummary();
  for (const payment of payments) {
    const method = METHOD_ORDER.includes(payment.payment_method) ? payment.payment_method : 'other';
    summary[method] += toNumber(payment.amount);
  }
  return summary;
}

function totalPayments(payments = []) {
  return payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
}

function MethodSummary({ summary, currency }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {METHOD_ORDER.map(method => (
        <div key={method} className="rounded-xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {PAYMENT_METHOD_LABELS[method]}
          </p>
          <p className="mt-2 text-lg font-black text-gray-900">
            {formatMoney(summary[method] || 0, currency)}
          </p>
        </div>
      ))}
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
    <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600" aria-label="Cancelar">
            <Icon name="X" size={16} />
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
            placeholder="Ej: turno tarde"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
        )}
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
  );
}

export default function CrmCash() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const today = getLocalDateString();
  const [openSession, setOpenSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionPayments, setSessionPayments] = useState({});
  const [dayPayments, setDayPayments] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const planSlug = getEffectivePlanSlug(
    business?.planSlug,
    business?.planExpiresAt,
    business?.trialExpiresAt
  );
  const hasAccess = CRM_EARLY_ACCESS_MODE || planSlug === 'business';

  const load = useCallback(async () => {
    if (!business?.id || !hasAccess) return;
    setLoading(true);
    setErrorMsg('');

    const [openRes, sessionsRes, dayRes] = await Promise.all([
      getOpenCashSession(business.id),
      getCashSessionsForDate(business.id, today),
      getCashDayPayments(business.id, today),
    ]);

    const firstError = openRes.error || sessionsRes.error || dayRes.error;
    if (firstError) {
      setErrorMsg(firstError.message);
      setLoading(false);
      return;
    }

    const sessionsList = sessionsRes.data || [];
    const paymentsEntries = await Promise.all(
      sessionsList.map(async session => {
        const paymentsRes = await getCashSessionPayments(business.id, session);
        return [session.id, paymentsRes.error ? [] : (paymentsRes.data || [])];
      })
    );

    const paymentsBySession = Object.fromEntries(paymentsEntries);
    setOpenSession(openRes.data || null);
    setSessions(sessionsList);
    setSessionPayments(paymentsBySession);
    setDayPayments(dayRes.data || []);
    setShowOpenForm(sessionsList.length === 0 && !openRes.data);

    setSelectedSessionId(current => {
      if (openRes.data) return openRes.data.id;
      if (current && sessionsList.some(session => session.id === current)) return current;
      return sessionsList[0]?.id || null;
    });

    setLoading(false);
  }, [business?.id, hasAccess, today]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedSession = useMemo(
    () => sessions.find(session => session.id === selectedSessionId) || openSession || null,
    [sessions, selectedSessionId, openSession]
  );

  const selectedPayments = selectedSession ? (sessionPayments[selectedSession.id] || []) : [];
  const selectedSummary = useMemo(() => summarizePayments(selectedPayments), [selectedPayments]);
  const daySummary = useMemo(() => summarizePayments(dayPayments), [dayPayments]);
  const selectedTotal = useMemo(() => totalPayments(selectedPayments), [selectedPayments]);
  const dayTotal = useMemo(() => totalPayments(dayPayments), [dayPayments]);
  const canOpenNew = !openSession;

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

  const handleClose = async () => {
    if (!openSession?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { error } = await closeCashSession(openSession.id);
    setBusy(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    await load();
  };

  const handleReopen = async (sessionId) => {
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

  if (!hasAccess) {
    return (
      <DashboardAppShell>
        <PanelHeader title="Caja diaria" subtitle="Pagos reales del negocio" />
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
          <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>
            Caja diaria
          </h1>
        }
        subtitle={
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            Puedes abrir mas de una caja en el dia, por ejemplo para cambios de turno.
          </p>
        }
      />

      <DashboardLayoutContent>
        <div className="mx-auto max-w-6xl space-y-5">
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
                  <div>
                    <div className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                      openSession ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      <Icon name={openSession ? 'UnlockKeyhole' : 'LockKeyhole'} size={13} />
                      {openSession ? 'Caja abierta' : 'Caja cerrada'}
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 capitalize">{fmtDate(today)}</h2>
                    <div className="mt-2 space-y-1 text-sm text-gray-500">
                      <p>Solo puede haber una caja abierta a la vez.</p>
                      <p>Reabrir caja permite corregir errores de cierre.</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {openSession ? (
                      <>
                        <button
                          onClick={() => setEditingSession(openSession)}
                          className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                        >
                          <Icon name="Pencil" size={16} />
                          Editar datos de caja
                        </button>
                        <button
                          onClick={handleClose}
                          disabled={busy}
                          className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {busy ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="LockKeyhole" size={16} />}
                          Cerrar caja
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setShowOpenForm(value => !value)}
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
                      >
                        <Icon name="UnlockKeyhole" size={16} />
                        Abrir nueva caja
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {showOpenForm && !openSession && (
                <CashSessionForm
                  title="Abrir nueva caja"
                  busy={busy}
                  submitLabel="Abrir caja"
                  onSubmit={handleOpen}
                  onCancel={sessions.length > 0 ? () => setShowOpenForm(false) : null}
                />
              )}

              {editingSession && (
                <CashSessionForm
                  title="Editar datos de caja"
                  initialValue={editingSession.initial_amount || ''}
                  notesValue={editingSession.notes || ''}
                  busy={busy}
                  submitLabel="Guardar cambios"
                  onSubmit={handleUpdate}
                  onCancel={() => setEditingSession(null)}
                />
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-emerald-600 p-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Total cobrado del dia</p>
                  <p className="mt-2 text-3xl font-black">{formatMoney(dayTotal, business?.currency)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Movimientos del dia</p>
                  <p className="mt-2 text-3xl font-black text-gray-900">{dayPayments.length}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cajas del dia</p>
                  <p className="mt-2 text-3xl font-black text-gray-900">{sessions.length}</p>
                </div>
              </div>

              <MethodSummary summary={daySummary} currency={business?.currency} />

              {selectedSession && (
                <>
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                          selectedSession.status === 'open' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <Icon name={selectedSession.status === 'open' ? 'UnlockKeyhole' : 'LockKeyhole'} size={13} />
                          {selectedSession.status === 'open' ? 'Caja abierta' : 'Caja cerrada'}
                        </div>
                        <h3 className="text-xl font-black text-gray-900">
                          Detalle de turno
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                          <span>Apertura: <strong className="text-gray-700">{fmtTime(selectedSession.opened_at)}</strong></span>
                          {selectedSession.closed_at && (
                            <span>Cierre: <strong className="text-gray-700">{fmtTime(selectedSession.closed_at)}</strong></span>
                          )}
                          <span>Monto inicial: <strong className="text-gray-700">{formatMoney(selectedSession.initial_amount || 0, business?.currency)}</strong></span>
                          {selectedSession.notes && <span>Nota: <strong className="text-gray-700">{selectedSession.notes}</strong></span>}
                        </div>
                      </div>
                      <div className="text-left lg:text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total de esta caja</p>
                        <p className="text-2xl font-black text-gray-900">{formatMoney(selectedTotal, business?.currency)}</p>
                      </div>
                    </div>
                  </div>

                  <MethodSummary summary={selectedSummary} currency={business?.currency} />

                  <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                    <div className="border-b border-gray-100 px-5 py-4">
                      <h3 className="text-sm font-bold text-gray-900">Movimientos de esta caja</h3>
                      <p className="mt-0.5 text-xs text-gray-400">Pagos recibidos entre apertura y cierre del turno.</p>
                    </div>

                    {selectedPayments.length === 0 ? (
                      <div className="px-5 py-12 text-center">
                        <Icon name="ReceiptText" size={34} className="mx-auto mb-3 text-gray-200" />
                        <p className="text-sm font-semibold text-gray-600">Aun no hay pagos recibidos para esta caja.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 text-sm">
                          <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                            <tr>
                              <th className="px-5 py-3">Hora</th>
                              <th className="px-5 py-3">Metodo</th>
                              <th className="px-5 py-3">Referencia / notas</th>
                              <th className="px-5 py-3 text-right">Monto</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedPayments.map(payment => (
                              <tr key={payment.id}>
                                <td className="whitespace-nowrap px-5 py-3 font-medium text-gray-700">{fmtTime(payment.created_at)}</td>
                                <td className="whitespace-nowrap px-5 py-3 text-gray-600">
                                  {PAYMENT_METHOD_LABELS[payment.payment_method] || PAYMENT_METHOD_LABELS.other}
                                </td>
                                <td className="px-5 py-3 text-gray-500">
                                  {payment.reference || payment.notes || '-'}
                                </td>
                                <td className="whitespace-nowrap px-5 py-3 text-right font-bold text-gray-900">
                                  {formatMoney(payment.amount, payment.currency || business?.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="rounded-2xl border border-gray-100 bg-white p-5">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Historial del dia</h3>
                    <p className="mt-0.5 text-xs text-gray-400">Cada tarjeta representa un turno de caja.</p>
                  </div>
                </div>

                {sessions.length === 0 ? (
                  <div className="py-10 text-center">
                    <Icon name="Wallet" size={34} className="mx-auto mb-3 text-gray-200" />
                    <p className="text-sm font-semibold text-gray-600">Todavia no hay cajas abiertas hoy.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {sessions.map((session, index) => {
                      const payments = sessionPayments[session.id] || [];
                      const total = totalPayments(payments);
                      const summary = summarizePayments(payments);
                      const isSelected = selectedSessionId === session.id;
                      return (
                        <div key={session.id} className={`rounded-2xl border p-4 ${isSelected ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-100 bg-white'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className={`mb-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                session.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {session.status === 'open' ? 'Abierta' : 'Cerrada'}
                              </div>
                              <h4 className="text-sm font-black text-gray-900">Caja #{sessions.length - index} / Turno</h4>
                              <p className="mt-1 text-xs text-gray-500">
                                {fmtTime(session.opened_at)} - {session.closed_at ? fmtTime(session.closed_at) : 'ahora'}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                Inicial: {formatMoney(session.initial_amount || 0, business?.currency)}
                              </p>
                              {session.notes && <p className="mt-1 text-xs text-gray-500">Nota: {session.notes}</p>}
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total</p>
                              <p className="text-lg font-black text-gray-900">{formatMoney(total, business?.currency)}</p>
                              <p className="text-xs text-gray-400">{payments.length} mov.</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-1 text-[11px] text-gray-500 sm:grid-cols-5">
                            {METHOD_ORDER.map(method => (
                              <span key={method} className="rounded-lg bg-gray-50 px-2 py-1">
                                {PAYMENT_METHOD_LABELS[method]}: {formatMoney(summary[method] || 0, business?.currency)}
                              </span>
                            ))}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              onClick={() => setSelectedSessionId(session.id)}
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
                            {session.status === 'closed' && (
                              <button
                                onClick={() => handleReopen(session.id)}
                                disabled={busy || !!openSession}
                                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-500"
                                title={openSession ? 'Cierra la caja abierta antes de reabrir otra.' : 'Reabrir caja'}
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
              </div>
            </>
          )}
        </div>
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
