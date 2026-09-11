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

// El submenú "Gestión del negocio" se auto-expande cuando el pathname
// arranca con /crm o /proveedores (ver useEffect de BusinessSidebar).
function renderSidebarAt(path, isAdmin = false) {
  useAuth.mockReturnValue({ ...BASE_AUTH, isAdmin });
  return render(
    <MemoryRouter initialEntries={[path]}>
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

describe('BusinessSidebar — renombrado de "CRM" y remoción del badge "Premium" (Paso 1)', () => {
  it('no muestra el texto "CRM" en ningún ítem de navegación', () => {
    renderSidebar(false);
    expect(screen.queryByText('CRM')).not.toBeInTheDocument();
    expect(screen.queryByText('Panel CRM')).not.toBeInTheDocument();
  });

  it('no muestra el badge "Premium"', () => {
    renderSidebar(false);
    expect(screen.queryByText('Premium')).not.toBeInTheDocument();
  });

  it('muestra el nuevo label en lenguaje llano "Gestión del negocio"', () => {
    renderSidebar(false);
    expect(screen.getAllByText('Gestión del negocio').length).toBeGreaterThan(0);
  });
});

describe('10. PROVEEDORES-CORE-4B — sidebar ya no ofrece "Compras" duplicado bajo Gestión del negocio', () => {
  it('el submenú tiene "Proveedores" pero ningún ítem "Compras"', () => {
    renderSidebarAt('/proveedores');
    expect(screen.getAllByText('Proveedores').length).toBeGreaterThan(0);
    expect(screen.queryByText('Compras')).not.toBeInTheDocument();
    expect(screen.queryByText(/Compras y Facturas/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Facturas de compra')).not.toBeInTheDocument();
  });
});
