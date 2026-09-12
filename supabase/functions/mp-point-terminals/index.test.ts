/**
 * mp-point-terminals/index.ts — tests estáticos (source-scan), mismo
 * criterio que mp-oauth-disconnect/index.test.ts (Deno no está
 * disponible en `npx vitest run`).
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.ts?raw';

describe('mp-point-terminals — requiere usuario autenticado (mismo patrón que mp-oauth-disconnect)', () => {
  it('rechaza sin header Authorization', () => {
    expect(indexSource).toMatch(/authHeader.*startsWith\(['"]bearer ['"]\)/is);
    expect(indexSource).toMatch(/User not authenticated/);
  });

  it('valida el JWT real vía auth.getUser()', () => {
    expect(indexSource).toMatch(/userClient\.auth\.getUser\(\)/);
  });
});

describe('mp-point-terminals — negocio derivado exclusivamente de auth.uid()', () => {
  it('ignora explícitamente cualquier businessId recibido en el body', () => {
    expect(indexSource).toMatch(/businessId en body IGNORADO/);
  });

  it('reutiliza resolveBusinessForOAuth de mp-oauth-start (no duplica la lógica de aislamiento de tenant)', () => {
    expect(indexSource).toMatch(/from ['"]\.\.\/mp-oauth-start\/lib\.ts['"]/);
    expect(indexSource).toMatch(/resolveBusinessForOAuth\(/);
  });
});

describe('mp-point-terminals — reutiliza el flujo OAuth existente, no crea uno nuevo', () => {
  it('usa wa_get_mp_connection_for_checkout (ya existente de MP-CHECKOUT-1) -- ninguna RPC/migración nueva', () => {
    expect(indexSource).toMatch(/adminClient\.rpc\(['"]wa_get_mp_connection_for_checkout['"]/);
  });

  it('reutiliza isTokenExpired de create-merchant-mp-checkout/lib.ts en vez de reimplementarlo', () => {
    expect(indexSource).toMatch(/from ['"]\.\.\/create-merchant-mp-checkout\/lib\.ts['"]/);
    expect(indexSource).toMatch(/isTokenExpired\(/);
  });

  it('sin conexión, devuelve MP_NOT_CONNECTED antes de llegar a llamar a Mercado Pago', () => {
    const notConnectedIdx = indexSource.indexOf('MP_NOT_CONNECTED');
    const fetchIdx = indexSource.indexOf('await fetch(MP_TERMINALS_URL');
    expect(notConnectedIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(notConnectedIdx);
  });

  it('token vencido (chequeo local) nunca llega a llamar a Mercado Pago', () => {
    const expiredCheckIdx = indexSource.indexOf('isTokenExpired(');
    const fetchIdx = indexSource.indexOf('await fetch(MP_TERMINALS_URL');
    expect(expiredCheckIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(expiredCheckIdx);
  });
});

describe('mp-point-terminals — el access_token nunca sale de esta función', () => {
  it('el token solo se usa en el header Authorization del fetch a Mercado Pago', () => {
    expect(indexSource).toMatch(/Authorization: `Bearer \$\{mpAccessToken\}`/);
  });

  it('la respuesta exitosa nunca incluye el access_token ni la conexión completa', () => {
    const returnMatch = indexSource.match(/jsonResponse\(\{ ok: true,[^}]*\}, 200\);/);
    expect(returnMatch).not.toBeNull();
    expect(returnMatch[0]).not.toMatch(/access_token|mpAccessToken|connection/);
  });

  it('ningún console.log/error incluye mpAccessToken', () => {
    const consoleCalls = indexSource.match(/console\.(log|error|warn)\([^;]*\);/gs) || [];
    for (const call of consoleCalls) {
      expect(call).not.toMatch(/mpAccessToken/);
    }
  });
});

describe('mp-point-terminals — maneja los errores pedidos de forma comprensible, sin loguear secretos', () => {
  it('MP responde 401 -> MP_TOKEN_REJECTED (nunca expone el token en el mensaje)', () => {
    expect(indexSource).toMatch(/mpRes\.status === 401/);
    expect(indexSource).toMatch(/MP_TOKEN_REJECTED/);
  });

  it('MP responde 403 -> MP_FORBIDDEN', () => {
    expect(indexSource).toMatch(/mpRes\.status === 403/);
    expect(indexSource).toMatch(/MP_FORBIDDEN/);
  });

  it('cualquier otro error HTTP de MP -> MP_UNEXPECTED_ERROR', () => {
    expect(indexSource).toMatch(/MP_UNEXPECTED_ERROR/);
  });

  it('respuesta que no es JSON válido -> MP_UNEXPECTED_RESPONSE, no lanza', () => {
    expect(indexSource).toMatch(/MP_UNEXPECTED_RESPONSE/);
  });

  it('fallo de red al llamar a Mercado Pago -> MP_REQUEST_FAILED', () => {
    expect(indexSource).toMatch(/catch \(err\) \{[\s\S]*?MP_REQUEST_FAILED/);
  });
});

describe('mp-point-terminals — diagnóstico estructural (MP-POINT-0)', () => {
  it('loguea las claves de nivel superior de la respuesta real de MP para confirmar su forma exacta', () => {
    expect(indexSource).toMatch(/topLevelKeys/);
    expect(indexSource).toMatch(/console\.log\('\[mp-point-terminals\] respuesta estructural de MP/);
  });

  it('usa parseTerminalsListResponse (lib.ts) para construir la respuesta segura, no arma el DTO a mano acá', () => {
    expect(indexSource).toMatch(/import \{ parseTerminalsListResponse \} from ['"]\.\/lib\.ts['"]/);
    expect(indexSource).toMatch(/parseTerminalsListResponse\(parsedBody\)/);
  });
});

describe('mp-point-terminals — alcance: no crea órdenes, no cambia operating_mode, no cobra', () => {
  it('nunca hace POST/PUT a operating_mode ni a ningún endpoint de creación de terminal', () => {
    expect(indexSource.toLowerCase()).not.toContain('operating_mode":');
    expect(indexSource).not.toMatch(/method:\s*['"]PUT['"]/);
    expect(indexSource).not.toMatch(/\/terminals\/v1\/[^l]/); // solo .../v1/list
  });

  it('nunca llama a checkout/preferences ni crea wa_orders/crm_invoices', () => {
    expect(indexSource).not.toMatch(/checkout\/preferences/);
    expect(indexSource).not.toMatch(/wa_orders|crm_invoices|wa_create_merchant_checkout_order/);
  });
});

describe('mp-point-terminals — alineado con la arquitectura de publishable key', () => {
  it('no lee SUPABASE_ANON_KEY directamente -- usa el helper compartido', () => {
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]SUPABASE_ANON_KEY['"]\)/);
    expect(indexSource).toMatch(/import \{ getSupabasePublishableKeyOrEmpty \} from ['"]\.\.\/_shared\/supabasePublishableKey\.ts['"]/);
  });

  it('el JWT real del caller (authHeader) sigue siendo lo único que va en Authorization del userClient', () => {
    expect(indexSource).toMatch(/Authorization: authHeader/);
  });
});
