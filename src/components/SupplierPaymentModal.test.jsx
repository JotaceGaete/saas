/**
 * SupplierPaymentModal.jsx — render/interacción real. Cubre
 * PROVEEDORES-CORE-3 escenarios 5, 6, 7, 8 del pedido de tests.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SupplierPaymentModal from './SupplierPaymentModal';

afterEach(() => cleanup());

const SUPPLIER = { id: 'sup1', name: 'Distribuidora Continental' };
const INVOICE_A = { id: 'invA', documentType: 'factura', documentNumber: '18452', balance: 450000 };
const INVOICE_B = { id: 'invB', documentType: 'factura', documentNumber: '18453', balance: 200000 };

function checkboxFor(documentNumber) {
  const label = screen.getByText(new RegExp(documentNumber)).closest('label');
  return label.querySelector('input[type="checkbox"]');
}

describe('Escenario 6 — pago total de una factura', () => {
  it('tildar una factura prellena el monto con su saldo completo, y el pago se envía exacto a ese saldo', async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(<SupplierPaymentModal open onClose={() => {}} onSave={onSave} supplier={SUPPLIER} invoices={[INVOICE_A]} />);

    fireEvent.click(checkboxFor('18452'));
    expect(screen.getByText('$ $450.000')).toBeInTheDocument(); // "Monto del pago" ya refleja el total

    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      amount: 450000,
      allocations: [{ invoiceId: 'invA', amount: 450000 }],
    }));
  });
});

describe('Escenario 5 — pago parcial', () => {
  it('editar el monto de la factura tildada hacia abajo se refleja en el total y en las allocations', async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(<SupplierPaymentModal open onClose={() => {}} onSave={onSave} supplier={SUPPLIER} invoices={[INVOICE_A]} />);

    fireEvent.click(checkboxFor('18452'));
    const amountInput = screen.getAllByRole('textbox').find((el) => el.value === '450.000');
    fireEvent.change(amountInput, { target: { value: '100000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      amount: 100000,
      allocations: [{ invoiceId: 'invA', amount: 100000 }],
    }));
  });

  it('rechaza si el monto asignado a una factura supera su saldo pendiente', () => {
    const onSave = vi.fn();
    render(<SupplierPaymentModal open onClose={() => {}} onSave={onSave} supplier={SUPPLIER} invoices={[INVOICE_A]} />);
    fireEvent.click(checkboxFor('18452'));
    const amountInput = screen.getAllByRole('textbox').find((el) => el.value === '450.000');
    fireEvent.change(amountInput, { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/supera su saldo pendiente/i)).toBeInTheDocument();
  });
});

describe('Escenario 7 — un pago aplicado a varias facturas del mismo proveedor', () => {
  it('tildar dos facturas suma ambos saldos en "Monto del pago" y arma dos allocations', async () => {
    const onSave = vi.fn().mockResolvedValue();
    render(<SupplierPaymentModal open onClose={() => {}} onSave={onSave} supplier={SUPPLIER} invoices={[INVOICE_A, INVOICE_B]} />);

    fireEvent.click(checkboxFor('18452'));
    fireEvent.click(checkboxFor('18453'));
    expect(screen.getByText('$ $650.000')).toBeInTheDocument(); // 450000 + 200000

    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    const payload = onSave.mock.calls[0][0];
    expect(payload.amount).toBe(650000);
    expect(payload.allocations).toEqual(expect.arrayContaining([
      { invoiceId: 'invA', amount: 450000 },
      { invoiceId: 'invB', amount: 200000 },
    ]));
    expect(payload.allocations).toHaveLength(2);
  });
});

describe('Escenario 8 — amount del pago = suma de allocations, siempre, por construcción', () => {
  it('no existe ningún campo de "monto del pago" editable de forma independiente -- solo un total derivado, de solo lectura', () => {
    render(<SupplierPaymentModal open onClose={() => {}} onSave={vi.fn()} supplier={SUPPLIER} invoices={[INVOICE_A, INVOICE_B]} />);
    // Los únicos inputs numéricos son los de "monto asignado" por factura --
    // no hay un input separado de "monto del pago" en ningún lado del DOM.
    expect(screen.queryByLabelText(/monto del pago/i)).not.toBeInTheDocument();
    fireEvent.click(checkboxFor('18452'));
    fireEvent.click(checkboxFor('18453'));
    const displayedTotal = screen.getByText('$ $650.000');
    // Es texto estático (span), no un <input> -- no editable directamente.
    expect(displayedTotal.tagName).toBe('SPAN');
  });

  it('sin ninguna factura tildada, el monto del pago es $0 y el submit se rechaza', () => {
    const onSave = vi.fn();
    render(<SupplierPaymentModal open onClose={() => {}} onSave={onSave} supplier={SUPPLIER} invoices={[INVOICE_A]} />);
    expect(screen.getByText('$ $0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/seleccioná al menos una factura/i)).toBeInTheDocument();
  });
});
