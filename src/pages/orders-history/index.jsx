import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import PremiumLoader from 'components/ui/PremiumLoader';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmedEmailGuard } from '../../hooks/useConfirmedEmailGuard';
import { getOrders, updateOrder } from '../../services/waBusinessService';
import { useToast } from '../../components/ui/Toast';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCLP } from '../../utils/formatCLP';
import { ORDERS_HISTORY_FETCH_LIMIT } from '../../constants/ordersHistory';
import { getHistoryPrimaryDateIso } from '../../utils/orderDates';
import OrderDetailDrawer from '../orders/components/OrderDetailDrawer';

const STATUS_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'entregado', label: 'Entregados' },
  { key: 'enviado', label: 'Enviados' },
  { key: 'cancelado', label: 'Cancelados' },
];

const DATE_PRESETS = [
  { key: 'all', label: 'Todo' },
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: '7d', label: 'Últimos 7 días' },
  { key: '30d', label: 'Últimos 30 días' },
];

const ORDER_STATUSES_DRAWER = [
  { key: 'pedido', label: 'Pedido', color: '#6366F1', bg: '#EEF2FF', icon: 'ShoppingBag' },
  { key: 'en_preparacion', label: 'En preparación', color: '#F59E0B', bg: '#FEF3C7', icon: 'ChefHat' },
  { key: 'enviado', label: 'Enviado', color: '#0EA5E9', bg: '#E0F2FE', icon: 'Truck' },
  { key: 'entregado', label: 'Entregado', color: '#10B981', bg: '#D1FAE5', icon: 'PackageCheck' },
  { key: 'cancelado', label: 'Cancelado', color: '#6B7280', bg: '#F3F4F6', icon: 'XCircle' },
];

const PAYMENT_STATUSES = [
  { key: 'pendiente', label: 'Pendiente', color: '#F59E0B', bg: '#FEF3C7', icon: 'Clock' },
  { key: 'pagado', label: 'Pagado', color: '#10B981', bg: '#D1FAE5', icon: 'DollarSign' },
  { key: 'anulado', label: 'Anulado', color: '#6B7280', bg: '#F3F4F6', icon: 'XCircle' },
];

const STATUS_META = {
  pedido: { label: 'Pedido', color: '#6366F1', bg: '#EEF2FF', icon: 'ShoppingBag' },
  en_preparacion: { label: 'En preparación', color: '#F59E0B', bg: '#FEF3C7', icon: 'ChefHat' },
  enviado: { label: 'Enviado', color: '#0EA5E9', bg: '#E0F2FE', icon: 'Truck' },
  entregado: { label: 'Entregado', color: '#10B981', bg: '#D1FAE5', icon: 'PackageCheck' },
  cancelado: { label: 'Cancelado', color: '#6B7280', bg: '#F3F4F6', icon: 'XCircle' },
};

const PAYMENT_STATUS_MAP = Object.fromEntries(PAYMENT_STATUSES?.map(s => [s?.key, s]));

function orderShortId(id) {
  if (!id) return '—';
  return String(id).slice(0, 8).toUpperCase();
}

function productUnits(order) {
  const items = order?.items || [];
  const sum = items.reduce((acc, i) => acc + (Number(i?.quantity) || 0), 0);
  return sum > 0 ? sum : items.length;
}

function getDateRange(preset) {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case '7d':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case '30d':
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    default:
      return null;
  }
}

function StatusBadge({ status }) {
  const s = STATUS_META?.[status] || STATUS_META?.pedido;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ color: s?.color, backgroundColor: s?.bg }}
    >
      <Icon name={s?.icon} size={11} />
      {s?.label}
    </span>
  );
}

function PaymentStatusBadge({ paymentStatus }) {
  const s = PAYMENT_STATUS_MAP?.[paymentStatus] || PAYMENT_STATUS_MAP?.pendiente;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ color: s?.color, backgroundColor: s?.bg }}
    >
      <Icon name={s?.icon} size={11} />
      {s?.label}
    </span>
  );
}

export default function OrdersHistoryPage() {
  const { business, businessLoading } = useAuth();
  const toast = useToast();
  const guard = useConfirmedEmailGuard();
  const [rawOrders, setRawOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('30d');
  const [detailOrder, setDetailOrder] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const loadPastOrders = useCallback(async () => {
    if (!business?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [delivered, sent, cancelled] = await Promise.all([
      getOrders(business.id, { status: 'entregado', limit: ORDERS_HISTORY_FETCH_LIMIT }),
      getOrders(business.id, { status: 'enviado', limit: ORDERS_HISTORY_FETCH_LIMIT }),
      getOrders(business.id, { status: 'cancelado', limit: ORDERS_HISTORY_FETCH_LIMIT }),
    ]);
    const err = delivered.error || sent.error || cancelled.error;
    if (err) {
      toast?.error('Error al cargar el historial');
      setRawOrders([]);
    } else {
      const map = new Map();
      [...(delivered.data || []), ...(sent.data || []), ...(cancelled.data || [])].forEach((o) => {
        if (o?.id) map.set(o.id, o);
      });
      setRawOrders(Array.from(map.values()));
    }
    setLoading(false);
  }, [business?.id, toast]);

  useEffect(() => {
    loadPastOrders();
  }, [loadPastOrders]);

  const filteredOrders = useMemo(() => {
    let list = rawOrders;
    const range = datePreset !== 'all' ? getDateRange(datePreset) : null;
    if (range) {
      list = list.filter((o) => {
        const iso = getHistoryPrimaryDateIso(o);
        const t = iso ? new Date(iso) : null;
        if (!t || Number.isNaN(t.getTime())) return false;
        return t >= range.start && t <= range.end;
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter((o) => (o?.status || '') === statusFilter);
    }
    const q = debouncedSearch.toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o?.customerName?.toLowerCase().includes(q) ||
          String(o?.customerPhone || '')
            .toLowerCase()
            .includes(q) ||
          String(o?.id || '')
            .toLowerCase()
            .includes(q) ||
          orderShortId(o?.id).toLowerCase().includes(q) ||
          o?.items?.some((i) => i?.productName?.toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => {
      const ta = new Date(getHistoryPrimaryDateIso(a) || a?.createdAt || 0).getTime();
      const tb = new Date(getHistoryPrimaryDateIso(b) || b?.createdAt || 0).getTime();
      return tb - ta;
    });
  }, [rawOrders, datePreset, statusFilter, debouncedSearch]);

  const handleUpdate = useCallback(
    async (orderId, updates) => {
      return guard.runIfConfirmedAsync(async () => {
        const { error } = await updateOrder(orderId, updates);
        if (error) {
          toast?.error('No se pudo guardar el cambio.');
          return;
        }
        toast?.success(
          updates?.status !== undefined
            ? 'Estado actualizado'
            : updates?.paymentStatus !== undefined
              ? 'Pago actualizado'
              : 'Pedido actualizado',
        );
        await loadPastOrders();
        setDetailOrder((prev) =>
          prev && String(prev.id) === String(orderId) ? { ...prev, ...updates } : prev,
        );
      });
    },
    [guard, toast, loadPastOrders],
  );

  if (businessLoading) {
    return <PremiumLoader fullScreen business={business} />;
  }

  return (
    <DashboardAppShell backgroundColor="var(--color-background)">
      <DashboardLayoutContent>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <Link
              to="/orders"
              className="flex items-center justify-center w-9 h-9 shrink-0 rounded-xl border transition-colors hover:bg-muted"
              style={{ borderColor: 'var(--color-border)' }}
              aria-label="Volver al tablero de pedidos"
            >
              <Icon name="ArrowLeft" size={18} color="var(--color-muted-foreground)" />
            </Link>
            <div className="min-w-0">
              <h1
                className="text-xl font-bold"
                style={{
                  fontFamily: 'var(--font-heading)',
                  color: 'var(--color-foreground)',
                  letterSpacing: '-0.02em',
                }}
              >
                Pedidos anteriores
              </h1>
              <p
                className="text-sm mt-0.5"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                Entregados y cancelados (consulta histórica). El tablero activo solo muestra pedidos en curso.
              </p>
              <Link
                to="/orders"
                className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
              >
                <Icon name="LayoutGrid" size={14} />
                Volver al tablero activo
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadPastOrders()}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60 w-full sm:w-auto min-h-[44px] shrink-0"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-foreground)',
              fontFamily: 'var(--font-caption)',
              backgroundColor: '#fff',
            }}
          >
            <Icon name="RefreshCw" size={14} className={loading ? 'animate-spin' : ''} />
            Refrescar
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div className="relative">
            <Icon
              name="Search"
              size={15}
              color="var(--color-muted-foreground)"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por cliente, teléfono o producto…"
              className="w-full h-10 pl-9 pr-4 rounded-xl border text-sm focus:outline-none focus:ring-2"
              style={{
                borderColor: 'var(--color-border)',
                fontFamily: 'var(--font-caption)',
                backgroundColor: '#fff',
                '--tw-ring-color': 'var(--color-primary)',
              }}
            />
          </div>

          <div>
            <p
              className="text-[11px] font-semibold mb-2 uppercase tracking-wide"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              Fecha
            </p>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((p) => {
                const active = datePreset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setDatePreset(p.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                    style={{
                      fontFamily: 'var(--font-caption)',
                      borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: active ? 'rgba(124,58,237,0.1)' : '#fff',
                      color: active ? 'var(--color-primary)' : 'var(--color-foreground)',
                      boxShadow: active ? '0 0 0 1px var(--color-primary)' : undefined,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p
              className="text-[11px] font-semibold mb-2 uppercase tracking-wide"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              Estado
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((s) => {
                const active = statusFilter === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStatusFilter(s.key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                    style={{
                      fontFamily: 'var(--font-caption)',
                      borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: active ? 'rgba(124,58,237,0.1)' : '#fff',
                      color: active ? 'var(--color-primary)' : 'var(--color-foreground)',
                      boxShadow: active ? '0 0 0 1px var(--color-primary)' : undefined,
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {loading ? (
          <PremiumLoader business={business} text="Preparando historial..." />
        ) : filteredOrders.length === 0 ? (
          <div
            className="rounded-xl border p-12 text-center mt-6"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}
          >
            <Icon
              name="History"
              size={40}
              color="var(--color-muted-foreground)"
              className="mx-auto mb-3 opacity-60"
            />
            <p
              className="text-sm font-medium"
              style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
            >
              No hay pedidos con estos criterios
            </p>
            <p
              className="text-xs mt-1 max-w-sm mx-auto"
              style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
            >
              Prueba otro rango de fechas, estado o búsqueda. Incluye entregados, enviados y cancelados recientes.
            </p>
          </div>
        ) : (
          <div
            className="rounded-xl border overflow-hidden mt-6"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]" style={{ fontFamily: 'var(--font-caption)' }}>
                <thead>
                  <tr
                    className="text-left border-b"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-muted)' }}
                  >
                    <th className="px-3 py-2.5 font-semibold text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                      Pedido
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                      Cliente
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-xs whitespace-nowrap" style={{ color: 'var(--color-muted-foreground)' }}>
                      Fecha y hora
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-xs text-right" style={{ color: 'var(--color-muted-foreground)' }}>
                      Total
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-xs text-center" style={{ color: 'var(--color-muted-foreground)' }}>
                      Productos
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
                      Estado
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-xs w-32" style={{ color: 'var(--color-muted-foreground)' }}>
                      Pago
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-xs w-28" style={{ color: 'var(--color-muted-foreground)' }} />
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const qty = productUnits(order);
                    const primaryIso = getHistoryPrimaryDateIso(order);
                    return (
                      <tr key={order.id} className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                        <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap" style={{ color: 'var(--color-foreground)' }}>
                          #{orderShortId(order.id)}
                        </td>
                        <td className="px-3 py-2.5 max-w-[200px]">
                          <span className="truncate block font-medium">{order.customerName || '—'}</span>
                          {order.customerPhone && (
                            <span
                              className="text-xs block truncate"
                              style={{ color: 'var(--color-muted-foreground)' }}
                            >
                              {order.customerPhone}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-foreground)' }}>
                          {primaryIso
                            ? format(new Date(primaryIso), "d MMM yyyy, HH:mm", { locale: es })
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                          {formatCLP(order.totalAmount)}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums">{qty}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-3 py-2.5">
                          <PaymentStatusBadge paymentStatus={order.paymentStatus} />
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setDetailOrder(order)}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-muted whitespace-nowrap"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden p-3 space-y-3" style={{ backgroundColor: 'var(--color-background)' }}>
              {filteredOrders.map((order) => {
                const qty = productUnits(order);
                const primaryIso = getHistoryPrimaryDateIso(order);
                return (
                  <div
                    key={order.id}
                    className="rounded-xl border p-3.5 shadow-sm"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: '#fff' }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-mono text-xs font-semibold" style={{ color: 'var(--color-foreground)' }}>
                        #{orderShortId(order.id)}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-sm font-semibold leading-snug break-words" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
                      {order.customerName || '—'}
                    </p>
                    {order.customerPhone ? (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        {order.customerPhone}
                      </p>
                    ) : null}
                    <p className="text-xs mt-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                      {primaryIso
                        ? format(new Date(primaryIso), "d MMM yyyy, HH:mm", { locale: es })
                        : '—'}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}>
                        {formatCLP(order.totalAmount)}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        {qty} prod.
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Pago</span>
                      <PaymentStatusBadge paymentStatus={order.paymentStatus} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailOrder(order)}
                      className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold border transition-colors hover:bg-muted min-h-[44px]"
                      style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)', backgroundColor: 'rgba(124,58,237,0.06)' }}
                    >
                      Ver detalle
                    </button>
                  </div>
                );
              })}
            </div>

            <p
              className="text-xs px-3 py-2 border-t"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)' }}
            >
              Mostrando {filteredOrders.length} pedido{filteredOrders.length !== 1 ? 's' : ''}
              {rawOrders.length > 0 ? ` · Cargados hasta ${rawOrders.length} entre entregados y cancelados` : ''}
            </p>
          </div>
        )}

        {detailOrder && (
          <OrderDetailDrawer
            order={detailOrder}
            business={business}
            businessName={business?.name}
            onClose={() => setDetailOrder(null)}
            onUpdate={handleUpdate}
            statusOptions={ORDER_STATUSES_DRAWER}
            paymentStatusOptions={PAYMENT_STATUSES}
            StatusBadge={StatusBadge}
            PaymentStatusBadge={PaymentStatusBadge}
            formatCLP={formatCLP}
            orderShortId={orderShortId}
          />
        )}
      </DashboardLayoutContent>
    </DashboardAppShell>
  );
}
