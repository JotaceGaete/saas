/**
 * CrmCustomers.jsx — CLIENTES-UI-1: tabla lineal de clientes (desktop/tablet)
 * reemplaza la grilla de tarjetas grandes, preservando datos reales,
 * búsqueda, ficha, WhatsApp, y las acciones existentes (editar/eliminar).
 * Render/interacción real (React Testing Library), no source-scan.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';

vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/PanelHeader', () => ({ default: ({ title, subtitle, children, mobileActions }) => <div>{title}{subtitle}{children}{mobileActions}</div> }));
vi.mock('components/ui/CrmBreadcrumb', () => ({ default: () => <div data-testid="breadcrumb-stub" /> }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', currency: 'CLP' } }),
}));

const getCrmCustomersMock = vi.fn();
const createCrmCustomerMock = vi.fn();
const updateCrmCustomerMock = vi.fn();
const deleteCrmCustomerMock = vi.fn();
const getBusinessCreditSummaryMock = vi.fn();
const getCustomerPendingInvoicesMock = vi.fn();
const registerCustomerAbonoMock = vi.fn();
const getCustomerPaymentHistoryMock = vi.fn();

vi.mock('../../services/crmService', () => ({
  getCrmCustomers: (...a) => getCrmCustomersMock(...a),
  createCrmCustomer: (...a) => createCrmCustomerMock(...a),
  updateCrmCustomer: (...a) => updateCrmCustomerMock(...a),
  deleteCrmCustomer: (...a) => deleteCrmCustomerMock(...a),
  getBusinessCreditSummary: (...a) => getBusinessCreditSummaryMock(...a),
  getCustomerPendingInvoices: (...a) => getCustomerPendingInvoicesMock(...a),
  registerCustomerAbono: (...a) => registerCustomerAbonoMock(...a),
  getCustomerPaymentHistory: (...a) => getCustomerPaymentHistoryMock(...a),
  formatInvoiceNumber: (n) => `NV-${String(n).padStart(4, '0')}`,
}));

import CrmCustomers from './CrmCustomers';

const CUSTOMER_DEBT = {
  id: 'c-debt', business_id: 'biz1', name: 'Juan Pérez', company: '',
  rut: '11.111.111-1', phone: '+56 9 1111 1111', whatsapp: '', email: 'juan@cliente.cl',
};
const CUSTOMER_OK = {
  id: 'c-ok', business_id: 'biz1', name: 'Pamela Maturana', company: 'Imacenter SpA',
  rut: '77.777.777-7', phone: '+56 9 2238 4216', whatsapp: '', email: '',
};
const CUSTOMER_NO_CONTACT = {
  id: 'c-none', business_id: 'biz1', name: 'Sin Contacto', company: '',
  rut: '', phone: '', whatsapp: '', email: '',
};

function setDefaultMocks(customers) {
  getCrmCustomersMock.mockResolvedValue({ data: customers, error: null });
  getBusinessCreditSummaryMock.mockResolvedValue({
    balanceByCustomer: { 'c-debt': 10000, 'c-ok': 0, 'c-none': 0 },
    clientesConDeuda: 1,
    totalPorCobrar: 10000,
  });
  getCustomerPendingInvoicesMock.mockResolvedValue({ data: [], error: null });
  getCustomerPaymentHistoryMock.mockResolvedValue({ data: [], error: null });
}

beforeEach(() => {
  [getCrmCustomersMock, createCrmCustomerMock, updateCrmCustomerMock, deleteCrmCustomerMock,
    getBusinessCreditSummaryMock, getCustomerPendingInvoicesMock, registerCustomerAbonoMock,
    getCustomerPaymentHistoryMock].forEach((m) => m.mockReset());
  setDefaultMocks([CUSTOMER_DEBT, CUSTOMER_OK, CUSTOMER_NO_CONTACT]);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderPage() {
  const utils = render(<CrmCustomers />);
  await waitFor(() => expect(getCrmCustomersMock).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByText('Cargando clientes…')).not.toBeInTheDocument());
  return utils;
}

function getTable() {
  return document.querySelector('table');
}

// onClose de la ficha llama a load(), que recarga y remonta la tabla --
// las filas capturadas ANTES de abrir/cerrar una ficha quedan detached.
// Este helper siempre busca la fila viva actual en el DOM.
function getRowByName(name) {
  const rows = getTable().querySelectorAll('tbody tr');
  return Array.from(rows).find((r) => within(r).queryByText(name));
}

describe('1/2. Render de la tabla en desktop con las columnas principales', () => {
  it('renderiza una tabla con las 6 columnas pedidas', async () => {
    await renderPage();
    const table = getTable();
    expect(table).toBeTruthy();
    const headerRow = within(table.querySelector('thead'));
    expect(headerRow.getByText('Cliente / Razón Social')).toBeInTheDocument();
    expect(headerRow.getByText('Tipo / Identificación')).toBeInTheDocument();
    expect(headerRow.getByText('Contacto')).toBeInTheDocument();
    expect(headerRow.getByText('Estado Financiero')).toBeInTheDocument();
    expect(headerRow.getByText('Saldo Pendiente')).toBeInTheDocument();
    expect(headerRow.getByText('Acciones Rápidas')).toBeInTheDocument();
  });
});

describe('3/4. Estado financiero derivado del saldo real', () => {
  it('cliente con saldo > 0 muestra "Con deuda"', async () => {
    await renderPage();
    const row = getTable().querySelector('tbody tr');
    expect(within(row).getByText(/Con deuda/i)).toBeInTheDocument();
  });

  it('cliente con saldo <= 0 muestra "Al día"', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const okRow = Array.from(rows).find((r) => within(r).queryByText('Pamela Maturana'));
    expect(within(okRow).getByText(/Al día/i)).toBeInTheDocument();
  });
});

describe('5. Saldo pendiente real (no inventado)', () => {
  it('muestra el saldo real del balanceMap para el cliente con deuda', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const debtRow = Array.from(rows).find((r) => within(r).queryByText('Juan Pérez'));
    expect(within(debtRow).getByText('$10.000')).toBeInTheDocument();
  });

  it('muestra $0 para un cliente sin deuda', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const okRow = Array.from(rows).find((r) => within(r).queryByText('Pamela Maturana'));
    expect(within(okRow).getByText('$0')).toBeInTheDocument();
  });
});

describe('6. Identificación real / fallback "-"', () => {
  it('muestra el RUT real cuando existe', async () => {
    await renderPage();
    expect(within(getTable()).getByText('77.777.777-7')).toBeInTheDocument();
  });

  it('muestra "-" cuando no hay identificación', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const noneRow = Array.from(rows).find((r) => within(r).queryByText('Sin Contacto'));
    expect(within(noneRow).getByText('-')).toBeInTheDocument();
  });
});

describe('7/8. Contacto real y fallback', () => {
  it('muestra teléfono y email reales cuando existen', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const debtRow = Array.from(rows).find((r) => within(r).queryByText('Juan Pérez'));
    expect(within(debtRow).getByText('+56 9 1111 1111')).toBeInTheDocument();
    expect(within(debtRow).getByText('juan@cliente.cl')).toBeInTheDocument();
  });

  it('muestra "Sin contacto registrado" cuando no hay teléfono ni email, nunca "undefined"/"null"', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const noneRow = Array.from(rows).find((r) => within(r).queryByText('Sin Contacto'));
    expect(within(noneRow).getByText('Sin contacto registrado')).toBeInTheDocument();
    expect(within(noneRow).queryByText('undefined')).not.toBeInTheDocument();
    expect(within(noneRow).queryByText('null')).not.toBeInTheDocument();
  });
});

describe('9. WhatsApp solo aparece cuando hay teléfono utilizable', () => {
  it('muestra el botón WhatsApp para un cliente con teléfono válido', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const debtRow = Array.from(rows).find((r) => within(r).queryByText('Juan Pérez'));
    const wa = within(debtRow).getByLabelText('Enviar WhatsApp');
    expect(wa).toHaveAttribute('href', expect.stringContaining('https://wa.me/'));
  });

  it('no muestra el botón WhatsApp para un cliente sin teléfono', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const noneRow = Array.from(rows).find((r) => within(r).queryByText('Sin Contacto'));
    expect(within(noneRow).queryByLabelText('Enviar WhatsApp')).not.toBeInTheDocument();
  });
});

describe('10. Tratamiento visual suave para filas con deuda', () => {
  it('la fila con deuda tiene las clases rojas suaves, sin ser agresiva', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const debtRow = Array.from(rows).find((r) => within(r).queryByText('Juan Pérez'));
    expect(debtRow.className).toMatch(/bg-red-50\/10/);
    expect(debtRow.className).toMatch(/hover:bg-red-50\/40/);
  });

  it('la fila al día usa el hover neutro estándar', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const okRow = Array.from(rows).find((r) => within(r).queryByText('Pamela Maturana'));
    expect(okRow.className).toMatch(/hover:bg-gray-50/);
  });
});

describe('11. La ficha sigue funcionando', () => {
  it('click en "Ver ficha" abre el drawer con los datos del cliente', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const okRow = Array.from(rows).find((r) => within(r).queryByText('Pamela Maturana'));
    fireEvent.click(within(okRow).getByLabelText('Ver ficha'));
    await waitFor(() => expect(getCustomerPendingInvoicesMock).toHaveBeenCalledWith('biz1', 'c-ok'));
    expect(screen.getByRole('heading', { name: 'Pamela Maturana' })).toBeInTheDocument();
  });

  it('click en "Cobrar" abre el drawer directo en la pestaña Cuenta corriente (mismo flujo real de abono)', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const debtRow = Array.from(rows).find((r) => within(r).queryByText('Juan Pérez'));
    fireEvent.click(within(debtRow).getByLabelText('Cobrar saldo pendiente'));
    await waitFor(() => expect(getCustomerPendingInvoicesMock).toHaveBeenCalledWith('biz1', 'c-debt'));
    // La pestaña "Cuenta corriente" queda activa: su contenido ("Facturas pendientes") está visible.
    expect(screen.getByText('Facturas pendientes')).toBeInTheDocument();
  });
});

describe('Regresión — initialTab no deja estado residual entre aperturas sucesivas', () => {
  it('Cobrar (cliente A) → cerrar → Ficha (cliente B): B abre en Perfil, no en Cuenta corriente', async () => {
    await renderPage();

    // 1. Abrir cliente A (Juan Pérez) vía "Cobrar" -- debe abrir en Cuenta corriente.
    fireEvent.click(within(getRowByName('Juan Pérez')).getByLabelText('Cobrar saldo pendiente'));
    await waitFor(() => expect(getCustomerPendingInvoicesMock).toHaveBeenCalledWith('biz1', 'c-debt'));
    expect(screen.getByText('Facturas pendientes')).toBeInTheDocument();

    // 2. Cerrar el drawer (onClose recarga la lista -- la tabla se remonta).
    fireEvent.click(screen.getByLabelText('Cerrar ficha'));
    await waitFor(() => expect(screen.queryByText('Facturas pendientes')).not.toBeInTheDocument());
    await waitFor(() => expect(getTable()).toBeTruthy());

    // 3. Abrir cliente B (Pamela Maturana) vía "Ficha" -- debe abrir en Perfil, NUNCA en Cuenta
    //    corriente por estado residual de la apertura anterior. Se vuelve a buscar la fila
    //    porque la tabla se remontó tras el reload de load() -- la referencia vieja quedó detached.
    getCustomerPendingInvoicesMock.mockClear();
    fireEvent.click(within(getRowByName('Pamela Maturana')).getByLabelText('Ver ficha'));
    await waitFor(() => expect(getCustomerPendingInvoicesMock).toHaveBeenCalledWith('biz1', 'c-ok'));
    expect(screen.getByRole('heading', { name: 'Pamela Maturana' })).toBeInTheDocument();
    expect(screen.queryByText('Facturas pendientes')).not.toBeInTheDocument();
    expect(screen.getByText('Deuda pendiente')).toBeInTheDocument(); // marcador exclusivo de la tab Perfil
  });

  it('Ficha (cliente A) → cerrar → Cobrar (cliente B): B abre directo en Cuenta corriente', async () => {
    await renderPage();

    // 1. Abrir cliente A (Pamela Maturana) vía "Ficha" -- debe abrir en Perfil.
    fireEvent.click(within(getRowByName('Pamela Maturana')).getByLabelText('Ver ficha'));
    await waitFor(() => expect(getCustomerPendingInvoicesMock).toHaveBeenCalledWith('biz1', 'c-ok'));
    expect(screen.getByText('Deuda pendiente')).toBeInTheDocument();
    expect(screen.queryByText('Facturas pendientes')).not.toBeInTheDocument();

    // 2. Cerrar el drawer (onClose recarga la lista -- la tabla se remonta).
    fireEvent.click(screen.getByLabelText('Cerrar ficha'));
    await waitFor(() => expect(screen.queryByText('Deuda pendiente')).not.toBeInTheDocument());
    await waitFor(() => expect(getTable()).toBeTruthy());

    // 3. Abrir cliente B (Juan Pérez) vía "Cobrar" -- debe abrir directo en Cuenta corriente.
    //    Se vuelve a buscar la fila por la misma razón que arriba.
    getCustomerPendingInvoicesMock.mockClear();
    fireEvent.click(within(getRowByName('Juan Pérez')).getByLabelText('Cobrar saldo pendiente'));
    await waitFor(() => expect(getCustomerPendingInvoicesMock).toHaveBeenCalledWith('biz1', 'c-debt'));
    expect(screen.getByRole('heading', { name: 'Juan Pérez' })).toBeInTheDocument();
    expect(screen.getByText('Facturas pendientes')).toBeInTheDocument();
  });
});

describe('12. Las acciones existentes (editar/eliminar) no se pierden', () => {
  it('el menú "⋮" permite editar (abre el modal con los datos del cliente)', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const okRow = Array.from(rows).find((r) => within(r).queryByText('Pamela Maturana'));
    fireEvent.click(within(okRow).getByLabelText('Más acciones'));
    fireEvent.click(screen.getByText('Editar'));
    expect(screen.getByText('Editar cliente')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pamela Maturana')).toBeInTheDocument();
  });

  it('el menú "⋮" permite eliminar (llama a deleteCrmCustomer tras confirmar)', async () => {
    deleteCrmCustomerMock.mockResolvedValue({ error: null });
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const okRow = Array.from(rows).find((r) => within(r).queryByText('Pamela Maturana'));
    fireEvent.click(within(okRow).getByLabelText('Más acciones'));
    fireEvent.click(screen.getByText('Eliminar'));
    await waitFor(() => expect(deleteCrmCustomerMock).toHaveBeenCalledWith('c-ok'));
  });
});

describe('13. Click de acción no dispara accidentalmente click de fila', () => {
  it('click en WhatsApp no abre la ficha (no llama a getCustomerPendingInvoices)', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const debtRow = Array.from(rows).find((r) => within(r).queryByText('Juan Pérez'));
    fireEvent.click(within(debtRow).getByLabelText('Enviar WhatsApp'));
    expect(getCustomerPendingInvoicesMock).not.toHaveBeenCalled();
  });

  it('click en "Más acciones" no abre la ficha', async () => {
    await renderPage();
    const rows = getTable().querySelectorAll('tbody tr');
    const okRow = Array.from(rows).find((r) => within(r).queryByText('Pamela Maturana'));
    fireEvent.click(within(okRow).getByLabelText('Más acciones'));
    expect(getCustomerPendingInvoicesMock).not.toHaveBeenCalled();
  });
});

describe('14. Empty state', () => {
  it('sin clientes muestra el estado vacío, no una tabla rota', async () => {
    setDefaultMocks([]);
    await renderPage();
    expect(screen.getByText('Aún no hay clientes')).toBeInTheDocument();
    expect(document.querySelector('table')).toBeNull();
  });

  it('con búsqueda sin resultados muestra "Sin resultados"', async () => {
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nombre/i), { target: { value: 'zzz-no-existe' } });
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });
});

describe('15. Loading state preservado', () => {
  it('muestra el spinner de carga antes de resolver los datos', () => {
    let resolveCustomers;
    getCrmCustomersMock.mockReturnValue(new Promise((res) => { resolveCustomers = res; }));
    getBusinessCreditSummaryMock.mockReturnValue(new Promise(() => {}));
    render(<CrmCustomers />);
    expect(screen.getByText('Cargando clientes…')).toBeInTheDocument();
    resolveCustomers({ data: [], error: null });
  });
});

describe('16. Responsive: la tabla no reemplaza el fallback compacto en pantallas chicas', () => {
  it('existe un contenedor de tarjetas (mobile, lg:hidden) y uno de tabla (desktop, hidden lg:block)', async () => {
    await renderPage();
    const table = getTable();
    const tableWrapper = table.closest('div');
    expect(tableWrapper.className).toMatch(/hidden/);
    expect(tableWrapper.className).toMatch(/lg:block/);

    // El grid de tarjetas mobile sigue montado (mismo CustomerCard reutilizado), oculto en desktop vía lg:hidden.
    const mobileGrid = document.querySelector('.lg\\:hidden.grid');
    expect(mobileGrid).toBeTruthy();
  });
});
