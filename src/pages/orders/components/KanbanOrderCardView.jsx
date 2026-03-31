import React, { useEffect } from 'react';
import Icon from 'components/AppIcon';
import { getOrderCardTimeCaption } from 'utils/orderDates';
import PaymentStatusToggle from './PaymentStatusToggle';
import { isOrdersRenderDebug } from '../ordersRenderDebug';
import { isOrdersDoubleFlickerDebug, ordersDoubleFlickerLog } from '../ordersDoubleFlickerLog';

const STATUS_BADGE = {
  pedido: { label: 'Pedido', color: '#6366F1', bg: 'rgba(99,102,241,0.14)', icon: 'ShoppingBag' },
  en_preparacion: { label: 'En preparación', color: '#B45309', bg: 'rgba(245, 158, 11, 0.22)', icon: 'ChefHat' },
  enviado: { label: 'Enviado', color: '#0369A1', bg: 'rgba(14, 165, 233, 0.18)', icon: 'Truck' },
  entregado: { label: 'Entregado', color: '#059669', bg: 'rgba(16, 185, 129, 0.18)', icon: 'PackageCheck' },
  cancelado: { label: 'Cancelado', color: '#6B7280', bg: 'rgba(107, 114, 128, 0.16)', icon: 'XCircle' },
};

/** Fuente canónica: `order.status` (mapeado desde `order_status` en BD). */
export function getCanonicalOrderStatus(order) {
  return order?.status || 'pedido';
}

function OrderStatusBadge({ status }) {
  const s = status || 'pedido';
  const cfg = STATUS_BADGE[s];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 max-w-full"
      style={{ color: cfg.color, backgroundColor: cfg.bg, fontFamily: 'var(--font-caption)' }}
    >
      <Icon name={cfg.icon} size={10} color={cfg.color} className="shrink-0" />
      <span className="truncate">{cfg.label}</span>
    </span>
  );
}

function productUnits(order) {
  const items = order?.items || [];
  const sum = items.reduce((acc, i) => acc + (Number(i?.quantity) || 0), 0);
  return sum > 0 ? sum : items.length;
}

function orderShortIdLocal(id) {
  if (!id) return '—';
  return String(id).slice(0, 8).toUpperCase();
}

function nextQuickStatus(order) {
  const s = getCanonicalOrderStatus(order);
  if (s === 'cancelado' || s === 'entregado') return null;
  if (s === 'pedido') return { status: 'en_preparacion', label: 'Pasar a preparación' };
  if (s === 'en_preparacion') return { status: 'enviado', label: 'Marcar como enviado' };
  if (s === 'enviado') return { status: 'entregado', label: 'Marcar como entregado' };
  return null;
}

/** Mostrar conciliación de pago salvo pedidos cancelados. */
function showPaymentReconciliation(order) {
  return (order?.status || '') !== 'cancelado';
}

/**
 * Contenido de tarjeta de pedido (kanban): usado con drag (desktop) o estático (mobile).
 */
function KanbanOrderCardView({
  order,
  formatCLP,
  onOpenDetail,
  onUpdate,
  orderShortId: shortIdFn,
  showDragHandle,
  dragListeners,
  dragAttributes,
  cardRef,
  cardStyle,
}) {
  const qty = productUnits(order);
  const shortId = shortIdFn ? shortIdFn(order?.id) : orderShortIdLocal(order?.id);
  const timeCaption = getOrderCardTimeCaption(order);
  const next = nextQuickStatus(order);
  const showPayToggle = showPaymentReconciliation(order);
  const shouldKeepActionSlot = Boolean(showPayToggle);

  useEffect(() => {
    if (!isOrdersRenderDebug()) return undefined;
    console.log(`[mount] OrderCard:${order.id}`);
    return () => console.log(`[unmount] OrderCard:${order.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- diagnóstico: instancia de card por order.id
  }, []);

  if (isOrdersRenderDebug()) {
    console.count(`[render] OrderCard:${order.id}`);
  }
  if (isOrdersDoubleFlickerDebug()) {
    ordersDoubleFlickerLog('render:OrderCard', {
      orderId: order?.id ?? null,
      status: getCanonicalOrderStatus(order),
      paymentStatus: order?.paymentStatus ?? null,
    });
  }

  return (
    <div
      ref={cardRef}
      className="rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-md"
      style={{ ...cardStyle, boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)' }}
    >
      <div className="flex gap-2 p-2.5 sm:p-3 sm:gap-2">
        {showDragHandle ? (
          <button
            type="button"
            className="touch-none flex-shrink-0 mt-0.5 p-1 rounded-lg hover:bg-muted/80 text-muted-foreground transition-colors"
            aria-label="Arrastrar pedido"
            {...dragListeners}
            {...dragAttributes}
          >
            <Icon name="GripVertical" size={16} color="currentColor" />
          </button>
        ) : null}
        <button
          type="button"
          className="flex-1 min-w-0 text-left rounded-xl -m-0.5 p-1.5 outline-offset-1 hover:bg-white/60 active:bg-white/80 transition-colors"
          onClick={() => onOpenDetail(order)}
        >
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mb-1">
            <p className="text-[10px] font-mono shrink-0" style={{ color: 'var(--color-muted-foreground)' }}>
              #{shortId}
            </p>
            <OrderStatusBadge status={getCanonicalOrderStatus(order)} />
          </div>
          <div className="min-h-[30px]">
            {timeCaption.primary ? (
              <p
                className="text-[11px] font-semibold tabular-nums leading-tight"
                style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
              >
                {timeCaption.primary}
              </p>
            ) : (
              <p className="text-[11px] leading-tight invisible">placeholder</p>
            )}
            {order?.status === 'entregado' && timeCaption.durationLabel ? (
              <p
                className="text-[11px] font-bold tabular-nums mt-0.5"
                style={{ color: '#059669', fontFamily: 'var(--font-caption)' }}
              >
                Entregado en {timeCaption.durationLabel}
              </p>
            ) : (
              <p className="text-[11px] mt-0.5 invisible">placeholder</p>
            )}
          </div>
          <p
            className="text-base font-bold leading-snug break-words line-clamp-2 mt-2 tracking-tight"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            {order?.customerName || 'Sin nombre'}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-2">
            <span
              className="text-lg font-bold tabular-nums tracking-tight"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-stat)' }}
            >
              {formatCLP(order?.totalAmount)}
            </span>
            <span className="text-[11px] shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {qty} {qty === 1 ? 'producto' : 'productos'}
            </span>
          </div>
        </button>
      </div>
      {(next || showPayToggle) ? (
        <div
          className="flex flex-wrap items-center gap-2 px-2.5 pb-2.5 pt-0 sm:px-3 sm:pb-3 min-h-[48px]"
          style={{ borderTop: '1px solid rgba(15, 23, 42, 0.06)' }}
        >
          {next ? (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 min-h-[40px] sm:min-h-[38px] text-left text-[10px] sm:text-[11px] font-semibold leading-tight flex-1 min-w-0 sm:min-w-[140px] transition-colors duration-150 hover:opacity-95"
              style={{
                fontFamily: 'var(--font-caption)',
                backgroundColor: 'var(--color-primary)',
                color: '#fff',
                boxShadow: '0 1px 2px rgba(124, 58, 237, 0.25)',
              }}
              aria-label={next.label}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUpdate(order.id, { status: next.status });
              }}
            >
              <Icon name="ChevronRight" size={12} color="#fff" className="shrink-0" />
              <span className="break-words">{next.label}</span>
            </button>
          ) : shouldKeepActionSlot ? (
            <div
              aria-hidden
              className="inline-flex items-center justify-center rounded-xl px-3 py-2 min-h-[40px] sm:min-h-[38px] flex-1 min-w-0 sm:min-w-[140px] invisible"
            >
              placeholder
            </div>
          ) : null}
          {showPayToggle ? (
            <PaymentStatusToggle
              orderId={order.id}
              paymentStatus={order?.paymentStatus}
              onUpdate={onUpdate}
              disabled={false}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function orderDataShallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    String(a.id) === String(b.id) &&
    getCanonicalOrderStatus(a) === getCanonicalOrderStatus(b) &&
    (a.paymentStatus || 'pendiente') === (b.paymentStatus || 'pendiente') &&
    String(a.updatedAt || '') === String(b.updatedAt || '') &&
    String(a.deliveredAt || '') === String(b.deliveredAt || '') &&
    String(a.sentAt || '') === String(b.sentAt || '') &&
    Number(a.totalAmount) === Number(b.totalAmount)
  );
}

export default React.memo(KanbanOrderCardView, (prev, next) => {
  const prevStyle = prev.cardStyle || {};
  const nextStyle = next.cardStyle || {};
  return (
    orderDataShallowEqual(prev.order, next.order) &&
    prev.formatCLP === next.formatCLP &&
    prev.onOpenDetail === next.onOpenDetail &&
    prev.onUpdate === next.onUpdate &&
    prev.orderShortId === next.orderShortId &&
    prev.showDragHandle === next.showDragHandle &&
    prevStyle.transform === nextStyle.transform &&
    prevStyle.opacity === nextStyle.opacity &&
    prevStyle.zIndex === nextStyle.zIndex
  );
});

/** Para DragOverlay: mismo mapa de icono/etiqueta que la tarjeta. */
export const KANBAN_STATUS_BADGE_MAP = STATUS_BADGE;
