/**
 * SupplierInvoiceFormModal.jsx — render/interacción real (React Testing
 * Library), no source-scan. Cubre PROVEEDORES-CORE-3 escenarios 1, 3, 4,
 * 13, 14 del pedido de tests.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SupplierInvoiceFormModal from './SupplierInvoiceFormModal';

afterEach(() => cleanup());

const SUPPLIER = { id: 'sup1', name: 'Distribuidora Continental' };

describe('Escenario 1 — crear factura', () => {
  it('completa el formulario y llama a onSave con el payload correcto (total con IVA incluido)', async () => {
    const onSave = vi.fn().mockResolvedValue();
    const onClose = vi.fn();
    render(<SupplierInvoiceFormModal open onClose={onClose} onSave={onSave} supplier={SUPPLIER} country="CL" />);

    fireEvent.change(screen.getByPlaceholderText('Ej: 18452'), { target: { value: '18452' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '450000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar factura' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.documentType).toBe('factura');
    expect(payload.documentNumber).toBe('18452');
    expect(payload.totalAmount).toBe(450000);
    // IVA incluido por defecto, tasa 19% -- neto+iva deben sumar el total.
    expect(Math.round(payload.netAmount + payload.taxAmount)).toBe(450000);
  });

  it('rechaza el envío sin un total válido', () => {
    const onSave = vi.fn();
    render(<SupplierInvoiceFormModal open onClose={() => {}} onSave={onSave} supplier={SUPPLIER} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar factura' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/total válido/i)).toBeInTheDocument();
  });
});

describe('Escenario 3 — factura sin pagos (paidAmount=0) editable normalmente', () => {
  it('todos los campos, incluidos los monetarios, están habilitados', () => {
    const invoice = { id: 'inv1', documentType: 'factura', documentNumber: '18452', issueDate: '2026-09-10', totalAmount: 450000, taxRate: 19, paidAmount: 0 };
    render(<SupplierInvoiceFormModal open onClose={() => {}} onSave={vi.fn()} invoice={invoice} supplier={SUPPLIER} />);
    expect(screen.getByPlaceholderText('0')).not.toBeDisabled();
    expect(screen.queryByText(/ya tiene pagos registrados/i)).not.toBeInTheDocument();
  });
});

describe('Escenario 4 — factura con pagos (paidAmount>0) bloquea edición monetaria', () => {
  it('total, tipo de documento y tipo de compra quedan deshabilitados; notas/vencimiento/número siguen editables', () => {
    const invoice = { id: 'inv1', documentType: 'factura', documentNumber: '18452', issueDate: '2026-09-10', totalAmount: 450000, taxRate: 19, paidAmount: 100000 };
    render(<SupplierInvoiceFormModal open onClose={() => {}} onSave={vi.fn()} invoice={invoice} supplier={SUPPLIER} />);

    expect(screen.getByText(/ya tiene pagos registrados/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('$450.000')).toBeDisabled(); // total, readonly cuando está bloqueada
    expect(screen.getByPlaceholderText('Ej: 18452')).not.toBeDisabled(); // número de documento
    expect(screen.getByPlaceholderText('Observaciones...')).not.toBeDisabled(); // notas
  });

  it('el submit en modo bloqueado nunca envía campos monetarios', async () => {
    const onSave = vi.fn().mockResolvedValue();
    const invoice = { id: 'inv1', documentType: 'factura', documentNumber: '18452', issueDate: '2026-09-10', totalAmount: 450000, taxRate: 19, paidAmount: 100000 };
    render(<SupplierInvoiceFormModal open onClose={() => {}} onSave={onSave} invoice={invoice} supplier={SUPPLIER} />);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const payload = onSave.mock.calls[0][0];
    expect(payload).not.toHaveProperty('totalAmount');
    expect(payload).not.toHaveProperty('netAmount');
    expect(payload).not.toHaveProperty('taxAmount');
    expect(payload).not.toHaveProperty('taxRate');
    expect(Object.keys(payload).sort()).toEqual(['documentNumber', 'dueDate', 'notes'].sort());
  });
});

describe('PROVEEDORES-CORE-4B — taxIncluded en el payload', () => {
  it('crear con "Incluido en el total" marcado (default) envía taxIncluded=true', () => {
    const onSave = vi.fn().mockResolvedValue();
    render(<SupplierInvoiceFormModal open onClose={() => {}} onSave={onSave} supplier={SUPPLIER} country="CL" />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '450000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar factura' }));
    const payload = onSave.mock.calls[0][0];
    expect(payload.taxIncluded).toBe(true);
  });

  it('crear con "Incluido en el total" desmarcado envía taxIncluded=false', () => {
    const onSave = vi.fn().mockResolvedValue();
    render(<SupplierInvoiceFormModal open onClose={() => {}} onSave={onSave} supplier={SUPPLIER} country="CL" />);
    fireEvent.click(screen.getByLabelText(/Incluido en el total/i));
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '450000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar factura' }));
    const payload = onSave.mock.calls[0][0];
    expect(payload.taxIncluded).toBe(false);
  });

  it('editar una factura sin pagos (paidAmount=0) permite cambiar taxIncluded y lo envía', () => {
    const onSave = vi.fn().mockResolvedValue();
    const invoice = { id: 'inv1', documentType: 'factura', documentNumber: '18452', issueDate: '2026-09-10', totalAmount: 450000, taxRate: 19, paidAmount: 0 };
    render(<SupplierInvoiceFormModal open onClose={() => {}} onSave={onSave} invoice={invoice} supplier={SUPPLIER} />);
    expect(screen.getByLabelText(/Incluido en el total/i)).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Incluido en el total/i));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const payload = onSave.mock.calls[0][0];
    expect(payload.taxIncluded).toBe(false);
  });

  it('editar una factura con pagos (paidAmount>0) nunca envía taxIncluded (checkbox deshabilitado)', () => {
    const onSave = vi.fn().mockResolvedValue();
    const invoice = { id: 'inv1', documentType: 'factura', documentNumber: '18452', issueDate: '2026-09-10', totalAmount: 450000, taxRate: 19, paidAmount: 100000 };
    render(<SupplierInvoiceFormModal open onClose={() => {}} onSave={onSave} invoice={invoice} supplier={SUPPLIER} />);
    expect(screen.getByLabelText(/Incluido en el total/i)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const payload = onSave.mock.calls[0][0];
    expect(payload).not.toHaveProperty('taxIncluded');
  });
});

describe('Escenario 13 — nota_credito no aparece en la UI', () => {
  it('el selector de tipo de documento nunca ofrece "Nota de crédito"', () => {
    render(<SupplierInvoiceFormModal open onClose={() => {}} onSave={vi.fn()} supplier={SUPPLIER} />);
    expect(screen.queryByText(/nota de crédito/i)).not.toBeInTheDocument();
    expect(screen.getByText('Factura')).toBeInTheDocument();
    expect(screen.getByText('Boleta')).toBeInTheDocument();
    expect(screen.getByText('Otro')).toBeInTheDocument();
  });
});

describe('Escenario 14 — legacy_debt no aparece en la UI', () => {
  it('el selector de tipo de documento nunca ofrece un valor de tipo "legacy"', () => {
    render(<SupplierInvoiceFormModal open onClose={() => {}} onSave={vi.fn()} supplier={SUPPLIER} />);
    expect(screen.queryByText(/legacy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/deuda/i)).not.toBeInTheDocument();
  });
});
