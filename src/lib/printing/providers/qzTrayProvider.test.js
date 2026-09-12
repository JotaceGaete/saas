import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// qzTrayProvider es la única capa que debe importar 'qz-tray' -- para
// probarla sin depender de una app QZ Tray real ni de un WebSocket
// verdadero, mockeamos el paquete completo.
const state = { active: false };
const qzMock = {
  websocket: {
    isActive: vi.fn(() => state.active),
    connect: vi.fn(() => { state.active = true; return Promise.resolve(); }),
    disconnect: vi.fn(() => { state.active = false; return Promise.resolve(); }),
  },
  printers: {
    find: vi.fn(() => Promise.resolve(['Impresora A', 'Impresora B'])),
  },
  configs: {
    create: vi.fn((printer, options) => ({ printer, options })),
  },
  print: vi.fn(() => Promise.resolve()),
  security: {
    setCertificatePromise: vi.fn(),
    setSignatureAlgorithm: vi.fn(),
    setSignaturePromise: vi.fn(),
  },
};

vi.mock('qz-tray', () => ({ default: qzMock }));

const getValidTokenMock = vi.fn();
vi.mock('lib/auth/getValidToken', () => ({ getValidToken: (...a) => getValidTokenMock(...a) }));

const getSupabasePublishableKeyMock = vi.fn();
vi.mock('lib/supabasePublishableKey', () => ({ getSupabasePublishableKey: (...a) => getSupabasePublishableKeyMock(...a) }));

const { qzTrayProvider } = await import('./qzTrayProvider');

// PRINT-3A configura seguridad (cert/algoritmo/firma) UNA sola vez, en el
// primer connect() de todo el módulo -- se dispara acá, de forma
// determinística, antes de cualquier test, así los tests de abajo pueden
// inspeccionar los args capturados sin depender del orden de ejecución.
vi.stubEnv('VITE_QZ_CERTIFICATE', '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----');
vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
getValidTokenMock.mockResolvedValue('token-inicial');
getSupabasePublishableKeyMock.mockReturnValue('anon-key-inicial');
await qzTrayProvider.connect();
qzMock.websocket.connect.mockClear();
state.active = false;

let consoleErrorSpy;

beforeEach(() => {
  state.active = false;
  Object.values(qzMock.websocket).forEach((fn) => fn.mockClear?.());
  qzMock.printers.find.mockClear();
  qzMock.configs.create.mockClear();
  qzMock.print.mockClear();
  getValidTokenMock.mockReset().mockResolvedValue('valid-token');
  getSupabasePublishableKeyMock.mockReset().mockReturnValue('anon-key');
  vi.stubGlobal('fetch', vi.fn());
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
});

describe('qzTrayProvider.isAvailable', () => {
  it('refleja qz.websocket.isActive()', () => {
    expect(qzTrayProvider.isAvailable()).toBe(false);
    state.active = true;
    expect(qzTrayProvider.isAvailable()).toBe(true);
  });
});

describe('qzTrayProvider.connect', () => {
  it('llama a qz.websocket.connect() si no hay conexión activa', async () => {
    await qzTrayProvider.connect();
    expect(qzMock.websocket.connect).toHaveBeenCalledTimes(1);
  });

  it('es idempotente: no vuelve a conectar si ya está activo', async () => {
    state.active = true;
    await qzTrayProvider.connect();
    expect(qzMock.websocket.connect).not.toHaveBeenCalled();
  });
});

describe('qzTrayProvider.disconnect', () => {
  it('llama a qz.websocket.disconnect() si hay conexión activa', async () => {
    state.active = true;
    await qzTrayProvider.disconnect();
    expect(qzMock.websocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('no hace nada si no hay conexión activa', async () => {
    await qzTrayProvider.disconnect();
    expect(qzMock.websocket.disconnect).not.toHaveBeenCalled();
  });
});

describe('qzTrayProvider.listPrinters', () => {
  it('conecta si hace falta y devuelve los nombres tal como los reporta QZ', async () => {
    const printers = await qzTrayProvider.listPrinters();
    expect(qzMock.websocket.connect).toHaveBeenCalledTimes(1);
    expect(printers).toEqual(['Impresora A', 'Impresora B']);
  });

  it('normaliza a array cuando QZ devuelve un único nombre (string)', async () => {
    qzMock.printers.find.mockResolvedValueOnce('Única impresora');
    const printers = await qzTrayProvider.listPrinters();
    expect(printers).toEqual(['Única impresora']);
  });
});

describe('qzTrayProvider.print', () => {
  it('rechaza sin llamar a QZ si no se pasa printerName', async () => {
    await expect(qzTrayProvider.print('', new Uint8Array([1, 2]))).rejects.toThrow(/impresora/i);
    expect(qzMock.print).not.toHaveBeenCalled();
  });

  it('crea el config con el nombre de impresora y envía los datos en base64', async () => {
    await qzTrayProvider.print('Impresora A', new Uint8Array([0x1B, 0x40]));
    expect(qzMock.configs.create).toHaveBeenCalledWith('Impresora A', { copies: 1 });
    const [, dataArg] = qzMock.print.mock.calls[0];
    expect(dataArg).toEqual([{ type: 'raw', format: 'command', flavor: 'base64', data: 'G0A=' }]);
  });

  it('respeta options.copies', async () => {
    await qzTrayProvider.print('Impresora A', new Uint8Array([1]), { copies: 3 });
    expect(qzMock.configs.create).toHaveBeenCalledWith('Impresora A', { copies: 3 });
  });

  it('nunca queda acoplado a un nombre de impresora específico (ninguna rama por marca/modelo)', () => {
    const source = qzTrayProvider.print.toString();
    expect(source.toLowerCase()).not.toContain('star');
    expect(source.toLowerCase()).not.toContain('tsp100');
  });
});

// ─── PRINT-3A: firma de solicitudes QZ Tray ─────────────────────────────────

describe('PRINT-3A — configuración de seguridad antes de conectar', () => {
  it('configura setCertificatePromise con rejectOnFailure antes del primer connect()', () => {
    expect(qzMock.security.setCertificatePromise).toHaveBeenCalledTimes(1);
    const [, options] = qzMock.security.setCertificatePromise.mock.calls[0];
    expect(options).toEqual({ rejectOnFailure: true });
  });

  it('configura el algoritmo de firma en "SHA512" (no otro valor)', () => {
    expect(qzMock.security.setSignatureAlgorithm).toHaveBeenCalledTimes(1);
    expect(qzMock.security.setSignatureAlgorithm).toHaveBeenCalledWith('SHA512');
  });

  it('configura setSignaturePromise', () => {
    expect(qzMock.security.setSignaturePromise).toHaveBeenCalledTimes(1);
  });

  it('la seguridad se configura UNA sola vez -- llamadas repetidas a connect() no la re-registran', async () => {
    await qzTrayProvider.connect();
    state.active = false;
    await qzTrayProvider.connect();
    expect(qzMock.security.setCertificatePromise).toHaveBeenCalledTimes(1);
    expect(qzMock.security.setSignatureAlgorithm).toHaveBeenCalledTimes(1);
    expect(qzMock.security.setSignaturePromise).toHaveBeenCalledTimes(1);
  });
});

describe('PRINT-3A — certificatePromise', () => {
  it('resuelve con el certificado público configurado (VITE_QZ_CERTIFICATE)', () => {
    const [certHandler] = qzMock.security.setCertificatePromise.mock.calls[0];
    const resolve = vi.fn();
    const reject = vi.fn();
    certHandler(resolve, reject);
    expect(resolve).toHaveBeenCalledWith(expect.stringContaining('BEGIN CERTIFICATE'));
    expect(reject).not.toHaveBeenCalled();
  });

  it('certificado ausente: rechaza con un mensaje claro en vez de conectar sin certificado', () => {
    vi.stubEnv('VITE_QZ_CERTIFICATE', '');
    const [certHandler] = qzMock.security.setCertificatePromise.mock.calls[0];
    const resolve = vi.fn();
    const reject = vi.fn();
    certHandler(resolve, reject);
    expect(resolve).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/certificado/i) }));
    vi.stubEnv('VITE_QZ_CERTIFICATE', '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----');
  });
});

describe('PRINT-3A — signaturePromise llama al backend (Edge Function qz-sign)', () => {
  function getSignatureResolver(toSign) {
    const [signatureFactory] = qzMock.security.setSignaturePromise.mock.calls[0];
    return signatureFactory(toSign);
  }

  it('hace POST a <SUPABASE_URL>/functions/v1/qz-sign con el string exacto a firmar', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ signature: 'ZmlybWE=' }) });
    const toSign = '{"call":"printers.find","params":{},"timestamp":123}';
    const resolve = vi.fn();
    const reject = vi.fn();
    await getSignatureResolver(toSign)(resolve, reject);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, requestInit] = global.fetch.mock.calls[0];
    expect(url).toBe('https://example.supabase.co/functions/v1/qz-sign');
    expect(requestInit.method).toBe('POST');
    expect(requestInit.headers.Authorization).toBe('Bearer valid-token');
    expect(requestInit.headers.apikey).toBe('anon-key');
    expect(JSON.parse(requestInit.body)).toEqual({ request: toSign });
    expect(resolve).toHaveBeenCalledWith('ZmlybWE=');
    expect(reject).not.toHaveBeenCalled();
  });

  it('nunca firma en el cliente -- no hay ninguna librería/función de firma local, solo el fetch al backend', () => {
    const source = qzTrayProvider.print.toString() + Object.values(qzTrayProvider).map((f) => f.toString()).join('\n');
    expect(source).not.toMatch(/crypto\.subtle\.sign/);
  });

  it('error del backend (respuesta no-ok) se propaga como rechazo con el mensaje del servidor', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Servicio de firma no configurado' }) });
    const resolve = vi.fn();
    const reject = vi.fn();
    await getSignatureResolver('x')(resolve, reject);
    expect(resolve).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: 'Servicio de firma no configurado' }));
  });

  it('endpoint de firma no disponible (fetch rechaza por red): mensaje claro, no un error crudo de fetch', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const resolve = vi.fn();
    const reject = vi.fn();
    await getSignatureResolver('x')(resolve, reject);
    expect(resolve).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/no disponible|no se pudo contactar/i) }));
  });

  it('firma inválida (respuesta 200 sin campo signature utilizable): rechaza en vez de resolver con basura', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const resolve = vi.fn();
    const reject = vi.fn();
    await getSignatureResolver('x')(resolve, reject);
    expect(resolve).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/firma inválida/i) }));
  });

  it('sin sesión válida, rechaza sin siquiera llamar al backend', async () => {
    getValidTokenMock.mockResolvedValue(null);
    const resolve = vi.fn();
    const reject = vi.fn();
    await getSignatureResolver('x')(resolve, reject);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/sesión/i) }));
  });
});

describe('PRINT-3A-BUG1 — cada fallo de firma se loguea con un código seguro (QZ Tray oculta el mensaje real)', () => {
  function getSignatureResolver(toSign) {
    const [signatureFactory] = qzMock.security.setSignaturePromise.mock.calls[0];
    return signatureFactory(toSign);
  }

  it('sin sesión: loguea "QZ signing failed: NO_SESSION"', async () => {
    getValidTokenMock.mockResolvedValue(null);
    await getSignatureResolver('x')(vi.fn(), vi.fn());
    expect(consoleErrorSpy).toHaveBeenCalledWith('QZ signing failed: NO_SESSION', '');
  });

  it('error de red: loguea "QZ signing failed: NETWORK_ERROR" con el detalle del fetch, nunca la sesión/JWT', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await getSignatureResolver('x')(vi.fn(), vi.fn());
    expect(consoleErrorSpy).toHaveBeenCalledWith('QZ signing failed: NETWORK_ERROR', 'Failed to fetch');
    const loggedArgs = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(loggedArgs).not.toContain('valid-token');
  });

  it('HTTP no-ok: loguea "QZ signing failed: HTTP_<status>" con el error seguro del servidor', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Origen no permitido' }) });
    await getSignatureResolver('x')(vi.fn(), vi.fn());
    expect(consoleErrorSpy).toHaveBeenCalledWith('QZ signing failed: HTTP_403', 'Origen no permitido');
  });

  it('firma vacía/inválida: loguea "QZ signing failed: EMPTY_OR_INVALID_SIGNATURE"', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await getSignatureResolver('x')(vi.fn(), vi.fn());
    expect(consoleErrorSpy).toHaveBeenCalledWith('QZ signing failed: EMPTY_OR_INVALID_SIGNATURE', '');
  });

  it('una firma exitosa NUNCA loguea "QZ signing failed"', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ signature: 'abc' }) });
    await getSignatureResolver('x')(vi.fn(), vi.fn());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe('PRINT-3A — ninguna clave privada ni secreto vive en el frontend', () => {
  it('el archivo fuente de qzTrayProvider no contiene ningún bloque de clave privada ni service_role', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/lib/printing/providers/qzTrayProvider.js', 'utf8');
    expect(source).not.toMatch(/-----BEGIN (RSA )?PRIVATE KEY-----/);
    expect(source).not.toMatch(/SERVICE_ROLE/);
    expect(source).not.toMatch(/QZ_SIGN_PRIVATE_KEY/);
  });

  it('la firma siempre se pide al backend (fetch), nunca se calcula localmente', () => {
    const source = qzTrayProvider.connect.toString();
    expect(source).not.toMatch(/importKey|crypto\.subtle/);
  });
});
