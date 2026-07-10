import { describe, it, expect } from 'vitest';
import { hasMoreCatalogProducts } from './catalogPagination';

/**
 * Simula la revelación incremental del catálogo público: mismo cálculo que
 * el click handler de "Ver más productos" en public-catalog/index.jsx
 * (setVisibleCount(c => c + increment) seguido de gridProducts.slice(0, visibleCount)).
 */
function revealMore(gridProducts, visibleCount, increment) {
  const nextVisibleCount = visibleCount + increment;
  const visibleProducts = gridProducts.slice(0, nextVisibleCount);
  return { nextVisibleCount, visibleProducts };
}

describe('hasMoreCatalogProducts', () => {
  it('Starter/Pro con más productos que visibleCount: debe aparecer "Ver más"', () => {
    // Negocio starter (tope de plan = 20) con 12 productos activos, visto en mobile (visibleCount inicial = 8).
    expect(hasMoreCatalogProducts(12, 8)).toBe(true);
  });

  it('Starter/Pro cuando gridProducts.length === visibleCount: no debe aparecer', () => {
    // Negocio starter con exactamente 20 productos (el tope del plan), ya revelados todos.
    expect(hasMoreCatalogProducts(20, 20)).toBe(false);
  });

  it('Starter/Pro cuando visibleCount ya superó gridProducts.length: no debe aparecer', () => {
    expect(hasMoreCatalogProducts(9, 20)).toBe(false);
  });

  it('Business/Full con más productos que visibleCount: debe aparecer "Ver más"', () => {
    // Plan sin límite (maxProducts=null): 21 productos, visibleCount inicial desktop = 16.
    expect(hasMoreCatalogProducts(21, 16)).toBe(true);
  });

  it('Business/Full cuando ya se revelaron todos los productos: no debe aparecer', () => {
    expect(hasMoreCatalogProducts(21, 21)).toBe(false);
  });
});

describe('revelar "Ver más productos" (click handler)', () => {
  it('al pulsar "Ver más", muestra los restantes sin superar el total real del plan', () => {
    // Starter: SQL ya limitó a 20 filas (gridProducts.length = 20). visibleCount mobile inicial = 8.
    const gridProducts = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` }));
    let visibleCount = 8;
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(true);

    // Click en mobile: incremento de 8.
    const first = revealMore(gridProducts, visibleCount, 8);
    visibleCount = first.nextVisibleCount;
    expect(first.visibleProducts.length).toBe(16);
    expect(first.visibleProducts.length).toBeLessThanOrEqual(gridProducts.length);
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(true);

    // Segundo click: revela el resto sin exceder gridProducts.length (el límite real del plan).
    const second = revealMore(gridProducts, visibleCount, 8);
    visibleCount = second.nextVisibleCount;
    expect(second.visibleProducts.length).toBe(20);
    expect(second.visibleProducts.length).toBeLessThanOrEqual(gridProducts.length);
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(false);
  });

  it('caso exacto reportado: 21 productos, 16 visibles inicialmente en desktop, el botón revela los 5 restantes', () => {
    const gridProducts = Array.from({ length: 21 }, (_, i) => ({ id: `p${i}` }));
    const initialVisibleCount = 16; // default desktop (public-catalog/index.jsx:207)

    expect(hasMoreCatalogProducts(gridProducts.length, initialVisibleCount)).toBe(true);
    const restantes = gridProducts.length - initialVisibleCount;
    expect(restantes).toBe(5);

    // Click en desktop: incremento de 12 (public-catalog/index.jsx:1360).
    const { nextVisibleCount, visibleProducts } = revealMore(gridProducts, initialVisibleCount, 12);
    expect(visibleProducts.length).toBe(21);
    expect(visibleProducts).toEqual(gridProducts);
    expect(hasMoreCatalogProducts(gridProducts.length, nextVisibleCount)).toBe(false);
  });
});
