/**
 * merchant-mp-webhook/index.ts — tests estáticos (source-scan) de las
 * invariantes de seguridad que lib.test.ts no puede cubrir (index.ts
 * toca Deno.serve/Deno.env a nivel de módulo, así que no se importa/
 * ejecuta directamente en Vitest).
 */
import { describe, it, expect } from 'vitest';
import indexSource from './index.ts?raw';

describe('merchant-mp-webhook — nunca confía en el body del webhook', () => {
  it('no lee status/amount/currency/business_id/order_id/external_reference del body recibido -- solo type/data.id', () => {
    expect(indexSource).toMatch(/parseWebhookNotification\(body\)/);
    expect(indexSource).not.toMatch(/body\??\.\s*(status|amount|currency|business_id|order_id|external_reference)\b/);
  });

  it('no valida ningún JWT -- público, igual que mp-webhook de billing', () => {
    expect(indexSource).not.toMatch(/auth\.getUser\(/);
  });
});

describe('merchant-mp-webhook — SIEMPRE re-consulta Mercado Pago', () => {
  it('hace GET a v1/payments/:id usando el token del comercio resuelto server-side', () => {
    expect(indexSource).toMatch(/MP_PAYMENT_URL/);
    expect(indexSource).toMatch(/Authorization: `Bearer \$\{mpAccessToken\}`/);
  });

  it('mpStatus/mpStatusDetail/transactionAmount/currencyId/externalRefRaw vienen SIEMPRE del payment parseado de la respuesta de MP, nunca del body original', () => {
    expect(indexSource).toMatch(/const mpStatus = String\(payment\?\.\s*status/);
    expect(indexSource).toMatch(/const transactionAmount = Number\(payment\?\.\s*transaction_amount/);
    expect(indexSource).toMatch(/const currencyId = String\(payment\?\.\s*currency_id/);
    expect(indexSource).toMatch(/const externalRefRaw = payment\?\.\s*external_reference/);
  });
});

describe('merchant-mp-webhook — order_id hint solo para elegir token, nunca fuente de verdad', () => {
  it('usa wa_get_mp_connection_for_checkout con el business_id resuelto de wa_orders, nunca de un valor del body', () => {
    expect(indexSource).toMatch(/wa_get_mp_connection_for_checkout/);
    expect(indexSource).toMatch(/p_business_id: orderRow\.business_id/);
  });

  it('re-confirma la identidad real vía validateReferenceMatch contra el external_reference de MP, no contra el hint solo', () => {
    expect(indexSource).toMatch(/validateReferenceMatch\(parsedRef, orderRow\.business_id/);
  });

  it('nunca lee MP_ACCESS_TOKEN_CL/MP_ACCESS_TOKEN_AR', () => {
    expect(indexSource).not.toMatch(/Deno\.env\.get\(['"]MP_ACCESS_TOKEN_(CL|AR)['"]\)/);
  });
});

describe('merchant-mp-webhook — validaciones obligatorias antes de marcar pagado', () => {
  it('valida external_reference, match de negocio/pedido, amount y currency ANTES de invocar la RPC de transición', () => {
    const refIdx = indexSource.indexOf('parseExternalReference(externalRefRaw)');
    const matchIdx = indexSource.indexOf('validateReferenceMatch(parsedRef');
    const amountIdx = indexSource.indexOf('amountsMatch(transactionAmount');
    const currencyIdx = indexSource.indexOf("currencyId !== orderRow.currency");
    const rpcIdx = indexSource.indexOf("admin.rpc('wa_process_merchant_payment_event'");
    expect(refIdx).toBeGreaterThan(-1);
    expect(matchIdx).toBeGreaterThan(-1);
    expect(amountIdx).toBeGreaterThan(-1);
    expect(currencyIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(-1);
    expect(refIdx).toBeLessThan(rpcIdx);
    expect(matchIdx).toBeLessThan(rpcIdx);
    expect(amountIdx).toBeLessThan(rpcIdx);
    expect(currencyIdx).toBeLessThan(rpcIdx);
  });
});

describe('merchant-mp-webhook — respuestas nunca exponen secretos/internals', () => {
  it('nunca loguea ni devuelve el access_token', () => {
    expect(indexSource).not.toMatch(/console\.(log|warn|error|info|debug)\([^)]*mpAccessToken/);
    expect(indexSource).not.toMatch(/jsonResponse\(\{[^}]*access_token/);
  });

  it('errores de MP solo loguean status, nunca el body completo de la respuesta', () => {
    expect(indexSource).toMatch(/nunca el body completo/);
  });

  it('eventos no accionables responden 200 ok:true,ignored:true -- nunca piden reintento infinito a Mercado Pago', () => {
    expect(indexSource).toMatch(/function ignoredResponse/);
    expect(indexSource).toMatch(/ok: true, ignored: true/);
  });

  it('fallos internos/transitorios (fetch, DB, RPC no reconocida) responden 5xx para permitir retry de Mercado Pago', () => {
    expect(indexSource).toMatch(/502/);
    expect(indexSource).toMatch(/jsonResponse\(\{ ok: false, error: 'internal_error' \}, 500\)/);
  });
});

describe('merchant-mp-webhook — aislamiento de billing Walinka', () => {
  it('no tiene ningún import/llamada real a mp-webhook, create-mp-preference, wa_payments, wa_payment_events ni billing_subscriptions', () => {
    expect(indexSource).not.toMatch(/from ['"]\.\.\/mp-webhook/);
    expect(indexSource).not.toMatch(/from ['"]\.\.\/create-mp-preference/);
    expect(indexSource).not.toMatch(/\.from\(['"](wa_payments|wa_payment_events|billing_subscriptions|crm_payments)['"]\)/);
    expect(indexSource).not.toMatch(/\.rpc\(['"][^'"]*(wa_payments|wa_payment_events|billing_subscriptions)/);
  });
});

// ─── MP-MARKETPLACE-1 — comisión Walinka (walinka_fee) ────────────────────
describe('merchant-mp-webhook — walinka_fee calculado server-side, nunca desde el body/payment de MP', () => {
  it('usa computeWalinkaMarketplaceFee sobre orderRow.total_amount/orderRow.currency, nunca sobre `payment` (respuesta de MP) ni `body` (webhook)', () => {
    expect(indexSource).toMatch(/computeWalinkaMarketplaceFee\(toCents\(Number\(orderRow\.total_amount\)\), orderRow\.currency as string\)/);
    expect(indexSource).not.toMatch(/computeWalinkaMarketplaceFee\([^)]*payment\?/);
    expect(indexSource).not.toMatch(/computeWalinkaMarketplaceFee\([^)]*body\?/);
  });

  it('no lee ningún campo de marketplace_fee/fee_details desde la respuesta de Mercado Pago -- el cálculo es la única fuente', () => {
    expect(indexSource).not.toMatch(/payment\?\.\s*marketplace_fee/);
    expect(indexSource).not.toMatch(/payment\?\.\s*fee_details/);
  });

  it('el fee se calcula DESPUÉS de que amount/currency/reference ya fueron validados contra la respuesta fresca de MP (no reemplaza esas validaciones)', () => {
    const amountIdx = indexSource.indexOf('amountsMatch(transactionAmount');
    const currencyIdx = indexSource.indexOf('currencyId !== orderRow.currency');
    const feeIdx = indexSource.indexOf('computeWalinkaMarketplaceFee(toCents');
    const rpcIdx = indexSource.indexOf("admin.rpc('wa_process_merchant_payment_event'");
    expect(amountIdx).toBeGreaterThan(-1);
    expect(currencyIdx).toBeGreaterThan(-1);
    expect(feeIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(-1);
    expect(amountIdx).toBeLessThan(feeIdx);
    expect(currencyIdx).toBeLessThan(feeIdx);
    expect(feeIdx).toBeLessThan(rpcIdx);
  });

  it('un fallo de cálculo NO bloquea la confirmación del pago/stock -- se persiste 0 y se loguea para reconciliación, sin debilitar amount/currency/reference', () => {
    const feeBlockMatch = indexSource.match(/const feeResult = computeWalinkaMarketplaceFee\([\s\S]*?const walinkaFee = feeResult\.ok \? feeResult\.fee : 0;/);
    expect(feeBlockMatch).not.toBeNull();
    expect(feeBlockMatch![0]).toMatch(/console\.error/);
    expect(feeBlockMatch![0]).not.toMatch(/return /);
  });

  it('walinkaFee se pasa como p_walinka_fee a wa_process_merchant_payment_event', () => {
    expect(indexSource).toMatch(/p_walinka_fee: walinkaFee,/);
  });

  it('nunca loguea ni devuelve walinkaFee de forma que reemplace/oculte los demás campos de auditoría del evento', () => {
    const logMatch = indexSource.match(/console\.log\('\[merchant-mp-webhook\] payment_event_processed', \{[\s\S]*?\}\);/);
    expect(logMatch).not.toBeNull();
    expect(logMatch![0]).toMatch(/walinkaFee,/);
    expect(logMatch![0]).toMatch(/appliedNow: result\?\.\s*applied_now/);
  });
});

// ─── MP-PAYMENT-DETAIL-1 — paid_at para wa_order_payments ─────────────────
describe('merchant-mp-webhook — paid_at derivado SIEMPRE de la respuesta verificada de MP', () => {
  it('usa resolvePaidAt(payment?.date_approved), nunca un valor del body del webhook', () => {
    expect(indexSource).toMatch(/const paidAt = resolvePaidAt\(payment\?\.\s*date_approved \?\? null\)/);
    expect(indexSource).not.toMatch(/resolvePaidAt\([^)]*body\?/);
  });

  it('paidAt se calcula DESPUÉS de parsear `payment` pero se pasa a la RPC junto al resto de campos ya validados', () => {
    const paidAtIdx = indexSource.indexOf('const paidAt = resolvePaidAt');
    const rpcIdx = indexSource.indexOf("admin.rpc('wa_process_merchant_payment_event'");
    expect(paidAtIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(-1);
    expect(paidAtIdx).toBeLessThan(rpcIdx);
  });

  it('paidAt se pasa como p_paid_at a wa_process_merchant_payment_event', () => {
    expect(indexSource).toMatch(/p_paid_at: paidAt,/);
  });

  it('el tipo `payment` declara date_approved -- el campo se extrae del payload ya verificado, no se inventa', () => {
    const paymentTypeMatch = indexSource.match(/let payment: \{[\s\S]*?\};/);
    expect(paymentTypeMatch).not.toBeNull();
    expect(paymentTypeMatch![0]).toMatch(/date_approved\?:\s*string;/);
  });
});

// ─── EMAIL-PAYMENTS-1 — encolado de emails de confirmación de pago ────────
describe('merchant-mp-webhook — encola emails de pago SOLO en applied_now, nunca síncrono con Resend', () => {
  it('llama a wa_enqueue_payment_confirmation_emails solo dentro de un if (result?.applied_now)', () => {
    const guardMatch = indexSource.match(/if \(result\?\.\s*applied_now\) \{[\s\S]*?\n  \}/);
    expect(guardMatch).not.toBeNull();
    expect(guardMatch![0]).toMatch(/admin\.rpc\('wa_enqueue_payment_confirmation_emails', \{/);
    expect(guardMatch![0]).toMatch(/p_order_id: orderRow\.id,/);
  });

  it('el enqueue está envuelto en try/catch propio -- un fallo ahí nunca revierte ni bloquea la respuesta 200 ok:true', () => {
    const guardMatch = indexSource.match(/if \(result\?\.\s*applied_now\) \{[\s\S]*?\n  \}/)![0];
    expect(guardMatch).toMatch(/try \{[\s\S]*?catch \(err\) \{/);
    expect(guardMatch).not.toMatch(/return /);
  });

  it('el enqueue ocurre DESPUÉS de la RPC de transición de pago (el pago ya está confirmado antes de intentar encolar)', () => {
    const rpcIdx = indexSource.indexOf("admin.rpc('wa_process_merchant_payment_event'");
    const enqueueIdx = indexSource.indexOf("admin.rpc('wa_enqueue_payment_confirmation_emails'");
    expect(rpcIdx).toBeGreaterThan(-1);
    expect(enqueueIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeLessThan(enqueueIdx);
  });

  it('nunca llama a Resend, send-email, ni ningún endpoint /api de Vercel directamente desde este archivo', () => {
    // Solo se revisan llamadas reales, no comentarios (el archivo SÍ
    // menciona "Resend" en un comentario explicando por qué no se llama
    // síncronamente -- eso es intencional, no una violación).
    expect(indexSource).not.toMatch(/api\.resend\.com/);
    expect(indexSource).not.toMatch(/from ['"]resend['"]/);
    expect(indexSource).not.toMatch(/new Resend\(/);
    expect(indexSource).not.toMatch(/functions\/v1\/send-email/);
    expect(indexSource).not.toMatch(/\/api\/cron\//);
    expect(indexSource).not.toMatch(/process-email-queue\.js/);
  });

  it('el response final sigue siendo exactamente { ok: true } 200, sin importar el resultado del enqueue', () => {
    const afterEnqueueIdx = indexSource.indexOf("admin.rpc('wa_enqueue_payment_confirmation_emails'");
    const finalReturnIdx = indexSource.indexOf('return jsonResponse({ ok: true }, 200);');
    expect(afterEnqueueIdx).toBeGreaterThan(-1);
    expect(finalReturnIdx).toBeGreaterThan(-1);
    expect(afterEnqueueIdx).toBeLessThan(finalReturnIdx);
  });
});
