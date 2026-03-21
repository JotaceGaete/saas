import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import Icon from 'components/AppIcon';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import KanbanOrderCardView, { KANBAN_STATUS_BADGE_MAP } from './KanbanOrderCardView';
import { getDeliveredSortTimeMs, getPreparacionSortTimeMs } from 'utils/orderDates';

const KANBAN_COLUMNS = [
  {
    id: 'pendientes',
    title: 'Pendientes',
    subtitle: 'Pedido recibido',
    accent: '#6366F1',
    bg: '#EEF2FF',
    variant: 'accent',
  },
  {
    id: 'preparacion',
    title: 'En proceso',
    subtitle: 'Preparación o enviado',
    accent: '#94A3B8',
    bg: '#F1F5F9',
    variant: 'neutral',
    titleColor: '#475569',
    countColor: '#64748B',
  },
  {
    id: 'entregado',
    title: 'Entregados',
    subtitle: 'Listo',
    accent: '#10B981',
    bg: '#D1FAE5',
    variant: 'accent',
  },
];

/** Columna visual del tablero (no confundir con order.status en backend). */
export function orderToKanbanColumn(status) {
  const s = status || 'pedido';
  if (s === 'pedido') return 'pendientes';
  if (s === 'en_preparacion' || s === 'enviado') return 'preparacion';
  if (s === 'entregado') return 'entregado';
  return null;
}

function kanbanColumnToStatus(columnId, previousStatus) {
  if (columnId === 'pendientes') return 'pedido';
  if (columnId === 'preparacion') {
    if (previousStatus === 'entregado') return 'en_preparacion';
    if (previousStatus === 'enviado') return 'enviado';
    return 'en_preparacion';
  }
  if (columnId === 'entregado') return 'entregado';
  return previousStatus;
}

function sortByCreatedAsc(list) {
  return [...list].sort((a, b) => {
    const ta = new Date(a?.createdAt || 0).getTime();
    const tb = new Date(b?.createdAt || 0).getTime();
    return ta - tb;
  });
}

function sortPreparacionAsc(list) {
  return [...list].sort((a, b) => getPreparacionSortTimeMs(a) - getPreparacionSortTimeMs(b));
}

function sortDeliveredDesc(list) {
  return [...list].sort((a, b) => getDeliveredSortTimeMs(b) - getDeliveredSortTimeMs(a));
}

function KanbanColumn({
  id,
  title,
  subtitle,
  accent,
  bg,
  children,
  count,
  variant = 'accent',
  titleColor,
  countColor,
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const isNeutral = variant === 'neutral';
  const titleC = isNeutral ? (titleColor || '#475569') : accent;
  const countC = isNeutral ? (countColor || '#64748B') : accent;
  const overBg = isNeutral ? (isOver ? 'rgba(241, 245, 249, 0.95)' : 'var(--color-card)') : undefined;
  return (
    <div
      ref={setNodeRef}
      className="flex flex-col min-h-[min(420px,55vh)] min-w-0 flex-1 rounded-2xl border transition-colors"
      style={{
        borderColor: isOver ? accent : 'var(--color-border)',
        backgroundColor: isNeutral ? (overBg || 'var(--color-card)') : (isOver ? `${bg}99` : 'var(--color-card)'),
        boxShadow: isOver ? `0 0 0 2px ${accent}55` : 'var(--shadow-xs)',
      }}
    >
      <div
        className="px-3 py-2.5 border-b shrink-0"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: bg,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: titleC, fontFamily: 'var(--font-heading)' }}>
              {title}
            </p>
            <p className="text-[10px] font-medium truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              {subtitle}
            </p>
          </div>
          <span
            className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-lg shrink-0 border"
            style={{
              backgroundColor: '#fff',
              color: countC,
              fontFamily: 'var(--font-heading)',
              borderColor: isNeutral ? 'var(--color-border)' : 'transparent',
            }}
          >
            {count}
          </span>
        </div>
      </div>
      <div
        className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px] max-h-[min(520px,calc(100vh-280px))]"
        style={isNeutral ? { backgroundColor: 'rgba(248, 250, 252, 0.6)' } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function StatusBadgeOverlay({ status }) {
  const s = status || 'pedido';
  const cfg = KANBAN_STATUS_BADGE_MAP[s];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0"
      style={{ color: cfg.color, backgroundColor: cfg.bg, fontFamily: 'var(--font-caption)' }}
    >
      <Icon name={cfg.icon} size={10} color={cfg.color} />
      {cfg.label}
    </span>
  );
}

function DraggableOrderCard({ order, formatCLP, onOpenDetail, onUpdate, orderShortId: shortIdFn }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(order.id) });
  const style = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <KanbanOrderCardView
      order={order}
      formatCLP={formatCLP}
      onOpenDetail={onOpenDetail}
      onUpdate={onUpdate}
      orderShortId={shortIdFn}
      showDragHandle
      dragListeners={listeners}
      dragAttributes={attributes}
      cardRef={setNodeRef}
      cardStyle={style}
    />
  );
}

function resolveDropColumn(overId, allOrders) {
  const sid = String(overId);
  if (KANBAN_COLUMNS.some(c => c.id === sid)) return sid;
  const hit = allOrders.find(o => String(o.id) === sid);
  if (hit) return orderToKanbanColumn(hit.status);
  return null;
}

export default function OrdersKanban({
  orders,
  onUpdate,
  onOpenDetail,
  formatCLP,
  orderShortId: shortIdFn,
}) {
  const isDesktop = useIsDesktop();
  const [mobileTab, setMobileTab] = useState('pendientes');
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const { pendientes, preparacion, entregado } = useMemo(() => {
    const p = [];
    const r = [];
    const e = [];
    for (const o of orders) {
      const col = orderToKanbanColumn(o?.status);
      if (col === 'pendientes') p.push(o);
      else if (col === 'preparacion') r.push(o);
      else if (col === 'entregado') e.push(o);
    }
    return {
      pendientes: sortByCreatedAsc(p),
      preparacion: sortPreparacionAsc(r),
      entregado: sortDeliveredDesc(e),
    };
  }, [orders]);

  const activeOrder = useMemo(
    () => (activeId ? orders.find(o => String(o.id) === String(activeId)) : null),
    [activeId, orders],
  );

  const mobileList = useMemo(() => {
    if (mobileTab === 'pendientes') return pendientes;
    if (mobileTab === 'preparacion') return preparacion;
    return entregado;
  }, [mobileTab, pendientes, preparacion, entregado]);

  const handleDragStart = ({ active }) => {
    setActiveId(active?.id ?? null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over || !active) return;
    const orderId = active.id;
    const targetCol = resolveDropColumn(over.id, orders);
    if (!targetCol) return;
    const order = orders.find(o => String(o.id) === String(orderId));
    if (!order) return;
    const fromCol = orderToKanbanColumn(order.status);
    if (fromCol === targetCol) return;
    const newStatus = kanbanColumnToStatus(targetCol, order.status);
    if (newStatus === (order.status || 'pedido')) return;
    onUpdate(orderId, { status: newStatus });
  };

  const handleDragCancel = () => setActiveId(null);

  const renderCard = (order) => (
    <DraggableOrderCard
      key={order.id}
      order={order}
      formatCLP={formatCLP}
      onOpenDetail={onOpenDetail}
      onUpdate={onUpdate}
      orderShortId={shortIdFn}
    />
  );

  if (!isDesktop) {
    return (
      <div className="w-full min-w-0">
        <div
          className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: 'touch' }}
          role="tablist"
          aria-label="Columna del tablero"
        >
          {KANBAN_COLUMNS.map((col) => {
            const count =
              col.id === 'pendientes' ? pendientes.length : col.id === 'preparacion' ? preparacion.length : entregado.length;
            const active = mobileTab === col.id;
            return (
              <button
                key={col.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileTab(col.id)}
                className="snap-start shrink-0 rounded-xl border px-3 py-2.5 text-left min-w-[calc(33.333%-6px)] sm:min-w-[140px] transition-all"
                style={{
                  borderColor: active ? col.accent : 'var(--color-border)',
                  backgroundColor: active ? `${col.bg}cc` : '#fff',
                  boxShadow: active ? `0 0 0 2px ${col.accent}40` : 'var(--shadow-xs)',
                }}
              >
                <p className="text-xs font-bold truncate" style={{ color: col.id === 'preparacion' ? (col.titleColor || col.accent) : col.accent, fontFamily: 'var(--font-heading)' }}>
                  {col.title}
                </p>
                <p className="text-[10px] font-semibold tabular-nums mt-0.5" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                  {count} pedido{count !== 1 ? 's' : ''}
                </p>
              </button>
            );
          })}
        </div>
        <div className="rounded-2xl border p-3 min-h-[240px] max-h-[min(65vh,560px)] overflow-y-auto" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
          {mobileList.length === 0 ? (
            <p className="text-sm text-center py-10 px-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              No hay pedidos en esta columna
            </p>
          ) : (
            <div className="space-y-3">
              {mobileList.map((order) => (
                <KanbanOrderCardView
                  key={order.id}
                  order={order}
                  formatCLP={formatCLP}
                  onOpenDetail={onOpenDetail}
                  onUpdate={onUpdate}
                  orderShortId={shortIdFn}
                  showDragHandle={false}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-row gap-4 items-stretch w-full min-w-0">
        {KANBAN_COLUMNS.map((col) => {
          const list =
            col.id === 'pendientes' ? pendientes : col.id === 'preparacion' ? preparacion : entregado;
          return (
            <KanbanColumn key={col.id} {...col} count={list.length}>
              {list.map((o) => renderCard(o))}
            </KanbanColumn>
          );
        })}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1)' }}>
        {activeOrder ? (
          <div
            className="rounded-xl border bg-white shadow-lg p-2 w-[260px]"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <StatusBadgeOverlay status={activeOrder?.status} />
            </div>
            <p className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-heading)' }}>
              {activeOrder?.customerName || 'Pedido'}
            </p>
            <p className="text-xs font-bold mt-1" style={{ color: 'var(--color-primary)' }}>
              {formatCLP(activeOrder?.totalAmount)}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
