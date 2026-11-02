import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSyntheticDteXml, latin1Bytes } from '../lib/fiscal/dte/__fixtures__/syntheticDte';

const printReceipt = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));
vi.mock('../lib/printing/printService', () => ({ printService: { printReceipt: (...a) => printReceipt(...a) } }));
vi.mock('../lib/printing/printerConfigStorage', () => ({
  buildPrinterConfigKey: (id) => `p:${id}`,
  readPrinterConfig: () => ({ printerName: 'Star TSP100 Cutter (TSP143)', paperWidthMm: 80, autoCut: true, cutStrategyId: 'gs-v-modern' }),
}));
vi.mock('../lib/printing/connectorConfigStorage', () => ({
  buildConnectorConfigKey: (id) => `c:${id}`,
  readConnectorConfig: () => ({ enabled: false }),
}));

const { printBoletaThermal, printTimbreDiagnostic, loadVerifiedDte, MAX_XML_FILE_BYTES } = await import('./fiscalThermalPrintService');

const BIZ = '11111111-1111-4111-8111-111111111111';
const INV = '22222222-2222-4222-8222-222222222222';

function fetchXml(xml, status = 200) {
  return vi.fn(async () => ({ ok: status === 200, status, arrayBuffer: async () => latin1Bytes(xml).buffer }));
}

beforeEach(() => {
  printReceipt.mockReset();
  globalThis.fetch = fetchXml(buildSyntheticDteXml());
});

describe('fiscalThermalPrintService', () => {
  it('descarga el XML por la ruta de solo lectura y lo valida', async () => {
    const f = fetchXml(buildSyntheticDteXml());
    const { dte, tedVerified } = await loadVerifiedDte({ businessId: BIZ, invoiceId: INV, fetchImpl: f });
    expect(tedVerified).toBe(true);
    expect(dte.folio).toBe(1201);
    expect(f.mock.calls[0][0]).toBe(`/api/fiscal/download?businessId=${BIZ}&invoiceId=${INV}&format=xml`);
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('imprime la reimpresión rotulada, sin llamar a nada más', async () => {
    const r = await printBoletaThermal({ businessId: BIZ, invoiceId: INV, resolucion: { numero: '80', anio: '2014' } });
    expect(r).toMatchObject({ ok: true, folio: 1201 });
    expect(printReceipt).toHaveBeenCalledTimes(1);
    const [receipt, target] = printReceipt.mock.calls[0];
    expect(receipt.lines[0]).toMatchObject({ text: 'REIMPRESION', bold: true });
    expect(target.printerName).toBe('Star TSP100 Cutter (TSP143)');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('no imprime si el timbre fue alterado', async () => {
    globalThis.fetch = fetchXml(buildSyntheticDteXml().replace('<IT1>Cafe con leche</IT1>', '<IT1>Cafe con leche.</IT1>'));
    const r = await printBoletaThermal({ businessId: BIZ, invoiceId: INV, resolucion: { numero: '80', anio: '2014' } });
    expect(r).toMatchObject({ ok: false, code: 'TED_NOT_VERIFIED' });
    expect(printReceipt).not.toHaveBeenCalled();
  });

  it('no imprime sin resolución ni si la descarga falla', async () => {
    expect(await printBoletaThermal({ businessId: BIZ, invoiceId: INV, resolucion: { numero: '', anio: '' } }))
      .toMatchObject({ ok: false, code: 'RESOLUCION_REQUIRED' });
    globalThis.fetch = fetchXml('', 404);
    expect(await printTimbreDiagnostic({ businessId: BIZ, invoiceId: INV })).toMatchObject({ ok: false, code: 'XML_DOWNLOAD_FAILED' });
    expect(printReceipt).not.toHaveBeenCalled();
  });

  it('imprime el diagnóstico con las tres variantes', async () => {
    const r = await printTimbreDiagnostic({ businessId: BIZ, invoiceId: INV });
    expect(r.ok).toBe(true);
    expect(r.timbres.map((t) => t.strategyId)).toEqual(['rasterGsV0', 'escStar24', 'rasterGsV0Narrow']);
    expect(printReceipt).toHaveBeenCalledTimes(1);
  });

  it('reimprime desde un archivo XML local sin descargar nada', async () => {
    const xml = buildSyntheticDteXml();
    const file = { size: xml.length, arrayBuffer: async () => latin1Bytes(xml).buffer };
    const r = await printBoletaThermal({ businessId: BIZ, file, resolucion: { numero: '80', anio: '2014' }, timbreStrategyId: 'rasterGsV0Narrow' });
    expect(r).toMatchObject({ ok: true, folio: 1201, timbre: { strategyId: 'rasterGsV0Narrow' } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(printReceipt).toHaveBeenCalledTimes(1);
  });

  it('rechaza archivos que no son un XML de boleta válido', async () => {
    const big = { size: MAX_XML_FILE_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) };
    expect(await printTimbreDiagnostic({ businessId: BIZ, file: big })).toMatchObject({ ok: false, code: 'XML_FILE_TOO_LARGE' });
    const junk = { size: 10, arrayBuffer: async () => latin1Bytes('<hola>').buffer };
    expect(await printTimbreDiagnostic({ businessId: BIZ, file: junk })).toMatchObject({ ok: false });
    expect(printReceipt).not.toHaveBeenCalled();
  });
});
