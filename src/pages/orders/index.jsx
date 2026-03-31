import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import DashboardAppShell from 'components/ui/DashboardAppShell';
import DashboardLayoutContent from 'components/ui/DashboardLayoutContent';
import Icon from 'components/AppIcon';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirmedEmailGuard } from '../../hooks/useConfirmedEmailGuard';
import {
  getOrders,
  getOrderById,
  updateOrder,
  expireDeliveredOrders,
  mapOrderFromDb,
} from '../../services/waBusinessService';
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
import { isOrdersRenderDebug, ordersDebugSeq } from './ordersRenderDebug';
import {
  isOrdersDoubleFlickerDebug,
  ordersDoubleFlickerLog,
  startOrdersDoubleFlickerSession,
} from './ordersDoubleFlickerLog';

/** Ventana única: skip realtime UPDATE mientras el optimistic + API cubren el mismo cambio. */
const LOCAL_UPDATE_REALTIME_SKIP_MS = 3000;

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

/**
 * Merge incremental desde fila realtime (sin join de items en UPDATE típico).
 * Evita reemplazar `items` con [] cuando el payload no trae `wa_order_items`.
 */
function mergeOrderFromRealtimeRow(prev, row) {
  if (!row?.id) return null;
  const mapped = mapOrderFromDb(row);
  if (!prev) return mapped;
  const hasItemsPayload = Array.isArray(row.wa_order_items);
  return {
    ...mapped,
    items: hasItemsPayload ? mapped.items : prev.items,
  };
}

/** Evita segundo setOrders/repaint si el merge realtime no cambia nada visible en tablero/resumen. */
function isOrderKanbanMergeRedundant(prevOrder, merged) {
  if (!prevOrder || !merged) return false;
  return (
    prevOrder.status === merged.status &&
    prevOrder.paymentStatus === merged.paymentStatus &&
    String(prevOrder.deliveredAt || '') === String(merged.deliveredAt || '') &&
    String(prevOrder.sentAt || '') === String(merged.sentAt || '') &&
    (Number(prevOrder.totalAmount) || 0) === (Number(merged.totalAmount) || 0)
  );
}

/** Conteo animado al cambiar totales por estado. */
const QuickCount = React.memo(function QuickCount({ value, className, style }) {
  const [display, setDisplay] = useState(() => Number(value) || 0);
  const fromRef = useRef(null);

  useEffect(() => {
    if (isOrdersDoubleFlickerDebug()) {
      ordersDoubleFlickerLog('QuickCount:value effect', { value: Number(value) || 0 });
    }
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
});

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
  /** Solo callbacks estables; el objeto `useToast()` cambia de referencia en cada render del ToastProvider. */
  const { error: toastError, success: toastSuccess } = useToast();
  const guard = useConfirmedEmailGuard();
  const [orders, setOrders] = useState([]);
  const ordersRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCancelledSection, setShowCancelledSection] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);
  const detailOrderRef = useRef(null);
  const loadingRef = useRef(true);
  const isUpdatingOrderRef = useRef(false);
  const updatingUntilRef = useRef(0);
  const businessIdRef = useRef(null);
  const pendingRealtimeSkipsRef = useRef(new Map());
  const setDetailOrderTracked = useCallback((nextOrUpdater, source = 'unknown') => {
    setDetailOrder((prev) => {
      const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
      if (isOrdersDoubleFlickerDebug()) {
        ordersDoubleFlickerLog('setDetailOrder', {
          source,
          prevId: prev?.id ?? null,
          nextId: next?.id ?? null,
          prevStatus: prev?.status ?? null,
          nextStatus: next?.status ?? null,
          changedRef: next !== prev,
        });
      }
      return next;
    });
  }, []);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    detailOrderRef.current = detailOrder;
  }, [detailOrder]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    businessIdRef.current = business?.id ?? null;
  }, [business?.id]);

  const [boardVisibilityTick, setBoardVisibilityTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setBoardVisibilityTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  /**
   * Regla: `loadOrders` solo puede correr por razones explícitas:
   * - 'initial_mount'
   * - 'business_change'
   * - 'manual_refresh'
   *
   * Además se bloquea durante 3s tras `handleUpdate` para evitar pisar estado local.
   */
  const loadOrders = useCallback(async ({ reason, silent = false } = {}) => {
    if (!reason) throw new Error('OrdersPage.loadOrders: reason is required');
    const allowedReasons = new Set(['initial_mount', 'business_change', 'manual_refresh']);
    const now = Date.now();
    const blockedByUpdate = isUpdatingOrderRef.current && updatingUntilRef.current > now;
    const allowed = allowedReasons.has(reason);

    if (isOrdersRenderDebug()) {
      ordersDebugSeq('loadOrders:call', { reason, silent, businessId: business?.id ?? null });
    }
    if (isOrdersDoubleFlickerDebug()) {
      ordersDoubleFlickerLog('loadOrders:call', {
        reason,
        allowed,
        blockedByUpdate,
        silent,
        businessId: business?.id ?? null,
        updatingUntil: updatingUntilRef.current || null,
      });
    }

    if (!allowed) {
      if (isOrdersDoubleFlickerDebug()) {
        ordersDoubleFlickerLog('loadOrders:blocked (reason not allowed)', { reason });
      }
      return;
    }
    if (blockedByUpdate) {
      if (isOrdersDoubleFlickerDebug()) {
        ordersDoubleFlickerLog('loadOrders:blocked (local update window)', {
          reason,
          msLeft: Math.max(0, updatingUntilRef.current - now),
        });
      }
      return;
    }

    if (!business?.id) {
      if (!silent) {
        if (isOrdersDoubleFlickerDebug()) {
          ordersDoubleFlickerLog('setLoading', {
            from: 'loadOrders',
            value: false,
            prevValue: loadingRef.current,
            changedValue: loadingRef.current !== false,
          });
        }
        setLoading(false);
      }
      return;
    }
    if (!silent) {
      if (isOrdersDoubleFlickerDebug()) {
        ordersDoubleFlickerLog('setLoading', {
          from: 'loadOrders',
          value: true,
          prevValue: loadingRef.current,
          changedValue: loadingRef.current !== true,
        });
      }
      setLoading(true);
    }
    await expireDeliveredOrders(business.id);
    const { data, error } = await getOrders(business?.id);
    if (error) {
      toastError('Error al cargar los pedidos');
    } else {
      if (isOrdersRenderDebug()) {
        ordersDebugSeq('loadOrders:setOrders(full replace)', {
          silent,
          count: (data || []).length,
        });
      }
      if (isOrdersDoubleFlickerDebug()) {
        ordersDoubleFlickerLog('setOrders:call', {
          label: 'loadOrders:full replace',
          reason,
          count: (data || []).length,
          silent,
        });
      }
      setOrders((prev) => {
        const next = data || [];
        if (isOrdersDoubleFlickerDebug()) {
          ordersDoubleFlickerLog('setOrders', {
            label: 'loadOrders:full replace',
            reason,
            prevLen: prev?.length ?? 0,
            nextLen: next?.length ?? 0,
            changedRef: next !== prev,
          });
        }
        return next;
      });
    }
    if (!silent) {
      if (isOrdersDoubleFlickerDebug()) {
        ordersDoubleFlickerLog('setLoading', {
          from: 'loadOrders',
          value: false,
          prevValue: loadingRef.current,
          changedValue: loadingRef.current !== false,
        });
      }
      setLoading(false);
    }
  }, [business?.id, toastError]);

  /** Solo carga inicial / cambio de negocio — no debe re-ejecutarse por re-renders del Toast u otros contextos. */
  useEffect(() => {
    if (!business?.id) return;
    // Carga inicial (1 vez por business.id)
    loadOrders({ reason: 'initial_mount', silent: false });
  }, [business?.id, loadOrders]);

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
    const channelName = `wa_orders_business_${business.id}`;
    const ch = supabase
      ?.channel(channelName)
      ?.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wa_orders', filter: `business_id=eq.${business.id}` },
        (payload) => {
          const id = payload?.new?.id;
          if (isOrdersRenderDebug()) {
            ordersDebugSeq('realtime:INSERT', { id: id ?? null });
          }
          if (isOrdersDoubleFlickerDebug()) {
            ordersDoubleFlickerLog('realtime:INSERT received', { id: id ?? null });
          }
          if (!id) {
            if (isOrdersDoubleFlickerDebug()) ordersDoubleFlickerLog('realtime:INSERT skipped (no id, no full reload)', {});
            return;
          }
          void (async () => {
            const { data, error } = await getOrderById(id);
            if (error || !data) {
              if (isOrdersDoubleFlickerDebug()) {
                ordersDoubleFlickerLog('realtime:INSERT getOrderById failed (no full reload)', { id: String(id) });
              }
              toastError('No se pudo cargar un pedido nuevo. Usa Refrescar si hace falta.');
              return;
            }
            if (isOrdersRenderDebug()) {
              ordersDebugSeq('realtime:INSERT merge (getOrderById)', { id: String(id) });
            }
            setOrders((prev) => {
              const sid = String(id);
              const idx = prev.findIndex((o) => String(o?.id) === sid);
              let next;
              if (idx >= 0) {
                next = [...prev];
                next[idx] = data;
              } else {
                next = [data, ...prev];
              }
              if (isOrdersDoubleFlickerDebug()) {
                ordersDoubleFlickerLog('setOrders', {
                  label: 'realtime:INSERT merge',
                  id: sid,
                  prevLen: prev?.length ?? 0,
                  nextLen: next?.length ?? 0,
                  changedRef: next !== prev,
                });
              }
              return next;
            });
          })();
        },
      )
      ?.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wa_orders', filter: `business_id=eq.${business.id}` },
        (payload) => {
          const row = payload?.new;
          if (isOrdersRenderDebug()) {
            ordersDebugSeq('realtime:UPDATE received', {
              id: row?.id ?? null,
              order_status: row?.order_status ?? null,
              updated_at: row?.updated_at ?? null,
            });
          }
          if (isOrdersDoubleFlickerDebug()) {
            ordersDoubleFlickerLog('realtime:UPDATE received', {
              id: row?.id ?? null,
              order_status: row?.order_status ?? null,
              updated_at: row?.updated_at ?? null,
            });
          }
          if (!row?.id) {
            if (isOrdersDoubleFlickerDebug()) ordersDoubleFlickerLog('realtime:UPDATE skipped (no id, no full reload)', {});
            return;
          }
          const orderId = String(row.id);
          const expiresAt = pendingRealtimeSkipsRef.current.get(orderId);
          if (expiresAt && expiresAt > Date.now()) {
            if (isOrdersRenderDebug()) {
              ordersDebugSeq('realtime:UPDATE skipped (pending local window)', {
                orderId,
                until: expiresAt,
              });
            }
            if (isOrdersDoubleFlickerDebug()) {
              ordersDoubleFlickerLog('realtime:UPDATE skipped (local skip window)', {
                orderId,
                until: expiresAt,
                msLeft: Math.round(expiresAt - Date.now()),
              });
            }
            return;
          }
          if (expiresAt) pendingRealtimeSkipsRef.current.delete(orderId);

          setOrders((prev) => {
            const idx = prev.findIndex((o) => String(o?.id) === orderId);
            if (idx < 0) {
              if (isOrdersRenderDebug()) {
                ordersDebugSeq('realtime:UPDATE order not in list → getOrderById', { orderId });
              }
              if (isOrdersDoubleFlickerDebug()) {
                ordersDoubleFlickerLog('realtime:UPDATE fetch missing order', { orderId });
              }
              void getOrderById(orderId).then(({ data }) => {
                if (!data) return;
                setOrders((p) => {
                  if (p.some((o) => String(o?.id) === orderId)) {
                    if (isOrdersDoubleFlickerDebug()) {
                      ordersDoubleFlickerLog('setOrders', {
                        label: 'realtime:UPDATE after getOrderById (noop exists)',
                        orderId,
                        prevLen: p?.length ?? 0,
                        nextLen: p?.length ?? 0,
                        changedRef: false,
                      });
                    }
                    return p;
                  }
                  const next = [data, ...p];
                  if (isOrdersDoubleFlickerDebug()) {
                    ordersDoubleFlickerLog('setOrders', {
                      label: 'realtime:UPDATE after getOrderById',
                      orderId,
                      prevLen: p?.length ?? 0,
                      nextLen: next?.length ?? 0,
                      changedRef: next !== p,
                    });
                  }
                  return next;
                });
              });
              if (isOrdersDoubleFlickerDebug()) {
                ordersDoubleFlickerLog('setOrders', {
                  label: 'realtime:UPDATE merge (noop missing in list)',
                  orderId,
                  prevLen: prev?.length ?? 0,
                  nextLen: prev?.length ?? 0,
                  changedRef: false,
                });
              }
              return prev;
            }
            const merged = mergeOrderFromRealtimeRow(prev[idx], row);
            if (!merged) {
              if (isOrdersDoubleFlickerDebug()) {
                ordersDoubleFlickerLog('setOrders', {
                  label: 'realtime:UPDATE merge (noop merged null)',
                  orderId,
                  prevLen: prev?.length ?? 0,
                  nextLen: prev?.length ?? 0,
                  changedRef: false,
                });
              }
              return prev;
            }
            if (isOrderKanbanMergeRedundant(prev[idx], merged)) {
              if (isOrdersDoubleFlickerDebug()) {
                ordersDoubleFlickerLog('realtime:UPDATE merge skipped (redundant vs list)', { orderId });
                ordersDoubleFlickerLog('setOrders', {
                  label: 'realtime:UPDATE merge (noop redundant)',
                  orderId,
                  prevLen: prev?.length ?? 0,
                  nextLen: prev?.length ?? 0,
                  changedRef: false,
                });
              }
              return prev;
            }
            if (isOrdersRenderDebug()) {
              ordersDebugSeq('realtime:UPDATE merge row', {
                orderId,
                prevStatus: prev[idx]?.status,
                nextStatus: merged?.status,
              });
            }
            if (isOrdersDoubleFlickerDebug()) {
              ordersDoubleFlickerLog('setOrders', {
                label: 'realtime:UPDATE merge',
                orderId,
                prevStatus: prev[idx]?.status,
                nextStatus: merged?.status,
                prevLen: prev?.length ?? 0,
                nextLen: prev?.length ?? 0,
                changedRef: true,
              });
            }
            const next = [...prev];
            next[idx] = merged;
            return next;
          });

          setDetailOrder((prev) => {
            if (!prev || String(prev.id) !== orderId) {
              if (isOrdersDoubleFlickerDebug()) {
                ordersDoubleFlickerLog('setDetailOrder', {
                  label: 'realtime:UPDATE merge (noop different detail)',
                  orderId,
                  changedRef: false,
                });
              }
              return prev;
            }
            const merged = mergeOrderFromRealtimeRow(prev, row);
            if (!merged) {
              if (isOrdersDoubleFlickerDebug()) {
                ordersDoubleFlickerLog('setDetailOrder', {
                  label: 'realtime:UPDATE merge (noop merged null)',
                  orderId,
                  changedRef: false,
                });
              }
              return prev;
            }
            if (isOrderKanbanMergeRedundant(prev, merged)) {
              if (isOrdersDoubleFlickerDebug()) {
                ordersDoubleFlickerLog('setDetailOrder', {
                  label: 'realtime:UPDATE merge (noop redundant)',
                  orderId,
                  changedRef: false,
                });
              }
              return prev;
            }
            if (isOrdersDoubleFlickerDebug()) {
              ordersDoubleFlickerLog('setDetailOrder', {
                label: 'realtime:UPDATE merge',
                orderId,
                prevStatus: prev?.status,
                nextStatus: merged?.status,
                changedRef: merged !== prev,
              });
            }
            return merged;
          });
        },
      )
      ?.on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'wa_orders', filter: `business_id=eq.${business.id}` },
        (payload) => {
          const id = String(payload?.old?.id || '');
          if (isOrdersRenderDebug()) {
            ordersDebugSeq('realtime:DELETE', { id: id || null });
          }
          if (!id) return;
          if (isOrdersDoubleFlickerDebug()) {
            ordersDoubleFlickerLog('realtime:DELETE', { id });
          }
          setOrders((prev) => {
            const next = prev.filter((o) => String(o?.id) !== id);
            if (isOrdersDoubleFlickerDebug()) {
              ordersDoubleFlickerLog('setOrders', {
                label: 'realtime:DELETE filter',
                id,
                prevLen: prev?.length ?? 0,
                nextLen: next?.length ?? 0,
                changedRef: next !== prev,
              });
            }
            return next;
          });
          setDetailOrder((prev) => {
            const next = prev && String(prev.id) === id ? null : prev;
            if (isOrdersDoubleFlickerDebug()) {
              ordersDoubleFlickerLog('setDetailOrder', {
                label: 'realtime:DELETE',
                id,
                changedRef: next !== prev,
              });
            }
            return next;
          });
        },
      )
      ?.subscribe();
    return () => {
      if (ch) supabase?.removeChannel(ch);
    };
  }, [business?.id, toastError]);

  const handleUpdate = useCallback(async (orderId, updates) => {
    return guard.runIfConfirmedAsync(async () => {
      const oid = String(orderId);
      const current = ordersRef.current?.find((x) => String(x?.id) === oid);
      if (updates?.status != null && current) {
        const cur = current.status || 'pedido';
        if (updates.status === cur) {
          console.warn('[orders] handleUpdate skipped (noop): status already matches', {
            orderId: oid,
            currentStatus: cur,
          });
          return;
        }
      }
      if (updates?.paymentStatus != null && current) {
        const curPay = current.paymentStatus || 'pendiente';
        if (updates.paymentStatus === curPay) {
          console.warn('[orders] handleUpdate skipped (noop): paymentStatus already matches', {
            orderId: oid,
            currentPaymentStatus: curPay,
          });
          return;
        }
      }
      if (isOrdersDoubleFlickerDebug()) {
        startOrdersDoubleFlickerSession('handleUpdate', { orderId: oid, updates });
        ordersDoubleFlickerLog('handleUpdate:begin (click / action)', { orderId: oid, updates });
      }
      // Bloquea refetch accidental que pisa estado local post-optimistic.
      isUpdatingOrderRef.current = true;
      updatingUntilRef.current = Date.now() + 3000;
      if (isOrdersDoubleFlickerDebug()) {
        ordersDoubleFlickerLog('guard:isUpdatingOrderRef', {
          value: true,
          until: updatingUntilRef.current,
          ms: 3000,
        });
      }
      window.setTimeout(() => {
        if (Date.now() >= updatingUntilRef.current) {
          isUpdatingOrderRef.current = false;
          if (isOrdersDoubleFlickerDebug()) {
            ordersDoubleFlickerLog('guard:isUpdatingOrderRef', { value: false });
          }
        }
      }, 3100);
      if (isOrdersRenderDebug()) {
        ordersDebugSeq('handleUpdate:begin (before optimistic)', { orderId: oid, updates });
      }
      let listSnapshot = null;
      setOrders((prev) => {
        const o = prev?.find((x) => String(x?.id) === oid);
        if (!o) {
          if (isOrdersDoubleFlickerDebug()) {
            ordersDoubleFlickerLog('setOrders', {
              label: 'optimistic (noop order not found)',
              orderId: oid,
              prevLen: prev?.length ?? 0,
              nextLen: prev?.length ?? 0,
              changedRef: false,
            });
          }
          return prev;
        }
        listSnapshot = { ...o };
        if (isOrdersRenderDebug()) {
          ordersDebugSeq('optimistic:setOrders (updater running)', {
            orderId: oid,
            prevStatus: o?.status,
          });
        }
        const next = prev?.map((x) => {
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
        if (isOrdersDoubleFlickerDebug()) {
          const nextOrder = next?.find((x) => String(x?.id) === oid);
          ordersDoubleFlickerLog('setOrders', {
            label: 'optimistic',
            orderId: oid,
            prevStatus: o?.status,
            nextStatus: nextOrder?.status,
            prevLen: prev?.length ?? 0,
            nextLen: next?.length ?? 0,
            changedRef: next !== prev,
          });
        }
        return next;
      });
      if (!listSnapshot) return;
      const skipUntil = Date.now() + LOCAL_UPDATE_REALTIME_SKIP_MS;
      if (isOrdersDoubleFlickerDebug()) {
        ordersDoubleFlickerLog('pendingRealtimeSkipsRef.set', { orderId: oid, skipUntil, ms: LOCAL_UPDATE_REALTIME_SKIP_MS });
      }
      if (isOrdersRenderDebug()) {
        ordersDebugSeq('optimistic:after setOrders scheduled', {
          orderId: oid,
          skipRealtimeUntil: skipUntil,
        });
      }
      pendingRealtimeSkipsRef.current.set(oid, skipUntil);

      const detailSnap =
        detailOrderRef.current?.id != null && String(detailOrderRef.current.id) === oid
          ? { ...detailOrderRef.current }
          : null;
      if (detailSnap) {
        if (isOrdersDoubleFlickerDebug()) {
          ordersDoubleFlickerLog('setDetailOrder:call', { label: 'optimistic (drawer open)', orderId: oid });
        }
        setDetailOrder((prev) => {
          if (!prev || String(prev.id) !== oid) {
            if (isOrdersDoubleFlickerDebug()) {
              ordersDoubleFlickerLog('setDetailOrder', {
                label: 'optimistic (noop different detail)',
                orderId: oid,
                changedRef: false,
              });
            }
            return prev;
          }
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
          if (isOrdersDoubleFlickerDebug()) {
            ordersDoubleFlickerLog('setDetailOrder', {
              label: 'optimistic',
              orderId: oid,
              prevStatus: prev?.status,
              nextStatus: merged?.status,
              changedRef: merged !== prev,
            });
          }
          return merged;
        });
      }

      const { error } = await updateOrder(orderId, updates);
      if (error) {
        if (isOrdersDoubleFlickerDebug()) {
          ordersDoubleFlickerLog('handleUpdate:API error → rollback', { orderId: oid });
        }
        if (isOrdersRenderDebug()) {
          ordersDebugSeq('handleUpdate:API error → rollback', { orderId: oid });
        }
        toastError('No se pudo guardar el cambio.');
        setOrders((prev) => {
          const next = prev?.map((x) => (String(x?.id) === oid ? listSnapshot : x));
          if (isOrdersDoubleFlickerDebug()) {
            ordersDoubleFlickerLog('setOrders', {
              label: 'rollback',
              orderId: oid,
              prevLen: prev?.length ?? 0,
              nextLen: next?.length ?? 0,
              changedRef: next !== prev,
            });
          }
          return next;
        });
        if (detailSnap) {
          setDetailOrder((prev) => {
            const next = detailSnap;
            if (isOrdersDoubleFlickerDebug()) {
              ordersDoubleFlickerLog('setDetailOrder', {
                label: 'rollback',
                orderId: oid,
                prevStatus: prev?.status,
                nextStatus: next?.status,
                changedRef: next !== prev,
              });
            }
            return next;
          });
        }
        pendingRealtimeSkipsRef.current.delete(oid);
        return;
      }

      if (isOrdersDoubleFlickerDebug()) {
        ordersDoubleFlickerLog('handleUpdate:API ok (no early skip delete — expiry only)', { orderId: oid });
      }
      if (isOrdersRenderDebug()) {
        ordersDebugSeq('handleUpdate:API ok', { orderId: oid });
      }
      toastSuccess(
        updates?.status !== undefined
          ? 'Estado actualizado'
          : updates?.paymentStatus !== undefined
            ? 'Pago actualizado'
            : 'Pedido actualizado',
      );
    });
  }, [guard, toastError, toastSuccess]);

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

  useEffect(() => {
    if (!isOrdersDoubleFlickerDebug()) return;
    ordersDoubleFlickerLog('derived:orders state (new reference)', { len: orders?.length });
  }, [orders]);

  useEffect(() => {
    if (!isOrdersDoubleFlickerDebug()) return;
    ordersDoubleFlickerLog('derived:visibleBoardOrders', {
      len: visibleBoardOrders?.length ?? 0,
      ids: (visibleBoardOrders || []).map((o) => String(o?.id)).slice(0, 12).join(','),
    });
  }, [visibleBoardOrders]);

  useEffect(() => {
    if (!isOrdersDoubleFlickerDebug()) return;
    ordersDoubleFlickerLog('derived:statusCounts', { ...statusCounts });
  }, [statusCounts]);

  useEffect(() => {
    if (!isOrdersDoubleFlickerDebug()) return;
    ordersDoubleFlickerLog('state:detailOrder', {
      id: detailOrder?.id ?? null,
      status: detailOrder?.status ?? null,
    });
  }, [detailOrder]);

  useEffect(() => {
    if (!isOrdersDoubleFlickerDebug()) return;
    ordersDoubleFlickerLog('state:loading', { loading });
  }, [loading]);

  useEffect(() => {
    if (!isOrdersDoubleFlickerDebug()) return;
    ordersDoubleFlickerLog('state:filterStatus', { filterStatus });
  }, [filterStatus]);

  if (isOrdersRenderDebug()) {
    console.count('[render] OrdersPage');
  }
  if (isOrdersDoubleFlickerDebug()) {
    ordersDoubleFlickerLog('render:OrdersPage', {
      loading,
      visibleBoardOrders: visibleBoardOrders?.length ?? 0,
      filterStatus,
    });
  }

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
              onClick={() => loadOrders({ reason: 'manual_refresh', silent: false })}
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
            className={`group relative shrink-0 snap-start w-[min(46vw,176px)] lg:w-auto overflow-hidden rounded-2xl bg-white p-3.5 lg:p-4 text-left touch-manipulation transition-shadow duration-200 shadow-sm ${
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
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setFilterStatus((prev) => (prev === s.key ? 'all' : s.key))}
                className="group relative shrink-0 snap-start w-[min(46vw,176px)] lg:w-auto overflow-hidden rounded-2xl bg-white p-3.5 lg:p-4 text-left touch-manipulation transition-shadow duration-200 shadow-sm"
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
                onOpenDetail={(o) => setDetailOrderTracked(o, 'CompactOrderCardStatic:open')}
                shortIdFn={orderShortId}
              />
            ))}
          </div>
        ) : (
          <>
            <OrdersKanban
              orders={boardOrders}
              onUpdate={handleUpdate}
              onOpenDetail={(o) => setDetailOrderTracked(o, 'OrdersKanban:openDetail')}
              formatCLP={formatCLP}
              orderShortId={orderShortId}
            />
            {cancelledFiltered.length > 0 && filterStatus === 'all' && (
              <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setShowCancelledSection((prev) => !prev)}
                  className="w-full mb-3 flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: '#fff' }}
                  aria-expanded={showCancelledSection}
                  aria-controls="orders-cancelled-section"
                >
                  <span className="text-sm font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-muted-foreground)' }}>
                    <Icon name="XCircle" size={16} />
                    Cancelados ({cancelledFiltered.length}) {showCancelledSection ? '▾' : '▸'}
                  </span>
                </button>
                <div
                  id="orders-cancelled-section"
                  className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${showCancelledSection ? 'max-h-[1400px] opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                    {cancelledFiltered.map(order => (
                      <CompactOrderCardStatic
                        key={order.id}
                        order={order}
                        formatCLP={formatCLP}
                        onOpenDetail={(o) => setDetailOrderTracked(o, 'CancelledSection:openDetail')}
                        shortIdFn={orderShortId}
                      />
                    ))}
                  </div>
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
            onClose={() => setDetailOrderTracked(null, 'OrderDetailDrawer:close')}
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
