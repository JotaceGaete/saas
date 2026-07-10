import { describe, it, expect } from 'vitest';
import { mergeDraftFormData } from './editorDraftMerge';

describe('mergeDraftFormData', () => {
  it('restaura campos de texto desde el draft', () => {
    const current = { name: 'Tienda actual', description: 'desc vieja' };
    const draft = { name: 'Tienda en borrador', description: 'desc nueva' };
    expect(mergeDraftFormData(current, draft)).toEqual({
      name: 'Tienda en borrador',
      description: 'desc nueva',
    });
  });

  it('restaura logo y portada cuando el draft los trae', () => {
    const current = { logoUrl: 'https://cdn/old-logo.png', headerImageUrl: 'https://cdn/old-cover.png' };
    const draft = { logoUrl: 'https://cdn/new-logo.png', headerImageUrl: 'https://cdn/new-cover.png' };
    expect(mergeDraftFormData(current, draft, ['logoUrl', 'headerImageUrl'])).toEqual({
      logoUrl: 'https://cdn/new-logo.png',
      headerImageUrl: 'https://cdn/new-cover.png',
    });
  });

  it('NUNCA reemplaza logoUrl existente por un valor vacío del draft', () => {
    const current = { logoUrl: 'https://cdn/old-logo.png', name: 'x' };
    const draft = { logoUrl: '', name: 'y' };
    const result = mergeDraftFormData(current, draft, ['logoUrl']);
    expect(result.logoUrl).toBe('https://cdn/old-logo.png');
    expect(result.name).toBe('y');
  });

  it('NUNCA reemplaza headerImageUrl existente cuando el draft no trae el campo', () => {
    const current = { headerImageUrl: 'https://cdn/old-cover.png' };
    const draft = { theme: 'minimal' }; // headerImageUrl ausente, no undefined explícito
    const result = mergeDraftFormData(current, draft, ['headerImageUrl']);
    expect(result.headerImageUrl).toBe('https://cdn/old-cover.png');
  });

  it('permite dejar la imagen vacía si nunca hubo una imagen actual', () => {
    const current = { logoUrl: '' };
    const draft = { logoUrl: '' };
    expect(mergeDraftFormData(current, draft, ['logoUrl']).logoUrl).toBe('');
  });

  it('sin draftFormData devuelve el estado actual sin cambios', () => {
    const current = { name: 'x', logoUrl: 'https://cdn/logo.png' };
    expect(mergeDraftFormData(current, null, ['logoUrl'])).toBe(current);
    expect(mergeDraftFormData(current, undefined, ['logoUrl'])).toBe(current);
  });

  it('aplica la regla a varios campos de imagen de forma independiente', () => {
    const current = { logoUrl: 'https://cdn/logo.png', headerImageUrl: 'https://cdn/cover.png' };
    const draft = { logoUrl: '', headerImageUrl: 'https://cdn/new-cover.png' };
    const result = mergeDraftFormData(current, draft, ['logoUrl', 'headerImageUrl']);
    expect(result.logoUrl).toBe('https://cdn/logo.png');
    expect(result.headerImageUrl).toBe('https://cdn/new-cover.png');
  });
});
