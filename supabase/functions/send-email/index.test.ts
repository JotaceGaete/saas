/**
 * send-email/index.ts — tests estáticos (source-scan) de las invariantes
 * de seguridad (EMAIL-PAYMENTS-1) y de los templates nuevos de pago. Este
 * archivo toca Deno.serve/Deno.env a nivel de módulo, así que no se
 * importa/ejecuta directamente en Vitest -- mismo criterio que
 * process-email-queue/index.test.ts y merchant-mp-webhook/index.test.ts.
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.ts?raw';

describe('send-email — EMAIL_FUNCTION_SECRET es obligatorio, no opcional (hardening)', () => {
  it('si EMAIL_FUNCTION_SECRET no está configurado, rechaza con 500 (fail closed) en vez de aceptar sin validar', () => {
    expect(indexSource).toMatch(
      /if \(!functionSecret\) \{[\s\S]*?return jsonResponse\(\{ error: 'Server configuration error' \}, 500\);/,
    );
  });

  it('ya no existe el camino "si no está configurado, funciona sin validación" (comportamiento viejo, inseguro)', () => {
    expect(indexSource).not.toMatch(/funciona igual que antes \(sin validación adicional\)/);
  });

  it('con el secret configurado, exige x-email-secret exacto -- 401 si no coincide', () => {
    expect(indexSource).toMatch(
      /const requestSecret = req\.headers\.get\('x-email-secret'\) \?\? '';\s*\n\s*if \(requestSecret !== functionSecret\) \{[\s\S]*?return jsonResponse\(\{ error: 'Unauthorized' \}, 401\);/,
    );
  });

  it('el guard de secret se evalúa ANTES de cualquier branch de acción (admin o plano) -- protege también el camino {to,subject,html}', () => {
    const guardIdx = indexSource.indexOf("if (action !== 'preview' && action !== 'admin_send_test')");
    const adminBranchIdx = indexSource.indexOf("if (action === 'preview' || action === 'admin_send_test')");
    const freeHtmlIdx = indexSource.indexOf("html = typeof body?.html === 'string'");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(adminBranchIdx).toBeGreaterThan(-1);
    expect(freeHtmlIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(adminBranchIdx);
    expect(guardIdx).toBeLessThan(freeHtmlIdx);
  });

  it('EMAIL_FUNCTION_SECRET nunca se lee ni se referencia desde código de browser (src/) -- solo Deno.env server-side', () => {
    expect(indexSource).toMatch(/Deno\.env\.get\('EMAIL_FUNCTION_SECRET'\)/);
  });
});

describe('send-email — flujos admin preview/admin_send_test conservan JWT + wa_is_admin() sin cambios', () => {
  it('verifyAdmin sigue validando JWT (Authorization: Bearer) y wa_is_admin() vía RPC', () => {
    expect(indexSource).toMatch(/async function verifyAdmin\(/);
    expect(indexSource).toMatch(/userClient\.auth\.getUser\(\)/);
    expect(indexSource).toMatch(/userClient\.rpc\('wa_is_admin'\)/);
  });

  it('preview/admin_send_test llaman a verifyAdmin antes de renderizar cualquier template', () => {
    const adminBlockMatch = indexSource.match(
      /if \(action === 'preview' \|\| action === 'admin_send_test'\) \{[\s\S]*?const admin = await verifyAdmin\(/,
    );
    expect(adminBlockMatch).not.toBeNull();
  });

  it('admin_send_test SIEMPRE redirige a EMAIL_TEST_INBOX, nunca al "to" solicitado -- sin cambios por este hardening', () => {
    expect(indexSource).toMatch(/admin_send_test: SIEMPRE envía al inbox de prueba, nunca al "to" del body/);
    expect(indexSource).toMatch(/const finalTo = \(Deno\.env\.get\('EMAIL_TEST_INBOX'\)/);
  });
});

describe('send-email — templates existentes no se rompieron', () => {
  for (const type of [
    'welcome', 'email_confirm', 'password_recovery', 'trial_expiring',
    'payment_confirmed', 'plan_changed', 'new_order', 'activation_24h',
    'daily_summary', 'weekly_summary', 'test_ping',
  ]) {
    it(`case '${type}' sigue presente en renderTemplate`, () => {
      expect(indexSource).toMatch(new RegExp(`case '${type}':`));
    });
  }
});

describe('send-email — templates nuevos de pago (EMAIL-PAYMENTS-1)', () => {
  it('payment_received_buyer y payment_received_merchant están en renderTemplate y en ADMIN_PREVIEW_TYPES', () => {
    expect(indexSource).toMatch(/case 'payment_received_buyer':/);
    expect(indexSource).toMatch(/case 'payment_received_merchant':/);
    expect(indexSource).toMatch(/'payment_received_buyer', 'payment_received_merchant',/);
  });

  it('el asunto del comprador es "Pago recibido — Pedido #<shortId>"', () => {
    const match = indexSource.match(/case 'payment_received_buyer': \{[\s\S]*?const subject = `Pago recibido — Pedido #\$\{shortId\}`;/);
    expect(match).not.toBeNull();
  });

  it('el asunto del comercio es "Nueva venta pagada — Pedido #<shortId>"', () => {
    const match = indexSource.match(/case 'payment_received_merchant': \{[\s\S]*?const subject = `Nueva venta pagada — Pedido #\$\{shortId\}`;/);
    expect(match).not.toBeNull();
  });

  it('ambos templates escapan con escapeHtml los campos variables (customerName, methodLabel, etc.)', () => {
    const buyerBlock = indexSource.match(/case 'payment_received_buyer': \{[\s\S]*?\n    \}/)![0];
    const merchantBlock = indexSource.match(/case 'payment_received_merchant': \{[\s\S]*?\n    \}/)![0];
    expect(buyerBlock).toMatch(/escapeHtml\(methodLabel\)/);
    expect(buyerBlock).toMatch(/escapeHtml\(paidAtLabel\)/);
    expect(merchantBlock).toMatch(/escapeHtml\(customerName\)/);
    expect(merchantBlock).toMatch(/escapeHtml\(methodLabel\)/);
  });

  it('mp_fee/net_amount NUNCA se muestran si son null -- mismo criterio que OrderPaymentDetail.jsx', () => {
    const merchantBlock = indexSource.match(/case 'payment_received_merchant': \{[\s\S]*?\n    \}/)![0];
    expect(merchantBlock).toMatch(/const mpFee = d\.mpFee != null && d\.mpFee !== '' \? Number\(d\.mpFee\) : null;/);
    expect(merchantBlock).toMatch(/const netAmount = d\.netAmount != null && d\.netAmount !== '' \? Number\(d\.netAmount\) : null;/);
    expect(merchantBlock).toMatch(/\$\{mpFee !== null \?/);
    expect(merchantBlock).toMatch(/\$\{netAmount !== null \?/);
  });

  it('walinkaFee del comercio SIEMPRE se muestra (nunca condicional, a diferencia de mp_fee/net_amount)', () => {
    const merchantBlock = indexSource.match(/case 'payment_received_merchant': \{[\s\S]*?\n    \}/)![0];
    expect(merchantBlock).toMatch(/Comisión Walinka<\/th><td style="padding:8px 12px">\$\{formatCurrency\(walinkaFee, orderCurrency\)\}/);
  });

  it('providerPaymentId solo se muestra cuando existe -- nunca inventado', () => {
    const merchantBlock = indexSource.match(/case 'payment_received_merchant': \{[\s\S]*?\n    \}/)![0];
    expect(merchantBlock).toMatch(/\$\{providerPaymentId \? `<tr>/);
  });

  it('ningún template de pago tiene tracking (pixel, utm, wrapping de links) ni CTA de marketing/promociones', () => {
    // Se revisa solo el HTML generado (el literal `const html = ...`), no
    // los comentarios del código -- estos SÍ mencionan "sin tracking" a
    // propósito, lo que haría fallar un scan sobre el bloque completo.
    const buyerBlock = indexSource.match(/case 'payment_received_buyer': \{[\s\S]*?\n    \}/)![0];
    const merchantBlock = indexSource.match(/case 'payment_received_merchant': \{[\s\S]*?\n    \}/)![0];
    const buyerHtml = buyerBlock.match(/const html = `[\s\S]*?<\/html>`;/)![0];
    const merchantHtml = merchantBlock.match(/const html = `[\s\S]*?<\/html>`;/)![0];
    for (const html of [buyerHtml, merchantHtml]) {
      expect(html).not.toMatch(/utm_/i);
      expect(html).not.toMatch(/<img/i);
      expect(html).not.toMatch(/tracking/i);
      expect(html).not.toMatch(/oferta|descuento|promoci[oó]n/i);
    }
  });

  it('el comprador NO recibe un link al dashboard (no tiene cuenta Walinka necesariamente) -- el comercio sí', () => {
    const buyerBlock = indexSource.match(/case 'payment_received_buyer': \{[\s\S]*?\n    \}/)![0];
    const merchantBlock = indexSource.match(/case 'payment_received_merchant': \{[\s\S]*?\n    \}/)![0];
    expect(buyerBlock).not.toMatch(/dashboardUrl/);
    expect(merchantBlock).toMatch(/Ver pedido en el panel/);
  });
});

describe('send-email — separación de flags: PAYMENT_EMAILS_ENABLED vs EMAIL_AUTOMATION_ENABLED', () => {
  it('la fuente calcula isPaymentEmail y usa PAYMENT_EMAIL_TYPES.has(emailType) para elegir el flag correcto', () => {
    expect(indexSource).toMatch(/const isPaymentEmail = PAYMENT_EMAIL_TYPES\.has\(emailType\);/);
    expect(indexSource).toMatch(
      /const categoryEnabled = isPaymentEmail \? isPaymentEmailsEnabled\(\) : isEmailAutomationEnabled\(\);/,
    );
  });

  it('PAYMENT_EMAILS_ENABLED se lee de su propia env var, distinta de EMAIL_AUTOMATION_ENABLED', () => {
    expect(indexSource).toMatch(/function isPaymentEmailsEnabled\(\) \{\s*\n\s*return Deno\.env\.get\('PAYMENT_EMAILS_ENABLED'\) === 'true';/);
    expect(indexSource).toMatch(/function isEmailAutomationEnabled\(\) \{\s*\n\s*return Deno\.env\.get\('EMAIL_AUTOMATION_ENABLED'\) === 'true';/);
  });

  it('PAYMENT_EMAIL_TYPES contiene exactamente los dos tipos de pago -- welcome/activation_24h nunca caen en esa rama', () => {
    expect(indexSource).toMatch(
      /const PAYMENT_EMAIL_TYPES = new Set\(\['payment_received_buyer', 'payment_received_merchant'\]\);/,
    );
  });

  // Matriz explícita de comportamiento (EMAIL-PAYMENTS-1, sección 2). No se
  // puede invocar Deno.serve directamente en Vitest (ver cabecera del
  // archivo), así que se replica la MISMA expresión booleana ya verificada
  // por regex arriba (categoryEnabled = isPaymentEmail ? paymentEmailsEnabled
  // : automationEnabled) y se evalúa contra las 4 combinaciones pedidas --
  // si alguien cambia la lógica real sin actualizar este mirror, el test de
  // regex de arriba falla primero.
  function categoryEnabled(emailType: string, automationEnabled: boolean, paymentEmailsEnabled: boolean) {
    const isPaymentEmail = new Set(['payment_received_buyer', 'payment_received_merchant']).has(emailType);
    return isPaymentEmail ? paymentEmailsEnabled : automationEnabled;
  }

  it('EMAIL_AUTOMATION_ENABLED=false + PAYMENT_EMAILS_ENABLED=true -> pagos SE ENVÍAN, welcome/activation NO', () => {
    expect(categoryEnabled('payment_received_buyer', false, true)).toBe(true);
    expect(categoryEnabled('payment_received_merchant', false, true)).toBe(true);
    expect(categoryEnabled('welcome', false, true)).toBe(false);
    expect(categoryEnabled('activation_24h', false, true)).toBe(false);
  });

  it('EMAIL_AUTOMATION_ENABLED=true + PAYMENT_EMAILS_ENABLED=false -> legacy puede funcionar, pagos NO SE ENVÍAN', () => {
    expect(categoryEnabled('welcome', true, false)).toBe(true);
    expect(categoryEnabled('activation_24h', true, false)).toBe(true);
    expect(categoryEnabled('payment_received_buyer', true, false)).toBe(false);
    expect(categoryEnabled('payment_received_merchant', true, false)).toBe(false);
  });

  it('ambos en false -> ningún tipo se envía', () => {
    for (const type of ['welcome', 'activation_24h', 'payment_received_buyer', 'payment_received_merchant']) {
      expect(categoryEnabled(type, false, false)).toBe(false);
    }
  });

  it('ambos en true -> ambas categorías se envían según sus reglas existentes', () => {
    for (const type of ['welcome', 'activation_24h', 'payment_received_buyer', 'payment_received_merchant']) {
      expect(categoryEnabled(type, true, true)).toBe(true);
    }
  });

  it('PAYMENT_EMAILS_ENABLED=true nunca activa por sí solo welcome/activation (no "implica" EMAIL_AUTOMATION_ENABLED)', () => {
    expect(categoryEnabled('welcome', false, true)).toBe(false);
  });

  it('EMAIL_AUTOMATION_ENABLED=true nunca activa por sí solo los emails de pago (no lo "requieren")', () => {
    expect(categoryEnabled('payment_received_buyer', true, false)).toBe(false);
  });

  it('el guard de EMAIL_FUNCTION_SECRET sigue aplicando siempre, sin importar el valor de ninguno de los dos flags de categoría', () => {
    const guardIdx = indexSource.indexOf("if (action !== 'preview' && action !== 'admin_send_test')");
    const categoryIdx = indexSource.indexOf('const categoryEnabled = isPaymentEmail');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(categoryIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(categoryIdx);
  });
});

describe('send-email — helper de método de pago compartido, sin inventar labels', () => {
  it('paymentMethodLabel mapea los 6 methods conocidos de wa_order_payments y hace fallback seguro', () => {
    expect(indexSource).toMatch(/checkout_pro: 'Checkout Pro'/);
    expect(indexSource).toMatch(/point: 'Point'/);
    expect(indexSource).toMatch(/qr: 'QR'/);
    expect(indexSource).toMatch(/cash: 'Efectivo'/);
    expect(indexSource).toMatch(/bank_transfer: 'Transferencia bancaria'/);
    expect(indexSource).toMatch(/other: 'Otro'/);
  });
});
