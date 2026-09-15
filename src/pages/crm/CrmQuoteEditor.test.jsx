/**
 * CrmQuoteEditor.jsx — QUOTE-TO-SALE-1: un presupuesto 'aceptado' sin Nota
 * de Venta vinculada muestra el banner "Presupuesto aceptado" con el CTA
 * "Crear nota de venta" (navega precargado, nunca crea nada acá); uno ya
 * vinculado muestra "Nota de venta creada · NV-XXXX" con acceso directo.
 *
 * Render/interacción real (React Testing Library), no source-scan.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ id: 'q1' }),
}));

vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/PanelHeader', () => ({
  default: ({ title, children, mobileActions }) => <div>{title}{children}{mobileActions}</div>,
}));
vi.mock('./CrmDocumentPdf', () => ({ default: () => null }));
vi.mock('./components/CrmProductSearchModal', () => ({ CrmProductSearchModal: () => null }));
vi.mock('./components/QuickCustomerModal', () => ({ QuickCustomerModal: () => null }));
vi.mock('./components/ChileanDateInput', () => ({
  ChileanDateInput: ({ value, onChange, disabled }) => (
    <input aria-label="fecha" value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', currency: 'CLP', documentTitleType: 'presupuesto' } }),
}));

const getCrmQuoteMock = vi.fn();
const createCrmQuoteMock = vi.fn();
const updateCrmQuoteMock = vi.fn();
const getCrmCustomersMock = vi.fn();
const createCrmCustomerMock = vi.fn();

vi.mock('../../services/crmService', () => ({
  getCrmQuote: (...a) => getCrmQuoteMock(...a),
  createCrmQuote: (...a) => createCrmQuoteMock(...a),
  updateCrmQuote: (...a) => updateCrmQuoteMock(...a),
  getCrmCustomers: (...a) => getCrmCustomersMock(...a),
  createCrmCustomer: (...a) => createCrmCustomerMock(...a),
  formatQuoteNumber: (n) => `PRES-${String(n).padStart(4, '0')}`,
  formatInvoiceNumber: (n) => `NV-${String(n).padStart(4, '0')}`,
  getQuoteDocLabel: () => ({
    title: 'Presupuesto', titleUpper: 'PRESUPUESTO', prefix: 'PRES',
    singular: 'presupuesto', plural: 'presupuestos',
    nuevo: 'Nuevo presupuesto', crear: 'Crear presupuesto',
  }),
}));

const getProductsMock = vi.fn();
vi.mock('../../services/waBusinessService', () => ({ getProducts: (...a) => getProductsMock(...a) }));

import CrmQuoteEditor from './CrmQuoteEditor';

const BASE_QUOTE = {
  id: 'q1', business_id: 'biz1', quote_number: 5, customer_id: null, valid_until: null,
  notes: '', crm_quote_items: [], payment_terms: '', delivery_days: '', delivery_method: '', commercial_notes: '',
};

beforeEach(() => {
  [navigateMock, getCrmQuoteMock, createCrmQuoteMock, updateCrmQuoteMock, getCrmCustomersMock,
    createCrmCustomerMock, getProductsMock].forEach((m) => m.mockReset());
  getCrmCustomersMock.mockResolvedValue({ data: [], error: null });
  getProductsMock.mockResolvedValue({ data: [], error: null });
});

afterEach(() => cleanup());

describe('CrmQuoteEditor — QUOTE-TO-SALE-1: presupuesto aceptado', () => {
  it('aceptado sin NV: banner "Presupuesto aceptado" + CTA que navega a /crm/facturas/nueva?quote=q1', async () => {
    getCrmQuoteMock.mockResolvedValue({ data: { ...BASE_QUOTE, status: 'aceptado', converted_to_invoice_id: null }, error: null });
    render(<CrmQuoteEditor />);

    await waitFor(() => expect(screen.getByText('Presupuesto aceptado')).toBeInTheDocument());
    expect(screen.getByText(/el cliente aceptó esta propuesta/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /crear nota de venta/i }));
    expect(navigateMock).toHaveBeenCalledWith('/crm/facturas/nueva?quote=q1');
  });

  it('aceptado y ya vinculado a una NV: muestra "Nota de venta creada · NV-0009" y navega al documento, sin el CTA de crear', async () => {
    getCrmQuoteMock.mockResolvedValue({
      data: { ...BASE_QUOTE, status: 'aceptado', converted_to_invoice_id: 'inv-9', crm_invoices: { invoice_number: 9 } },
      error: null,
    });
    render(<CrmQuoteEditor />);

    await waitFor(() => expect(screen.getByText(/nota de venta creada/i)).toBeInTheDocument());
    expect(screen.getByText(/nv-0009/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /crear nota de venta/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ver nota de venta/i }));
    expect(navigateMock).toHaveBeenCalledWith('/crm/facturas/inv-9');
  });

  it('rechazado: sigue mostrando el mensaje genérico de documento bloqueado, no el banner de nota de venta', async () => {
    getCrmQuoteMock.mockResolvedValue({ data: { ...BASE_QUOTE, status: 'rechazado', converted_to_invoice_id: null }, error: null });
    render(<CrmQuoteEditor />);

    await waitFor(() => expect(screen.getByText(/ya no se puede editar/i)).toBeInTheDocument());
    expect(screen.queryByText('Presupuesto aceptado')).not.toBeInTheDocument();
    expect(screen.queryByText(/nota de venta creada/i)).not.toBeInTheDocument();
  });
});
