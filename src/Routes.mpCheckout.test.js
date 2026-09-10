/**
 * Routes.jsx — tests estáticos (source-scan) de las rutas nuevas de
 * retorno de pago de MP-CHECKOUT-3. BrowserRouter está hardcodeado
 * dentro de Routes.jsx (no es inyectable), así que un render completo
 * vía MemoryRouter no es directamente posible sin refactorizar el
 * archivo -- fuera de alcance ("no rehacer la UI salvo lo mínimo
 * necesario"). El renderizado real de CatalogPaymentReturn en las
 * rutas `/catalogo/:slug/pago/:status` y `/catalog/:slug/pago/:status`
 * ya está cubierto por
 * src/pages/catalog-payment-return/index.test.jsx.
 */
import { describe, it, expect } from 'vitest';
import routesSource from './Routes.jsx?raw';

describe('Routes — rutas de retorno de pago (MP-CHECKOUT-3)', () => {
  it('declara /catalogo/:slug/pago/:status -> CatalogPaymentReturn', () => {
    expect(routesSource).toMatch(/<Route path="\/catalogo\/:slug\/pago\/:status" element=\{<CatalogPaymentReturn \/>\} \/>/);
  });

  it('declara el alias /catalog/:slug/pago/:status -> CatalogPaymentReturn', () => {
    expect(routesSource).toMatch(/<Route path="\/catalog\/:slug\/pago\/:status" element=\{<CatalogPaymentReturn \/>\} \/>/);
  });

  it('importa CatalogPaymentReturn', () => {
    expect(routesSource).toMatch(/import CatalogPaymentReturn from '\.\/pages\/catalog-payment-return';/);
  });

  it('ambas rutas nuevas están declaradas ANTES del catch-all /:slug (para que React Router pueda matchearlas -- aunque en v6 la especificidad ya lo garantiza, se verifica el orden por claridad)', () => {
    const paymentReturnIdx = routesSource.lastIndexOf('/pago/:status');
    const catchAllIdx = routesSource.indexOf('path="/:slug"');
    expect(paymentReturnIdx).toBeGreaterThan(-1);
    expect(catchAllIdx).toBeGreaterThan(-1);
    expect(paymentReturnIdx).toBeLessThan(catchAllIdx);
  });
});
