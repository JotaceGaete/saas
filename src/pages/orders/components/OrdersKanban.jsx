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
    accent: '#7c3aed',
    headerTint: 'rgba(124, 58, 237, 0.08)',
    bodyTint: 'rgba(124, 58, 237, 0.02)',
    variant: 'accent',
  },
  {
    id: 'preparacion',
    title: 'En proceso',
    subtitle: 'Preparación o enviado',
    accent: '#d97706',
    headerTint: 'rgba(245, 158, 11, 0.1)',
    bodyTint: 'rgba(245, 158, 11, 0.025)',
    variant: 'warm',
  },
  {
    id: 'entregado',
    title: 'Entregados',
    subtitle: 'Listo',
    accent: '#059669',
    headerTint: 'rgba(16, 185, 129, 0.08)',
    bodyTint: 'rgba(16, 185, 129, 0.02)',
    variant: 'accent',
  },
];

function compareById(a, b) {
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

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
    if (ta !== tb) return ta - tb;
    return compareById(a, b);
  });
}

function sortPreparacionAsc(list) {
  return [...list].sort((a, b) => {
    const da = getPreparacionSortTimeMs(a);
    const db = getPreparacionSortTimeMs(b);
    if (da !== db) return da - db;
    return compareById(a, b);
  });
}

function sortDeliveredDesc(list) {
  return [...list].sort((a, b) => {
    const da = getDeliveredSortTimeMs(a);
    const db = getDeliveredSortTimeMs(b);
    if (da !== db) return db - da;
    return compareById(a, b);
  });
}

/** Marco visual compartido (desktop droppable / móvil scroll horizontal). */
function KanbanColumnFrame({
  column,
  count,
  children,
  dropRef,
  isOver,
  droppable,
}) {
  const { title, subtitle, accent, headerTint, bodyTint } = column;
  return (
    <div
      ref={droppable ? dropRef : undefined}
      className="flex flex-col min-h-[min(420px,52vh)] min-w-0 flex-1 rounded-2xl transition-all duration-200 shadow-sm"
      style={{
        backgroundColor: 'var(--color-card)',
        boxShadow: isOver
          ? `0 8px 30px -8px ${accent}33, 0 0 0 1px ${accent}22`
          : '0 1px 2px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div
        className="px-3.5 py-3 rounded-t-2xl shrink-0"
        style={{ backgroundColor: headerTint }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold truncate tracking-tight" style={{ color: accent, fontFamily: 'var(--font-heading)' }}>
              {title}
            </p>
            <p className="text-[10px] font-medium truncate mt-0.5" style={{ color: accent, opacity: 0.75, fontFamily: 'var(--font-caption)' }}>
              {subtitle}
            </p>
          </div>
          <span
            className="text-sm font-bold tabular-nums px-2.5 py-1 rounded-xl shrink-0"
            style={{
              backgroundColor: 'rgba(255,255,255,0.85)',
              color: accent,
              fontFamily: 'var(--font-stat)',
              boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
            }}
          >
            {count}
          </span>
        </div>
      </div>
      <div
        className="flex-1 p-2.5 space-y-2.5 overflow-y-auto min-h-[120px] max-h-[min(520px,calc(100vh-280px))] rounded-b-2xl"
        style={{ backgroundColor: bodyTint }}
      >
        {children}
      </div>
    </div>
  );
}

function KanbanColumn({ column, children, count }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <KanbanColumnFrame column={column} count={count} dropRef={setNodeRef} isOver={isOver} droppable>
      {children}
    </KanbanColumnFrame>
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
        <p
          className="text-[11px] font-medium mb-2 px-0.5 md:hidden"
          style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}
        >
          Desliza horizontalmente para ver cada columna
        </p>
        <div
          className="flex gap-3 overflow-x-auto overflow-y-hidden pb-1 -mx-1 px-1 scroll-smooth snap-x snap-mandatory [-webkit-overflow-scrolling:touch]"
          style={{ scrollbarGutter: 'stable' }}
          role="region"
          aria-label="Tablero de pedidos por columnas"
        >
          {KANBAN_COLUMNS.map((col) => {
            const list =
              col.id === 'pendientes' ? pendientes : col.id === 'preparacion' ? preparacion : entregado;
            const count = list.length;
            return (
              <div key={col.id} className="snap-center shrink-0 w-[min(92vw,380px)] first:pl-0.5 last:pr-1">
                <KanbanColumnFrame column={col} count={count} isOver={false} droppable={false}>
                  {list.length === 0 ? (
                    <p
                      className="text-sm text-center py-12 px-2 rounded-xl"
                      style={{
                        color: 'var(--color-muted-foreground)',
                        fontFamily: 'var(--font-caption)',
                        backgroundColor: 'rgba(255,255,255,0.5)',
                      }}
                    >
                      Sin pedidos aquí
                    </p>
                  ) : (
                    list.map((order) => (
                      <KanbanOrderCardView
                        key={order.id}
                        order={order}
                        formatCLP={formatCLP}
                        onOpenDetail={onOpenDetail}
                        onUpdate={onUpdate}
                        orderShortId={shortIdFn}
                        showDragHandle={false}
                      />
                    ))
                  )}
                </KanbanColumnFrame>
              </div>
            );
          })}
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
            <KanbanColumn key={col.id} column={col} count={list.length}>
              {list.map((o) => renderCard(o))}
            </KanbanColumn>
          );
        })}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1)' }}>
        {activeOrder ? (
          <div
            className="rounded-2xl bg-white p-2 w-[260px] shadow-lg"
            style={{ boxShadow: '0 12px 40px -12px rgba(15, 23, 42, 0.2)' }}
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
