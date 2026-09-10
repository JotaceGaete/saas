/**
 * mp-oauth-callback/index.ts — tests estáticos (source-scan) de las
 * invariantes de seguridad que lib.test.ts no puede cubrir: el
 * consumo atómico del state y el tratamiento uniforme de
 * inválido/expirado/reutilizado dependen de la RPC en Postgres
 * (wa_consume_mp_oauth_state), no reproducibles sin una DB real -- ver
 * migración para su validación (dry-run + comentarios in-line).
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.ts?raw';

describe('mp-oauth-callback — state inválido/expirado/reutilizado se tratan igual', () => {
  it('un único branch maneja los 3 casos, sin distinguir la razón al cliente', () => {
    expect(indexSource).toMatch(/if \(!consumed\)/);
    expect(indexSource).toMatch(/inexistente \/ expirado \/ ya consumido/);
  });

  it('consume el state vía la RPC atómica antes de intercambiar el code', () => {
    expect(indexSource).toMatch(/wa_consume_mp_oauth_state/);
  });
});

describe('mp-oauth-callback — nunca expone tokens al browser', () => {
  it('toda respuesta es un redirect 302, nunca un body con datos de MP', () => {
    expect(indexSource).toMatch(/status: 302/);
    expect(indexSource).not.toMatch(/jsonResponse/);
  });

  it('usa buildCallbackRedirectUrl para las 2 salidas posibles (connected/error)', () => {
    expect(indexSource.match(/buildCallbackRedirectUrl\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('mp-oauth-callback — credenciales MP enrutadas por país (CL/AR)', () => {
  it('resuelve las credenciales vía getMpOauthCredentials(country_code del negocio), nunca lee MP_CLIENT_ID/MP_CLIENT_SECRET directo', () => {
    expect(indexSource).toMatch(/import \{ getMpOauthCredentials \} from ['"]\.\.\/_shared\/mpOauthCredentials\.ts['"]/);
    expect(indexSource).toMatch(/getMpOauthCredentials\(bizRow\?\.country_code/);
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]MP_CLIENT_ID['"]\)/);
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]MP_CLIENT_SECRET['"]\)/);
  });

  it('el país se deriva del business_id recuperado del state consumido, nunca de un parámetro del browser', () => {
    expect(indexSource).toMatch(/\.from\('wa_businesses'\)\s*\n\s*\.select\('country_code'\)\s*\n\s*\.eq\('id', businessId\)/);
    expect(indexSource).not.toMatch(/reqUrl\.searchParams\.get\(['"]country/);
  });

  it('la resolución de país ocurre DESPUÉS de consumir el state y ANTES del intercambio de tokens', () => {
    const consumeIdx = indexSource.indexOf('wa_consume_mp_oauth_state');
    const credIdx = indexSource.indexOf('getMpOauthCredentials(bizRow');
    const tokenIdx = indexSource.indexOf('const tokenBody = buildTokenExchangeBody(');
    expect(consumeIdx).toBeGreaterThan(-1);
    expect(credIdx).toBeGreaterThan(-1);
    expect(tokenIdx).toBeGreaterThan(-1);
    expect(consumeIdx).toBeLessThan(credIdx);
    expect(credIdx).toBeLessThan(tokenIdx);
  });

  it('país no soportado/no configurado redirige con status error igual que cualquier otro fallo (sin distinguir la razón al browser)', () => {
    const failBlockMatch = indexSource.match(/if \(!credentialsResult\.ok\) \{[\s\S]*?\n  \}/);
    expect(failBlockMatch).not.toBeNull();
    expect(failBlockMatch![0]).toMatch(/status: 'error'/);
  });

  it('nunca loguea clientId/clientSecret -- solo businessId y el reason interno', () => {
    expect(indexSource).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*client(Id|Secret)/);
  });
});

describe('mp-oauth-callback — no logueo de secretos', () => {
  it('nunca loguea el code_verifier, el access_token/refresh_token ni el body completo de error de MP', () => {
    expect(indexSource).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*codeVerifier/);
    expect(indexSource).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*mpBodyText/);
    expect(indexSource).toMatch(/nunca el body completo/);
  });

  it('el cifrado ocurre dentro de la RPC wa_upsert_mp_connection, nunca en este archivo', () => {
    expect(indexSource).toMatch(/wa_upsert_mp_connection/);
    expect(indexSource).not.toMatch(/pgp_sym_encrypt|pgp_sym_decrypt/);
  });
});
