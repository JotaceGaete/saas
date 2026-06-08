import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { formatMoney } from '../../utils/formatMoney';
import {
  getOpenCashSession,
  openCashSession,
  closeCashSession,
  getPaymentsForSession,
  getRecentCashSessions,
} from '../../services/crmService';

const PAYMENT_LABELS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  otro: 'Otro',
};

const PAYMENT_ICONS = {
  efectivo: 'Banknote',
  transferencia: 'ArrowRightLeft',
  tarjeta: 'CreditCard',
  cheque: 'FileText',
  otro: 'CircleDollarSign',
};

const PAYMENT_COLORS = {
  efectivo: '#059669',
  transferencia: '#2563eb',
  tarjeta: '#7c3aed',
  cheque: '#0891b2',
  otro: '#d97706',
};

const METHOD_ORDER = ['efectivo', 'tarjeta', 'transferencia', 'cheque', 'otro'];

function fmt(dt, mode = 'time') {
  if (!dt) return '—';
  const d = new Date(dt);
  if (mode === 'time') return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  if (mode === 'date') return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const RLS_SQL = `-- Políticas RLS para crm_cash_sessions
ALTER TABLE crm_cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select" ON crm_cash_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM wa_businesses WHERE id = business_id AND user_id = auth.uid())
  );

CREATE POLICY "owner insert" ON crm_cash_sessions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM wa_businesses WHERE id = business_id AND user_id = auth.uid())
  );

CREATE POLICY "owner update" ON crm_cash_sessions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM wa_businesses WHERE id = business_id AND user_id = auth.uid())
  );

CREATE POLICY "owner delete" ON crm_cash_sessions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM wa_businesses WHERE id = business_id AND user_id = auth.uid())
  );`;

export default function CrmCaja() {
  const { business, user } = useAuth();
  const navigate = useNavigate();
  const currency = business?.currency;

  const [session, setSession] = useState(null);
  const [payments, setPayments] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);
  const [rlsError, setRlsError] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [closedSession, setClosedSession] = useState(null); // summary after closing

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [sess, recent] = await Promise.all([
        getOpenCashSession(business.id),
        getRecentCashSessions(business.id, 10),
      ]);
      setSession(sess);
      setRecentSessions(recent);
      if (sess) {
        const pmts = await getPaymentsForSession(business.id, sess.id);
        setPayments(pmts);
      } else {
        setPayments([]);
      }
    } catch (err) {
      const msg = err?.message || '';
      const code = err?.code || err?.details || '';
      if (code === '42P01' || msg.includes('relation') && msg.includes('does not exist')) {
        setTableError(true);
      } else if (code === '42501' || msg.includes('row-level security') || msg.includes('policy') || msg.includes('permission denied')) {
        setRlsError(true);
      } else {
        // Show raw error so we can diagnose
        setError(`[${code || '?'}] ${msg || 'Error desconocido al cargar la caja'}`);
      }
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  // Refresh payments every 30s while session is open
  useEffect(() => {
    if (!session) return;
    const id = setInterval(async () => {
      try {
        const pmts = await getPaymentsForSession(business.id, session.id);
        setPayments(pmts);
      } catch (_) {}
    }, 30000);
    return () => clearInterval(id);
  }, [session, business?.id]);

  const handleOpen = async () => {
    setSubmitting(true);
    setError(null);
    setRlsError(false);
    try {
      const initial = openingAmount !== '' ? parseFloat(openingAmount) : null;
      await openCashSession(business.id, { openedBy: user?.id, initialAmount: initial });
      setOpeningAmount('');
      setClosedSession(null);
      await load();
    } catch (err) {
      if (err?.code === '42501' || err?.message?.includes('row-level security') || err?.message?.includes('policy')) {
        setRlsError(true);
      } else {
        setError(err?.message || 'Error al abrir caja');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await closeCashSession(session.id);
      setShowCloseConfirm(false);
      // Save summary before resetting
      setClosedSession({ ...session, closed_at: new Date().toISOString(), payments: [...payments] });
      await load();
    } catch (err) {
      setError(err?.message || 'Error al cerrar caja');
    } finally {
      setSubmitting(false);
    }
  };

  // Totals helpers
  const summaryByMethod = (pmts) =>
    pmts.reduce((acc, p) => {
      const m = p.payment_method || 'otro';
      if (!acc[m]) acc[m] = { count: 0, total: 0 };
      acc[m].count += 1;
      acc[m].total += Number(p.amount) || 0;
      return acc;
    }, {});

  const grandTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const summary = summaryByMethod(payments);

  // ── Error states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <Icon name="Loader2" size={24} color="#6b7280" className="animate-spin" />
      </div>
    );
  }

  if (tableError) {
    return (
      <PageShell navigate={navigate}>
        <ErrorCard icon="AlertTriangle" color="#d97706" bg="#fef3c7" border="#fcd34d" title="Tabla no encontrada">
          <p style={{ fontSize: 13, color: '#78350f', margin: '0 0 12px' }}>
            Ejecuta este SQL en Supabase para crear la tabla <code>crm_cash_sessions</code>:
          </p>
          <SqlBlock>{`CREATE TABLE crm_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES wa_businesses(id) ON DELETE CASCADE,
  date date NOT NULL,
  opened_by uuid REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  initial_amount numeric(12,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON crm_cash_sessions(business_id, status);
CREATE INDEX ON crm_cash_sessions(business_id, opened_at);

${RLS_SQL}`}</SqlBlock>
        </ErrorCard>
      </PageShell>
    );
  }

  if (rlsError) {
    return (
      <PageShell navigate={navigate}>
        <ErrorCard icon="ShieldAlert" color="#dc2626" bg="#fee2e2" border="#fca5a5" title="Sin permiso (RLS)">
          <p style={{ fontSize: 13, color: '#7f1d1d', margin: '0 0 12px' }}>
            La tabla existe pero le faltan las políticas de seguridad. Ejecuta en Supabase:
          </p>
          <SqlBlock>{RLS_SQL}</SqlBlock>
        </ErrorCard>
      </PageShell>
    );
  }

  // ── Closed session summary ────────────────────────────────────────────────

  if (closedSession && !session) {
    const cs = closedSession;
    const csTotal = (cs.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const csSummary = summaryByMethod(cs.payments || []);
    return (
      <PageShell navigate={navigate}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
          {/* Summary header */}
          <div style={{ backgroundColor: '#f0fdf4', borderBottom: '1px solid #bbf7d0', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="CheckCircle2" size={18} color="#059669" />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#065f46', margin: 0 }}>Caja cerrada</p>
                <p style={{ fontSize: 12, color: '#047857', margin: 0 }}>{fmt(cs.opened_at, 'date')}</p>
              </div>
            </div>
          </div>

          <div style={{ padding: '20px 24px' }}>
            <SummaryRow label="Apertura" value={fmt(cs.opened_at)} />
            <SummaryRow label="Cierre" value={fmt(cs.closed_at || new Date())} />
            {cs.initial_amount != null && (
              <SummaryRow label="Monto inicial" value={formatMoney(cs.initial_amount, currency)} />
            )}
            <div style={{ borderTop: '1px dashed #e5e7eb', margin: '12px 0' }} />
            <SummaryRow label="Total cobrado" value={formatMoney(csTotal, currency)} bold green />
            <div style={{ borderTop: '1px dashed #e5e7eb', margin: '12px 0' }} />
            {METHOD_ORDER.filter(m => csSummary[m]).map(m => (
              <SummaryRow
                key={m}
                label={`· ${PAYMENT_LABELS[m]}`}
                value={`${formatMoney(csSummary[m].total, currency)}  (${csSummary[m].count})`}
                color={PAYMENT_COLORS[m]}
              />
            ))}
            <div style={{ borderTop: '1px dashed #e5e7eb', margin: '12px 0' }} />
            <SummaryRow label="Movimientos totales" value={(cs.payments || []).length} />
          </div>

          <div style={{ padding: '0 24px 24px' }}>
            <button
              onClick={() => { setClosedSession(null); }}
              style={{
                width: '100%', padding: '10px 0', backgroundColor: '#059669', border: 'none',
                borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Abrir nueva caja
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── MAIN VIEW ─────────────────────────────────────────────────────────────

  return (
    <PageShell navigate={navigate}>
      {error && (
        <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* ── CAJA CERRADA ── */}
      {!session && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Open form card */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="Lock" size={18} color="#9ca3af" />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Caja cerrada</p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                    Registra pagos reales del día. No suma ventas pendientes.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Monto inicial en caja (opcional)
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingAmount}
                  onChange={e => setOpeningAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !submitting && handleOpen()}
                  placeholder="0"
                  style={{
                    flex: 1, padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 8,
                    fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleOpen}
                  disabled={submitting}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px',
                    backgroundColor: '#059669', border: 'none', borderRadius: 8,
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    opacity: submitting ? 0.7 : 1, whiteSpace: 'nowrap',
                  }}
                >
                  <Icon name="Unlock" size={14} color="currentColor" />
                  {submitting ? 'Abriendo...' : 'Abrir caja'}
                </button>
              </div>
            </div>
          </div>

          {/* Recent sessions */}
          {recentSessions.filter(s => s.status === 'closed').length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>
                Historial de cajas
              </p>
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                {recentSessions.filter(s => s.status === 'closed').map((s, i, arr) => (
                  <div key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px', borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
                    fontSize: 13,
                  }}>
                    <span style={{ color: '#374151', fontWeight: 500 }}>{fmt(s.date || s.opened_at, 'date')}</span>
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>{fmt(s.opened_at)} → {fmt(s.closed_at)}</span>
                    <span style={{ color: '#d1d5db', fontSize: 11, backgroundColor: '#f9fafb', padding: '2px 8px', borderRadius: 20 }}>
                      Cerrada
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CAJA ABIERTA ── */}
      {session && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Status banner */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
            backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 14, padding: '14px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#059669', boxShadow: '0 0 0 3px #a7f3d0' }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#065f46', margin: 0 }}>Caja abierta</p>
                <p style={{ fontSize: 12, color: '#047857', margin: 0 }}>
                  Desde las {fmt(session.opened_at)}
                  {session.initial_amount != null && ` · Apertura ${formatMoney(session.initial_amount, currency)}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCloseConfirm(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                backgroundColor: '#fff', border: '1.5px solid #6ee7b7', borderRadius: 9,
                fontSize: 12, fontWeight: 700, color: '#065f46', cursor: 'pointer',
              }}
            >
              <Icon name="Lock" size={13} color="currentColor" />
              Cerrar caja
            </button>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 }}>
            {/* Grand total */}
            <div style={{
              gridColumn: '1 / -1', backgroundColor: '#fff', border: '1px solid #e5e7eb',
              borderRadius: 12, padding: '16px 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Total cobrado hoy
                </p>
                <p style={{ fontSize: 28, fontWeight: 800, color: '#059669', margin: 0 }}>
                  {formatMoney(grandTotal, currency)}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#d1d5db', margin: 0 }}>{payments.length}</p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>movimientos</p>
              </div>
            </div>

            {/* Per-method */}
            {METHOD_ORDER.filter(m => summary[m]).map(m => (
              <div key={m} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    backgroundColor: `${PAYMENT_COLORS[m]}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name={PAYMENT_ICONS[m]} size={14} color={PAYMENT_COLORS[m]} />
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: 0 }}>{PAYMENT_LABELS[m]}</p>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 1px' }}>
                  {formatMoney(summary[m].total, currency)}
                </p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
                  {summary[m].count} {summary[m].count === 1 ? 'pago' : 'pagos'}
                </p>
              </div>
            ))}

            {/* Initial amount card if set */}
            {session.initial_amount != null && (
              <div style={{ backgroundColor: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: 12, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', margin: '0 0 4px' }}>Monto inicial</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#6b7280', margin: 0 }}>
                  {formatMoney(session.initial_amount, currency)}
                </p>
              </div>
            )}
          </div>

          {/* Payments list */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>Movimientos del día</h3>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>Se actualiza cada 30 seg</span>
            </div>
            {payments.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center' }}>
                <Icon name="Inbox" size={28} color="#d1d5db" />
                <p style={{ fontSize: 13, color: '#9ca3af', margin: '8px 0 0' }}>
                  Aún no hay pagos en esta sesión
                </p>
              </div>
            ) : (
              payments.map((p, i) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                  borderBottom: i < payments.length - 1 ? '1px solid #f9fafb' : 'none',
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    backgroundColor: `${PAYMENT_COLORS[p.payment_method] || '#9ca3af'}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name={PAYMENT_ICONS[p.payment_method] || 'CircleDollarSign'} size={15} color={PAYMENT_COLORS[p.payment_method] || '#9ca3af'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>
                      {PAYMENT_LABELS[p.payment_method] || p.payment_method}
                    </p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fmt(p.created_at)}{p.reference ? ` · ${p.reference}` : ''}{p.notes ? ` · ${p.notes}` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#059669', flexShrink: 0 }}>
                    +{formatMoney(p.amount, currency)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Quick link to TPV */}
          <button
            onClick={() => navigate('/crm/terminal')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px', backgroundColor: '#f9fafb', border: '1.5px dashed #d1d5db',
              borderRadius: 12, color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Icon name="ShoppingCart" size={15} color="currentColor" />
            Ir al Terminal TPV para registrar una venta
          </button>
        </div>
      )}

      {/* ── CLOSE CONFIRM MODAL ── */}
      {showCloseConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Icon name="Lock" size={22} color="#d97706" />
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>¿Cerrar la caja?</h2>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
                Resumen al cierre:
              </p>
            </div>

            {/* Close summary */}
            <div style={{ backgroundColor: '#f9fafb', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <SummaryRow label="Apertura" value={fmt(session.opened_at)} />
              <SummaryRow label="Cierre" value={fmt(new Date())} />
              {session.initial_amount != null && <SummaryRow label="Monto inicial" value={formatMoney(session.initial_amount, currency)} />}
              <div style={{ borderTop: '1px dashed #e5e7eb', margin: '8px 0' }} />
              <SummaryRow label="Total cobrado" value={formatMoney(grandTotal, currency)} bold green />
              {METHOD_ORDER.filter(m => summary[m]).map(m => (
                <SummaryRow
                  key={m}
                  label={`· ${PAYMENT_LABELS[m]}`}
                  value={`${formatMoney(summary[m].total, currency)} (${summary[m].count})`}
                  color={PAYMENT_COLORS[m]}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowCloseConfirm(false)}
                style={{ flex: 1, padding: '10px 0', border: '1.5px solid #d1d5db', borderRadius: 10, backgroundColor: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleClose}
                disabled={submitting}
                style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 10, backgroundColor: '#d97706', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? 'Cerrando...' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

// ── Small reusable components ─────────────────────────────────────────────────

function PageShell({ navigate, children }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button
          onClick={() => navigate('/crm')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#6b7280' }}
        >
          <Icon name="ArrowLeft" size={18} color="currentColor" />
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Caja diaria</h1>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
            {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, bold, green, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, margin: '4px 0', fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ color: green ? '#059669' : color || '#111827', fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function ErrorCard({ icon, color, bg, border, title, children }) {
  return (
    <div style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: 12, padding: 24 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Icon name={icon} size={20} color={color} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 10px', color }}>{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function SqlBlock({ children }) {
  return (
    <pre style={{
      fontSize: 11, backgroundColor: '#fff', border: '1px solid #e5e7eb',
      borderRadius: 6, padding: 12, overflowX: 'auto', color: '#374151',
      whiteSpace: 'pre', margin: 0,
    }}>
      {children}
    </pre>
  );
}
