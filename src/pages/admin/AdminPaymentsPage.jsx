import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import BusinessSidebar from 'components/ui/BusinessSidebar';
import { useIsDesktop } from 'hooks/useMediaQuery';
import {
  getAdminPaymentsStats,
  getAdminPlansSold,
  getAdminPayments,
  getAdminPaymentDetail,
  getAdminBusinessSubscription,
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  adminExtendPlan,
  adminChangePlan,
} from 'services/adminPaymentsService';
import { getPlanLabel } from 'constants/plans';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'approved', label: 'Aprobados' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'rejected', label: 'Rechazados' },
  { value: 'cancelled', label: 'Cancelados' },
  { value: 'in_process', label: 'En proceso' },
];

const PLAN_OPTIONS = [
  { value: '', label: 'Todos los planes' },
  { value: 'starter', label: 'Starter' },
  { value: 'control', label: 'Plan Control' },
  { value: 'pro', label: 'Pro' },
  { value: 'business', label: 'Business' },
];

const ORIGIN_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'internal', label: 'Interno' },
];

function Badge({ status, type = 'status' }) {
  const map = {
    approved: { bg: 'rgba(16,185,129,0.15)', color: '#059669' },
    pending: { bg: 'rgba(245,158,11,0.15)', color: '#d97706' },
    rejected: { bg: 'rgba(239,68,68,0.15)', color: '#dc2626' },
    cancelled: { bg: 'var(--color-muted)', color: 'var(--color-muted-foreground)' },
    in_process: { bg: 'rgba(59,130,246,0.15)', color: '#2563eb' },
    active: { bg: 'rgba(16,185,129,0.15)', color: '#059669' },
    expired: { bg: 'rgba(239,68,68,0.15)', color: '#dc2626' },
  };
  const s = map[status] || { bg: 'var(--color-muted)', color: 'var(--color-muted-foreground)' };
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: s.bg, color: s.color, fontFamily: 'var(--font-caption)' }}
    >
      {status || '—'}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('es-CL') + ' CLP';
}

export default function AdminPaymentsPage() {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDesktop = useIsDesktop();
  const sidebarWidth = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  const [stats, setStats] = useState(null);
  const [plansSold, setPlansSold] = useState([]);
  const [payments, setPayments] = useState([]);
  const [totalPayments, setTotalPayments] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    status: '',
    planSlug: '',
    origin: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });
  const [page, setPage] = useState(0);
  const limit = 30;

  const [detailPaymentId, setDetailPaymentId] = useState(null);
  const [detailBusinessId, setDetailBusinessId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    const [statsRes, plansRes] = await Promise.all([getAdminPaymentsStats(), getAdminPlansSold()]);
    if (statsRes.data) setStats(statsRes.data);
    if (statsRes.error) setError(statsRes.error?.message);
    if (plansRes.data) setPlansSold(plansRes.data);
    setLoadingStats(false);
  }, []);

  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    const opts = {
      ...filters,
      limit,
      offset: page * limit,
    };
    const res = await getAdminPayments(opts);
    if (res.error) setError(res.error?.message);
    else {
      setPayments(res.data || []);
      setTotalPayments(res.total ?? 0);
    }
    setLoadingPayments(false);
  }, [filters, page]);

  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    const res = await getAdminNotifications({ limit: 30 });
    if (res.data) setNotifications(res.data);
    setLoadingNotifications(false);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadPayments(); }, [loadPayments]);
  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  useEffect(() => {
    if (detailPaymentId) {
      setDetailLoading(true);
      getAdminPaymentDetail(detailPaymentId).then((res) => {
        setDetailData(res.data);
        setDetailLoading(false);
      });
    } else if (detailBusinessId) {
      setDetailLoading(true);
      getAdminBusinessSubscription(detailBusinessId).then((res) => {
        setDetailData(res.data);
        setDetailLoading(false);
      });
    } else {
      setDetailData(null);
    }
  }, [detailPaymentId, detailBusinessId]);

  const handleMarkRead = async (id) => {
    await markAdminNotificationRead(id);
    loadNotifications();
  };

  const handleMarkAllRead = async () => {
    await markAllAdminNotificationsRead();
    loadNotifications();
  };

  const handleExtendPlan = async (businessId, days, reason) => {
    const res = await adminExtendPlan(businessId, days, reason);
    if (res.error) {
      setActionMessage({ type: 'error', text: res.error?.message || 'Error' });
      return;
    }
    setActionMessage({ type: 'success', text: `Plan extendido ${days} días.` });
    loadStats();
    loadPayments();
    if (detailBusinessId === businessId) {
      getAdminBusinessSubscription(businessId).then((r) => setDetailData(r.data));
    }
  };

  const handleChangePlan = async (businessId, newPlanSlug, reason) => {
    const res = await adminChangePlan(businessId, newPlanSlug, reason);
    if (res.error) {
      setActionMessage({ type: 'error', text: res.error?.message || 'Error' });
      return;
    }
    setActionMessage({ type: 'success', text: `Plan cambiado a ${getPlanLabel(newPlanSlug)}.` });
    loadStats();
    loadPayments();
    if (detailBusinessId === businessId) {
      getAdminBusinessSubscription(businessId).then((r) => setDetailData(r.data));
    }
  };

  const subscriptionStatus = (expiresAt) => {
    if (!expiresAt) return 'active';
    return new Date(expiresAt) > new Date() ? 'active' : 'expired';
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

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
                Pagos y Suscripciones
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Control de pagos, suscripciones y notificaciones
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNotificationsOpen((o) => !o)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)', position: 'relative' }}
          >
            <Icon name="Bell" size={16} color="var(--color-foreground)" />
            Notificaciones
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: 'var(--color-error)' }}>
                {unreadCount}
              </span>
            )}
          </button>
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

        {notificationsOpen && (
          <div className="mx-4 mt-4 md:mx-6 lg:mx-8 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: 'var(--color-muted)' }}>
              <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-caption)' }}>Notificaciones internas</span>
              {unreadCount > 0 && (
                <button type="button" onClick={handleMarkAllRead} className="text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
                  Marcar todas como leídas
                </button>
              )}
            </div>
            <ul className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>No hay notificaciones</li>
              ) : (
                notifications.map((n) => (
                  <li
                    key={n.id}
                    className="px-4 py-3 border-b last:border-b-0 flex items-start gap-2"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: n.read_at ? undefined : 'rgba(124,58,237,0.04)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-caption)' }}>{n.title}</p>
                      {n.body && <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)' }}>{n.body}</p>}
                      <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)' }}>{formatDate(n.created_at)}</p>
                    </div>
                    {!n.read_at && (
                      <button type="button" onClick={() => handleMarkRead(n.id)} className="text-xs font-medium shrink-0" style={{ color: 'var(--color-primary)' }}>
                        Marcar leída
                      </button>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        <div className="p-4 md:p-6 lg:p-8 max-w-7xl pb-24 lg:pb-8">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl border flex items-center gap-2" style={{ borderColor: 'var(--color-error)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-error)' }}>
              <Icon name="AlertCircle" size={18} />
              <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{error}</span>
            </div>
          )}

          {/* Stats cards */}
          <section className="mb-8">
            <h2 className="text-base font-bold mb-3" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              Resumen
            </h2>
            {loadingStats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-24 rounded-xl border animate-pulse" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)' }} />
                ))}
              </div>
            ) : stats && !stats.error ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: '#059669' }}>{stats.totalApproved ?? 0}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Pagos aprobados</p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: '#d97706' }}>{stats.totalPending ?? 0}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Pendientes</p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: '#dc2626' }}>{stats.totalRejected ?? 0}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Rechazados</p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>{stats.activeSubscriptions ?? 0} / {stats.expiredSubscriptions ?? 0}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Suscripciones activas / vencidas</p>
                </div>
                <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  <p className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>{formatMoney(stats.revenueThisMonth)}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Ingresos del mes</p>
                </div>
              </div>
            ) : null}
            {stats && !stats.error && plansSold.length > 0 && (
              <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                <p className="text-sm font-semibold mb-2" style={{ fontFamily: 'var(--font-caption)' }}>Planes más vendidos</p>
                <div className="flex flex-wrap gap-2">
                  {plansSold.map((row) => (
                    <span key={row.plan_slug} className="text-sm px-2 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-muted)', fontFamily: 'var(--font-caption)' }}>
                      {getPlanLabel(row.plan_slug)}: {row.count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Filters */}
          <section className="mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Estado</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Plan</label>
                <select
                  value={filters.planSlug}
                  onChange={(e) => setFilters((f) => ({ ...f, planSlug: e.target.value }))}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                >
                  {PLAN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Origen</label>
                <select
                  value={filters.origin}
                  onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                >
                  {ORIGIN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Desde</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Hasta</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Buscar (negocio, email, ID)</label>
                <input
                  type="search"
                  placeholder="Buscar..."
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border)', fontFamily: 'var(--font-caption)' }}
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  setPage(0);
                  setLoadingPayments(true);
                  const res = await getAdminPayments({ ...filters, limit, offset: 0 });
                  if (res.error) setError(res.error?.message);
                  else {
                    setPayments(res.data || []);
                    setTotalPayments(res.total ?? 0);
                  }
                  setLoadingPayments(false);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
              >
                Filtrar
              </button>
            </div>
          </section>

          {/* Table */}
          <section className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
            {loadingPayments ? (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Cargando pagos...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ fontFamily: 'var(--font-caption)' }}>
                  <thead>
                    <tr className="text-xs font-semibold" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }}>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Negocio</th>
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Monto</th>
                      <th className="px-4 py-3">Estado pago</th>
                      <th className="px-4 py-3">Origen</th>
                      <th className="px-4 py-3">Vence</th>
                      <th className="px-4 py-3">MP payment_id</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: 'var(--color-foreground)' }}>
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>No hay pagos que coincidan con los filtros.</td>
                      </tr>
                    ) : (
                      payments.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                          style={{ borderColor: 'var(--color-border)' }}
                          onClick={() => { setDetailPaymentId(row.id); setDetailBusinessId(null); }}
                        >
                          <td className="px-4 py-3 text-sm">{formatDate(row.created_at)}</td>
                          <td className="px-4 py-3 font-medium">{row.business_name || '—'}</td>
                          <td className="px-4 py-3 text-sm">{row.user_email || '—'}</td>
                          <td className="px-4 py-3">{row.plan_slug || '—'}</td>
                          <td className="px-4 py-3">{formatMoney(row.amount)}</td>
                          <td className="px-4 py-3"><Badge status={row.status} /></td>
                          <td className="px-4 py-3 text-sm">{row.origin || '—'}</td>
                          <td className="px-4 py-3 text-sm">{formatDate(row.plan_expires_at)}</td>
                          <td className="px-4 py-3 text-xs truncate max-w-[120px]" title={row.mp_payment_id || ''}>{row.mp_payment_id || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {totalPayments > limit && (
              <div className="px-4 py-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                  {page * limit + 1}-{Math.min((page + 1) * limit, totalPayments)} de {totalPayments}
                </span>
                <div className="flex gap-2">
                  <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded text-sm disabled:opacity-50" style={{ fontFamily: 'var(--font-caption)' }}>Anterior</button>
                  <button type="button" disabled={(page + 1) * limit >= totalPayments} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded text-sm disabled:opacity-50" style={{ fontFamily: 'var(--font-caption)' }}>Siguiente</button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Detail drawer */}
        {(detailPaymentId || detailBusinessId) && (
          <div
            className="fixed inset-0 z-50 flex justify-end"
            style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
            onClick={() => { setDetailPaymentId(null); setDetailBusinessId(null); }}
          >
            <div
              className="w-full max-w-2xl h-full overflow-y-auto"
              style={{ backgroundColor: 'var(--color-background)', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                <h3 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>{detailPaymentId ? 'Detalle del pago' : 'Detalle del negocio'}</h3>
                <button type="button" onClick={() => { setDetailPaymentId(null); setDetailBusinessId(null); }} className="p-2 rounded-lg hover:bg-muted">
                  <Icon name="X" size={18} />
                </button>
              </div>
              <div className="p-4">
                {detailLoading ? (
                  <div className="py-8 text-center text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Cargando...</div>
                ) : detailData ? (
                  <>
                    {detailPaymentId && detailData.payment && (
                      <>
                        <div className="space-y-2 mb-6">
                          <p><strong>ID pago:</strong> <code className="text-xs">{detailData.payment.id}</code></p>
                          <p><strong>Negocio:</strong> {detailData.payment.business_name} <button type="button" className="text-primary text-sm ml-1" onClick={() => { setDetailBusinessId(detailData.payment.business_id); setDetailPaymentId(null); }}>Ver negocio</button></p>
                          <p><strong>Email:</strong> {detailData.payment.user_email || '—'}</p>
                          <p><strong>Plan:</strong> {detailData.payment.plan_slug} · <strong>Monto:</strong> {formatMoney(detailData.payment.amount)}</p>
                          <p><strong>Estado:</strong> <Badge status={detailData.payment.status} /> · <strong>Origen:</strong> {detailData.payment.origin || '—'}</p>
                          <p><strong>external_reference:</strong> <code className="text-xs break-all">{detailData.payment.external_reference}</code></p>
                          <p><strong>MP payment_id:</strong> {detailData.payment.mp_payment_id || '—'}</p>
                          <p><strong>MP preference_id:</strong> {detailData.payment.mp_preference_id || '—'}</p>
                          <p><strong>Vence:</strong> {formatDate(detailData.payment.plan_expires_at)}</p>
                          {detailData.payment.metadata && (
                            <div className="mt-2">
                              <strong>Metadata:</strong>
                              <pre className="text-xs mt-1 p-2 rounded overflow-auto max-h-40" style={{ backgroundColor: 'var(--color-muted)' }}>{JSON.stringify(detailData.payment.metadata, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold mb-2">Eventos webhook</h4>
                        <ul className="space-y-2 mb-4">
                          {(detailData.events || []).map((ev) => (
                            <li key={ev.id} className="text-xs p-2 rounded border" style={{ borderColor: 'var(--color-border)' }}>
                              {formatDate(ev.processed_at)} · mp_status: {ev.mp_status}
                            </li>
                          ))}
                          {(!detailData.events || detailData.events.length === 0) && <li className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>Sin eventos</li>}
                        </ul>
                      </>
                    )}
                    {detailBusinessId && detailData.business && (
                      <>
                        <div className="space-y-2 mb-6">
                          <p><strong>Negocio:</strong> {detailData.business.name}</p>
                          <p><strong>Plan actual:</strong> {detailData.business.plan_slug} · <Badge status={subscriptionStatus(detailData.business.plan_expires_at)} type="subscription" /></p>
                          <p><strong>Vence:</strong> {formatDate(detailData.business.plan_expires_at)}</p>
                        </div>
                        <h4 className="text-sm font-semibold mb-2">Acciones admin</h4>
                        <div className="flex flex-wrap gap-4 mb-4">
                          <ExtendPlanForm businessId={detailBusinessId} onExtend={handleExtendPlan} />
                          <ChangePlanForm businessId={detailBusinessId} currentPlan={detailData.business.plan_slug} onChangePlan={handleChangePlan} />
                        </div>
                        <h4 className="text-sm font-semibold mb-2">Historial de pagos</h4>
                        <ul className="space-y-2">
                          {(detailData.payments || []).map((p) => (
                            <li key={p.id} className="flex items-center justify-between text-sm py-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                              <span>{formatDate(p.created_at)} · {p.plan_slug} · {formatMoney(p.amount)}</span>
                              <Badge status={p.status} />
                              <button type="button" className="text-primary text-xs" onClick={() => { setDetailPaymentId(p.id); setDetailBusinessId(null); }}>Ver</button>
                            </li>
                          ))}
                        </ul>
                        <h4 className="text-sm font-semibold mt-4 mb-2">Auditoría (acciones manuales)</h4>
                        <ul className="space-y-2">
                          {(detailData.auditLog || []).map((a) => (
                            <li key={a.id} className="text-xs p-2 rounded border" style={{ borderColor: 'var(--color-border)' }}>
                              {formatDate(a.created_at)} · {a.action} · {JSON.stringify(a.payload)}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>No se encontraron datos.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ExtendPlanForm({ businessId, onExtend }) {
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    setLoading(true);
    await onExtend(businessId, days, reason || null);
    setLoading(false);
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(parseInt(e.target.value, 10) || 30)} className="w-16 rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)' }} />
      <span className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>días</span>
      <input type="text" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border px-2 py-1 text-sm w-40" style={{ borderColor: 'var(--color-border)' }} />
      <button type="button" disabled={loading} onClick={handleSubmit} className="px-3 py-1.5 rounded text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
        Extender plan
      </button>
    </div>
  );
}

function ChangePlanForm({ businessId, currentPlan, onChangePlan }) {
  const [newPlan, setNewPlan] = useState(currentPlan || 'starter');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    setLoading(true);
    await onChangePlan(businessId, newPlan, reason || null);
    setLoading(false);
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <select value={newPlan} onChange={(e) => setNewPlan(e.target.value)} className="rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)' }}>
        {['starter', 'control', 'pro', 'business'].map((slug) => (
          <option key={slug} value={slug}>{getPlanLabel(slug)}</option>
        ))}
      </select>
      <input type="text" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border px-2 py-1 text-sm w-40" style={{ borderColor: 'var(--color-border)' }} />
      <button type="button" disabled={loading} onClick={handleSubmit} className="px-3 py-1.5 rounded text-sm font-medium text-white" style={{ backgroundColor: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
        Cambiar plan
      </button>
    </div>
  );
}
