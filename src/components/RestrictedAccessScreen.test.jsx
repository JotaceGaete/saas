import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';
import RestrictedAccessScreen from './RestrictedAccessScreen';

function renderScreen() {
  return render(
    <MemoryRouter>
      <RestrictedAccessScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RestrictedAccessScreen', () => {
  it('con usuario autenticado: muestra "Cerrar sesión" (no "Iniciar sesión")', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' }, signOut: vi.fn(async () => {}) });

    renderScreen();

    expect(screen.getByText(/acceso temporalmente restringido/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /iniciar sesión/i })).not.toBeInTheDocument();
  });

  it('sin usuario (sin sesión): muestra "Iniciar sesión" (no "Cerrar sesión")', () => {
    useAuth.mockReturnValue({ user: null, signOut: vi.fn(async () => {}) });

    renderScreen();

    expect(screen.getByText(/acceso temporalmente restringido/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cerrar sesión/i })).not.toBeInTheDocument();
  });
});
