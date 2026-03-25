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

  it('returns USD reference amounts for Mexico (not MXN in plan UI)', () => {
    expect(getPlanPrice({ countryCode: 'MX', planSlug: 'pro' })).toBe(6);
    expect(getPlanPrice({ countryCode: 'MX', planSlug: 'business' })).toBe(10);
    expect(getPlanCurrency({ countryCode: 'MX' })).toBe('USD');
  });

  it('returns USD reference for Paraguay (dLocal liquida en PYG al pagar)', () => {
    expect(getPlanPrice({ countryCode: 'PY', planSlug: 'pro' })).toBe(6);
    expect(getPlanCurrency({ countryCode: 'PY' })).toBe('USD');
  });

  it('getPlanConfig respects countryCode over legacy market', () => {
    const proMx = getPlanConfig({ marketCode: MARKET_CODES.INTL, planSlug: 'pro', countryCode: 'MX' });
    expect(proMx.amount).toBe(6);
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
