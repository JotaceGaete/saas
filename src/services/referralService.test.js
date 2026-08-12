import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
}));

import { attributeReferral, getMyReferralStats, listMyReferrals } from './referralService';

beforeEach(() => {
  rpcMock.mockReset();
});

describe('getMyReferralStats', () => {
  it('llama a wa_get_my_referral_stats sin argumentos y devuelve el payload', async () => {
    const payload = {
      code: 'ana-1a2b3',
      rewardAmount: 5,
      rewardCurrency: 'USD',
      requiredPaidMonths: 2,
      invitedCount: 3,
      oneMonthCount: 1,
      qualifiedCount: 1,
      pendingAmount: 5,
      availableAmount: 0,
      totalEarnedAmount: 0,
    };
    rpcMock.mockResolvedValue({ data: payload, error: null });

    const result = await getMyReferralStats();

    expect(rpcMock).toHaveBeenCalledWith('wa_get_my_referral_stats');
    expect(result).toEqual(payload);
  });

  it('propaga el error de la RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'NOT_AUTHENTICATED' } });
    await expect(getMyReferralStats()).rejects.toEqual({ message: 'NOT_AUTHENTICATED' });
  });
});

describe('listMyReferrals', () => {
  it('llama a wa_list_my_referrals con p_limit/p_offset por defecto', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await listMyReferrals();
    expect(rpcMock).toHaveBeenCalledWith('wa_list_my_referrals', { p_limit: 20, p_offset: 0 });
  });

  it('llama a wa_list_my_referrals con p_limit/p_offset explícitos', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await listMyReferrals({ limit: 5, offset: 10 });
    expect(rpcMock).toHaveBeenCalledWith('wa_list_my_referrals', { p_limit: 5, p_offset: 10 });
  });

  it('devuelve la lista tal cual', async () => {
    const rows = [{ publicLabel: 'Usuario #A3F2', createdAt: '2026-08-01T00:00:00Z', paidMonths: 2, qualified: true }];
    rpcMock.mockResolvedValue({ data: rows, error: null });
    const result = await listMyReferrals();
    expect(result).toEqual(rows);
  });

  it('devuelve [] si data viene null', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const result = await listMyReferrals();
    expect(result).toEqual([]);
  });

  it('propaga el error de la RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(listMyReferrals()).rejects.toEqual({ message: 'boom' });
  });
});

describe('attributeReferral', () => {
  it('llama a wa_attribute_referral con p_code/p_click_at y devuelve el payload', async () => {
    const payload = { attributed: true, status: 'qualified', attributionId: 'attr-1' };
    rpcMock.mockResolvedValue({ data: payload, error: null });

    const result = await attributeReferral('jota-f92ee', '2026-08-12T10:00:00.000Z');

    expect(rpcMock).toHaveBeenCalledWith('wa_attribute_referral', {
      p_code: 'jota-f92ee',
      p_click_at: '2026-08-12T10:00:00.000Z',
    });
    expect(result).toEqual(payload);
  });

  it('propaga el error de la RPC (p.ej. NOT_AUTHENTICATED)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'NOT_AUTHENTICATED' } });
    await expect(attributeReferral('jota-f92ee', null)).rejects.toEqual({ message: 'NOT_AUTHENTICATED' });
  });
});
