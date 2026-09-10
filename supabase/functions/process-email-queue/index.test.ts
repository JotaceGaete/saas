/**
 * process-email-queue — Fase C: guarda que la client key nunca vuelva a
 * usarse como Authorization: Bearer. Test estático (source-scan) -- este
 * archivo toca Deno.serve/Deno.env a nivel de módulo, así que no se
 * importa/ejecuta directamente en Vitest.
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.ts?raw';
import vercelJsonSource from '../../../vercel.json?raw';
import vercelEmailCronSource from '../../../api/cron/process-email-queue.js?raw';

describe('process-email-queue — publishable key usage (Fase C)', () => {
  it('resuelve la client key vía el helper compartido, no Deno.env.get directo', () => {
    expect(indexSource).toMatch(/getSupabasePublishableKeyOrEmpty\(\)/);
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]SUPABASE_ANON_KEY['"]\)/);
  });

  it('envía la client key solo como apikey al invocar send-email', () => {
    expect(indexSource).toMatch(/'apikey':\s*anonKey/);
  });

  it('nunca envía la client key como Authorization: Bearer', () => {
    expect(indexSource).not.toMatch(/'Authorization'/);
    expect(indexSource).not.toMatch(/Authorization.*Bearer/);
  });

  it('conserva el payload y la lógica de idempotencia hacia send-email sin cambios', () => {
    expect(indexSource).toMatch(/idempotencyKey/);
    expect(indexSource).toMatch(/source: 'cron'/);
    expect(indexSource).toMatch(/x-email-secret/);
  });
});

// ─── EMAIL-PAYMENTS-1 ──────────────────────────────────────────────────────

describe('process-email-queue — EMAIL_FUNCTION_SECRET obligatorio (hardening)', () => {
  it('rechaza con 500 si EMAIL_FUNCTION_SECRET no está configurado -- fail closed, ya no opcional', () => {
    expect(indexSource).toMatch(
      /if \(!emailSecret\) \{[\s\S]*?return jsonResponse\(\{ error: 'Server configuration error' \}, 500\);/,
    );
  });

  it('exige x-email-secret exacto para invocar el endpoint -- 401 si no coincide', () => {
    expect(indexSource).toMatch(
      /const incoming = req\.headers\.get\('x-email-secret'\) \?\? '';\s*\n\s*if \(incoming !== emailSecret\) \{[\s\S]*?return jsonResponse\(\{ error: 'Unauthorized' \}, 401\);/,
    );
  });

  it('siempre envía x-email-secret a send-email (ya no es un header condicional)', () => {
    expect(indexSource).toMatch(/'x-email-secret': emailSecret,/);
  });
});

describe('process-email-queue — claim atómico via RPC, ya no un SELECT sin lock', () => {
  it('usa wa_claim_email_queue_batch en vez de .from(email_queue).select()', () => {
    expect(indexSource).toMatch(/supabase\.rpc\('wa_claim_email_queue_batch', \{/);
    expect(indexSource).not.toMatch(/\.from\('email_queue'\)\s*\n\s*\.select\(/);
  });

  it('pasa batch_size y stale_minutes a la RPC', () => {
    expect(indexSource).toMatch(/p_batch_size: BATCH_SIZE,/);
    expect(indexSource).toMatch(/p_stale_minutes: CLAIM_STALE_MINUTES,/);
  });
});

describe('process-email-queue — retry/backoff usa next_attempt_at, no send_at', () => {
  it('markFailed (reintentable) actualiza next_attempt_at, status=failed y last_error', () => {
    const retryBlock = indexSource.match(/\} else \{[\s\S]*?next_attempt_at: retryAt, last_error: reason \}\)/);
    expect(retryBlock).not.toBeNull();
    expect(retryBlock![0]).toMatch(/status: 'failed'/);
  });

  it('markFailed (agotado) limpia next_attempt_at y guarda last_error', () => {
    expect(indexSource).toMatch(
      /status: 'failed', retry_count: nextRetry, next_attempt_at: null, last_error: reason/,
    );
  });

  it('ya no escribe send_at en ningún reintento (columna legacy, no es el gate del claim)', () => {
    const markFailedFn = indexSource.match(/async function markFailed\([\s\S]*?\n\}/)![0];
    expect(markFailedFn).not.toMatch(/send_at: retryAt/);
  });
});

describe('process-email-queue — payment_received_buyer/merchant: relee todo server-side, nunca confía en el payload de encolado', () => {
  it('branch por tipo: PAYMENT_EMAIL_TYPES va a processPaymentRow, el resto a processLifecycleRow (welcome/activation_24h sin cambios)', () => {
    expect(indexSource).toMatch(/const PAYMENT_EMAIL_TYPES = new Set\(\['payment_received_buyer', 'payment_received_merchant'\]\);/);
    expect(indexSource).toMatch(/if \(PAYMENT_EMAIL_TYPES\.has\(row\.type\)\) \{\s*\n\s*await processPaymentRow\(/);
  });

  it('processPaymentRow relee wa_orders, wa_order_items y wa_order_payments desde payload.order_id -- no desde columnas guardadas al encolar', () => {
    const fnMatch = indexSource.match(/async function processPaymentRow\([\s\S]*?\n\}\n?$/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toMatch(/\.from\('wa_orders'\)/);
    expect(fnMatch![0]).toMatch(/\.from\('wa_order_items'\)/);
    expect(fnMatch![0]).toMatch(/\.from\('wa_order_payments'\)/);
    expect(fnMatch![0]).toMatch(/\.from\('wa_businesses'\)/);
  });

  it('si no hay wa_order_payments para el pedido, falla definitivo en vez de inventar el método de pago', () => {
    const fnMatch = indexSource.match(/async function processPaymentRow\([\s\S]*?\n\}\n?$/)![0];
    expect(fnMatch).toMatch(/no se inventa el método/);
    expect(fnMatch).toMatch(/await markFailed\(supabase, row\.id, 'Missing wa_order_payments row for order', MAX_RETRIES\);/);
  });

  it('buyer: solo envía si customer_email existe -- si no, falla controladamente sin bloquear nada más', () => {
    const fnMatch = indexSource.match(/async function processPaymentRow\([\s\S]*?\n\}\n?$/)![0];
    expect(fnMatch).toMatch(/to = order\.customer_email && order\.customer_email\.trim\(\) \? order\.customer_email\.trim\(\) : null;/);
  });

  it('merchant: fallback a auth.users cuando wa_businesses.email está vacío -- mismo patrón que wa_queue_welcome_email', () => {
    const fnMatch = indexSource.match(/async function processPaymentRow\([\s\S]*?\n\}\n?$/)![0];
    expect(fnMatch).toMatch(/supabase\.auth\.admin\.getUserById\(business\.user_id\)/);
  });

  it('providerPaymentId solo se pasa cuando provider === mercado_pago', () => {
    const fnMatch = indexSource.match(/async function processPaymentRow\([\s\S]*?\n\}\n?$/)![0];
    expect(fnMatch).toMatch(/providerPaymentId: payment\.provider === 'mercado_pago' \? payment\.provider_payment_id : null,/);
  });

  it('idempotencyKey hacia send-email usa row.event_key -- reutiliza la idempotencia de wa_email_logs como defensa adicional', () => {
    const fnMatch = indexSource.match(/async function processPaymentRow\([\s\S]*?\n\}\n?$/)![0];
    expect(fnMatch).toMatch(/const idempotencyKey = row\.event_key \|\| /);
  });

  // EMAIL-PAYMENTS-2A: el fix de compatibilidad legacy de email_queue
  // (20260910200000) agrega to_email/template al INSERT del enqueue
  // ÚNICAMENTE para satisfacer el NOT NULL real de producción -- nunca
  // como una fuente de la que este processor deba empezar a leer. Este
  // test fija esa garantía: si algún día alguien "simplifica" el
  // processor para leer row.to_email/row.template en vez de releer
  // fresco, este test debe romperse.
  it('nunca lee row.to_email ni row.template -- to_email/template del INSERT son solo compat de schema, no la fuente de verdad del envío', () => {
    const fnMatch = indexSource.match(/async function processPaymentRow\([\s\S]*?\n\}\n?$/)![0];
    expect(fnMatch).not.toMatch(/row\.to_email/);
    expect(fnMatch).not.toMatch(/row\.template/);
    // Confirma que sigue resolviendo `to` desde order/business releídos, no desde la fila.
    expect(fnMatch).toMatch(/to = order\.customer_email/);
    expect(fnMatch).toMatch(/to = business\.email/);
  });
});

describe('process-email-queue — separación de flags: PAYMENT_EMAILS_ENABLED vs EMAIL_AUTOMATION_ENABLED', () => {
  it('lee ambos flags de sus propias env vars, independientes entre sí', () => {
    expect(indexSource).toMatch(/function isPaymentEmailsEnabled\(\) \{\s*\n\s*return Deno\.env\.get\('PAYMENT_EMAILS_ENABLED'\) === 'true';/);
    expect(indexSource).toMatch(/function isEmailAutomationEnabled\(\) \{\s*\n\s*return Deno\.env\.get\('EMAIL_AUTOMATION_ENABLED'\) === 'true';/);
  });

  it('solo sale temprano (skip) cuando AMBOS flags están en false -- nunca por uno solo', () => {
    expect(indexSource).toMatch(
      /if \(!automationEnabled && !paymentEmailsEnabled\) \{[\s\S]*?return jsonResponse\(\{ skipped: true, reason: ALL_EMAIL_CATEGORIES_DISABLED_REASON \}, 200\);/,
    );
  });

  it('pasa cada flag directo como el include de su categoría en el claim -- payment->p_include_payment_types, automation->p_include_legacy_types', () => {
    expect(indexSource).toMatch(/p_include_payment_types: paymentEmailsEnabled,/);
    expect(indexSource).toMatch(/p_include_legacy_types: automationEnabled,/);
  });

  // Matriz explícita (EMAIL-PAYMENTS-1, sección 2/9). Mismo criterio que en
  // send-email/index.test.ts: se replica la MISMA lógica ya verificada por
  // regex arriba (skip solo si ambos false; los flags booleanos se pasan
  // 1:1 al claim como include de cada categoría) y se evalúa contra las 4
  // combinaciones pedidas.
  function claimPlan(automationEnabled: boolean, paymentEmailsEnabled: boolean) {
    if (!automationEnabled && !paymentEmailsEnabled) {
      return { skipped: true, claimsPayment: false, claimsLegacy: false };
    }
    return { skipped: false, claimsPayment: paymentEmailsEnabled, claimsLegacy: automationEnabled };
  }

  it('EMAIL_AUTOMATION_ENABLED=false + PAYMENT_EMAILS_ENABLED=true -> reclama pagos, NO reclama legacy, no se salta', () => {
    const plan = claimPlan(false, true);
    expect(plan.skipped).toBe(false);
    expect(plan.claimsPayment).toBe(true);
    expect(plan.claimsLegacy).toBe(false);
  });

  it('EMAIL_AUTOMATION_ENABLED=true + PAYMENT_EMAILS_ENABLED=false -> reclama legacy (welcome/activation_24h pueden funcionar), NO reclama pagos', () => {
    const plan = claimPlan(true, false);
    expect(plan.skipped).toBe(false);
    expect(plan.claimsLegacy).toBe(true);
    expect(plan.claimsPayment).toBe(false);
  });

  it('ambos en false -> se salta por completo, ni siquiera se llama a wa_claim_email_queue_batch', () => {
    const plan = claimPlan(false, false);
    expect(plan.skipped).toBe(true);
    expect(plan.claimsPayment).toBe(false);
    expect(plan.claimsLegacy).toBe(false);
  });

  it('ambos en true -> reclama ambas categorías', () => {
    const plan = claimPlan(true, true);
    expect(plan.skipped).toBe(false);
    expect(plan.claimsPayment).toBe(true);
    expect(plan.claimsLegacy).toBe(true);
  });
});

describe('EMAIL-PAYMENTS-1 — Vercel queda con 0 ejecuciones en este flujo', () => {
  it('vercel.json sigue con un único cron (process-admin-alert-queue) -- no se agregó ninguna entrada para email', () => {
    const cronsMatch = vercelJsonSource.match(/"crons":\s*\[[\s\S]*?\]/);
    expect(cronsMatch).not.toBeNull();
    expect(cronsMatch![0]).toMatch(/process-admin-alert-queue/);
    expect(cronsMatch![0]).not.toMatch(/process-email-queue/);
    expect(cronsMatch![0]).not.toMatch(/email/i);
  });

  it('api/cron/process-email-queue.js (implementación Vercel histórica) queda intacto, no reactivado ni reescrito', () => {
    // No se toca ese archivo en esta fase -- se verifica que sigue
    // existiendo tal cual (sin nueva lógica agregada) y que nada del
    // nuevo flujo lo importa o lo referencia.
    expect(vercelEmailCronSource).toMatch(/from '@supabase\/supabase-js'/);
    expect(vercelEmailCronSource).not.toMatch(/wa_claim_email_queue_batch/);
    expect(vercelEmailCronSource).not.toMatch(/wa_enqueue_payment_confirmation_emails/);
    expect(vercelEmailCronSource).not.toMatch(/payment_received_buyer|payment_received_merchant/);
  });

  it('ningún archivo del nuevo flujo (send-email, process-email-queue Deno, merchant-mp-webhook) importa o referencia api/cron/process-email-queue.js', () => {
    expect(indexSource).not.toMatch(/process-email-queue\.js/);
    expect(indexSource).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/api\//);
  });
});
