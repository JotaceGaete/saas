import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// RequireBusinessCountry (paso siguiente cuando pasa el guard) arrastra
// waBusinessService -> lib/supabase, que exige env vars reales de Supabase.
// Se aísla aquí como passthrough para probar únicamente la lógica propia de
// RequireAuth, igual que RequireAdmin.test.jsx aísla sus dependencias pesadas.
vi.mock('./RequireBusinessCountry', () => ({
  default: ({ children }) => <>{children}</>,
}));

import { useAuth } from '../contexts/AuthContext';
import RequireAuth from './RequireAuth';

function renderPrivateRoute() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<RequireAuth><div>private-page</div></RequireAuth>} />
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/verify-email" element={<div>verify-email-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function baseAuth(overrides) {
  return {
    user: { id: 'u1' },
    business: null,
    businessLoading: false,
    loading: false,
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

describe('RequireAuth — modo de acceso restringido (VITE_RESTRICTED_ACCESS)', () => {
  it('flag=true + usuario no admin: muestra RestrictedAccessScreen y no renderiza la ruta privada', () => {
    vi.stubEnv('VITE_RESTRICTED_ACCESS', 'true');
    useAuth.mockReturnValue(baseAuth({ isAdmin: false }));

    renderPrivateRoute();

    expect(screen.getByText(/acceso temporalmente restringido/i)).toBeInTheDocument();
    expect(screen.queryByText('private-page')).not.toBeInTheDocument();
  });

  it('flag=true + admin: permite continuar normalmente (renderiza la ruta privada)', () => {
    vi.stubEnv('VITE_RESTRICTED_ACCESS', 'true');
    useAuth.mockReturnValue(baseAuth({ isAdmin: true }));

    renderPrivateRoute();

    expect(screen.getByText('private-page')).toBeInTheDocument();
    expect(screen.queryByText(/acceso temporalmente restringido/i)).not.toBeInTheDocument();
  });

  it('flag=false: comportamiento actual sin cambios (usuario no admin accede igual que siempre)', () => {
    vi.stubEnv('VITE_RESTRICTED_ACCESS', 'false');
    useAuth.mockReturnValue(baseAuth({ isAdmin: false }));

    renderPrivateRoute();

    expect(screen.getByText('private-page')).toBeInTheDocument();
    expect(screen.queryByText(/acceso temporalmente restringido/i)).not.toBeInTheDocument();
  });

  it('flag ausente (comportamiento por defecto): equivalente a flag=false', () => {
    useAuth.mockReturnValue(baseAuth({ isAdmin: false }));

    renderPrivateRoute();

    expect(screen.getByText('private-page')).toBeInTheDocument();
    expect(screen.queryByText(/acceso temporalmente restringido/i)).not.toBeInTheDocument();
  });
});
