import React from 'react';
import Icon from 'components/AppIcon';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const SUB_BADGE = {
  en_preparacion: { label: 'En preparación', color: '#B45309', bg: 'rgba(245, 158, 11, 0.22)', icon: 'ChefHat' },
  enviado: { label: 'Enviado', color: '#0369A1', bg: 'rgba(14, 165, 233, 0.18)', icon: 'Truck' },
};

function SubStatusBadge({ status }) {
  const s = status || 'pedido';
  const cfg = SUB_BADGE[s];
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
  const s = order?.status || 'pedido';
  if (s === 'pedido') return { status: 'en_preparacion', label: 'Pasar a preparación' };
  if (s === 'en_preparacion') return { status: 'enviado', label: 'Enviar' };
  if (s === 'enviado') return { status: 'entregado', label: 'Marcar entregado' };
  return null;
}

function showQuickPay(order) {
  if ((order?.status || '') === 'cancelado') return false;
  return (order?.paymentStatus || 'pendiente') === 'pendiente';
}

/**
 * Contenido de tarjeta de pedido (kanban): usado con drag (desktop) o estático (mobile).
 */
export default function KanbanOrderCardView({
  order,
  formatCLP,
  onOpenDetail,
  onUpdate,
  orderShortId: shortIdFn,
  showSubStatusBadge,
  showDragHandle,
  dragListeners,
  dragAttributes,
  cardRef,
  cardStyle,
}) {
  const qty = productUnits(order);
  const shortId = shortIdFn ? shortIdFn(order?.id) : orderShortIdLocal(order?.id);
  const timeStr = order?.createdAt
    ? format(new Date(order.createdAt), 'HH:mm', { locale: es })
    : '';
  const next = nextQuickStatus(order);
  const pay = showQuickPay(order);

  return (
    <div
      ref={cardRef}
      className="rounded-xl border bg-white shadow-sm"
      style={{ ...cardStyle, borderColor: 'var(--color-border)' }}
    >
      <div className="flex gap-2 p-2.5 sm:p-2 sm:gap-1.5">
        {showDragHandle ? (
          <button
            type="button"
            className="touch-none flex-shrink-0 mt-0.5 p-1 rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Arrastrar pedido"
            {...dragListeners}
            {...dragAttributes}
          >
            <Icon name="GripVertical" size={16} color="currentColor" />
          </button>
        ) : null}
        <button
          type="button"
          className="flex-1 min-w-0 text-left"
          onClick={() => onOpenDetail(order)}
        >
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mb-1">
            <p className="text-[10px] font-mono shrink-0" style={{ color: 'var(--color-muted-foreground)' }}>
              #{shortId}
              {timeStr ? <span className="ml-1 font-sans">{timeStr}</span> : null}
            </p>
            {showSubStatusBadge ? <SubStatusBadge status={order?.status} /> : null}
          </div>
          <p
            className="text-sm font-semibold leading-snug break-words line-clamp-2"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}
          >
            {order?.customerName || 'Sin nombre'}
          </p>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-1.5">
            <span
              className="text-sm sm:text-xs font-bold tabular-nums"
              style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
            >
              {formatCLP(order?.totalAmount)}
            </span>
            <span className="text-[11px] shrink-0" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {qty} {qty === 1 ? 'producto' : 'productos'}
            </span>
          </div>
        </button>
      </div>
      {(next || pay) && (
        <div
          className="flex flex-wrap gap-1.5 px-2.5 pb-2.5 pt-0 sm:px-2 sm:pb-2"
          style={{ borderTop: '1px solid var(--color-border)' }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {next ? (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 min-h-[36px] sm:min-h-0 text-left text-[10px] sm:text-[11px] font-semibold leading-tight flex-1 sm:flex-initial min-w-0 transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{
                fontFamily: 'var(--font-caption)',
                backgroundColor: 'rgba(124,58,237,0.12)',
                color: 'var(--color-primary)',
              }}
              aria-label={next.label}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUpdate(order.id, { status: next.status });
              }}
            >
              <Icon name="ChevronRight" size={12} color="var(--color-primary)" className="shrink-0" />
              <span className="break-words">{next.label}</span>
            </button>
          ) : null}
          {pay ? (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 min-h-[36px] sm:min-h-0 text-[11px] font-semibold flex-1 sm:flex-initial transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{
                fontFamily: 'var(--font-caption)',
                backgroundColor: 'rgba(16,185,129,0.12)',
                color: '#059669',
              }}
              aria-label="Marcar como pagado"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUpdate(order.id, { paymentStatus: 'pagado' });
              }}
            >
              <Icon name="DollarSign" size={12} color="#059669" />
              Pagado
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
