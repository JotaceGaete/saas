import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchImageDataUri, resolveOgSourceImage } from './ogImagePipeline';

const PNG_MAGIC = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);

function fakeOkResponse(bytes = PNG_MAGIC, contentType = 'image/png') {
  return {
    ok: true,
    headers: { get: (h) => (h === 'content-length' ? String(bytes.byteLength) : contentType) },
    arrayBuffer: async () => bytes.buffer,
  };
}

function fakeHttpErrorResponse(status = 404) {
  return { ok: false, status, headers: { get: () => null } };
}

/** Simulates real fetch: resolves immediately, or hangs until the AbortSignal fires. */
function makeControllableFetch(behaviorByUrl) {
  return vi.fn((url, { signal } = {}) => {
    const behavior = behaviorByUrl[url] ?? behaviorByUrl.default;
    if (behavior?.type === 'immediate') {
      return behavior.isError
        ? Promise.reject(behavior.error)
        : Promise.resolve(behavior.response);
    }
    if (behavior?.type === 'hangs-until-abort') {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }
    // Never resolves, never aborts — used to prove "cover success doesn't wait on logo".
    return new Promise(() => {});
  });
}

describe('fetchImageDataUri', () => {
  it('portada rápida: resuelve ok con data URI antes del timeout', async () => {
    const fetchImpl = makeControllableFetch({
      'https://cdn/cover.png': { type: 'immediate', response: fakeOkResponse() },
    });
    const result = await fetchImageDataUri('https://cdn/cover.png', { timeoutMs: 3000, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.dataUri).toMatch(/^data:image\/png;base64,/);
    expect(result.reason).toBe('ok');
  });

  it('portada fallida: HTTP 404 se reporta sin lanzar', async () => {
    const fetchImpl = makeControllableFetch({
      'https://cdn/missing.png': { type: 'immediate', response: fakeHttpErrorResponse(404) },
    });
    const result = await fetchImageDataUri('https://cdn/missing.png', { timeoutMs: 3000, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('http_404');
  });

  it('sin URL: falla inmediatamente sin llamar a fetch', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchImageDataUri('', { timeoutMs: 3000, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_or_missing_url');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  describe('con fake timers', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('portada lenta: se aborta exactamente al timeout configurado', async () => {
      const fetchImpl = makeControllableFetch({
        'https://cdn/slow.png': { type: 'hangs-until-abort' },
      });
      const promise = fetchImageDataUri('https://cdn/slow.png', { timeoutMs: 3000, fetchImpl });
      await vi.advanceTimersByTimeAsync(3000);
      const result = await promise;
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('timeout');
    });

    it('no se aborta antes de tiempo', async () => {
      const fetchImpl = makeControllableFetch({
        'https://cdn/slow.png': { type: 'hangs-until-abort' },
      });
      const promise = fetchImageDataUri('https://cdn/slow.png', { timeoutMs: 3000, fetchImpl });
      await vi.advanceTimersByTimeAsync(2999);
      let settled = false;
      promise.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await promise;
    });
  });
});

describe('resolveOgSourceImage (estrategia de carrera controlada)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('portada exitosa: usa la portada y NO espera a que el logo termine (logo cuelga indefinidamente)', async () => {
    const fetchImpl = makeControllableFetch({
      'https://cdn/cover.png': { type: 'immediate', response: fakeOkResponse() },
      'https://cdn/logo.png': { type: 'never' },
    });
    const result = await resolveOgSourceImage({
      coverUrl: 'https://cdn/cover.png',
      logoUrl: 'https://cdn/logo.png',
      perImageTimeoutMs: 3000,
      totalBudgetMs: 5000,
      fetchImpl,
    });
    expect(result.source).toBe('cover');
    expect(result.coverDataUri).toMatch(/^data:image\/png;base64,/);
    // El logo nunca se resolvió (sigue colgado) — la función no lo esperó.
    expect(result.logoDataUri).toBeNull();
  });

  it('portada exitosa incluso si el logo también hubiera resuelto ok: nunca reporta logo en ese camino', async () => {
    const fetchImpl = makeControllableFetch({
      'https://cdn/cover.png': { type: 'immediate', response: fakeOkResponse() },
      'https://cdn/logo.png': { type: 'immediate', response: fakeOkResponse() },
    });
    const result = await resolveOgSourceImage({
      coverUrl: 'https://cdn/cover.png',
      logoUrl: 'https://cdn/logo.png',
      perImageTimeoutMs: 3000,
      totalBudgetMs: 5000,
      fetchImpl,
    });
    expect(result.source).toBe('cover');
    expect(result.coverDataUri).toMatch(/^data:image\/png;base64,/);
    // El camino exitoso de portada nunca espera ni reporta el logo, aunque también hubiera funcionado.
    expect(result.logoResult).toBeNull();
    expect(result.logoDataUri).toBeNull();
  });

  it('portada falla, logo exitoso: cae al logo', async () => {
    const fetchImpl = makeControllableFetch({
      'https://cdn/cover.png': { type: 'immediate', response: fakeHttpErrorResponse(404) },
      'https://cdn/logo.png': { type: 'immediate', response: fakeOkResponse() },
    });
    const result = await resolveOgSourceImage({
      coverUrl: 'https://cdn/cover.png',
      logoUrl: 'https://cdn/logo.png',
      perImageTimeoutMs: 3000,
      totalBudgetMs: 5000,
      fetchImpl,
    });
    expect(result.source).toBe('logo');
    expect(result.coverDataUri).toBeNull();
    expect(result.logoDataUri).toMatch(/^data:image\/png;base64,/);
  });

  it('portada con timeout (lenta), logo exitoso rápido: cae al logo sin esperar el timeout completo de la portada otra vez', async () => {
    const fetchImpl = makeControllableFetch({
      'https://cdn/cover.png': { type: 'hangs-until-abort' },
      'https://cdn/logo.png': { type: 'immediate', response: fakeOkResponse() },
    });
    const promise = resolveOgSourceImage({
      coverUrl: 'https://cdn/cover.png',
      logoUrl: 'https://cdn/logo.png',
      perImageTimeoutMs: 3000,
      totalBudgetMs: 5000,
      fetchImpl,
    });
    await vi.advanceTimersByTimeAsync(3000); // dispara el timeout de portada
    const result = await promise;
    expect(result.coverResult.reason).toBe('timeout');
    expect(result.source).toBe('logo');
    expect(result.logoDataUri).toMatch(/^data:image\/png;base64,/);
  });

  it('ambos fallan: source "none", nunca lanza', async () => {
    const fetchImpl = makeControllableFetch({
      'https://cdn/cover.png': { type: 'immediate', response: fakeHttpErrorResponse(500) },
      'https://cdn/logo.png': { type: 'immediate', response: fakeHttpErrorResponse(500) },
    });
    const result = await resolveOgSourceImage({
      coverUrl: 'https://cdn/cover.png',
      logoUrl: 'https://cdn/logo.png',
      perImageTimeoutMs: 3000,
      totalBudgetMs: 5000,
      fetchImpl,
    });
    expect(result.source).toBe('none');
    expect(result.coverDataUri).toBeNull();
    expect(result.logoDataUri).toBeNull();
  });

  it('timeout total: si el timeout de portada ya agota el presupuesto total, ni siquiera se espera al logo', async () => {
    const fetchImpl = makeControllableFetch({
      'https://cdn/cover.png': { type: 'hangs-until-abort' },
      'https://cdn/logo.png': { type: 'hangs-until-abort' },
    });
    // totalBudgetMs (2000) < perImageTimeoutMs (3000): al agotarse el timeout
    // de portada ya no queda presupuesto, así que el corte es inmediato y
    // determinista — sin competir contra el propio timeout del logo.
    const promise = resolveOgSourceImage({
      coverUrl: 'https://cdn/cover.png',
      logoUrl: 'https://cdn/logo.png',
      perImageTimeoutMs: 3000,
      totalBudgetMs: 2000,
      fetchImpl,
    });
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;
    expect(result.source).toBe('none');
    expect(result.coverResult.reason).toBe('timeout');
    expect(result.logoResult.reason).toBe('total_budget_exceeded');
    expect(result.totalMs).toBeGreaterThanOrEqual(3000);
  });

  it('sin portada configurada, con logo: usa el logo directamente', async () => {
    const fetchImpl = makeControllableFetch({
      'https://cdn/logo.png': { type: 'immediate', response: fakeOkResponse() },
    });
    const result = await resolveOgSourceImage({
      coverUrl: '',
      logoUrl: 'https://cdn/logo.png',
      perImageTimeoutMs: 3000,
      totalBudgetMs: 5000,
      fetchImpl,
    });
    expect(result.source).toBe('logo');
    expect(result.logoDataUri).toMatch(/^data:image\/png;base64,/);
  });

  it('sin portada ni logo: source "none" de inmediato', async () => {
    const fetchImpl = vi.fn();
    const result = await resolveOgSourceImage({
      coverUrl: '',
      logoUrl: '',
      perImageTimeoutMs: 3000,
      totalBudgetMs: 5000,
      fetchImpl,
    });
    expect(result.source).toBe('none');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
