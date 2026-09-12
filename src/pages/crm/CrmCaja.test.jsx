/**
 * CrmCaja.jsx — TPV-BUG: bloqueo de apertura/cierre de caja mientras un
 * admin está "viendo como negocio" (impersonación).
 *
 * `impersonateBusiness` (AuthContext) solo cambia qué `business` ve la
 * UI -- nunca la sesión real de Supabase. El admin sigue autenticado
 * como sí mismo, así que un INSERT/UPDATE en crm_cash_sessions para el
 * negocio impersonado sería rechazado por RLS (correctamente: el admin
 * de verdad no es dueño de ese negocio). Estos tests verifican que la
 * UI ya ni siquiera intenta la escritura en ese caso -- explica el
 * motivo en vez de dejar pasar un error crudo de Postgres a la pantalla.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();
const getOpenCashSessionMock = vi.fn();
const getRecentCashSessionsMock = vi.fn();
const getPaymentsForSessionMock = vi.fn();
const openCashSessionMock = vi.fn();
const closeCashSessionMock = vi.fn();

let authValue = {
  business: { id: 'biz1', currency: 'CLP' },
  user: { id: 'user1' },
  isImpersonating: false,
};

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authValue }));
vi.mock('../../services/crmService', () => ({
  getOpenCashSession: (...args) => getOpenCashSessionMock(...args),
  getRecentCashSessions: (...args) => getRecentCashSessionsMock(...args),
  getPaymentsForSession: (...args) => getPaymentsForSessionMock(...args),
  openCashSession: (...args) => openCashSessionMock(...args),
  closeCashSession: (...args) => closeCashSessionMock(...args),
}));

import CrmCaja from './CrmCaja';

beforeEach(() => {
  navigateMock.mockReset();
  authValue = { business: { id: 'biz1', currency: 'CLP' }, user: { id: 'user1' }, isImpersonating: false };
  getOpenCashSessionMock.mockReset().mockResolvedValue(null);
  getRecentCashSessionsMock.mockReset().mockResolvedValue([]);
  getPaymentsForSessionMock.mockReset().mockResolvedValue([]);
  openCashSessionMock.mockReset().mockResolvedValue({ error: null });
  closeCashSessionMock.mockReset().mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe('CrmCaja — flujo normal (dueño real, sin impersonar)', () => {
  it('"Abrir caja" llama a openCashSession con el negocio activo', async () => {
    render(<CrmCaja />);
    const openButton = await screen.findByRole('button', { name: /Abrir caja/i });
    fireEvent.click(openButton);

    await waitFor(() => expect(openCashSessionMock).toHaveBeenCalledTimes(1));
    expect(openCashSessionMock).toHaveBeenCalledWith('biz1', expect.objectContaining({ openedBy: 'user1' }));
  });
});

describe('CrmCaja — TPV-BUG: bloqueada mientras se impersona un negocio', () => {
  it('"Abrir caja" NUNCA llama a openCashSession -- muestra un mensaje explicativo en su lugar', async () => {
    authValue = { ...authValue, isImpersonating: true };
    render(<CrmCaja />);

    const openButton = await screen.findByRole('button', { name: /Abrir caja/i });
    fireEvent.click(openButton);

    expect(openCashSessionMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/ver como negocio/i)).toBeInTheDocument();
  });

  it('"Confirmar cierre" (dentro del modal de cierre) tampoco llama a closeCashSession mientras se impersona', async () => {
    authValue = { ...authValue, isImpersonating: true };
    getOpenCashSessionMock.mockResolvedValue({ id: 'sess1', opened_at: new Date().toISOString(), status: 'open' });
    render(<CrmCaja />);

    fireEvent.click(await screen.findByRole('button', { name: /Cerrar caja/i }));
    const confirmButton = await screen.findByRole('button', { name: /Confirmar cierre/i });
    fireEvent.click(confirmButton);

    expect(closeCashSessionMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/ver como negocio/i)).toBeInTheDocument();
  });

  it('no pasa un business_id/user_id sin verificar -- el guard corta antes de construir el payload', async () => {
    authValue = { ...authValue, isImpersonating: true, business: { id: 'negocio-impersonado', currency: 'CLP' } };
    render(<CrmCaja />);
    fireEvent.click(await screen.findByRole('button', { name: /Abrir caja/i }));
    expect(openCashSessionMock).not.toHaveBeenCalled();
  });
});
