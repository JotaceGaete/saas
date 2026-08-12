import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../contexts/CountryContext', () => ({
  useCountry: () => ({ countryCode: 'CL' }),
}));
vi.mock('../../lib/country/state-model', () => ({
  resolveCountryState: () => ({ uxCountry: 'CL', businessCountry: 'CL', billingCountry: 'CL' }),
  resolveBillingSetup: () => ({ billingProvider: 'mercado_pago', currency: 'CLP' }),
  logCountryStateDebug: () => {},
}));
vi.mock('../../utils/analytics', () => ({ collectVisitAttribution: () => ({}) }));
vi.mock('../../services/waBusinessService', () => ({ recordSiteVisit: vi.fn(async () => ({})) }));
vi.mock('../../services/loopsClient', () => ({ trackLoopsEvent: vi.fn(async () => ({})) }));
vi.mock('./components/AuthStep', () => ({
  default: ({ onRegister, onLogin }) => (
    <div>
      auth-step
      <button onClick={() => onRegister({ email: 'nuevo@test.com', password: 'x', businessName: 'Mi negocio' })}>
        do-register
      </button>
      <button onClick={() => onLogin({ email: 'existente@test.com', password: 'x' })}>do-login</button>
    </div>
  ),
}));
vi.mock('./components/ConfirmEmailStep', () => ({ default: () => <div>confirm-email-step</div> }));
vi.mock('./components/StoreCreationStep', () => ({
  default: ({ businessLoading }) => (
    <div data-testid="store-creation-step">store-creation-step:{String(businessLoading)}</div>
  ),
}));
vi.mock('../../utils/referralAttribution', () => ({
  captureReferralFromUrl: vi.fn(),
  attemptPendingAttribution: vi.fn(async () => ({ attempted: false })),
}));

import { useAuth } from '../../contexts/AuthContext';
import { captureReferralFromUrl, attemptPendingAttribution } from '../../utils/referralAttribution';
import BusinessRegistration from './index';

const MOCK_USER = { id: 'user-1', email: 'test@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };

function setAuth(overrides) {
  useAuth.mockReturnValue({
    user: MOCK_USER,
    business: null,
    loading: false,
    businessLoading: false,
    businessStatus: 'not_found',
    businessLoadError: null,
    refreshBusiness: vi.fn(async () => {}),
    signUp: vi.fn(),
    signIn: vi.fn(),
    signInWithGoogle: vi.fn(),
    resendConfirmationEmail: vi.fn(),
    isEmailConfirmed: true,
    ...overrides,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BusinessRegistration />
    </MemoryRouter>,
  );
}

describe('BusinessRegistration — visibilidad de StoreCreationStep según businessStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('businessStatus=not_found → muestra StoreCreationStep', () => {
    setAuth({ businessStatus: 'not_found', business: null });
    renderPage();
    expect(screen.getByTestId('store-creation-step')).toBeInTheDocument();
  });

  it('businessStatus=error → NO muestra StoreCreationStep, muestra pantalla de error con Reintentar', () => {
    setAuth({ businessStatus: 'error', business: null, businessLoadError: { message: 'network error' } });
    renderPage();
    expect(screen.queryByTestId('store-creation-step')).not.toBeInTheDocument();
    expect(screen.getByText(/no pudimos cargar tu cuenta/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it('botón Reintentar en la pantalla de error llama a refreshBusiness()', async () => {
    const refreshBusiness = vi.fn(async () => {});
    setAuth({ businessStatus: 'error', business: null, businessLoadError: { message: 'x' }, refreshBusiness });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await waitFor(() => expect(refreshBusiness).toHaveBeenCalledTimes(1));
  });

  it('businessStatus=loading → no muestra el formulario de creación, solo el spinner interno de StoreCreationStep', () => {
    setAuth({ businessStatus: 'loading', businessLoading: true, business: null });
    renderPage();
    expect(screen.queryByText(/no pudimos cargar tu cuenta/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('store-creation-step').textContent).toContain('true');
  });

  it('businessStatus=loaded con negocio → no se queda en StoreCreationStep ni en la pantalla de error', () => {
    setAuth({ businessStatus: 'loaded', business: { id: 'b1', name: 'Mi Negocio' } });
    renderPage();
    expect(screen.queryByText(/no pudimos cargar tu cuenta/i)).not.toBeInTheDocument();
  });

  it('sin usuario autenticado → AuthStep, nunca StoreCreationStep ni pantalla de error', () => {
    setAuth({ user: null, businessStatus: 'idle' });
    renderPage();
    expect(screen.getByText('auth-step')).toBeInTheDocument();
    expect(screen.queryByTestId('store-creation-step')).not.toBeInTheDocument();
    expect(screen.queryByText(/no pudimos cargar tu cuenta/i)).not.toBeInTheDocument();
  });
});

describe('BusinessRegistration — captura y atribución de referral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captura ?ref= al montar, haya o no usuario autenticado', () => {
    setAuth({ user: null, businessStatus: 'idle' });
    renderPage();
    expect(captureReferralFromUrl).toHaveBeenCalledTimes(1);
  });

  it('signUp con sesión inmediata: intenta atribución como elegible (usuario nuevo)', async () => {
    const signUp = vi.fn(async () => ({
      data: { user: { id: 'user-new' }, session: { access_token: 'x' } },
      error: null,
    }));
    setAuth({ user: null, businessStatus: 'idle', signUp });
    renderPage();

    fireEvent.click(screen.getByText('do-register'));

    await waitFor(() =>
      expect(attemptPendingAttribution).toHaveBeenCalledWith({ userId: 'user-new', isEligible: true })
    );
  });

  it('signUp que requiere confirmación de email (sin sesión): NO intenta atribución todavía', async () => {
    const signUp = vi.fn(async () => ({
      data: { user: { id: 'user-pending', email: 'nuevo@test.com' }, session: null },
      error: null,
    }));
    setAuth({ user: null, businessStatus: 'idle', signUp });
    renderPage();

    fireEvent.click(screen.getByText('do-register'));

    await waitFor(() => expect(screen.getByText('confirm-email-step')).toBeInTheDocument());
    expect(attemptPendingAttribution).not.toHaveBeenCalled();
  });

  it('signIn (login) exitoso: intenta atribución como NO elegible (usuario existente) — limpia, nunca llama la RPC', async () => {
    const signIn = vi.fn(async () => ({ data: { user: { id: 'user-existing' } }, error: null }));
    setAuth({ user: null, businessStatus: 'idle', signIn });
    renderPage();

    fireEvent.click(screen.getByText('do-login'));

    await waitFor(() =>
      expect(attemptPendingAttribution).toHaveBeenCalledWith({ userId: 'user-existing', isEligible: false })
    );
  });

  it('signIn con error de credenciales: no intenta atribución en absoluto', async () => {
    const signIn = vi.fn(async () => ({ data: null, error: { message: 'Invalid login credentials' } }));
    setAuth({ user: null, businessStatus: 'idle', signIn });
    renderPage();

    fireEvent.click(screen.getByText('do-login'));

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(attemptPendingAttribution).not.toHaveBeenCalled();
  });

  it('signUp fallido (error de Supabase): no intenta atribución', async () => {
    const signUp = vi.fn(async () => ({ data: null, error: { message: 'User already registered' } }));
    setAuth({ user: null, businessStatus: 'idle', signUp });
    renderPage();

    fireEvent.click(screen.getByText('do-register'));

    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
    expect(attemptPendingAttribution).not.toHaveBeenCalled();
  });
});
