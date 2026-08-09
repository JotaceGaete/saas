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
vi.mock('../../lib/referralCapture', () => ({ captureReferralCode: vi.fn() }));
vi.mock('../../services/waBusinessService', () => ({ recordSiteVisit: vi.fn(async () => ({})) }));
vi.mock('../../services/loopsClient', () => ({ trackLoopsEvent: vi.fn(async () => ({})) }));
vi.mock('./components/AuthStep', () => ({ default: () => <div>auth-step</div> }));
vi.mock('./components/ConfirmEmailStep', () => ({ default: () => <div>confirm-email-step</div> }));
vi.mock('./components/StoreCreationStep', () => ({
  default: ({ businessLoading }) => (
    <div data-testid="store-creation-step">store-creation-step:{String(businessLoading)}</div>
  ),
}));

import { useAuth } from '../../contexts/AuthContext';
import { captureReferralCode } from '../../lib/referralCapture';
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

describe('BusinessRegistration — captura de ?ref= (handoff walinka.com → business-registration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('llama a captureReferralCode() al montar, sin usuario autenticado (paso AuthStep)', () => {
    setAuth({ user: null, businessStatus: 'idle' });
    renderPage();
    expect(captureReferralCode).toHaveBeenCalledTimes(1);
  });

  it('llama a captureReferralCode() al montar, con usuario autenticado (paso StoreCreationStep) — cubre el regreso desde /auth/callback tras Google OAuth', () => {
    setAuth({ businessStatus: 'not_found', business: null });
    renderPage();
    expect(captureReferralCode).toHaveBeenCalledTimes(1);
  });
});
