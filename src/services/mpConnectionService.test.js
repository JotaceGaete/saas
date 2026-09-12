import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
// Vite `?raw` import: contenido crudo del archivo como string, sin resolver
// módulos -- evita depender de fs/import.meta.url bajo el transform de Vitest.
import mpConnectionServiceSource from './mpConnectionService.js?raw';

const rpcMock = vi.fn();
const getSessionMock = vi.fn();
const refreshSessionMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    auth: {
      getSession: (...args) => getSessionMock(...args),
      refreshSession: (...args) => refreshSessionMock(...args),
    },
  },
}));

import {
  getMercadoPagoConnectionStatus, startMercadoPagoOAuth, disconnectMercadoPago, fetchMercadoPagoPointTerminals,
} from './mpConnectionService';

let assignMock;

beforeEach(() => {
  rpcMock.mockReset();
  getSessionMock.mockReset();
  refreshSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: 'valid.jwt.token' } }, error: null });
  global.fetch = vi.fn();

  // jsdom no permite redefinir window.location.assign vía vi.spyOn directamente
  // (getter no configurable) -- se reemplaza window.location entero por test.
  assignMock = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: assignMock },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getMercadoPagoConnectionStatus', () => {
  it('llama a la RPC wa_get_my_mp_connection_status sin parámetros (deriva el negocio de auth.uid() server-side)', async () => {
    rpcMock.mockResolvedValue({ data: { connected: false, status: 'disconnected' }, error: null });
    await getMercadoPagoConnectionStatus();
    expect(rpcMock).toHaveBeenCalledWith('wa_get_my_mp_connection_status');
  });

  it('devuelve el payload tal cual cuando está conectado', async () => {
    const payload = { connected: true, status: 'connected', providerUserId: '123', connectedAt: '2026-09-07T00:00:00Z', liveMode: true };
    rpcMock.mockResolvedValue({ data: payload, error: null });
    const result = await getMercadoPagoConnectionStatus();
    expect(result).toEqual({ data: payload, error: null });
  });

  it('propaga el error de transporte de la RPC sin intentar leer la tabla directamente', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await getMercadoPagoConnectionStatus();
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

describe('startMercadoPagoOAuth', () => {
  it('sin sesión válida, no llama a fetch y devuelve error', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    const result = await startMercadoPagoOAuth();
    expect(result.error).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('con sesión válida, hace POST a mp-oauth-start con el Bearer token y navega a authorizationUrl', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ authorizationUrl: 'https://auth.mercadopago.com/authorization?state=abc' }),
    });

    const result = await startMercadoPagoOAuth();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/functions/v1/mp-oauth-start');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer valid.jwt.token');
    expect(assignMock).toHaveBeenCalledWith('https://auth.mercadopago.com/authorization?state=abc');
    expect(result.error).toBeNull();
  });

  it('si la respuesta no trae authorizationUrl, no navega y devuelve error', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const result = await startMercadoPagoOAuth();

    expect(assignMock).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('si el servidor responde error HTTP, no navega y devuelve error', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Forbidden', reason: 'ownership_mismatch' }) });

    const result = await startMercadoPagoOAuth();

    expect(assignMock).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('nunca envía un businessId propio en el body — no hay forma de que el frontend elija el tenant', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ authorizationUrl: 'https://x' }) });

    await startMercadoPagoOAuth();

    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody).not.toHaveProperty('businessId');
    expect(Object.keys(sentBody)).toEqual([]);
  });
});

describe('fetchMercadoPagoPointTerminals — MP-POINT-0', () => {
  it('hace POST a mp-point-terminals con el Bearer token', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, terminals: [], total: 0 }) });

    await fetchMercadoPagoPointTerminals();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/functions/v1/mp-point-terminals');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer valid.jwt.token');
  });

  it('sin sesión válida, no llama a fetch', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    const result = await fetchMercadoPagoPointTerminals();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it('lista vacía (cuenta sin terminales)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, terminals: [], total: 0 }) });
    const result = await fetchMercadoPagoPointTerminals();
    expect(result.data).toEqual({ terminals: [], total: 0 });
    expect(result.error).toBeNull();
  });

  it('una terminal STANDALONE', async () => {
    const terminal = { id: 'STANDALONE_1', posId: null, storeId: null, externalPosId: null, operatingMode: 'STANDALONE' };
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, terminals: [terminal], total: 1 }) });
    const result = await fetchMercadoPagoPointTerminals();
    expect(result.data.terminals).toEqual([terminal]);
  });

  it('una terminal PDV con store_id/pos_id', async () => {
    const terminal = { id: 'PAX_A910__X', posId: '111', storeId: '222', externalPosId: 'CAJA1', operatingMode: 'PDV' };
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, terminals: [terminal], total: 1 }) });
    const result = await fetchMercadoPagoPointTerminals();
    expect(result.data.terminals).toEqual([terminal]);
  });

  it('token inválido/vencido propaga el reason MP_CONNECTION_EXPIRED', async () => {
    global.fetch.mockResolvedValue({
      ok: false, status: 409, json: async () => ({ error: 'La conexión de Mercado Pago expiró.', reason: 'MP_CONNECTION_EXPIRED' }),
    });
    const result = await fetchMercadoPagoPointTerminals();
    expect(result.data).toBeNull();
    expect(result.error.reason).toBe('MP_CONNECTION_EXPIRED');
  });

  it('error de API de Mercado Pago propaga el reason MP_UNEXPECTED_ERROR', async () => {
    global.fetch.mockResolvedValue({
      ok: false, status: 502, json: async () => ({ error: 'Mercado Pago devolvió un error inesperado.', reason: 'MP_UNEXPECTED_ERROR' }),
    });
    const result = await fetchMercadoPagoPointTerminals();
    expect(result.error.reason).toBe('MP_UNEXPECTED_ERROR');
  });

  it('nunca envía un businessId propio en el body', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, terminals: [], total: 0 }) });
    await fetchMercadoPagoPointTerminals();
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).not.toHaveProperty('businessId');
  });

  it('cuenta sin conexión MP propaga el reason MP_NOT_CONNECTED', async () => {
    global.fetch.mockResolvedValue({
      ok: false, status: 409, json: async () => ({ error: 'Este negocio no tiene Mercado Pago conectado', reason: 'MP_NOT_CONNECTED' }),
    });
    const result = await fetchMercadoPagoPointTerminals();
    expect(result.data).toBeNull();
    expect(result.error.reason).toBe('MP_NOT_CONNECTED');
  });
});

describe('disconnectMercadoPago', () => {
  it('hace POST a mp-oauth-disconnect con el Bearer token', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ connected: false }) });

    const result = await disconnectMercadoPago();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/functions/v1/mp-oauth-disconnect');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer valid.jwt.token');
    expect(result).toEqual({ data: { connected: false }, error: null });
  });

  it('propaga error HTTP', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    const result = await disconnectMercadoPago();
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('sin sesión válida, no llama a fetch', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    await disconnectMercadoPago();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('acceso directo a la tabla mp_connections', () => {
  it('el código fuente de este servicio NUNCA hace supabase.from(\'mp_connections\')', () => {
    expect(mpConnectionServiceSource).not.toMatch(/\.from\(\s*['"]mp_connections['"]/);
  });
});

describe('mpConnectionService — alineado con la arquitectura de publishable key', () => {
  it('no lee VITE_SUPABASE_ANON_KEY directamente -- reutiliza el resolver de FASE A', () => {
    expect(mpConnectionServiceSource).not.toMatch(/import\.meta\.env\?\.VITE_SUPABASE_ANON_KEY/);
    expect(mpConnectionServiceSource).toMatch(/import \{ getSupabasePublishableKey \} from ['"]\.\.\/lib\/supabasePublishableKey['"]/);
    expect(mpConnectionServiceSource).toMatch(/getSupabasePublishableKey\(\)/);
  });

  it('la client key resuelta solo se usa como header apikey, nunca como Authorization', () => {
    expect(mpConnectionServiceSource).toMatch(/apikey: ANON_KEY/);
    expect(mpConnectionServiceSource).not.toMatch(/Authorization:\s*`Bearer \$\{ANON_KEY\}`/);
  });

  it('el JWT real de sesión (token) sigue siendo lo único que va en Authorization', () => {
    expect(mpConnectionServiceSource).toMatch(/Authorization: `Bearer \$\{token\}`/);
  });
});
