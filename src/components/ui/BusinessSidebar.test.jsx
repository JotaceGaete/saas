import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BusinessSidebar from './BusinessSidebar';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'duena@example.com' },
    business: { name: 'Mi Tienda', planSlug: 'starter' },
    signOut: vi.fn(),
    isAdmin: false,
    isImpersonating: false,
    stopImpersonation: vi.fn(),
  }),
}));

function renderSidebar(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BusinessSidebar />
    </MemoryRouter>,
  );
}

describe('BusinessSidebar', () => {
  it('no desmonta/remonta el contenido del sidebar al re-renderizar por un cambio de estado interno', () => {
    renderSidebar();

    // El aside de escritorio siempre está montado (Tailwind solo lo oculta con
    // `hidden lg:flex` en mobile, jsdom no aplica CSS), así que su botón de menú
    // de usuario sirve como sonda de identidad de nodo DOM.
    const userMenuButtonBefore = screen.getByRole('button', { name: 'Menú de usuario' });

    // Abrir el menú de usuario cambia estado y re-renderiza BusinessSidebar. Si
    // `SidebarContent` se redefiniera dentro del render (el bug original), React
    // trataría esto como un tipo de componente distinto en cada render y
    // desmontaría/remontaría todo el subárbol, destruyendo este nodo del DOM
    // (la condición que dispara la carrera removeChild/NotFoundError en Android).
    fireEvent.click(userMenuButtonBefore);

    const userMenuButtonAfter = screen.getByRole('button', { name: 'Menú de usuario' });
    expect(userMenuButtonAfter).toBe(userMenuButtonBefore);
  });

  it('no desmonta/remonta el contenido del sidebar al navegar a otra ruta', () => {
    renderSidebar('/dashboard');
    const userMenuButtonBefore = screen.getByRole('button', { name: 'Menú de usuario' });

    fireEvent.click(within(screen.getByLabelText('Navegación lateral')).getByRole('button', { name: 'Pedidos' }));

    const userMenuButtonAfter = screen.getByRole('button', { name: 'Menú de usuario' });
    expect(userMenuButtonAfter).toBe(userMenuButtonBefore);
  });

  it('cierra el drawer móvil al navegar a /planes desde el menú', () => {
    renderSidebar('/dashboard');

    fireEvent.click(screen.getByLabelText('Abrir menú de navegación'));
    const drawer = screen.getByLabelText('Menú de navegación');
    expect(drawer).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Plan y facturación' }));

    expect(screen.queryByLabelText('Menú de navegación')).not.toBeInTheDocument();
  });
});
