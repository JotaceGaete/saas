/**
 * 20260921130000_secure_wa_businesses_bank_fields.sql — tests estáticos
 * (source-scan). Confirma que el DDL correcto existe en el archivo fuente
 * para SEGURIDAD-WALINKA-1D.
 *
 * La verificación real contra PostgreSQL (RLS/policies/has_table_privilege
 * de wa_business_bank_accounts, la migración de datos preexistentes antes
 * del DROP, y que el dueño/admin/anon se comportan según diseño) se
 * documenta en el informe de SEGURIDAD-WALINKA-1D -- este archivo solo
 * prueba que el SQL versionado dice lo que se supone que dice, mismo
 * criterio que 20260921120000_secure_sensitive_tables_rls.test.ts.
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260921130000_secure_wa_businesses_bank_fields.sql?raw';

const codeOnly = migrationSource.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');

const BANK_COLUMNS = [
  'bank_name',
  'bank_account_type',
  'bank_account_number',
  'bank_account_holder',
  'bank_rut',
  'bank_email',
];

describe('SEGURIDAD-WALINKA-1D — separa bank_* de wa_businesses', () => {
  it('crea wa_business_bank_accounts con las 6 columnas bank_* + business_id FK', () => {
    expect(codeOnly).toMatch(/CREATE TABLE public\.wa_business_bank_accounts/);
    const createStart = codeOnly.indexOf('CREATE TABLE public.wa_business_bank_accounts');
    const createEnd = codeOnly.indexOf(');', createStart);
    const createBody = codeOnly.slice(createStart, createEnd);
    expect(createBody).toMatch(/business_id UUID PRIMARY KEY REFERENCES public\.wa_businesses\(id\) ON DELETE CASCADE/);
    for (const col of BANK_COLUMNS) {
      expect(createBody).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('ENABLE ROW LEVEL SECURITY en wa_business_bank_accounts, sin FORCE', () => {
    expect(codeOnly).toMatch(/ALTER TABLE public\.wa_business_bank_accounts ENABLE ROW LEVEL SECURITY;/);
    expect(codeOnly).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
  });

  it('policy owner: ALL para authenticated, scoped por business_id -> wa_businesses.user_id = auth.uid()', () => {
    expect(codeOnly).toMatch(/CREATE POLICY "wa_business_bank_accounts_owner_all"\s*\nON public\.wa_business_bank_accounts FOR ALL TO authenticated\s*\nUSING \(business_id IN \(SELECT id FROM public\.wa_businesses WHERE user_id = auth\.uid\(\)\)\)\s*\nWITH CHECK \(business_id IN \(SELECT id FROM public\.wa_businesses WHERE user_id = auth\.uid\(\)\)\);/);
  });

  it('policy admin: SELECT para authenticated, gateada por wa_is_admin()', () => {
    expect(codeOnly).toMatch(/CREATE POLICY "wa_business_bank_accounts_admin_select"\s*\nON public\.wa_business_bank_accounts FOR SELECT TO authenticated\s*\nUSING \(public\.wa_is_admin\(\)\);/);
  });

  it('no crea ninguna policy para anon ni para "public"/PUBLIC', () => {
    const policyBlocks = codeOnly.match(/CREATE POLICY[^;]*;/gs) || [];
    expect(policyBlocks.length).toBe(2);
    for (const block of policyBlocks) {
      expect(block).not.toMatch(/\bTO\s+(anon|public)\b/i);
    }
  });

  it('REVOKE ALL ... FROM PUBLIC, anon sobre wa_business_bank_accounts', () => {
    expect(codeOnly).toMatch(/REVOKE ALL ON public\.wa_business_bank_accounts FROM PUBLIC, anon;/);
  });

  it('migra datos preexistentes (INSERT ... SELECT) ANTES del DROP COLUMN -- nunca destruye sin copiar primero', () => {
    const insertIdx = codeOnly.indexOf('INSERT INTO public.wa_business_bank_accounts');
    const dropIdx = codeOnly.indexOf('DROP COLUMN bank_name');
    expect(insertIdx).toBeGreaterThan(-1);
    expect(dropIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeLessThan(dropIdx);

    const insertEnd = codeOnly.indexOf(';', insertIdx);
    const insertBody = codeOnly.slice(insertIdx, insertEnd);
    // Selecciona las 6 columnas bank_* de wa_businesses y solo copia filas
    // con al menos un valor no nulo (no crea filas vacías por cada negocio).
    for (const col of BANK_COLUMNS) {
      expect(insertBody).toMatch(new RegExp(`\\b${col}\\b`));
    }
    expect(insertBody).toMatch(/FROM public\.wa_businesses/);
    expect(insertBody).toMatch(/WHERE[\s\S]*IS NOT NULL/);
  });

  it('DROP de las 6 columnas bank_* en wa_businesses, y solo esas 6', () => {
    const alterStart = codeOnly.indexOf('ALTER TABLE public.wa_businesses\n  DROP COLUMN');
    expect(alterStart).toBeGreaterThan(-1);
    const alterEnd = codeOnly.indexOf(';', alterStart);
    const alterBody = codeOnly.slice(alterStart, alterEnd);
    const dropped = (alterBody.match(/DROP COLUMN (\w+)/g) || []).map((m) => m.replace('DROP COLUMN ', ''));
    expect(new Set(dropped)).toEqual(new Set(BANK_COLUMNS));
  });

  it('no toca ninguna otra tabla, policy o columna fuera de wa_business_bank_accounts / wa_businesses.bank_*', () => {
    expect(codeOnly).not.toMatch(/CREATE OR REPLACE FUNCTION|DROP FUNCTION|DROP TABLE/i);
    const alterTableMatches = codeOnly.match(/ALTER TABLE public\.(\w+)/g) || [];
    const alteredTables = new Set(alterTableMatches.map((m) => m.replace('ALTER TABLE public.', '')));
    expect(alteredTables).toEqual(new Set(['wa_business_bank_accounts', 'wa_businesses']));
  });

  it('idempotente: CREATE TABLE/POLICY, REVOKE y DROP COLUMN son operaciones que no fallan si se repiten en el estado final ya migrado (documentado, no ejecutado acá)', () => {
    // No usa "IF NOT EXISTS" en CREATE TABLE/POLICY a propósito (mismo criterio
    // que las tablas de negocio del repo: una migración corre una sola vez;
    // psql -v ON_ERROR_STOP=1 aborta el pipeline si algo ya existía, señal de
    // que el historial de migraciones está roto, no algo a silenciar).
    expect(codeOnly).toMatch(/CREATE TABLE public\.wa_business_bank_accounts/);
    expect(codeOnly).not.toMatch(/CREATE TABLE IF NOT EXISTS public\.wa_business_bank_accounts/);
  });
});
