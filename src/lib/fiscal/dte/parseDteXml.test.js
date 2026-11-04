import { describe, it, expect } from 'vitest';
import { parseDteXml, decodeDteBytes, DteXmlError } from './parseDteXml';
import { verifyTedSignature } from './verifyTed';
import { buildSyntheticDteXml, latin1Bytes } from './__fixtures__/syntheticDte';

function expectCode(fn, code) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(DteXmlError);
    expect(err.code).toBe(code);
    return;
  }
  throw new Error(`se esperaba ${code}`);
}

describe('decodeDteBytes', () => {
  it('decodifica ISO-8859-1 sin corromper eñes ni tildes', () => {
    const xml = buildSyntheticDteXml();
    const text = decodeDteBytes(latin1Bytes(xml));
    expect(text).toContain('Comercial Ñandú SpA');
    expect(text).toBe(xml);
  });
});

describe('parseDteXml', () => {
  it('extrae encabezado, detalle, totales y CAF', () => {
    const dte = parseDteXml(buildSyntheticDteXml());
    expect(dte.tipoDte).toBe(39);
    expect(dte.folio).toBe(1201);
    expect(dte.fechaEmision).toBe('2026-11-01');
    expect(dte.emisor).toMatchObject({ rut: '11111111-1', razonSocial: 'Comercial Ñandú SpA', comuna: 'Coronel' });
    expect(dte.totales).toEqual({ neto: 1000, exento: null, iva: 190, total: 1190 });
    expect(dte.items).toEqual([expect.objectContaining({ nombre: 'Cafe con leche', cantidad: 1, precio: 1190, monto: 1190 })]);
    expect(dte.ted.caf).toMatchObject({ desde: 1001, hasta: 2000, tipoDte: 39, idk: 100 });
  });

  it('entrega el TED sin espacio entre etiquetas y con el texto original', () => {
    const dte = parseDteXml(buildSyntheticDteXml());
    expect(dte.ted.xml.startsWith('<TED version="1.0"><DD><RE>11111111-1</RE>')).toBe(true);
    expect(dte.ted.xml).not.toMatch(/>\s+</);
    expect(dte.ted.xml).toContain('<RS>COMERCIAL ÑANDU SPA</RS>');
    expect(dte.ted.ddXml.startsWith('<DD>')).toBe(true);
  });

  it('da el mismo TED con XML indentado o compacto', () => {
    const a = parseDteXml(buildSyntheticDteXml({ indent: true }));
    const b = parseDteXml(buildSyntheticDteXml({ indent: false }));
    expect(a.ted.ddXml).toBe(b.ted.ddXml);
  });

  it('rechaza un timbre que no describe el documento', () => {
    const xml = buildSyntheticDteXml().replace('<Folio>1201</Folio>', '<Folio>1202</Folio>');
    expectCode(() => parseDteXml(xml), 'TED_MISMATCH');
  });

  it('rechaza un monto del encabezado distinto al del timbre', () => {
    const xml = buildSyntheticDteXml()
      .replace('<MntTotal>1190</MntTotal>', '<MntTotal>2380</MntTotal>')
      .replace('<MntNeto>1000</MntNeto>', '<MntNeto>2190</MntNeto>');
    expectCode(() => parseDteXml(xml), 'TED_MISMATCH');
  });

  it('rechaza totales incoherentes', () => {
    const xml = buildSyntheticDteXml().replace('<IVA>190</IVA>', '<IVA>191</IVA>');
    expectCode(() => parseDteXml(xml), 'DTE_TOTALS_INCONSISTENT');
  });

  it('rechaza un folio fuera del rango del CAF', () => {
    const xml = buildSyntheticDteXml({ folio: 5000 });
    expectCode(() => parseDteXml(xml), 'TED_MISMATCH');
  });

  it('rechaza tipos de documento no soportados', () => {
    const xml = buildSyntheticDteXml().replace('<TipoDTE>39</TipoDTE>', '<TipoDTE>33</TipoDTE>');
    expectCode(() => parseDteXml(xml), 'DTE_TYPE_UNSUPPORTED');
  });

  it('rechaza DOCTYPE, XML mal formado y documentos sin timbre', () => {
    expectCode(() => parseDteXml('<!DOCTYPE x><DTE/>'), 'DTE_XML_DOCTYPE_NOT_ALLOWED');
    expectCode(() => parseDteXml('<DTE><Documento>'), 'DTE_XML_MALFORMED');
    const sinTed = buildSyntheticDteXml().replace(/<TED[\s\S]*<\/TED>/, '');
    expect(() => parseDteXml(sinTed)).toThrow(DteXmlError);
  });

  it('rechaza dos timbres en el mismo archivo', () => {
    const xml = buildSyntheticDteXml();
    const ted = xml.match(/<TED[\s\S]*?<\/TED>/)[0];
    expectCode(() => parseDteXml(xml.replace(ted, ted + ted)), 'TED_NOT_FOUND');
  });
});

describe('verifyTedSignature', () => {
  it('acepta la firma del timbre hecha con la clave del CAF', async () => {
    const dte = parseDteXml(buildSyntheticDteXml());
    await expect(verifyTedSignature(dte.ted)).resolves.toBe(true);
  });

  it('rechaza un timbre alterado después de firmado', async () => {
    const dte = parseDteXml(buildSyntheticDteXml());
    const altered = { ...dte.ted, ddXml: dte.ted.ddXml.replace('<IT1>Cafe con leche</IT1>', '<IT1>Cafe con leche.</IT1>') };
    await expect(verifyTedSignature(altered)).resolves.toBe(false);
  });

  it('rechaza una firma de otra clave o mal formada', async () => {
    const a = parseDteXml(buildSyntheticDteXml());
    const flipped = a.ted.frmt.startsWith('A') ? `B${a.ted.frmt.slice(1)}` : `A${a.ted.frmt.slice(1)}`;
    await expect(verifyTedSignature({ ...a.ted, frmt: flipped })).resolves.toBe(false);
    await expect(verifyTedSignature({ ...a.ted, frmt: 'no-es-base64' })).resolves.toBe(false);
    await expect(verifyTedSignature(null)).resolves.toBe(false);
  });
});
