import { fetchDlocalPaymentById } from '../services/providers/dlocal/dlocalPaymentApi.js';

function redirect(url, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: url },
  });
}

function mapDlocalUiStatus(rawStatus) {
  const s = String(rawStatus || '').trim().toUpperCase();

  if (['PAID', 'AUTHORIZED', 'SUCCESS', 'APPROVED'].includes(s)) return 'success';
  if (['PENDING', 'PROCESSING', 'IN_PROGRESS'].includes(s)) return 'pending';
  return 'failed';
}

export async function dlocalBillingCallbackController(request) {
  const url = new URL(request.url);

  const paymentId =
    url.searchParams.get('payment_id')
    || url.searchParams.get('paymentId')
    || url.searchParams.get('id')
    || '';

  const providerStatus =
    url.searchParams.get('status')
    || url.searchParams.get('payment_status')
    || '';

  const externalReference =
    url.searchParams.get('order_id')
    || url.searchParams.get('external_reference')
    || '';

  // UX: si podemos, verificamos estado real; si falla, caemos al status del query.
  let verifiedStatus = '';
  try {
    if (paymentId) {
      const payment = await fetchDlocalPaymentById(paymentId);
      verifiedStatus = String(payment?.status || '').trim();
    }
  } catch (e) {
    console.warn('[DLOCAL_CALLBACK] verify_failed', e?.message || e);
  }

  const uiStatus = mapDlocalUiStatus(verifiedStatus || providerStatus);

  console.info('[DLOCAL_CALLBACK]', {
    route: '/api/v1/billing/dlocal/callback',
    payment_id: paymentId || null,
    provider_status: providerStatus || null,
    verified_status: verifiedStatus || null,
    external_reference: externalReference || null,
    ui_status: uiStatus,
  });

  const redirectUrl = new URL('/planes', url.origin);
  redirectUrl.searchParams.set('payment', uiStatus);

  if (paymentId) redirectUrl.searchParams.set('payment_id', paymentId);
  if (providerStatus) redirectUrl.searchParams.set('provider_status', providerStatus);

  return redirect(redirectUrl.toString(), 302);
}

