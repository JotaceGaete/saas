/**
 * send-daily-summary — Fase C: guarda que la client key nunca vuelva a
 * usarse como Authorization: Bearer. Test estático (source-scan) -- este
 * archivo toca Deno.serve/Deno.env a nivel de módulo, así que no se
 * importa/ejecuta directamente en Vitest.
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.ts?raw';

describe('send-daily-summary — publishable key usage (Fase C)', () => {
  it('resuelve la client key vía el helper compartido, no Deno.env.get directo', () => {
    expect(indexSource).toMatch(/getSupabasePublishableKeyOrEmpty\(\)/);
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]SUPABASE_ANON_KEY['"]\)/);
  });

  it('envía la client key solo como apikey al invocar send-email', () => {
    expect(indexSource).toMatch(/apikey:\s*anonKey \|\| serviceKey/);
  });

  it('nunca envía la client key como Authorization: Bearer, y elimina el invokeToken muerto', () => {
    // No matchea comentarios explicativos -- solo el patrón funcional real.
    expect(indexSource).not.toMatch(/Authorization\s*:\s*`Bearer/);
    expect(indexSource).not.toMatch(/['"]Authorization['"]\s*:/);
    expect(indexSource).not.toMatch(/invokeToken/);
  });

  it('conserva la construcción del resumen diario sin cambios', () => {
    expect(indexSource).toMatch(/type: 'daily_summary'/);
    expect(indexSource).toMatch(/topProducts/);
    expect(indexSource).toMatch(/dashboardUrl/);
  });
});
