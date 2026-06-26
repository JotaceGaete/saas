import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  getCashSessionMovements,
} from '../../services/crmService';

const PAYMENT_LABELS = {
  cash: 'Efectivo',
  bank_transfer: 'Transferencia',
  card: 'Tarjeta',
  check: 'Cheque',
  other: 'Otro',
};

const PAYMENT_ICONS = {
  cash: 'Banknote',
  bank_transfer: 'ArrowRightLeft',
  card: 'CreditCard',
  check: 'FileText',
  other: 'CircleDollarSign',
};

const PAYMENT_COLORS = {
  cash: '#059669',
  bank_transfer: '#2563eb',
  card: '#7c3aed',
  check: '#0891b2',
  other: '#d97706',
};

const METHOD_ORDER = ['cash', 'card', 'bank_transfer', 'check', 'other'];

function fmtDt(dt, mode = 'time') {
  if (!dt) return '—';
  const d = new Date(dt);
  if (mode === 'time') return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  if (mode === 'date') return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (mode === 'full') return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const f = (n, currency) => formatMoney(n ?? 0, currency);

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function summaryByMethod(pmts) {
  return pmts.reduce((acc, p) => {
    const m = PAYMENT_LABELS[p.payment_method] ? p.payment_method : 'other';
    if (!acc[m]) acc[m] = { count: 0, total: 0 };
    acc[m].count += 1;
    acc[m].total += Number(p.amount) || 0;
    return acc;
  }, {});
}

function computeExpectedCash(session, cashIn, movements) {
  const salidasTotal      = movements.filter(m => m.direction === 'out' && !m.voided_at).reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const ingresosExtraTotal = movements.filter(m => m.direction === 'in'  && !m.voided_at).reduce((s, m) => s + (Number(m.amount) || 0), 0);
  return (Number(session.initial_amount) || 0) + cashIn + ingresosExtraTotal - salidasTotal;
}

// ─── Modal de arqueo ──────────────────────────────────────────────────────────

function ArqueoModal({ session, payments, movements, summary, currency, onCancel, onConfirm, submitting }) {
  const [step,         setStep]         = useState(1);
  const [countedCash,  setCountedCash]  = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const countedInputRef = useRef(null);

  const cashIn            = summary.cash?.total || 0;
  const nonCashTotal      = METHOD_ORDER.filter(m => m !== 'cash').reduce((s, m) => s + (summary[m]?.total || 0), 0);
  const salidas           = movements.filter(m => m.direction === 'out' && !m.voided_at);
  const ingresosExtra     = movements.filter(m => m.direction === 'in'  && !m.voided_at);
  const totalSalidas      = salidas.reduce((s, m)       => s + (Number(m.amount) || 0), 0);
  const totalIngresosExtra = ingresosExtra.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const expectedCash      = computeExpectedCash(session, cashIn, movements);

  const counted    = countedCash === '' ? null : Number(parseFloat(countedCash).toFixed(2));
  const diff       = counted !== null && !isNaN(counted) ? counted - expectedCash : null;
  const hasDiff    = diff !== null && Math.abs(diff) >= 0.01;
  const diffStatus = diff === null ? null : !hasDiff ? 'ok' : diff > 0 ? 'over' : 'under';

  const canProceedFromStep2 = counted !== null && !isNaN(counted);
  const canProceedFromStep3 = closingNotes.trim().length > 0;

  const goNext = () => {
    if (step === 1) { setStep(2); setTimeout(() => countedInputRef.current?.focus(), 80); }
    else if (step === 2) setStep(hasDiff ? 3 : 4);
    else if (step === 3) setStep(4);
  };

  const goBack = () => {
    if (step === 4 && hasDiff) setStep(3);
    else if (step === 4 || step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  const handleConfirm = () => {
    onConfirm({
      expectedCash,
      countedCash:    counted,
      cashDifference: diff ?? 0,
      closingNotes:   closingNotes.trim() || null,
    });
  };

  const totalSteps = hasDiff ? 4 : 3;
  const currentDisplayStep = step > 2 && !hasDiff ? step - 1 : step;

  const DIFF_CONFIG = {
    ok:    { label: 'Caja cuadrada',  color: '#059669', bg: '#f0fdf4', border: '#bbf7d0', dot: '🟢' },
    over:  { label: 'Sobrante',       color: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '🟠' },
    under: { label: 'Faltante',       color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '🔴' },
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 480,
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="ClipboardCheck" size={17} color="#d97706" />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Cierre de caja</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{fmtDt(new Date(), 'full')}</p>
              </div>
            </div>
            <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
              <Icon name="X" size={18} color="currentColor" />
            </button>
          </div>

          {/* Progress steps */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(hasDiff ? [1, 2, 3, 4] : [1, 2, 3]).map((s) => {
              const label = hasDiff
                ? ['Resumen', 'Arqueo', 'Diferencia', 'Confirmar'][s - 1]
                : ['Resumen', 'Arqueo', 'Confirmar'][s - 1];
              const isDone    = s < step;
              const isCurrent = s === step;
              return (
                <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    height: 3, borderRadius: 99, marginBottom: 4,
                    backgroundColor: isDone || isCurrent ? '#d97706' : '#e5e7eb',
                  }} />
                  <span style={{ fontSize: 10, color: isCurrent ? '#d97706' : isDone ? '#059669' : '#9ca3af', fontWeight: isCurrent ? 700 : 500 }}>
                    {isDone ? '✓ ' : ''}{label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

          {/* ── PASO 1: Resumen automático ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                Resumen calculado automáticamente de esta sesión de caja.
              </p>

              {/* Fondo + efectivo */}
              <div style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>Efectivo</p>
                <SRow label="Fondo inicial"       value={f(session.initial_amount || 0, currency)} />
                <SRow label="Cobros en efectivo"   value={f(cashIn, currency)} color="#059669" />
                {totalIngresosExtra > 0 && <SRow label="Ingresos adicionales" value={f(totalIngresosExtra, currency)} color="#059669" />}
                {totalSalidas > 0       && <SRow label="Salidas de caja"      value={`−${f(totalSalidas, currency)}`} color="#dc2626" />}
                <div style={{ borderTop: '1px dashed #e5e7eb', margin: '8px 0' }} />
                <SRow label="Efectivo esperado" value={f(expectedCash, currency)} bold color="#111827" />
              </div>

              {/* Medios electrónicos */}
              {nonCashTotal > 0 && (
                <div style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>
                    Medios electrónicos <span style={{ fontWeight: 400, textTransform: 'none' }}>(sin arqueo físico)</span>
                  </p>
                  {METHOD_ORDER.filter(m => m !== 'cash' && summary[m]).map(m => (
                    <SRow key={m} label={PAYMENT_LABELS[m]} value={`${f(summary[m].total, currency)}  (${summary[m].count})`} color={PAYMENT_COLORS[m]} />
                  ))}
                </div>
              )}

              {/* Movimientos detail */}
              {(salidas.length > 0 || ingresosExtra.length > 0) && (
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0, padding: '10px 14px', borderBottom: '1px solid #f3f4f6' }}>
                    Movimientos operativos
                  </p>
                  {[...ingresosExtra, ...salidas].map(m => (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #f9fafb', fontSize: 12 }}>
                      <span style={{ color: '#374151' }}>{m.reason || m.category || '—'}</span>
                      <span style={{ fontWeight: 600, color: m.direction === 'out' ? '#dc2626' : '#059669' }}>
                        {m.direction === 'out' ? '−' : '+'}{f(m.amount, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: 12, color: '#92400e', margin: 0 }}>
                  En el siguiente paso contarás el efectivo físico.
                </p>
              </div>
            </div>
          )}

          {/* ── PASO 2: Arqueo ── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Efectivo esperado — prominente */}
              <div style={{ textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: 14, padding: '20px 16px' }}>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 6px', fontWeight: 600 }}>Efectivo esperado en caja</p>
                <p style={{ fontSize: 36, fontWeight: 900, color: '#111827', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {f(expectedCash, currency)}
                </p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '6px 0 0' }}>
                  Fondo {f(session.initial_amount || 0, currency)} + cobros {f(cashIn, currency)}{totalSalidas > 0 ? ` − salidas ${f(totalSalidas, currency)}` : ''}
                </p>
              </div>

              {/* Input efectivo contado */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  Efectivo contado
                </label>
                <input
                  ref={countedInputRef}
                  type="number"
                  min="0"
                  step="0.01"
                  value={countedCash}
                  onChange={e => setCountedCash(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && canProceedFromStep2 && goNext()}
                  placeholder="0"
                  style={{
                    width: '100%', padding: '14px 16px', fontSize: 22, fontWeight: 700,
                    border: '2px solid #d1d5db', borderRadius: 12, outline: 'none',
                    boxSizing: 'border-box', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                    color: '#111827',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#d97706'; }}
                  onBlur={e => { e.target.style.borderColor = '#d1d5db'; }}
                />
              </div>

              {/* Diferencia en tiempo real */}
              {diff !== null && !isNaN(diff) && (() => {
                const cfg = DIFF_CONFIG[diffStatus];
                return (
                  <div style={{ backgroundColor: cfg.bg, border: `1.5px solid ${cfg.border}`, borderRadius: 14, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 12, color: cfg.color, fontWeight: 700, margin: '0 0 2px' }}>
                          {cfg.dot} {cfg.label}
                        </p>
                        <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>
                          {!hasDiff ? 'El efectivo cuadra perfectamente.' : `Diferencia de ${f(Math.abs(diff), currency)}`}
                        </p>
                      </div>
                      <p style={{ fontSize: 28, fontWeight: 900, color: cfg.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {diff > 0 ? '+' : ''}{f(diff, currency)}
                      </p>
                    </div>
                    {hasDiff && (
                      <p style={{ fontSize: 11, color: cfg.color, margin: '8px 0 0', fontWeight: 600 }}>
                        Se requerirá una observación antes de cerrar.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── PASO 3: Observación (solo si hay diferencia) ── */}
          {step === 3 && (() => {
            const cfg = DIFF_CONFIG[diffStatus];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Diferencia destacada */}
                <div style={{ backgroundColor: cfg.bg, border: `1.5px solid ${cfg.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: cfg.color, margin: 0 }}>{cfg.dot} {cfg.label}</p>
                    <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>
                      Esperado {f(expectedCash, currency)} · Contado {f(counted, currency)}
                    </p>
                  </div>
                  <p style={{ fontSize: 24, fontWeight: 900, color: cfg.color, margin: 0 }}>
                    {diff > 0 ? '+' : ''}{f(diff, currency)}
                  </p>
                </div>

                {/* Textarea observación */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                    Observación <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
                    Explica el motivo de la diferencia. Este registro es permanente.
                  </p>
                  <textarea
                    autoFocus
                    value={closingNotes}
                    onChange={e => setClosingNotes(e.target.value)}
                    placeholder="Ej: Error de vuelto. Pago registrado dos veces. Diferencia al contar caja. Ajuste administrativo."
                    rows={4}
                    style={{
                      width: '100%', padding: '12px 14px', fontSize: 13,
                      border: '1.5px solid #d1d5db', borderRadius: 10, outline: 'none',
                      boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5,
                      fontFamily: 'inherit', color: '#111827',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#d97706'; }}
                    onBlur={e => { e.target.style.borderColor = '#d1d5db'; }}
                  />
                  {closingNotes.trim().length === 0 && (
                    <p style={{ fontSize: 11, color: '#dc2626', margin: '4px 0 0' }}>
                      La observación es obligatoria cuando existe diferencia.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── PASO 4: Confirmación final ── */}
          {step === 4 && (() => {
            const cfg = DIFF_CONFIG[diffStatus || 'ok'];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                  Revisa el resumen final antes de cerrar la caja. Esta operación es irreversible.
                </p>

                {/* Resumen del día */}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>
                    Caja del {fmtDt(session.opened_at, 'full')}
                  </p>
                  {session.initial_amount != null && <SRow label="Fondo inicial" value={f(session.initial_amount, currency)} />}
                  <SRow label="Apertura" value={`${fmtDt(session.opened_at, 'time')} hs`} />
                  <SRow label="Cierre"   value={`${fmtDt(new Date(), 'time')} hs`} />
                  <div style={{ borderTop: '1px dashed #e5e7eb', margin: '8px 0' }} />
                  {METHOD_ORDER.filter(m => summary[m]).map(m => (
                    <SRow key={m} label={PAYMENT_LABELS[m]} value={`${f(summary[m].total, currency)} (${summary[m].count})`} color={PAYMENT_COLORS[m]} />
                  ))}
                  {totalSalidas > 0 && <SRow label="Salidas de caja" value={`−${f(totalSalidas, currency)}`} color="#dc2626" />}
                </div>

                {/* Arqueo */}
                <div style={{ backgroundColor: cfg.bg, border: `1.5px solid ${cfg.border}`, borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>Arqueo de efectivo</p>
                  <SRow label="Efectivo esperado" value={f(expectedCash, currency)} />
                  <SRow label="Efectivo contado"  value={f(counted, currency)} bold />
                  <SRow
                    label="Diferencia"
                    value={`${diff > 0 ? '+' : ''}${f(diff ?? 0, currency)}`}
                    bold
                    color={cfg.color}
                  />
                  {closingNotes && (
                    <>
                      <div style={{ borderTop: '1px dashed #e5e7eb', margin: '8px 0' }} />
                      <div style={{ fontSize: 12, color: '#374151' }}>
                        <span style={{ color: '#6b7280' }}>Observación: </span>{closingNotes}
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
                  <Icon name="AlertTriangle" size={14} color="#dc2626" />
                  <p style={{ fontSize: 11, color: '#b91c1c', margin: 0 }}>
                    Una vez cerrada, la caja no puede reabrirse ni modificarse.
                  </p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', flexShrink: 0, display: 'flex', gap: 10 }}>
          {step > 1 && (
            <button
              onClick={goBack}
              style={{ flex: '0 0 auto', padding: '10px 16px', border: '1.5px solid #d1d5db', borderRadius: 10, backgroundColor: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="ChevronLeft" size={14} color="currentColor" />
              Atrás
            </button>
          )}

          {step < 4 && (
            <button
              onClick={goNext}
              disabled={
                (step === 2 && !canProceedFromStep2) ||
                (step === 3 && !canProceedFromStep3)
              }
              style={{
                flex: 1, padding: '10px 0', border: 'none', borderRadius: 10,
                backgroundColor: '#d97706', fontSize: 13, fontWeight: 700, color: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: ((step === 2 && !canProceedFromStep2) || (step === 3 && !canProceedFromStep3)) ? 0.5 : 1,
              }}
            >
              Continuar
              <Icon name="ChevronRight" size={14} color="currentColor" />
            </button>
          )}

          {step === 4 && (
            <>
              <button
                onClick={onCancel}
                style={{ flex: 1, padding: '10px 0', border: '1.5px solid #d1d5db', borderRadius: 10, backgroundColor: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                style={{
                  flex: 2, padding: '10px 0', border: 'none', borderRadius: 10,
                  backgroundColor: '#dc2626', fontSize: 13, fontWeight: 700, color: '#fff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting
                  ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Cerrando...</>
                  : <><Icon name="Lock" size={14} color="currentColor" />Cerrar caja</>
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CrmCaja() {
  const { business, user } = useAuth();
  const navigate = useNavigate();
  const currency = business?.currency;

  const [session,        setSession]        = useState(null);
  const [payments,       setPayments]       = useState([]);
  const [movements,      setMovements]      = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [tableError,     setTableError]     = useState(false);
  const [rlsError,       setRlsError]       = useState(false);
  const [openingAmount,  setOpeningAmount]  = useState('');
  const [showArqueo,     setShowArqueo]     = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState(null);
  const [closedSession,  setClosedSession]  = useState(null);

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
        const [pmts, movs] = await Promise.all([
          getPaymentsForSession(business.id, sess.id),
          getCashSessionMovements(business.id, sess.id).then(r => r.data || []),
        ]);
        setPayments(pmts);
        setMovements(movs);
      } else {
        setPayments([]);
        setMovements([]);
      }
    } catch (err) {
      const msg  = err?.message || '';
      const code = err?.code    || err?.details || '';
      if (code === '42P01' || (msg.includes('relation') && msg.includes('does not exist'))) {
        setTableError(true);
      } else if (code === '42501' || msg.includes('row-level security') || msg.includes('policy') || msg.includes('permission denied')) {
        setRlsError(true);
      } else {
        setError(`[${code || '?'}] ${msg || 'Error desconocido al cargar la caja'}`);
      }
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  // Refresh payments every 30s
  useEffect(() => {
    if (!session) return;
    const id = setInterval(async () => {
      try {
        const [pmts, movs] = await Promise.all([
          getPaymentsForSession(business.id, session.id),
          getCashSessionMovements(business.id, session.id).then(r => r.data || []),
        ]);
        setPayments(pmts);
        setMovements(movs);
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
      const { error: openErr } = await openCashSession(business.id, { openedBy: user?.id, initialAmount: initial });
      if (openErr) {
        if (openErr?.code === '42501' || openErr?.message?.includes('row-level security') || openErr?.message?.includes('policy')) {
          setRlsError(true);
        } else {
          setError(openErr.message || 'Error al abrir caja');
        }
        return;
      }
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

  const handleClose = async ({ expectedCash, countedCash, cashDifference, closingNotes }) => {
    setSubmitting(true);
    setError(null);
    try {
      const { error: closeErr } = await closeCashSession(session.id, { expectedCash, countedCash, cashDifference, closingNotes });
      if (closeErr) throw new Error(closeErr.message || 'Error al cerrar caja');
      setShowArqueo(false);
      setClosedSession({
        ...session,
        closed_at:      new Date().toISOString(),
        expected_cash:  expectedCash,
        counted_cash:   countedCash,
        cash_difference: cashDifference,
        closing_notes:  closingNotes,
        payments:       [...payments],
        movements:      [...movements],
      });
      await load();
    } catch (err) {
      setError(err?.message || 'Error al cerrar caja');
    } finally {
      setSubmitting(false);
    }
  };

  const summary      = summaryByMethod(payments);
  const grandTotal   = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const expectedCash = session ? computeExpectedCash(session, summary.cash?.total || 0, movements) : 0;

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
  expected_cash numeric(12,2),
  counted_cash numeric(12,2),
  cash_difference numeric(12,2),
  closing_notes text,
  closed_by uuid,
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

  // ── Vista caja recién cerrada (post-arqueo) ───────────────────────────────

  if (closedSession && !session) {
    const cs        = closedSession;
    const csSummary = summaryByMethod(cs.payments || []);
    const csMovements = cs.movements || [];
    const csTotalSalidas = csMovements.filter(m => m.direction === 'out' && !m.voided_at).reduce((s, m) => s + Number(m.amount || 0), 0);
    const diffStatus = cs.cash_difference == null ? null
      : Math.abs(cs.cash_difference) < 0.01 ? 'ok'
      : cs.cash_difference > 0 ? 'over' : 'under';
    const DIFF_CONFIG = {
      ok:    { label: '🟢 Caja cuadrada', color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
      over:  { label: '🟠 Sobrante',      color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
      under: { label: '🔴 Faltante',      color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    };
    const diffCfg = diffStatus ? DIFF_CONFIG[diffStatus] : null;

    return (
      <PageShell navigate={navigate}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ backgroundColor: '#f0fdf4', borderBottom: '1px solid #bbf7d0', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="CheckCircle2" size={18} color="#059669" />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#065f46', margin: 0 }}>Caja cerrada con arqueo</p>
                <p style={{ fontSize: 12, color: '#047857', margin: 0 }}>{fmtDt(cs.opened_at, 'full')}</p>
              </div>
            </div>
          </div>

          <div style={{ padding: '20px 24px' }}>
            <SRow label="Apertura" value={fmtDt(cs.opened_at)} />
            <SRow label="Cierre"   value={fmtDt(cs.closed_at || new Date())} />
            {cs.initial_amount != null && <SRow label="Fondo inicial" value={f(cs.initial_amount, currency)} />}
            <div style={{ borderTop: '1px dashed #e5e7eb', margin: '12px 0' }} />

            {METHOD_ORDER.filter(m => csSummary[m]).map(m => (
              <SRow key={m} label={PAYMENT_LABELS[m]} value={`${f(csSummary[m].total, currency)} (${csSummary[m].count})`} color={PAYMENT_COLORS[m]} />
            ))}
            {csTotalSalidas > 0 && <SRow label="Salidas de caja" value={`−${f(csTotalSalidas, currency)}`} color="#dc2626" />}

            {/* Arqueo */}
            {cs.counted_cash != null && diffCfg && (
              <>
                <div style={{ borderTop: '1px dashed #e5e7eb', margin: '12px 0' }} />
                <div style={{ backgroundColor: diffCfg.bg, border: `1px solid ${diffCfg.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 4 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Arqueo</p>
                  <SRow label="Efectivo esperado" value={f(cs.expected_cash, currency)} />
                  <SRow label="Efectivo contado"  value={f(cs.counted_cash, currency)} bold />
                  <SRow label={diffCfg.label} value={`${cs.cash_difference > 0 ? '+' : ''}${f(cs.cash_difference, currency)}`} bold color={diffCfg.color} />
                  {cs.closing_notes && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>
                      <span style={{ color: '#6b7280' }}>Observación: </span>{cs.closing_notes}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div style={{ padding: '0 24px 24px' }}>
            <button
              onClick={() => setClosedSession(null)}
              style={{ width: '100%', padding: '10px 0', backgroundColor: '#059669', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
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
          <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 16 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="Lock" size={18} color="#9ca3af" />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Caja cerrada</p>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Registra pagos reales del día. No suma ventas pendientes.</p>
                </div>
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Monto inicial en caja (opcional)
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="number" min="0" step="0.01"
                  value={openingAmount}
                  onChange={e => setOpeningAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !submitting && handleOpen()}
                  placeholder="0"
                  style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                />
                <button
                  onClick={handleOpen}
                  disabled={submitting}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', backgroundColor: '#059669', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.7 : 1, whiteSpace: 'nowrap' }}
                >
                  <Icon name="Unlock" size={14} color="currentColor" />
                  {submitting ? 'Abriendo...' : 'Abrir caja'}
                </button>
              </div>
            </div>
          </div>

          {/* Historial de cajas */}
          {recentSessions.filter(s => s.status === 'closed').length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>
                Historial de cajas
              </p>
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                {recentSessions.filter(s => s.status === 'closed').map((s, i, arr) => {
                  const diffStatus = s.cash_difference == null ? null
                    : Math.abs(s.cash_difference) < 0.01 ? 'ok'
                    : s.cash_difference > 0 ? 'over' : 'under';
                  const HIST_COLORS = { ok: '#059669', over: '#d97706', under: '#dc2626' };
                  const HIST_LABELS = { ok: '🟢', over: '🟠', under: '🔴' };
                  return (
                    <div key={s.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 16px', borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
                      fontSize: 13, flexWrap: 'wrap', gap: 6,
                    }}>
                      <span style={{ color: '#374151', fontWeight: 500 }}>{fmtDt(s.date || s.opened_at, 'date')}</span>
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>{fmtDt(s.opened_at)} → {fmtDt(s.closed_at)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {diffStatus && (
                          <span style={{ fontSize: 11, color: HIST_COLORS[diffStatus] || '#6b7280', fontWeight: 600 }}>
                            {HIST_LABELS[diffStatus]}{' '}
                            {s.cash_difference != null ? `${s.cash_difference > 0 ? '+' : ''}${f(s.cash_difference, currency)}` : ''}
                          </span>
                        )}
                        <span style={{ color: '#d1d5db', fontSize: 11, backgroundColor: '#f9fafb', padding: '2px 8px', borderRadius: 20 }}>
                          Cerrada
                        </span>
                      </div>
                    </div>
                  );
                })}
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
                  Desde las {fmtDt(session.opened_at)}
                  {session.initial_amount != null && ` · Apertura ${f(session.initial_amount, currency)}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowArqueo(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', backgroundColor: '#fff', border: '1.5px solid #6ee7b7', borderRadius: 9, fontSize: 12, fontWeight: 700, color: '#065f46', cursor: 'pointer' }}
            >
              <Icon name="ClipboardCheck" size={13} color="currentColor" />
              Cerrar caja
            </button>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total cobrado</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: '#059669', margin: 0 }}>{f(grandTotal, currency)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#d1d5db', margin: 0 }}>{payments.length}</p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>movimientos</p>
              </div>
            </div>

            {METHOD_ORDER.filter(m => summary[m]).map(m => (
              <div key={m} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: `${PAYMENT_COLORS[m]}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={PAYMENT_ICONS[m]} size={14} color={PAYMENT_COLORS[m]} />
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: 0 }}>{PAYMENT_LABELS[m]}</p>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 1px' }}>{f(summary[m].total, currency)}</p>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>{summary[m].count} {summary[m].count === 1 ? 'pago' : 'pagos'}</p>
              </div>
            ))}

            {session.initial_amount != null && (
              <div style={{ backgroundColor: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: 12, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', margin: '0 0 4px' }}>Fondo inicial</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#6b7280', margin: 0 }}>{f(session.initial_amount, currency)}</p>
              </div>
            )}

            {/* Efectivo esperado */}
            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#92400e', margin: '0 0 4px' }}>Efectivo esperado</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#92400e', margin: 0 }}>{f(expectedCash, currency)}</p>
            </div>
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
                <p style={{ fontSize: 13, color: '#9ca3af', margin: '8px 0 0' }}>Aún no hay pagos en esta sesión</p>
              </div>
            ) : (
              payments.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < payments.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, backgroundColor: `${PAYMENT_COLORS[p.payment_method] || '#9ca3af'}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={PAYMENT_ICONS[p.payment_method] || 'CircleDollarSign'} size={15} color={PAYMENT_COLORS[p.payment_method] || '#9ca3af'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>{PAYMENT_LABELS[p.payment_method] || p.payment_method}</p>
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fmtDt(p.created_at)}{p.reference ? ` · ${p.reference}` : ''}{p.notes ? ` · ${p.notes}` : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#059669', flexShrink: 0 }}>+{f(p.amount, currency)}</span>
                </div>
              ))
            )}
          </div>

          <button
            onClick={() => navigate('/crm/terminal')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', backgroundColor: '#f9fafb', border: '1.5px dashed #d1d5db', borderRadius: 12, color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Icon name="ShoppingCart" size={15} color="currentColor" />
            Ir al Terminal TPV para registrar una venta
          </button>
        </div>
      )}

      {/* ── MODAL ARQUEO ── */}
      {showArqueo && session && (
        <ArqueoModal
          session={session}
          payments={payments}
          movements={movements}
          summary={summary}
          currency={currency}
          onCancel={() => setShowArqueo(false)}
          onConfirm={handleClose}
          submitting={submitting}
        />
      )}
    </PageShell>
  );
}

// ── Componentes reutilizables ─────────────────────────────────────────────────

function SRow({ label, value, bold, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, margin: '4px 0', fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ color: color || (bold ? '#111827' : '#374151'), fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function PageShell({ navigate, children }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <button onClick={() => navigate('/crm')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#6b7280' }}>
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
    <pre style={{ fontSize: 11, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, overflowX: 'auto', color: '#374151', whiteSpace: 'pre', margin: 0 }}>
      {children}
    </pre>
  );
}
