/**
 * customerEmail.js — validación/normalización del email opcional del
 * comprador (EMAIL-PAYMENTS-2). Compatibilidad con el backend:
 * supabase/functions/create-merchant-mp-checkout/lib.ts (parseCustomer),
 * MAX_EMAIL_LENGTH=254, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.
 */
import { describe, it, expect } from 'vitest';
import { MAX_CUSTOMER_EMAIL_LENGTH, normalizeCustomerEmailInput, isValidCustomerEmail } from './customerEmail';

describe('MAX_CUSTOMER_EMAIL_LENGTH', () => {
  it('coincide con MAX_EMAIL_LENGTH del backend (254)', () => {
    expect(MAX_CUSTOMER_EMAIL_LENGTH).toBe(254);
  });
});

describe('normalizeCustomerEmailInput', () => {
  it('recorta espacios al inicio/fin', () => {
    expect(normalizeCustomerEmailInput('  foo@bar.com  ')).toBe('foo@bar.com');
  });

  it('vacío/null/undefined -- ausencia de email', () => {
    expect(normalizeCustomerEmailInput('')).toBe('');
    expect(normalizeCustomerEmailInput(null)).toBe('');
    expect(normalizeCustomerEmailInput(undefined)).toBe('');
    expect(normalizeCustomerEmailInput('   ')).toBe('');
  });
});

describe('isValidCustomerEmail', () => {
  it('vacío (tras trim) es válido -- campo opcional', () => {
    expect(isValidCustomerEmail('')).toBe(true);
    expect(isValidCustomerEmail('   ')).toBe(true);
    expect(isValidCustomerEmail(null)).toBe(true);
    expect(isValidCustomerEmail(undefined)).toBe(true);
  });

  it('email con formato válido es válido', () => {
    expect(isValidCustomerEmail('comprador@example.com')).toBe(true);
    expect(isValidCustomerEmail('  comprador@example.com  ')).toBe(true);
  });

  it('rechaza formato inválido (sin @, sin dominio, con espacios internos)', () => {
    expect(isValidCustomerEmail('no-es-un-email')).toBe(false);
    expect(isValidCustomerEmail('falta-dominio@')).toBe(false);
    expect(isValidCustomerEmail('@sin-usuario.com')).toBe(false);
    expect(isValidCustomerEmail('sin punto@dominio')).toBe(false);
    expect(isValidCustomerEmail('con espacio@dominio.com')).toBe(false);
  });

  it('rechaza longitud > 254 (compatible con MAX_EMAIL_LENGTH del backend)', () => {
    const longLocal = 'a'.repeat(250);
    const tooLong = `${longLocal}@x.com`; // > 254 chars
    expect(tooLong.length).toBeGreaterThan(254);
    expect(isValidCustomerEmail(tooLong)).toBe(false);
  });

  it('acepta longitud exactamente 254', () => {
    const local = 'a'.repeat(254 - '@x.com'.length);
    const exact = `${local}@x.com`;
    expect(exact.length).toBe(254);
    expect(isValidCustomerEmail(exact)).toBe(true);
  });

  it('rechaza CR/LF en cualquier posición, incluso si el trim los eliminaría en los bordes', () => {
    expect(isValidCustomerEmail('foo@bar.com\n')).toBe(false);
    expect(isValidCustomerEmail('\rfoo@bar.com')).toBe(false);
    expect(isValidCustomerEmail('foo@bar.com\r\nBcc: x@evil.com')).toBe(false);
    expect(isValidCustomerEmail('fo\no@bar.com')).toBe(false);
  });
});
