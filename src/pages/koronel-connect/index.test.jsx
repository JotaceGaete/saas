import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KoronelConnect from './index';
import { linkKoronelBusiness } from '../../services/waBusinessService';
import { captureKoronelHandoff, clearKoronelHandoff, getKoronelHandoff } from '../../utils/koronelHandoff';

const mockNavigate = vi.fn();
let mockAuthState;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../../services/waBusinessService', () => ({
  linkKoronelBusiness: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <KoronelConnect />
    </MemoryRouter>
  );
}

describe('KoronelConnect — conectar negocio existente', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    linkKoronelBusiness.mockReset();
    clearKoronelHandoff();
    mockAuthState = { business: { id: 'w-1', name: 'Mi Tienda' }, businessLoading: false };
  });

  it('offers to connect the existing wa_businesses to the koronel business from the handoff', () => {
    captureKoronelHandoff('?source=koronel&koronel_business_id=biz-1&name=Panaderia');
    renderPage();

    expect(screen.getByText(/Conectar tu catálogo con Koronel/i)).toBeInTheDocument();
    expect(screen.getByText(/Mi Tienda/)).toBeInTheDocument();
  });

  it('calls request_business_walinka_link with both ids and shows a friendly success message', async () => {
    captureKoronelHandoff('?source=koronel&koronel_business_id=biz-1');
    linkKoronelBusiness.mockResolvedValue({ data: { connection_status: 'connected' }, error: null });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /conectar catálogo/i }));

    await waitFor(() => {
      expect(linkKoronelBusiness).toHaveBeenCalledWith({ koronelBusinessId: 'biz-1', walinkaBusinessId: 'w-1' });
    });
    expect(await screen.findByText('Catálogo conectado con Koronel')).toBeInTheDocument();
    expect(getKoronelHandoff()).toBeNull();
  });

  it('shows a friendly error and still offers to continue when the RPC fails', async () => {
    captureKoronelHandoff('?source=koronel&koronel_business_id=biz-1');
    linkKoronelBusiness.mockResolvedValue({ data: null, error: { message: 'RPC failed' } });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /conectar catálogo/i }));

    expect(await screen.findByText('No se pudo conectar con Koronel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ir al dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('lets the user skip the connection and go straight to the dashboard', () => {
    captureKoronelHandoff('?source=koronel&koronel_business_id=biz-1');
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /ahora no/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    expect(getKoronelHandoff()).toBeNull();
  });

  it('redirects to business-registration when there is no business yet', async () => {
    mockAuthState = { business: null, businessLoading: false };
    captureKoronelHandoff('?source=koronel&koronel_business_id=biz-1');
    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/business-registration', { replace: true });
    });
  });
});
