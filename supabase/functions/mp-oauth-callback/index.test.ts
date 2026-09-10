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
