import { beforeEach, describe, expect, it, vi } from 'vitest';

const attributeReferralMock = vi.fn();

vi.mock('../services/referralService', () => ({
  attributeReferral: (...args) => attributeReferralMock(...args),
}));

import {
  attemptPendingAttribution,
  captureReferralFromUrl,
  clearStoredReferral,
  getStoredReferral,
  isNewAccountFromTimestamps,
} from './referralAttribution';

function setUrl(path) {
  window.history.pushState({}, '', path);
}

beforeEach(() => {
  attributeReferralMock.mockReset();
  sessionStorage.clear();
  setUrl('/business-registration');
});

describe('captureReferralFromUrl', () => {
  it('con ?ref= en la URL, guarda code y un clickAt (ISO string)', () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();

    const stored = getStoredReferral();
    expect(stored.code).toBe('jota-f92ee');
    expect(new Date(stored.clickAt).toISOString()).toBe(stored.clickAt);
  });

  it('clickAt refleja el momento de la captura, no un momento posterior', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T10:00:00.000Z'));
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();
    vi.setSystemTime(new Date('2026-08-12T10:05:00.000Z')); // 5 min después, simula que el usuario tardó en enviar el form

    const stored = getStoredReferral();
    expect(stored.clickAt).toBe('2026-08-12T10:00:00.000Z');
    vi.useRealTimers();
  });

  it('sin ?ref= en la URL, conserva lo que ya estaba guardado (remount sin ref)', () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();
    const first = getStoredReferral();

    setUrl('/business-registration'); // remount, o vuelta de Google a /auth/callback
    captureReferralFromUrl();

    expect(getStoredReferral()).toEqual(first);
  });

  it('sin ?ref= y sin nada guardado, no guarda nada', () => {
    captureReferralFromUrl();
    expect(getStoredReferral()).toBeNull();
  });

  it('un ?ref= nuevo reemplaza el código guardado, con clickAt fresco', () => {
    setUrl('/business-registration?ref=codigo-viejo');
    captureReferralFromUrl();
    const first = getStoredReferral();

    vi.useFakeTimers();
    vi.setSystemTime(new Date(new Date(first.clickAt).getTime() + 10_000));
    setUrl('/business-registration?ref=codigo-nuevo');
    captureReferralFromUrl();
    vi.useRealTimers();

    const second = getStoredReferral();
    expect(second.code).toBe('codigo-nuevo');
    expect(second.clickAt).not.toBe(first.clickAt);
  });

  it('el mismo ?ref= en una nueva visita también refresca clickAt', () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();
    const first = getStoredReferral();

    vi.useFakeTimers();
    vi.setSystemTime(new Date(new Date(first.clickAt).getTime() + 60_000));
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();
    vi.useRealTimers();

    const second = getStoredReferral();
    expect(second.code).toBe('jota-f92ee');
    expect(second.clickAt).not.toBe(first.clickAt);
  });
});

describe('isNewAccountFromTimestamps — frontera exacta de la tolerancia (2000ms)', () => {
  const base = new Date('2026-08-12T00:00:00.000Z').getTime();

  function userWithDelta(deltaMs) {
    return {
      created_at: new Date(base).toISOString(),
      last_sign_in_at: new Date(base + deltaMs).toISOString(),
    };
  }

  it('delta = 0ms -> nuevo', () => {
    expect(isNewAccountFromTimestamps(userWithDelta(0))).toBe(true);
  });

  it('delta = 1999ms -> nuevo', () => {
    expect(isNewAccountFromTimestamps(userWithDelta(1999))).toBe(true);
  });

  it('delta = 2000ms -> nuevo (límite inclusive)', () => {
    expect(isNewAccountFromTimestamps(userWithDelta(2000))).toBe(true);
  });

  it('delta = 2001ms -> existente', () => {
    expect(isNewAccountFromTimestamps(userWithDelta(2001))).toBe(false);
  });

  it('delta grande (30 días) -> existente', () => {
    expect(isNewAccountFromTimestamps(userWithDelta(30 * 24 * 60 * 60 * 1000))).toBe(false);
  });

  it('sin created_at/last_sign_in_at -> existente (nunca "nuevo" por defecto)', () => {
    expect(isNewAccountFromTimestamps({})).toBe(false);
    expect(isNewAccountFromTimestamps(null)).toBe(false);
  });
});

describe('attemptPendingAttribution', () => {
  it('sin userId, nunca llama la RPC', async () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();

    const result = await attemptPendingAttribution({ userId: null, isEligible: true });

    expect(attributeReferralMock).not.toHaveBeenCalled();
    expect(result).toEqual({ attempted: false, reason: 'not_authenticated' });
  });

  it('sin referral guardado, nunca llama la RPC', async () => {
    const result = await attemptPendingAttribution({ userId: 'user-1', isEligible: true });

    expect(attributeReferralMock).not.toHaveBeenCalled();
    expect(result).toEqual({ attempted: false, reason: 'no_pending_referral' });
  });

  it('isEligible=false (usuario existente): limpia el storage y NUNCA llama la RPC', async () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();

    const result = await attemptPendingAttribution({ userId: 'user-1', isEligible: false });

    expect(attributeReferralMock).not.toHaveBeenCalled();
    expect(getStoredReferral()).toBeNull();
    expect(result).toEqual({ attempted: false, reason: 'not_eligible_existing_user' });
  });

  it('llama la RPC con code y clickAt guardados', async () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();
    const stored = getStoredReferral();
    attributeReferralMock.mockResolvedValue({ attributed: true, status: 'qualified' });

    await attemptPendingAttribution({ userId: 'user-1', isEligible: true });

    expect(attributeReferralMock).toHaveBeenCalledWith('jota-f92ee', stored.clickAt);
  });

  it('attributed:true -> limpia storage', async () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();
    attributeReferralMock.mockResolvedValue({ attributed: true, status: 'qualified' });

    await attemptPendingAttribution({ userId: 'user-1', isEligible: true });

    expect(getStoredReferral()).toBeNull();
  });

  it.each(['already_attributed', 'self_referral', 'invalid_code', 'click_in_future', 'click_window_expired', 'empty_code'])(
    'attributed:false con razón determinista "%s" -> limpia storage',
    async (reason) => {
      setUrl('/business-registration?ref=jota-f92ee');
      captureReferralFromUrl();
      attributeReferralMock.mockResolvedValue({ attributed: false, reason });

      await attemptPendingAttribution({ userId: 'user-1', isEligible: true });

      expect(getStoredReferral()).toBeNull();
    }
  );

  it('la RPC lanza (error transitorio de red/Supabase) -> NO limpia storage, no propaga la excepción', async () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();
    const stored = getStoredReferral();
    attributeReferralMock.mockRejectedValue(new Error('network error'));

    await expect(attemptPendingAttribution({ userId: 'user-1', isEligible: true })).resolves.not.toThrow();

    expect(getStoredReferral()).toEqual(stored);
  });
});

describe('clearStoredReferral', () => {
  it('borra lo guardado', () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();
    expect(getStoredReferral()).not.toBeNull();

    clearStoredReferral();

    expect(getStoredReferral()).toBeNull();
  });
});
