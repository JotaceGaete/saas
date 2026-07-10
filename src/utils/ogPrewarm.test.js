import { describe, it, expect, vi, afterEach } from 'vitest';
import { prewarmOgImage } from './ogPrewarm';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe('prewarmOgImage', () => {
  it('hace un GET real a la URL exacta de og:image y reporta éxito', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await prewarmOgImage('rockets-43fac1', '2026-07-10T12:00:00Z');
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, opts] = globalThis.fetch.mock.calls[0];
    expect(calledUrl).toContain('/api/og-catalog?slug=rockets-43fac1');
    expect(calledUrl).toContain('v=');
    expect(opts.method).toBe('GET');
  });

  it('nunca lanza si fetch rechaza (red caída, timeout, etc.)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await prewarmOgImage('rockets-43fac1', 123);
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
  });

  it('reporta ok:false si el origen responde con error HTTP', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await prewarmOgImage('rockets-43fac1', 123);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  it('sin slug: no llama a fetch', async () => {
    globalThis.fetch = vi.fn();
    const result = await prewarmOgImage('', 123);
    expect(result.ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
