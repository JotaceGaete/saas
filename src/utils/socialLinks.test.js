import { describe, expect, it } from 'vitest';
import { normalizeTikTokUrl } from './socialLinks';

describe('normalizeTikTokUrl', () => {
  it('normalizes a plain username into the canonical TikTok URL', () => {
    expect(normalizeTikTokUrl('joyitaspau')).toBe('https://www.tiktok.com/@joyitaspau');
  });

  it('keeps a handle with @ in canonical format', () => {
    expect(normalizeTikTokUrl('@joyitaspau')).toBe('https://www.tiktok.com/@joyitaspau');
  });

  it('rebuilds canonical URLs from full TikTok profile URLs', () => {
    expect(normalizeTikTokUrl('https://www.tiktok.com/@joyitaspau')).toBe(
      'https://www.tiktok.com/@joyitaspau'
    );
    expect(normalizeTikTokUrl('https://www.tiktok.com/joyitaspau')).toBe(
      'https://www.tiktok.com/@joyitaspau'
    );
  });

  it('trims spaces and accepts uppercase handles and URLs', () => {
    expect(normalizeTikTokUrl('  @JoyitasPau  ')).toBe('https://www.tiktok.com/@JoyitasPau');
    expect(normalizeTikTokUrl('  HTTPS://WWW.TIKTOK.COM/@JoyitasPau/  ')).toBe(
      'https://www.tiktok.com/@JoyitasPau'
    );
  });

  it('accepts incomplete tiktok urls with www and rebuilds the canonical URL', () => {
    expect(normalizeTikTokUrl('www.tiktok.com/@joyitaspau')).toBe(
      'https://www.tiktok.com/@joyitaspau'
    );
  });

  it('returns null for empty or invalid TikTok values', () => {
    expect(normalizeTikTokUrl('')).toBeNull();
    expect(normalizeTikTokUrl('   ')).toBeNull();
    expect(normalizeTikTokUrl('https://www.tiktok.com/404?fromUrl=/joyitaspau')).toBeNull();
    expect(normalizeTikTokUrl('https://example.com/joyitaspau')).toBeNull();
  });
});
