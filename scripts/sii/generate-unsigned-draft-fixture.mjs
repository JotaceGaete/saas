#!/usr/bin/env node
// Synthetic integration fixture: never emit or transmit as a tax document.
import { writeFileSync } from 'node:fs';
import { buildUnsignedBoleta39Draft } from './boleta39-unsigned-draft.mjs';
const output = process.argv[2];
if (!output || process.argv.length !== 3) {
  console.error('Usage: node generate-unsigned-draft-fixture.mjs <output.xml>');
  process.exit(2);
}
const prepared = {
  ok: true, fiscalEligible: false,
  snapshot: {
    saleId: 'SYNTHETIC-NO-FISCAL',
    total: 2380,
    lines: [
      {name: 'Jabón & crema', subtotal: 1190, taxCategory: 'IVA_AFECTO_19'},
      {name: 'Producto <prueba>', subtotal: 1190, taxCategory: 'IVA_AFECTO_19'}
    ]
  }
};
const draft = buildUnsignedBoleta39Draft({prepared, issueDate: '2026-10-28'});
if (!draft.ok || draft.transmittable !== false || draft.schemaValid !== false) {
  throw new Error('Non-fiscal draft gate failed');
}
writeFileSync(output, draft.xml, {encoding:'utf8', flag:'wx'});
console.log('Wrote synthetic, unsigned, non-fiscal draft for offline parsing');
