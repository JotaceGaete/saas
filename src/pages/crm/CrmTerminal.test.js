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
