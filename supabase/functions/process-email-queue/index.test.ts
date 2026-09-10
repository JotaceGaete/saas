/**
 * process-email-queue — Fase C: guarda que la client key nunca vuelva a
 * usarse como Authorization: Bearer. Test estático (source-scan) -- este
 * archivo toca Deno.serve/Deno.env a nivel de módulo, así que no se
 * importa/ejecuta directamente en Vitest.
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.ts?raw';

describe('process-email-queue — publishable key usage (Fase C)', () => {
  it('resuelve la client key vía el helper compartido, no Deno.env.get directo', () => {
    expect(indexSource).toMatch(/getSupabasePublishableKeyOrEmpty\(\)/);
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]SUPABASE_ANON_KEY['"]\)/);
  });

  it('envía la client key solo como apikey al invocar send-email', () => {
    expect(indexSource).toMatch(/'apikey':\s*anonKey/);
  });

  it('nunca envía la client key como Authorization: Bearer', () => {
    expect(indexSource).not.toMatch(/'Authorization'/);
    expect(indexSource).not.toMatch(/Authorization.*Bearer/);
  });

  it('conserva el payload y la lógica de idempotencia hacia send-email sin cambios', () => {
    expect(indexSource).toMatch(/idempotencyKey/);
    expect(indexSource).toMatch(/source: 'cron'/);
    expect(indexSource).toMatch(/x-email-secret/);
  });
});
