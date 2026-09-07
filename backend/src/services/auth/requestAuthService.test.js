import { describe, it, expect } from 'vitest';
import { resolveSupabasePublishableKey } from './requestAuthService.js';

describe('resolveSupabasePublishableKey', () => {
  it('prefers VITE_SUPABASE_PUBLISHABLE_KEY over everything else', () => {
    expect(resolveSupabasePublishableKey({
      publishableViteKey: 'sb_publishable_from_vite',
      publishableKey: 'sb_publishable_plain',
      legacyAnonViteKey: 'legacy.vite.jwt',
      legacyAnonKey: 'legacy.plain.jwt',
    })).toBe('sb_publishable_from_vite');
  });

  it('falls back to SUPABASE_PUBLISHABLE_KEY when the VITE variant is missing', () => {
    expect(resolveSupabasePublishableKey({
      publishableViteKey: undefined,
      publishableKey: 'sb_publishable_plain',
      legacyAnonViteKey: 'legacy.vite.jwt',
      legacyAnonKey: 'legacy.plain.jwt',
    })).toBe('sb_publishable_plain');
  });

  it('falls back to VITE_SUPABASE_ANON_KEY when no publishable key is configured', () => {
    expect(resolveSupabasePublishableKey({
      publishableViteKey: undefined,
      publishableKey: '   ',
      legacyAnonViteKey: 'legacy.vite.jwt',
      legacyAnonKey: 'legacy.plain.jwt',
    })).toBe('legacy.vite.jwt');
  });

  it('falls back to SUPABASE_ANON_KEY as the last resort', () => {
    expect(resolveSupabasePublishableKey({
      publishableViteKey: undefined,
      publishableKey: undefined,
      legacyAnonViteKey: undefined,
      legacyAnonKey: 'legacy.plain.jwt',
    })).toBe('legacy.plain.jwt');
  });

  it('returns an empty string when nothing is configured', () => {
    expect(resolveSupabasePublishableKey({
      publishableViteKey: undefined,
      publishableKey: undefined,
      legacyAnonViteKey: undefined,
      legacyAnonKey: undefined,
    })).toBe('');
  });

  it('trims surrounding whitespace from the resolved value', () => {
    expect(resolveSupabasePublishableKey({
      publishableViteKey: '  sb_publishable_from_vite  ',
      publishableKey: undefined,
      legacyAnonViteKey: undefined,
      legacyAnonKey: undefined,
    })).toBe('sb_publishable_from_vite');
  });
});
