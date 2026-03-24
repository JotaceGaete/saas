import { describe, it, expect } from 'vitest';
import { MARKET_CODES, getPlanPrice, getPlanCurrency } from './markets';

describe('billing market fixed pricing', () => {
  it('returns fixed CL prices and CLP currency', () => {
    expect(getPlanPrice({ marketCode: MARKET_CODES.CL, planSlug: 'pro' })).toBe(5990);
    expect(getPlanPrice({ marketCode: MARKET_CODES.CL, planSlug: 'business' })).toBe(9990);
    expect(getPlanCurrency({ marketCode: MARKET_CODES.CL })).toBe('CLP');
  });

  it('returns fixed AR prices and ARS currency', () => {
    expect(getPlanPrice({ marketCode: MARKET_CODES.AR, planSlug: 'pro' })).toBe(8990);
    expect(getPlanPrice({ marketCode: MARKET_CODES.AR, planSlug: 'business' })).toBe(13990);
    expect(getPlanCurrency({ marketCode: MARKET_CODES.AR })).toBe('ARS');
  });

  it('returns fixed INTL prices and USD currency', () => {
    expect(getPlanPrice({ marketCode: MARKET_CODES.INTL, planSlug: 'pro' })).toBe(6);
    expect(getPlanPrice({ marketCode: MARKET_CODES.INTL, planSlug: 'business' })).toBe(10);
    expect(getPlanCurrency({ marketCode: MARKET_CODES.INTL })).toBe('USD');
  });

  it('falls back unknown market to INTL/USD commercial pricing', () => {
    expect(getPlanPrice({ marketCode: 'UNKNOWN', planSlug: 'pro' })).toBe(6);
    expect(getPlanPrice({ marketCode: 'UNKNOWN', planSlug: 'business' })).toBe(10);
    expect(getPlanCurrency({ marketCode: 'UNKNOWN' })).toBe('USD');
  });

  it('does not mix CL/AR markets with USD currency', () => {
    expect(getPlanCurrency({ marketCode: MARKET_CODES.CL })).not.toBe('USD');
    expect(getPlanCurrency({ marketCode: MARKET_CODES.AR })).not.toBe('USD');
  });
});

