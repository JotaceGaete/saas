/**
 * CrmThermalTicket.jsx — PRINT-2 agrega banners opcionales de estado de
 * impresión real (printStatus/printErrorMessage/onConfigurePrinter). Se
 * prueban con render real (RTL): el componente no depende de contexto,
 * router ni servicios -- solo props.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CrmThermalTicket from './CrmThermalTicket';

const baseProps = {
  business: { name: 'Mi Negocio', currency: 'CLP' },
  sale: { invoice_number: 1 },
  items: [{ _key: 'a', name: 'Producto A', unit_price: 1000, quantity: 1 }],
  customer: null,
  paymentMethod: 'cash',
  payments: [{ method: 'cash', amount: 1000 }],
  subtotal: 1000,
  total: 1000,
  onNewSale: vi.fn(),
  onClose: vi.fn(),
  onReprint: vi.fn(),
};

afterEach(() => cleanup());

describe('CrmThermalTicket — sin printStatus (comportamiento previo intacto)', () => {
  it('no muestra ningún banner de impresión cuando no se pasa printStatus', () => {
    render(<CrmThermalTicket {...baseProps} />);
    expect(screen.queryByText('Imprimiendo ticket…')).not.toBeInTheDocument();
    expect(screen.queryByText('Ticket impreso correctamente.')).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay una impresora configurada/)).not.toBeInTheDocument();
    expect(screen.queryByText('Reintentar impresión')).not.toBeInTheDocument();
  });

  it('el botón "Reimprimir" y "Nueva venta" siguen funcionando', () => {
    render(<CrmThermalTicket {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Reimprimir/ }));
    expect(baseProps.onReprint).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Nueva venta/ }));
    expect(baseProps.onNewSale).toHaveBeenCalledTimes(1);
  });
});

describe('CrmThermalTicket — printStatus="printing"', () => {
  it('muestra "Imprimiendo ticket…"', () => {
    render(<CrmThermalTicket {...baseProps} printStatus="printing" />);
    expect(screen.getByText('Imprimiendo ticket…')).toBeInTheDocument();
  });
});

describe('CrmThermalTicket — printStatus="success"', () => {
  it('muestra confirmación de impresión', () => {
    render(<CrmThermalTicket {...baseProps} printStatus="success" />);
    expect(screen.getByText('Ticket impreso correctamente.')).toBeInTheDocument();
  });
});

describe('CrmThermalTicket — printStatus="missing_printer"', () => {
  it('avisa que no hay impresora configurada y ofrece ir a configurarla', () => {
    const onConfigurePrinter = vi.fn();
    render(<CrmThermalTicket {...baseProps} printStatus="missing_printer" onConfigurePrinter={onConfigurePrinter} />);
    expect(screen.getByText(/No hay una impresora configurada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar impresora' }));
    expect(onConfigurePrinter).toHaveBeenCalledTimes(1);
  });

  it('no revienta si no se pasa onConfigurePrinter', () => {
    expect(() => render(<CrmThermalTicket {...baseProps} printStatus="missing_printer" />)).not.toThrow();
    expect(screen.queryByRole('button', { name: 'Configurar impresora' })).not.toBeInTheDocument();
  });
});

describe('CrmThermalTicket — printStatus="error"', () => {
  it('muestra el mensaje de error y dice explícitamente que la venta quedó registrada', () => {
    render(<CrmThermalTicket {...baseProps} printStatus="error" printErrorMessage="La impresora no responde" />);
    expect(screen.getByText(/La impresora no responde/)).toBeInTheDocument();
    expect(screen.getByText(/La venta ya quedó registrada/)).toBeInTheDocument();
  });

  it('usa un mensaje genérico si no se pasa printErrorMessage', () => {
    render(<CrmThermalTicket {...baseProps} printStatus="error" />);
    expect(screen.getByText(/No se pudo imprimir el ticket\./)).toBeInTheDocument();
  });

  it('el botón "Reintentar impresión" llama a onReprint (mismo ticket, sin recrear la venta)', () => {
    render(<CrmThermalTicket {...baseProps} printStatus="error" printErrorMessage="boom" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar impresión' }));
    expect(baseProps.onReprint).toHaveBeenCalled();
  });

  it('el botón genérico "Reimprimir" sigue disponible además del de reintentar', () => {
    render(<CrmThermalTicket {...baseProps} printStatus="error" printErrorMessage="boom" />);
    expect(screen.getByRole('button', { name: 'Reintentar impresión' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reimprimir/ })).toBeInTheDocument();
  });
});
