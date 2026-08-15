import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();
const createClientMock = vi.fn(() => ({ from: fromMock }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => createClientMock(...args),
}));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import { getBillingSubscriptionByProviderSubscriptionId } from './billingSubscriptionRepository.js';

/** Encadena from().select().eq().eq().maybeSingle() devolviendo { data, error }. */
function mockQueryResult({ data = null, error = null } = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq2 = vi.fn(() => ({ maybeSingle }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  fromMock.mockReturnValue({ select });
  return { select, eq1, eq2, maybeSingle };
}

describe('getBillingSubscriptionByProviderSubscriptionId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consulta billing_subscriptions filtrando por provider y provider_subscription_id', async () => {
    const { select, eq1, eq2 } = mockQueryResult({
      data: { business_id: 'biz-1', provider: 'paypal', provider_subscription_id: 'I-SUB123', metadata_json: {} },
    });

    const result = await getBillingSubscriptionByProviderSubscriptionId('paypal', 'I-SUB123');

    expect(fromMock).toHaveBeenCalledWith('billing_subscriptions');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq1).toHaveBeenCalledWith('provider', 'paypal');
    expect(eq2).toHaveBeenCalledWith('provider_subscription_id', 'I-SUB123');
    expect(result?.business_id).toBe('biz-1');
  });

  it('subscription id inexistente -> null, nunca inventa un business_id', async () => {
    mockQueryResult({ data: null, error: null });

    const result = await getBillingSubscriptionByProviderSubscriptionId('paypal', 'I-DOES-NOT-EXIST');

    expect(result).toBeNull();
  });

  it('provider_subscription_id perteneciente a otro provider nunca se usa (filtra por ambos campos)', async () => {
    // maybeSingle() con el filtro (provider, provider_subscription_id) compuesto
    // ya garantiza esto a nivel de query -- este test confirma que ambos
    // valores exactos se pasan al query builder, no solo provider_subscription_id.
    const { eq1, eq2 } = mockQueryResult({ data: null, error: null });

    await getBillingSubscriptionByProviderSubscriptionId('dlocal', 'I-BELONGS-TO-PAYPAL');

    expect(eq1).toHaveBeenCalledWith('provider', 'dlocal');
    expect(eq2).toHaveBeenCalledWith('provider_subscription_id', 'I-BELONGS-TO-PAYPAL');
  });

  it('error de Supabase -> lanza HttpError controlado, nunca devuelve datos parciales', async () => {
    mockQueryResult({ data: null, error: { message: 'connection reset' } });

    await expect(getBillingSubscriptionByProviderSubscriptionId('paypal', 'I-SUB123')).rejects.toThrow(
      /read by provider_subscription_id failed/,
    );
  });

  it('provider o providerSubscriptionId vacíos -> null sin consultar Supabase', async () => {
    const result1 = await getBillingSubscriptionByProviderSubscriptionId('', 'I-SUB123');
    const result2 = await getBillingSubscriptionByProviderSubscriptionId('paypal', '');

    expect(result1).toBeNull();
    expect(result2).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
