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
  localStorage.clear();
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

describe('regresión — causa raíz: salto de pestaña/contexto (confirmación de email)', () => {
  it(
    'un pending capturado en la pestaña original sobrevive el salto a la pestaña nueva que abre el enlace ' +
      'de confirmación de email: aunque esa pestaña nueva no tenga sessionStorage propio (aislado por pestaña, ' +
      'siempre vacío ahí), sí comparte localStorage (same-origin, no por pestaña) -- por eso attemptPendingAttribution ' +
      'debe seguir viendo el pending y completar la atribución. Con sessionStorage este test fallaría: ' +
      'sessionStorage.clear() borraría el pending y attributeReferral() nunca se llamaría.',
    async () => {
      // 1. captura un ?ref= válido, en lo que sería la pestaña original de business-registration.
      setUrl('/business-registration?ref=jota-f92ee');
      captureReferralFromUrl();

      // 2. confirma que queda almacenado.
      const stored = getStoredReferral();
      expect(stored).not.toBeNull();
      expect(stored.code).toBe('jota-f92ee');

      // 3. simula el salto a otra pestaña/contexto eliminando sessionStorage
      //    (una pestaña nueva, abierta desde el enlace de confirmación de email,
      //    nunca tuvo sessionStorage propio con este pending -- clear() lo replica).
      sessionStorage.clear();

      // 4. NO se toca localStorage -- es lo único que debe sobrevivir el salto.
      expect(getStoredReferral()).toEqual(stored);

      attributeReferralMock.mockResolvedValue({ attributed: true, status: 'qualified' });

      // 5. ejecuta attemptPendingAttribution(), como haría /auth/callback en la pestaña nueva.
      const result = await attemptPendingAttribution({
        userId: 'user-nuevo',
        isEligible: true,
        authPath: 'auth_callback_email',
      });

      // 6-7. attributeReferral() sí es llamado, con el código esperado.
      expect(attributeReferralMock).toHaveBeenCalledTimes(1);
      expect(attributeReferralMock).toHaveBeenCalledWith('jota-f92ee', stored.clickAt);

      // 8. attributed:true -> el pending queda eliminado.
      expect(result).toEqual({ attempted: true, result: { attributed: true, status: 'qualified' } });
      expect(getStoredReferral()).toBeNull();
    }
  );
});

describe('instrumentación diagnóstica temporal (logAttribution) — solo observa, no cambia comportamiento', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('captureReferralFromUrl loguea hasReferralCode:true y stored:true, sin imprimir el código', () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[referralAttribution] capture_stored',
      expect.objectContaining({ hasReferralCode: true, stored: true })
    );
    const loggedPayload = JSON.stringify(consoleLogSpy.mock.calls);
    expect(loggedPayload).not.toContain('jota-f92ee');
  });

  it('captureReferralFromUrl sin ?ref= loguea hasReferralCode:false', () => {
    captureReferralFromUrl();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[referralAttribution] capture_no_ref_param',
      expect.objectContaining({ hasReferralCode: false })
    );
  });

  it('attemptPendingAttribution loguea hasPending e isEligible al comenzar, y el resultado sigue siendo el mismo', async () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();
    attributeReferralMock.mockResolvedValue({ attributed: true, status: 'qualified' });

    const result = await attemptPendingAttribution({ userId: 'user-1', isEligible: true, authPath: 'auth_callback_google' });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[referralAttribution] attribution_start',
      expect.objectContaining({ authPath: 'auth_callback_google', isEligible: true, hasPending: true })
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[referralAttribution] attribution_result',
      expect.objectContaining({ attributed: true, reason: null, pendingCleared: true })
    );
    // Mismo resultado que sin instrumentación -- el logging es puramente observacional.
    expect(result).toEqual({ attempted: true, result: { attributed: true, status: 'qualified' } });
  });

  it('la RPC lanza: loguea errorMessage/errorCode sin exponer userId ni código completo, y no cambia el resultado', async () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();
    const rpcError = Object.assign(new Error('network error'), { code: 'ECONNREFUSED' });
    attributeReferralMock.mockRejectedValue(rpcError);

    const result = await attemptPendingAttribution({ userId: 'user-1', isEligible: true, authPath: 'register_immediate_session' });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[referralAttribution] attribution_rpc_error',
      expect.objectContaining({
        authPath: 'register_immediate_session',
        errorMessage: 'network error',
        errorCode: 'ECONNREFUSED',
        pendingCleared: false,
      })
    );
    const loggedPayload = JSON.stringify(consoleLogSpy.mock.calls);
    expect(loggedPayload).not.toContain('user-1');
    expect(loggedPayload).not.toContain('jota-f92ee');
    expect(result).toEqual({ attempted: true, error: rpcError });
  });

  it('isEligible=false: loguea el skip con pendingCleared:true, sin llamar la RPC', async () => {
    setUrl('/business-registration?ref=jota-f92ee');
    captureReferralFromUrl();

    await attemptPendingAttribution({ userId: 'user-1', isEligible: false, authPath: 'login_existing_user' });

    expect(attributeReferralMock).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[referralAttribution] attribution_skipped',
      expect.objectContaining({ authPath: 'login_existing_user', reason: 'not_eligible_existing_user', pendingCleared: true })
    );
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
