/**
 * mpOauthCredentials — batería de tests unitarios.
 * Ejecutar: npx vitest run supabase/functions/_shared/mpOauthCredentials.test.ts
 *
 * Testea únicamente normalizeMpOauthCountry() y resolveMpOauthCredentials()
 * (lógica pura) -- nunca getMpOauthCredentials() (toca Deno.env, no existe
 * en Vitest/Node). Todos los valores usados son strings ficticios, nunca
 * credenciales reales.
 */
import { describe, it, expect } from 'vitest';
import { normalizeMpOauthCountry, resolveMpOauthCredentials } from './mpOauthCredentials';
import mpOauthCredentialsSource from './mpOauthCredentials.ts?raw';

const FAKE_CLIENT_ID_CL = 'CL-app-id-123';
const FAKE_CLIENT_SECRET_CL = 'CL-secret-abc';
const FAKE_CLIENT_ID_AR = 'AR-app-id-456';
const FAKE_CLIENT_SECRET_AR = 'AR-secret-def';

const FULL_ENV = {
  clientIdCl: FAKE_CLIENT_ID_CL,
  clientSecretCl: FAKE_CLIENT_SECRET_CL,
  clientIdAr: FAKE_CLIENT_ID_AR,
  clientSecretAr: FAKE_CLIENT_SECRET_AR,
};

const EMPTY_ENV = { clientIdCl: undefined, clientSecretCl: undefined, clientIdAr: undefined, clientSecretAr: undefined };

describe('normalizeMpOauthCountry', () => {
  it('acepta CL y AR (mayúsculas, tal cual)', () => {
    expect(normalizeMpOauthCountry('CL')).toBe('CL');
    expect(normalizeMpOauthCountry('AR')).toBe('AR');
  });

  it('normaliza minúsculas y espacios', () => {
    expect(normalizeMpOauthCountry(' cl ')).toBe('CL');
    expect(normalizeMpOauthCountry('ar')).toBe('AR');
  });

  it('rechaza cualquier otro país soportado por el resto de la plataforma (no es fuzzy)', () => {
    expect(normalizeMpOauthCountry('MX')).toBeNull();
    expect(normalizeMpOauthCountry('PE')).toBeNull();
    expect(normalizeMpOauthCountry('BR')).toBeNull();
    expect(normalizeMpOauthCountry('UY')).toBeNull();
  });

  it('rechaza texto libre tipo wa_businesses.country ("Chile", "Argentina") -- sin fuzzy matching', () => {
    expect(normalizeMpOauthCountry('Chile')).toBeNull();
    expect(normalizeMpOauthCountry('Argentina')).toBeNull();
    expect(normalizeMpOauthCountry('CHILE')).toBeNull();
  });

  it('rechaza null/undefined/vacío', () => {
    expect(normalizeMpOauthCountry(null)).toBeNull();
    expect(normalizeMpOauthCountry(undefined)).toBeNull();
    expect(normalizeMpOauthCountry('')).toBeNull();
    expect(normalizeMpOauthCountry('   ')).toBeNull();
  });
});

describe('resolveMpOauthCredentials — CL', () => {
  it('devuelve las credenciales CL cuando country_code=CL y ambas variables CL están configuradas', () => {
    const result = resolveMpOauthCredentials('CL', FULL_ENV);
    expect(result).toEqual({
      ok: true,
      credentials: { countryCode: 'CL', clientId: FAKE_CLIENT_ID_CL, clientSecret: FAKE_CLIENT_SECRET_CL },
    });
  });

  it('nunca devuelve credenciales AR para un negocio CL, aunque AR esté configurado', () => {
    const result = resolveMpOauthCredentials('CL', FULL_ENV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credentials.clientId).not.toBe(FAKE_CLIENT_ID_AR);
      expect(result.credentials.clientSecret).not.toBe(FAKE_CLIENT_SECRET_AR);
    }
  });
});

describe('resolveMpOauthCredentials — AR', () => {
  it('devuelve las credenciales AR cuando country_code=AR y ambas variables AR están configuradas', () => {
    const result = resolveMpOauthCredentials('AR', FULL_ENV);
    expect(result).toEqual({
      ok: true,
      credentials: { countryCode: 'AR', clientId: FAKE_CLIENT_ID_AR, clientSecret: FAKE_CLIENT_SECRET_AR },
    });
  });

  it('nunca devuelve credenciales CL para un negocio AR, aunque CL esté configurado', () => {
    const result = resolveMpOauthCredentials('AR', FULL_ENV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credentials.clientId).not.toBe(FAKE_CLIENT_ID_CL);
      expect(result.credentials.clientSecret).not.toBe(FAKE_CLIENT_SECRET_CL);
    }
  });
});

describe('resolveMpOauthCredentials — país no soportado', () => {
  it('country_code null/vacío -> unsupported_country, ninguna credencial expuesta', () => {
    expect(resolveMpOauthCredentials(null, FULL_ENV)).toEqual({ ok: false, reason: 'unsupported_country' });
    expect(resolveMpOauthCredentials('', FULL_ENV)).toEqual({ ok: false, reason: 'unsupported_country' });
  });

  it('country_code de un país real distinto de CL/AR -> unsupported_country', () => {
    expect(resolveMpOauthCredentials('MX', FULL_ENV)).toEqual({ ok: false, reason: 'unsupported_country' });
    expect(resolveMpOauthCredentials('PE', FULL_ENV)).toEqual({ ok: false, reason: 'unsupported_country' });
  });

  it('un payload manipulado con un país inventado tampoco selecciona CL ni AR', () => {
    const result = resolveMpOauthCredentials('XX', FULL_ENV);
    expect(result).toEqual({ ok: false, reason: 'unsupported_country' });
  });
});

describe('resolveMpOauthCredentials — país soportado pero mal configurado', () => {
  it('CL sin MP_CLIENT_ID_CL/MP_CLIENT_SECRET_CL -> country_not_configured, nunca cae a AR', () => {
    const result = resolveMpOauthCredentials('CL', EMPTY_ENV);
    expect(result).toEqual({ ok: false, reason: 'country_not_configured', countryCode: 'CL' });
  });

  it('AR sin MP_CLIENT_ID_AR/MP_CLIENT_SECRET_AR -> country_not_configured, nunca cae a CL', () => {
    const result = resolveMpOauthCredentials('AR', EMPTY_ENV);
    expect(result).toEqual({ ok: false, reason: 'country_not_configured', countryCode: 'AR' });
  });

  it('CL con solo clientId pero sin clientSecret -> country_not_configured (nunca token exchange sin secret)', () => {
    const result = resolveMpOauthCredentials('CL', { ...EMPTY_ENV, clientIdCl: FAKE_CLIENT_ID_CL });
    expect(result).toEqual({ ok: false, reason: 'country_not_configured', countryCode: 'CL' });
  });

  it('AR configurado no rescata a CL mal configurado (sin fallback cruzado)', () => {
    const result = resolveMpOauthCredentials('CL', { ...EMPTY_ENV, clientIdAr: FAKE_CLIENT_ID_AR, clientSecretAr: FAKE_CLIENT_SECRET_AR });
    expect(result).toEqual({ ok: false, reason: 'country_not_configured', countryCode: 'CL' });
  });
});

describe('mpOauthCredentials.ts — nunca loguea credenciales', () => {
  it('el código fuente no contiene ningún console.log/warn/error que referencie clientId/clientSecret', () => {
    expect(mpOauthCredentialsSource).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*client(Id|Secret)/);
  });
});
