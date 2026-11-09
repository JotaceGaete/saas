import { describe, it, expect } from 'vitest';
import { buildSimulatedDteXml, isSimulatedDte, saleItemsToDteLines, SIMULATED_FOLIO_RANGE } from './simulatedDte';
import { parseDteXml } from './parseDteXml';
import { verifyTedSignature } from './verifyTed';

const lines = saleItemsToDteLines([
  { name: 'Café con leche & medialuna', quantity: 2, unit_price: 1500 },
  { name: 'Agua', quantity: 1, unit_price: 990 },
]);

describe('simulatedDte', () => {
  it('produce un DTE 39 que parsea, cuadra y cuyo timbre verifica', async () => {
    const xml = await buildSimulatedDteXml({ folio: SIMULATED_FOLIO_RANGE.desde, lines, fecha: '2026-11-03' });
    const dte = parseDteXml(xml);
    expect(dte.tipoDte).toBe(39);
    expect(dte.totales.total).toBe(3990);
    expect(dte.totales.neto + dte.totales.iva).toBe(3990);
    expect(dte.items.map((i) => i.monto)).toEqual([3000, 990]);
    expect(dte.items[0].precio).toBe(1500); // precio CON IVA, como DTE Core
    expect(await verifyTedSignature(dte.ted)).toBe(true);
    expect(isSimulatedDte(dte)).toBe(true);
    expect(dte.emisor.rut).toBe('11111111-1');
  });

  it('nunca usa folios del CAF de producción', async () => {
    await expect(buildSimulatedDteXml({ folio: 51107, lines })).rejects.toMatchObject({ code: 'SIM_FOLIO_RANGE' });
  });
});
