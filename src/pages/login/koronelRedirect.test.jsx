import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './index';
import { useAuth } from '../../contexts/AuthContext';
import { captureKoronelHandoff, clearKoronelHandoff } from '../../utils/koronelHandoff';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../services/waBusinessService', () => ({
  recordSiteVisit: vi.fn().mockResolvedValue({}),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

function baseAuth(overrides = {}) {
  return {
    signIn: vi.fn(),
    signInWithGoogle: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    isAuthenticated: true,
    isEmailConfirmed: true,
    loading: false,
    business: null,
    businessLoading: false,
    ...overrides,
  };
}

describe('Login — Fase 2 Koronel handoff redirect', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    clearKoronelHandoff();
  });

  afterEach(() => {
    clearKoronelHandoff();
  });

  it('preserves koronel params across login and routes to business-registration when the user has no wa_businesses yet', async () => {
    captureKoronelHandoff('?source=koronel&koronel_business_id=biz-123&name=Panaderia');
    useAuth.mockReturnValue(baseAuth({ business: null }));

    renderLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/business-registration', { replace: true });
    });
  });

  it('preserves koronel params across login and routes to koronel-connect when the user already has a wa_businesses', async () => {
    captureKoronelHandoff('?source=koronel&koronel_business_id=biz-123');
    useAuth.mockReturnValue(baseAuth({ business: { id: 'w-1', name: 'Mi Tienda' } }));

    renderLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/koronel-connect', { replace: true });
    });
  });

  it('falls back to the normal dashboard redirect when there is no koronel handoff', async () => {
    useAuth.mockReturnValue(baseAuth({ business: { id: 'w-1' } }));

    renderLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });
});
