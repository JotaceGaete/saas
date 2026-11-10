// Flujo completo sin red real: venta cobrada -> emisión SIMULADA -> XML ->
// timbre PDF417 -> ESC/POS -> Walinka Print Connector (falso, en memoria,
// con la misma semántica de idempotencia que el real).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } } }));

const { createFiscalSaleFlow, createFlowMarks, PHASE } = await import('./fiscalSaleFlow');
const { createSimulatedEmitter } = await import('./fiscalEmitters');
const { printIssuedBoleta } = await import('./fiscalThermalPrintService');
const { buildConnectorConfigKey, writeConnectorConfig } = await import('../lib/printing/connectorConfigStorage');
const { validateLikeConnector, rasterizeStarImage, decodePdf417 } = await import('../lib/printing/receipts/__testUtils__/starConnectorHarness');
const { decodeDteBytes, parseDteXml } = await import('../lib/fiscal/dte/parseDteXml');

const BIZ = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const sale = { items: [{ name: 'Té verde', quantity: 1, unit_price: 100 }], payments: [{ method: 'cash', amount: 100 }], total: 100, discountAmount: 0, pendingBalance: 0 };

function fakeConnector({ failFirst = false } = {}) {
  const jobs = new Map(); // idempotencyKey -> 'printed' | 'failed'
  const printed = [];
  let fail = failFirst;
  const fetchImpl = vi.fn(async (url, init) => {
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (!String(url).endsWith('/v1/print')) return reply(404, { error: 'not_found' });
    const body = JSON.parse(init.body);
    if (jobs.get(body.idempotencyKey) === 'printed') return reply(200, { status: 'printed', duplicate: true });
    if (fail) { fail = false; jobs.set(body.idempotencyKey, 'failed'); return reply(503, { error: 'printer_unavailable', problems: ['sin papel'] }); }
    jobs.set(body.idempotencyKey, 'printed');
    printed.push({ key: body.idempotencyKey, printerName: body.printerName, bytes: Uint8Array.from(atob(body.dataBase64), (c) => c.charCodeAt(0)) });
    return reply(200, { status: 'printed', duplicate: false });
  });
  return { fetchImpl, printed };
}

function ascii(bytes) { return Array.from(bytes, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ' ')).join(''); }
function hasSeq(bytes, seq) {
  outer: for (let i = 0; i <= bytes.length - seq.length; i++) { for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) continue outer; return true; }
  return false;
}

beforeEach(() => {
  localStorage.clear();
  writeConnectorConfig(buildConnectorConfigKey(BIZ), {
    enabled: true, token: 't'.repeat(40), baseUrl: 'http://127.0.0.1:17777', printerName: 'Star TSP100 Cutter (TSP143)',
  });
});

function makeFlow(connector) {
  globalThis.fetch = connector.fetchImpl;
  const emitter = createSimulatedEmitter({ businessId: BIZ, storage: localStorage, scenario: () => 'ok' });
  const flow = createFiscalSaleFlow({
    businessId: BIZ, emitter, marks: createFlowMarks({ businessId: BIZ, storage: localStorage }),
    print: ({ bytes, reprint, idempotencyKey, saleNumber }) => printIssuedBoleta({ businessId: BIZ, bytes, reprint, idempotencyKey, saleNumber }),
  });
  return { emitter, flow };
}

describe('flujo TPV completo (simulado) hasta el conector', () => {
  it('imprime la boleta con timbre PDF417 (ESC * 32 en la Star) y rótulo de simulación', async () => {
    const connector = fakeConnector();
    const { flow, emitter } = makeFlow(connector);
    const r = await flow.start('sale-1', { ...sale, saleNumber: 1 });
    expect(r).toMatchObject({ phase: PHASE.PRINTED, folio: 900001, simulation: true });
    expect(emitter.providerCalls).toBe(1);
    expect(connector.printed).toHaveLength(1);
    const job = connector.printed[0];
    expect(job.printerName).toBe('Star TSP100 Cutter (TSP143)');
    expect(job.key).toBe(`fiscal:${BIZ}:900001:boleta`);
    const text = ascii(job.bytes);
    expect(text).toContain('SIMULACION');
    expect(text).toContain('SIN VALOR TRIBUTARIO');
    expect(text).toContain('BOLETA ELECTRONICA');
    expect(text).toContain('900001');
    expect(text).toContain('Timbre Electronico S.I.I.');
    // Número interno de la venta al pie, sin tocar el folio SII.
    expect(text).toContain('Ref. interna NV-0001');
    expect(text.indexOf('Ref. interna NV-0001')).toBeGreaterThan(text.indexOf('Timbre Electronico S.I.I.'));
    expect(hasSeq(job.bytes, [0x1b, 0x2a, 0x20])).toBe(true); // ESC * 32
    expect(hasSeq(job.bytes, [0x1d, 0x76, 0x30])).toBe(false); // nunca GS v 0 en la Star
    // El conector acepta el trabajo tal cual (copia de EscPosStreamValidator.cs)...
    expect(validateLikeConnector(job.bytes)).toBeNull();
    // ...y el timbre que dibujaría la Star se decodifica al TED exacto del XML emitido.
    const dte = parseDteXml(decodeDteBytes(await emitter.loadDte('sale-1')));
    const image = rasterizeStarImage(job.bytes);
    expect(Math.max(...image.bands.map((b) => b.x + b.physicalWidth))).toBeLessThanOrEqual(440);
    expect(decodePdf417(image)).toBe(dte.ted.xml);
  });

  it('sin conector activo no emite ni intenta otra ruta de impresión', async () => {
    localStorage.clear();
    const connector = fakeConnector();
    globalThis.fetch = connector.fetchImpl;
    const { fiscalPrintBlocker } = await import('./fiscalThermalPrintService');
    const emitter = createSimulatedEmitter({ businessId: BIZ, storage: localStorage, scenario: () => 'ok' });
    const flow = createFiscalSaleFlow({
      businessId: BIZ, emitter, marks: createFlowMarks({ businessId: BIZ, storage: localStorage }),
      print: ({ bytes, reprint, idempotencyKey }) => printIssuedBoleta({ businessId: BIZ, bytes, reprint, idempotencyKey }),
      printBlocker: () => fiscalPrintBlocker(BIZ),
    });
    expect(await flow.start('sale-1', sale)).toMatchObject({ phase: PHASE.BLOCKED, code: 'CONNECTOR_REQUIRED' });
    expect(emitter.providerCalls).toBe(0);
    expect(connector.fetchImpl).not.toHaveBeenCalled();
  });

  it('impresora sin papel: reintentar reimprime el mismo trabajo sin emitir', async () => {
    const connector = fakeConnector({ failFirst: true });
    const { flow, emitter } = makeFlow(connector);
    const r = await flow.start('sale-1', sale);
    expect(r.phase).toBe(PHASE.PRINT_FAILED);
    expect(r.message).toMatch(/sin papel/);
    const r2 = await flow.retryPrint('sale-1', r.folio);
    expect(r2.phase).toBe(PHASE.PRINTED);
    expect(connector.printed).toHaveLength(1);
    expect(emitter.providerCalls).toBe(1);
  });

  it('marca local perdida (otro equipo): el conector descarta el duplicado del original', async () => {
    const connector = fakeConnector();
    const { flow } = makeFlow(connector);
    await flow.start('sale-1', sale);
    // Borra solo las marcas de impresión, conserva el libro de la simulación.
    Object.keys(localStorage).filter((k) => k.startsWith('walinka:fiscal-flow:printed')).forEach((k) => localStorage.removeItem(k));
    const r = await makeFlow(connector).flow.start('sale-1', sale);
    expect(r.phase).toBe(PHASE.PRINTED);
    expect(connector.printed).toHaveLength(1);
  });

  it('reimpresión: sale rotulada REIMPRESION con el mismo folio', async () => {
    const connector = fakeConnector();
    const { flow, emitter } = makeFlow(connector);
    await flow.start('sale-1', { ...sale, saleNumber: 42 });
    const r = await flow.reprint('sale-1', 900001);
    expect(r.phase).toBe(PHASE.PRINTED);
    expect(connector.printed).toHaveLength(2);
    const text = ascii(connector.printed[1].bytes);
    expect(text).toContain('REIMPRESION');
    expect(text).toContain('900001');
    expect(text).toContain('Ref. interna NV-0042');
    expect(validateLikeConnector(connector.printed[1].bytes)).toBeNull();
    expect(emitter.providerCalls).toBe(1);
  });
});
