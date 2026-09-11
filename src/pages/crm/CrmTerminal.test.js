/**
 * CrmTerminal.jsx — tests estáticos (source-scan) del lock de doble
 * submit y de la idempotency key de venta (TPV-CORE-1). Mismo criterio
 * que public-catalog/mpCheckout.test.js: el archivo es grande y con
 * demasiadas dependencias (contexto de negocio, plan features, Supabase)
 * para un render completo vía RTL sin mocks extensos y frágiles.
 *
 * El mecanismo de idempotencia AUTORITATIVO es la base de datos
 * (crm_create_pos_sale, ver su propio test) -- lo que se prueba acá es
 * que el frontend genera/reutiliza la key correctamente y que el lock de
 * React (submitLockRef) está en el lugar correcto. El lock de React es
 * solo UX (ver comentario en el propio componente).
 *
 * TPV-CORE-2 agrega, con el mismo criterio de source-scan: el borrador
 * local persistente (autosave/flush/restauración, ver
 * src/lib/posTerminalDraftStorage.js y su propio test ejecutable real),
 * el manejo de un cliente restaurado que ya no existe, y el botón
 * "Ver carrito" + targets táctiles ≥44px en mobile. Ninguno de estos
 * source-scans reemplaza una prueba manual en navegador ni un E2E real.
 *
 * TPV-CORE-3 agrega, mismo criterio: el flujo de checkout en dos etapas
 * (checkoutStep 'sale' | 'payment'), puramente de UI -- nunca persistido
 * en el draft, nunca crea/modifica registros. La lógica de pagos/cuenta
 * corriente/idempotencia NO se reimplementa, solo se reordena su
 * visibilidad; estos tests confirman que el JSX de pagos sigue siendo
 * exactamente el mismo bloque (no una copia) y que el nuevo estado no se
 * mete donde no corresponde (draft, handleRegister, applyDraft).
 *
 * TPV-STOCK-UX-1 agrega, mismo criterio: validación inmediata de stock
 * (stockById/cartQtyByProduct/cartStockIssues), el guard de addToCart/
 * updateQty, el indicador "Stock: N"/"Sin stock" en la grilla, la marca
 * de reconciliación de un draft con cantidad > stock actual, el bloqueo
 * de COBRAR, y el manejo del nuevo STOCK_INSUFFICIENT estructurado (ver
 * crmService.js y su propio test para el parseo). crm_create_pos_sale
 * sigue siendo la autoridad final bajo lock -- nada de esto la reemplaza,
 * solo evita llegar hasta el servidor para enterarse de algo que el
 * navegador ya sabe.
 *
 * TPV-CORE-4 agrega, mismo criterio: secciones expandibles independientes
 * (cartExpanded/paymentsExpanded), puramente de presentación -- nunca
 * persistidas en el draft, nunca fuerzan exclusividad entre sí. El
 * carrito expandido reutiliza EXACTAMENTE el mismo cart.map de siempre
 * (nunca una segunda versión); Pagos expandido reutiliza EXACTAMENTE el
 * mismo bloque de pagos. El bloque negro de Total+CTA final nunca queda
 * anidado dentro de ninguna de las dos secciones colapsables.
 */
import { describe, it, expect } from 'vitest';
import indexSource from './CrmTerminal.jsx?raw';

const handleRegisterMatch = indexSource.match(
  /const handleRegister = async \(\) => \{[\s\S]*?\n  \};/,
);

describe('CrmTerminal — lock síncrono contra doble submit (escenario 12)', () => {
  it('declara submitLockRef como useRef(false), no un useState', () => {
    expect(indexSource).toMatch(/const submitLockRef = useRef\(false\);/);
  });

  it('handleRegister existe y usa el lock', () => {
    expect(handleRegisterMatch).not.toBeNull();
  });

  it('el lock se chequea y se toma ANTES de cualquier await/llamada async, en la primera línea útil de la función', () => {
    const body = handleRegisterMatch[0];
    const lockCheckIdx = body.indexOf('if (submitLockRef.current) return;');
    const lockSetIdx = body.indexOf('submitLockRef.current = true;');
    const firstAwaitIdx = body.indexOf('await ');
    expect(lockCheckIdx).toBeGreaterThan(-1);
    expect(lockSetIdx).toBeGreaterThan(-1);
    expect(lockCheckIdx).toBeLessThan(lockSetIdx);
    expect(lockSetIdx).toBeLessThan(firstAwaitIdx);
  });

  it('el lock se libera en un finally -- se resetea sin importar qué rama de error se tome', () => {
    const body = handleRegisterMatch[0];
    expect(body).toMatch(/\} finally \{\s*\n\s*submitLockRef\.current = false;\s*\n\s*setBusy\(false\);\s*\n\s*\}/);
  });

  it('el botón de completar venta sigue deshabilitado mientras busy (defensa adicional, no la única)', () => {
    expect(indexSource).toMatch(/disabled=\{cart\.length === 0 \|\| busy \|\| isPaymentInvalid\}/);
  });
});

describe('CrmTerminal — idempotency key estable por intento de venta', () => {
  it('usa crypto.randomUUID() cuando está disponible, con fallback si no', () => {
    expect(indexSource).toMatch(/typeof crypto !== 'undefined' && typeof crypto\.randomUUID === 'function'/);
    expect(indexSource).toMatch(/crypto\.randomUUID\(\)/);
  });

  it('la key se guarda en un useRef (no un useState) -- no dispara re-render, se lee de forma síncrona', () => {
    expect(indexSource).toMatch(/const saleIdempotencyKeyRef = useRef\(null\);/);
  });

  it('getOrCreateSaleIdempotencyKey genera la key UNA sola vez -- si ya existe, la reutiliza', () => {
    expect(indexSource).toMatch(
      /const getOrCreateSaleIdempotencyKey = \(\) => \{\s*\n\s*if \(!saleIdempotencyKeyRef\.current\) \{/,
    );
  });

  it('handleRegister pasa la key al llamar a createPosInvoice', () => {
    expect(handleRegisterMatch[0]).toMatch(/idempotencyKey: getOrCreateSaleIdempotencyKey\(\)/);
  });

  it('la key SOLO se limpia en resetForm (reset real de intento) -- nunca dentro de handleRegister ni en un catch/timeout', () => {
    expect(handleRegisterMatch[0]).not.toMatch(/saleIdempotencyKeyRef\.current = null/);
    const resetFormMatch = indexSource.match(/const resetForm = \(\) => \{[\s\S]*?\n  \};/);
    expect(resetFormMatch).not.toBeNull();
    expect(resetFormMatch[0]).toMatch(/saleIdempotencyKeyRef\.current = null;/);
  });

  it('handleNewSale (post-venta) pasa por resetForm -- ahí es donde se renueva la key para la siguiente venta', () => {
    const handleNewSaleMatch = indexSource.match(/const handleNewSale = \(\) => \{[\s\S]*?\n  \};/);
    expect(handleNewSaleMatch).not.toBeNull();
    expect(handleNewSaleMatch[0]).toMatch(/resetForm\(\);/);
  });
});

describe('CrmTerminal — createPosInvoice ya no recibe paymentMethod (movido server-side)', () => {
  it('el llamado a createPosInvoice ya no arma un paymentMethod calculado en el cliente', () => {
    const callMatch = handleRegisterMatch[0].match(/await createPosInvoice\(business\.id, \{[\s\S]*?\}\);/);
    expect(callMatch).not.toBeNull();
    expect(callMatch[0]).not.toMatch(/paymentMethod:/);
    expect(callMatch[0]).toMatch(/payments: appliedPayments,/);
    expect(callMatch[0]).toMatch(/idempotencyKey: getOrCreateSaleIdempotencyKey\(\),/);
  });
});

describe('CrmTerminal — validaciones cliente preservadas como fast-path (la RPC es la autoridad real)', () => {
  it('sigue chequeando vuelto/no-efectivo, cuenta corriente sin cliente, y caja abierta antes de llamar a la RPC', () => {
    const body = handleRegisterMatch[0];
    expect(body).toMatch(/if \(hasNonCashOverpay\) \{/);
    expect(body).toMatch(/if \(requiresCustomerForPending && !customerId\) \{/);
    expect(body).toMatch(/if \(appliedPayments\.length > 0\) \{/);
  });
});

/**
 * TPV-CORE-2 — borrador local de la venta en curso + carrito visible.
 *
 * Igual que el resto de este archivo: source-scan sobre el JSX/lógica tal
 * como aparece en el código fuente, vía import ?raw. Esto prueba que el
 * mecanismo (efectos, refs, wiring de eventos, clases CSS) está presente
 * y en el orden correcto -- NUNCA que el navegador realmente lo ejecuta
 * así (no hay render real ni DOM real de localStorage/scrollIntoView acá).
 * Ese comportamiento de runtime solo se puede verificar con una prueba
 * manual en el navegador o un E2E real, ninguno de los cuales reemplaza
 * este archivo.
 */
describe('CrmTerminal — idempotency key eager (carrito vacío → primer ítem)', () => {
  it('addToCart genera la key al pasar de carrito vacío a un primer producto normal', () => {
    const addToCartMatch = indexSource.match(/const addToCart = \(product\) => \{[\s\S]*?\n  \};/);
    expect(addToCartMatch).not.toBeNull();
    expect(addToCartMatch[0]).toMatch(/if \(prev\.length === 0\) getOrCreateSaleIdempotencyKey\(\);/);
  });

  it('addManualItem también genera la key al pasar de carrito vacío a un primer ítem manual', () => {
    const addManualItemMatch = indexSource.match(/const addManualItem = \([\s\S]*?\n  \};/);
    expect(addManualItemMatch).not.toBeNull();
    expect(addManualItemMatch[0]).toMatch(/if \(prev\.length === 0\) getOrCreateSaleIdempotencyKey\(\);/);
  });
});

describe('CrmTerminal — borrador local: restauración conserva la key exacta', () => {
  it('applyDraft asigna saleIdempotencyKeyRef.current = draft.idempotencyKey -- nunca genera una nueva', () => {
    const applyDraftMatch = indexSource.match(/const applyDraft = useCallback\(\(draft\) => \{[\s\S]*?\n  \}, \[\]\);/);
    expect(applyDraftMatch).not.toBeNull();
    expect(applyDraftMatch[0]).toMatch(/saleIdempotencyKeyRef\.current = draft\.idempotencyKey;/);
    expect(applyDraftMatch[0]).not.toMatch(/crypto\.randomUUID/);
  });

  it('handleRecoverStaleDraft reutiliza applyDraft (misma ruta que la restauración automática, sin key nueva)', () => {
    const handleRecoverMatch = indexSource.match(/const handleRecoverStaleDraft = \(\) => \{[\s\S]*?\n  \};/);
    expect(handleRecoverMatch).not.toBeNull();
    expect(handleRecoverMatch[0]).toMatch(/applyDraft\(draftNotice\.pending\);/);
  });

  it('un retry (reintento tras error) no pasa por resetForm ni por applyDraft -- la key sigue intacta en saleIdempotencyKeyRef', () => {
    // handleRegister ya se prueba arriba (no limpia la key salvo en el `finally` de éxito ahora agregado);
    // acá solo confirmamos que el bloque de éxito no la null-ea, solo limpia el draft persistido.
    const successBlockMatch = indexSource.match(/if \(error\) \{[\s\S]*?setTicketData\(\{ sale: data, \.\.\.saleSnapshot \}\);/);
    expect(successBlockMatch).not.toBeNull();
    expect(successBlockMatch[0]).not.toMatch(/saleIdempotencyKeyRef\.current = null/);
  });
});

describe('CrmTerminal — reset y éxito limpian el borrador persistido y su key', () => {
  it('resetForm cancela el debounce pendiente y borra el draft de storage', () => {
    const resetFormMatch = indexSource.match(/const resetForm = \(\) => \{[\s\S]*?\n  \};/);
    expect(resetFormMatch).not.toBeNull();
    expect(resetFormMatch[0]).toMatch(/draftDebouncerRef\.current\.cancel\(\);/);
    expect(resetFormMatch[0]).toMatch(/if \(draftKey\) removePosTerminalDraft\(draftKey\);/);
    expect(resetFormMatch[0]).toMatch(/saleIdempotencyKeyRef\.current = null;/);
  });

  it('una venta exitosa cancela el debounce y borra el draft antes de mostrar el ticket', () => {
    const successBlockMatch = indexSource.match(/\/\/ Venta completada[\s\S]*?setTicketData\(\{ sale: data, \.\.\.saleSnapshot \}\);/);
    expect(successBlockMatch).not.toBeNull();
    expect(successBlockMatch[0]).toMatch(/draftDebouncerRef\.current\.cancel\(\);/);
    expect(successBlockMatch[0]).toMatch(/if \(draftKey\) removePosTerminalDraft\(draftKey\);/);
  });
});

describe('CrmTerminal — autosave: debounce + flush en los eventos correctos', () => {
  it('el efecto de autosave programa la escritura solo cuando ya se resolvió la restauración y no hay ticket mostrándose', () => {
    expect(indexSource).toMatch(
      /if \(!restoreCheckedRef\.current \|\| ticketData\) return;\s*\n\s*draftDebouncerRef\.current\.schedule\(\(\) => persistDraftNowRef\.current\(\)\);/,
    );
  });

  it('persistDraftNow nunca persiste un carrito vacío (no auto-limpia un borrador todavía no decidido)', () => {
    const persistMatch = indexSource.match(/const persistDraftNow = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[[\s\S]*?\]\);/);
    expect(persistMatch).not.toBeNull();
    expect(persistMatch[0]).toMatch(/if \(!draftKey \|\| cart\.length === 0\) return;/);
  });

  it('flushDraft se registra en visibilitychange (oculto), beforeunload y pagehide', () => {
    expect(indexSource).toMatch(/document\.addEventListener\('visibilitychange', handleVisibility\);/);
    expect(indexSource).toMatch(/window\.addEventListener\('beforeunload', flushDraft\);/);
    expect(indexSource).toMatch(/window\.addEventListener\('pagehide', flushDraft\);/);
  });

  it('el cleanup de ese efecto remueve los 3 listeners (evita fugas de memoria/doble registro)', () => {
    expect(indexSource).toMatch(/document\.removeEventListener\('visibilitychange', handleVisibility\);/);
    expect(indexSource).toMatch(/window\.removeEventListener\('beforeunload', flushDraft\);/);
    expect(indexSource).toMatch(/window\.removeEventListener\('pagehide', flushDraft\);/);
  });

  it('existe un efecto de desmontaje dedicado que hace FLUSH, nunca cancel -- no repite el bug histórico del product editor', () => {
    const unmountFlushMatch = indexSource.match(
      /useEffect\(\(\) => \(\) => \{[\s\S]*?draftDebouncerRef\.current\.flush\(\(\) => persistDraftNowRef\.current\(\)\);\s*\n\s*\}, \[\]\);/,
    );
    expect(unmountFlushMatch).not.toBeNull();
    expect(unmountFlushMatch[0]).toMatch(/Nunca reemplazar\s*\n\s*\/\/ este flush por un cancel/);
  });
});

describe('CrmTerminal — restauración por antigüedad del borrador (mismo día vs. otro día)', () => {
  it('un borrador del mismo día se restaura automáticamente vía isDraftFromToday', () => {
    const restoreEffectMatch = indexSource.match(/\/\/ Restauración al montar[\s\S]*?\n  \}, \[draftKey, applyDraft\]\);/);
    expect(restoreEffectMatch).not.toBeNull();
    expect(restoreEffectMatch[0]).toMatch(/if \(isDraftFromToday\(draft\.savedAt\)\) \{/);
    expect(restoreEffectMatch[0]).toMatch(/applyDraft\(draft\);/);
    expect(restoreEffectMatch[0]).toMatch(/setDraftNotice\('restored'\);/);
  });

  it('un borrador de OTRO día NO se restaura en silencio -- se guarda como pendiente de decisión', () => {
    const restoreEffectMatch = indexSource.match(/\/\/ Restauración al montar[\s\S]*?\n  \}, \[draftKey, applyDraft\]\);/);
    expect(restoreEffectMatch[0]).toMatch(/setDraftNotice\(\{ pending: draft \}\);/);
  });

  it('el banner de decisión ofrece Recuperar venta y Descartar', () => {
    expect(indexSource).toMatch(/Tienes una venta pendiente del/);
    expect(indexSource).toMatch(/onClick=\{handleRecoverStaleDraft\}/);
    expect(indexSource).toMatch(/onClick=\{handleDiscardStaleDraft\}/);
  });

  it('Descartar borra el draft persistido', () => {
    const discardMatch = indexSource.match(/const handleDiscardStaleDraft = \(\) => \{[\s\S]*?\n  \};/);
    expect(discardMatch).not.toBeNull();
    expect(discardMatch[0]).toMatch(/if \(draftKey\) removePosTerminalDraft\(draftKey\);/);
  });
});

describe('CrmTerminal — cliente eliminado (customerId restaurado que ya no existe)', () => {
  it('si el customerId restaurado no está entre los clientes cargados, se limpia y se avisa (nunca se convierte en silencio a consumidor final)', () => {
    const effectMatch = indexSource.match(/\/\/ Cliente eliminado[\s\S]*?\n  \}, \[customersLoaded, customersDisplay, customerId\]\);/);
    expect(effectMatch).not.toBeNull();
    expect(effectMatch[0]).toMatch(/const exists = customersDisplay\.some\(\(c\) => c\.id === customerId\);/);
    expect(effectMatch[0]).toMatch(/setCustomerId\(''\);/);
    expect(effectMatch[0]).toMatch(/setCustomerRemovedNotice\(true\);/);
  });

  it('el aviso informa explícitamente que el cliente ya no está disponible', () => {
    expect(indexSource).toMatch(/El cliente de esta venta ya no está disponible\./);
  });
});

describe('CrmTerminal — carrito visible en mobile: botón "Ver carrito"', () => {
  it('el botón solo aparece con carrito no vacío y hace scrollIntoView al contenedor real del carrito', () => {
    expect(indexSource).toMatch(/\{cart\.length > 0 && \(\s*\n\s*<button[\s\S]*?Ver carrito \(\{cartCount\}\)/);
    expect(indexSource).toMatch(/cartSectionRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  });

  it('cartSectionRef está asignado al contenedor real de Zone 2 (la tarjeta del carrito)', () => {
    expect(indexSource).toMatch(/ref=\{cartSectionRef\}/);
  });
});

describe('CrmTerminal — targets táctiles ≥44px en los controles del carrito', () => {
  it('los 3 botones de fila de carrito (reducir/eliminar, aumentar, quitar) miden 44x44 (w-11 h-11), ya no 28x28 (w-7 h-7)', () => {
    const cartRowMatch = indexSource.match(/\{cart\.map\(item => \{[\s\S]*?\n {24}\}\)\}/);
    expect(cartRowMatch).not.toBeNull();
    const w11Count = (cartRowMatch[0].match(/w-11 h-11/g) || []).length;
    expect(w11Count).toBe(3);
    expect(cartRowMatch[0]).not.toMatch(/w-7 h-7/);
  });
});

/**
 * TPV-CORE-3 — flujo de checkout en dos etapas (venta → cobro).
 * Mismo criterio de source-scan que el resto del archivo.
 */
describe('CrmTerminal — checkoutStep: estado inicial y transiciones', () => {
  it('el estado inicial es \'sale\'', () => {
    expect(indexSource).toMatch(/const \[checkoutStep, setCheckoutStep\] = useState\('sale'\);/);
  });

  it('handleGoToPayment no avanza a payment con el carrito vacío', () => {
    const match = indexSource.match(/const handleGoToPayment = \(\) => \{[\s\S]*?\n  \};/);
    expect(match).not.toBeNull();
    expect(match[0]).toMatch(/if \(cart\.length === 0\) return;/);
    expect(match[0]).toMatch(/setCheckoutStep\('payment'\);/);
  });

  it('handleBackToSale vuelve a \'sale\' -- solo cambia el paso y expande el carrito (TPV-CORE-4), ninguna otra cosa', () => {
    const match = indexSource.match(/const handleBackToSale = \(\) => \{[\s\S]*?\n  \};/);
    expect(match).not.toBeNull();
    expect(match[0]).toMatch(/setCheckoutStep\('sale'\);/);
    expect(match[0]).toMatch(/setCartExpanded\(true\);/);
    // No debe tocar cart/customerId/discount/notes/payments/idempotency key/draft
    // (setCart\( y setPayments\( con paréntesis -- nunca confundir con
    // setCartExpanded/setPaymentsExpanded, que sí son de esta función).
    expect(match[0]).not.toMatch(/setCart\(|setCustomerId|setDiscount|setNotes|setPayments\(|saleIdempotencyKeyRef|removePosTerminalDraft/);
  });
});

describe('CrmTerminal — etapa Venta no muestra el bloque completo de pagos', () => {
  it('el bloque condicional de \'sale\' no incluye el selector de método de pago ni "Agregar medio de pago"', () => {
    const saleBlockMatch = indexSource.match(/\n {20}\{checkoutStep === 'sale' && \([\s\S]*?(?=\n {20}\{checkoutStep === 'payment' && \()/);
    expect(saleBlockMatch).not.toBeNull();
    expect(saleBlockMatch[0]).not.toMatch(/REAL_PAYMENT_METHODS\.map/);
    expect(saleBlockMatch[0]).not.toMatch(/Vender a cuenta corriente/);
    expect(saleBlockMatch[0]).not.toMatch(/Agregar medio de pago/);
    expect(saleBlockMatch[0]).not.toMatch(/Pagado<\/p>/);
  });

  it('la etapa Venta sí conserva descuento y notas', () => {
    const saleBlockMatch = indexSource.match(/\n {20}\{checkoutStep === 'sale' && \([\s\S]*?(?=\n {20}\{checkoutStep === 'payment' && \()/);
    expect(saleBlockMatch[0]).toMatch(/placeholder="Descuento"/);
    expect(saleBlockMatch[0]).toMatch(/placeholder="Notas…"/);
  });

  it('el CTA principal de la etapa Venta es "Cobrar $total", usando el total real -- nunca "Completar"', () => {
    const saleBlockMatch = indexSource.match(/\n {20}\{checkoutStep === 'sale' && \([\s\S]*?(?=\n {20}\{checkoutStep === 'payment' && \()/);
    expect(saleBlockMatch[0]).toMatch(/onClick=\{handleGoToPayment\}/);
    expect(saleBlockMatch[0]).toMatch(/Cobrar \{fmt\(total, business\?\.currency\)\}/);
    expect(saleBlockMatch[0]).not.toMatch(/Completar venta/);
  });

  it('el CTA de Cobrar se deshabilita con el carrito vacío', () => {
    const saleBlockMatch = indexSource.match(/\n {20}\{checkoutStep === 'sale' && \([\s\S]*?(?=\n {20}\{checkoutStep === 'payment' && \()/);
    expect(saleBlockMatch[0]).toMatch(/disabled=\{cart\.length === 0 \|\| hasStockIssues\}/);
  });
});

describe('CrmTerminal — etapa Cobro reutiliza el bloque de pagos existente (no lo reimplementa)', () => {
  const paymentBlockMatch = indexSource.match(/\{checkoutStep === 'payment' && \([\s\S]*?\n {20}\)\}\n\n {18}<\/div>\{\/\* end zone 3 \*\/\}/);

  it('el bloque de \'payment\' existe y contiene el selector de método, cuenta corriente y "Agregar medio de pago"', () => {
    expect(paymentBlockMatch).not.toBeNull();
    expect(paymentBlockMatch[0]).toMatch(/REAL_PAYMENT_METHODS\.map/);
    expect(paymentBlockMatch[0]).toMatch(/Vender a cuenta corriente/);
    expect(paymentBlockMatch[0]).toMatch(/Agregar medio de pago/);
  });

  it('el resumen Pagado/Pendiente/Vuelto (pago mixto) sigue presente sin cambios de fórmula', () => {
    // TPV-CORE-4: el resumen (incl. Vuelto) ahora vive en un único nodo
    // compartido `paymentSummaryGrid` (sección 7: no duplicar el cálculo
    // en dos lugares) referenciado desde este bloque por nombre, no
    // repetido como JSX literal -- se verifica la referencia acá y la
    // fórmula en su propia definición, una sola vez en todo el archivo.
    expect(paymentBlockMatch[0]).toMatch(/fmt\(paidTotal, business\?\.currency\)/);
    expect(paymentBlockMatch[0]).toMatch(/fmt\(pendingBalance, business\?\.currency\)/);
    expect(paymentBlockMatch[0]).toMatch(/\{paymentSummaryGrid\}/);

    const summaryDeclMatch = indexSource.match(/const paymentSummaryGrid = \(\s*\n[\s\S]*?\n {2}\);/);
    expect(summaryDeclMatch).not.toBeNull();
    expect(summaryDeclMatch[0]).toMatch(/fmt\(paidTotal, business\?\.currency\)/);
    expect(summaryDeclMatch[0]).toMatch(/fmt\(pendingBalance, business\?\.currency\)/);
    expect(summaryDeclMatch[0]).toMatch(/fmt\(change, business\?\.currency\)/);

    const occurrences = (indexSource.match(/fmt\(change, business\?\.currency\)/g) || []).length;
    expect(occurrences).toBe(1); // una sola definición, nunca duplicada
  });

  it('el botón final de la etapa Cobro dice "Confirmar venta" y llama a handleRegister -- ya no "Completar venta"', () => {
    expect(paymentBlockMatch[0]).toMatch(/onClick=\{handleRegister\}/);
    expect(paymentBlockMatch[0]).toMatch(/Confirmar venta/);
    expect(paymentBlockMatch[0]).not.toMatch(/Completar venta/);
  });

  it('existe un botón "Volver a la venta" que llama a handleBackToSale', () => {
    expect(paymentBlockMatch[0]).toMatch(/onClick=\{handleBackToSale\}/);
    expect(paymentBlockMatch[0]).toMatch(/Volver a la venta/);
  });

  it('solo hay UN bloque de pagos en todo el archivo -- no se duplicó la lógica de pagos', () => {
    const occurrences = (indexSource.match(/REAL_PAYMENT_METHODS\.map/g) || []).length;
    expect(occurrences).toBe(1);
  });
});

describe('CrmTerminal — error de RPC mantiene la etapa payment y conserva la idempotency key', () => {
  it('handleRegister solo cambia checkoutStep en la rama STOCK_INSUFFICIENT (TPV-STOCK-UX-1) -- nunca en éxito ni en cualquier otro error', () => {
    // El único setCheckoutStep de toda la función debe estar DENTRO del
    // branch STOCK_INSUFFICIENT (vuelve a 'sale' para que el cajero
    // corrija) -- en éxito, y en cualquier otro error, el paso no cambia.
    const stockBranchMatch = handleRegisterMatch[0].match(
      /if \(error\.code === 'STOCK_INSUFFICIENT' && error\.stockInsufficient\) \{[\s\S]*?\n {8}\} else \{/,
    );
    expect(stockBranchMatch).not.toBeNull();
    expect(stockBranchMatch[0]).toMatch(/setCheckoutStep\('sale'\);/);

    const withoutStockBranch = handleRegisterMatch[0].replace(stockBranchMatch[0], '');
    expect(withoutStockBranch).not.toMatch(/setCheckoutStep/);
  });

  it('el bloque de error de handleRegister no toca cart/payments/idempotency key -- permite reintentar sin perder nada', () => {
    const errorBranchMatch = handleRegisterMatch[0].match(/if \(error\) \{[\s\S]*?\n {6}\}/);
    expect(errorBranchMatch).not.toBeNull();
    expect(errorBranchMatch[0]).not.toMatch(/setCart\(|setPayments\(|saleIdempotencyKeyRef/);
  });
});

describe('CrmTerminal — restauración de draft siempre vuelve a \'sale\' (decisión TPV-CORE-3 sección 11)', () => {
  it('applyDraft nunca asigna checkoutStep -- el draft no lo persiste ni lo restaura', () => {
    const applyDraftMatch = indexSource.match(/const applyDraft = useCallback\(\(draft\) => \{[\s\S]*?\n  \}, \[\]\);/);
    expect(applyDraftMatch).not.toBeNull();
    expect(applyDraftMatch[0]).not.toMatch(/checkoutStep/);
  });

  it('buildPosTerminalDraftSnapshot no recibe checkoutStep -- nunca se persiste', () => {
    const persistMatch = indexSource.match(/const persistDraftNow = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[[\s\S]*?\]\);/);
    expect(persistMatch).not.toBeNull();
    expect(persistMatch[0]).not.toMatch(/checkoutStep/);
  });
});

describe('CrmTerminal — reset/nueva venta vuelve a \'sale\'', () => {
  it('resetForm restablece checkoutStep a \'sale\'', () => {
    const resetFormMatch = indexSource.match(/const resetForm = \(\) => \{[\s\S]*?\n  \};/);
    expect(resetFormMatch).not.toBeNull();
    expect(resetFormMatch[0]).toMatch(/setCheckoutStep\('sale'\);/);
  });
});

describe('CrmTerminal — mobile: CTA coherente, sin duplicar carrito, sin dos CTA simultáneos', () => {
  it('la franja superior de la barra fija muestra "Volver a la venta" en payment y "Ver carrito" en sale -- nunca ambos', () => {
    const mobileBarMatch = indexSource.match(/lg:hidden fixed bottom-0[\s\S]*?end zone 3 no aplica aquí|<div className="lg:hidden fixed bottom-0[\s\S]*?\n            <\/div>\n\n          <\/>/);
    expect(mobileBarMatch).not.toBeNull();
    expect(mobileBarMatch[0]).toMatch(/checkoutStep === 'payment' \? \(\s*\n\s*<button\s*\n\s*type="button"\s*\n\s*onClick=\{handleBackToSale\}/);
    expect(mobileBarMatch[0]).toMatch(/Volver a la venta/);
    expect(mobileBarMatch[0]).toMatch(/Ver carrito \(\{cartCount\}\)/);
  });

  it('el CTA inferior de la barra fija es "Cobrar" en sale y "Confirmar"\\/"+ Pago" en payment -- nunca dos CTA de venta a la vez', () => {
    const mobileBarMatch = indexSource.match(/<div className="lg:hidden fixed bottom-0[\s\S]*?\n            <\/div>\n\n          <\/>/);
    expect(mobileBarMatch).not.toBeNull();
    expect(mobileBarMatch[0]).toMatch(/checkoutStep === 'sale' \? \(/);
    expect(mobileBarMatch[0]).toMatch(/onClick=\{handleGoToPayment\}/);
    expect(mobileBarMatch[0]).toMatch(/>\s*Cobrar\s*<\/button>|Cobrar\s*<\/button>/);
    expect(mobileBarMatch[0]).toMatch(/Confirmar<\/>/);
  });

  it('no se duplicó el JSX del carrito -- sigue existiendo un único cart.map', () => {
    const occurrences = (indexSource.match(/\{cart\.map\(item => [({]/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('el carrito colapsado (TPV-CORE-4: !cartExpanded, default en payment) reemplaza el detalle por un resumen compacto (no repite el listado de ítems)', () => {
    expect(indexSource).toMatch(/!cartExpanded \? \(\s*\n\s*<div className="px-4 py-3 text-xs text-gray-500">/);
  });
});

describe('CrmTerminal — cliente en etapa Cobro (sin duplicar estado)', () => {
  it('el resumen de cliente en Zone 1 reutiliza selectedCustomer -- no declara un segundo selector/estado', () => {
    expect(indexSource).toMatch(/\{selectedCustomer && \(\s*\n\s*<div className="mt-2 flex items-center gap-1\.5 text-xs text-gray-500">/);
  });
});

describe('CrmTerminal — targets táctiles de los nuevos CTA (TPV-CORE-3) ≥44px, sin regresionar los de TPV-CORE-2', () => {
  it('el botón desktop "Cobrar" y "Volver a la venta" declaran min-h-[44px]', () => {
    expect(indexSource).toMatch(/Cobrar \{fmt\(total, business\?\.currency\)\}/);
    const cobrarBtnMatch = indexSource.match(/onClick=\{handleGoToPayment\}\s*\n\s*disabled=\{cart\.length === 0 \|\| hasStockIssues\}\s*\n\s*className="[^"]*min-h-\[44px\][^"]*"/);
    expect(cobrarBtnMatch).not.toBeNull();
    const volverBtnMatch = indexSource.match(/onClick=\{handleBackToSale\}\s*\n\s*className="[^"]*min-h-\[44px\][^"]*"/);
    expect(volverBtnMatch).not.toBeNull();
  });

  it('la franja "Volver a la venta" de la barra fija mobile también declara min-h-[44px]', () => {
    const mobileBackMatch = indexSource.match(/onClick=\{handleBackToSale\}\s*\n\s*className="[^"]*min-h-\[44px\][^"]*"[\s\S]{0,200}Volver a la venta/);
    expect(mobileBackMatch).not.toBeNull();
  });

  it('los 3 botones +\\/-\\/eliminar del carrito siguen en w-11 h-11 (no regresionaron a w-7 h-7)', () => {
    const cartRowMatch = indexSource.match(/\{cart\.map\(item => \{[\s\S]*?\n {24}\}\)\}/);
    expect(cartRowMatch).not.toBeNull();
    const w11Count = (cartRowMatch[0].match(/w-11 h-11/g) || []).length;
    expect(w11Count).toBe(3);
  });
});

/**
 * TPV-STOCK-UX-1 — validación inmediata de stock en el TPV.
 * Mismo criterio de source-scan que el resto del archivo: prueba que el
 * MECANISMO (condiciones exactas, JSX, wiring) está en el código fuente
 * en el lugar correcto -- nunca que React/el navegador lo ejecuta así.
 * addToCart/updateQty son funciones puras de JS embebidas en el
 * componente; sin un harness de render con estado real, se auditan por
 * su texto fuente exacto, igual que el resto de este archivo desde
 * TPV-CORE-1.
 */
describe('CrmTerminal — stockById/cartQtyByProduct/cartStockIssues: semántica NULL/0/N', () => {
  it('el mapa de stock nunca convierte NULL en 0 -- guarda p.stock_actual tal cual (null incluido)', () => {
    const stockByIdMatch = indexSource.match(/const stockById = useMemo\(\(\) => \{[\s\S]*?\n {2}\}, \[posProducts, allProducts\]\);/);
    expect(stockByIdMatch).not.toBeNull();
    expect(stockByIdMatch[0]).toMatch(/map\.set\(p\.id, p\.stock_actual\)/);
    expect(stockByIdMatch[0]).not.toMatch(/\|\| 0|\?\? 0/);
  });

  it('addToCart: el guard usa comparación explícita contra null/undefined -- nunca !stockLimit (que trataría 0 como "sin límite")', () => {
    const addToCartMatch = indexSource.match(/const addToCart = \(product\) => \{[\s\S]*?\n {2}\};/);
    expect(addToCartMatch).not.toBeNull();
    expect(addToCartMatch[0]).toMatch(/stockLimit !== null && stockLimit !== undefined && currentQty \+ 1 > stockLimit/);
    expect(addToCartMatch[0]).not.toMatch(/if \(!stockLimit/);
  });

  it('stock NULL (sin control) nunca bloquea -- la condición del guard exige stockLimit !== null primero', () => {
    // stockLimit === null -> "stockLimit !== null" es false -> el guard
    // completo es false por cortocircuito -- nunca entra al bloque que
    // bloquea el agregado, cualquiera sea currentQty.
    const addToCartMatch = indexSource.match(/const addToCart = \(product\) => \{[\s\S]*?\n {2}\};/);
    expect(addToCartMatch[0]).toMatch(/const stockLimit = product\.stock_actual; \/\/ null = sin control de stock/);
  });

  it('stock 0 bloquea -- currentQty (0) + 1 > 0 es true bajo la misma condición que cualquier N', () => {
    const addToCartMatch = indexSource.match(/const addToCart = \(product\) => \{[\s\S]*?\n {2}\};/);
    // La condición no distingue stockLimit===0 de stockLimit>0: ambos son
    // "!== null && !== undefined", así que currentQty+1>stockLimit se
    // evalúa igual -- con stockLimit=0 y currentQty=0, 1>0 es true.
    expect(addToCartMatch[0]).toMatch(/currentQty \+ 1 > stockLimit/);
  });

  it('el feedback de "sin stock" usa setErrorMsg (el sistema visual existente) -- nunca alert()', () => {
    const addToCartMatch = indexSource.match(/const addToCart = \(product\) => \{[\s\S]*?\n {2}\};/);
    expect(addToCartMatch[0]).toMatch(/setErrorMsg\(`No hay más stock disponible de \$\{product\.name\}\. Disponible: \$\{stockLimit\}\.`\);/);
    expect(indexSource).not.toMatch(/\balert\(/);
  });

  it('líneas manuales (product_id null) nunca entran a cartQtyByProduct/cartStockIssues', () => {
    const cartQtyMatch = indexSource.match(/const cartQtyByProduct = useMemo\(\(\) => \{[\s\S]*?\n {2}\}, \[cart\]\);/);
    expect(cartQtyMatch).not.toBeNull();
    expect(cartQtyMatch[0]).toMatch(/if \(!item\.product_id\) return;/);

    const issuesMatch = indexSource.match(/const cartStockIssues = useMemo\(\(\) => \{[\s\S]*?\n {2}\}, \[cart, stockById, cartQtyByProduct\]\);/);
    expect(issuesMatch).not.toBeNull();
    expect(issuesMatch[0]).toMatch(/if \(!item\.product_id\) return;/);
  });

  it('producto repetido no evade el límite -- cartQtyByProduct SUMA todas las líneas del mismo product_id, nunca mira una línea aislada', () => {
    const cartQtyMatch = indexSource.match(/const cartQtyByProduct = useMemo\(\(\) => \{[\s\S]*?\n {2}\}, \[cart\]\);/);
    expect(cartQtyMatch[0]).toMatch(/map\.set\(item\.product_id, \(map\.get\(item\.product_id\) \|\| 0\) \+ item\.quantity\);/);
  });
});

describe('CrmTerminal — botón + del carrito respeta stock_actual (sección 5)', () => {
  it('updateQty solo valida el límite cuando delta > 0 -- decrementar (delta < 0) nunca se bloquea, siempre puede volver a habilitar el +', () => {
    const updateQtyMatch = indexSource.match(/const updateQty = \(_key, delta\) => \{[\s\S]*?\n {2}\};/);
    expect(updateQtyMatch).not.toBeNull();
    expect(updateQtyMatch[0]).toMatch(/if \(delta > 0 && i\.product_id\) \{/);
  });

  it('updateQty compara contra la cantidad TOTAL agregada del producto (cartQtyByProduct), no solo la línea actual', () => {
    const updateQtyMatch = indexSource.match(/const updateQty = \(_key, delta\) => \{[\s\S]*?\n {2}\};/);
    expect(updateQtyMatch[0]).toMatch(/const totalForProduct = cartQtyByProduct\.get\(i\.product_id\) \|\| i\.quantity;/);
    expect(updateQtyMatch[0]).toMatch(/if \(totalForProduct \+ delta > stockLimit\) return i;/);
  });

  it('el botón + de cada línea se deshabilita visualmente (disabled + estilo atenuado) al llegar al límite', () => {
    const cartRowMatch = indexSource.match(/\{cart\.map\(item => \{[\s\S]*?\n {24}\}\)\}/);
    expect(cartRowMatch).not.toBeNull();
    expect(cartRowMatch[0]).toMatch(/const atStockLimit = typeof stockLimit === 'number' && totalForProduct >= stockLimit;/);
    expect(cartRowMatch[0]).toMatch(/disabled=\{atStockLimit\}/);
    expect(cartRowMatch[0]).toMatch(/atStockLimit\s*\n\s*\? 'bg-gray-50 text-gray-300 cursor-not-allowed'/);
  });

  it('el botón − sigue sin ningún guard de stock -- solo el + lo tiene', () => {
    const cartRowMatch = indexSource.match(/\{cart\.map\(item => \{[\s\S]*?\n {24}\}\)\}/);
    const minusButtonMatch = cartRowMatch[0].match(/onClick=\{\(\) => updateQty\(item\._key, -1\)\}[\s\S]*?<\/button>/);
    expect(minusButtonMatch).not.toBeNull();
    expect(minusButtonMatch[0]).not.toMatch(/disabled=/);
  });
});

describe('CrmTerminal — draft restaurado con cantidad > stock actual (sección 8): nunca se ajusta solo', () => {
  it('applyDraft no referencia stock/stockById en absoluto -- restaura la cantidad EXACTA del draft, la reconciliación es responsabilidad del render, no de la restauración', () => {
    const applyDraftMatch = indexSource.match(/const applyDraft = useCallback\(\(draft\) => \{[\s\S]*?\n {2}\}, \[\]\);/);
    expect(applyDraftMatch).not.toBeNull();
    expect(applyDraftMatch[0]).not.toMatch(/stock/i);
  });

  it('la línea con insuficiencia muestra "Stock disponible: X · En carrito: Y" en vez de corregirse en silencio', () => {
    expect(indexSource).toMatch(/Stock disponible: \{issue\.available\} · En carrito: \{issue\.requested\}/);
  });

  it('ofrece "Ajustar a N" (reducir) y "Eliminar" -- ambos requieren un click explícito del cajero, ninguno se dispara solo', () => {
    expect(indexSource).toMatch(/onClick=\{\(\) => setCartQuantityTo\(item\._key, issue\.available\)\}/);
    expect(indexSource).toMatch(/Ajustar a \{issue\.available\}/);
  });

  it('setCartQuantityTo solo se invoca desde ese botón -- nunca automáticamente en un efecto/render', () => {
    const setQtyDeclMatch = indexSource.match(/const setCartQuantityTo = \(_key, quantity\) => \{[\s\S]*?\n {2}\};/);
    expect(setQtyDeclMatch).not.toBeNull();
    const callSites = (indexSource.match(/setCartQuantityTo\(/g) || []).length;
    expect(callSites).toBe(1); // solo el onClick de "Ajustar a N" -- la declaración usa `= (_key, quantity) =>`, no matchea este regex
  });
});

describe('CrmTerminal — COBRAR deshabilitado si hay insuficiencia conocida (sección 12)', () => {
  it('handleGoToPayment tiene un guard defensivo además del disabled del botón', () => {
    const handleGoToPaymentMatch = indexSource.match(/const handleGoToPayment = \(\) => \{[\s\S]*?\n {2}\};/);
    expect(handleGoToPaymentMatch).not.toBeNull();
    expect(handleGoToPaymentMatch[0]).toMatch(/if \(hasStockIssues\) return;/);
  });

  it('el botón desktop y el mobile muestran "Revisa N producto(s) sin stock suficiente" cerca del CTA', () => {
    const occurrences = (indexSource.match(/Revisa \{cartStockIssues\.size\} producto\{cartStockIssues\.size === 1 \? '' : 's'\} sin stock suficiente\./g) || []).length;
    expect(occurrences).toBe(2);
  });

  it('ambos disabled del CTA Cobrar (desktop y mobile) incluyen hasStockIssues', () => {
    const occurrences = (indexSource.match(/disabled=\{cart\.length === 0 \|\| hasStockIssues\}/g) || []).length;
    expect(occurrences).toBe(2);
  });
});

describe('CrmTerminal — STOCK_INSUFFICIENT server-side identifica el producto y vuelve a \'sale\' (secciones 10, 11)', () => {
  const stockBranchMatch = handleRegisterMatch[0].match(
    /if \(error\.code === 'STOCK_INSUFFICIENT' && error\.stockInsufficient\) \{[\s\S]*?\n {8}\} else \{/,
  );

  it('resuelve el nombre del producto desde el propio carrito enviado (nunca confía en que la RPC lo devuelva)', () => {
    expect(stockBranchMatch).not.toBeNull();
    expect(stockBranchMatch[0]).toMatch(/const productName = cart\.find\(\(i\) => i\.product_id === productId\)\?\.name \|\| 'un producto';/);
  });

  it('construye "Stock insuficiente para {nombre}. Solicitado: N · Disponible: M." -- no el mensaje genérico', () => {
    expect(stockBranchMatch[0]).toMatch(
      /setErrorMsg\(`Stock insuficiente para \$\{productName\}\. Solicitado: \$\{requested\} · Disponible: \$\{available\}\.`\);/,
    );
  });

  it('vuelve automáticamente a la etapa sale', () => {
    expect(stockBranchMatch[0]).toMatch(/setCheckoutStep\('sale'\);/);
  });

  it('refresca el catálogo (refreshProducts) -- sección 13, sin construir realtime', () => {
    expect(stockBranchMatch[0]).toMatch(/refreshProducts\(\);/);
    expect(indexSource).not.toMatch(/\.channel\(|\.subscribe\(/);
  });

  it('no toca cart/payments/customerId/discount/notes/idempotency key/draft -- permite reintentar con la MISMA venta', () => {
    // setCartExpanded(true) SÍ es esperado acá (TPV-CORE-4 sección 9) --
    // se excluye explícitamente del regex con \( para no confundirlo con
    // el prohibido setCart(...) que sí tocaría el carrito real.
    expect(stockBranchMatch[0]).not.toMatch(/setCart\(|setPayments\(|setCustomerId|setDiscount|setNotes|saleIdempotencyKeyRef|removePosTerminalDraft/);
  });
});

describe('CrmTerminal — refreshProducts es reutilizable (montaje + retry tras STOCK_INSUFFICIENT)', () => {
  it('refreshProducts está memoizado con useCallback y se usa tanto en el efecto de montaje como en handleRegister', () => {
    expect(indexSource).toMatch(/const refreshProducts = useCallback\(\(\) => \{/);
    const callSites = (indexSource.match(/refreshProducts\(\)/g) || []).length;
    // 1 en el efecto de montaje + 1 en el branch STOCK_INSUFFICIENT.
    expect(callSites).toBe(2);
  });
});

describe('CrmTerminal — productos agotados/limitados en la grilla (sección 3)', () => {
  it('stock_actual === 0 muestra "Sin stock" y deshabilita el botón', () => {
    const gridMatch = indexSource.match(/\{filtered\.map\(p => \{[\s\S]*?\n {24}\}\)\}/);
    expect(gridMatch).not.toBeNull();
    expect(gridMatch[0]).toMatch(/const outOfStock = p\.stock_actual === 0;/);
    expect(gridMatch[0]).toMatch(/disabled=\{outOfStock\}/);
    expect(gridMatch[0]).toMatch(/Sin stock/);
  });

  it('stock_actual > 0 muestra "Stock: N" de forma compacta', () => {
    const gridMatch = indexSource.match(/\{filtered\.map\(p => \{[\s\S]*?\n {24}\}\)\}/);
    expect(gridMatch[0]).toMatch(/const hasStockLabel = typeof p\.stock_actual === 'number' && p\.stock_actual > 0;/);
    expect(gridMatch[0]).toMatch(/Stock: \{p\.stock_actual\}/);
  });

  it('stock_actual === NULL no muestra ningún indicador de stock (ni "ilimitado" ni ningún texto)', () => {
    expect(indexSource).not.toMatch(/ilimitado/i);
  });
});

/**
 * TPV-CORE-4 — secciones expandibles (carrito/pagos) independientes.
 * Mismo criterio de source-scan que el resto del archivo.
 */
describe('CrmTerminal — cartExpanded/paymentsExpanded: defaults por etapa', () => {
  it('el estado inicial (etapa sale) es cartExpanded=true, paymentsExpanded=false', () => {
    expect(indexSource).toMatch(/const \[cartExpanded, setCartExpanded\] = useState\(true\);/);
    expect(indexSource).toMatch(/const \[paymentsExpanded, setPaymentsExpanded\] = useState\(false\);/);
  });

  it('handleGoToPayment establece los defaults de payment: cartExpanded=false, paymentsExpanded=true', () => {
    const handleGoToPaymentMatch = indexSource.match(/const handleGoToPayment = \(\) => \{[\s\S]*?\n {2}\};/);
    expect(handleGoToPaymentMatch).not.toBeNull();
    expect(handleGoToPaymentMatch[0]).toMatch(/setCartExpanded\(false\);/);
    expect(handleGoToPaymentMatch[0]).toMatch(/setPaymentsExpanded\(true\);/);
  });

  it('esos defaults se establecen SOLO en la transición (dentro del handler), nunca derivados de checkoutStep en cada render', () => {
    // Si estuvieran derivados (ej. `const cartExpanded = checkoutStep ===
    // 'sale'`), el usuario nunca podría abrir carrito y pagos a la vez en
    // payment (sección 4). Confirmamos que son useState independientes,
    // no useMemo/cálculo derivado de checkoutStep.
    expect(indexSource).not.toMatch(/const cartExpanded = checkoutStep/);
    expect(indexSource).not.toMatch(/const paymentsExpanded = checkoutStep/);
  });
});

describe('CrmTerminal — abrir/cerrar una sección no afecta a la otra ni al carrito/pagos reales', () => {
  it('el toggle del carrito solo llama a setCartExpanded -- nunca setPayments/setPaymentsExpanded', () => {
    const toggleMatch = indexSource.match(/onClick=\{\(\) => setCartExpanded\(\(v\) => !v\)\}/);
    expect(toggleMatch).not.toBeNull();
    // Verifica que ese onClick es una expresión de una sola línea (no un
    // bloque que además dispare otros setters).
    expect(indexSource).toMatch(/onClick=\{\(\) => setCartExpanded\(\(v\) => !v\)\}\s*\n\s*aria-expanded=\{cartExpanded\}/);
  });

  it('el toggle de pagos solo llama a setPaymentsExpanded -- nunca setCart/setCartExpanded', () => {
    expect(indexSource).toMatch(/onClick=\{\(\) => setPaymentsExpanded\(\(v\) => !v\)\}\s*\n\s*aria-expanded=\{paymentsExpanded\}/);
  });
});

describe('CrmTerminal — carrito: expandir muestra cart.map, colapsar muestra resumen (independiente de checkoutStep)', () => {
  it('la rama expandida NO depende de checkoutStep -- cartExpanded solo, así "abrir carrito en payment" también muestra el detalle real', () => {
    const cartContentMatch = indexSource.match(/\{cart\.length === 0 \? \([\s\S]*?!cartExpanded \? \(/);
    expect(cartContentMatch).not.toBeNull();
    expect(cartContentMatch[0]).not.toMatch(/checkoutStep/);
  });

  it('colapsado muestra el resumen compacto "N artículos · Subtotal $X"', () => {
    expect(indexSource).toMatch(/!cartExpanded \? \(\s*\n\s*<div className="px-4 py-3 text-xs text-gray-500">\s*\n\s*<span className="font-bold text-gray-700">\{cartCount\}<\/span> \{cartCount === 1 \? 'artículo' : 'artículos'\} · Subtotal/);
  });
});

describe('CrmTerminal — volver a sale y error de stock expanden el carrito', () => {
  it('handleBackToSale expande el carrito', () => {
    const handleBackToSaleMatch = indexSource.match(/const handleBackToSale = \(\) => \{[\s\S]*?\n {2}\};/);
    expect(handleBackToSaleMatch).not.toBeNull();
    expect(handleBackToSaleMatch[0]).toMatch(/setCartExpanded\(true\);/);
  });

  it('el branch de STOCK_INSUFFICIENT expande el carrito -- nunca esconde el error dentro de una sección cerrada', () => {
    const stockBranchMatch = handleRegisterMatch[0].match(
      /if \(error\.code === 'STOCK_INSUFFICIENT' && error\.stockInsufficient\) \{[\s\S]*?\n {8}\} else \{/,
    );
    expect(stockBranchMatch).not.toBeNull();
    expect(stockBranchMatch[0]).toMatch(/setCartExpanded\(true\);/);
    expect(stockBranchMatch[0]).toMatch(/cartSectionRef\.current\?\.scrollIntoView/);
  });
});

describe('CrmTerminal — draft: no persiste cartExpanded/paymentsExpanded, restauración siempre vuelve a los defaults de sale', () => {
  it('applyDraft no referencia cartExpanded/paymentsExpanded en absoluto', () => {
    const applyDraftMatch = indexSource.match(/const applyDraft = useCallback\(\(draft\) => \{[\s\S]*?\n {2}\}, \[\]\);/);
    expect(applyDraftMatch).not.toBeNull();
    expect(applyDraftMatch[0]).not.toMatch(/cartExpanded|paymentsExpanded/);
  });

  it('persistDraftNow (lo que se guarda en el borrador) no incluye cartExpanded/paymentsExpanded', () => {
    const persistMatch = indexSource.match(/const persistDraftNow = useCallback\(\(\) => \{[\s\S]*?\n {2}\}, \[[\s\S]*?\]\);/);
    expect(persistMatch).not.toBeNull();
    expect(persistMatch[0]).not.toMatch(/cartExpanded|paymentsExpanded/);
  });

  it('el carrito queda expandido tras restaurar -- se cumple por construcción: cartExpanded nace en true y nada en la restauración lo toca', () => {
    // No existe ningún setCartExpanded(false) en el efecto de
    // restauración ni en applyDraft/handleRecoverStaleDraft.
    const restoreEffectMatch = indexSource.match(/\/\/ Restauración al montar[\s\S]*?\n {2}\}, \[draftKey, applyDraft\]\);/);
    expect(restoreEffectMatch).not.toBeNull();
    expect(restoreEffectMatch[0]).not.toMatch(/setCartExpanded/);
  });
});

describe('CrmTerminal — el bloque de Total + CTA final nunca queda anidado dentro de una sección colapsable', () => {
  it('en \'sale\', el bloque negro con el CTA "Cobrar" es hermano de la sección de descuento/notas, no está dentro de ningún panel colapsable', () => {
    const saleBlockMatch = indexSource.match(/\n {20}\{checkoutStep === 'sale' && \([\s\S]*?(?=\n {20}\{checkoutStep === 'payment' && \()/);
    // El bloque de sale no tiene NINGÚN aria-expanded -- no hay sección
    // colapsable en 'sale' aparte del carrito (que vive en Zone 2, fuera
    // de este bloque de Zone 3).
    expect(saleBlockMatch[0]).not.toMatch(/aria-expanded/);
    expect(saleBlockMatch[0]).toMatch(/Cobrar \{fmt\(total, business\?\.currency\)\}/);
  });

  it('en \'payment\', el bloque negro con "Confirmar venta" está DESPUÉS del cierre del panel de pagos colapsable (mismo nivel, no anidado)', () => {
    const paymentBlockMatch = indexSource.match(/\{checkoutStep === 'payment' && \([\s\S]*?\n {20}\)\}\n\n {18}<\/div>\{\/\* end zone 3 \*\/\}/);
    expect(paymentBlockMatch).not.toBeNull();
    const paymentsCardEndIdx = paymentBlockMatch[0].indexOf('{/* Pago recibido — solo efectivo */}');
    const confirmarIdx = paymentBlockMatch[0].indexOf('Confirmar venta');
    expect(paymentsCardEndIdx).toBeGreaterThan(-1);
    expect(confirmarIdx).toBeGreaterThan(paymentsCardEndIdx);
    // Entre el cierre del div de Pagos y el bloque negro no debe quedar
    // ningún aria-expanded abierto sin cerrar -- son hermanos.
    const betweenSections = paymentBlockMatch[0].slice(0, paymentsCardEndIdx);
    const paymentsPanelOpenCount = (betweenSections.match(/aria-controls="tpv-payments-panel"/g) || []).length;
    expect(paymentsPanelOpenCount).toBe(1); // un solo header expandible para Pagos, ya cerrado antes del bloque negro
  });
});

describe('CrmTerminal — accesibilidad de las cabeceras expandibles (sección 13)', () => {
  it('ambas cabeceras son <button> reales, no <div onClick>', () => {
    expect(indexSource).toMatch(/<button\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => setCartExpanded\(\(v\) => !v\)\}/);
    expect(indexSource).toMatch(/<button\s*\n\s*type="button"\s*\n\s*onClick=\{\(\) => setPaymentsExpanded\(\(v\) => !v\)\}/);
  });

  it('ambas declaran aria-expanded y aria-controls', () => {
    expect(indexSource).toMatch(/aria-expanded=\{cartExpanded\}\s*\n\s*aria-controls="tpv-cart-panel"/);
    expect(indexSource).toMatch(/aria-expanded=\{paymentsExpanded\}\s*\n\s*aria-controls="tpv-payments-panel"/);
  });

  it('los ids referenciados por aria-controls existen en el DOM (el panel real de cada sección)', () => {
    expect(indexSource).toMatch(/id="tpv-cart-panel"/);
    expect(indexSource).toMatch(/id="tpv-payments-panel"/);
  });

  it('el chevron rota/cambia de forma visual según el estado expandido -- nunca depende de hover', () => {
    expect(indexSource).toMatch(/name="ChevronDown"[\s\S]{0,220}cartExpanded \? 'rotate-180' : ''/);
    expect(indexSource).toMatch(/name="ChevronDown"[\s\S]{0,220}paymentsExpanded \? 'rotate-180' : ''/);
    expect(indexSource).not.toMatch(/hover:rotate|group-hover:rotate/);
  });
});

describe('CrmTerminal — targets táctiles de las cabeceras expandibles ≥44px (sección 11/12)', () => {
  it('la cabecera del carrito declara min-h-[44px]', () => {
    expect(indexSource).toMatch(/onClick=\{\(\) => setCartExpanded\(\(v\) => !v\)\}[\s\S]{0,200}min-h-\[44px\]/);
  });

  it('la cabecera de pagos declara min-h-[44px]', () => {
    expect(indexSource).toMatch(/onClick=\{\(\) => setPaymentsExpanded\(\(v\) => !v\)\}[\s\S]{0,300}min-h-\[44px\]/);
  });

  it('el botón "Vaciar" del header del carrito también respeta ≥44px', () => {
    const cartHeaderMatch = indexSource.match(/\{cart\.length > 0 && \(\s*\n\s*<button\s*\n\s*onClick=\{resetForm\}[\s\S]*?<\/button>\s*\n\s*\)\}/);
    expect(cartHeaderMatch).not.toBeNull();
    expect(cartHeaderMatch[0]).toMatch(/min-h-\[44px\]/);
  });
});

describe('CrmTerminal — no se duplicó ningún bloque reutilizado (carrito ni pagos)', () => {
  it('sigue existiendo un único cart.map en todo el archivo', () => {
    const occurrences = (indexSource.match(/\{cart\.map\(item => [({]/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('sigue existiendo un único REAL_PAYMENT_METHODS.map', () => {
    const occurrences = (indexSource.match(/REAL_PAYMENT_METHODS\.map/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('los controles de stock (Ajustar/Eliminar, botón + deshabilitado) siguen presentes dentro del cart.map expandido', () => {
    const cartRowMatch = indexSource.match(/\{cart\.map\(item => \{[\s\S]*?\n {24}\}\)\}/);
    expect(cartRowMatch).not.toBeNull();
    expect(cartRowMatch[0]).toMatch(/disabled=\{atStockLimit\}/);
    expect(cartRowMatch[0]).toMatch(/Ajustar a \{issue\.available\}/);
  });
});
