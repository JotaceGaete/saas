import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Integration contract: fiscal controls are opt-in and never replace the
// existing commercial ticket or its reprint handler.
const source = readFileSync(resolve(process.cwd(), 'src/pages/crm/components/CrmThermalTicket.jsx'), 'utf8');
const terminal = readFileSync(resolve(process.cwd(), 'src/pages/crm/CrmTerminal.jsx'), 'utf8');

describe('TPV: fiscal issuance remains separate from commercial printing', () => {
  it('only mounts the fiscal emission panel behind the explicit feature flag', () => {
    expect(source).toMatch(/FISCAL_EMIT_ENABLED && sale\?\.id && \(/);
    expect(source).toMatch(/<TpvFiscalEmitPanel saleId=\{sale\.id\} businessId=\{business\?\.id\} total=\{total\}/);
  });

  it('preserves commercial receipt and reprint actions independently of fiscal issuance', () => {
    expect(source).toMatch(/\{\/\* Ticket preview \(screen only\) \*\/\}\s*\{ticketBody\}/);
    expect(source).toMatch(/onClick=\{onReprint\}/);
    expect(terminal).toMatch(/await printService\.printReceipt\(receipt, \{ printerName: printerConfig\.printerName \}\)/);
    expect(terminal).toMatch(/<CrmThermalTicket/);
  });

  it('does not run fiscal emission automatically on sale completion or Point callback', () => {
    expect(terminal).not.toMatch(/emitFiscalSale|TpvFiscalEmitPanel|VITE_FISCAL_EMIT_ENABLED/);
    expect(source).not.toMatch(/emitFiscalSale\(/);
  });
});
