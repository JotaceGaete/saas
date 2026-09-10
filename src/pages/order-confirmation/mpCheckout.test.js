/**
 * order-confirmation/index.jsx — tests estáticos (source-scan) de las
 * invariantes de MP-CHECKOUT-3 (botón "Pagar con Mercado Pago"). Mismo
 * criterio que public-catalog/mpCheckout.test.js.
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.jsx?raw';

describe('OrderConfirmation — botón Mercado Pago condicionado a disponibilidad sanitizada', () => {
  it('usa getMerchantMpAvailability(slug)', () => {
    expect(indexSource).toMatch(/getMerchantMpAvailability\(slug\)/);
  });

  it('el botón de Mercado Pago solo se renderiza si mpAvailable es true', () => {
    expect(indexSource).toMatch(/\{mpAvailable && \(/);
  });

  it('el botón de WhatsApp (handleConfirm) sigue presente sin condición de MP', () => {
    expect(indexSource).toMatch(/onClick=\{handleConfirm\}/);
  });
});

describe('OrderConfirmation — request a create-merchant-mp-checkout', () => {
  it('los items enviados usan exclusivamente productId + quantity del carrito', () => {
    expect(indexSource).toMatch(/items: items\?\.\s*map\(\(item\) => \(\{ productId: item\?\.\s*id, quantity: item\?\.\s*quantity \}\)\)/);
  });

  it('nunca arma el payload de MP con price/unitPrice/total/currency/businessId del carrito', () => {
    const mpFnMatch = indexSource.match(/const payWithMercadoPago = async \(\) => \{[\s\S]*?\n  \};/);
    expect(mpFnMatch).not.toBeNull();
    expect(mpFnMatch[0]).not.toMatch(/\bprice\b|\bunitPrice\b|\btotal\b|\bcurrency\b|\bbusinessId\b|external_reference/);
  });
});

describe('OrderConfirmation — doble click / doble envío bloqueado', () => {
  it('tiene su propio lock (mpSubmitLockRef) independiente del lock de WhatsApp (submitLockRef)', () => {
    expect(indexSource).toMatch(/const mpSubmitLockRef = useRef\(false\)/);
    expect(indexSource).toMatch(/if \(mpSubmitLockRef\.current \|\| submitLockRef\.current\) return;/);
  });

  it('el botón de Mercado Pago se deshabilita mientras mpSending o loading están activos', () => {
    expect(indexSource).toMatch(/disabled=\{mpSending \|\| loading\}/);
  });
});

describe('OrderConfirmation — redirect y manejo de errores', () => {
  it('navega usando EXCLUSIVAMENTE data.initPoint devuelto por el backend', () => {
    expect(indexSource).toMatch(/window\.location\.assign\(data\.initPoint\)/);
  });

  it('en error, usa getMerchantMpCheckoutErrorMessage -- nunca muestra error?.message crudo del backend', () => {
    expect(indexSource).toMatch(/setMpError\(getMerchantMpCheckoutErrorMessage\(error\?\.\s*reason\)\)/);
    expect(indexSource).not.toMatch(/setMpError\(error\?\.\s*message\)/);
    expect(indexSource).not.toMatch(/setMpError\(error\)/);
  });
});

// ─── MP-CHECKOUT-3B — WhatsApp pasa de "checkout alternativo" a "canal de
// consulta" ÚNICAMENTE cuando mpAvailable=true. Cuando mpAvailable=false,
// WhatsApp sigue funcionando exactamente igual que antes de MP-CHECKOUT-3B
// (handleConfirm intacto, crea la orden normalmente).
describe('OrderConfirmation — MP conectado: WhatsApp se demota a "Consultar" (nunca comprar/pedir)', () => {
  it('con mpAvailable=true, el botón de WhatsApp muestra "Consultar por WhatsApp" y llama a consultWhatsApp', () => {
    expect(indexSource).toMatch(/\{mpAvailable \? \(/);
    expect(indexSource).toMatch(/onClick=\{consultWhatsApp\}/);
    expect(indexSource).toMatch(/Consultar por WhatsApp/);
  });

  it('con mpAvailable=true, "Pagar con Mercado Pago" aparece antes que la consulta por WhatsApp en el JSX (acción primaria)', () => {
    const mpButtonIdx = indexSource.indexOf('Pagar con Mercado Pago');
    const consultButtonIdx = indexSource.indexOf('onClick={consultWhatsApp}');
    expect(mpButtonIdx).toBeGreaterThan(-1);
    expect(consultButtonIdx).toBeGreaterThan(-1);
    expect(mpButtonIdx).toBeLessThan(consultButtonIdx);
  });
});

describe('OrderConfirmation — consultWhatsApp NUNCA crea una orden', () => {
  const consultFnMatch = indexSource.match(/const consultWhatsApp = \(\) => \{[\s\S]*?\n  \};/);

  it('la función consultWhatsApp existe', () => {
    expect(consultFnMatch).not.toBeNull();
  });

  it('consultWhatsApp nunca llama a createOrder()', () => {
    expect(consultFnMatch[0]).not.toMatch(/createOrder\(/);
  });

  it('consultWhatsApp nunca llama a clearCart() (el carrito no se vacía, no se compró nada)', () => {
    expect(consultFnMatch[0]).not.toMatch(/clearCart\(\)/);
  });

  it('el mensaje de consultWhatsApp se redacta como consulta, no como pedido confirmado', () => {
    expect(consultFnMatch[0]).toMatch(/tengo una consulta sobre estos productos/);
    expect(consultFnMatch[0]).not.toMatch(/quiero hacer un pedido/);
  });

  it('consultWhatsApp respeta ambos locks (WhatsApp-orden y Mercado Pago) antes de ejecutarse', () => {
    expect(consultFnMatch[0]).toMatch(/if \(submitLockRef\.current \|\| mpSubmitLockRef\.current\) return;/);
  });
});

describe('OrderConfirmation — MP no conectado: sin CTA de WhatsApp engañoso, comportamiento previo intacto', () => {
  it('con mpAvailable=false, el botón sigue siendo handleConfirm (crea la orden real, como antes de MP-CHECKOUT-3B)', () => {
    expect(indexSource).toMatch(/onClick=\{handleConfirm\}/);
    expect(indexSource).toMatch(/Confirmar y enviar por WhatsApp/);
  });

  it('handleConfirm (rama sin MP) sigue llamando a createOrder -- no se tocó su comportamiento', () => {
    const handleConfirmMatch = indexSource.match(/const handleConfirm = async \(\) => \{[\s\S]*?\n  \};/);
    expect(handleConfirmMatch).not.toBeNull();
    expect(handleConfirmMatch[0]).toMatch(/createOrder\(/);
  });
});
