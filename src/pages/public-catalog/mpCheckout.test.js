/**
 * public-catalog/index.jsx — tests estáticos (source-scan) de las
 * invariantes de MP-CHECKOUT-3 (botón "Pagar con Mercado Pago" en
 * OrderPanel). El archivo es demasiado grande/con demasiadas
 * dependencias (SEO, tema, analytics) para un render completo vía RTL
 * sin mocks extensos y frágiles -- mismo criterio ya usado en todo
 * este proyecto para verificar invariantes de seguridad/negocio en
 * archivos grandes (Edge Functions vía `?raw`), aplicado acá al
 * frontend.
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.jsx?raw';

describe('OrderPanel — botón Mercado Pago condicionado a disponibilidad sanitizada', () => {
  it('usa getMerchantMpAvailability(slug) -- nunca lee tokens ni construye el estado desde datos sensibles', () => {
    expect(indexSource).toMatch(/getMerchantMpAvailability\(slug\)/);
  });

  it('el botón de Mercado Pago solo se renderiza si mpAvailable es true', () => {
    expect(indexSource).toMatch(/\{mpAvailable && \(/);
  });

  it('el botón de WhatsApp sigue presente sin condición de disponibilidad de MP (nunca se oculta)', () => {
    expect(indexSource).toMatch(/onClick=\{sendWhatsApp\}/);
  });
});

describe('OrderPanel — request a create-merchant-mp-checkout', () => {
  it('los items enviados usan exclusivamente productId + quantity del carrito', () => {
    expect(indexSource).toMatch(/items: items\?\.\s*map\(\(item\) => \(\{ productId: item\?\.\s*id, quantity: item\?\.\s*quantity \}\)\)/);
  });

  it('nunca arma el payload de MP con price/unitPrice/total/currency/businessId del carrito', () => {
    const mpFnMatch = indexSource.match(/const payWithMercadoPago = async \(\) => \{[\s\S]*?\n  \};/);
    expect(mpFnMatch).not.toBeNull();
    expect(mpFnMatch[0]).not.toMatch(/\bprice\b|\bunitPrice\b|\btotal\b|\bcurrency\b|\bbusinessId\b|external_reference/);
  });

  it('usa createMerchantMpCheckout (no un fetch propio duplicado)', () => {
    expect(indexSource).toMatch(/createMerchantMpCheckout\(\{/);
  });
});

describe('OrderPanel — doble click / doble envío bloqueado', () => {
  it('tiene su propio lock (mpSubmitLockRef) independiente del lock de WhatsApp (submitLockRef)', () => {
    expect(indexSource).toMatch(/const mpSubmitLockRef = useRef\(false\)/);
    expect(indexSource).toMatch(/if \(mpSubmitLockRef\.current \|\| submitLockRef\.current\) return;/);
  });

  it('el botón de Mercado Pago se deshabilita mientras mpSending o sending están activos', () => {
    expect(indexSource).toMatch(/disabled=\{mpSending \|\| sending\}/);
  });
});

describe('OrderPanel — redirect y manejo de errores', () => {
  it('navega usando EXCLUSIVAMENTE data.initPoint devuelto por el backend, nunca una URL construida en el frontend', () => {
    expect(indexSource).toMatch(/window\.location\.assign\(data\.initPoint\)/);
  });

  it('en error, usa getMerchantMpCheckoutErrorMessage -- nunca muestra error?.message crudo del backend', () => {
    expect(indexSource).toMatch(/setMpError\(getMerchantMpCheckoutErrorMessage\(error\?\.\s*reason\)\)/);
    expect(indexSource).not.toMatch(/setMpError\(error\?\.\s*message\)/);
    expect(indexSource).not.toMatch(/setMpError\(error\)/);
  });

  it('limpia el carrito antes de navegar a Mercado Pago (igual que el flujo de WhatsApp)', () => {
    const mpFnMatch = indexSource.match(/const payWithMercadoPago = async \(\) => \{[\s\S]*?\n  \};/);
    expect(mpFnMatch).not.toBeNull();
    const clearIdx = mpFnMatch[0].indexOf('clearCart()');
    const assignIdx = mpFnMatch[0].indexOf('window.location.assign');
    expect(clearIdx).toBeGreaterThan(-1);
    expect(assignIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeLessThan(assignIdx);
  });
});

describe('OrderPanel — validación reutilizada, nunca se envía sin nombre', () => {
  it('payWithMercadoPago valida customerName/tableReference/deliveryAddress antes de llamar al backend', () => {
    const mpFnMatch = indexSource.match(/const payWithMercadoPago = async \(\) => \{[\s\S]*?\n  \};/);
    expect(mpFnMatch).not.toBeNull();
    expect(mpFnMatch[0]).toMatch(/if \(!customerName\?\.\s*trim\(\)\)/);
  });
});

// ─── MP-CHECKOUT-3B — WhatsApp pasa de "checkout alternativo" a "canal de
// consulta" ÚNICAMENTE cuando mpAvailable=true. Cuando mpAvailable=false,
// WhatsApp sigue funcionando exactamente igual que antes de MP-CHECKOUT-3B
// (sendWhatsApp intacto, crea wa_orders normalmente).
describe('OrderPanel — MP conectado: WhatsApp se demota a "Consultar" (nunca comprar/pedir)', () => {
  it('con mpAvailable=true, el botón de WhatsApp del carrito muestra "Consultar por WhatsApp", no "Enviar pedido"', () => {
    expect(indexSource).toMatch(/\{mpAvailable \? \(/);
    expect(indexSource).toMatch(/onClick=\{consultWhatsApp\}/);
    expect(indexSource).toMatch(/Consultar por WhatsApp/);
  });

  it('con mpAvailable=true, "Pagar con Mercado Pago" es la acción primaria y aparece antes que la consulta por WhatsApp en el JSX', () => {
    const mpButtonIdx = indexSource.indexOf('Pagar con Mercado Pago');
    const consultButtonIdx = indexSource.indexOf('onClick={consultWhatsApp}');
    expect(mpButtonIdx).toBeGreaterThan(-1);
    expect(consultButtonIdx).toBeGreaterThan(-1);
    expect(mpButtonIdx).toBeLessThan(consultButtonIdx);
  });

  it('FloatingCartButton también reetiqueta el CTA cuando mpAvailable=true (no promete "enviar pedido" por WhatsApp)', () => {
    expect(indexSource).toMatch(/\{mpAvailable \? 'Ver mi pedido' : 'Enviar pedido por WhatsApp'\}/);
    expect(indexSource).toMatch(/\{mpAvailable \? `Ver mi pedido \(\$\{itemCount\}\)` : `Enviar pedido por WhatsApp \(\$\{itemCount\}\)`\}/);
  });
});

describe('OrderPanel — consultWhatsApp NUNCA crea una orden', () => {
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

  it('consultWhatsApp registra el click con un source distinto ("cart_consult") del checkout real ("cart_checkout")', () => {
    expect(consultFnMatch[0]).toMatch(/recordCatalogWhatsAppClick\(slug, path, 'cart_consult'\)/);
  });
});

describe('OrderPanel — MP no conectado: sin CTA de WhatsApp engañoso, comportamiento previo intacto', () => {
  it('con mpAvailable=false, el botón sigue siendo sendWhatsApp (crea la orden real, como antes de MP-CHECKOUT-3B)', () => {
    expect(indexSource).toMatch(/onClick=\{sendWhatsApp\}/);
    expect(indexSource).toMatch(/Enviar pedido por WhatsApp/);
  });

  it('sendWhatsApp (rama sin MP) sigue llamando a createOrder -- no se tocó su comportamiento', () => {
    const sendFnMatch = indexSource.match(/const sendWhatsApp = async \(\) => \{[\s\S]*?\n  \};/);
    expect(sendFnMatch).not.toBeNull();
    expect(sendFnMatch[0]).toMatch(/createOrder\(/);
  });
});

// ─── EMAIL-PAYMENTS-2 — email opcional del comprador, exclusivo del
// checkout Mercado Pago. Nunca se vuelve requisito para WhatsApp.
describe('OrderPanel — customer.email opcional en el payload de Mercado Pago', () => {
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
    expect(mpFnMatch[0]).toMatch(/if \(trimmedEmail && !isValidCustomerEmail\(trimmedEmail\)\) nextErrors\.customerEmail/);
  });

  it('email inválido sí bloquea el inicio del pago (agrega a nextErrors, mismo mecanismo que customerName/tableReference/deliveryAddress)', () => {
    expect(mpFnMatch[0]).toMatch(/nextErrors\.customerEmail = 'Ingresa un correo electrónico válido\.'/);
    expect(mpFnMatch[0]).toMatch(/setFieldErrors\(nextErrors\)/);
    expect(mpFnMatch[0]).toMatch(/if \(Object\.keys\(nextErrors\)\.length > 0\) return;/);
  });
});

describe('OrderPanel — WhatsApp (sendWhatsApp / consultWhatsApp) nunca exige ni valida email', () => {
  const sendFnMatch = indexSource.match(/const sendWhatsApp = async \(\) => \{[\s\S]*?\n  \};/);
  const consultFnMatch = indexSource.match(/const consultWhatsApp = \(\) => \{[\s\S]*?\n  \};/);

  it('sendWhatsApp no referencia customerEmail/isValidCustomerEmail -- el email no es requisito para el flujo WhatsApp existente', () => {
    expect(sendFnMatch).not.toBeNull();
    expect(sendFnMatch[0]).not.toMatch(/customerEmail/);
    expect(sendFnMatch[0]).not.toMatch(/isValidCustomerEmail/);
  });

  it('consultWhatsApp no referencia customerEmail/isValidCustomerEmail -- sigue sin validar ningún campo', () => {
    expect(consultFnMatch).not.toBeNull();
    expect(consultFnMatch[0]).not.toMatch(/customerEmail/);
    expect(consultFnMatch[0]).not.toMatch(/isValidCustomerEmail/);
  });
});

describe('OrderPanel — CheckoutEmailOptional se renderiza inmediatamente después de CheckoutPhoneOptional', () => {
  it('el JSX incluye <CheckoutEmailOptional ... /> después de <CheckoutPhoneOptional ... />', () => {
    const phoneIdx = indexSource.indexOf('<CheckoutPhoneOptional');
    const emailIdx = indexSource.indexOf('<CheckoutEmailOptional');
    expect(phoneIdx).toBeGreaterThan(-1);
    expect(emailIdx).toBeGreaterThan(-1);
    expect(emailIdx).toBeGreaterThan(phoneIdx);
  });
});

describe('ProductModal / CTAs de compra rápida — solo reetiquetado, nunca crean orden', () => {
  it('el CTA "Pedir por WhatsApp" de ProductModal se reetiqueta a "Consultar por WhatsApp" cuando mpAvailable=true', () => {
    const occurrences = indexSource.match(/\{mpAvailable \? 'Consultar por WhatsApp' : 'Pedir por WhatsApp'\}/g);
    expect(occurrences?.length).toBeGreaterThanOrEqual(2);
  });

  it('ProductModal recibe mpAvailable como prop (con default false, no rompe callers existentes)', () => {
    expect(indexSource).toMatch(/export function ProductModal\(\{[\s\S]*?mpAvailable = false \}\)/);
  });
});
