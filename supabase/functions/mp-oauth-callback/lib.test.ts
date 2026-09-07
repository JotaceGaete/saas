/**
 * mp-oauth-callback — batería de tests unitarios
 * Ejecutar: npx vitest run supabase/functions/mp-oauth-callback/lib.test.ts
 *
 * Cubre (ver mapeo con la sección 12 del ticket MP-OAUTH-1):
 *   B. construcción del intercambio de token / parseo de la respuesta de MP
 *   B. "el token de MP nunca aparece en redirect ni body público"
 */

import { describe, it, expect } from 'vitest';
import { hashState as hashStateInCallback, buildTokenExchangeBody, parseMpTokenResponse, buildCallbackRedirectUrl } from './lib';
import { generateState, hashState as hashStateInStart } from '../mp-oauth-start/lib';

describe('hashState — consistencia cruzada con mp-oauth-start', () => {
  it('produce el MISMO hash que mp-oauth-start/lib.ts para el mismo state (el lookup en mp_oauth_states depende de esto)', async () => {
    const state = generateState();
    const a = await hashStateInStart(state);
    const b = await hashStateInCallback(state);
    expect(a).toBe(b);
  });
});

describe('buildTokenExchangeBody', () => {
  const base = {
    clientId: 'APP_ID_123',
    clientSecret: 'SECRET_ABC',
    code: 'auth-code-xyz',
    redirectUri: 'https://xyz.supabase.co/functions/v1/mp-oauth-callback',
    codeVerifier: 'verifier-value',
  };

  it('incluye exactamente los 6 parámetros documentados por Mercado Pago, sin extras', () => {
    const body = buildTokenExchangeBody(base);
    expect(Object.keys(body).sort()).toEqual(
      ['client_id', 'client_secret', 'code', 'code_verifier', 'grant_type', 'redirect_uri'].sort(),
    );
  });

  it('grant_type es siempre authorization_code', () => {
    expect(buildTokenExchangeBody(base).grant_type).toBe('authorization_code');
  });

  it('propaga cada valor tal cual, sin transformarlo', () => {
    const body = buildTokenExchangeBody(base);
    expect(body.client_id).toBe(base.clientId);
    expect(body.client_secret).toBe(base.clientSecret);
    expect(body.code).toBe(base.code);
    expect(body.redirect_uri).toBe(base.redirectUri);
    expect(body.code_verifier).toBe(base.codeVerifier);
  });
});

describe('parseMpTokenResponse', () => {
  it('rechaza una respuesta sin access_token', () => {
    const result = parseMpTokenResponse({ token_type: 'bearer' });
    expect(result).toEqual({ ok: false, reason: 'missing_access_token' });
  });

  it('rechaza access_token vacío o no-string', () => {
    expect(parseMpTokenResponse({ access_token: '' }).ok).toBe(false);
    expect(parseMpTokenResponse({ access_token: 12345 as unknown as string }).ok).toBe(false);
  });

  it('parsea una respuesta completa tal como la documenta Mercado Pago', () => {
    const result = parseMpTokenResponse({
      access_token: 'APP_USR-token',
      refresh_token: 'TG-refresh',
      expires_in: 15768000,
      scope: 'read write',
      user_id: 123456789,
      live_mode: true,
    });
    expect(result).toEqual({
      ok: true,
      token: {
        accessToken: 'APP_USR-token',
        refreshToken: 'TG-refresh',
        expiresInSeconds: 15768000,
        scope: 'read write',
        providerUserId: '123456789',
        liveMode: true,
      },
    });
  });

  it('campos ausentes quedan en null -- nunca inventados (en particular live_mode)', () => {
    const result = parseMpTokenResponse({ access_token: 'APP_USR-token' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token.refreshToken).toBeNull();
      expect(result.token.expiresInSeconds).toBeNull();
      expect(result.token.scope).toBeNull();
      expect(result.token.providerUserId).toBeNull();
      expect(result.token.liveMode).toBeNull();
      // Explícito: si MP no manda live_mode, el resultado es null, NUNCA false.
      expect(result.token.liveMode).not.toBe(false);
    }
  });

  it('user_id numérico se normaliza a string (columna provider_user_id es TEXT)', () => {
    const result = parseMpTokenResponse({ access_token: 'tok', user_id: 987 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token.providerUserId).toBe('987');
  });
});

describe('buildCallbackRedirectUrl', () => {
  it('éxito: redirige a business-configuration con tab=mercadopago&mp=connected', () => {
    const url = new URL(buildCallbackRedirectUrl({ appReturnBaseUrl: 'https://go.ventalink.app', status: 'connected' }));
    expect(url.origin).toBe('https://go.ventalink.app');
    expect(url.pathname).toBe('/business-configuration');
    expect(url.searchParams.get('tab')).toBe('mercadopago');
    expect(url.searchParams.get('mp')).toBe('connected');
  });

  it('error: mismo path, mp=error', () => {
    const url = new URL(buildCallbackRedirectUrl({ appReturnBaseUrl: 'https://go.ventalink.app', status: 'error' }));
    expect(url.searchParams.get('mp')).toBe('error');
  });

  it('nunca incluye más de los 2 query params documentados (tab, mp)', () => {
    const url = new URL(buildCallbackRedirectUrl({ appReturnBaseUrl: 'https://go.ventalink.app', status: 'connected' }));
    expect(Array.from(url.searchParams.keys()).sort()).toEqual(['mp', 'tab']);
  });

  it('la función no tiene NINGÚN parámetro por el que un token/code/state pudiera colarse en la URL', () => {
    // Prueba estructural: buildCallbackRedirectUrl solo declara 1 parámetro
    // ({ appReturnBaseUrl, status }), sin campo para tokens/code/state --
    // es imposible que termine en la URL de retorno sin cambiar la firma.
    expect(buildCallbackRedirectUrl.length).toBe(1);
  });

  it('nunca aparece nada parecido a un token/secret en la URL resultante, incluso probando valores adversarios como baseUrl', () => {
    const suspicious = 'https://go.ventalink.app/?leak=APP_USR-1234567890abcdef';
    const url = buildCallbackRedirectUrl({ appReturnBaseUrl: suspicious, status: 'connected' });
    // El querystring de entrada NO se propaga -- new URL('/business-configuration', base) descarta el search del base.
    expect(url).not.toContain('leak=');
    expect(url).not.toContain('APP_USR-1234567890abcdef');
  });
});
