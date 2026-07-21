import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'index.html'), 'utf-8');

describe('index.html browser translation opt-out', () => {
  it('marks the document as non-translatable via <html translate="no">', () => {
    expect(html).toMatch(/<html[^>]*\btranslate="no"[^>]*>/);
  });

  it('discourages Chrome/Google auto-translate via the notranslate meta tag', () => {
    expect(html).toMatch(/<meta\s+name="google"\s+content="notranslate"\s*\/?>/);
  });
});
