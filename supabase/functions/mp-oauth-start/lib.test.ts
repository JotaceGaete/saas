/**
 * mp-oauth-start — batería de tests unitarios
 * Ejecutar: npx vitest run supabase/functions/mp-oauth-start/lib.test.ts
 *
 * Cubre (ver mapeo con la sección 12 del ticket MP-OAUTH-1):
 *   A. generación de state fuerte / PKCE S256 / URL de autorización
 *   C. aislamiento de tenant: business_id del cliente nunca se usa
 */

import { describe, it, expect } from 'vitest';
import {
  generateCodeVerifier,
  generateState,
  generateCodeChallenge,
  hashState,
  buildAuthorizationUrl,
  resolveBusinessForOAuth,
} from './lib';

describe('generateCodeVerifier / generateState', () => {
  it('genera un code_verifier dentro del rango de largo de RFC 7636 (43-128)', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it('el code_verifier usa solo caracteres unreserved de RFC 7636 (base64url sin padding)', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('genera un state y un code_verifier distintos en cada llamada (alta entropía, no determinista)', () => {
    const states = new Set(Array.from({ length: 20 }, () => generateState()));
    const verifiers = new Set(Array.from({ length: 20 }, () => generateCodeVerifier()));
    expect(states.size).toBe(20);
    expect(verifiers.size).toBe(20);
  });

  it('state y code_verifier son valores independientes (no el mismo generador reusado)', () => {
    const state = generateState();
    const verifier = generateCodeVerifier();
    expect(state).not.toBe(verifier);
  });
});

describe('generateCodeChallenge (PKCE S256)', () => {
  it('es determinista: el mismo code_verifier siempre produce el mismo code_challenge', async () => {
    const verifier = generateCodeVerifier();
    const a = await generateCodeChallenge(verifier);
    const b = await generateCodeChallenge(verifier);
    expect(a).toBe(b);
  });

  it('produce un valor distinto para verifiers distintos', async () => {
    const a = await generateCodeChallenge(generateCodeVerifier());
    const b = await generateCodeChallenge(generateCodeVerifier());
    expect(a).not.toBe(b);
  });

  it('el resultado es base64url (sin +, /, =) — formato exigido por RFC 7636', async () => {
    const challenge = await generateCodeChallenge(generateCodeVerifier());
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('coincide con el valor de referencia conocido de RFC 7636 (verifier de ejemplo del RFC)', async () => {
    // Vector de la propia RFC 7636 (Apéndice B): verifica que S256 esté
    // implementado correctamente, no solo que "produzca algo".
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('hashState', () => {
  it('es determinista y en hexadecimal', async () => {
    const state = generateState();
    const a = await hashState(state);
    const b = await hashState(state);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('states distintos producen hashes distintos', async () => {
    const a = await hashState(generateState());
    const b = await hashState(generateState());
    expect(a).not.toBe(b);
  });
});

describe('buildAuthorizationUrl', () => {
  const base = {
    authBaseUrl: 'https://auth.mercadopago.com/authorization',
    clientId: 'APP_ID_123',
    redirectUri: 'https://xyz.supabase.co/functions/v1/mp-oauth-callback',
    state: 'state-abc',
    codeChallenge: 'challenge-xyz',
  };

  it('incluye exactamente los 6 parámetros documentados por Mercado Pago, sin extras', () => {
    const url = new URL(buildAuthorizationUrl(base));
    expect(url.origin + url.pathname).toBe(base.authBaseUrl);
    expect(Array.from(url.searchParams.keys()).sort()).toEqual(
      ['client_id', 'code_challenge', 'code_challenge_method', 'redirect_uri', 'response_type', 'state'].sort(),
    );
  });

  it('response_type=code y code_challenge_method=S256 siempre', () => {
    const url = new URL(buildAuthorizationUrl(base));
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('propaga client_id, redirect_uri, state y code_challenge tal cual', () => {
    const url = new URL(buildAuthorizationUrl(base));
    expect(url.searchParams.get('client_id')).toBe(base.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(base.redirectUri);
    expect(url.searchParams.get('state')).toBe(base.state);
    expect(url.searchParams.get('code_challenge')).toBe(base.codeChallenge);
  });

  it('nunca incluye client_secret ni code_verifier en la URL de autorización', () => {
    const url = buildAuthorizationUrl(base);
    expect(url).not.toContain('client_secret');
    expect(url).not.toContain('code_verifier');
  });
});

describe('resolveBusinessForOAuth — tenant isolation', () => {
  it('resuelve el único negocio cuando hay exactamente uno', () => {
    const result = resolveBusinessForOAuth([{ id: 'biz-1', user_id: 'user-A' }], 'user-A');
    expect(result).toEqual({ ok: true, business: { id: 'biz-1', user_id: 'user-A' } });
  });

  it('rechaza cuando el usuario no tiene ningún negocio', () => {
    const result = resolveBusinessForOAuth([], 'user-A');
    expect(result).toEqual({ ok: false, reason: 'no_business' });
  });

  it('rechaza cuando el usuario tiene más de un negocio (ambigüedad, no elige uno arbitrario)', () => {
    const result = resolveBusinessForOAuth(
      [
        { id: 'biz-1', user_id: 'user-A' },
        { id: 'biz-2', user_id: 'user-A' },
      ],
      'user-A',
    );
    expect(result).toEqual({ ok: false, reason: 'multiple_businesses' });
  });

  it('rechaza si el negocio resuelto no pertenece al usuario autenticado (defensa redundante)', () => {
    const result = resolveBusinessForOAuth([{ id: 'biz-1', user_id: 'user-B' }], 'user-A');
    expect(result).toEqual({ ok: false, reason: 'ownership_mismatch' });
  });

  it('un business_id enviado por el cliente NO permite elegir el negocio de otro tenant: la función no tiene parámetro para eso', () => {
    // Simula exactamente lo que hace index.ts: `businesses` viene de
    // `adminClient.from('wa_businesses').select('id, user_id').eq('user_id', user.id)`,
    // es decir, ya viene filtrado por el auth.uid() real -- nunca por lo
    // que el cliente haya mandado en el body. Aunque un atacante mande
    // `{ businessId: 'biz-del-negocio-ajeno' }` en el body, esta función
    // ni siquiera acepta ese valor como argumento: es estructuralmente
    // imposible que influya en el resultado.
    const attackerSuppliedBusinessId = 'biz-del-negocio-ajeno';
    const businessesFilteredByAuthUid = [{ id: 'biz-propio', user_id: 'user-A' }];

    const result = resolveBusinessForOAuth(businessesFilteredByAuthUid, 'user-A');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.business.id).toBe('biz-propio');
      expect(result.business.id).not.toBe(attackerSuppliedBusinessId);
    }
    // Prueba estructural: la función solo declara 2 parámetros (businesses, authenticatedUserId).
    expect(resolveBusinessForOAuth.length).toBe(2);
  });
});
