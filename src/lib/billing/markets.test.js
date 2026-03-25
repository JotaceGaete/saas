import { describe, it, expect } from 'vitest';
import { MARKET_CODES, getPlanPrice, getPlanCurrency, getPlanConfig } from './markets';

describe('billing market pricing by country (countryPricing)', () => {
  it('returns CLP amounts for Chile', () => {
    expect(getPlanPrice({ countryCode: 'CL', planSlug: 'pro' })).toBe(5990);
    expect(getPlanPrice({ countryCode: 'CL', planSlug: 'business' })).toBe(9990);
    expect(getPlanCurrency({ countryCode: 'CL' })).toBe('CLP');
  });

  it('returns ARS amounts for Argentina', () => {
    expect(getPlanPrice({ countryCode: 'AR', planSlug: 'pro' })).toBe(8990);
    expect(getPlanPrice({ countryCode: 'AR', planSlug: 'business' })).toBe(13990);
    expect(getPlanCurrency({ countryCode: 'AR' })).toBe('ARS');
  });

  it('returns PYG amounts for Paraguay (aligned currency + price)', () => {
    expect(getPlanPrice({ countryCode: 'PY', planSlug: 'pro' })).toBe(45000);
    expect(getPlanPrice({ countryCode: 'PY', planSlug: 'business' })).toBe(76000);
    expect(getPlanCurrency({ countryCode: 'PY' })).toBe('PYG');
  });

  it('returns MXN amounts for Mexico', () => {
    expect(getPlanPrice({ countryCode: 'MX', planSlug: 'pro' })).toBe(120);
    expect(getPlanCurrency({ countryCode: 'MX' })).toBe('MXN');
  });

  it('getPlanConfig respects countryCode over legacy market', () => {
    const proPy = getPlanConfig({ marketCode: MARKET_CODES.INTL, planSlug: 'pro', countryCode: 'PY' });
    expect(proPy.amount).toBe(45000);
  });

  it('legacy marketCode still works when countryCode omitted', () => {
    expect(getPlanPrice({ marketCode: MARKET_CODES.CL, planSlug: 'pro' })).toBe(5990);
    expect(getPlanPrice({ marketCode: MARKET_CODES.AR, planSlug: 'pro' })).toBe(8990);
    expect(getPlanPrice({ marketCode: MARKET_CODES.INTL, planSlug: 'pro' })).toBe(6);
    expect(getPlanPrice({ marketCode: 'UNKNOWN', planSlug: 'pro' })).toBe(6);
    expect(getPlanCurrency({ marketCode: MARKET_CODES.CL })).not.toBe('USD');
    expect(getPlanCurrency({ marketCode: MARKET_CODES.AR })).not.toBe('USD');
  });
});
