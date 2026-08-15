import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('components/ui/BusinessSidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}));

const listReferralPayoutsMock = vi.fn();
const getReferralPayoutDetailMock = vi.fn();
const markReferralPayoutPaidMock = vi.fn();
const rejectReferralPayoutMock = vi.fn();
vi.mock('services/adminAffiliatePayoutsService', () => ({
  listReferralPayouts: (...args) => listReferralPayoutsMock(...args),
  getReferralPayoutDetail: (...args) => getReferralPayoutDetailMock(...args),
  markReferralPayoutPaid: (...args) => markReferralPayoutPaidMock(...args),
  rejectReferralPayout: (...args) => rejectReferralPayoutMock(...args),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import AdminAffiliatePayoutsPage from './AdminAffiliatePayoutsPage';
import RequireAdmin from '../../components/RequireAdmin';
import { useAuth } from '../../contexts/AuthContext';

const REFERRER_ID = '11111111-1111-1111-1111-111111111111';

const listRow = (overrides = {}) => ({
  payoutId: 'p-1',
  referrerUserId: REFERRER_ID,
  referrerEmail: 'juan@example.test',
  status: 'requested',
  requestedAmount: 10,
  currency: 'USD',
  requestedAt: '2026-06-01T00:00:00Z',
  paidAt: null,
  rejectedAt: null,
  externalReference: null,
  rejectedReason: null,
  payoutMethod: 'bank_transfer',
  country: 'CL',
  holderName: 'Juan Perez',
  bankName: 'Banco Estado',
  accountType: 'checking',
  maskedAccountNumber: '••••6789',
  ...overrides,
});

const detailPayload = (overrides = {}) => ({
  ok: true,
  payout: {
    payoutId: 'p-1',
    referrerUserId: REFERRER_ID,
    referrerEmail: 'juan@example.test',
    status: 'requested',
    requestedAmount: 10,
    currency: 'USD',
    requestedAt: '2026-06-01T00:00:00Z',
    paidAt: null,
    rejectedAt: null,
    externalReference: null,
    rejectedReason: null,
    adminUserId: null,
    payoutMethodSnapshot: {
      method: 'bank_transfer',
      country: 'CL',
      holder_name: 'Juan Perez',
      holder_tax_id: '11.111.111-1',
      bank_name: 'Banco Estado',
      account_type: 'checking',
      account_number: '1234567890',
      email: 'juan@example.test',
    },
    ...overrides,
  },
  commissions: [
    { commissionId: 'c-1', rewardAmountSnapshot: 10, releasedAt: null, releasedReason: null, active: true, commissionStatus: 'approved' },
  ],
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminAffiliatePayoutsPage />
    </MemoryRouter>,
  );
}

async function openDetail(payoutOverrides = {}) {
  getReferralPayoutDetailMock.mockResolvedValue(detailPayload(payoutOverrides));
  renderPage();
  await waitFor(() => expect(screen.getByText('juan@example.test')).toBeInTheDocument());
  fireEvent.click(screen.getByText('juan@example.test').closest('tr'));
  await waitFor(() => expect(getReferralPayoutDetailMock).toHaveBeenCalledWith('p-1'));
  await waitFor(() => expect(screen.getByText('Detalle del retiro')).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = window.matchMedia || vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  listReferralPayoutsMock.mockResolvedValue({ ok: true, totalCount: 1, payouts: [listRow()] });
  getReferralPayoutDetailMock.mockResolvedValue(detailPayload());
});

describe('AdminAffiliatePayoutsPage', () => {
  it('1. lista los retiros reales de wa_admin_list_referral_payouts', async () => {
    renderPage();
    await waitFor(() => expect(listReferralPayoutsMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('juan@example.test')).toBeInTheDocument();
    expect(screen.getByText('Solicitado', { selector: 'span' })).toBeInTheDocument();
  });

  it('2. el filtro de estado vuelve a pedir el listado con p_status y resetea la página', async () => {
    renderPage();
    await waitFor(() => expect(listReferralPayoutsMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'paid' } });

    await waitFor(() =>
      expect(listReferralPayoutsMock).toHaveBeenLastCalledWith({ status: 'paid', limit: 30, offset: 0 })
    );
  });

  it('3. paginación usa totalCount/limit/offset reales', async () => {
    listReferralPayoutsMock.mockResolvedValue({ ok: true, totalCount: 45, payouts: [listRow()] });
    renderPage();

    await waitFor(() => expect(screen.getByText('1-30 de 45')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    await waitFor(() =>
      expect(listReferralPayoutsMock).toHaveBeenLastCalledWith({ status: undefined, limit: 30, offset: 30 })
    );
  });

  it('4. al hacer click en una fila, abre el drawer de detalle con wa_admin_get_referral_payout_detail', async () => {
    await openDetail();
    expect(getReferralPayoutDetailMock).toHaveBeenCalledWith('p-1');
  });

  it('5. la tabla muestra el maskedAccountNumber entregado por la RPC', async () => {
    renderPage();
    expect(await screen.findByText('••••6789')).toBeInTheDocument();
  });

  it('6. la tabla NUNCA muestra el número de cuenta completo', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('juan@example.test')).toBeInTheDocument());
    expect(screen.queryByText('1234567890')).not.toBeInTheDocument();
  });

  it('7. la tabla NUNCA muestra holder_tax_id', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('juan@example.test')).toBeInTheDocument());
    expect(screen.queryByText('11.111.111-1')).not.toBeInTheDocument();
  });

  it('8. el detalle muestra los datos bancarios completos (única vía que los expone)', async () => {
    await openDetail();
    expect(screen.getByText('11.111.111-1')).toBeInTheDocument();
    expect(screen.getByText('1234567890')).toBeInTheDocument();
    expect(screen.getByText('Banco Estado')).toBeInTheDocument();
  });

  it('9. "Marcar como pagado" exige external_reference no vacío', async () => {
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: /marcar como pagado/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar pago/i }));

    await waitFor(() => expect(screen.getByText(/el comprobante.*es obligatorio/i)).toBeInTheDocument());
    expect(markReferralPayoutPaidMock).not.toHaveBeenCalled();
  });

  it('10. un pago exitoso cierra el modal, muestra confirmación y refresca listado + detalle', async () => {
    markReferralPayoutPaidMock.mockResolvedValue({ ok: true, payoutId: 'p-1', paidAmount: 10, commissionsPaid: 1 });
    await openDetail();

    fireEvent.click(screen.getByRole('button', { name: /marcar como pagado/i }));
    fireEvent.change(screen.getByPlaceholderText(/n° de transferencia/i), { target: { value: 'TXN-99' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar pago/i }));

    await waitFor(() => expect(markReferralPayoutPaidMock).toHaveBeenCalledWith('p-1', 'TXN-99'));
    expect(screen.queryByText('Marcar como pagado', { selector: 'h3' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/retiro marcado como pagado/i)).toBeInTheDocument());
    await waitFor(() => expect(listReferralPayoutsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getReferralPayoutDetailMock).toHaveBeenCalledTimes(2));
  });

  it('11. alreadyPaid se maneja idempotentemente como éxito', async () => {
    markReferralPayoutPaidMock.mockResolvedValue({ ok: true, alreadyPaid: true, payoutId: 'p-1' });
    await openDetail();

    fireEvent.click(screen.getByRole('button', { name: /marcar como pagado/i }));
    fireEvent.change(screen.getByPlaceholderText(/n° de transferencia/i), { target: { value: 'TXN-99' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar pago/i }));

    await waitFor(() => expect(screen.getByText(/ya estaba marcado como pagado/i)).toBeInTheDocument());
  });

  it('12. payout_amount_changed NUNCA se muestra como éxito', async () => {
    markReferralPayoutPaidMock.mockResolvedValue({
      ok: false,
      error: 'payout_amount_changed',
      requestedAmount: 10,
      payableAmount: 6,
      excludedCommissionIds: ['c-1'],
    });
    await openDetail();

    fireEvent.click(screen.getByRole('button', { name: /marcar como pagado/i }));
    fireEvent.change(screen.getByPlaceholderText(/n° de transferencia/i), { target: { value: 'TXN-99' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar pago/i }));

    await waitFor(() => expect(screen.getByText(/el monto elegible cambió/i)).toBeInTheDocument());
    expect(screen.queryByText(/retiro marcado como pagado/i)).not.toBeInTheDocument();
    expect(screen.getByText(/monto solicitado: usd 10\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/monto pagable ahora: usd 6\.00/i)).toBeInTheDocument();
  });

  it('13. payout_amount_changed mantiene el retiro en "requested" (refresca desde el servidor, sin mutación local)', async () => {
    markReferralPayoutPaidMock.mockResolvedValue({
      ok: false,
      error: 'payout_amount_changed',
      requestedAmount: 10,
      payableAmount: 6,
    });
    await openDetail();

    fireEvent.click(screen.getByRole('button', { name: /marcar como pagado/i }));
    fireEvent.change(screen.getByPlaceholderText(/n° de transferencia/i), { target: { value: 'TXN-99' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar pago/i }));

    await waitFor(() => expect(screen.getByText(/el monto elegible cambió/i)).toBeInTheDocument());
    await waitFor(() => expect(getReferralPayoutDetailMock).toHaveBeenCalledTimes(2));
    // El drawer, detrás del modal, sigue mostrando el retiro como Solicitado.
    expect(screen.getByRole('button', { name: /marcar como pagado/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rechazar/i })).toBeInTheDocument();
  });

  it('14. "Rechazar" exige un motivo no vacío', async () => {
    await openDetail();
    fireEvent.click(screen.getByRole('button', { name: /^rechazar$/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar rechazo/i }));

    await waitFor(() => expect(screen.getByText(/el motivo es obligatorio/i)).toBeInTheDocument());
    expect(rejectReferralPayoutMock).not.toHaveBeenCalled();
  });

  it('15. un rechazo exitoso cierra el modal, muestra confirmación y refresca listado + detalle', async () => {
    rejectReferralPayoutMock.mockResolvedValue({ ok: true, payoutId: 'p-1', releasedCommissionCount: 1 });
    await openDetail();

    fireEvent.click(screen.getByRole('button', { name: /^rechazar$/i }));
    fireEvent.change(screen.getByPlaceholderText(/motivo obligatorio/i), { target: { value: 'Datos inválidos' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar rechazo/i }));

    await waitFor(() => expect(rejectReferralPayoutMock).toHaveBeenCalledWith('p-1', 'Datos inválidos'));
    await waitFor(() => expect(screen.getByText(/retiro rechazado/i)).toBeInTheDocument());
    await waitFor(() => expect(listReferralPayoutsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getReferralPayoutDetailMock).toHaveBeenCalledTimes(2));
  });

  it('16. un retiro paid no muestra acciones', async () => {
    await openDetail({ status: 'paid', paidAt: '2026-06-02T00:00:00Z', externalReference: 'TXN-1' });

    expect(screen.queryByRole('button', { name: /marcar como pagado/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^rechazar$/i })).not.toBeInTheDocument();
  });

  it('17. un retiro rejected no muestra acciones', async () => {
    await openDetail({ status: 'rejected', rejectedAt: '2026-06-02T00:00:00Z', rejectedReason: 'Datos inválidos' });

    expect(screen.queryByRole('button', { name: /marcar como pagado/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^rechazar$/i })).not.toBeInTheDocument();
  });

  it('18. forbidden se muestra como error, sin listar nada', async () => {
    listReferralPayoutsMock.mockResolvedValue({ ok: false, error: 'forbidden' });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no tienes permisos de administrador/i)).toBeInTheDocument());
    expect(screen.queryByText('juan@example.test')).not.toBeInTheDocument();
  });

  it('19. error de red al listar se muestra como mensaje de error', async () => {
    listReferralPayoutsMock.mockRejectedValue(new Error('network fail'));
    renderPage();

    await waitFor(() => expect(screen.getByText('network fail')).toBeInTheDocument());
  });

  it('20. sin resultados muestra el estado vacío', async () => {
    listReferralPayoutsMock.mockResolvedValue({ ok: true, totalCount: 0, payouts: [] });
    renderPage();

    expect(await screen.findByText(/no hay retiros que coincidan con los filtros/i)).toBeInTheDocument();
  });
});

describe('RequireAdmin protegiendo /admin/affiliate-payouts', () => {
  function renderProtectedRoute() {
    return render(
      <MemoryRouter initialEntries={['/admin/affiliate-payouts']}>
        <Routes>
          <Route path="/admin/affiliate-payouts" element={<RequireAdmin><AdminAffiliatePayoutsPage /></RequireAdmin>} />
          <Route path="/dashboard" element={<div>dashboard-page</div>} />
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('admin puede acceder: se renderiza la página de retiros', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' }, loading: false, isAdmin: true, isEmailConfirmed: true });

    renderProtectedRoute();

    expect(await screen.findByText('Retiros de afiliados')).toBeInTheDocument();
  });

  it('no-admin NO puede acceder: se redirige a /dashboard', async () => {
    useAuth.mockReturnValue({ user: { id: 'u2' }, loading: false, isAdmin: false, isEmailConfirmed: true });

    renderProtectedRoute();

    await waitFor(() => expect(screen.getByText('dashboard-page')).toBeInTheDocument());
    expect(screen.queryByText('Retiros de afiliados')).not.toBeInTheDocument();
  });

  it('sin sesión: se redirige a /login', async () => {
    useAuth.mockReturnValue({ user: null, loading: false, isAdmin: false, isEmailConfirmed: false });

    renderProtectedRoute();

    await waitFor(() => expect(screen.getByText('login-page')).toBeInTheDocument());
    expect(screen.queryByText('Retiros de afiliados')).not.toBeInTheDocument();
  });
});
