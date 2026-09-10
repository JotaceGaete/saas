/**
 * worker.js — Fase C: guarda que la client key nunca vuelva a usarse como
 * Authorization: Bearer. Test estático (source-scan) -- worker.js corre en
 * runtime de Cloudflare Workers, no Deno/Vitest, así que no se ejecuta.
 */
import { describe, it, expect } from 'vitest';
import workerSource from './worker.js?raw';

describe('worker.js — publishable key usage (Fase C)', () => {
  it('lee el nuevo binding SUPABASE_PUBLISHABLE_KEY', () => {
    expect(workerSource).toMatch(/env\?\.SUPABASE_PUBLISHABLE_KEY/);
  });

  it('mantiene fallback temporal al binding legacy SUPABASE_ANON_KEY', () => {
    expect(workerSource).toMatch(/env\?\.SUPABASE_ANON_KEY/);
  });

  it('envía la client key solo como apikey', () => {
    expect(workerSource).toMatch(/apikey:\s*supabaseKey/);
  });

  it('nunca envía la client key como Authorization: Bearer', () => {
    // No matchea comentarios explicativos -- solo el patrón funcional real
    // (header Authorization con un template Bearer, como lo tenía el código
    // antes de esta migración).
    expect(workerSource).not.toMatch(/Authorization\s*:\s*`Bearer/);
    expect(workerSource).not.toMatch(/['"]Authorization['"]\s*:/);
  });

  it('no introduce ningún JWT hardcodeado', () => {
    expect(workerSource).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});
