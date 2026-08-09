import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from 'contexts/AuthContext';
import BusinessSidebar from './BusinessSidebar';

const BASE_AUTH = {
  user: { id: 'u1', email: 'owner@example.test' },
  business: null,
  signOut: vi.fn(),
  isImpersonating: false,
  stopImpersonation: vi.fn(),
};

function renderSidebar(isAdmin) {
  useAuth.mockReturnValue({ ...BASE_AUTH, isAdmin });
  return render(
    <MemoryRouter>
      <BusinessSidebar />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = window.matchMedia || vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe('BusinessSidebar — ítem Afiliados (rollout admin-only)', () => {
  it('admin ve "Afiliados" en la navegación', () => {
    renderSidebar(true);
    expect(screen.getAllByText('Afiliados').length).toBeGreaterThan(0);
  });

  it('no-admin NO ve "Afiliados" en la navegación', () => {
    renderSidebar(false);
    expect(screen.queryByText('Afiliados')).not.toBeInTheDocument();
  });

  it('no-admin sigue viendo ítems no restringidos (mismo filtro adminOnly de siempre)', () => {
    renderSidebar(false);
    expect(screen.getAllByText('Ayuda').length).toBeGreaterThan(0);
  });
});
