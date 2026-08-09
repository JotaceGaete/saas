import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('components/ui/DashboardAppShell', () => ({
  default: ({ children }) => <div data-testid="shell">{children}</div>,
}));
vi.mock('components/ui/DashboardLayoutContent', () => ({
  default: ({ children }) => <div data-testid="layout-content">{children}</div>,
}));
vi.mock('components/ui/PanelHeader', () => ({
  default: ({ title, subtitle }) => <div data-testid="panel-header">{title}{subtitle}</div>,
}));

vi.mock('../../services/referralService', () => ({
  getMyReferralStats: vi.fn(),
  listMyReferrals: vi.fn(),
}));

import { getMyReferralStats, listMyReferrals } from '../../services/referralService';
import AffiliatesPage from './index';

const FULL_STATS = {
  code: 'ana-1a2b3',
  rewardAmount: 5,
  rewardCurrency: 'USD',
  requiredPaidMonths: 2,
  invitedCount: 3,
  oneMonthCount: 1,
  qualifiedCount: 1,
  pendingAmount: 5,
  availableAmount: 0,
  totalEarnedAmount: 5,
};

const SOME_REFERRALS = [
  { publicLabel: 'Usuario #A3F2', createdAt: '2026-08-01T00:00:00Z', paidMonths: 0, qualified: false },
  { publicLabel: 'Usuario #B7C1', createdAt: '2026-08-02T00:00:00Z', paidMonths: 1, qualified: false },
  { publicLabel: 'Usuario #D9E4', createdAt: '2026-08-03T00:00:00Z', paidMonths: 2, qualified: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});

describe('AffiliatesPage — con stats y referidos', () => {
  it('muestra el enlace, el mensaje de confianza dinámico y las métricas', async () => {
    getMyReferralStats.mockResolvedValue(FULL_STATS);
    listMyReferrals.mockResolvedValue(SOME_REFERRALS);

    render(<AffiliatesPage />);

    await waitFor(() => expect(screen.getByText('https://ventalink.app/?ref=ana-1a2b3')).toBeInTheDocument());

    // Mensaje de confianza usa los valores reales de la RPC, no hardcodeados.
    expect(screen.getAllByText('Ganas USD 5.00 cuando un referido completa 2 meses pagos.').length).toBeGreaterThan(0);

    // Métricas.
    expect(screen.getByText('Referidos totales')).toBeInTheDocument();
    expect(screen.getByText('Calificados')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(screen.getByText('Total ganado')).toBeInTheDocument();

    // Lista de referidos con progreso.
    expect(screen.getByText('Usuario #A3F2')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  it('copia el enlace al portapapeles', async () => {
    getMyReferralStats.mockResolvedValue(FULL_STATS);
    listMyReferrals.mockResolvedValue(SOME_REFERRALS);

    render(<AffiliatesPage />);

    await waitFor(() => expect(screen.getByText('https://ventalink.app/?ref=ana-1a2b3')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /copiar enlace/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://ventalink.app/?ref=ana-1a2b3');
    await waitFor(() => expect(screen.getByRole('button', { name: /copiado/i })).toBeInTheDocument());
  });
});

describe('AffiliatesPage — sin referidos', () => {
  it('muestra el mensaje de "todavía no tienes referidos"', async () => {
    getMyReferralStats.mockResolvedValue({
      code: 'ana-1a2b3',
      rewardAmount: 5,
      rewardCurrency: 'USD',
      requiredPaidMonths: 2,
      invitedCount: 0,
      oneMonthCount: 0,
      qualifiedCount: 0,
      pendingAmount: 0,
      availableAmount: 0,
      totalEarnedAmount: 0,
    });
    listMyReferrals.mockResolvedValue([]);

    render(<AffiliatesPage />);

    await waitFor(() => expect(screen.getByText(/todavía no tienes referidos/i)).toBeInTheDocument());
  });
});

describe('AffiliatesPage — error de RPC', () => {
  it('un fallo en getMyReferralStats muestra un estado de error con reintentar, sin romper la pantalla', async () => {
    getMyReferralStats.mockRejectedValue(new Error('permission denied'));
    listMyReferrals.mockResolvedValue([]);

    render(<AffiliatesPage />);

    await waitFor(() => expect(screen.getByText(/no pudimos cargar tu enlace/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it('un fallo en listMyReferrals muestra un estado de error con reintentar, sin romper el resto de la página', async () => {
    getMyReferralStats.mockResolvedValue({
      code: 'ana-1a2b3',
      rewardAmount: 5,
      rewardCurrency: 'USD',
      requiredPaidMonths: 2,
      invitedCount: 0,
      oneMonthCount: 0,
      qualifiedCount: 0,
      pendingAmount: 0,
      availableAmount: 0,
      totalEarnedAmount: 0,
    });
    listMyReferrals.mockRejectedValue(new Error('permission denied'));

    render(<AffiliatesPage />);

    await waitFor(() => expect(screen.getByText('https://ventalink.app/?ref=ana-1a2b3')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/no pudimos cargar tus referidos/i)).toBeInTheDocument());
  });

  it('el botón Reintentar vuelve a llamar la RPC', async () => {
    getMyReferralStats.mockRejectedValueOnce(new Error('network error'));
    listMyReferrals.mockResolvedValue([]);

    render(<AffiliatesPage />);

    await waitFor(() => expect(screen.getByText(/no pudimos cargar tu enlace/i)).toBeInTheDocument());

    getMyReferralStats.mockResolvedValueOnce(FULL_STATS);
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    await waitFor(() => expect(screen.getByText('https://ventalink.app/?ref=ana-1a2b3')).toBeInTheDocument());
    expect(getMyReferralStats).toHaveBeenCalledTimes(2);
  });
});

describe('AffiliatesPage — sin negocio', () => {
  it('renderiza completo sin depender de business (no usa useAuth ni lee business en ningún punto)', async () => {
    getMyReferralStats.mockResolvedValue(FULL_STATS);
    listMyReferrals.mockResolvedValue(SOME_REFERRALS);

    // No hay mock de contexts/AuthContext acá a propósito: si AffiliatesPage
    // dependiera de useAuth()/business, este test fallaría al no encontrar
    // ningún AuthProvider envolviendo el árbol.
    render(<AffiliatesPage />);

    await waitFor(() => expect(screen.getByText('https://ventalink.app/?ref=ana-1a2b3')).toBeInTheDocument());
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });
});
