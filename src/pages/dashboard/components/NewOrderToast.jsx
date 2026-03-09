import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from 'components/AppIcon';

export default function NewOrderToast({ order, onDismiss }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss?.(), 300);
    }, 8000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleViewOrder = () => {
    navigate('/orders');
    onDismiss?.();
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onDismiss?.(), 300);
  };

  const customerName = order?.customer_name || order?.customerName || '';

  return (
    <div
      className="flex gap-3 rounded-xl shadow-xl border-l-4 p-4 transition-all duration-300"
      style={{
        backgroundColor: '#FFFFFF',
        borderLeftColor: '#10B981',
        maxWidth: '380px',
        minWidth: '320px',
        boxShadow: '0 8px 32px rgba(16,185,129,0.18), 0 2px 8px rgba(0,0,0,0.10)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
      }}
      role="alert"
      aria-live="assertive"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
        style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}
      >
        🛍️
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: 'var(--color-foreground)', fontFamily: 'var(--font-heading)' }}>
          ¡Nuevo pedido!
        </p>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--color-muted-foreground)', fontFamily: 'var(--font-caption)' }}>
          Un cliente acaba de hacer un pedido{customerName ? ` · ${customerName}` : ''}
        </p>
        <button
          onClick={handleViewOrder}
          className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 hover:opacity-90"
          style={{ backgroundColor: '#10B981', color: '#fff', fontFamily: 'var(--font-caption)' }}
        >
          Ver pedido
        </button>
      </div>
      <button
        onClick={handleClose}
        className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity self-start mt-0.5"
        aria-label="Cerrar"
      >
        <Icon name="X" size={14} color="var(--color-foreground)" />
      </button>
    </div>
  );
}
