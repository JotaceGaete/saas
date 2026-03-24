import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '../../../utils/formatCLP';

const STATUS_CONFIG = {
  pedido:         { label: 'Pendiente',      color: '#D97706', bg: 'rgba(245,158,11,0.1)',   icon: 'Clock' },
  en_preparacion: { label: 'En preparación', color: '#6366F1', bg: 'rgba(99,102,241,0.1)',   icon: 'ChefHat' },
  enviado:        { label: 'Enviado',        color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)',   icon: 'Truck' },
  entregado:      { label: 'Entregado',      color: '#10B981', bg: 'rgba(16,185,129,0.1)',   icon: 'PackageCheck' },
  cancelado:      { label: 'Cancelado',      color: '#6B7280', bg: 'rgba(107,114,128,0.1)',  icon: 'XCircle' },
  pending:        { label: 'Pendiente',      color: '#D97706', bg: 'rgba(245,158,11,0.1)',   icon: 'Clock' },
  new:            { label: 'Pendiente',      color: '#D97706', bg: 'rgba(245,158,11,0.1)',   icon: 'Clock' },
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

export default function ActivityFeed({
  orders = [],
  loading = false,
  newOrderIds = new Set(),
  defaultCurrency = 'USD',
  numberLocale = 'en-US',
}) {
  const navigate = useNavigate();
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
        <button
          onClick={() => navigate('/orders')}
          className="text-xs font-semibold flex items-center gap-0.5 hover:underline"
          style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
        >
          Ver todos <Icon name="ChevronRight" size={12} color="var(--color-primary)" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3]?.map(i => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2.5 bg-muted rounded w-1/2" />
              </div>
              <div className="w-16 h-6 bg-muted rounded-full" />
            </div>
          ))}
        </div>
      ) : recentOrders?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(124,58,237,0.06)' }}>
            <Icon name="ShoppingBag" size={22} color="var(--color-primary)" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>Aún no hay pedidos</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Cuando tus clientes hagan pedidos, aparecerán aquí</p>
          </div>
          <button
            onClick={() => navigate('/orders')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: 'var(--color-primary)', fontFamily: 'var(--font-caption)' }}
          >
            Ir a pedidos
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {recentOrders?.map((order) => {
            const cfg = STATUS_CONFIG?.[order?.status] ?? STATUS_CONFIG?.pending;
            const isNew = newOrderIds?.has(order?.id);
            const clientName = order?.customerName?.trim() || 'Cliente sin nombre';
            return (
              <div
                key={order?.id}
                className="flex items-center gap-3 py-2.5 px-3 -mx-1 rounded-xl border transition-all duration-[2000ms]"
                style={{
                  borderColor: isNew ? 'rgba(16,185,129,0.25)' : 'transparent',
                  backgroundColor: isNew ? 'rgba(16,185,129,0.06)' : 'transparent',
                }}
              >
                {/* Icon */}
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: isNew ? 'rgba(16,185,129,0.12)' : cfg?.bg }}>
                  <Icon name={isNew ? 'ShoppingBag' : cfg?.icon} size={15} color={isNew ? '#10B981' : cfg?.color} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-caption)' }}>
                      {clientName}
                    </p>
                    <span className="text-sm font-bold flex-shrink-0" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
                      {formatCurrency(
                        order?.totalAmount,
                        order?.currency || defaultCurrency,
                        numberLocale,
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: isNew ? 'rgba(16,185,129,0.1)' : cfg?.bg, color: isNew ? '#059669' : cfg?.color, fontFamily: 'var(--font-caption)' }}>
                      {isNew ? '¡Nuevo!' : cfg?.label}
                    </span>
                    {order?.createdAt && (
                      <p className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
                        {format(new Date(order.createdAt), "d MMM, HH:mm", { locale: es })}
                        <span className="opacity-60"> · {timeAgo(order.createdAt)}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Action */}
                <button
                  onClick={() => navigate('/orders')}
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-muted active:scale-90"
                  style={{ color: 'var(--color-muted-foreground)' }}
                  title="Ver pedidos"
                >
                  <Icon name="ArrowRight" size={13} color="var(--color-primary)" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
