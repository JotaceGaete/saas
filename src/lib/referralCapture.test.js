import { beforeEach, describe, expect, it } from 'vitest';
import { REFERRAL_STORAGE_KEY, captureReferralCode, getStoredReferralCode } from './referralCapture';

function setUrl(search) {
  window.history.pushState(null, '', `/business-registration${search}`);
}

beforeEach(() => {
  window.sessionStorage.clear();
  setUrl('');
});

describe('captureReferralCode', () => {
  it('captura ?ref= de la URL y lo persiste en sessionStorage', () => {
    setUrl('?ref=ana-1a2b3');

    const result = captureReferralCode();

    expect(result).toBe('ana-1a2b3');
    expect(window.sessionStorage.getItem(REFERRAL_STORAGE_KEY)).toBe('ana-1a2b3');
  });

  it('no usa localStorage en ningún momento', () => {
    setUrl('?ref=ana-1a2b3');
    captureReferralCode();

    expect(window.localStorage.getItem(REFERRAL_STORAGE_KEY)).toBeNull();
  });

  it('si no llega ?ref=, conserva el valor ya guardado (no lo borra)', () => {
    setUrl('?ref=ana-1a2b3');
    captureReferralCode();

    // Remontaje simulado sin ref en la URL (p. ej. login normal, refresh).
    setUrl('');
    const result = captureReferralCode();

    expect(result).toBe('ana-1a2b3');
    expect(window.sessionStorage.getItem(REFERRAL_STORAGE_KEY)).toBe('ana-1a2b3');
  });

  it('si llega un ?ref= nuevo, reemplaza el valor guardado anteriormente', () => {
    setUrl('?ref=ana-1a2b3');
    captureReferralCode();

    setUrl('?ref=bruno-9z8y7');
    const result = captureReferralCode();

    expect(result).toBe('bruno-9z8y7');
    expect(window.sessionStorage.getItem(REFERRAL_STORAGE_KEY)).toBe('bruno-9z8y7');
  });

  it('sin ?ref= y sin nada guardado, retorna null', () => {
    const result = captureReferralCode();
    expect(result).toBeNull();
  });

  it('ignora otros query params y solo lee "ref"', () => {
    setUrl('?utm_source=instagram&utm_medium=social&ref=ana-1a2b3');

    const result = captureReferralCode();

    expect(result).toBe('ana-1a2b3');
  });

  it('simula el round-trip completo de Google OAuth: ref se captura antes de salir, sobrevive el regreso sin ref en la URL', () => {
    // 1. Usuario llega a business-registration?ref=CODIGO (mount inicial).
    setUrl('?ref=ana-1a2b3');
    captureReferralCode();
    expect(getStoredReferralCode()).toBe('ana-1a2b3');

    // 2. Usuario elige "Continuar con Google" -> window.location.href = data.url
    //    (salida completa del origen, fuera del alcance de este test: no hay
    //    forma de simular una navegación real de vuelta y forth en jsdom, pero
    //    sessionStorage sobrevive porque go.ventalink.app es el mismo origen
    //    antes y después del redirect a Google).

    // 3. AuthCallback resuelve la sesión y navega a '/business-registration'
    //    SIN query string (confirmado en src/pages/auth-callback/index.jsx:81:
    //    safeNavigate('/business-registration'), sin ?ref=). Nuevo mount de
    //    BusinessRegistration -> nuevo useEffect -> captureReferralCode() de
    //    nuevo, esta vez sin ref en la URL.
    setUrl('');
    const result = captureReferralCode();

    expect(result).toBe('ana-1a2b3');
    expect(getStoredReferralCode()).toBe('ana-1a2b3');
  });
});

describe('getStoredReferralCode', () => {
  it('lee el valor persistido sin depender de la URL actual', () => {
    setUrl('?ref=ana-1a2b3');
    captureReferralCode();

    setUrl('?utm_source=google');
    expect(getStoredReferralCode()).toBe('ana-1a2b3');
  });

  it('retorna null si nunca se guardó nada', () => {
    expect(getStoredReferralCode()).toBeNull();
  });
});
