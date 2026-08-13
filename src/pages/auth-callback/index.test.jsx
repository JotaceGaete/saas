import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const getSessionMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: (...args) => getSessionMock(...args) } },
}));

const getMyBusinessMock = vi.fn();
vi.mock('../../services/waBusinessService', () => ({
  getMyBusiness: (...args) => getMyBusinessMock(...args),
}));

vi.mock('../../config/appUrl', () => ({
  APP_ORIGIN: 'https://go.ventalink.app',
  isCanonicalAppHostname: () => true,
}));

const attemptPendingAttributionMock = vi.fn(async () => ({ attempted: false }));
const isNewAccountFromTimestampsMock = vi.fn(() => true);
vi.mock('../../utils/referralAttribution', () => ({
  attemptPendingAttribution: (...args) => attemptPendingAttributionMock(...args),
  isNewAccountFromTimestamps: (...args) => isNewAccountFromTimestampsMock(...args),
}));

import AuthCallback from './index';

function renderCallback() {
  return render(
    <MemoryRouter>
      <AuthCallback />
    </MemoryRouter>
  );
}

describe('AuthCallback — atribución de referral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    attemptPendingAttributionMock.mockResolvedValue({ attempted: false });
    isNewAccountFromTimestampsMock.mockReturnValue(true);
    getMyBusinessMock.mockResolvedValue({ data: null, error: null });
  });

  it('sin sesión: nunca intenta atribución', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    renderCallback();

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    expect(attemptPendingAttributionMock).not.toHaveBeenCalled();
  });

  it('sesión de Google, identidad recién creada (delta <= 2s): elegible', async () => {
    const user = {
      id: 'user-google-new',
      app_metadata: { provider: 'google' },
      created_at: '2026-08-12T10:00:00.000Z',
      last_sign_in_at: '2026-08-12T10:00:00.500Z',
    };
    getSessionMock.mockResolvedValue({ data: { session: { user } }, error: null });
    isNewAccountFromTimestampsMock.mockReturnValue(true);

    renderCallback();

    await waitFor(() =>
      expect(attemptPendingAttributionMock).toHaveBeenCalledWith({ userId: 'user-google-new', isEligible: true, source: 'google_oauth' })
    );
    expect(isNewAccountFromTimestampsMock).toHaveBeenCalledWith(user);
  });

  it('sesión de Google, cuenta existente (delta > 2s): NO elegible', async () => {
    const user = {
      id: 'user-google-existing',
      app_metadata: { provider: 'google' },
      created_at: '2026-01-01T00:00:00.000Z',
      last_sign_in_at: '2026-08-12T10:00:00.000Z',
    };
    getSessionMock.mockResolvedValue({ data: { session: { user } }, error: null });
    isNewAccountFromTimestampsMock.mockReturnValue(false);

    renderCallback();

    await waitFor(() =>
      expect(attemptPendingAttributionMock).toHaveBeenCalledWith({ userId: 'user-google-existing', isEligible: false, source: 'google_oauth' })
    );
  });

  it('sesión por confirmación de email (provider=email): siempre elegible, sin usar timestamps', async () => {
    const user = {
      id: 'user-email-confirmed',
      app_metadata: { provider: 'email' },
      created_at: '2026-08-01T00:00:00.000Z',
      last_sign_in_at: '2026-08-12T10:00:00.000Z',
    };
    getSessionMock.mockResolvedValue({ data: { session: { user } }, error: null });

    renderCallback();

    await waitFor(() =>
      expect(attemptPendingAttributionMock).toHaveBeenCalledWith({ userId: 'user-email-confirmed', isEligible: true, source: 'email_confirmation_callback' })
    );
    expect(isNewAccountFromTimestampsMock).not.toHaveBeenCalled();
  });

  it('el intento de atribución no bloquea ni retrasa la redirección normal (con o sin negocio)', async () => {
    const user = { id: 'user-1', app_metadata: { provider: 'email' } };
    getSessionMock.mockResolvedValue({ data: { session: { user } }, error: null });
    getMyBusinessMock.mockResolvedValue({ data: { id: 'biz-1' }, error: null });
    // La atribución "cuelga" (nunca resuelve) -- la redirección debe ocurrir igual.
    attemptPendingAttributionMock.mockReturnValue(new Promise(() => {}));

    renderCallback();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });
});
