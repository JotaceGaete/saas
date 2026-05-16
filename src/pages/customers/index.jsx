import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Icon from 'components/AppIcon';
import PremiumLoader from 'components/ui/PremiumLoader';
import { getCustomer, getCustomerOrders } from '../../services/waBusinessService';
import { formatCLP } from '../../utils/formatCLP';

const PAYMENT_STATUS_LABEL = {
  pagado:   { label: 'Pagado',   color: '#10B981', bg: '#D1FAE5' },
  pendiente:{ label: 'Pendiente',color: '#F59E0B', bg: '#FEF3C7' },
  anulado:  { label: 'Anulado',  color: '#6B7280', bg: '#F3F4F6' },
};

function PaymentChip({ status }) {
  const cfg = PAYMENT_STATUS_LABEL[status] || PAYMENT_STATUS_LABEL.pendiente;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: cfg.color, backgroundColor: cfg.bg, fontFamily: 'var(--font-caption)' }}
    >
      {cfg.label}
    </span>
  );
}

export default function CustomerPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    Promise.all([
      getCustomer(customerId),
      getCustomerOrders(customerId),
    ]).then(([cRes, oRes]) => {
      if (cRes.error || !cRes.data) {
        setError('No se encontró al cliente.');
      } else {
        setCustomer(cRes.data);
        setOrders(oRes.data || []);
      }
      setLoading(false);
    });
  }, [customerId]);

  // ─── Métricas ──────────────────────────────────────────────────────────────
  const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');
  const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const attemptCount = orders.filter((o) => o.paymentStatus !== 'pagado').length;
  const lastPaid = paidOrders[0] ?? null; // ya vienen ordenados por created_at DESC

  // ─── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <PremiumLoader fullScreen text="Preparando cliente..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>{error}</p>
        <button type="button" onClick={() => navigate(-1)} className="text-sm underline" style={{ color: 'var(--color-primary)' }}>
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-background)', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white px-4 py-3 flex items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
        <button type="button" onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Volver">
          <Icon name="ArrowLeft" size={20} color="var(--color-foreground)" />
        </button>
        <div>
          <h1 className="text-base font-bold leading-tight" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-foreground)' }}>
            {customer?.name || customer?.phone || 'Cliente'}
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Ficha de cliente</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-5">

        {/* Datos del cliente */}
        <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(124,58,237,0.03)' }}>
          {customer?.phone && (
            <div className="flex items-center gap-2">
              <Icon name="Phone" size={15} color="var(--color-muted-foreground)" />
              <a
                href={`https://wa.me/${customer.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium"
                style={{ color: '#25D366', fontFamily: 'var(--font-caption)' }}
              >
                {customer.phone}
              </a>
            </div>
          )}
          {customer?.email && (
            <div className="flex items-center gap-2">
              <Icon name="Mail" size={15} color="var(--color-muted-foreground)" />
              <p className="text-sm" style={{ fontFamily: 'var(--font-caption)' }}>{customer.email}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Icon name="Calendar" size={15} color="var(--color-muted-foreground)" />
            <p className="text-sm" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Alta: {customer?.created_at ? format(new Date(customer.created_at), "d 'de' MMMM yyyy", { locale: es }) : '—'}
            </p>
          </div>
        </div>

        {/* Métricas de compra */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3 flex flex-col gap-1" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Compras pagadas</p>
            <p className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-heading)', color: '#10B981' }}>{paidOrders.length}</p>
          </div>
          <div className="rounded-xl border p-3 flex flex-col gap-1" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Total pagado</p>
            <p className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-primary)' }}>{formatCLP(totalRevenue)}</p>
          </div>
          <div className="rounded-xl border p-3 flex flex-col gap-1" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Intentos sin pago</p>
            <p className="text-2xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-muted-foreground)' }}>{attemptCount}</p>
          </div>
          <div className="rounded-xl border p-3 flex flex-col gap-1" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>Última compra</p>
            <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-caption)', color: 'var(--color-foreground)' }}>
              {lastPaid?.paidAt
                ? format(new Date(lastPaid.paidAt), "d MMM yyyy", { locale: es })
                : lastPaid?.createdAt
                  ? format(new Date(lastPaid.createdAt), "d MMM yyyy", { locale: es })
                  : '—'}
            </p>
          </div>
        </div>

        {/* Historial de pedidos */}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
            Historial de pedidos ({orders.length})
          </p>
          {orders.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
              Sin pedidos registrados.
            </p>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
              <table className="w-full text-sm" style={{ fontFamily: 'var(--font-caption)' }}>
                <thead>
                  <tr className="text-left text-xs font-semibold border-b" style={{ backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)', borderColor: 'var(--color-border)' }}>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                      <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--color-muted-foreground)' }}>
                        {order.createdAt ? format(new Date(order.createdAt), "d MMM yy, HH:mm", { locale: es }) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatCLP(order.totalAmount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <PaymentChip status={order.paymentStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
