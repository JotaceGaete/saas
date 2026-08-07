import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
}));

vi.mock('../services/waBusinessService', () => ({
  getMyBusiness: vi.fn(),
  createBusinessForUser: vi.fn(),
  updateBusiness: vi.fn(async () => ({ data: null, error: null })),
}));

vi.mock('../services/userSessionService', () => ({
  startSession: vi.fn(async () => null),
  startHeartbeat: vi.fn(),
  stopHeartbeat: vi.fn(),
  endSession: vi.fn(async () => {}),
  registerActivityListeners: vi.fn(() => () => {}),
  registerUnloadHandler: vi.fn(() => () => {}),
  getCurrentSessionId: vi.fn(() => null),
}));

import { supabase } from '../lib/supabase';
import { getMyBusiness } from '../services/waBusinessService';

const MOCK_USER = { id: 'user-1', email: 'test@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };
const MOCK_SESSION = { user: MOCK_USER, access_token: 'tok', refresh_token: 'rtok' };

function Harness() {
  const { business, businessStatus, businessLoadError, refreshBusiness } = useAuth();
  return (
    <div>
      <span data-testid="status">{businessStatus}</span>
      <span data-testid="business-name">{business ? business.name : 'none'}</span>
      <span data-testid="error-message">{businessLoadError ? businessLoadError.message : 'none'}</span>
      <button onClick={() => refreshBusiness()}>retry</button>
    </div>
  );
}

/**
 * Monta AuthProvider con una sesión activa ya resuelta y devuelve el callback
 * de onAuthStateChange capturado, para poder simular nuevos eventos (ej. un
 * refresh posterior) sin tener que remontar el árbol.
 */
async function renderWithSession() {
  supabase.auth.getSession.mockResolvedValue({ data: { session: MOCK_SESSION } });
  supabase.auth.getUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
  let capturedOnChange;
  supabase.auth.onAuthStateChange.mockImplementation((cb) => {
    capturedOnChange = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  const utils = render(
    <AuthProvider>
      <Harness />
    </AuthProvider>,
  );
  await waitFor(() => expect(supabase.auth.getSession).toHaveBeenCalled());
  return { ...utils, getOnChange: () => capturedOnChange };
}

describe('AuthContext — businessStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. negocio existente → loaded, con el negocio disponible', async () => {
    getMyBusiness.mockResolvedValue({
      data: { id: 'b1', name: 'Mi Negocio', planSlug: 'starter', planExpiresAt: null, trialExpiresAt: null },
      error: null,
    });
    await renderWithSession();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('loaded'));
    expect(screen.getByTestId('business-name').textContent).toBe('Mi Negocio');
    expect(screen.getByTestId('error-message').textContent).toBe('none');
  });

  it('2. consulta exitosa sin negocio → not_found', async () => {
    getMyBusiness.mockResolvedValue({ data: null, error: null });
    await renderWithSession();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('not_found'));
    expect(screen.getByTestId('business-name').textContent).toBe('none');
    expect(screen.getByTestId('error-message').textContent).toBe('none');
  });

  it('3. error de red/backend → error, nunca not_found', async () => {
    getMyBusiness.mockResolvedValue({ data: null, error: { message: 'network error' } });
    await renderWithSession();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
    expect(screen.getByTestId('status').textContent).not.toBe('not_found');
    expect(screen.getByTestId('error-message').textContent).toBe('network error');
  });

  it('4. error después de haber cargado un negocio → conserva el último business válido', async () => {
    getMyBusiness.mockResolvedValueOnce({
      data: { id: 'b1', name: 'Mi Negocio', planSlug: 'starter', planExpiresAt: null, trialExpiresAt: null },
      error: null,
    });
    const { getOnChange } = await renderWithSession();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('loaded'));

    getMyBusiness.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
    await act(async () => {
      await getOnChange()('TOKEN_REFRESHED', MOCK_SESSION);
    });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
    // El negocio previamente cargado NO se pierde por el error del refresh.
    expect(screen.getByTestId('business-name').textContent).toBe('Mi Negocio');
  });

  it('5. Reintentar vuelve a consultar y puede pasar de error a loaded', async () => {
    getMyBusiness.mockResolvedValueOnce({ data: null, error: { message: 'network error' } });
    await renderWithSession();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));

    getMyBusiness.mockResolvedValueOnce({
      data: { id: 'b1', name: 'Recuperado', planSlug: 'starter', planExpiresAt: null, trialExpiresAt: null },
      error: null,
    });
    fireEvent.click(screen.getByText('retry'));

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('loaded'));
    expect(screen.getByTestId('business-name').textContent).toBe('Recuperado');
  });

  it('6. flujo normal no queda bloqueado: pasa de loading a loaded sin intervención', async () => {
    let resolveBusiness;
    getMyBusiness.mockImplementation(
      () => new Promise((resolve) => { resolveBusiness = resolve; }),
    );
    await renderWithSession();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('loading'));

    resolveBusiness({
      data: { id: 'b1', name: 'Negocio Normal', planSlug: 'starter', planExpiresAt: null, trialExpiresAt: null },
      error: null,
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('loaded'));
  });

  it('7. (defensivo) trial vencido: la reconciliación sigue resolviendo a loaded', async () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    getMyBusiness
      .mockResolvedValueOnce({
        data: { id: 'b1', name: 'Con Trial Vencido', planSlug: 'pro', planExpiresAt: null, trialExpiresAt: expired },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: 'b1', name: 'Con Trial Vencido', planSlug: 'starter', planExpiresAt: null, trialExpiresAt: null },
        error: null,
      });
    await renderWithSession();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('loaded'));
    expect(screen.getByTestId('business-name').textContent).toBe('Con Trial Vencido');
  });
});
