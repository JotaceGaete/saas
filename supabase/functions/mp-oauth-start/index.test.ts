/**
 * mp-oauth-start/index.ts — tests estáticos (source-scan) de las
 * invariantes de seguridad que lib.test.ts no puede cubrir (index.ts toca
 * Deno.serve/Deno.env a nivel de módulo, así que no se importa/ejecuta
 * directamente en Vitest).
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.ts?raw';

describe('mp-oauth-start — requiere usuario autenticado', () => {
  it('rechaza sin header Authorization antes de tocar el body o la DB', () => {
    expect(indexSource).toMatch(/authHeader.*startsWith\(['"]bearer ['"]\)/is);
    expect(indexSource).toMatch(/User not authenticated/);
  });

  it('valida el JWT real vía auth.getUser() antes de resolver el negocio', () => {
    expect(indexSource).toMatch(/userClient\.auth\.getUser\(\)/);
  });
});

describe('mp-oauth-start — negocio derivado exclusivamente de auth.uid()', () => {
  it('ignora explícitamente cualquier businessId recibido en el body', () => {
    expect(indexSource).toMatch(/businessId en body IGNORADO/);
    expect(indexSource).toMatch(/\.eq\('user_id', user\.id\)/);
  });

  it('usa resolveBusinessForOAuth (aislamiento de tenant) en vez de confiar en el body', () => {
    expect(indexSource).toMatch(/resolveBusinessForOAuth\(/);
  });
});

describe('mp-oauth-start — nunca expone secretos', () => {
  it('la respuesta exitosa solo contiene authorizationUrl', () => {
    expect(indexSource).toMatch(/jsonResponse\(\{ authorizationUrl \}, 200\)/);
  });

  it('nunca devuelve ni loguea codeVerifier ni tokens (solo prosa explicando la garantía)', () => {
    expect(indexSource).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*codeVerifier/);
    // mp-oauth-start no maneja client_secret/access_token en absoluto (eso
    // es mp-oauth-callback) -- confirmar que no aparecen como identificador
    // de código (declaración/uso), solo permitido en comentarios de prosa.
    expect(indexSource).not.toMatch(/\bclient_secret\s*[:=]/);
    expect(indexSource).not.toMatch(/\baccess_token\s*[:=]/);
  });
});
