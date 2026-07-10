import { describe, it, expect } from 'vitest';
import { hasValidOgImage } from './ogImage';

describe('hasValidOgImage', () => {
  it('true cuando hay shareImageUrl explícito', () => {
    expect(hasValidOgImage({ designSettings: { shareImageUrl: 'https://cdn/share.png' } })).toBe(true);
  });

  it('true cuando hay portada (coverImageUrl) aunque no haya shareImageUrl ni logo', () => {
    expect(hasValidOgImage({ coverImageUrl: 'https://cdn/cover.png', logoUrl: null, designSettings: {} })).toBe(true);
  });

  it('true cuando solo hay logo, sin portada ni shareImageUrl (misma jerarquía que el backend)', () => {
    expect(hasValidOgImage({ coverImageUrl: null, logoUrl: 'https://cdn/logo.png', designSettings: {} })).toBe(true);
  });

  it('false cuando no hay ninguna imagen configurada', () => {
    expect(hasValidOgImage({ coverImageUrl: null, logoUrl: null, designSettings: {} })).toBe(false);
  });

  it('false para business null/undefined', () => {
    expect(hasValidOgImage(null)).toBe(false);
    expect(hasValidOgImage(undefined)).toBe(false);
  });

  it('prioriza shareImageUrl aunque también haya portada y logo (mismo orden que el backend)', () => {
    expect(hasValidOgImage({
      designSettings: { shareImageUrl: 'https://cdn/share.png' },
      coverImageUrl: 'https://cdn/cover.png',
      logoUrl: 'https://cdn/logo.png',
    })).toBe(true);
  });
});
