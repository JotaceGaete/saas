/**
 * 20260907120000_mp_oauth_connect.sql — tests estáticos (source-scan) del
 * RLS y los grants. No hay entorno Postgres en Vitest, así que esto NO
 * ejecuta la migración ni reemplaza el dry-run manual ya hecho contra un
 * scratch Postgres -- solo guarda contra una regresión textual obvia
 * (alguien agrega una policy o un GRANT a authenticated/anon sin querer).
 */
import { describe, it, expect } from 'vitest';
import migrationSource from './20260907120000_mp_oauth_connect.sql?raw';

describe('mp_connections / mp_oauth_states — RLS + REVOKE (no CRUD directo del cliente)', () => {
  it('ambas tablas tienen RLS habilitado', () => {
    expect(migrationSource).toMatch(/ALTER TABLE public\.mp_connections ENABLE ROW LEVEL SECURITY/);
    expect(migrationSource).toMatch(/ALTER TABLE public\.mp_oauth_states ENABLE ROW LEVEL SECURITY/);
  });

  it('ambas tablas revocan todo acceso a PUBLIC, anon y authenticated', () => {
    expect(migrationSource).toMatch(/REVOKE ALL ON TABLE public\.mp_connections FROM PUBLIC, anon, authenticated/);
    expect(migrationSource).toMatch(/REVOKE ALL ON TABLE public\.mp_oauth_states FROM PUBLIC, anon, authenticated/);
  });

  it('no existe ninguna CREATE POLICY sobre estas 2 tablas (cero excepciones al REVOKE)', () => {
    expect(migrationSource).not.toMatch(/CREATE POLICY[^;]*ON public\.mp_connections/s);
    expect(migrationSource).not.toMatch(/CREATE POLICY[^;]*ON public\.mp_oauth_states/s);
  });
});

describe('RPCs service_role-only — sin GRANT a authenticated/anon', () => {
  it('las 3 RPCs sensibles (crean/consumen state, upsert de conexión) revocan authenticated/anon', () => {
    expect(migrationSource).toMatch(/REVOKE ALL ON FUNCTION public\.wa_create_mp_oauth_state[^;]*FROM PUBLIC, anon, authenticated/);
    expect(migrationSource).toMatch(/REVOKE ALL ON FUNCTION public\.wa_consume_mp_oauth_state[^;]*FROM PUBLIC, anon, authenticated/);
    expect(migrationSource).toMatch(/REVOKE ALL ON FUNCTION public\.wa_upsert_mp_connection[^;]*FROM PUBLIC, anon, authenticated/);
  });

  it('la única función GRANTeada a authenticated es la de solo-lectura sanitizada', () => {
    const grants = migrationSource.match(/GRANT EXECUTE ON FUNCTION[^;]*TO authenticated/g) ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(/wa_get_my_mp_connection_status/);
  });
});

describe('cifrado — nunca texto plano persistido', () => {
  it('access_token y refresh_token se guardan solo como *_ciphertext (BYTEA), nunca en columnas de texto plano', () => {
    expect(migrationSource).toMatch(/access_token_ciphertext\s+BYTEA\s+NOT NULL/);
    expect(migrationSource).toMatch(/refresh_token_ciphertext\s+BYTEA/);
    // p_access_token TEXT es el parámetro de ENTRADA a la RPC (texto plano
    // recibido server-to-server desde mp-oauth-callback, cifrado ANTES de
    // insertarse) -- no una columna de tabla. Solo debe rechazar una
    // columna real `access_token TEXT` (con word boundary, no como
    // sufijo de p_access_token).
    expect(migrationSource).not.toMatch(/(?<!p_)\baccess_token\s+TEXT\b/);
  });

  it('el code_verifier también se persiste cifrado, nunca en texto plano', () => {
    expect(migrationSource).toMatch(/code_verifier_ciphertext\s+BYTEA\s+NOT NULL/);
  });

  it('el state solo persiste su hash, nunca el valor raw', () => {
    expect(migrationSource).toMatch(/state_hash\s+TEXT\s+NOT NULL UNIQUE/);
    expect(migrationSource).not.toMatch(/state\s+TEXT\s+NOT NULL(?!\s+UNIQUE)/);
  });

  it('la clave de cifrado nunca tiene un valor por defecto ni un fallback en texto plano', () => {
    expect(migrationSource).toMatch(/MP_CONNECTION_ENCRYPTION_KEY_NOT_CONFIGURED/);
    expect(migrationSource).not.toMatch(/DEFAULT\s+'[^']*key[^']*'/i);
  });
});

describe('state — TTL y single-use', () => {
  it('wa_create_mp_oauth_state fija expires_at con un TTL (default 600s = 10 min)', () => {
    expect(migrationSource).toMatch(/p_ttl_seconds\s+INTEGER\s+DEFAULT\s+600/);
    // INSERT posicional: `expires_at` está en la lista de columnas y
    // `now() + make_interval(...)` en la posición correspondiente de
    // VALUES, no unidos por `=` (eso sería sintaxis de UPDATE).
    expect(migrationSource).toMatch(/business_id, user_id, state_hash, code_verifier_ciphertext, expires_at/);
    expect(migrationSource).toMatch(/now\(\)\s*\+\s*make_interval\(secs\s*=>\s*p_ttl_seconds\)/);
  });

  it('wa_consume_mp_oauth_state marca consumed_at de forma condicional (single-use atómico)', () => {
    expect(migrationSource).toMatch(/WHERE state_hash = p_state_hash\s+AND consumed_at IS NULL\s+AND expires_at > now\(\)/);
  });
});
