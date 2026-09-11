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
    const cartRowMatch = indexSource.match(/\{cart\.map\(item => \([\s\S]*?\n\s{24}\)\)\}/);
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

  it('handleBackToSale vuelve a \'sale\' -- solo cambia el paso, ninguna otra cosa', () => {
    const match = indexSource.match(/const handleBackToSale = \(\) => \{[\s\S]*?\n  \};/);
    expect(match).not.toBeNull();
    expect(match[0]).toMatch(/setCheckoutStep\('sale'\);/);
    // No debe tocar cart/customerId/discount/notes/payments/idempotency key/draft.
    expect(match[0]).not.toMatch(/setCart|setCustomerId|setDiscount|setNotes|setPayments|saleIdempotencyKeyRef|removePosTerminalDraft/);
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
    expect(saleBlockMatch[0]).toMatch(/disabled=\{cart\.length === 0\}/);
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
    expect(paymentBlockMatch[0]).toMatch(/fmt\(paidTotal, business\?\.currency\)/);
    expect(paymentBlockMatch[0]).toMatch(/fmt\(pendingBalance, business\?\.currency\)/);
    expect(paymentBlockMatch[0]).toMatch(/fmt\(change, business\?\.currency\)/);
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
  it('handleRegister nunca cambia checkoutStep -- ni en éxito ni en error, el paso solo cambia por handleGoToPayment/handleBackToSale/resetForm', () => {
    expect(handleRegisterMatch[0]).not.toMatch(/setCheckoutStep/);
  });

  it('el bloque de error de handleRegister no toca cart/payments/idempotency key -- permite reintentar sin perder nada', () => {
    const errorBranchMatch = handleRegisterMatch[0].match(/if \(error\) \{[\s\S]*?\n {6}\}/);
    expect(errorBranchMatch).not.toBeNull();
    expect(errorBranchMatch[0]).not.toMatch(/setCart|setPayments|saleIdempotencyKeyRef/);
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
    const occurrences = (indexSource.match(/\{cart\.map\(item => \(/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('la etapa payment reemplaza el detalle del carrito por un resumen compacto (no repite el listado de ítems)', () => {
    expect(indexSource).toMatch(/checkoutStep === 'payment' \? \(\s*\n\s*<div className="px-4 py-3 text-xs text-gray-500">/);
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
    const cobrarBtnMatch = indexSource.match(/onClick=\{handleGoToPayment\}\s*\n\s*disabled=\{cart\.length === 0\}\s*\n\s*className="[^"]*min-h-\[44px\][^"]*"/);
    expect(cobrarBtnMatch).not.toBeNull();
    const volverBtnMatch = indexSource.match(/onClick=\{handleBackToSale\}\s*\n\s*className="[^"]*min-h-\[44px\][^"]*"/);
    expect(volverBtnMatch).not.toBeNull();
  });

  it('la franja "Volver a la venta" de la barra fija mobile también declara min-h-[44px]', () => {
    const mobileBackMatch = indexSource.match(/onClick=\{handleBackToSale\}\s*\n\s*className="[^"]*min-h-\[44px\][^"]*"[\s\S]{0,200}Volver a la venta/);
    expect(mobileBackMatch).not.toBeNull();
  });

  it('los 3 botones +\\/-\\/eliminar del carrito siguen en w-11 h-11 (no regresionaron a w-7 h-7)', () => {
    const cartRowMatch = indexSource.match(/\{cart\.map\(item => \([\s\S]*?\n\s{24}\)\)\}/);
    expect(cartRowMatch).not.toBeNull();
    const w11Count = (cartRowMatch[0].match(/w-11 h-11/g) || []).length;
    expect(w11Count).toBe(3);
  });
});
