import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PaymentStatusToggle from './PaymentStatusToggle';

const ORDER = { id: 'order-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaymentStatusToggle — pendiente -> pagado NUNCA es un UPDATE directo (MP-PAYMENT-DETAIL-2)', () => {
  it('al hacer click estando pendiente, llama a onOpenDetail(order) y nunca a onUpdate', () => {
    const onUpdate = vi.fn();
    const onOpenDetail = vi.fn();
    render(
      <PaymentStatusToggle
        orderId="order-1"
        order={ORDER}
        paymentStatus="pendiente"
        onUpdate={onUpdate}
        onOpenDetail={onOpenDetail}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /MARCAR PAGO/i }));
    expect(onOpenDetail).toHaveBeenCalledWith(ORDER);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('el botón "no pagado" invita a abrir el pedido, no a marcarlo pagado directamente', () => {
    render(
      <PaymentStatusToggle
        orderId="order-1"
        order={ORDER}
        paymentStatus="pendiente"
        onUpdate={vi.fn()}
        onOpenDetail={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /MARCAR PAGO/i })).toHaveAttribute(
      'title',
      'Abrir pedido para registrar el pago',
    );
  });
});

describe('PaymentStatusToggle — pagado -> pendiente sigue siendo un UPDATE directo (revertir, no "pagar")', () => {
  it('al hacer click estando pagado, llama a onUpdate(orderId, { paymentStatus: "pendiente" }) y nunca a onOpenDetail', async () => {
    const onUpdate = vi.fn().mockResolvedValue();
    const onOpenDetail = vi.fn();
    render(
      <PaymentStatusToggle
        orderId="order-1"
        order={ORDER}
        paymentStatus="pagado"
        onUpdate={onUpdate}
        onOpenDetail={onOpenDetail}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /PAGADO/i }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('order-1', { paymentStatus: 'pendiente' }));
    expect(onOpenDetail).not.toHaveBeenCalled();
  });
});

describe('PaymentStatusToggle — anulado', () => {
  it('muestra una etiqueta no interactiva, sin botón', () => {
    render(
      <PaymentStatusToggle
        orderId="order-1"
        order={ORDER}
        paymentStatus="anulado"
        onUpdate={vi.fn()}
        onOpenDetail={vi.fn()}
      />,
    );
    expect(screen.getByText('Pago anulado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
