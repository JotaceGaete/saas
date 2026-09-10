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

// ─── EMAIL-PAYMENTS-2 — email opcional del comprador, exclusivo del
// checkout Mercado Pago. Mismo comportamiento que public-catalog/index.jsx
// -- nunca se vuelve requisito para WhatsApp (handleConfirm/consultWhatsApp).
describe('OrderConfirmation — customer.email opcional en el payload de Mercado Pago', () => {
  const mpFnMatch = indexSource.match(/const payWithMercadoPago = async \(\) => \{[\s\S]*?\n  \};/);

  it('el customer enviado a createMerchantMpCheckout incluye email (trimmed) solo cuando fue ingresado', () => {
    expect(mpFnMatch).not.toBeNull();
    expect(mpFnMatch[0]).toMatch(
      /customer: \{ name: customerName\?\.\s*trim\(\), phone: phoneForOrder \|\| undefined, email: trimmedEmail \|\| undefined \}/,
    );
  });

  it('el email se normaliza con trim antes de validar/enviar (normalizeCustomerEmailInput)', () => {
    expect(mpFnMatch[0]).toMatch(/const trimmedEmail = normalizeCustomerEmailInput\(customerEmail\)/);
  });

  it('email vacío NUNCA bloquea el inicio del pago -- la validación de formato solo corre si trimmedEmail es truthy', () => {
    expect(mpFnMatch[0]).toMatch(/if \(trimmedEmail && !isValidCustomerEmail\(trimmedEmail\)\) errs\.customerEmail/);
  });

  it('email inválido sí bloquea el inicio del pago (se agrega a errs junto con el resto de validate())', () => {
    expect(mpFnMatch[0]).toMatch(/errs\.customerEmail = 'Ingresa un correo electrónico válido\.'/);
    expect(mpFnMatch[0]).toMatch(/if \(Object\.keys\(errs\)\?\.\s*length > 0\) \{ setErrors\(errs\); return; \}/);
  });

  it('la validación de email vive SOLO en payWithMercadoPago, no dentro de validate() -- así handleConfirm (WhatsApp) nunca la hereda', () => {
    const validateFnMatch = indexSource.match(/const validate = \(\) => \{[\s\S]*?\n  \};/);
    expect(validateFnMatch).not.toBeNull();
    expect(validateFnMatch[0]).not.toMatch(/customerEmail/);
    expect(validateFnMatch[0]).not.toMatch(/isValidCustomerEmail/);
  });
});

describe('OrderConfirmation — WhatsApp (handleConfirm / consultWhatsApp) nunca exige ni valida email', () => {
  const handleConfirmMatch = indexSource.match(/const handleConfirm = async \(\) => \{[\s\S]*?\n  \};/);
  const consultFnMatch = indexSource.match(/const consultWhatsApp = \(\) => \{[\s\S]*?\n  \};/);

  it('handleConfirm no referencia customerEmail/isValidCustomerEmail -- el email no es requisito para el flujo WhatsApp existente', () => {
    expect(handleConfirmMatch).not.toBeNull();
    expect(handleConfirmMatch[0]).not.toMatch(/customerEmail/);
    expect(handleConfirmMatch[0]).not.toMatch(/isValidCustomerEmail/);
  });

  it('consultWhatsApp no referencia customerEmail/isValidCustomerEmail -- sigue sin validar ningún campo', () => {
    expect(consultFnMatch).not.toBeNull();
    expect(consultFnMatch[0]).not.toMatch(/customerEmail/);
    expect(consultFnMatch[0]).not.toMatch(/isValidCustomerEmail/);
  });
});

describe('OrderConfirmation — CheckoutEmailOptional se renderiza inmediatamente después de CheckoutPhoneOptional', () => {
  it('el JSX incluye <CheckoutEmailOptional ... /> después de <CheckoutPhoneOptional ... />', () => {
    const phoneIdx = indexSource.indexOf('<CheckoutPhoneOptional');
    const emailIdx = indexSource.indexOf('<CheckoutEmailOptional');
    expect(phoneIdx).toBeGreaterThan(-1);
    expect(emailIdx).toBeGreaterThan(-1);
    expect(emailIdx).toBeGreaterThan(phoneIdx);
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
