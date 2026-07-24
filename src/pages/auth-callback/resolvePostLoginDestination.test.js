import { describe, it, expect } from 'vitest';
import { resolvePostLoginDestination } from './resolvePostLoginDestination';

const completeBusiness = {
  id: 'biz-1',
  name: 'Mi Tienda',
  whatsapp: '+56912345678',
  countryCodeDb: 'CL',
  slug: 'mi-tienda',
};

describe('resolvePostLoginDestination', () => {
  it('usuario con un único negocio y catálogo válido: va directo a su catálogo público', () => {
    const result = resolvePostLoginDestination({ business: completeBusiness });
    expect(result).toEqual({ type: 'external', url: 'https://miralatienda.de/catalogo/mi-tienda' });
  });

  it('usuario sin negocio configurado: va al onboarding existente (business-registration)', () => {
    const result = resolvePostLoginDestination({ business: null });
    expect(result).toEqual({ type: 'internal', path: '/business-registration' });
  });

  it('usuario sin negocio configurado: ignora un returnTo explícito (debe pasar por el registro primero)', () => {
    const result = resolvePostLoginDestination({ business: null, returnTo: '/product-management' });
    expect(result).toEqual({ type: 'internal', path: '/business-registration' });
  });

  it('negocio con onboarding incompleto (falta whatsapp): va a /onboarding', () => {
    const result = resolvePostLoginDestination({
      business: { ...completeBusiness, whatsapp: '' },
    });
    expect(result).toEqual({ type: 'internal', path: '/onboarding' });
  });

  it('negocio con onboarding incompleto (falta país): va a /onboarding', () => {
    const result = resolvePostLoginDestination({
      business: { ...completeBusiness, countryCodeDb: null },
    });
    expect(result).toEqual({ type: 'internal', path: '/onboarding' });
  });

  it('negocio completo pero sin slug: va a /business-configuration', () => {
    const result = resolvePostLoginDestination({
      business: { ...completeBusiness, slug: null },
    });
    expect(result).toEqual({ type: 'internal', path: '/business-configuration' });
  });

  it('usuario con varios negocios: no elige uno arbitrariamente, va a /dashboard', () => {
    const result = resolvePostLoginDestination({ business: completeBusiness, hasMultipleBusinesses: true });
    expect(result).toEqual({ type: 'internal', path: '/dashboard' });
  });

  it('varios negocios tiene prioridad incluso si el negocio resuelto luce completo', () => {
    const result = resolvePostLoginDestination({
      business: completeBusiness,
      hasMultipleBusinesses: true,
      returnTo: null,
    });
    expect(result.path).toBe('/dashboard');
  });

  it('login iniciado desde una ruta interna válida: la respeta en vez de ir al catálogo', () => {
    const result = resolvePostLoginDestination({ business: completeBusiness, returnTo: '/product-management' });
    expect(result).toEqual({ type: 'internal', path: '/product-management' });
  });

  it('rechaza un returnTo externo y sigue la resolución normal por estado de negocio', () => {
    const result = resolvePostLoginDestination({ business: completeBusiness, returnTo: 'https://evil.com' });
    expect(result).toEqual({ type: 'external', url: 'https://miralatienda.de/catalogo/mi-tienda' });
  });

  it('rechaza un returnTo protocolo-relativo', () => {
    const result = resolvePostLoginDestination({ business: completeBusiness, returnTo: '//evil.com' });
    expect(result.type).toBe('external');
  });
});
