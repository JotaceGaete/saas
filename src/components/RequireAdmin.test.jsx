import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('components/ui/DashboardAppShell', () => ({
  default: ({ children }) => <div data-testid="shell">{children}</div>,
}));
vi.mock('components/ui/DashboardLayoutContent', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('components/ui/PanelHeader', () => ({
  default: () => <div data-testid="panel-header" />,
}));
vi.mock('../services/referralService', () => ({
  getMyReferralStats: vi.fn(() => new Promise(() => {})), // nunca resuelve: no importa para este test
  listMyReferrals: vi.fn(() => new Promise(() => {})),
}));

import { useAuth } from '../contexts/AuthContext';
import RequireAdmin from './RequireAdmin';
import AffiliatesPage from '../pages/affiliates';

function renderAffiliatesRoute() {
  return render(
    <MemoryRouter initialEntries={['/afiliados']}>
      <Routes>
        <Route path="/afiliados" element={<RequireAdmin><AffiliatesPage /></RequireAdmin>} />
        <Route path="/dashboard" element={<div>dashboard-page</div>} />
        <Route path="/login" element={<div>login-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RequireAdmin protegiendo /afiliados (rollout admin-only)', () => {
  it('admin puede acceder: se renderiza AffiliatesPage', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' }, loading: false, isAdmin: true, isEmailConfirmed: true });

    renderAffiliatesRoute();

    await waitFor(() => expect(screen.getByTestId('shell')).toBeInTheDocument());
    expect(screen.queryByText('dashboard-page')).not.toBeInTheDocument();
  });

  it('no-admin NO puede acceder: se redirige a /dashboard, AffiliatesPage nunca se monta', async () => {
    useAuth.mockReturnValue({ user: { id: 'u2' }, loading: false, isAdmin: false, isEmailConfirmed: true });

    renderAffiliatesRoute();

    await waitFor(() => expect(screen.getByText('dashboard-page')).toBeInTheDocument());
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  it('mientras el estado admin está cargando, AffiliatesPage NO se renderiza (evita flash)', () => {
    useAuth.mockReturnValue({ user: null, loading: true, isAdmin: false, isEmailConfirmed: false });

    renderAffiliatesRoute();

    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
    expect(screen.queryByText('dashboard-page')).not.toBeInTheDocument();
  });

  it('sin sesión: se redirige a /login, AffiliatesPage nunca se monta', async () => {
    useAuth.mockReturnValue({ user: null, loading: false, isAdmin: false, isEmailConfirmed: false });

    renderAffiliatesRoute();

    await waitFor(() => expect(screen.getByText('login-page')).toBeInTheDocument());
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });

  it('usuario auto-elevado vía user_metadata.role=admin (sin app_metadata admin) NO entra: se redirige a /dashboard como usuario normal', async () => {
    // AuthContext.jsx ya no computa isAdmin=true para este caso (ver
    // AuthContext.test.jsx, fix de escalación de privilegios 2026-08-17) --
    // isAdmin:false acá es exactamente lo que ese usuario recibiría del
    // contexto real. Este test documenta que RequireAdmin actúa
    // correctamente sobre ese resultado, no que RequireAdmin mismo lea
    // metadata (no lo hace).
    useAuth.mockReturnValue({ user: { id: 'u3' }, loading: false, isAdmin: false, isEmailConfirmed: true });

    renderAffiliatesRoute();

    await waitFor(() => expect(screen.getByText('dashboard-page')).toBeInTheDocument());
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });
});
