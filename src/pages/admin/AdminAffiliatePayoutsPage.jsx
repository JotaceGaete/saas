import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import {
  listReferralPayouts,
  getReferralPayoutDetail,
  markReferralPayoutPaid,
  rejectReferralPayout,
} from 'services/adminAffiliatePayoutsService';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'requested', label: 'Solicitado' },
  { value: 'paid', label: 'Pagado' },
  { value: 'rejected', label: 'Rechazado' },
];

const STATUS_LABELS = { requested: 'Solicitado', paid: 'Pagado', rejected: 'Rechazado' };

// Reason codes reales devueltos por las 4 RPCs (wa_admin_list_referral_payouts,
// wa_admin_get_referral_payout_detail, wa_admin_mark_referral_payout_paid,
// wa_admin_reject_referral_payout) -- ver 20260815100000_referral_payout_requests.sql
// y 20260816100000_referral_payout_read_api.sql.
const ERROR_MESSAGES = {
  forbidden: 'No tienes permisos de administrador para esta acción.',
  invalid_status: 'Este retiro ya cambió de estado. Actualiza el listado.',
  payout_not_found: 'No se encontró el retiro.',
  missing_external_reference: 'El comprobante (referencia externa) es obligatorio.',
  no_active_commissions: 'Este retiro no tiene comisiones activas vinculadas.',
  missing_reason: 'El motivo de rechazo es obligatorio.',
};

function errorMessage(code) {
  return ERROR_MESSAGES[code] || `Ocurrió un error (${code || 'desconocido'}).`;
}

function Badge({ status }) {
  const map = {
    requested: { bg: 'rgba(245,158,11,0.15)', color: '#d97706' },
    paid: { bg: 'rgba(16,185,129,0.15)', color: '#059669' },
    rejected: { bg: 'rgba(239,68,68,0.15)', color: '#dc2626' },
  };
  const s = map[status] || { bg: 'var(--color-muted)', color: 'var(--color-muted-foreground)' };
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: s.bg, color: s.color, fontFamily: 'var(--font-caption)' }}
    >
      {STATUS_LABELS[status] || status || '—'}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMoney(n, currency) {
  if (n == null) return '—';
  // Punto decimal fijo (no toLocaleString regional) -- mismo formato que
  // walinkaref (DashboardKPIs/PayoutHistoryTable) para el mismo dominio de
  // payouts multi-moneda, evitando la ambigüedad de separadores regionales
  // cuando se muestran varias monedas (USD/CLP/etc.) una junto a otra.
  const amount = Number(n).toFixed(2);
  return currency ? `${currency} ${amount}` : amount;
}

function shortId(id) {
  if (!id) return '—';
  return `${id.slice(0, 8)}…`;
}

export default function AdminAffiliatePayoutsPage() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [payouts, setPayouts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 30;

  const [detailPayoutId, setDetailPayoutId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [actionMessage, setActionMessage] = useState(null);

  const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
  const [markPaidExternalRef, setMarkPaidExternalRef] = useState('');
  const [markPaidSubmitting, setMarkPaidSubmitting] = useState(false);
  const [markPaidError, setMarkPaidError] = useState(null);
  const [markPaidAmountChanged, setMarkPaidAmountChanged] = useState(null);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectError, setRejectError] = useState(null);

  const loadPayouts = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const data = await listReferralPayouts({ status: statusFilter || undefined, limit, offset: page * limit });
      if (data?.ok === false) {
        setListError(errorMessage(data.error));
        setPayouts([]);
        setTotalCount(0);
      } else {
        setPayouts(data?.payouts || []);
        setTotalCount(data?.totalCount ?? 0);
      }
    } catch (err) {
      setListError(err?.message || 'No pudimos conectar con el servidor.');
      setPayouts([]);
      setTotalCount(0);
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { loadPayouts(); }, [loadPayouts]);

  const loadDetail = useCallback((id) => {
    if (!id) {
      setDetailData(null);
      setDetailError(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    getReferralPayoutDetail(id)
      .then((data) => {
        if (data?.ok === false) {
          setDetailError(errorMessage(data.error));
          setDetailData(null);
        } else {
          setDetailData(data);
        }
      })
      .catch((err) => {
        setDetailError(err?.message || 'No pudimos conectar con el servidor.');
        setDetailData(null);
      })
      .finally(() => setDetailLoading(false));
  }, []);

  useEffect(() => { loadDetail(detailPayoutId); }, [detailPayoutId, loadDetail]);

  const closeDetail = () => {
    setDetailPayoutId(null);
    setMarkPaidModalOpen(false);
    setRejectModalOpen(false);
  };

  const openMarkPaidModal = () => {
    setMarkPaidExternalRef('');
    setMarkPaidError(null);
    setMarkPaidAmountChanged(null);
    setMarkPaidModalOpen(true);
  };

  const handleConfirmMarkPaid = async () => {
    if (!markPaidExternalRef.trim()) {
      setMarkPaidError('El comprobante (referencia externa) es obligatorio.');
      return;
    }
    setMarkPaidSubmitting(true);
    setMarkPaidError(null);
    setMarkPaidAmountChanged(null);
    try {
      const data = await markReferralPayoutPaid(detailPayoutId, markPaidExternalRef.trim());
      if (data?.ok === false) {
        if (data.error === 'payout_amount_changed') {
          // Caso crítico: nunca mostrar éxito ni mutar el status local --
          // se refresca el detalle real desde el servidor y se deja el
          // modal abierto con el detalle del desvío para que el admin
          // revise o rechace.
          setMarkPaidAmountChanged({ requestedAmount: data.requestedAmount, payableAmount: data.payableAmount });
          loadDetail(detailPayoutId);
        } else {
          setMarkPaidError(errorMessage(data.error));
        }
        setMarkPaidSubmitting(false);
        return;
      }
      setMarkPaidModalOpen(false);
      setMarkPaidSubmitting(false);
      setActionMessage({
        type: 'success',
        text: data.alreadyPaid
          ? 'Este retiro ya estaba marcado como pagado.'
          : `Retiro marcado como pagado (${data.commissionsPaid} comisión${data.commissionsPaid === 1 ? '' : 'es'}).`,
      });
      loadPayouts();
      loadDetail(detailPayoutId);
    } catch (err) {
      setMarkPaidError(err?.message || 'No pudimos conectar con el servidor.');
      setMarkPaidSubmitting(false);
    }
  };

  const openRejectModal = () => {
    setRejectReason('');
    setRejectError(null);
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) {
      setRejectError('El motivo es obligatorio.');
      return;
    }
    setRejectSubmitting(true);
    setRejectError(null);
    try {
      const data = await rejectReferralPayout(detailPayoutId, rejectReason.trim());
      if (data?.ok === false) {
        setRejectError(errorMessage(data.error));
        setRejectSubmitting(false);
        return;
      }
      setRejectModalOpen(false);
      setRejectSubmitting(false);
      setActionMessage({
        type: 'success',
        text: data.alreadyRejected
          ? 'Este retiro ya estaba rechazado.'
          : `Retiro rechazado (${data.releasedCommissionCount} comisión${data.releasedCommissionCount === 1 ? '' : 'es'} liberada${data.releasedCommissionCount === 1 ? '' : 's'}).`,
      });
      loadPayouts();
      loadDetail(detailPayoutId);
    } catch (err) {
      setRejectError(err?.message || 'No pudimos conectar con el servidor.');
      setRejectSubmitting(false);
    }
  };

  const detailPayout = detailData?.payout || null;
  const detailCommissions = detailData?.commissions || [];
  const snapshot = detailPayout?.payoutMethodSnapshot || null;

  return (
    <div className="panel-root min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
      <BusinessSidebar isCollapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <main className="panel-main min-h-screen w-full max-w-full min-w-0 overflow-x-hidden transition-all duration-200" style={{ marginLeft: isDesktop ? sidebarWidth : 0 }}>
        <div className="sticky top-0 z-40 border-b px-4 md:px-6 lg:pl-4 lg:pr-8 py-4 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: '#FFFFFF', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xs)' }}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              aria-label="Volver al panel admin"
            >
              <Icon name="ArrowLeft" size={18} color="var(--color-muted-foreground)" />
            </button>
            <div>
              <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                Retiros de afiliados
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Solicitudes de retiro del programa de afiliados
              </p>
            </div>
          </div>
        </div>

        {actionMessage && (
          <div
            className="mx-4 mt-4 md:mx-6 md:mt-4 px-4 py-3 rounded-xl border flex items-center justify-between gap-2"
            style={{
              borderColor: actionMessage.type === 'error' ? 'var(--color-error)' : '#10b981',
              backgroundColor: actionMessage.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.1)',
              color: actionMessage.type === 'error' ? 'var(--color-error)' : '#059669',
            }}
          >
            <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{actionMessage.text}</span>
            <button type="button" onClick={() => setActionMessage(null)} className="p-1 rounded hover:opacity-80">
              <Icon name="X" size={14} />
            </button>
          </div>
        )}

        <div className="p-4 md:p-6 lg:p-8 max-w-7xl pb-24 lg:pb-8">
          {listError && (
            <div className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
              <Icon name="AlertCircle" size={18} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{listError}</span>
            </div>
          )}

          {/* Filters */}
          <section className="mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Estado</label>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Table */}
          <section className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
            {loadingList ? (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Cargando retiros...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ fontFamily: 'var(--font-caption)' }}>
                  <thead>
                    <tr className="text-xs font-semibold" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Afiliado</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Monto</th>
                      <th className="px-4 py-3">Método</th>
                      <th className="px-4 py-3">Titular</th>
                      <th className="px-4 py-3">Cuenta</th>
                      <th className="px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: 'var(--color-foreground)' }}>
                    {payouts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>No hay retiros que coincidan con los filtros.</td>
                      </tr>
                    ) : (
                      payouts.map((row) => (
                        <tr
                          key={row.payoutId}
                          className="border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                          style={{ borderColor: 'var(--color-border)' }}
                          onClick={() => setDetailPayoutId(row.payoutId)}
                        >
                          <td className="px-4 py-3 text-sm">{formatDate(row.requestedAt)}</td>
                          <td className="px-4 py-3 text-xs" title={row.referrerUserId}>{shortId(row.referrerUserId)}</td>
                          <td className="px-4 py-3 text-sm">{row.referrerEmail || '—'}</td>
                          <td className="px-4 py-3">{formatMoney(row.requestedAmount, row.currency)}</td>
                          <td className="px-4 py-3 text-sm">{row.payoutMethod || '—'}</td>
                          <td className="px-4 py-3 text-sm">{row.holderName || '—'}</td>
                          <td className="px-4 py-3 text-sm font-tabular">{row.maskedAccountNumber || '—'}</td>
                          <td className="px-4 py-3"><Badge status={row.status} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {totalCount > limit && (
              <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  {page * limit + 1}-{Math.min((page + 1) * limit, totalCount)} de {totalCount}
                </span>
                <div className="flex gap-2">
                  <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded text-sm disabled:opacity-50" style={{ fontFamily: 'var(--font-caption)' }}>Anterior</button>
                  <button type="button" disabled={(page + 1) * limit >= totalCount} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded text-sm disabled:opacity-50" style={{ fontFamily: 'var(--font-caption)' }}>Siguiente</button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Detail drawer */}
        {detailPayoutId && (
          <div
            className="fixed inset-0 z-50 flex justify-end"
            style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
            onClick={closeDetail}
          >
            <div
              className="w-full max-w-2xl h-full overflow-y-auto"
              style={{ backgroundColor: 'var(--color-background)', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                <h3 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Detalle del retiro</h3>
                <button type="button" onClick={closeDetail} className="p-2 rounded-lg hover:bg-muted">
                  <Icon name="X" size={18} />
                </button>
              </div>
              <div className="p-4">
                {detailLoading ? (
                  <div className="py-8 text-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Cargando...</div>
                ) : detailError ? (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-error)' }}>
                    <Icon name="AlertCircle" size={16} />
                    {detailError}
                  </div>
                ) : detailPayout ? (
                  <>
                    <div className="space-y-2 mb-6">
                      <p><strong>ID retiro:</strong> <code className="text-xs">{detailPayout.payoutId}</code></p>
                      <p><strong>Afiliado:</strong> {detailPayout.referrerEmail || '—'}</p>
                      <p><strong>Estado:</strong> <Badge status={detailPayout.status} /></p>
                      <p><strong>Monto solicitado:</strong> {formatMoney(detailPayout.requestedAmount, detailPayout.currency)}</p>
                      <p><strong>Solicitado:</strong> {formatDate(detailPayout.requestedAt)}</p>
                      <p><strong>Pagado:</strong> {formatDate(detailPayout.paidAt)}</p>
                      <p><strong>Rechazado:</strong> {formatDate(detailPayout.rejectedAt)}</p>
                      {detailPayout.externalReference && <p><strong>Comprobante:</strong> {detailPayout.externalReference}</p>}
                      {detailPayout.rejectedReason && <p><strong>Motivo de rechazo:</strong> {detailPayout.rejectedReason}</p>}
                    </div>

                    <h4 className="text-sm font-semibold mb-2">Datos bancarios</h4>
                    {snapshot ? (
                      <div className="space-y-1 mb-6 text-sm">
                        <p><strong>Titular:</strong> {snapshot.holder_name || '—'}</p>
                        <p><strong>RUT / identificación tributaria:</strong> {snapshot.holder_tax_id || '—'}</p>
                        <p><strong>Banco:</strong> {snapshot.bank_name || '—'}</p>
                        <p><strong>Tipo de cuenta:</strong> {snapshot.account_type || '—'}</p>
                        <p><strong>Número de cuenta:</strong> {snapshot.account_number || '—'}</p>
                        <p><strong>País:</strong> {snapshot.country || '—'}</p>
                        <p><strong>Email de contacto:</strong> {snapshot.email || '—'}</p>
                      </div>
                    ) : (
                      <p className="text-sm mb-6" style={{ color: 'var(--color-muted-foreground)' }}>Sin datos bancarios.</p>
                    )}

                    <h4 className="text-sm font-semibold mb-2">Comisiones vinculadas</h4>
                    <ul className="space-y-2 mb-6">
                      {detailCommissions.length === 0 ? (
                        <li className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Sin comisiones vinculadas.</li>
                      ) : (
                        detailCommissions.map((c) => (
                          <li key={c.commissionId} className="text-xs p-2 rounded border" style={{ borderColor: 'var(--color-border)' }}>
                            <code>{c.commissionId}</code> · {formatMoney(c.rewardAmountSnapshot, detailPayout.currency)} · {c.commissionStatus} ·{' '}
                            {c.active ? 'activa' : `liberada (${c.releasedReason || '—'} · ${formatDate(c.releasedAt)})`}
                          </li>
                        ))
                      )}
                    </ul>

                    {detailPayout.status === 'requested' && (
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={openMarkPaidModal}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                          style={{ backgroundColor: '#059669', fontFamily: 'var(--font-caption)' }}
                        >
                          Marcar como pagado
                        </button>
                        <button
                          type="button"
                          onClick={openRejectModal}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                          style={{ backgroundColor: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>No se encontraron datos.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: marcar como pagado */}
        {markPaidModalOpen && detailPayout && (
          <div
            className="fixed inset-0 z-modal flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(45,45,45,0.5)' }}
            onClick={() => !markPaidSubmitting && setMarkPaidModalOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border p-6"
              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xl)' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mark-paid-dialog-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="mark-paid-dialog-title" className="text-lg font-semibold mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
                Marcar como pagado
              </h3>
              <div className="text-sm mb-4" style={{ color: 'var(--color-muted-foreground)' }}>
                <p><strong>Monto:</strong> {formatMoney(detailPayout.requestedAmount, detailPayout.currency)}</p>
                <p><strong>Afiliado:</strong> {detailPayout.referrerEmail || '—'}</p>
              </div>

              {markPaidAmountChanged && (
                <div className="mb-4 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
                  <p className="font-medium mb-1">El monto elegible cambió desde que se solicitó este retiro.</p>
                  <p>Monto solicitado: {formatMoney(markPaidAmountChanged.requestedAmount, detailPayout.currency)}</p>
                  <p>Monto pagable ahora: {formatMoney(markPaidAmountChanged.payableAmount, detailPayout.currency)}</p>
                  <p className="mt-1">Revisa las comisiones vinculadas o rechaza este retiro.</p>
                </div>
              )}

              {markPaidError && (
                <div className="mb-4 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
                  {markPaidError}
                </div>
              )}

              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Comprobante / referencia externa
              </label>
              <input
                type="text"
                value={markPaidExternalRef}
                onChange={(e) => setMarkPaidExternalRef(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm mb-4"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                placeholder="N° de transferencia, comprobante..."
                disabled={markPaidSubmitting}
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={markPaidSubmitting}
                  onClick={() => setMarkPaidModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={markPaidSubmitting}
                  onClick={handleConfirmMarkPaid}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#059669', fontFamily: 'var(--font-caption)' }}
                >
                  {markPaidSubmitting ? 'Procesando...' : 'Confirmar pago'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: rechazar */}
        {rejectModalOpen && detailPayout && (
          <div
            className="fixed inset-0 z-modal flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(45,45,45,0.5)' }}
            onClick={() => !rejectSubmitting && setRejectModalOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border p-6"
              style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-xl)' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-dialog-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="reject-dialog-title" className="text-lg font-semibold mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
                Rechazar retiro
              </h3>
              <div className="text-sm mb-4" style={{ color: 'var(--color-muted-foreground)' }}>
                <p><strong>Monto:</strong> {formatMoney(detailPayout.requestedAmount, detailPayout.currency)}</p>
                <p><strong>Afiliado:</strong> {detailPayout.referrerEmail || '—'}</p>
              </div>

              {rejectError && (
                <div className="mb-4 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
                  {rejectError}
                </div>
              )}

              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Motivo del rechazo
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm mb-4"
                style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                rows={3}
                placeholder="Motivo obligatorio..."
                disabled={rejectSubmitting}
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={rejectSubmitting}
                  onClick={() => setRejectModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={rejectSubmitting}
                  onClick={handleConfirmReject}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-error)', fontFamily: 'var(--font-caption)' }}
                >
                  {rejectSubmitting ? 'Procesando...' : 'Confirmar rechazo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
