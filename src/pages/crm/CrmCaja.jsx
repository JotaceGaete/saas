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
  otro: 'Otro',
};

const PAYMENT_COLORS = {
  efectivo: '#059669',
  transferencia: '#2563eb',
  tarjeta: '#7c3aed',
  otro: '#d97706',
};

function formatTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CrmCaja() {
  const { business, user } = useAuth();
  const navigate = useNavigate();
  const currency = business?.currency;

  const [session, setSession] = useState(null);
  const [payments, setPayments] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [sess, recent] = await Promise.all([
        getOpenCashSession(business.id),
        getRecentCashSessions(business.id, 5),
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
      if (err?.message?.includes('does not exist') || err?.code === '42P01') {
        setTableError(true);
      } else {
        setError(err?.message || 'Error al cargar la caja');
      }
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  const handleOpen = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const initial = openingAmount ? parseFloat(openingAmount) : null;
      await openCashSession(business.id, {
        openedBy: user?.id,
        initialAmount: initial,
      });
      setShowOpenForm(false);
      setOpeningAmount('');
      await load();
    } catch (err) {
      setError(err?.message || 'Error al abrir caja');
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
      await load();
    } catch (err) {
      setError(err?.message || 'Error al cerrar caja');
    } finally {
      setSubmitting(false);
    }
  };

  // Payment summary by method
  const summary = payments.reduce((acc, p) => {
    const m = p.payment_method || 'otro';
    if (!acc[m]) acc[m] = { count: 0, total: 0 };
    acc[m].count += 1;
    acc[m].total += Number(p.amount) || 0;
    return acc;
  }, {});

  const grandTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <Icon name="Loader2" size={24} color="#6b7280" className="animate-spin" />
      </div>
    );
  }

  if (tableError) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
        <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Icon name="AlertTriangle" size={20} color="#d97706" />
            <div>
              <p style={{ fontWeight: 700, color: '#92400e', margin: '0 0 8px' }}>Tabla de caja no encontrada</p>
              <p style={{ fontSize: 13, color: '#78350f', margin: 0 }}>
                La tabla <code>crm_cash_sessions</code> no existe en la base de datos todavía.
                Ejecuta la migración SQL para habilitar esta funcionalidad.
              </p>
              <pre style={{ marginTop: 12, fontSize: 11, backgroundColor: '#fff', border: '1px solid #fcd34d', borderRadius: 6, padding: 12, overflowX: 'auto', color: '#374151' }}>
{`CREATE TABLE crm_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES wa_business(id) ON DELETE CASCADE,
  date date NOT NULL,
  opened_by uuid REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  initial_amount numeric(12,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON crm_cash_sessions(business_id, status);`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/crm')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#6b7280' }}
          >
            <Icon name="ArrowLeft" size={18} color="currentColor" />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Caja diaria</h1>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{formatDate(new Date())}</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/crm/terminal')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Icon name="ShoppingCart" size={14} color="currentColor" />
          Terminal TPV
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* No open session */}
      {!session && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 32, textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', backgroundColor: '#f3f4f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Icon name="Lock" size={28} color="#9ca3af" />
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Caja cerrada</h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
            Abre la caja para comenzar a registrar ventas y ver los movimientos del día.
          </p>

          {!showOpenForm ? (
            <button
              onClick={() => setShowOpenForm(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px',
                backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Icon name="Unlock" size={16} color="currentColor" />
              Abrir caja
            </button>
          ) : (
            <div style={{ maxWidth: 320, margin: '0 auto' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, textAlign: 'left' }}>
                Monto inicial en caja (opcional)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingAmount}
                onChange={e => setOpeningAmount(e.target.value)}
                placeholder="0"
                style={{
                  width: '100%', padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 8,
                  fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setShowOpenForm(false); setOpeningAmount(''); }}
                  style={{
                    flex: 1, padding: '9px 0', border: '1.5px solid #d1d5db', borderRadius: 8,
                    backgroundColor: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOpen}
                  disabled={submitting}
                  style={{
                    flex: 2, padding: '9px 0', border: 'none', borderRadius: 8,
                    backgroundColor: '#059669', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Abriendo...' : 'Confirmar apertura'}
                </button>
              </div>
            </div>
          )}

          {/* Recent sessions */}
          {recentSessions.length > 0 && (
            <div style={{ marginTop: 32, textAlign: 'left' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Historial reciente</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentSessions.filter(s => s.status === 'closed').slice(0, 3).map(s => (
                  <div key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', backgroundColor: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#6b7280',
                  }}>
                    <span>{formatDate(s.date)}</span>
                    <span>{formatTime(s.opened_at)} → {formatTime(s.closed_at)}</span>
                    <span style={{ color: '#059669', fontWeight: 600 }}>Cerrada</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Open session */}
      {session && (
        <>
          {/* Session status banner */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 12,
            padding: '12px 16px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#059669' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>
                Caja abierta desde las {formatTime(session.opened_at)}
              </span>
              {session.initial_amount != null && (
                <span style={{ fontSize: 12, color: '#047857' }}>
                  · Apertura: {formatMoney(session.initial_amount, currency)}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowCloseConfirm(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                backgroundColor: '#fff', border: '1.5px solid #6ee7b7', borderRadius: 8,
                fontSize: 12, fontWeight: 600, color: '#065f46', cursor: 'pointer',
              }}
            >
              <Icon name="Lock" size={13} color="currentColor" />
              Cerrar caja
            </button>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            {/* Total card */}
            <div style={{
              backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
              padding: '14px 16px', gridColumn: 'span 2',
            }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total recaudado</p>
              <p style={{ fontSize: 26, fontWeight: 800, color: '#059669', margin: '0 0 2px' }}>{formatMoney(grandTotal, currency)}</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{payments.length} {payments.length === 1 ? 'venta' : 'ventas'}</p>
            </div>

            {/* Per-method cards */}
            {Object.entries(summary).map(([method, { count, total }]) => (
              <div key={method} style={{
                backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: PAYMENT_COLORS[method] || '#9ca3af' }} />
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: 0 }}>{PAYMENT_LABELS[method] || method}</p>
                </div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{formatMoney(total, currency)}</p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{count} {count === 1 ? 'pago' : 'pagos'}</p>
              </div>
            ))}
          </div>

          {/* Payments list */}
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>Movimientos</h3>
            </div>
            {payments.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                Aún no hay ventas en esta sesión
              </div>
            ) : (
              <div>
                {payments.map((p, i) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderBottom: i < payments.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        backgroundColor: `${PAYMENT_COLORS[p.payment_method] || '#9ca3af'}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon
                          name={p.payment_method === 'efectivo' ? 'Banknote' : p.payment_method === 'tarjeta' ? 'CreditCard' : p.payment_method === 'transferencia' ? 'ArrowRightLeft' : 'CircleDollarSign'}
                          size={15}
                          color={PAYMENT_COLORS[p.payment_method] || '#9ca3af'}
                        />
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>
                          {PAYMENT_LABELS[p.payment_method] || p.payment_method}
                        </p>
                        <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{formatTime(p.created_at)}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>
                      +{formatMoney(p.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Close confirm modal */}
      {showCloseConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: 16, padding: 28,
            maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', backgroundColor: '#fef3c7',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
              }}>
                <Icon name="Lock" size={22} color="#d97706" />
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>¿Cerrar la caja?</h2>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                Se registrará el cierre a las {formatTime(new Date())}.<br />
                Total acumulado: <strong>{formatMoney(grandTotal, currency)}</strong>
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowCloseConfirm(false)}
                style={{
                  flex: 1, padding: '10px 0', border: '1.5px solid #d1d5db', borderRadius: 10,
                  backgroundColor: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleClose}
                disabled={submitting}
                style={{
                  flex: 1, padding: '10px 0', border: 'none', borderRadius: 10,
                  backgroundColor: '#d97706', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Cerrando...' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
