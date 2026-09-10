import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OrderPaymentDetail from './OrderPaymentDetail';

const formatCLP = (amount) => `$${Number(amount ?? 0).toLocaleString('es-CL')}`;

const MP_CHECKOUT_PRO_PAYMENT = {
  id: 'pay-1',
  provider: 'mercado_pago',
  method: 'checkout_pro',
  providerPaymentId: '123456789',
  status: 'confirmed',
  grossAmount: 10000,
  currency: 'CLP',
  walinkaFee: 100,
  mpFee: null,
  netAmount: null,
  payerName: null,
  payerEmail: null,
  paidAt: '2026-09-10T15:30:00.000Z',
  registeredBy: null,
  notes: null,
};

const MANUAL_CASH_PAYMENT = {
  id: 'pay-2',
  provider: 'manual',
  method: 'cash',
  providerPaymentId: null,
  status: 'confirmed',
  grossAmount: 5000,
  currency: 'CLP',
  walinkaFee: 0,
  mpFee: null,
  netAmount: null,
  payerName: null,
  payerEmail: null,
  paidAt: '2026-09-10T15:30:00.000Z',
  registeredBy: 'user-1',
  notes: 'Pagó en mostrador',
};

const MANUAL_BANK_TRANSFER_PAYMENT = {
  ...MANUAL_CASH_PAYMENT,
  id: 'pay-3',
  method: 'bank_transfer',
  registeredBy: null,
  notes: null,
};

const BUSINESS_OWNER = { user_id: 'user-1' };

describe('OrderPaymentDetail — Mercado Pago / Checkout Pro', () => {
  it('renderiza proveedor, método, estado confirmado, importe, moneda y fecha', () => {
    render(<OrderPaymentDetail orderPayment={MP_CHECKOUT_PRO_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('Mercado Pago')).toBeInTheDocument();
    expect(screen.getByText('Checkout Pro')).toBeInTheDocument();
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    expect(screen.getByText('$10.000')).toBeInTheDocument();
    expect(screen.getByText('CLP')).toBeInTheDocument();
  });

  it('muestra el provider_payment_id', () => {
    render(<OrderPaymentDetail orderPayment={MP_CHECKOUT_PRO_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('123456789')).toBeInTheDocument();
  });

  it('muestra la comisión Walinka', () => {
    render(<OrderPaymentDetail orderPayment={MP_CHECKOUT_PRO_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('Comisión Walinka')).toBeInTheDocument();
    expect(screen.getByText('$100')).toBeInTheDocument();
  });

  it('mp_fee/net_amount NULL -- nunca se muestran esas filas (ni "$0" ni "N/A" inventados)', () => {
    render(<OrderPaymentDetail orderPayment={MP_CHECKOUT_PRO_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.queryByText('Comisión Mercado Pago')).not.toBeInTheDocument();
    expect(screen.queryByText('Neto comercio')).not.toBeInTheDocument();
  });

  it('mp_fee/net_amount presentes -- SÍ se muestran cuando la fila los trae', () => {
    render(
      <OrderPaymentDetail
        orderPayment={{ ...MP_CHECKOUT_PRO_PAYMENT, mpFee: 250, netAmount: 9650 }}
        paymentStatus="pagado"
        business={BUSINESS_OWNER}
        formatCLP={formatCLP}
      />,
    );
    expect(screen.getByText('Comisión Mercado Pago')).toBeInTheDocument();
    expect(screen.getByText('$250')).toBeInTheDocument();
    expect(screen.getByText('Neto comercio')).toBeInTheDocument();
    expect(screen.getByText('$9.650')).toBeInTheDocument();
  });

  it('payer_name/payer_email presentes se muestran; ausentes no aparecen', () => {
    const { rerender } = render(<OrderPaymentDetail orderPayment={MP_CHECKOUT_PRO_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.queryByText('Pagador')).not.toBeInTheDocument();

    rerender(
      <OrderPaymentDetail
        orderPayment={{ ...MP_CHECKOUT_PRO_PAYMENT, payerName: 'Juan Pérez', payerEmail: 'juan@example.com' }}
        paymentStatus="pagado"
        business={BUSINESS_OWNER}
        formatCLP={formatCLP}
      />,
    );
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('juan@example.com')).toBeInTheDocument();
  });
});

describe('OrderPaymentDetail — Point/QR (mismo provider mercado_pago, method distinto)', () => {
  it('renderiza el label correcto para point', () => {
    render(<OrderPaymentDetail orderPayment={{ ...MP_CHECKOUT_PRO_PAYMENT, method: 'point' }} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('Point')).toBeInTheDocument();
  });
  it('renderiza el label correcto para qr', () => {
    render(<OrderPaymentDetail orderPayment={{ ...MP_CHECKOUT_PRO_PAYMENT, method: 'qr' }} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('QR')).toBeInTheDocument();
  });
});

describe('OrderPaymentDetail — pago manual (cash)', () => {
  it('renderiza método, importe, fecha, sin badge de proveedor Mercado Pago', () => {
    render(<OrderPaymentDetail orderPayment={MANUAL_CASH_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Pago manual')).toBeInTheDocument();
    expect(screen.queryByText('Mercado Pago')).not.toBeInTheDocument();
    expect(screen.getByText('$5.000')).toBeInTheDocument();
  });

  it('comisión Walinka se muestra explícitamente como $0 -- confirmado, no omitido (distinto de mp_fee/net_amount NULL)', () => {
    render(<OrderPaymentDetail orderPayment={MANUAL_CASH_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('Comisión Walinka')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
  });

  it('nunca muestra ID de pago de Mercado Pago ni comisión/neto MP para un pago manual', () => {
    render(<OrderPaymentDetail orderPayment={MANUAL_CASH_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.queryByText('ID de pago')).not.toBeInTheDocument();
    expect(screen.queryByText('Comisión Mercado Pago')).not.toBeInTheDocument();
    expect(screen.queryByText('Neto comercio')).not.toBeInTheDocument();
  });

  it('muestra "Registrado por Ti" cuando registeredBy coincide con business.user_id', () => {
    render(<OrderPaymentDetail orderPayment={MANUAL_CASH_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('Registrado por')).toBeInTheDocument();
    expect(screen.getByText('Ti')).toBeInTheDocument();
  });

  it('muestra la nota cuando existe', () => {
    render(<OrderPaymentDetail orderPayment={MANUAL_CASH_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('Pagó en mostrador')).toBeInTheDocument();
  });
});

describe('OrderPaymentDetail — pago manual (bank_transfer)', () => {
  it('renderiza "Transferencia bancaria", sin "Registrado por" ni nota cuando no vienen', () => {
    render(<OrderPaymentDetail orderPayment={MANUAL_BANK_TRANSFER_PAYMENT} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('Transferencia bancaria')).toBeInTheDocument();
    expect(screen.queryByText('Registrado por')).not.toBeInTheDocument();
    expect(screen.queryByText('Nota')).not.toBeInTheDocument();
  });
});

describe('OrderPaymentDetail — pedido pagado sin fila de detalle (histórico/sin backfill)', () => {
  it('muestra "Pagado — método no registrado", nunca inventa un método', () => {
    render(<OrderPaymentDetail orderPayment={null} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('Pagado — método no registrado')).toBeInTheDocument();
    expect(screen.queryByText('Mercado Pago')).not.toBeInTheDocument();
    expect(screen.queryByText('Efectivo')).not.toBeInTheDocument();
  });
});

describe('OrderPaymentDetail — otros estados de pedido', () => {
  it('pedido pendiente sin fila -- no muestra nada (ni "sin método", ni una ficha vacía)', () => {
    const { container } = render(<OrderPaymentDetail orderPayment={null} paymentStatus="pendiente" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pedido anulado sin fila -- tampoco muestra nada', () => {
    const { container } = render(<OrderPaymentDetail orderPayment={null} paymentStatus="anulado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('cargando (orderPayment undefined) -- muestra estado de carga', () => {
    render(<OrderPaymentDetail orderPayment={undefined} paymentStatus="pagado" business={BUSINESS_OWNER} formatCLP={formatCLP} />);
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });
});
