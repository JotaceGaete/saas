/**
 * mp-oauth-disconnect/index.ts — tests estáticos (source-scan). Sin
 * lib.ts propio (reutiliza resolveBusinessForOAuth de mp-oauth-start,
 * ya cubierto en su propio lib.test.ts) y sin test file previo -- este
 * archivo cierra ese hueco.
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.ts?raw';

describe('mp-oauth-disconnect — requiere usuario autenticado', () => {
  it('rechaza sin header Authorization', () => {
    expect(indexSource).toMatch(/authHeader.*startsWith\(['"]bearer ['"]\)/is);
    expect(indexSource).toMatch(/User not authenticated/);
  });

  it('valida el JWT real vía auth.getUser()', () => {
    expect(indexSource).toMatch(/userClient\.auth\.getUser\(\)/);
  });
});

describe('mp-oauth-disconnect — negocio derivado exclusivamente de auth.uid()', () => {
  it('ignora explícitamente cualquier businessId recibido en el body', () => {
    expect(indexSource).toMatch(/businessId en body IGNORADO/);
  });

  it('reutiliza resolveBusinessForOAuth de mp-oauth-start (misma lógica de aislamiento de tenant, no duplicada)', () => {
    expect(indexSource).toMatch(/from ['"]\.\.\/mp-oauth-start\/lib\.ts['"]/);
    expect(indexSource).toMatch(/resolveBusinessForOAuth\(/);
  });
});

describe('mp-oauth-disconnect — elimina la conexión de forma segura e idempotente', () => {
  it('borra por business_id (nunca por un id de conexión que pudiera venir del cliente)', () => {
    expect(indexSource).toMatch(/\.from\('mp_connections'\)\s*\.delete\(\)\s*\.eq\('business_id', business\.id\)/s);
  });

  it('0 filas afectadas no es un error (idempotente)', () => {
    expect(indexSource).toMatch(/idempotente/i);
  });

  it('la respuesta exitosa es mínima ({connected:false}), nunca datos de la conexión eliminada', () => {
    expect(indexSource).toMatch(/jsonResponse\(\{ connected: false \}, 200\)/);
  });
});

describe('mp-oauth-disconnect — alineado con la arquitectura de publishable key', () => {
  it('no lee SUPABASE_ANON_KEY directamente -- usa el helper compartido', () => {
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]SUPABASE_ANON_KEY['"]\)/);
    expect(indexSource).toMatch(/import \{ getSupabasePublishableKeyOrEmpty \} from ['"]\.\.\/_shared\/supabasePublishableKey\.ts['"]/);
    expect(indexSource).toMatch(/getSupabasePublishableKeyOrEmpty\(\)/);
  });

  it('la client key resuelta solo se usa como 2º argumento de createClient(), nunca como Authorization', () => {
    expect(indexSource).toMatch(/createClient\(supabaseUrl, anonKey, \{/);
    expect(indexSource).not.toMatch(/Authorization:\s*`Bearer \$\{anonKey\}`/);
  });

  it('el JWT real del caller (authHeader) sigue siendo lo único que va en Authorization', () => {
    expect(indexSource).toMatch(/Authorization: authHeader/);
  });
});
