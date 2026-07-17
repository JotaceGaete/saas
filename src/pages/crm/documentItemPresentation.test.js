import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getDocumentItemDetail } from './documentItemPresentation';

describe('CRM document item presentation', () => {
  const catalogItem = {
    product_id: 'product-1',
    name: 'Producto del catálogo',
    description: 'Texto comercial que no debe aparecer',
    long_description: 'Descripción larga que tampoco debe aparecer',
  };

  it.each(['presupuesto', 'nota de venta'])(
    'a catalog product renders only its name in %s',
    () => expect(getDocumentItemDetail(catalogItem)).toBeNull(),
  );

  it('keeps the manually entered detail for a manual charge', () => {
    expect(getDocumentItemDetail({ product_id: null, name: 'Instalación', description: 'Incluye montaje' }))
      .toBe('Incluye montaje');
  });

  it('uses the shared rule in both final PDF and HTML preview renderers', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/crm/CrmDocumentPdf.jsx'), 'utf8');
    expect((source.match(/getDocumentItemDetail\(item\)/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(source).not.toMatch(/!isQuote\s*&&\s*(?:!!)?item\.description/);
  });
});
