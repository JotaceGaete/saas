import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

});

describe('BusinessSidebar — reorden de la navegación (Paso 2)', () => {
  it('ya no existe el grupo envoltorio "Gestión del negocio" del Paso 1', () => {
    renderSidebar(false);
    expect(screen.queryByText('Gestión del negocio')).not.toBeInTheDocument();
  });

  it('ya no muestra las etiquetas anteriores "Mi tienda" / "Productos" (renombradas) en el sidebar principal', () => {
    // Alcance acotado al <nav> del sidebar: MobileBottomNav (otro componente,
    // fuera de este paso) tiene su propio ítem "Productos" para /product-management.
    renderSidebar(false);
    const nav = screen.getByRole('navigation', { name: /navegación principal/i });
    expect(within(nav).queryByText('Mi tienda')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Productos')).not.toBeInTheDocument();
  });

  it('muestra los nuevos ítems de primer nivel: Mi Negocio, Ventas, Clientes, Caja y Gastos, Inventario, Catálogo', () => {
    renderSidebar(false);
    ['Mi Negocio', 'Ventas', 'Clientes', 'Caja y Gastos', 'Inventario', 'Catálogo'].forEach((label) => {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    });
  });

  it('respeta el orden pedido: Mi Negocio, Ventas, Clientes, Caja y Gastos, Inventario, Catálogo, Pedidos, Historial pedidos, Configuración, Diseño, Plan y facturación, Ayuda', () => {
    renderSidebar(false);
    const nav = screen.getByRole('navigation', { name: /navegación principal/i });
    const text = nav.textContent || '';
    const order = [
      'Mi Negocio', 'Ventas', 'Clientes', 'Caja y Gastos', 'Inventario',
      'Catálogo', 'Pedidos', 'Historial pedidos',
      'Configuración', 'Diseño', 'Plan y facturación', 'Ayuda',
    ];
    const indices = order.map((label) => text.indexOf(label));
    indices.forEach((idx, i) => expect(idx, `"${order[i]}" debería estar presente`).toBeGreaterThan(-1));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i], `"${order[i]}" debería venir después de "${order[i - 1]}"`).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('Afiliados sigue siendo el último ítem visible para admin, después de Ayuda', () => {
    renderSidebar(true);
    const nav = screen.getByRole('navigation', { name: /navegación principal/i });
    const text = nav.textContent || '';
    expect(text.indexOf('Afiliados')).toBeGreaterThan(text.indexOf('Ayuda'));
  });
});
