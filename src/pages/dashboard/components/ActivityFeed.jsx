import React from 'react';
import Icon from 'components/AppIcon';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCLP } from '../../../utils/formatCLP';

const STATUS_CONFIG = {
  pedido:         { label: 'Pedido',         color: '#6366F1', bg: 'rgba(99,102,241,0.1)',  icon: 'ShoppingBag' },
  en_preparacion: { label: 'En preparación',  color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  icon: 'ChefHat' },
  enviado:        { label: 'Enviado',        color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)',  icon: 'Truck' },
  entregado:      { label: 'Entregado',      color: '#10B981', bg: 'rgba(16,185,129,0.1)',  icon: 'PackageCheck' },
  cancelado:      { label: 'Cancelado',      color: '#6B7280', bg: 'rgba(107,114,128,0.1)',  icon: 'XCircle' },
  pending:        { label: 'Pedido',         color: '#6366F1', bg: 'rgba(99,102,241,0.1)',   icon: 'ShoppingBag' },
  new:            { label: 'Pedido',         color: '#6366F1', bg: 'rgba(99,102,241,0.1)',   icon: 'ShoppingBag' },
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} días`;
}

export default function ActivityFeed({ orders = [], loading = false, newOrderIds = new Set() }) {
  const recentOrders = orders?.slice(0, 10) ?? [];

  return (
    <div className="rounded-xl border p-5" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}>
            <Icon name="Activity" size={14} color="var(--color-primary)" />
          </div>
          <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)', letterSpacing: '-0.01em' }}>Actividad reciente</h3>
        </div>
        {recentOrders?.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Últimos {recentOrders?.length} pedidos</span>
        )}
      </div>
      {loading ? (
        <div className="space-y-3">
          {[1,2,3]?.map(i => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2.5 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : recentOrders?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-muted)' }}>
            <Icon name="ShoppingBag" size={18} color="var(--color-muted-foreground)" />
          </div>
          <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Aún no hay pedidos</p>
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Los pedidos de tus clientes aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recentOrders?.map((order) => {
            const cfg = STATUS_CONFIG?.[order?.status] ?? STATUS_CONFIG?.pending;
            const isNew = newOrderIds?.has(order?.id);
            return (
              <div
                key={order?.id}
                className="flex items-center gap-3 py-2 border-b last:border-b-0 rounded-lg px-2 -mx-2 transition-all duration-[2000ms]"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: isNew ? 'rgba(16,185,129,0.08)' : 'transparent',
                }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: isNew ? 'rgba(16,185,129,0.15)' : cfg?.bg }}>
                  <Icon name={isNew ? 'ShoppingBag' : cfg?.icon} size={14} color={isNew ? '#10B981' : cfg?.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>{order?.customerName}</p>
                  <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                    {formatCLP(order?.totalAmount)}
                    {order?.createdAt && (
                      <> · {format(new Date(order.createdAt), "d MMM yyyy, HH:mm", { locale: es })}</>
                    )}
                    {order?.createdAt && <span className="opacity-75"> · {timeAgo(order.createdAt)}</span>}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: isNew ? 'rgba(16,185,129,0.1)' : cfg?.bg, color: isNew ? '#059669' : cfg?.color, fontFamily: 'var(--font-caption)' }}>
                  {isNew ? '¡Nuevo!' : cfg?.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
