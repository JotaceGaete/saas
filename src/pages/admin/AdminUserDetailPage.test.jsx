import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const svc = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  getAdminUserSessionDetail: vi.fn(),
}));

vi.mock('components/AppIcon', () => ({ default: () => null }));
vi.mock('components/ui/BusinessSidebar', () => ({ default: () => null }));
vi.mock('hooks/useMediaQuery', () => ({ useIsDesktop: () => true }));
vi.mock('components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('lib/supabase', () => ({ supabase: { rpc: vi.fn(), auth: { getSession: vi.fn() } } }));
vi.mock('services/adminUsersService', () => ({
  getAdminUser: svc.getAdminUser,
  banAdminUser: vi.fn(),
  unbanAdminUser: vi.fn(),
  deleteAdminUser: vi.fn(),
  setAdminUserRole: vi.fn(),
  impersonateUser: vi.fn(),
}));
vi.mock('services/adminPaymentsService', () => ({ adminChangePlan: vi.fn() }));
vi.mock('services/userSessionService', () => ({ getAdminUserSessionDetail: svc.getAdminUserSessionDetail }));

const { default: AdminUserDetailPage } = await import('./AdminUserDetailPage');

const UID = '33333333-3333-3333-3333-333333333333';
const USER = { id: UID, email: 'artemis@test.cl', role: null, banned_until: null, created_at: '2026-03-01T00:00:00Z', user_metadata: {} };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/admin/users/${UID}`]}>
      <Routes>
        <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  svc.getAdminUser.mockReset();
  svc.getAdminUserSessionDetail.mockReset();
  svc.getAdminUserSessionDetail.mockResolvedValue({ data: [], error: null });
});
afterEach(() => cleanup());

describe('AdminUserDetailPage: estado de carga', () => {
  it('una excepción de red muestra error y botón Reintentar, sin quedar cargando', async () => {
    svc.getAdminUser.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPage();
    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
    expect(screen.queryByText('Usuario no encontrado')).not.toBeInTheDocument();
  });

  it('una respuesta HTTP fallida muestra el mensaje del servicio y permite reintentar', async () => {
    svc.getAdminUser.mockResolvedValue({ data: null, error: { message: 'No autorizado' } });
    renderPage();
    expect(await screen.findByText('No autorizado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('Reintentar vuelve a pedir el usuario y muestra la ficha si la segunda petición funciona', async () => {
    svc.getAdminUser
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: { user: USER, businesses: [] }, error: null });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect((await screen.findAllByText('artemis@test.cl')).length).toBeGreaterThan(0);
    expect(svc.getAdminUser).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('si fallan las sesiones, la ficha del usuario igual se muestra', async () => {
    svc.getAdminUser.mockResolvedValue({ data: { user: USER, businesses: [] }, error: null });
    svc.getAdminUserSessionDetail.mockRejectedValue(new Error('rpc caído'));
    renderPage();
    expect((await screen.findAllByText('artemis@test.cl')).length).toBeGreaterThan(0);
    expect(screen.queryByText('rpc caído')).not.toBeInTheDocument();
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
  });
});
