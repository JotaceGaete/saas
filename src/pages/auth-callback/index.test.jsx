import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// El vite.config.js de este repo (sin bloque `test`) tiene prioridad sobre
// vite.config.mjs en la resolución de Vitest, así que `setupFiles` nunca se
// aplica automáticamente. Se importa aquí directamente para tener matchers de
// jest-dom y, sobre todo, cleanup() entre tests (si no, el DOM se acumula y
// "getByTestId" encuentra múltiples nodos de tests anteriores).
import '../../test/setup';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import AuthCallback from './index';

const completeBusiness = {
  id: 'biz-1',
  name: 'Mi Tienda',
  whatsapp: '+56912345678',
  countryCodeDb: 'CL',
  slug: 'mi-tienda',
};

let mockGetSession = () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } }, error: null });
let mockGetMyBusiness = () => Promise.resolve({ data: completeBusiness, error: null });
let mockHasMultipleBusinesses = () => Promise.resolve({ data: false, error: null });

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
    },
  },
}));

vi.mock('../../services/waBusinessService', () => ({
  getMyBusiness: (...args) => mockGetMyBusiness(...args),
  hasMultipleBusinesses: (...args) => mockHasMultipleBusinesses(...args),
}));

vi.mock('components/ui/PremiumLoader', () => ({
  default: () => <div data-testid="loader">loading</div>,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

const originalLocation = window.location;

function setWindowLocation(overrides) {
  delete window.location;
  window.location = {
    ...originalLocation,
    hostname: 'go.ventalink.app',
    origin: 'https://go.ventalink.app',
    search: '',
    hash: '',
    href: '',
    replace: vi.fn(),
    ...overrides,
  };
}

describe('AuthCallback (Walinka / go.ventalink.app)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockGetSession = () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } }, error: null });
    mockGetMyBusiness = () => Promise.resolve({ data: completeBusiness, error: null });
    mockHasMultipleBusinesses = () => Promise.resolve({ data: false, error: null });
    setWindowLocation({});
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('usuario con un negocio y slug llega a su catálogo público', async () => {
    renderCallback();
    await waitFor(() => {
      expect(window.location.href).toBe('https://miralatienda.de/catalogo/mi-tienda');
    });
  });

  it('usuario sin negocio configurado llega al onboarding existente (business-registration)', async () => {
    mockGetMyBusiness = () => Promise.resolve({ data: null, error: null });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/business-registration');
    });
  });

  it('negocio con onboarding incompleto (sin whatsapp) llega a /onboarding', async () => {
    mockGetMyBusiness = () => Promise.resolve({ data: { ...completeBusiness, whatsapp: '' }, error: null });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/onboarding');
    });
  });

  it('negocio completo pero sin slug llega a /business-configuration', async () => {
    mockGetMyBusiness = () => Promise.resolve({ data: { ...completeBusiness, slug: null }, error: null });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/business-configuration');
    });
  });

  it('usuario con varios negocios no es enviado a uno arbitrario: va a /dashboard', async () => {
    mockHasMultipleBusinesses = () => Promise.resolve({ data: true, error: null });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/dashboard');
    });
  });

  it('el callback solo acepta orígenes permitidos: host no canónico redirige a APP_ORIGIN', async () => {
    setWindowLocation({ hostname: 'evil.com', origin: 'https://evil.com' });
    renderCallback();
    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalledWith('https://go.ventalink.app/auth/callback');
    });
  });

  it('una URL externa guardada como retorno es rechazada: el negocio completo sigue yendo a su catálogo', async () => {
    window.sessionStorage.setItem('auth_return_to', 'https://evil.com');
    renderCallback();
    await waitFor(() => {
      expect(window.location.href).toBe('https://miralatienda.de/catalogo/mi-tienda');
    });
  });

  it('un returnTo interno válido tiene prioridad sobre el catálogo (respeta la ruta que originó el login)', async () => {
    window.sessionStorage.setItem('auth_return_to', '/product-management');
    renderCallback();
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/product-management');
    });
  });

  it('no rompe el acceso normal al dashboard cuando corresponde (varios negocios)', async () => {
    mockHasMultipleBusinesses = () => Promise.resolve({ data: true, error: null });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/dashboard');
    });
  });

  it('sin sesión activa: vuelve a /login?checkEmail=true', async () => {
    mockGetSession = () => Promise.resolve({ data: { session: null }, error: null });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/login?checkEmail=true');
    });
  });

  it('error o cancelación (getSession devuelve error): vuelve a /login', async () => {
    mockGetSession = () => Promise.resolve({ data: { session: null }, error: { message: 'access_denied' } });
    renderCallback();
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/login');
    });
  });
});
