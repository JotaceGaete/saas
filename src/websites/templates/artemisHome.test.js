import { describe, it, expect } from 'vitest';
import {
  buildArtemisHomeDefaults,
  buildEditorInitialDraft,
  validateArtemisHomeContent,
} from './artemisHome';

const IMG = (name) => `https://media.gong.cl/businesses/b0000000-0000-0000-0000-000000000001/cover/${name}.png`;

function publishable() {
  const doc = buildArtemisHomeDefaults();
  doc.sections.editorialIngles.image.url = IMG('1763600000000');
  doc.sections.editorialVintage.image.url = IMG('1763600000001');
  return doc;
}

describe('artemis-home contrato v1', () => {
  it('los valores iniciales de la portada son el texto actual de Artemis', () => {
    const d = buildArtemisHomeDefaults();
    expect(d.sections.editorialIngles.title).toBe('Lotes seleccionados con vajillas, tazas, fuentes y mucho más');
    expect(d.sections.editorialIngles.highlights).toHaveLength(3);
    expect(d.sections.editorialVintage.href).toBe('/catalogo?categoria=vintage');
  });

  it('un documento completo con imágenes autorizadas es válido', () => {
    expect(validateArtemisHomeContent(publishable())).toEqual([]);
  });

  it('el borrador inicial del editor no es publicable hasta subir imágenes', () => {
    const errors = validateArtemisHomeContent(buildEditorInitialDraft());
    expect(errors.some((e) => e.includes('editorialIngles.image.url'))).toBe(true);
    expect(errors.some((e) => e.includes('editorialVintage.image.url'))).toBe(true);
  });

  it.each([
    ['host arbitrario', 'https://evil.example.com/a.png'],
    ['sufijo engañoso', 'https://media.gong.cl.evil.com/a.png'],
    ['userinfo', 'https://media.gong.cl@evil.com/a.png'],
    ['query string', 'https://media.gong.cl/a.png?x=1'],
    ['http', 'http://media.gong.cl/a.png'],
    ['ruta local', '/images/editorial-ingles.png'],
  ])('rechaza imagen con %s', (_, url) => {
    const d = publishable();
    d.sections.editorialVintage.image.url = url;
    expect(validateArtemisHomeContent(d).length).toBeGreaterThan(0);
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['protocol-relative', '//evil.example'],
    ['sin barra inicial', 'catalogo'],
    ['barra invertida', '/a\\b'],
  ])('rechaza destino %s', (_, href) => {
    const d = publishable();
    d.sections.editorialVintage.href = href;
    expect(validateArtemisHomeContent(d).some((e) => e.includes('href'))).toBe(true);
  });

  it('exige exactamente tres destacados', () => {
    const d = publishable();
    d.sections.editorialIngles.highlights = ['a', 'b'];
    expect(validateArtemisHomeContent(d).some((e) => e.includes('highlights'))).toBe(true);
  });

  it('rechaza claves extra en la raíz, en sections o secciones desconocidas', () => {
    const extraRoot = { ...publishable(), extra: true };
    expect(validateArtemisHomeContent(extraRoot).length).toBeGreaterThan(0);
    const extraSection = publishable();
    extraSection.sections.editorialNuevo = extraSection.sections.editorialVintage;
    expect(validateArtemisHomeContent(extraSection).length).toBeGreaterThan(0);
  });

  it('rechaza textos fuera de límite', () => {
    const d = publishable();
    d.sections.editorialIngles.title = 'x'.repeat(91);
    d.sections.editorialIngles.ctaLabel = '';
    const errors = validateArtemisHomeContent(d);
    expect(errors.some((e) => e.includes('title'))).toBe(true);
    expect(errors.some((e) => e.includes('ctaLabel'))).toBe(true);
  });

  it('rechaza una versión distinta de contrato', () => {
    const d = { ...publishable(), version: '2' };
    expect(validateArtemisHomeContent(d).some((e) => e.includes('Versión'))).toBe(true);
  });
});

describe('artemis-home contrato v1: cierre de claves y conteo', () => {
  it('rechaza claves extra dentro de una sección', () => {
    const d = publishable();
    d.sections.editorialVintage.extra = 'x';
    expect(validateArtemisHomeContent(d).some((e) => e.includes('editorialVintage: hay claves'))).toBe(true);
  });

  it('rechaza claves extra dentro de la imagen', () => {
    const d = publishable();
    d.sections.editorialIngles.image.width = 10;
    expect(validateArtemisHomeContent(d).some((e) => e.includes('image: claves'))).toBe(true);
  });

  it('cuenta caracteres como puntos de código, no como unidades UTF-16', () => {
    const d = publishable();
    d.sections.editorialIngles.eyebrow = '😀'.repeat(40); // 40 caracteres, 80 unidades UTF-16
    expect(validateArtemisHomeContent(d)).toEqual([]);
    d.sections.editorialIngles.eyebrow = '😀'.repeat(41);
    expect(validateArtemisHomeContent(d).some((e) => e.includes('eyebrow'))).toBe(true);
  });
});
