import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// hasCrmAccess siempre true: así "flag=true + no admin" demuestra que bloquea
// AUNQUE el plan/CRM esté habilitado, no porque falte el plan.
vi.mock('../hooks/usePlanFeature', () => ({
  usePlanFeature: () => true,
}));

import { useAuth } from '../contexts/AuthContext';
import RequireCrm from './RequireCrm';

function renderCrmRoute() {
  return render(
    <MemoryRouter initialEntries={['/crm']}>
      <Routes>
        <Route path="/crm" element={<RequireCrm><div>crm-page</div></RequireCrm>} />
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/verify-email" element={<div>verify-email-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function baseAuth(overrides) {
  return {
    user: { id: 'u1' },
    loading: false,
    businessLoading: false,
    isEmailConfirmed: true,
    isAdmin: false,
    signOut: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('RequireCrm — modo de acceso restringido (VITE_RESTRICTED_ACCESS)', () => {
  it('flag=true + no admin: bloqueado aunque tenga plan/CRM habilitado', () => {
    vi.stubEnv('VITE_RESTRICTED_ACCESS', 'true');
    useAuth.mockReturnValue(baseAuth({ isAdmin: false }));

    renderCrmRoute();

    expect(screen.getByText(/acceso temporalmente restringido/i)).toBeInTheDocument();
    expect(screen.queryByText('crm-page')).not.toBeInTheDocument();
  });

  it('flag=true + admin: bypass normal y acceso permitido', () => {
    vi.stubEnv('VITE_RESTRICTED_ACCESS', 'true');
    useAuth.mockReturnValue(baseAuth({ isAdmin: true }));

    renderCrmRoute();

    expect(screen.getByText('crm-page')).toBeInTheDocument();
    expect(screen.queryByText(/acceso temporalmente restringido/i)).not.toBeInTheDocument();
  });

  it('flag=false: comportamiento actual (no admin con plan CRM habilitado accede igual que siempre)', () => {
    vi.stubEnv('VITE_RESTRICTED_ACCESS', 'false');
    useAuth.mockReturnValue(baseAuth({ isAdmin: false }));

    renderCrmRoute();

    expect(screen.getByText('crm-page')).toBeInTheDocument();
    expect(screen.queryByText(/acceso temporalmente restringido/i)).not.toBeInTheDocument();
  });
});
