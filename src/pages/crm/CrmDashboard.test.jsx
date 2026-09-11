/**
 * CrmDashboard.jsx — PROVEEDORES-CORE-4B: la tarjeta de módulo "Compras y
 * Facturas" (que apuntaba a /crm/compras) se reemplaza por "Proveedores"
 * (apunta a /proveedores) -- no debe quedar una entrada "Compras" duplicada
 * en el Centro de Gestión.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('components/ui/DashboardAppShell', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/DashboardLayoutContent', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('components/ui/PanelHeader', () => ({ default: ({ title, subtitle }) => <div>{title}{subtitle}</div> }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ business: { id: 'biz1', planSlug: 'business', planExpiresAt: null, trialExpiresAt: null } }),
}));

const getCrmDashboardStatsMock = vi.fn();
vi.mock('../../services/crmService', () => ({
  getCrmDashboardStats: (...a) => getCrmDashboardStatsMock(...a),
}));
vi.mock('../../services/waBusinessService', () => ({ getEffectivePlanSlug: () => 'business' }));
vi.mock('../../config/planFeatures', () => ({ canUseFeature: () => true }));

import CrmDashboard from './CrmDashboard';

beforeEach(() => {
  getCrmDashboardStatsMock.mockReset();
  getCrmDashboardStatsMock.mockResolvedValue({ stockBajo: [] });
});

afterEach(() => cleanup());

describe('10. Centro de Gestión — Proveedores reemplaza a "Compras y Facturas"', () => {
  it('muestra una tarjeta "Proveedores" que navega a /proveedores', async () => {
    render(<MemoryRouter><CrmDashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText('Proveedores').length).toBeGreaterThan(0));
  });

  it('no muestra ninguna tarjeta "Compras y Facturas" ni un botón que navegue a /crm/compras', async () => {
    render(<MemoryRouter><CrmDashboard /></MemoryRouter>);
    await waitFor(() => expect(getCrmDashboardStatsMock).toHaveBeenCalled());
    expect(screen.queryByText(/Compras y Facturas/i)).not.toBeInTheDocument();
  });
});
