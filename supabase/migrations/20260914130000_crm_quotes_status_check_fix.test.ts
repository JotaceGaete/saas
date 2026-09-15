/**
 * 20260914130000_crm_quotes_status_check_fix.sql — tests estáticos
 * (source-scan) que documentan el fix de crm_quotes_status_check. Mismo
 * criterio que el resto de las migraciones de este repo (`npx vitest run`
 * no tiene Postgres disponible): esta suite prueba que el DDL correcto
 * existe en el código fuente, no que Postgres lo ejecuta.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260914130000_crm_quotes_status_check_fix.sql?raw';

const codeOnly = migrationSource
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('crm_quotes_status_check fix — idempotente respecto del estado actual', () => {
  it('primero elimina el constraint si existe (DROP CONSTRAINT IF EXISTS)', () => {
    expect(codeOnly).toMatch(/ALTER TABLE public\.crm_quotes\s+DROP CONSTRAINT IF EXISTS crm_quotes_status_check;/);
  });

  it('luego lo vuelve a crear con los 4 valores esperados', () => {
    const addMatch = codeOnly.match(/ALTER TABLE public\.crm_quotes\s+ADD CONSTRAINT crm_quotes_status_check\s+CHECK \(status IN \(([\s\S]*?)\)\);/);
    expect(addMatch).toBeTruthy();
    const values = addMatch[1];
    for (const value of ['borrador', 'enviado', 'aceptado', 'rechazado']) {
      expect(values).toContain(`'${value}'`);
    }
    // Exactamente esos 4 -- ni más ni menos.
    expect((values.match(/'[a-z]+'/g) || []).length).toBe(4);
  });

  it('el DROP ocurre antes que el ADD (orden correcto para ser idempotente)', () => {
    const dropIdx = codeOnly.indexOf('DROP CONSTRAINT IF EXISTS crm_quotes_status_check');
    const addIdx = codeOnly.indexOf('ADD CONSTRAINT crm_quotes_status_check');
    expect(dropIdx).toBeGreaterThan(-1);
    expect(addIdx).toBeGreaterThan(-1);
    expect(dropIdx).toBeLessThan(addIdx);
  });

  it('no modifica ninguna fila existente (sin UPDATE/DELETE/INSERT)', () => {
    expect(codeOnly).not.toMatch(/\bUPDATE\b/i);
    expect(codeOnly).not.toMatch(/\bDELETE\b/i);
    expect(codeOnly).not.toMatch(/\bINSERT\b/i);
  });

  it('no toca RLS ni políticas', () => {
    expect(codeOnly).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER POLICY|ROW LEVEL SECURITY/i);
  });

  it('no toca ninguna otra tabla', () => {
    const alterTableMatches = codeOnly.match(/ALTER TABLE\s+public\.\w+/g) || [];
    for (const m of alterTableMatches) {
      expect(m).toBe('ALTER TABLE public.crm_quotes');
    }
  });
});
