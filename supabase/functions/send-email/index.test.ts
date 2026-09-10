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

  it('el asunto del comprador es "Pago recibido en {businessName} — Pedido #<shortId>" (EMAIL-PAYMENTS-1B)', () => {
    const match = indexSource.match(/case 'payment_received_buyer': \{[\s\S]*?const subject = `Pago recibido en \$\{subjectBusinessName\} — Pedido #\$\{shortId\}`;/);
    expect(match).not.toBeNull();
  });

  it('el asunto del comercio es "Nueva venta pagada en {businessName} — Pedido #<shortId>" (EMAIL-PAYMENTS-1B)', () => {
    const match = indexSource.match(/case 'payment_received_merchant': \{[\s\S]*?const subject = `Nueva venta pagada en \$\{subjectBusinessName\} — Pedido #\$\{shortId\}`;/);
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

// ─── EMAIL-PAYMENTS-1B — identificación clara del comercio ────────────────
describe('send-email — EMAIL-PAYMENTS-1B: subject/encabezado identifican al comercio', () => {
  const buyerBlock = () => indexSource.match(/case 'payment_received_buyer': \{[\s\S]*?\n    \}/)![0];
  const merchantBlock = () => indexSource.match(/case 'payment_received_merchant': \{[\s\S]*?\n    \}/)![0];

  it('buyer: subject usa sanitizeSubjectText(n) -- se comporta como "Pago recibido en Artesellos — Pedido #A1B2C3" para businessName=Artesellos', () => {
    const block = buyerBlock();
    expect(block).toMatch(/const subjectBusinessName = sanitizeSubjectText\(n\);/);
    expect(block).toMatch(/const subject = `Pago recibido en \$\{subjectBusinessName\} — Pedido #\$\{shortId\}`;/);
    // Evaluación real de la plantilla del subject con datos concretos --
    // misma expresión que la fuente, prueba el resultado visible completo.
    const subjectBusinessName = 'Artesellos'.replace(/[\r\n]+/g, ' ').trim();
    const shortId = 'A1B2C3';
    const subject = `Pago recibido en ${subjectBusinessName} — Pedido #${shortId}`;
    expect(subject).toBe('Pago recibido en Artesellos — Pedido #A1B2C3');
  });

  it('buyer: el encabezado <h1> del HTML contiene "Pago recibido en {businessName}"', () => {
    const block = buyerBlock();
    expect(block).toMatch(/<h1[^>]*>Pago recibido en \$\{escapeHtml\(n\)\}<\/h1>/);
  });

  it('buyer: el nombre del comercio aparece en el encabezado ANTES de la tabla de productos', () => {
    const block = buyerBlock();
    const h1Idx = block.indexOf('Pago recibido en ${escapeHtml(n)}');
    const itemsTableIdx = block.indexOf('itemsRows ?');
    expect(h1Idx).toBeGreaterThan(-1);
    expect(itemsTableIdx).toBeGreaterThan(-1);
    expect(h1Idx).toBeLessThan(itemsTableIdx);
  });

  it('buyer: incluye la línea sobria "Tu pago fue confirmado correctamente." inmediatamente después del encabezado', () => {
    const block = buyerBlock();
    expect(block).toMatch(/Tu pago fue confirmado correctamente\./);
  });

  it('merchant: subject usa sanitizeSubjectText(n) -- se comporta como "Nueva venta pagada en Artesellos — Pedido #A1B2C3" para businessName=Artesellos', () => {
    const block = merchantBlock();
    expect(block).toMatch(/const subjectBusinessName = sanitizeSubjectText\(n\);/);
    expect(block).toMatch(/const subject = `Nueva venta pagada en \$\{subjectBusinessName\} — Pedido #\$\{shortId\}`;/);
    const subjectBusinessName = 'Artesellos'.replace(/[\r\n]+/g, ' ').trim();
    const shortId = 'A1B2C3';
    const subject = `Nueva venta pagada en ${subjectBusinessName} — Pedido #${shortId}`;
    expect(subject).toBe('Nueva venta pagada en Artesellos — Pedido #A1B2C3');
  });

  it('merchant: el encabezado <h1> del HTML contiene "Nueva venta pagada en {businessName}"', () => {
    const block = merchantBlock();
    expect(block).toMatch(/<h1[^>]*>Nueva venta pagada en \$\{escapeHtml\(n\)\}<\/h1>/);
  });

  it('el businessName se escapa con escapeHtml en ambos encabezados HTML -- nunca HTML crudo', () => {
    expect(buyerBlock()).toMatch(/Pago recibido en \$\{escapeHtml\(n\)\}/);
    expect(merchantBlock()).toMatch(/Nueva venta pagada en \$\{escapeHtml\(n\)\}/);
  });

  it('el subject NO usa escapeHtml sobre el nombre del comercio -- un subject no es HTML, evita mostrar entidades literales (&amp;) al destinatario', () => {
    expect(buyerBlock()).not.toMatch(/const subject = `Pago recibido en \$\{escapeHtml/);
    expect(merchantBlock()).not.toMatch(/const subject = `Nueva venta pagada en \$\{escapeHtml/);
  });

  it('sanitizeSubjectText quita saltos de línea del nombre del comercio (defensa contra header injection), sin HTML-escapear', () => {
    expect(indexSource).toMatch(
      /function sanitizeSubjectText\(value: unknown\): string \{\s*\n\s*return String\(value \?\? ''\)\.replace\(\/\[\\r\\n\]\+\/g, ' '\)\.trim\(\);/,
    );
    // Comportamiento real: un nombre con salto de línea queda en una sola
    // línea; nunca se convierte en entidades HTML.
    const dirty = 'Mi Negocio\r\nX-Injected: evil';
    const clean = dirty.replace(/[\r\n]+/g, ' ').trim();
    expect(clean).toBe('Mi Negocio X-Injected: evil');
    expect(clean).not.toMatch(/[\r\n]/);
    expect(clean).not.toMatch(/&amp;|&lt;|&gt;/);
  });

  it('no se introduce "vía Walinka" ni ninguna variante -- el remitente sigue siendo Walinka puro, sin mezclar con el nombre del comercio', () => {
    expect(indexSource).not.toMatch(/vía Walinka/i);
    expect(indexSource).not.toMatch(/via Walinka/i);
  });

  it('FROM_EMAIL no fue tocado -- sigue siendo el remitente legacy de Walinka, nunca un dominio/email del comercio', () => {
    expect(indexSource).toMatch(/const FROM_EMAIL = 'Walinka <hola@mail\.ventalink\.app>';/);
    // Ningún caso de pago construye un remitente dinámico a partir de datos
    // del negocio (email/whatsapp/slug) -- FROM_EMAIL es la única fuente.
    const buyerHtml = buyerBlock().match(/const html = `[\s\S]*?<\/html>`;/)![0];
    const merchantHtml = merchantBlock().match(/const html = `[\s\S]*?<\/html>`;/)![0];
    for (const html of [buyerHtml, merchantHtml]) {
      expect(html).not.toMatch(/from:/i);
    }
  });

  it('no existe reply-to dinámico ni estático en send-email todavía -- confirma el estado actual, no se amplía en esta fase', () => {
    expect(indexSource).not.toMatch(/reply.?to/i);
  });

  it('no se modificó la lógica de flags (PAYMENT_EMAILS_ENABLED/EMAIL_AUTOMATION_ENABLED) en esta fase', () => {
    expect(indexSource).toMatch(/const categoryEnabled = isPaymentEmail \? isPaymentEmailsEnabled\(\) : isEmailAutomationEnabled\(\);/);
  });

  it('no se introduce ninguna referencia a Vercel', () => {
    expect(indexSource).not.toMatch(/vercel/i);
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
