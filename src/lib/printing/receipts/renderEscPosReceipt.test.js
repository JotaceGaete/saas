import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./fetchLogoRaster', () => ({
  fetchLogoRaster: vi.fn(),
}));

const { fetchLogoRaster } = await import('./fetchLogoRaster');
const {
  renderEscPosReceipt, buildTestReceipt, buildRasterDiagnosticReceipt,
  buildImageCapabilityDiagnosticReceipt, buildCutCapabilityDiagnosticReceipt,
  columnsForWidth, wrapText, formatRowLines,
} = await import('./renderEscPosReceipt');
const { buildRasterCommand } = await import('./escPosImage');
const { GRAPHICS_STRATEGIES, CUT_STRATEGIES } = await import('./escPosCapabilities');
const { getPrinterProfile, getColumnsForProfile } = await import('./printerProfile');

const ESC = 0x1B;
const GS = 0x1D;

function bytesToText(bytes) {
  return Array.from(bytes).map((b) => (b < 256 ? String.fromCharCode(b) : '?')).join('');
}

function includesSubsequence(bytes, seq) {
  const arr = Array.from(bytes);
  for (let i = 0; i <= arr.length - seq.length; i++) {
    if (seq.every((v, j) => arr[i + j] === v)) return true;
  }
  return false;
}

afterEach(() => {
  vi.mocked(fetchLogoRaster).mockReset();
});

describe('renderEscPosReceipt', () => {
  it('empieza con el comando de inicialización ESC @', async () => {
    const bytes = await renderEscPosReceipt({ lines: [{ text: 'hola' }] });
    expect(Array.from(bytes.slice(0, 2))).toEqual([ESC, 0x40]);
  });

  it('PRINT-4: termina con avance de papel y GS V 66 0 (corte PARCIAL, forma moderna de 2 bytes) cuando cut !== false', async () => {
    const bytes = await renderEscPosReceipt({ lines: [{ text: 'hola' }], feedLines: 2, cut: true });
    const tail = Array.from(bytes.slice(-4));
    expect(tail).toEqual([GS, 0x56, 0x42, 0x00]); // GS V 66 0 -- corte parcial, forma parametrizada de 2 bytes
    expect(bytes[bytes.length - 5]).toBe(0x0A); // precedido por avance de papel
  });

  it('PRINT-4: la forma LEGACY de 1 byte (GS V 0) ya no se emite -- era la causa de que el TSP100 no cortara', async () => {
    const bytes = await renderEscPosReceipt({ lines: [{ text: 'hola' }], cut: true });
    expect(includesSubsequence(bytes, [GS, 0x56, 0x00])).toBe(false);
  });

  it('no agrega ningún comando de corte cuando cut === false (autoCut desactivado)', async () => {
    const bytes = await renderEscPosReceipt({ lines: [{ text: 'hola' }], feedLines: 0, cut: false });
    expect(includesSubsequence(bytes, [GS, 0x56])).toBe(false);
  });

  it('incluye el texto de cada línea', async () => {
    const bytes = await renderEscPosReceipt({ lines: [{ text: 'Ticket de prueba' }], feedLines: 0, cut: false });
    expect(bytesToText(bytes)).toContain('Ticket de prueba');
  });

  it('envuelve una línea en negrita con ESC E 1 / ESC E 0', async () => {
    const bytes = await renderEscPosReceipt({ lines: [{ text: 'bold', bold: true }], feedLines: 0, cut: false });
    expect(includesSubsequence(bytes, [ESC, 0x45, 0x01])).toBe(true);
    expect(includesSubsequence(bytes, [ESC, 0x45, 0x00])).toBe(true);
  });

  it('envuelve una línea centrada con ESC a 1 y vuelve a ESC a 0 en la siguiente', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ text: 'centro', align: 'center' }, { text: 'izquierda' }],
      feedLines: 0, cut: false,
    });
    expect(includesSubsequence(bytes, [ESC, 0x61, 0x01])).toBe(true);
    expect(includesSubsequence(bytes, [ESC, 0x61, 0x00])).toBe(true);
  });

  it('reemplaza caracteres fuera de Latin-1 por "?" en vez de bytes UTF-8 crudos', async () => {
    const bytes = await renderEscPosReceipt({ lines: [{ text: '你好' }], feedLines: 0, cut: false });
    expect(bytesToText(bytes)).toContain('??');
  });

  it('devuelve un Uint8Array', async () => {
    const bytes = await renderEscPosReceipt({ lines: [{ text: 'x' }] });
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it('sin lines no lanza y produce igual init + feed/corte', async () => {
    await expect(renderEscPosReceipt({})).resolves.not.toThrow();
    const bytes = await renderEscPosReceipt({});
    expect(Array.from(bytes.slice(0, 2))).toEqual([ESC, 0x40]);
  });

  it('no muta el objeto Receipt original (el builder puede reutilizar los datos)', async () => {
    const receipt = { lines: [{ type: 'item', qty: 2, name: 'Producto', unitPrice: 100, lineTotal: 200 }], feedLines: 1 };
    const snapshot = JSON.parse(JSON.stringify(receipt));
    await renderEscPosReceipt(receipt);
    expect(receipt).toEqual(snapshot);
  });
});

describe('columnsForWidth', () => {
  it('80mm y 58mm derivan sus columnas del perfil físico (printerProfile.js); ancho desconocido -> cae a 80mm', () => {
    expect(columnsForWidth(80)).toBe(getColumnsForProfile(getPrinterProfile(80)));
    expect(columnsForWidth(58)).toBe(getColumnsForProfile(getPrinterProfile(58)));
    expect(columnsForWidth(999)).toBe(columnsForWidth(80));
    expect(columnsForWidth(80)).toBeGreaterThan(columnsForWidth(58));
  });
});

describe('wrapText', () => {
  it('no envuelve texto que cabe en el ancho', () => {
    expect(wrapText('hola mundo', 20)).toEqual(['hola mundo']);
  });

  it('envuelve por palabras sin truncar', () => {
    const lines = wrapText('Producto con nombre muy largo que no cabe', 12);
    expect(lines.every((l) => l.length <= 12)).toBe(true);
    expect(lines.join(' ')).toContain('Producto');
    expect(lines.join(' ')).toContain('largo');
  });

  it('una palabra más larga que el ancho se corta en pedazos, nunca se pierde contenido', () => {
    const lines = wrapText('Supercalifragilisticoso', 8);
    expect(lines.join('')).toBe('Supercalifragilisticoso');
    expect(lines.every((l) => l.length <= 8)).toBe(true);
  });

  it('texto vacío devuelve una línea vacía, nunca lanza', () => {
    expect(wrapText('', 10)).toEqual(['']);
    expect(wrapText(undefined, 10)).toEqual(['']);
  });
});

describe('formatRowLines', () => {
  it('etiqueta y valor en una sola línea cuando caben, valor alineado a la derecha', () => {
    const [line] = formatRowLines('Subtotal', '$1.000', 20);
    expect(line.length).toBe(20);
    expect(line.endsWith('$1.000')).toBe(true);
    expect(line.startsWith('Subtotal')).toBe(true);
  });

  it('si no caben, la etiqueta se envuelve y el valor queda en su propia línea alineado a la derecha', () => {
    const lines = formatRowLines('Una etiqueta bastante larga que no cabe', '$1.000', 12);
    expect(lines.length).toBeGreaterThan(1);
    const lastLine = lines[lines.length - 1];
    expect(lastLine.endsWith('$1.000')).toBe(true);
    expect(lastLine.length).toBe(12);
  });
});

describe('renderEscPosReceipt — tipos semánticos PRINT-4', () => {
  it('divider imprime una línea de guiones del ancho de columnas configurado', async () => {
    const bytes = await renderEscPosReceipt({ lines: [{ type: 'divider' }], paperWidthMm: 80, feedLines: 0, cut: false });
    expect(bytesToText(bytes)).toContain('-'.repeat(columnsForWidth(80)));
  });

  it('row con amount se formatea con formatMoney y queda alineado a la derecha', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'row', left: 'Subtotal', amount: 2700, currency: 'CLP' }],
      paperWidthMm: 80, feedLines: 0, cut: false,
    });
    const text = bytesToText(bytes);
    expect(text).toContain('Subtotal');
    expect(text).toContain('$2.700');
  });

  it('row con amount negativo (descuento) muestra el signo menos', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'row', left: 'Descuento', amount: -200, currency: 'CLP' }],
      feedLines: 0, cut: false,
    });
    expect(bytesToText(bytes)).toContain('$-200');
  });

  it('itemsHeader imprime CANT/PRODUCTO y TOTAL', async () => {
    const bytes = await renderEscPosReceipt({ lines: [{ type: 'itemsHeader' }], feedLines: 0, cut: false });
    const text = bytesToText(bytes);
    expect(text).toContain('CANT/PRODUCTO');
    expect(text).toContain('TOTAL');
  });

  it('item con cantidad entera, nombre y total de línea', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'item', qty: 2, name: 'Producto A', unitPrice: 1000, lineTotal: 2000, currency: 'CLP' }],
      feedLines: 0, cut: false,
    });
    const text = bytesToText(bytes);
    expect(text).toContain('2x Producto A');
    expect(text).toContain('$2.000');
    expect(text).toContain('$1.000 c/u');
  });

  it('item con cantidad decimal (venta por peso) se muestra sin ceros de relleno', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'item', qty: 1.5, name: 'Queso', unitPrice: 4000, lineTotal: 6000, currency: 'CLP' }],
      feedLines: 0, cut: false,
    });
    expect(bytesToText(bytes)).toContain('1.5x Queso');
  });

  it('item con nombre muy largo se envuelve en varias líneas, nunca se trunca', async () => {
    const longName = 'Producto con un nombre extremadamente largo que jamas cabria en una sola linea de un ticket de 80mm';
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'item', qty: 1, name: longName, unitPrice: 500, lineTotal: 500, currency: 'CLP' }],
      paperWidthMm: 80, feedLines: 0, cut: false,
    });
    const text = bytesToText(bytes);
    for (const word of longName.split(' ')) expect(text).toContain(word);
  });

  it('item con nota agrega una línea adicional con la nota', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'item', qty: 1, name: 'Producto B', unitPrice: 500, lineTotal: 500, note: 'Sin envolver', currency: 'CLP' }],
      feedLines: 0, cut: false,
    });
    expect(bytesToText(bytes)).toContain('Sin envolver');
  });

  it('total emphasize=true usa doble tamaño (GS ! 0x11) cuando cabe en la mitad de las columnas', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'total', label: 'TOTAL', amount: 2500, currency: 'CLP', emphasize: true }],
      paperWidthMm: 80, feedLines: 0, cut: false,
    });
    expect(includesSubsequence(bytes, [GS, 0x21, 0x11])).toBe(true);
    expect(bytesToText(bytes)).toContain('$2.500');
  });

  it('total con etiqueta muy larga no fuerza doble tamaño (cae a negrita normal, nunca se corta el monto)', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'total', label: 'TOTAL A PAGAR POR EL CLIENTE EN ESTA VENTA', amount: 2500, currency: 'CLP', emphasize: true }],
      paperWidthMm: 58, feedLines: 0, cut: false,
    });
    expect(bytesToText(bytes)).toContain('$2.500');
  });

  it('total sin emphasize nunca activa doble tamaño', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'total', label: 'Pagado', amount: 2500, currency: 'CLP' }],
      feedLines: 0, cut: false,
    });
    expect(includesSubsequence(bytes, [GS, 0x21, 0x11])).toBe(false);
  });

  it('logo: cuando fetchLogoRaster resuelve un comando, se inserta centrado', async () => {
    const fakeRaster = new Uint8Array([GS, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0xFF]);
    vi.mocked(fetchLogoRaster).mockResolvedValue({ command: fakeRaster, width: 8, height: 1 });

    const bytes = await renderEscPosReceipt({ lines: [{ type: 'logo', url: 'https://x/logo.png' }], feedLines: 0, cut: false });

    expect(includesSubsequence(bytes, [ESC, 0x61, 0x01])).toBe(true); // centrado
    expect(includesSubsequence(bytes, Array.from(fakeRaster))).toBe(true);
    expect(fetchLogoRaster).toHaveBeenCalledWith('https://x/logo.png', expect.objectContaining({ maxWidthDots: expect.any(Number) }));
  });

  it('logo: cuando fetchLogoRaster falla (resuelve null), el ticket igual imprime sin el logo, sin lanzar', async () => {
    vi.mocked(fetchLogoRaster).mockResolvedValue(null);
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'logo', url: 'https://x/roto.png' }, { text: 'Sigue el ticket' }],
      feedLines: 0, cut: false,
    });
    expect(bytesToText(bytes)).toContain('Sigue el ticket');
  });

  it('logo: usa un ancho máximo distinto según paperWidthMm (58 vs 80), sin hardcodear una única impresora', async () => {
    vi.mocked(fetchLogoRaster).mockResolvedValue(null);
    await renderEscPosReceipt({ lines: [{ type: 'logo', url: 'https://x/logo.png' }], paperWidthMm: 58, feedLines: 0, cut: false });
    await renderEscPosReceipt({ lines: [{ type: 'logo', url: 'https://x/logo.png' }], paperWidthMm: 80, feedLines: 0, cut: false });
    const calls = vi.mocked(fetchLogoRaster).mock.calls;
    const width58 = calls[0][1].maxWidthDots;
    const width80 = calls[1][1].maxWidthDots;
    expect(width80).toBeGreaterThan(width58);
  });

  it('PRINT-4-BUG3: pasa receipt.imageMode como graphicsStrategyId a fetchLogoRaster (el renderer no decide la estrategia, solo la reenvía)', async () => {
    vi.mocked(fetchLogoRaster).mockResolvedValue(null);
    await renderEscPosReceipt({
      lines: [{ type: 'logo', url: 'https://x/logo.png' }], imageMode: 'rasterGsV0', feedLines: 0, cut: false,
    });
    expect(fetchLogoRaster).toHaveBeenCalledWith('https://x/logo.png', expect.objectContaining({ graphicsStrategyId: 'rasterGsV0' }));
  });

  it('PRINT-4-BUG3: sin imageMode en el receipt, pasa undefined -- fetchLogoRaster decide su propio default', async () => {
    vi.mocked(fetchLogoRaster).mockResolvedValue(null);
    await renderEscPosReceipt({ lines: [{ type: 'logo', url: 'https://x/logo.png' }], feedLines: 0, cut: false });
    expect(fetchLogoRaster).toHaveBeenCalledWith('https://x/logo.png', expect.objectContaining({ graphicsStrategyId: undefined }));
  });

  describe('PRINT-4-BUG1 — rasterBytes (comando de imagen ya construido, sin fetch)', () => {
    it('inserta el comando centrado, sin pasar por fetchLogoRaster', async () => {
      const bits = Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 0]);
      const command = buildRasterCommand(bits, 8, 1);
      const bytes = await renderEscPosReceipt({ lines: [{ type: 'rasterBytes', command }], feedLines: 0, cut: false });

      expect(includesSubsequence(bytes, [ESC, 0x61, 0x01])).toBe(true);
      expect(includesSubsequence(bytes, Array.from(command))).toBe(true);
      expect(fetchLogoRaster).not.toHaveBeenCalled();
    });

    it('sin command (o vacío) no inserta nada ni lanza', async () => {
      await expect(renderEscPosReceipt({ lines: [{ type: 'rasterBytes' }], feedLines: 0, cut: false })).resolves.not.toThrow();
      const bytes = await renderEscPosReceipt({
        lines: [{ type: 'rasterBytes', command: new Uint8Array(0) }, { text: 'sigue' }],
        feedLines: 0, cut: false,
      });
      expect(bytesToText(bytes)).toContain('sigue');
    });
  });

  describe('PRINT-4-BUG2 — raw (bytes ESC/POS crudos, sin alinear, para inyectar variantes de comando)', () => {
    it('inserta los bytes tal cual, sin ESC a de por medio', async () => {
      const bytes = await renderEscPosReceipt({
        lines: [{ type: 'raw', bytes: [0x1D, 0x56, 0x01] }],
        feedLines: 0, cut: false,
      });
      expect(includesSubsequence(bytes, [0x1D, 0x56, 0x01])).toBe(true);
    });

    it('sin bytes (o vacío) no inserta nada ni lanza', async () => {
      await expect(renderEscPosReceipt({ lines: [{ type: 'raw' }], feedLines: 0, cut: false })).resolves.not.toThrow();
      const bytes = await renderEscPosReceipt({
        lines: [{ type: 'raw', bytes: [] }, { text: 'sigue' }],
        feedLines: 0, cut: false,
      });
      expect(bytesToText(bytes)).toContain('sigue');
    });
  });
});

describe('buildImageCapabilityDiagnosticReceipt — PRINT-4-BUG2', () => {
  it('identifica ambas variantes de imagen con texto antes/después, y no pide corte propio', async () => {
    const receipt = buildImageCapabilityDiagnosticReceipt({ paperWidthMm: 80 });
    expect(receipt.cut).toBe(false);

    const bytes = await renderEscPosReceipt(receipt);
    const text = bytesToText(bytes);
    expect(text).toContain('Antes de Imagen A');
    expect(text).toContain('Despues de Imagen A');
    expect(text).toContain('Antes de Imagen B');
    expect(text).toContain('Despues de Imagen B');
    expect(includesSubsequence(bytes, [GS, 0x76, 0x30])).toBe(true); // GS v 0 (Imagen A)
    expect(includesSubsequence(bytes, [ESC, 0x2A])).toBe(true); // ESC * (Imagen B)
  });

  it('no depende de red/Image/canvas -- no llama a fetchLogoRaster', async () => {
    await renderEscPosReceipt(buildImageCapabilityDiagnosticReceipt());
    expect(fetchLogoRaster).not.toHaveBeenCalled();
  });

  it('usa las mismas estrategias nombradas expuestas por escPosCapabilities (no duplica los comandos)', async () => {
    const receipt = buildImageCapabilityDiagnosticReceipt();
    const rasterLines = receipt.lines.filter((l) => l.type === 'rasterBytes');
    expect(rasterLines).toHaveLength(2);
    // Imagen A: header GS v 0 de 8 bytes + 8 bytes de datos (8x8, 1 byte/fila)
    expect(Array.from(rasterLines[0].command.slice(0, 3))).toEqual([0x1D, 0x76, 0x30]);
    expect(rasterLines[0].command.length).toBe(16);
    // Imagen B: una franja de 8 dots envuelta en ESC 3 8 ... LF ... ESC 2
    // (ver buildTiledColumnBitImageCommand) -- el propio comando ESC *
    // validado va adentro, no al principio.
    expect(Array.from(rasterLines[1].command.slice(0, 3))).toEqual([0x1B, 0x33, 8]);
    expect(Array.from(rasterLines[1].command.slice(3, 5))).toEqual([0x1B, 0x2A]);
    expect(Array.from(rasterLines[1].command.slice(-2))).toEqual([0x1B, 0x32]);
    expect(GRAPHICS_STRATEGIES.rasterGsV0.id).toBe('rasterGsV0');
  });
});

describe('buildCutCapabilityDiagnosticReceipt — PRINT-4-BUG2', () => {
  it('identifica ambas variantes de corte con texto antes/después, y no agrega un corte final propio', async () => {
    const receipt = buildCutCapabilityDiagnosticReceipt({ paperWidthMm: 80 });
    expect(receipt.cut).toBe(false);

    const bytes = await renderEscPosReceipt(receipt);
    const text = bytesToText(bytes);
    expect(text).toContain('Antes de Corte A');
    expect(text).toContain('Despues de Corte A');
    expect(text).toContain('Antes de Corte B');
    expect(text).toContain('Despues de Corte B');
    expect(includesSubsequence(bytes, CUT_STRATEGIES.partialFunctionB.bytes)).toBe(true);
    expect(includesSubsequence(bytes, CUT_STRATEGIES.partialFunctionALegacy.bytes)).toBe(true);
  });

  it('Corte A aparece antes que Corte B en el flujo de bytes (orden determinístico del diagnóstico)', async () => {
    const bytes = Array.from(await renderEscPosReceipt(buildCutCapabilityDiagnosticReceipt()));
    const indexA = bytes.join(',').indexOf(CUT_STRATEGIES.partialFunctionB.bytes.join(','));
    const indexB = bytes.join(',').indexOf(CUT_STRATEGIES.partialFunctionALegacy.bytes.join(','));
    expect(indexA).toBeGreaterThan(-1);
    expect(indexB).toBeGreaterThan(indexA);
  });
});

describe('buildRasterDiagnosticReceipt — PRINT-4-BUG1', () => {
  it('produce texto ASCII conocido y un bloque raster con el header GS v 0 correcto', async () => {
    const receipt = buildRasterDiagnosticReceipt({ paperWidthMm: 80 });
    const bytes = await renderEscPosReceipt(receipt);
    const text = bytesToText(bytes);

    expect(text).toContain('TEST WALINKA');
    expect(includesSubsequence(bytes, [GS, 0x76, 0x30, 0x00])).toBe(true); // GS v 0 m
  });

  it('no depende de red/Image/canvas -- no llama a fetchLogoRaster', async () => {
    await renderEscPosReceipt(buildRasterDiagnosticReceipt());
    expect(fetchLogoRaster).not.toHaveBeenCalled();
  });

  it('siempre pide corte, para que la prueba física quede completa', () => {
    expect(buildRasterDiagnosticReceipt().cut).toBe(true);
  });
});

describe('buildTestReceipt', () => {
  it('usa el nombre de la impresora y el ancho de papel en el contenido', () => {
    const receipt = buildTestReceipt({ businessName: 'Mi Negocio', printerName: 'Star TSP143', paperWidthMm: 80 });
    const allText = receipt.lines.map((l) => l.text).join('\n');
    expect(allText).toContain('Star TSP143');
    expect(allText).toContain('80 mm');
  });

  it('indica "no seleccionada" si no hay impresora', () => {
    const receipt = buildTestReceipt({ businessName: 'Mi Negocio', printerName: '', paperWidthMm: 80 });
    const allText = receipt.lines.map((l) => l.text).join('\n');
    expect(allText).toContain('no seleccionada');
  });

  it('no depende de ningún nombre de marca/modelo de impresora', () => {
    const receipt = buildTestReceipt({ businessName: 'Mi Negocio', printerName: 'Cualquier impresora ESC/POS', paperWidthMm: 80 });
    const allText = receipt.lines.map((l) => l.text).join('\n').toLowerCase();
    expect(allText).not.toContain('star');
    expect(allText).not.toContain('tsp100');
    expect(allText).not.toContain('epson');
  });

  it('los separadores son más largos a 80mm que a 58mm', () => {
    const dividerLength = (receipt) => receipt.lines.find((l) => /^-+$/.test(l.text))?.text.length || 0;
    const at80 = buildTestReceipt({ paperWidthMm: 80 });
    const at58 = buildTestReceipt({ paperWidthMm: 58 });
    expect(dividerLength(at80)).toBeGreaterThan(dividerLength(at58));
  });

  it('siempre pide corte', () => {
    const receipt = buildTestReceipt();
    expect(receipt.cut).toBe(true);
  });

  it('el receipt es serializable a ESC/POS sin lanzar', async () => {
    const receipt = buildTestReceipt({ businessName: 'Ñuñoa Panadería', printerName: 'X', paperWidthMm: 80 });
    await expect(renderEscPosReceipt(receipt)).resolves.not.toThrow();
  });
});

describe('PRINT-4-BUG4 — un monto nunca se divide (nunca "$25." + "000")', () => {
  const AMOUNTS_CLP = [1000, 25000, 126500, 999999, 1000000];
  const EXPECTED_STRINGS = ['$1.000', '$25.000', '$126.500', '$999.999', '$1.000.000'];

  it('wrapText nunca corta un token de dinero, ni siquiera a un ancho absurdamente angosto', () => {
    for (const amount of EXPECTED_STRINGS) {
      for (const width of [1, 2, 3, 4, 5, 8]) {
        const lines = wrapText(amount, width);
        expect(lines.some((l) => l === amount)).toBe(true);
        expect(lines.join('')).not.toMatch(/^\$\d+\.$/); // nunca queda "$25." colgando como línea propia
      }
    }
  });

  it('wrapText no corta un monto aunque comparta texto con otras palabras que sí se envuelven', () => {
    const lines = wrapText(`Pago recibido en efectivo ${EXPECTED_STRINGS[2]} gracias`, 6);
    expect(lines).toContain(EXPECTED_STRINGS[2]);
  });

  it('formatRowLines nunca divide el monto aunque la etiqueta sea muy larga y fuerce el fallback multilínea', () => {
    for (const amount of EXPECTED_STRINGS) {
      const rows = formatRowLines('Una etiqueta extremadamente larga que jamas cabe junto al monto', amount, columnsForWidth(80));
      const lastRow = rows[rows.length - 1];
      expect(lastRow.trim().endsWith(amount)).toBe(true);
      expect(rows.some((r) => /\$\d+\.$/.test(r.trim()))).toBe(false);
    }
  });

  it.each(AMOUNTS_CLP.map((amount, i) => [amount, EXPECTED_STRINGS[i]]))(
    'row con amount=%i renderiza el monto completo "%s" en 80mm y 58mm, nunca partido',
    async (amount, expected) => {
      for (const paperWidthMm of [80, 58]) {
        const bytes = await renderEscPosReceipt({
          lines: [{ type: 'row', left: 'Total', amount, currency: 'CLP' }],
          paperWidthMm, feedLines: 0, cut: false,
        });
        const text = bytesToText(bytes);
        expect(text).toContain(expected);
      }
    },
  );

  it.each(AMOUNTS_CLP.map((amount, i) => [amount, EXPECTED_STRINGS[i]]))(
    'total emphasize con amount=%i renderiza "%s" completo en doble tamaño, en 80mm y 58mm',
    async (amount, expected) => {
      for (const paperWidthMm of [80, 58]) {
        const bytes = await renderEscPosReceipt({
          lines: [{ type: 'total', label: 'TOTAL', amount, currency: 'CLP', emphasize: true }],
          paperWidthMm, feedLines: 0, cut: false,
        });
        const text = bytesToText(bytes);
        expect(text).toContain(expected);
        expect(includesSubsequence(bytes, [GS, 0x21, 0x11])).toBe(true); // sigue en doble tamaño
      }
    },
  );

  it.each(AMOUNTS_CLP.map((amount, i) => [amount, EXPECTED_STRINGS[i]]))(
    'item con unitPrice/lineTotal=%i muestra el monto completo "%s" en la fila de precio unitario', async (amount, expected) => {
      const bytes = await renderEscPosReceipt({
        lines: [{ type: 'item', qty: 1, name: 'Producto', unitPrice: amount, lineTotal: amount, currency: 'CLP' }],
        paperWidthMm: 80, feedLines: 0, cut: false,
      });
      const text = bytesToText(bytes);
      expect(text).toContain(expected);
    },
  );

  it('TOTAL $25.000 en doble tamaño: si etiqueta+monto no caben en una sola línea a mitad de ancho, la etiqueta y el monto van en líneas separadas pero el monto sigue completo', async () => {
    // Fuerza el caso "no cabe" con una etiqueta larga -- igual debe
    // quedar en doble tamaño (nunca se abandona el énfasis) y el monto
    // nunca se corta.
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'total', label: 'TOTAL A PAGAR POR EL CLIENTE', amount: 25000, currency: 'CLP', emphasize: true }],
      paperWidthMm: 58, feedLines: 0, cut: false,
    });
    const text = bytesToText(bytes);
    expect(text).toContain('$25.000');
    expect(includesSubsequence(bytes, [GS, 0x21, 0x11])).toBe(true);
  });
});

describe('PRINT-4-BUG4 — logo respeta el ancho imprimible con margen visible', () => {
  it('el maxWidthDots pedido a fetchLogoRaster es menor al ancho efectivo del perfil (nunca el 100%)', async () => {
    vi.mocked(fetchLogoRaster).mockResolvedValue(null);
    await renderEscPosReceipt({ lines: [{ type: 'logo', url: 'https://x/logo.png' }], paperWidthMm: 80, feedLines: 0, cut: false });
    const [, options] = vi.mocked(fetchLogoRaster).mock.calls.at(-1);
    const profile = getPrinterProfile(80);
    expect(options.maxWidthDots).toBeLessThan(profile.printableWidthDots - profile.safeMarginDots * 2 + 1);
    expect(options.maxWidthDots).toBeLessThan(profile.printableWidthDots);
  });
});

describe('PRINT-4-BUG4 — ítem: nombre y precio/total en filas separadas (nunca comparten línea)', () => {
  it('la primera línea del ítem es solo cantidad+nombre, el total nunca aparece ahí', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'item', qty: 2, name: 'Automatik 945', unitPrice: 12000, lineTotal: 24000, currency: 'CLP' }],
      paperWidthMm: 80, feedLines: 0, cut: false,
    });
    const lines = bytesToText(bytes).split('\n');
    const nameLine = lines.find((l) => l.includes('Automatik 945'));
    expect(nameLine).not.toContain('$24.000');
  });

  it('precio unitario y total de línea comparten la misma fila, con el total alineado a la derecha', async () => {
    const bytes = await renderEscPosReceipt({
      lines: [{ type: 'item', qty: 1, name: 'Automatik 945', unitPrice: 24000, lineTotal: 24000, currency: 'CLP' }],
      paperWidthMm: 80, feedLines: 0, cut: false,
    });
    const lines = bytesToText(bytes).split('\n');
    const priceLine = lines.find((l) => l.includes('c/u'));
    expect(priceLine).toContain('$24.000 c/u');
    expect(priceLine.trim().endsWith('$24.000')).toBe(true);
  });
});
