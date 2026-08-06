// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// DashboardAppShell (vía BusinessSidebar) importa AuthContext, que a su vez importa
// lib/supabase -- revienta al evaluarse sin credenciales reales (mismo problema
// documentado en RequireBusinessCountry.test.js y public-catalog/index.test.jsx).
// Esta suite no ejercita autenticación real, así que se mockea únicamente para
// poder montar el shell con un negocio ya cargado (el estado de un usuario nuevo
// que acaba de terminar el onboarding).
let mockAuthValue = { user: { id: 'user-1' }, business: { id: 'biz-1' }, businessLoading: false };
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValue,
}));

const { default: DashboardAppShell } = await import('./DashboardAppShell');

function setViewport({ isDesktop }) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(min-width: 1024px)' ? isDesktop : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderShell() {
  return render(
    <MemoryRouter>
      <DashboardAppShell>
        <div>Contenido del dashboard</div>
      </DashboardAppShell>
    </MemoryRouter>,
  );
}

// Fragmentos del texto del aviso eliminado (GrowthNoticeModal), incluyendo
// variantes ortográficas/de redacción mencionadas en el reporte de regresión.
const REMOVED_POPUP_FRAGMENTS = [
  /aviso importante/i,
  /hemos tenido/i,
  /alta demanda/i,
  /algo extraño/i,
  /escribirnos por soporte/i,
];

beforeEach(() => {
  setViewport({ isDesktop: true });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DashboardAppShell: un usuario nuevo entra al dashboard sin el popup de aviso eliminado', () => {
  it('con el negocio recién cargado (business listo, sin flag en localStorage) no aparece ningún diálogo/modal', () => {
    mockAuthValue = { user: { id: 'user-1' }, business: { id: 'biz-1' }, businessLoading: false };
    renderShell();

    expect(screen.getByText('Contenido del dashboard')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    for (const fragment of REMOVED_POPUP_FRAGMENTS) {
      expect(screen.queryByText(fragment)).toBeNull();
    }
  });

  it('mientras el negocio todavía está cargando tampoco aparece ningún diálogo', () => {
    mockAuthValue = { user: { id: 'user-1' }, business: null, businessLoading: true };
    renderShell();

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('re-renderizar tras completar la carga del negocio (flujo real de un usuario nuevo) sigue sin mostrar ningún diálogo', () => {
    mockAuthValue = { user: { id: 'user-1' }, business: null, businessLoading: true };
    const { rerender } = renderShell();
    expect(screen.queryByRole('dialog')).toBeNull();

    // Simula que AuthContext termina de cargar el negocio justo después del onboarding.
    mockAuthValue = { user: { id: 'user-1' }, business: { id: 'biz-1' }, businessLoading: false };
    rerender(
      <MemoryRouter>
        <DashboardAppShell>
          <div>Contenido del dashboard</div>
        </DashboardAppShell>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    for (const fragment of REMOVED_POPUP_FRAGMENTS) {
      expect(screen.queryByText(fragment)).toBeNull();
    }
  });

  it('no persiste ninguna clave de "visto" del aviso eliminado en localStorage', () => {
    mockAuthValue = { user: { id: 'user-1' }, business: { id: 'biz-1' }, businessLoading: false };
    renderShell();

    expect(localStorage.getItem('walinka:growth_notice_seen:v1')).toBeNull();
  });
});
