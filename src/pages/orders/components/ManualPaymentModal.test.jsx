import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import manualPaymentModalSource from './ManualPaymentModal.jsx?raw';

vi.mock('../../../services/orderPaymentService', () => ({
  registerManualOrderPayment: vi.fn(),
  getManualPaymentErrorMessage: (reason) => `mensaje-amigable:${reason}`,
}));

import { registerManualOrderPayment } from '../../../services/orderPaymentService';
import ManualPaymentModal from './ManualPaymentModal';

const ORDER = { id: 'order-1', totalAmount: 10000, currency: 'CLP' };
const formatCLP = (amount) => `$${Number(amount ?? 0).toLocaleString('es-CL')}`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ManualPaymentModal — exige método', () => {
  it('siempre hay un método seleccionado por defecto (cash) -- nunca se puede enviar sin método', () => {
    render(<ManualPaymentModal order={ORDER} formatCLP={formatCLP} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const cashButton = screen.getByRole('button', { name: /Efectivo/i });
    expect(cashButton).toBeInTheDocument();
  });

  it('permite elegir entre efectivo, transferencia bancaria y otro -- nunca checkout_pro/point/qr', () => {
    render(<ManualPaymentModal order={ORDER} formatCLP={formatCLP} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Efectivo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Transferencia bancaria/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Otro/i })).toBeInTheDocument();
    expect(screen.queryByText(/Checkout Pro/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Point$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^QR$/i)).not.toBeInTheDocument();
  });
});

describe('ManualPaymentModal — monto/moneda fijos, no editables', () => {
  it('muestra el total del pedido, sin ningún <input> de monto', () => {
    render(<ManualPaymentModal order={ORDER} formatCLP={formatCLP} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText('$10.000')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /monto/i })).not.toBeInTheDocument();
  });
});

describe('ManualPaymentModal — registro correcto', () => {
  it('al enviar con el método por defecto (cash), llama a registerManualOrderPayment con orderId/method/amount/currency del pedido', async () => {
    registerManualOrderPayment.mockResolvedValue({ data: 'new-id', error: null });
    const onSuccess = vi.fn();
    render(<ManualPaymentModal order={ORDER} formatCLP={formatCLP} onClose={vi.fn()} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: /Registrar pago/i }));

    await waitFor(() => expect(registerManualOrderPayment).toHaveBeenCalledWith({
      orderId: 'order-1',
      method: 'cash',
      amount: 10000,
      currency: 'CLP',
      notes: '',
    }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it('al elegir "Transferencia bancaria" y enviar, usa method=bank_transfer', async () => {
    registerManualOrderPayment.mockResolvedValue({ data: 'new-id', error: null });
    render(<ManualPaymentModal order={ORDER} formatCLP={formatCLP} onClose={vi.fn()} onSuccess={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Transferencia bancaria/i }));
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago/i }));

    await waitFor(() => expect(registerManualOrderPayment).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'bank_transfer' }),
    ));
  });

  it('incluye la nota escrita por el usuario', async () => {
    registerManualOrderPayment.mockResolvedValue({ data: 'new-id', error: null });
    render(<ManualPaymentModal order={ORDER} formatCLP={formatCLP} onClose={vi.fn()} onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Nota/i), { target: { value: 'pagó en mostrador' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago/i }));

    await waitFor(() => expect(registerManualOrderPayment).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'pagó en mostrador' }),
    ));
  });
});

describe('ManualPaymentModal — error legible', () => {
  it('si la RPC falla, muestra el mensaje amigable (nunca el error crudo) y no llama a onSuccess', async () => {
    registerManualOrderPayment.mockResolvedValue({ data: null, error: { message: 'ORDER_ALREADY_PAID' } });
    const onSuccess = vi.fn();
    render(<ManualPaymentModal order={ORDER} formatCLP={formatCLP} onClose={vi.fn()} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: /Registrar pago/i }));

    await waitFor(() => expect(screen.getByText('mensaje-amigable:ORDER_ALREADY_PAID')).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('ManualPaymentModal — cerrar', () => {
  it('el botón Cancelar llama a onClose sin registrar nada', () => {
    const onClose = vi.fn();
    render(<ManualPaymentModal order={ORDER} formatCLP={formatCLP} onClose={onClose} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(registerManualOrderPayment).not.toHaveBeenCalled();
  });
});

describe('ManualPaymentModal — nunca hace un UPDATE directo de payment_status', () => {
  it('el código fuente nunca llama a onUpdate ni escribe payment_status -- solo pasa por registerManualOrderPayment', () => {
    expect(manualPaymentModalSource).not.toMatch(/onUpdate/);
    expect(manualPaymentModalSource).not.toMatch(/payment_status/);
    expect(manualPaymentModalSource).toMatch(/registerManualOrderPayment/);
  });
});
