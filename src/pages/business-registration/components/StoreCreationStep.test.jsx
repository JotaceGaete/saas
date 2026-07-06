import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StoreCreationStep from './StoreCreationStep';
import { createBusiness, linkKoronelBusiness } from '../../../services/waBusinessService';
import { CountryProvider } from '../../../contexts/CountryContext';

const mockNavigate = vi.fn();
const mockRefreshBusiness = vi.fn().mockResolvedValue({});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ refreshBusiness: mockRefreshBusiness }),
}));

vi.mock('../../../services/waBusinessService', () => ({
  createBusiness: vi.fn(),
  linkKoronelBusiness: vi.fn(),
}));

const user = { email: 'lucia@example.com', user_metadata: { name: 'Lucia' } };

function renderStep(props) {
  return render(
    <MemoryRouter>
      <CountryProvider>
        <StoreCreationStep user={user} businessLoading={false} {...props} />
      </CountryProvider>
    </MemoryRouter>
  );
}

function fillAndSubmit() {
  const whatsappInput = screen.getByPlaceholderText('Ej: +56912345678');
  if (!whatsappInput.value) {
    fireEvent.change(whatsappInput, { target: { value: '+56911112222' } });
  }
  fireEvent.click(screen.getByRole('button', { name: /crear mi tienda/i }));
}

describe('StoreCreationStep — Fase 2 Koronel handoff', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockRefreshBusiness.mockClear();
    createBusiness.mockReset();
    linkKoronelBusiness.mockReset();
  });

  it('prefills business name and whatsapp from the koronel handoff', () => {
    renderStep({
      koronelHandoff: { koronelBusinessId: 'biz-1', name: 'Panadería Lucia', whatsapp: '+56911112222' },
    });

    expect(screen.getByDisplayValue('Panadería Lucia')).toBeInTheDocument();
    // El input de WhatsApp (modo neutro) muestra solo dígitos; el '+' se antepone al guardar.
    expect(screen.getByDisplayValue('56911112222')).toBeInTheDocument();
  });

  it('creates the business without a koronel handoff and follows the normal onboarding redirect', async () => {
    createBusiness.mockResolvedValue({ data: { id: 'w-1' }, error: null });

    renderStep({ koronelHandoff: null });

    fillAndSubmit();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
    });
    expect(linkKoronelBusiness).not.toHaveBeenCalled();
  });

  it('links the new business to koronel and shows a friendly success message', async () => {
    createBusiness.mockResolvedValue({ data: { id: 'w-1' }, error: null });
    linkKoronelBusiness.mockResolvedValue({ data: { connection_status: 'connected' }, error: null });

    renderStep({ koronelHandoff: { koronelBusinessId: 'biz-1', name: 'Panadería Lucia' } });

    fillAndSubmit();

    await waitFor(() => {
      expect(linkKoronelBusiness).toHaveBeenCalledWith({ koronelBusinessId: 'biz-1', walinkaBusinessId: 'w-1' });
    });
    expect(await screen.findByText('Catálogo conectado con Koronel')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('does not break onboarding when the koronel link RPC fails', async () => {
    createBusiness.mockResolvedValue({ data: { id: 'w-1' }, error: null });
    linkKoronelBusiness.mockResolvedValue({ data: null, error: { message: 'RPC failed' } });

    renderStep({ koronelHandoff: { koronelBusinessId: 'biz-1' } });

    fillAndSubmit();

    expect(await screen.findByText('No se pudo conectar con Koronel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
  });

  it('does not break onboarding when the koronel link RPC throws', async () => {
    createBusiness.mockResolvedValue({ data: { id: 'w-1' }, error: null });
    linkKoronelBusiness.mockRejectedValue(new Error('network down'));

    renderStep({ koronelHandoff: { koronelBusinessId: 'biz-1' } });

    fillAndSubmit();

    expect(await screen.findByText('No se pudo conectar con Koronel')).toBeInTheDocument();
  });
});
