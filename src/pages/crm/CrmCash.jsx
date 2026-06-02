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
  getCashSessionPayments,
  getLatestCashSessionForDate,
  getLocalDateString,
  getOpenCashSession,
  openCashSession,
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

export default function CrmCash() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const today = getLocalDateString();
  const [session, setSession] = useState(null);
  const [payments, setPayments] = useState([]);
  const [initialAmount, setInitialAmount] = useState('');
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

    const openRes = await getOpenCashSession(business.id, today);
    if (openRes.error) {
      setErrorMsg(openRes.error.message);
      setLoading(false);
      return;
    }

    let activeSession = openRes.data;
    if (!activeSession) {
      const latestRes = await getLatestCashSessionForDate(business.id, today);
      if (latestRes.error) {
        setErrorMsg(latestRes.error.message);
        setLoading(false);
        return;
      }
      activeSession = latestRes.data;
    }

    setSession(activeSession || null);

    if (activeSession?.date) {
      const paymentsRes = await getCashSessionPayments(business.id, activeSession.date);
      if (paymentsRes.error) {
        setErrorMsg(paymentsRes.error.message);
        setPayments([]);
      } else {
        setPayments(paymentsRes.data || []);
      }
    } else {
      setPayments([]);
    }

    setLoading(false);
  }, [business?.id, hasAccess, today]);

  useEffect(() => {
    load();
  }, [load]);

  const totalCollected = useMemo(
    () => payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0),
    [payments]
  );

  const summary = useMemo(() => {
    const totals = Object.fromEntries(METHOD_ORDER.map(method => [method, 0]));
    for (const payment of payments) {
      const method = METHOD_ORDER.includes(payment.payment_method) ? payment.payment_method : 'other';
      totals[method] += toNumber(payment.amount);
    }
    return totals;
  }, [payments]);

  const handleOpen = async () => {
    if (!business?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { data, error } = await openCashSession(business.id, {
      initialAmount: parseMoneyInput(initialAmount),
      date: today,
    });
    setBusy(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setSession(data);
    setPayments([]);
  };

  const handleClose = async () => {
    if (!session?.id) return;
    setBusy(true);
    setErrorMsg('');
    const { data, error } = await closeCashSession(session.id);
    setBusy(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setSession(data);
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

  const isOpen = session?.status === 'open';
  const isClosedSession = session?.status === 'closed';

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
            La caja registra pagos reales, no ventas pendientes.
          </p>
        }
      />

      <DashboardLayoutContent>
        <div className="mx-auto max-w-5xl space-y-5">
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
          ) : !isOpen && !isClosedSession ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
                    <Icon name="LockKeyhole" size={13} />
                    Caja cerrada
                  </div>
                  <h2 className="text-2xl font-black text-gray-900">Abre la caja de hoy</h2>
                  <p className="mt-1 text-sm capitalize text-gray-500">{fmtDate(today)}</p>
                  <p className="mt-4 max-w-md text-sm text-gray-500">
                    La caja registra pagos reales, no ventas pendientes.
                  </p>
                </div>
                <div className="w-full rounded-xl border border-gray-100 bg-gray-50 p-4 sm:max-w-xs">
                  <label className="mb-1.5 block text-xs font-semibold text-gray-500">Monto inicial opcional</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={fmtMoneyInput(initialAmount)}
                      onChange={e => setInitialAmount(e.target.value.replace(/\D/g, ''))}
                      placeholder="0"
                      className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    onClick={handleOpen}
                    disabled={busy}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="UnlockKeyhole" size={16} />}
                    Abrir caja
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                      isOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      <Icon name={isOpen ? 'UnlockKeyhole' : 'LockKeyhole'} size={13} />
                      {isOpen ? 'Caja abierta' : 'Caja cerrada'}
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 capitalize">{fmtDate(session.date)}</h2>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                      <span>Apertura: <strong className="text-gray-700">{fmtTime(session.opened_at)}</strong></span>
                      {session.closed_at && (
                        <span>Cierre: <strong className="text-gray-700">{fmtTime(session.closed_at)}</strong></span>
                      )}
                      <span>Monto inicial: <strong className="text-gray-700">{formatMoney(session.initial_amount || 0, business?.currency)}</strong></span>
                    </div>
                  </div>
                  {isOpen && (
                    <button
                      onClick={handleClose}
                      disabled={busy}
                      className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                      {busy ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="LockKeyhole" size={16} />}
                      Cerrar caja
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-emerald-600 p-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Total cobrado hoy</p>
                  <p className="mt-2 text-3xl font-black">{formatMoney(totalCollected, business?.currency)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Movimientos</p>
                  <p className="mt-2 text-3xl font-black text-gray-900">{payments.length}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Estado</p>
                  <p className="mt-2 text-2xl font-black text-gray-900">{isOpen ? 'Abierta' : 'Cerrada'}</p>
                </div>
              </div>

              <MethodSummary summary={summary} currency={business?.currency} />

              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h3 className="text-sm font-bold text-gray-900">Movimientos del dia</h3>
                  <p className="mt-0.5 text-xs text-gray-400">Desde crm_payments con estado received.</p>
                </div>

                {payments.length === 0 ? (
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
                        {payments.map(payment => (
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
        </div>
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
