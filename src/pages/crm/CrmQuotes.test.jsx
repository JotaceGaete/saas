/**
 * CrmQuotes.jsx — QUOTE-TO-SALE-1: el botón de un presupuesto aceptado
 * pasó de "Convertir a factura" (creaba la NV de inmediato) a "Crear nota
 * de venta" (solo navega al editor precargado -- nunca crea nada acá).
 *
 * Render/interacción real (React Testing Library), no source-scan.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));

vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/PanelHeader', () => ({
  default: ({ title, subtitle, children, mobileActions }) => <div>{title}{subtitle}{children}{mobileActions}</div>,
}));
vi.mock('components/ui/CrmBreadcrumb', () => ({ default: () => <div data-testid="breadcrumb-stub" /> }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', currency: 'CLP', documentTitleType: 'presupuesto' } }),
}));

const getCrmQuotesMock = vi.fn();
const updateCrmQuoteMock = vi.fn();
const duplicateCrmQuoteMock = vi.fn();

vi.mock('../../services/crmService', () => ({
  getCrmQuotes: (...a) => getCrmQuotesMock(...a),
  updateCrmQuote: (...a) => updateCrmQuoteMock(...a),
  duplicateCrmQuote: (...a) => duplicateCrmQuoteMock(...a),
  formatQuoteNumber: (n) => `PRES-${String(n).padStart(4, '0')}`,
  formatInvoiceNumber: (n) => `NV-${String(n).padStart(4, '0')}`,
  getQuoteDocLabel: () => ({
    title: 'Presupuesto', titleUpper: 'PRESUPUESTO', prefix: 'PRES',
    singular: 'presupuesto', plural: 'presupuestos',
    nuevo: 'Nuevo presupuesto', crear: 'Crear presupuesto',
  }),
}));

import CrmQuotes from './CrmQuotes';

const QUOTE_ACEPTADO_SIN_NV = {
  id: 'q1', quote_number: 5, status: 'aceptado', total: 15000, created_at: '2026-09-10T12:00:00Z',
  converted_to_invoice_id: null, wa_customers: { name: 'Cliente Uno' },
};
const QUOTE_ACEPTADO_CON_NV = {
  id: 'q2', quote_number: 6, status: 'aceptado', total: 20000, created_at: '2026-09-11T12:00:00Z',
  converted_to_invoice_id: 'inv-9', crm_invoices: { invoice_number: 9 }, wa_customers: { name: 'Cliente Dos' },
};
const QUOTE_ENVIADO = {
  id: 'q3', quote_number: 7, status: 'enviado', total: 5000, created_at: '2026-09-12T12:00:00Z',
  converted_to_invoice_id: null, wa_customers: { name: 'Cliente Tres' },
};

beforeEach(() => {
  [navigateMock, getCrmQuotesMock, updateCrmQuoteMock, duplicateCrmQuoteMock].forEach((m) => m.mockReset());
});

afterEach(() => cleanup());

async function renderPage(quotes) {
  getCrmQuotesMock.mockResolvedValue({ data: quotes, error: null });
  const utils = render(<CrmQuotes />);
  await waitFor(() => expect(getCrmQuotesMock).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument());
  return utils;
}

describe('CrmQuotes — QUOTE-TO-SALE-1: "Crear nota de venta" nunca crea nada', () => {
  it('un presupuesto aceptado sin NV muestra "Crear nota de venta" -- ya no "Convertir a factura"', async () => {
    await renderPage([QUOTE_ACEPTADO_SIN_NV]);
    expect(screen.getByRole('button', { name: /crear nota de venta/i })).toBeInTheDocument();
    expect(screen.queryByText(/convertir a factura/i)).not.toBeInTheDocument();
  });

  it('al pulsarlo, SOLO navega a /crm/facturas/nueva?quote=<id> -- no llama a ningún servicio de creación', async () => {
    await renderPage([QUOTE_ACEPTADO_SIN_NV]);
    fireEvent.click(screen.getByRole('button', { name: /crear nota de venta/i }));

    expect(navigateMock).toHaveBeenCalledWith('/crm/facturas/nueva?quote=q1');
    // No debe tocar el presupuesto ni crear nada: ni updateCrmQuote ni
    // duplicateCrmQuote se llaman por esta acción (son las únicas
    // funciones mutantes que este componente importa).
    expect(updateCrmQuoteMock).not.toHaveBeenCalled();
    expect(duplicateCrmQuoteMock).not.toHaveBeenCalled();
  });

  it('marcar como Aceptado (desde enviado) NUNCA navega a facturas ni dispara nada de NV -- solo cambia el status', async () => {
    updateCrmQuoteMock.mockResolvedValue({ data: { ...QUOTE_ENVIADO, status: 'aceptado' }, error: null });
    await renderPage([QUOTE_ENVIADO]);
    fireEvent.click(screen.getByRole('button', { name: /^aceptado$/i }));

    await waitFor(() => expect(updateCrmQuoteMock).toHaveBeenCalledWith('q3', { status: 'aceptado' }));
    expect(navigateMock).not.toHaveBeenCalledWith(expect.stringContaining('/crm/facturas'));
  });

  it('con NV ya vinculada: muestra "Nota de venta creada · NV-0009" (no el botón de crear) y navega al documento al pulsarlo', async () => {
    await renderPage([QUOTE_ACEPTADO_CON_NV]);
    const link = screen.getByRole('button', { name: /nota de venta creada.*nv-0009/i });
    expect(link).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /crear nota de venta/i })).not.toBeInTheDocument();

    fireEvent.click(link);
    expect(navigateMock).toHaveBeenCalledWith('/crm/facturas/inv-9');
  });
});
