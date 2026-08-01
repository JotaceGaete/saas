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

/** Mismo cálculo que el useEffect de reset en public-catalog/index.jsx (líneas ~410-414). */
function getResetVisibleCount({ isDesktop, isSlowConnection }) {
  if (isDesktop) return 16;
  if (isSlowConnection) return 4;
  return 8;
}

describe('hasMoreCatalogProducts', () => {
  it('1 producto, visibleCount 8: no debe aparecer "Ver más"', () => {
    expect(hasMoreCatalogProducts(1, 8)).toBe(false);
  });

  it('8 productos, visibleCount 8: no debe aparecer "Ver más"', () => {
    expect(hasMoreCatalogProducts(8, 8)).toBe(false);
  });

  it('9 productos, visibleCount 8: debe aparecer "Ver más"', () => {
    expect(hasMoreCatalogProducts(9, 8)).toBe(true);
  });

  it('16 productos, visibleCount 16 (desktop): no debe aparecer "Ver más"', () => {
    expect(hasMoreCatalogProducts(16, 16)).toBe(false);
  });

  it('17 productos, visibleCount 16 (desktop): debe aparecer "Ver más"', () => {
    expect(hasMoreCatalogProducts(17, 16)).toBe(true);
  });

  it('50 productos, visibleCount 16 (desktop): debe aparecer "Ver más"', () => {
    expect(hasMoreCatalogProducts(50, 16)).toBe(true);
  });

  it('más de 16 productos, visibleCount 8: debe aparecer "Ver más"', () => {
    expect(hasMoreCatalogProducts(25, 8)).toBe(true);
  });

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
  it('1 producto: nunca aparece el botón, no hay nada que revelar', () => {
    const gridProducts = [{ id: 'p0' }];
    const visibleCount = 8;
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(false);
  });

  it('17 productos en desktop: aparece el botón y un click revela el producto 17 y lo hace desaparecer', () => {
    const gridProducts = Array.from({ length: 17 }, (_, i) => ({ id: `p${i}` }));
    const initialVisibleCount = 16; // default desktop

    expect(hasMoreCatalogProducts(gridProducts.length, initialVisibleCount)).toBe(true);

    const { nextVisibleCount, visibleProducts } = revealMore(gridProducts, initialVisibleCount, 12);
    expect(visibleProducts.length).toBe(17);
    expect(visibleProducts).toEqual(gridProducts);
    expect(visibleProducts[16].id).toBe('p16');
    expect(hasMoreCatalogProducts(gridProducts.length, nextVisibleCount)).toBe(false);
  });

  it('50 productos: repetidos clicks permiten llegar hasta el último producto cargado', () => {
    const gridProducts = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}` }));
    let visibleCount = 16; // default desktop, incremento 12 por click

    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(true);

    let step;
    let clicks = 0;
    while (hasMoreCatalogProducts(gridProducts.length, visibleCount)) {
      step = revealMore(gridProducts, visibleCount, 12);
      visibleCount = step.nextVisibleCount;
      clicks += 1;
      expect(clicks).toBeLessThan(10); // guarda contra loop infinito si algo se rompe
    }

    expect(step.visibleProducts.length).toBe(50);
    expect(step.visibleProducts).toEqual(gridProducts);
    expect(step.visibleProducts[49].id).toBe('p49');
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(false);
  });

  it('al pulsar "Ver más", muestra los restantes sin superar el total real del plan', () => {
    // Starter: SQL ya limitó a 20 filas (gridProducts.length = 20). visibleCount mobile inicial = 8.
    const gridProducts = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` }));
    let visibleCount = 8;
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(true);

    const first = revealMore(gridProducts, visibleCount, 8);
    visibleCount = first.nextVisibleCount;
    expect(first.visibleProducts.length).toBe(16);
    expect(first.visibleProducts.length).toBeLessThanOrEqual(gridProducts.length);
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(true);

    const second = revealMore(gridProducts, visibleCount, 8);
    visibleCount = second.nextVisibleCount;
    expect(second.visibleProducts.length).toBe(20);
    expect(second.visibleProducts.length).toBeLessThanOrEqual(gridProducts.length);
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(false);
  });

  it('caso exacto reportado: 21 productos, 16 visibles inicialmente en desktop, el botón revela los 5 restantes', () => {
    const gridProducts = Array.from({ length: 21 }, (_, i) => ({ id: `p${i}` }));
    const initialVisibleCount = 16;

    expect(hasMoreCatalogProducts(gridProducts.length, initialVisibleCount)).toBe(true);
    const restantes = gridProducts.length - initialVisibleCount;
    expect(restantes).toBe(5);

    const { nextVisibleCount, visibleProducts } = revealMore(gridProducts, initialVisibleCount, 12);
    expect(visibleProducts.length).toBe(21);
    expect(visibleProducts).toEqual(gridProducts);
    expect(hasMoreCatalogProducts(gridProducts.length, nextVisibleCount)).toBe(false);
  });

  it('16 productos en mobile: un click revela el resto y el botón desaparece', () => {
    const gridProducts = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}` }));
    let visibleCount = 8; // default mobile

    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(true);

    const { nextVisibleCount, visibleProducts } = revealMore(gridProducts, visibleCount, 8);
    visibleCount = nextVisibleCount;

    expect(visibleProducts.length).toBe(16);
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(false);
  });

  it('más de 16 productos: permite seguir pulsando "Ver más" hasta mostrarlos todos', () => {
    const gridProducts = Array.from({ length: 25 }, (_, i) => ({ id: `p${i}` }));
    let visibleCount = 8; // default mobile, incremento 8 por click

    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(true);

    let step = revealMore(gridProducts, visibleCount, 8);
    visibleCount = step.nextVisibleCount; // 16
    expect(step.visibleProducts.length).toBe(16);
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(true);

    step = revealMore(gridProducts, visibleCount, 8);
    visibleCount = step.nextVisibleCount; // 24
    expect(step.visibleProducts.length).toBe(24);
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(true);

    step = revealMore(gridProducts, visibleCount, 8);
    visibleCount = step.nextVisibleCount; // 32, pero slice se acota a 25
    expect(step.visibleProducts.length).toBe(25);
    expect(step.visibleProducts).toEqual(gridProducts);
    expect(hasMoreCatalogProducts(gridProducts.length, visibleCount)).toBe(false);
  });
});

describe('productos con precio oculto (show_price: false)', () => {
  it('cuenta por igual productos con precio visible y oculto: el botón aparece si hay más de 8 en total', () => {
    const gridProducts = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `visible-${i}`, showPrice: true })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `oculto-${i}`, showPrice: false })),
    ];
    expect(gridProducts.length).toBe(9);

    expect(hasMoreCatalogProducts(gridProducts.length, 8)).toBe(true);

    const { visibleProducts } = revealMore(gridProducts, 8, 8);
    expect(visibleProducts).toHaveLength(9);
    expect(visibleProducts.filter((p) => p.showPrice === false)).toHaveLength(4);
    expect(hasMoreCatalogProducts(gridProducts.length, 8 + 8)).toBe(false);
  });

  it('8 productos con precio oculto: no debe aparecer "Ver más" si no hay más de 8', () => {
    const gridProducts = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, showPrice: false }));
    expect(hasMoreCatalogProducts(gridProducts.length, 8)).toBe(false);
  });
});

describe('planes: Starter, Pro y Business', () => {
  // hasMoreCatalogProducts no debe depender del plan — el tope de plan ya se aplica
  // en la consulta a Supabase (getPublicProducts). Estas pruebas fijan ese contrato:
  // el mismo conteo produce el mismo resultado sin importar de qué plan venga.

  it('Starter (tope de plan = 20): con más productos que visibleCount, aparece "Ver más"', () => {
    expect(hasMoreCatalogProducts(20, 8)).toBe(true);
  });

  it('Pro (tope de plan = 100): con más productos que visibleCount, aparece "Ver más"', () => {
    expect(hasMoreCatalogProducts(60, 16)).toBe(true);
  });

  it('Business/Full (sin tope de plan): con más productos que visibleCount, aparece "Ver más"', () => {
    expect(hasMoreCatalogProducts(30, 16)).toBe(true);
  });

  it('mismo conteo (12 productos, visibleCount 8) da el mismo resultado en los tres planes', () => {
    const result = hasMoreCatalogProducts(12, 8);
    expect(result).toBe(true);
    // Repetir la misma llamada representa Starter, Pro y Business: la función no
    // recibe (ni necesita) el plan como parámetro, así que el resultado es idéntico.
    expect(hasMoreCatalogProducts(12, 8)).toBe(result);
  });
});

describe('cambio de categoría reinicia visibleCount', () => {
  it('al cambiar de categoría, visibleCount vuelve al default del dispositivo y el botón refleja el nuevo conteo filtrado', () => {
    // Catálogo completo: 20 productos, mobile, ya reveló 16 vía "Ver más".
    const allProducts = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, category: i < 5 ? 'Zapatos' : 'Otros' }));
    let visibleCount = 16;
    expect(hasMoreCatalogProducts(allProducts.length, visibleCount)).toBe(true);

    // Usuaria selecciona la categoría "Zapatos" (5 productos). El useEffect de
    // public-catalog/index.jsx resetea visibleCount al default del dispositivo
    // cada vez que cambia selectedCategory.
    const zapatos = allProducts.filter((p) => p.category === 'Zapatos');
    visibleCount = getResetVisibleCount({ isDesktop: false, isSlowConnection: false });
    expect(visibleCount).toBe(8);

    // Con solo 5 productos en la categoría, el botón no debe aparecer.
    expect(hasMoreCatalogProducts(zapatos.length, visibleCount)).toBe(false);

    // Vuelve a "Todos": el reset también se dispara, y con 20 productos totales
    // el botón debe volver a aparecer (no queda atascado en el estado de la
    // categoría anterior).
    visibleCount = getResetVisibleCount({ isDesktop: false, isSlowConnection: false });
    expect(hasMoreCatalogProducts(allProducts.length, visibleCount)).toBe(true);
  });

  it('el reset de visibleCount usa el default de escritorio cuando corresponde', () => {
    expect(getResetVisibleCount({ isDesktop: true, isSlowConnection: false })).toBe(16);
    expect(getResetVisibleCount({ isDesktop: false, isSlowConnection: true })).toBe(4);
    expect(getResetVisibleCount({ isDesktop: false, isSlowConnection: false })).toBe(8);
  });
});
