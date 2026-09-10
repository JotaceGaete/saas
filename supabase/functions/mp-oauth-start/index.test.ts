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

describe('mp-oauth-start — credenciales MP enrutadas por país (CL/AR)', () => {
  it('resuelve las credenciales vía getMpOauthCredentials(business.country_code), nunca lee MP_CLIENT_ID/MP_CLIENT_SECRET directo', () => {
    expect(indexSource).toMatch(/import \{ getMpOauthCredentials \} from ['"]\.\.\/_shared\/mpOauthCredentials\.ts['"]/);
    expect(indexSource).toMatch(/getMpOauthCredentials\(business\.country_code\)/);
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]MP_CLIENT_ID['"]\)/);
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]MP_CLIENT_SECRET['"]\)/);
  });

  it('selecciona wa_businesses.country_code server-side, nunca acepta country del body', () => {
    expect(indexSource).toMatch(/\.select\('id, user_id, country_code'\)/);
    expect(indexSource).not.toMatch(/body\??\.\s*country/i);
  });

  it('país no soportado/no configurado responde 422 con reason MP_COUNTRY_NOT_SUPPORTED, sin crear state', () => {
    const failBlockMatch = indexSource.match(/if \(!credentialsResult\.ok\) \{[\s\S]*?\n  \}/);
    expect(failBlockMatch).not.toBeNull();
    const failBlock = failBlockMatch![0];
    expect(failBlock).toMatch(/MP_COUNTRY_NOT_SUPPORTED/);
    expect(failBlock).toMatch(/422/);
    expect(failBlock).not.toMatch(/wa_create_mp_oauth_state/);
  });

  it('la selección de credenciales ocurre ANTES de crear el state (wa_create_mp_oauth_state)', () => {
    const credIdx = indexSource.indexOf('getMpOauthCredentials(business.country_code)');
    const stateIdx = indexSource.indexOf('wa_create_mp_oauth_state');
    expect(credIdx).toBeGreaterThan(-1);
    expect(stateIdx).toBeGreaterThan(-1);
    expect(credIdx).toBeLessThan(stateIdx);
  });

  it('nunca loguea clientId/clientSecret -- solo businessId y el reason interno', () => {
    expect(indexSource).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*client(Id|Secret)/);
  });
});

describe('mp-oauth-start — alineado con la arquitectura de publishable key', () => {
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
