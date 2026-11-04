import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const svc = vi.hoisted(() => ({ listFiscalApplications: vi.fn(), reviewFiscalApplication: vi.fn() }));
vi.mock('components/AppIcon', () => ({ default: () => null }));
vi.mock('components/ui/BusinessSidebar', () => ({ default: () => null }));
vi.mock('hooks/useMediaQuery', () => ({ useIsDesktop: () => true }));
vi.mock('services/adminFiscalApplicationsService', async () => {
  const actual = await vi.importActual('../../services/adminFiscalApplicationsService');
  return { ...actual, ...svc };
});
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }));

const { default: AdminFiscalApplicationsPage } = await import('./AdminFiscalApplicationsPage');

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const pending = {
  businessId: BIZ, businessName: 'Bonita Casualidad', issuerRut: '77804207-K', reviewStatus: 'pending_review',
  hasCredentials: true, resolucionNumero: 80, resolucionFecha: '2014-08-22', ownerEmail: 'duena@test.cl',
  submittedAt: '2026-11-04T12:00:00Z', sucursalNombre: null, sucursalCodigo: null, reviewNote: null,
};

beforeEach(() => { svc.listFiscalApplications.mockReset(); svc.reviewFiscalApplication.mockReset(); });
afterEach(() => cleanup());

function renderPage() {
  return render(<MemoryRouter><AdminFiscalApplicationsPage /></MemoryRouter>);
}

describe('revisión de altas (Walinka)', () => {
  it('lista las pendientes por defecto', async () => {
    svc.listFiscalApplications.mockResolvedValue({ applications: [pending] });
    renderPage();
    const card = await screen.findByTestId(`application-${BIZ}`);
    expect(card).toHaveTextContent('Bonita Casualidad');
    expect(card).toHaveTextContent('77804207-K');
    expect(card).toHaveTextContent('N° 80');
    expect(svc.listFiscalApplications).toHaveBeenCalledWith('pending_review');
  });

  it('aprobar exige marcar la lista de verificación', async () => {
    svc.listFiscalApplications.mockResolvedValue({ applications: [pending] });
    svc.reviewFiscalApplication.mockResolvedValue({ applications: [{ ...pending, reviewStatus: 'approved' }] });
    renderPage();
    const card = await screen.findByTestId(`application-${BIZ}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Aprobar' }));
    const confirm = within(card).getByRole('button', { name: 'Confirmar aprobación' });
    expect(confirm).toBeDisabled();
    within(card).getAllByRole('checkbox').forEach((cb) => fireEvent.click(cb));
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(svc.reviewFiscalApplication).toHaveBeenCalledWith(BIZ, 'approve', ''));
    await waitFor(() => expect(screen.queryByTestId(`application-${BIZ}`)).toBeNull());
  });

  it('rechazar exige motivo', async () => {
    svc.listFiscalApplications.mockResolvedValue({ applications: [pending] });
    svc.reviewFiscalApplication.mockResolvedValue({ applications: [] });
    renderPage();
    const card = await screen.findByTestId(`application-${BIZ}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Rechazar' }));
    const confirm = within(card).getByRole('button', { name: 'Confirmar rechazo' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(card).getByRole('textbox'), { target: { value: 'El RUT no coincide con DTE Core' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(svc.reviewFiscalApplication).toHaveBeenCalledWith(BIZ, 'reject', 'El RUT no coincide con DTE Core'));
  });

  it('sin API key no se puede aprobar', async () => {
    svc.listFiscalApplications.mockResolvedValue({ applications: [{ ...pending, hasCredentials: false }] });
    renderPage();
    const card = await screen.findByTestId(`application-${BIZ}`);
    fireEvent.click(within(card).getByRole('button', { name: 'Aprobar' }));
    within(card).getAllByRole('checkbox').forEach((cb) => fireEvent.click(cb));
    expect(within(card).getByRole('button', { name: 'Confirmar aprobación' })).toBeDisabled();
  });

  it('error del servidor: se muestra sin romper la página', async () => {
    svc.listFiscalApplications.mockResolvedValue({ error: 'ADMIN_REQUIRED' });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo administradores');
  });
});
