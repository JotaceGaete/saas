import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmedEmailGuard } from '../../hooks/useConfirmedEmailGuard';
import { getOrders, updateOrder, expireDeliveredOrders } from '../../services/waBusinessService';
import { useToast } from '../../components/ui/Toast';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import BankTransferSetupSlimAlert from 'components/BankTransferSetupSlimAlert';
import { formatCLP } from '../../utils/formatCLP';
import OrderDetailDrawer from './components/OrderDetailDrawer';
import OrdersKanban from './components/OrdersKanban';
import {
  ACTIVE_DELIVERED_VISIBILITY_MINUTES,
  isOrderVisibleOnActiveBoard,
} from '../../constants/ordersBoard';
import { filterDeliveredOrdersMissingDeliveredAt } from '../../utils/orderDates';
import { celebrarPrimerEnvio } from '../../utils/confettiCelebrations';

const ORDER_STATUSES = [
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

const STATUS_MAP = Object.fromEntries(ORDER_STATUSES?.map(s => [s?.key, s]));
const PAYMENT_STATUS_MAP = Object.fromEntries(PAYMENT_STATUSES?.map(s => [s?.key, s]));

const PRIMARY_HEX = '#7c3aed';

/** Conteo animado al cambiar totales por estado. */
function QuickCount({ value, className, style }) {
  const [display, setDisplay] = useState(() => Number(value) || 0);
  const fromRef = useRef(null);

  useEffect(() => {
    const target = Number(value) || 0;
    if (fromRef.current === null) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    const dur = 280;
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - p) ** 3;
      setDisplay(Math.round(from + (target - from) * eased));
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className={`tabular-nums ${className || ''}`} style={style}>
      {display}
    </span>
  );
}

function orderShortId(id) {
  if (!id) return '—';
  return String(id).slice(0, 8).toUpperCase();
}

function StatusBadge({ status }) {
  const s = STATUS_MAP?.[status] || STATUS_MAP?.pedido;
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

/** Tarjeta compacta sin drag (p. ej. cancelados). */
function CompactOrderCardStatic({ order, formatCLP: fmt, onOpenDetail, shortIdFn }) {
  const qty = (order?.items || []).reduce((acc, i) => acc + (Number(i?.quantity) || 0), 0) || (order?.items || []).length;
  const shortId = shortIdFn(order?.id);
  const timeStr = order?.createdAt ? format(new Date(order.createdAt), 'HH:mm', { locale: es }) : '';
  return (
    <button
      type="button"
      onClick={() => onOpenDetail(order)}
      className="w-full text-left rounded-2xl bg-white p-3 transition-all duration-150 hover:shadow-md hover:scale-[1.01]"
      style={{ boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)' }}
    >
      <p className="text-[10px] font-mono mb-0.5" style={{ color: 'var(--color-muted-foreground)' }}>
        #{shortId}
        {timeStr ? <span className="ml-1.5 font-sans">{timeStr}</span> : null}
      </p>
      <p className="text-sm font-bold truncate tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>{order?.customerName || 'Sin nombre'}</p>
      <div className="flex flex-wrap gap-2 mt-1">
        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-stat)' }}>{fmt(order?.totalAmount)}</span>
        <span className="text-[11px]" style={{ color: 'var(--color-muted-foreground)' }}>{qty} {qty === 1 ? 'producto' : 'productos'}</span>
      </div>
    </button>
  );
}

export default function OrdersPage() {
  const { business, businessLoading } = useAuth();
  const toast = useToast();
  const guard = useConfirmedEmailGuard();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailOrder, setDetailOrder] = useState(null);
  const detailOrderRef = useRef(null);
  useEffect(() => {
    detailOrderRef.current = detailOrder;
  }, [detailOrder]);

  const [boardVisibilityTick, setBoardVisibilityTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setBoardVisibilityTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!business?.id) { setLoading(false); return; }
    setLoading(true);
    await expireDeliveredOrders(business.id);
    const { data, error } = await getOrders(business?.id);
    if (error) {
      toast?.error('Error al cargar los pedidos');
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  }, [business?.id, toast]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  /** Dev: `?debugDeliveredAt=1` lista entregados sin `delivered_at`; `window.__inspectDeliveredAtGaps__()` en cualquier momento. */
  const devDeliveredDebugOnce = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__inspectDeliveredAtGaps__ = () => {
      const missing = filterDeliveredOrdersMissingDeliveredAt(orders);
      if (missing.length) {
        console.table(missing.map((o) => ({ id: o.id, createdAt: o.createdAt })));
      } else {
        console.info('[inspectDeliveredAtGaps] ningún entregado sin deliveredAt en la lista actual');
      }
      return missing;
    };
    return () => {
      delete window.__inspectDeliveredAtGaps__;
    };
  }, [orders]);

  useEffect(() => {
    if (!import.meta.env.DEV || devDeliveredDebugOnce.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('debugDeliveredAt') !== '1') return;
    if (!orders?.length) return;
    devDeliveredDebugOnce.current = true;
    const missing = filterDeliveredOrdersMissingDeliveredAt(orders);
    const entregados = orders.filter((o) => o?.status === 'entregado');
    console.info(
      `[debugDeliveredAt] entregados en lista: ${entregados.length}; sin deliveredAt: ${missing.length}`,
    );
    if (missing.length) {
      console.table(missing.map((o) => ({ id: o.id, createdAt: o.createdAt })));
    }
  }, [orders]);

  useEffect(() => {
    if (!business?.id) return;
    const onVisible = () => { if (document.visibilityState === 'visible') loadOrders(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [business?.id, loadOrders]);

  useEffect(() => {
    if (!business?.id) return;
    const channelName = `wa_orders_business_${business.id}`;
    const ch = supabase
      ?.channel(channelName)
      ?.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wa_orders', filter: `business_id=eq.${business.id}` },
        () => loadOrders()
      )
      ?.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wa_orders', filter: `business_id=eq.${business.id}` },
        () => loadOrders()
      )
      ?.subscribe();
    return () => {
      if (ch) supabase?.removeChannel(ch);
    };
  }, [business?.id, loadOrders]);

  const handleUpdate = useCallback(async (orderId, updates) => {
    return guard.runIfConfirmedAsync(async () => {
      const oid = String(orderId);
      let listSnapshot = null;
      setOrders((prev) => {
        const o = prev?.find((x) => String(x?.id) === oid);
        if (!o) return prev;
        listSnapshot = { ...o };
        return prev?.map((x) => {
          if (String(x?.id) !== oid) return x;
          const merged = { ...x, ...updates };
          if (updates.status === 'entregado' && !merged.deliveredAt) {
            merged.deliveredAt = new Date().toISOString();
          }
          if (updates.status && updates.status !== 'entregado' && x.status === 'entregado') {
            merged.deliveredAt = null;
          }
          if (updates.status === 'enviado' && !merged.sentAt) {
            merged.sentAt = new Date().toISOString();
          }
          if (
            updates.status &&
            (updates.status === 'pedido' || updates.status === 'en_preparacion') &&
            x.status === 'enviado'
          ) {
            merged.sentAt = null;
          }
          return merged;
        });
      });
      if (!listSnapshot) return;

      const shouldCelebratePrimerEnvio =
        updates.status === 'enviado' &&
        listSnapshot.status !== 'enviado' &&
        !(orders || []).some((x) => String(x?.id) !== oid && x?.status === 'enviado');

      const detailSnap =
        detailOrderRef.current?.id != null && String(detailOrderRef.current.id) === oid
          ? { ...detailOrderRef.current }
          : null;
      if (detailSnap) {
        setDetailOrder((prev) => {
          if (!prev || String(prev.id) !== oid) return prev;
          const merged = { ...prev, ...updates };
          if (updates.status === 'entregado' && !merged.deliveredAt) {
            merged.deliveredAt = new Date().toISOString();
          }
          if (updates.status && updates.status !== 'entregado' && prev.status === 'entregado') {
            merged.deliveredAt = null;
          }
          if (updates.status === 'enviado' && !merged.sentAt) {
            merged.sentAt = new Date().toISOString();
          }
          if (
            updates.status &&
            (updates.status === 'pedido' || updates.status === 'en_preparacion') &&
            prev.status === 'enviado'
          ) {
            merged.sentAt = null;
          }
          return merged;
        });
      }

      const { error } = await updateOrder(orderId, updates);
      if (error) {
        toast?.error('No se pudo guardar el cambio.');
        setOrders((prev) => prev?.map((x) => (String(x?.id) === oid ? listSnapshot : x)));
        if (detailSnap) setDetailOrder(detailSnap);
        return;
      }

      if (shouldCelebratePrimerEnvio) {
        celebrarPrimerEnvio();
        toast?.success('¡Felicidades por tu primer envío! 🚀 El camino al éxito acaba de empezar.');
      } else {
        toast?.success(
          updates?.status !== undefined
            ? 'Estado actualizado'
            : updates?.paymentStatus !== undefined
              ? 'Pago actualizado'
              : 'Pedido actualizado',
        );
      }
    });
  }, [guard, toast, orders]);

  const visibleBoardOrders = useMemo(
    () => (orders || []).filter((o) => isOrderVisibleOnActiveBoard(o)),
    [orders, boardVisibilityTick],
  );

  const filteredOrders = useMemo(() => visibleBoardOrders?.filter(o => {
    const status = o?.status || 'pedido';
    const matchStatus = filterStatus === 'all' || status === filterStatus;
    const q = searchQuery?.toLowerCase()?.trim();
    const matchSearch = !q ||
      o?.customerName?.toLowerCase()?.includes(q) ||
      (o?.customerPhone && String(o.customerPhone).toLowerCase().includes(q)) ||
      (o?.id && String(o.id).toLowerCase().includes(q)) ||
      o?.items?.some(i => i?.productName?.toLowerCase()?.includes(q));
    return matchStatus && matchSearch;
  }), [visibleBoardOrders, filterStatus, searchQuery]);

  const boardOrders = useMemo(
    () => filteredOrders.filter(o => (o?.status || 'pedido') !== 'cancelado'),
    [filteredOrders],
  );

  const cancelledFiltered = useMemo(
    () => filteredOrders.filter(o => (o?.status || '') === 'cancelado'),
    [filteredOrders],
  );

  const statusCounts = useMemo(() => {
    const list = visibleBoardOrders || [];
    const c = { all: list.length };
    ORDER_STATUSES.forEach((s) => {
      c[s.key] = list.filter((o) => (o?.status || 'pedido') === s.key).length;
    });
    return c;
  }, [visibleBoardOrders]);

  const [cardAnim, setCardAnim] = useState({ deflate: null, shine: null });
  const prevCountsRef = useRef(null);

  useEffect(() => {
    const next = statusCounts;
    const prev = prevCountsRef.current;
    if (!prev) {
      prevCountsRef.current = { ...next };
      return undefined;
    }
    let decKey = null;
    let maxDec = 0;
    let incKey = null;
    let maxInc = 0;
    for (const k of Object.keys(next)) {
      const d = (prev[k] ?? 0) - (next[k] ?? 0);
      if (d > maxDec) {
        maxDec = d;
        decKey = k;
      }
      const i = (next[k] ?? 0) - (prev[k] ?? 0);
      if (i > maxInc) {
        maxInc = i;
        incKey = k;
      }
    }
    prevCountsRef.current = { ...next };
    if (maxDec > 0 && maxInc > 0 && decKey !== incKey) {
      setCardAnim({ deflate: decKey, shine: incKey });
      const t = window.setTimeout(() => setCardAnim({ deflate: null, shine: null }), 620);
      return () => window.clearTimeout(t);
    }
    if (maxInc > 0 && maxDec === 0 && incKey != null) {
      setCardAnim({ deflate: null, shine: incKey });
      const t = window.setTimeout(() => setCardAnim({ deflate: null, shine: null }), 620);
      return () => window.clearTimeout(t);
    }
    if (maxDec > 0 && maxInc === 0 && decKey != null) {
      setCardAnim({ deflate: decKey, shine: null });
      const t = window.setTimeout(() => setCardAnim({ deflate: null, shine: null }), 620);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [statusCounts]);

  const statusCardAnimClass = (key) => {
    if (cardAnim.deflate === key) return 'animate-status-card-deflate';
    if (cardAnim.shine === key) return 'animate-status-card-shine';
    return '';
  };

  if (businessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <DashboardAppShell backgroundColor="var(--color-background)">
      <DashboardLayoutContent>
        <BankTransferSetupSlimAlert business={business} />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)' }}
            >
              <Icon name="ShoppingBag" size={17} color="#fff" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.02em' }}>Pedidos</h1>
              <p className="text-sm leading-snug" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                <span className="lg:hidden">{visibleBoardOrders?.length ?? 0} en tablero · Desliza columnas en móvil</span>
                <span className="hidden lg:inline">{visibleBoardOrders?.length ?? 0} pedido{(visibleBoardOrders?.length ?? 0) !== 1 ? 's' : ''} en el tablero activo · Arrastra columnas o acciones rápidas · Entregados y cancelados en historial</span>
              </p>
              <p className="text-[11px] mt-1.5 max-w-xl leading-snug hidden sm:block" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                Los entregados antiguos se consultan en Pedidos anteriores (entregados recientes: últimos {ACTIVE_DELIVERED_VISIBILITY_MINUTES} min en este tablero).
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto lg:shrink-0">
            <Link
              to="/orders/historial"
              title="Entregados y cancelados (consulta histórica)"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-muted min-h-[44px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
            >
              <Icon name="History" size={14} />
              Pedidos anteriores
            </Link>
            <button
              type="button"
              onClick={() => loadOrders()}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60 min-h-[44px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
            >
              <Icon name="RefreshCw" size={14} className={loading ? 'animate-spin' : ''} />
              Refrescar
            </button>
          </div>
        </div>

        <div className="flex lg:grid gap-3 lg:gap-3 mb-6 overflow-x-auto lg:overflow-visible pb-2 -mx-1 px-1 lg:mx-0 lg:px-0 lg:grid-cols-6 snap-x snap-mandatory lg:snap-none scroll-smooth [-webkit-overflow-scrolling:touch]">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`group relative shrink-0 snap-start w-[min(46vw,176px)] lg:w-auto overflow-hidden rounded-2xl bg-white p-3.5 lg:p-4 text-left touch-manipulation transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-xl active:translate-y-0 shadow-md ${statusCardAnimClass('all')} ${
              filterStatus === 'all' ? 'ring-2 ring-[#7c3aed]/35 shadow-lg' : ''
            }`}
            style={{
              boxShadow:
                filterStatus === 'all'
                  ? '0 12px 40px -12px rgba(124, 58, 237, 0.28), 0 4px 6px -1px rgba(15, 23, 42, 0.06)'
                  : undefined,
            }}
          >
            <div
              className="absolute left-0 right-0 top-0 h-1.5 rounded-t-2xl"
              style={{ background: `linear-gradient(90deg, ${PRIMARY_HEX}, #a78bfa)` }}
              aria-hidden
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                style={{
                  backgroundColor: 'rgba(124, 58, 237, 0.12)',
                  boxShadow: `0 0 22px -2px ${PRIMARY_HEX}aa, 0 4px 12px -4px rgba(124, 58, 237, 0.35)`,
                }}
              >
                <Icon name="LayoutGrid" size={18} color={PRIMARY_HEX} />
              </div>
              <QuickCount
                value={statusCounts.all}
                className="text-xl font-bold"
                style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}
              />
            </div>
            <p
              className="mt-3 text-xs font-bold tracking-tight"
              style={{
                color: filterStatus === 'all' ? PRIMARY_HEX : 'var(--color-muted-foreground)',
                fontFamily: 'var(--font-caption)',
              }}
            >
              Todos
            </p>
          </button>
          {ORDER_STATUSES?.map((s) => {
            const active = filterStatus === s.key;
            const count = statusCounts[s.key] ?? 0;
            const pulsePending = s.key === 'enviado' && count > 0;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setFilterStatus((prev) => (prev === s.key ? 'all' : s.key))}
                className={`group relative shrink-0 snap-start w-[min(46vw,176px)] lg:w-auto overflow-hidden rounded-2xl bg-white p-3.5 lg:p-4 text-left touch-manipulation transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-xl active:translate-y-0 shadow-md ${statusCardAnimClass(s.key)} ${pulsePending ? 'animate-pulse-slow' : ''}`}
                style={
                  active
                    ? { boxShadow: `0 14px 44px -14px ${s.color}55, 0 0 0 2px ${s.color}44` }
                    : undefined
                }
              >
                <div
                  className="absolute left-0 right-0 top-0 h-1.5 rounded-t-2xl"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                    style={{
                      backgroundColor: s.bg,
                      boxShadow: `0 0 22px -2px ${s.color}cc, 0 6px 16px -6px ${s.color}99`,
                    }}
                  >
                    <Icon name={s.icon} size={17} color={s.color} />
                  </div>
                  <QuickCount
                    value={count}
                    className="text-xl font-bold"
                    style={{ color: s.color, fontFamily: 'var(--font-heading)' }}
                  />
                </div>
                <p
                  className="mt-3 text-xs font-bold tracking-tight"
                  style={{
                    color: active ? s.color : 'var(--color-muted-foreground)',
                    fontFamily: 'var(--font-caption)',
                  }}
                >
                  {s.label}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Icon
              name="Search"
              size={15}
              color="var(--color-muted-foreground)"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e?.target?.value)}
              placeholder="Buscar por cliente, teléfono o producto..."
              className="w-full h-10 pl-9 pr-4 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all"
              style={{
                borderColor: 'var(--color-border)',
                fontFamily: 'var(--font-caption)',
                color: 'var(--color-foreground)',
                backgroundColor: '#fff',
                '--tw-ring-color': 'var(--color-primary)',
              }}
            />
          </div>
          {filterStatus !== 'all' && (
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className="flex items-center gap-1.5 h-10 px-4 rounded-xl border text-sm font-medium transition-colors hover:bg-muted"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)', backgroundColor: '#fff' }}
            >
              <Icon name="X" size={13} />
              Limpiar filtro
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col lg:flex-row gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex-1 rounded-2xl overflow-hidden min-h-[280px] shadow-sm" style={{ backgroundColor: 'var(--color-card)' }}>
                <div className="h-12 bg-muted animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-16 bg-muted rounded-2xl animate-pulse" />
                  <div className="h-16 bg-muted rounded-2xl animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredOrders?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: 'var(--color-muted)' }}
            >
              <Icon name="ShoppingCart" size={28} color="var(--color-muted-foreground)" />
            </div>
            <h3 className="text-base font-semibold mb-1" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
              {searchQuery || filterStatus !== 'all' ? 'Sin resultados' : 'No hay pedidos aún'}
            </h3>
            <p className="text-sm max-w-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {searchQuery || filterStatus !== 'all'
                ? 'No hay coincidencias con el filtro o la búsqueda. Prueba otras opciones.'
                : 'Cuando tus clientes realicen pedidos desde tu catálogo, aparecerán aquí.'}
            </p>
            {(searchQuery || filterStatus !== 'all') && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setFilterStatus('all'); }}
                className="mt-4 px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-caption)' }}
              >
                Ver todos los pedidos
              </button>
            )}
          </div>
        ) : filterStatus === 'cancelado' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cancelledFiltered.map(order => (
              <CompactOrderCardStatic
                key={order.id}
                order={order}
                formatCLP={formatCLP}
                onOpenDetail={setDetailOrder}
                shortIdFn={orderShortId}
              />
            ))}
          </div>
        ) : (
          <>
            <OrdersKanban
              orders={boardOrders}
              onUpdate={handleUpdate}
              onOpenDetail={setDetailOrder}
              formatCLP={formatCLP}
              orderShortId={orderShortId}
            />
            {cancelledFiltered.length > 0 && filterStatus === 'all' && (
              <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <h2 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-muted-foreground)' }}>
                  <Icon name="XCircle" size={16} />
                  Cancelados ({cancelledFiltered.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {cancelledFiltered.map(order => (
                    <CompactOrderCardStatic
                      key={order.id}
                      order={order}
                      formatCLP={formatCLP}
                      onOpenDetail={setDetailOrder}
                      shortIdFn={orderShortId}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {detailOrder && (
          <OrderDetailDrawer
            order={detailOrder}
            business={business}
            businessName={business?.name}
            onClose={() => setDetailOrder(null)}
            onUpdate={handleUpdate}
            statusOptions={ORDER_STATUSES}
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
