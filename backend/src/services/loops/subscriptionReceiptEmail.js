const LOOPS_TRANSACTIONAL_URL = 'https://app.loops.so/api/v1/transactional';

function pickString(value, maxLength = 200) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getLoopsApiKey() {
  return String(process.env.LOOPS_API_KEY || '').trim();
}

function getReceiptTransactionalId() {
  return String(process.env.LOOPS_SUBSCRIPTION_RECEIPT_TRANSACTIONAL_ID || '').trim();
}

export function getPaymentProviderLabel(provider) {
  const key = String(provider || '').trim().toLowerCase();
  if (key === 'mercado_pago' || key === 'mercadopago') return 'Mercado Pago';
  if (key === 'paypal') return 'PayPal';
  if (key === 'dlocal' || key === 'dlocal_go') return 'dLocal';
  return provider ? pickString(provider, 80) : 'Proveedor de pago';
}

export function getPlanName(planSlug) {
  const key = String(planSlug || '').trim().toLowerCase();
  if (key === 'business' || key === 'full') return 'Business';
  if (key === 'pro') return 'Pro';
  if (key === 'control') return 'Control';
  return 'Starter';
}

export function getPlanPeriodLabel(intervalUnit = 'month') {
  const key = String(intervalUnit || '').trim().toLowerCase();
  if (key === 'year' || key === 'yearly' || key === 'annual') return 'Anual';
  return 'Mensual';
}

export function formatReceiptAmount(amount, currency) {
  const code = String(currency || 'USD').trim().toUpperCase();
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return '';
  const noDecimals = code === 'CLP' || code === 'ARS';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: noDecimals ? 0 : 2,
    maximumFractionDigits: noDecimals ? 0 : 2,
  }).format(numericAmount);
}

export function formatReceiptDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'long',
    timeZone: 'America/Santiago',
  }).format(date);
}

export function getDashboardUrl() {
  const explicit = String(process.env.WALINKA_DASHBOARD_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const origin = String(process.env.VENTALINK_PUBLIC_ORIGIN || process.env.APP_PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
  return origin ? `${origin}/dashboard` : 'https://go.ventalink.app/dashboard';
}

function safeLog(level, message, context = {}) {
  const logger = level === 'warn' ? console.warn : console.info;
  logger(message, {
    paymentProvider: context.paymentProvider || null,
    paymentId: context.paymentId || null,
    subscriptionStatus: context.subscriptionStatus || null,
    skippedReason: context.skippedReason || null,
    status: context.status || null,
  });
}

export async function sendSubscriptionReceiptEmail({
  email,
  customerName,
  businessName,
  planName,
  planPeriod,
  amountFormatted,
  currency,
  paymentProvider,
  paymentId,
  subscriptionStatus,
  paidAtFormatted,
  nextRenewalDateFormatted,
  dashboardUrl,
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { ok: true, sent: false, skippedReason: 'invalid_email' };
  }

  const apiKey = getLoopsApiKey();
  const transactionalId = getReceiptTransactionalId();
  if (!apiKey) {
    safeLog('warn', '[loops-receipt] skipped', { paymentProvider, paymentId, subscriptionStatus, skippedReason: 'missing_api_key' });
    return { ok: true, sent: false, skippedReason: 'missing_api_key' };
  }
  if (!transactionalId) {
    safeLog('warn', '[loops-receipt] skipped', { paymentProvider, paymentId, subscriptionStatus, skippedReason: 'missing_transactional_id' });
    return { ok: true, sent: false, skippedReason: 'missing_transactional_id' };
  }

  const dataVariables = {
    customerName: pickString(customerName || businessName || 'Cliente'),
    businessName: pickString(businessName || 'Walinka'),
    planName: pickString(planName),
    planPeriod: pickString(planPeriod),
    amountFormatted: pickString(amountFormatted, 80),
    currency: pickString(currency, 20),
    paymentProvider: pickString(paymentProvider, 80),
    paymentId: pickString(paymentId, 120),
    subscriptionStatus: pickString(subscriptionStatus, 80),
    paidAtFormatted: pickString(paidAtFormatted, 80),
    nextRenewalDateFormatted: pickString(nextRenewalDateFormatted, 80),
    dashboardUrl: pickString(dashboardUrl, 500),
  };

  try {
    const response = await fetch(LOOPS_TRANSACTIONAL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactionalId,
        email: normalizedEmail,
        dataVariables,
      }),
    });

    if (!response.ok) {
      safeLog('warn', '[loops-receipt] send failed', {
        paymentProvider,
        paymentId,
        subscriptionStatus,
        skippedReason: 'loops_error',
        status: response.status,
      });
      return { ok: true, sent: false, skippedReason: 'loops_error', status: response.status };
    }

    safeLog('info', '[loops-receipt] sent', { paymentProvider, paymentId, subscriptionStatus });
    return { ok: true, sent: true };
  } catch (error) {
    safeLog('warn', '[loops-receipt] send failed', {
      paymentProvider,
      paymentId,
      subscriptionStatus,
      skippedReason: error?.message || 'network_error',
    });
    return { ok: true, sent: false, skippedReason: 'network_error' };
  }
}
