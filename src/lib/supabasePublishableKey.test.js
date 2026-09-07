import { describe, it, expect } from 'vitest';
import { resolveSupabasePublishableKey } from './supabasePublishableKey';

describe('resolveSupabasePublishableKey', () => {
  it('prefers the publishable key when present', () => {
    expect(resolveSupabasePublishableKey({
      publishableKey: 'sb_publishable_abc',
      legacyAnonKey: 'legacy.jwt.value',
    })).toBe('sb_publishable_abc');
  });

  it('falls back to the legacy anon key when publishable key is missing', () => {
    expect(resolveSupabasePublishableKey({
      publishableKey: undefined,
      legacyAnonKey: 'legacy.jwt.value',
    })).toBe('legacy.jwt.value');
  });

  it('falls back to the legacy anon key when publishable key is blank', () => {
    expect(resolveSupabasePublishableKey({
      publishableKey: '   ',
      legacyAnonKey: 'legacy.jwt.value',
    })).toBe('legacy.jwt.value');
  });

  it('returns an empty string when neither is configured', () => {
    expect(resolveSupabasePublishableKey({
      publishableKey: undefined,
      legacyAnonKey: undefined,
    })).toBe('');
  });

  it('trims surrounding whitespace from the resolved value', () => {
    expect(resolveSupabasePublishableKey({
      publishableKey: '  sb_publishable_abc  ',
      legacyAnonKey: undefined,
    })).toBe('sb_publishable_abc');
  });
});
