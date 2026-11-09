import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const session = { access_token: 'token-propietario' };
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session } })) } },
}));

import {
  connectFiscal,
  getFiscalConnection,
  disconnectFiscal,
  describeFiscalError,
  FiscalConnectionError,
} from './fiscalConnectionService';

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const API_KEY = 'dtc_live_EXAMPLE_KEY_0123456789abcdef';
const CONNECTED = { connected: true, issuerRut: '12345678-5', enabled: false, verified: false, keyVersion: 1, updatedAt: null };

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('fiscalConnectionService', () => {
  let fetchMock;
  let logSpy;

  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse(200, { connection: CONNECTED }));
    vi.stubGlobal('fetch', fetchMock);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('la clave viaja solo en el cuerpo POST, nunca en la URL ni en los encabezados de consulta', async () => {
    await connectFiscal(BIZ, { issuerRut: '12345678-5', apiKey: API_KEY });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain(API_KEY);
    expect(url).toContain(`businessId=${BIZ}`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ action: 'connect', issuerRut: '12345678-5', apiKey: API_KEY });
    expect(init.cache).toBe('no-store');
  });

  it('nunca registra la clave en consola, ni al conectar ni al fallar', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'INVALID_RUT' }));
    await expect(connectFiscal(BIZ, { issuerRut: '76123456-7', apiKey: API_KEY })).rejects.toThrow();
    await connectFiscal(BIZ, { issuerRut: '12345678-5', apiKey: API_KEY });
    const logged = [...logSpy.mock.calls, ...console.error.mock.calls].flat().map(String).join(' ');
    expect(logged.includes(API_KEY)).toBe(false);
  });

  it('el estado devuelto no contiene la clave', async () => {
    const conn = await getFiscalConnection(BIZ);
    expect(JSON.stringify(conn).includes(API_KEY)).toBe(false);
    expect(conn).toEqual(CONNECTED);
  });

  it('desconectar envía solo la acción', async () => {
    await disconnectFiscal(BIZ);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ action: 'disconnect' });
  });

  it('sin sesión no llama al servidor', async () => {
    const { supabase } = await import('../lib/supabase');
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(getFiscalConnection(BIZ)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('traduce errores del servidor a códigos y mensajes estables', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'BUSINESS_NOT_AUTHORIZED' }));
    const err = await connectFiscal(BIZ, { issuerRut: '12345678-5', apiKey: API_KEY }).catch((e) => e);
    expect(err).toBeInstanceOf(FiscalConnectionError);
    expect(err.code).toBe('BUSINESS_NOT_AUTHORIZED');
    expect(describeFiscalError(err)).toMatch(/propietario/);
  });

  it('error de red: mensaje genérico, sin detalles del servidor', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch ' + API_KEY));
    const err = await getFiscalConnection(BIZ).catch((e) => e);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(describeFiscalError(err).includes(API_KEY)).toBe(false);
  });

  it('código desconocido cae en mensaje genérico', () => {
    expect(describeFiscalError(new FiscalConnectionError('WHATEVER'))).toMatch(/No pudimos guardar/);
    expect(describeFiscalError(new Error('boom'))).toMatch(/No pudimos guardar/);
  });
});
