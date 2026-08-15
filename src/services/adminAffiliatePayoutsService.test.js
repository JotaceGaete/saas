import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
}));

import {
  getReferralPayoutDetail,
  listReferralPayouts,
  markReferralPayoutPaid,
  rejectReferralPayout,
} from './adminAffiliatePayoutsService';

beforeEach(() => {
  rpcMock.mockReset();
});

describe('listReferralPayouts', () => {
  it('llama a wa_admin_list_referral_payouts con p_status/p_limit/p_offset por defecto', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, totalCount: 0, payouts: [] }, error: null });
    await listReferralPayouts();
    expect(rpcMock).toHaveBeenCalledWith('wa_admin_list_referral_payouts', {
      p_status: null,
      p_limit: 30,
      p_offset: 0,
    });
  });

  it('llama con status/limit/offset explícitos', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, totalCount: 0, payouts: [] }, error: null });
    await listReferralPayouts({ status: 'requested', limit: 10, offset: 20 });
    expect(rpcMock).toHaveBeenCalledWith('wa_admin_list_referral_payouts', {
      p_status: 'requested',
      p_limit: 10,
      p_offset: 20,
    });
  });

  it('devuelve el payload tal cual, incluido totalCount y payouts', async () => {
    const payload = {
      ok: true,
      totalCount: 1,
      payouts: [{ payoutId: 'p-1', status: 'requested', maskedAccountNumber: '••••6789' }],
    };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await listReferralPayouts();
    expect(result).toEqual(payload);
  });

  it('devuelve {ok:false, error:"forbidden"} tal cual (no admin)', async () => {
    const payload = { ok: false, error: 'forbidden' };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await listReferralPayouts();
    expect(result).toEqual(payload);
  });

  it('propaga el error de transporte de la RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(listReferralPayouts()).rejects.toEqual({ message: 'boom' });
  });
});

describe('getReferralPayoutDetail', () => {
  it('llama a wa_admin_get_referral_payout_detail con p_payout_id', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, payout: {}, commissions: [] }, error: null });
    await getReferralPayoutDetail('p-1');
    expect(rpcMock).toHaveBeenCalledWith('wa_admin_get_referral_payout_detail', { p_payout_id: 'p-1' });
  });

  it('devuelve el payload tal cual, incluido payoutMethodSnapshot íntegro', async () => {
    const payload = {
      ok: true,
      payout: {
        payoutId: 'p-1',
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
      },
      commissions: [],
    };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await getReferralPayoutDetail('p-1');
    expect(result).toEqual(payload);
  });

  it('devuelve {ok:false, error:"payout_not_found"} tal cual', async () => {
    const payload = { ok: false, error: 'payout_not_found' };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await getReferralPayoutDetail('missing');
    expect(result).toEqual(payload);
  });

  it('propaga el error de transporte de la RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getReferralPayoutDetail('p-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('markReferralPayoutPaid', () => {
  it('llama a wa_admin_mark_referral_payout_paid con p_payout_id/p_external_reference', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, payoutId: 'p-1', paidAmount: 10, commissionsPaid: 2 }, error: null });
    await markReferralPayoutPaid('p-1', 'TXN-99');
    expect(rpcMock).toHaveBeenCalledWith('wa_admin_mark_referral_payout_paid', {
      p_payout_id: 'p-1',
      p_external_reference: 'TXN-99',
    });
  });

  it('devuelve la respuesta de éxito tal cual', async () => {
    const payload = { ok: true, payoutId: 'p-1', paidAmount: 10, commissionsPaid: 2 };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await markReferralPayoutPaid('p-1', 'TXN-99');
    expect(result).toEqual(payload);
  });

  it('devuelve {ok:true, alreadyPaid:true} tal cual', async () => {
    const payload = { ok: true, alreadyPaid: true, payoutId: 'p-1' };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await markReferralPayoutPaid('p-1', 'TXN-99');
    expect(result).toEqual(payload);
  });

  it('devuelve {ok:false, error:"payout_amount_changed", requestedAmount, payableAmount, excludedCommissionIds} tal cual', async () => {
    const payload = {
      ok: false,
      error: 'payout_amount_changed',
      requestedAmount: 10,
      payableAmount: 6,
      excludedCommissionIds: ['c-1'],
    };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await markReferralPayoutPaid('p-1', 'TXN-99');
    expect(result).toEqual(payload);
  });

  it('propaga el error de transporte de la RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(markReferralPayoutPaid('p-1', 'TXN-99')).rejects.toEqual({ message: 'boom' });
  });
});

describe('rejectReferralPayout', () => {
  it('llama a wa_admin_reject_referral_payout con p_payout_id/p_reason', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, payoutId: 'p-1', releasedCommissionCount: 1 }, error: null });
    await rejectReferralPayout('p-1', 'Datos inválidos');
    expect(rpcMock).toHaveBeenCalledWith('wa_admin_reject_referral_payout', {
      p_payout_id: 'p-1',
      p_reason: 'Datos inválidos',
    });
  });

  it('devuelve la respuesta de éxito tal cual', async () => {
    const payload = { ok: true, payoutId: 'p-1', releasedCommissionCount: 1 };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await rejectReferralPayout('p-1', 'Datos inválidos');
    expect(result).toEqual(payload);
  });

  it('devuelve {ok:true, alreadyRejected:true} tal cual', async () => {
    const payload = { ok: true, alreadyRejected: true, payoutId: 'p-1' };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await rejectReferralPayout('p-1', 'Datos inválidos');
    expect(result).toEqual(payload);
  });

  it('devuelve {ok:false, error:"missing_reason"} tal cual', async () => {
    const payload = { ok: false, error: 'missing_reason' };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await rejectReferralPayout('p-1', '');
    expect(result).toEqual(payload);
  });

  it('propaga el error de transporte de la RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(rejectReferralPayout('p-1', 'x')).rejects.toEqual({ message: 'boom' });
  });
});
