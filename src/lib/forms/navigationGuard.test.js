import { describe, it, expect } from 'vitest';
import { resolveGuardedDestination } from './navigationGuard';

const CURRENT = 'https://app.walinka.com/product-editor?id=123';

describe('resolveGuardedDestination', () => {
  it('intercepta un link interno normal (sidebar, breadcrumb)', () => {
    const dest = resolveGuardedDestination({ href: '/crm/presupuestos', currentHref: CURRENT });
    expect(dest).toEqual({ pathname: '/crm/presupuestos', search: '', hash: '' });
  });

  it('preserva query string y hash del destino', () => {
    const dest = resolveGuardedDestination({ href: '/crm?tab=historial#top', currentHref: CURRENT });
    expect(dest).toEqual({ pathname: '/crm', search: '?tab=historial', hash: '#top' });
  });

  it('no intercepta anclas internas de la misma página (href="#...")', () => {
    expect(resolveGuardedDestination({ href: '#seccion', currentHref: CURRENT })).toBeNull();
  });

  it('no intercepta links externos (otro origin)', () => {
    expect(resolveGuardedDestination({ href: 'https://wa.me/56912345678', currentHref: CURRENT })).toBeNull();
  });

  it('no intercepta target="_blank"', () => {
    expect(resolveGuardedDestination({ href: '/crm', target: '_blank', currentHref: CURRENT })).toBeNull();
  });

  it('no intercepta links de descarga', () => {
    expect(resolveGuardedDestination({ href: '/factura.pdf', hasDownload: true, currentHref: CURRENT })).toBeNull();
  });

  it('no intercepta clicks con botón distinto al izquierdo', () => {
    expect(resolveGuardedDestination({ href: '/crm', button: 1, currentHref: CURRENT })).toBeNull();
  });

  it('no intercepta clicks con teclas modificadoras (abrir en pestaña nueva, etc.)', () => {
    expect(resolveGuardedDestination({ href: '/crm', metaKey: true, currentHref: CURRENT })).toBeNull();
    expect(resolveGuardedDestination({ href: '/crm', ctrlKey: true, currentHref: CURRENT })).toBeNull();
    expect(resolveGuardedDestination({ href: '/crm', shiftKey: true, currentHref: CURRENT })).toBeNull();
    expect(resolveGuardedDestination({ href: '/crm', altKey: true, currentHref: CURRENT })).toBeNull();
  });

  it('no intercepta href vacío o inválido', () => {
    expect(resolveGuardedDestination({ href: '', currentHref: CURRENT })).toBeNull();
    expect(resolveGuardedDestination({ href: undefined, currentHref: CURRENT })).toBeNull();
  });
});
