import { describe, it, expect } from 'vitest';
import { WEBSITE_EDITOR_PILOT_SLUGS, canUseWebsiteEditor } from './index';

describe('piloto del editor de sitio web', () => {
  it('la lista del piloto coincide con la restricción SQL (solo artemis-chile)', () => {
    expect(WEBSITE_EDITOR_PILOT_SLUGS).toEqual(['artemis-chile']);
  });

  it('un dueño fuera del piloto no puede usar el editor', () => {
    expect(canUseWebsiteEditor({ business: { slug: 'comercio-no-piloto' }, isAdmin: false })).toBe(false);
  });

  it('el piloto y los admins sí pueden', () => {
    expect(canUseWebsiteEditor({ business: { slug: 'artemis-chile' }, isAdmin: false })).toBe(true);
    expect(canUseWebsiteEditor({ business: { slug: 'comercio-no-piloto' }, isAdmin: true })).toBe(true);
  });
});
