import { beforeEach, describe, expect, it, vi } from 'vitest';

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
};

vi.mock('qz-tray', () => ({ default: qzMock }));

const { qzTrayProvider } = await import('./qzTrayProvider');

beforeEach(() => {
  state.active = false;
  Object.values(qzMock.websocket).forEach((fn) => fn.mockClear?.());
  qzMock.printers.find.mockClear();
  qzMock.configs.create.mockClear();
  qzMock.print.mockClear();
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
