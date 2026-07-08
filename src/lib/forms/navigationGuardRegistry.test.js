import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerActiveFormGuard,
  requestAppNavigation,
  __resetNavigationGuardRegistryForTests,
} from './navigationGuardRegistry';

beforeEach(() => {
  __resetNavigationGuardRegistryForTests();
});

describe('requestAppNavigation without an active guard', () => {
  it('devuelve false (el caller navega normalmente)', () => {
    expect(requestAppNavigation('/crm')).toBe(false);
  });
});

describe('registerActiveFormGuard / requestAppNavigation', () => {
  it('un guard registrado intercepta la navegación y devuelve true', () => {
    const requestNavigation = vi.fn();
    registerActiveFormGuard({ requestNavigation });

    const intercepted = requestAppNavigation('/crm/presupuestos', { replace: true });

    expect(intercepted).toBe(true);
    expect(requestNavigation).toHaveBeenCalledWith('/crm/presupuestos', { replace: true });
  });

  it('des-registrar el guard hace que la navegación vuelva a pasar directo (false)', () => {
    const requestNavigation = vi.fn();
    const unregister = registerActiveFormGuard({ requestNavigation });
    unregister();

    expect(requestAppNavigation('/dashboard')).toBe(false);
    expect(requestNavigation).not.toHaveBeenCalled();
  });

  it('con varios guards registrados (anidados), solo el más reciente intercepta', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerActiveFormGuard({ requestNavigation: first });
    registerActiveFormGuard({ requestNavigation: second });

    requestAppNavigation('/planes');

    expect(second).toHaveBeenCalledWith('/planes', undefined);
    expect(first).not.toHaveBeenCalled();
  });

  it('al des-registrar el más reciente, el anterior vuelve a quedar activo', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerActiveFormGuard({ requestNavigation: first });
    const unregisterSecond = registerActiveFormGuard({ requestNavigation: second });
    unregisterSecond();

    requestAppNavigation('/ayuda');

    expect(first).toHaveBeenCalledWith('/ayuda', undefined);
    expect(second).not.toHaveBeenCalled();
  });
});
