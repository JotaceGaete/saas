import { describe, expect, it } from 'vitest';
import { PLATFORM_HOSTS, isCustomDomain } from './platformHosts.js';

describe('PLATFORM_HOSTS / isCustomDomain', () => {
  it('1. go.walinka.com NO es custom domain (fix de esta fase)', () => {
    expect(PLATFORM_HOSTS).toContain('go.walinka.com');
    expect(isCustomDomain('go.walinka.com')).toBe(false);
  });

  it('2. go.walinka.com sigue el flujo de platform host en GoRootEntry (src/Routes.jsx)', () => {
    // isCustomDomain() es la ÚNICA condición que GoRootEntry usa para
    // decidir entre "dominio personalizado de catálogo" y "flujo normal de
    // plataforma" (if (customDomain) {...} vs el resto de la función, sin
    // cambios en esta fase). Con isCustomDomain('go.walinka.com') === false
    // ya probado arriba, GoRootEntry entra directo a la rama de plataforma
    // (loader -> Navigate a /dashboard o /login según sesión), exactamente
    // la misma rama, sin modificar, que ya usa go.ventalink.app hoy.
    expect(isCustomDomain('go.walinka.com')).toBe(false);
  });

  it('3. un dominio personalizado real (no listado en PLATFORM_HOSTS) sigue siendo custom domain', () => {
    expect(isCustomDomain('tienda-de-un-negocio.cl')).toBe(true);
    expect(isCustomDomain('catalogo.otro-negocio.com')).toBe(true);
  });

  it('4. go.ventalink.app conserva su comportamiento (no custom domain)', () => {
    expect(isCustomDomain('go.ventalink.app')).toBe(false);
  });

  it('5. el resto de PLATFORM_HOSTS y los casos especiales no se ven afectados por el fix', () => {
    expect(isCustomDomain('ventalink.app')).toBe(false);
    expect(isCustomDomain('cl.ventalink.app')).toBe(false);
    expect(isCustomDomain('miralatienda.de')).toBe(false);
    expect(isCustomDomain('www.miralatienda.de')).toBe(false);
    expect(isCustomDomain('localhost')).toBe(false);
    expect(isCustomDomain('127.0.0.1')).toBe(false);
    expect(isCustomDomain('192.168.1.10')).toBe(false);
    expect(isCustomDomain('saas-abc123.vercel.app')).toBe(false);
  });

  it('no agrega walinka.com ni www.walinka.com sin evidencia -- solo go.walinka.com', () => {
    expect(PLATFORM_HOSTS).not.toContain('walinka.com');
    expect(PLATFORM_HOSTS).not.toContain('www.walinka.com');
    // walinka.com/www.walinka.com en sí mismos NO están en la lista, así
    // que siguen siendo custom domain -- solo go.walinka.com (y cualquier
    // futuro subdominio de go.walinka.com, por el endsWith) se reconoce.
    expect(isCustomDomain('walinka.com')).toBe(true);
    expect(isCustomDomain('www.walinka.com')).toBe(true);
  });

  it('subdominios de go.walinka.com también calzan como platform host (mismo endsWith que el resto de PLATFORM_HOSTS)', () => {
    expect(isCustomDomain('preview.go.walinka.com')).toBe(false);
  });
});
