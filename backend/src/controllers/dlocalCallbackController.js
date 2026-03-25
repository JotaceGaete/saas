import { fetchDlocalPaymentById } from '../services/providers/dlocal/dlocalPaymentApi.js';
import { verifyDlocalCallbackSignature } from '../services/providers/dlocal/dlocalCallbackVerify.js';

function getSecretKey() {
  return String(process.env.DLOCAL_SECRET_KEY || '').trim();
}

function getDefaultXLogin() {
  return String(process.env.DLOCAL_X_LOGIN || process.env.DLOCAL_API_KEY || '').trim();
}

function redirect302(location) {
  return new Response(null, {
    status: 302,
    headers: { Location: location },
  });
}

function isAllowedRedirectHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h.endsWith('ventalink.app') || h === 'localhost' || h === '127.0.0.1';
}

/**
 * @param {string} appOrigin
 * @param {string | null} rd — return URL codificada en query del callback
 * @param {string} paymentParam — success | pending | failure | error
 */
function buildRedirectLocation(appOrigin, rd, paymentParam) {
  if (rd) {
    try {
      const u = new URL(rd);
      if (isAllowedRedirectHost(u.hostname)) {
        u.searchParams.set('payment', paymentParam);
        return u.toString();
      }
    } catch {
      /* fall through */
    }
  }
  return `${String(appOrigin).replace(/\/$/, '')}/planes?payment=${encodeURIComponent(paymentParam)}`;
}

/**
 * Estado real del pago (GET /v1/payments/:id) → query param para /planes
 */
function mapVerifiedStatusToPaymentParam(status) {
  const s = String(status || '').trim().toUpperCase();
  if (['PAID', 'APPROVED', 'AUTHORIZED'].includes(s)) return 'success';
  if (['PENDING', 'COMPLETED'].includes(s)) return 'pending';
  if (['REJECTED', 'CANCELLED', 'CANCELED', 'EXPIRED'].includes(s)) return 'failure';
  return 'pending';
}

async function parseCallbackPayload(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }
  const text = await request.text().catch(() => '');
  if (!text) return {};
  try {
    const params = new URLSearchParams(text);
    const o = {};
    for (const [k, v] of params.entries()) {
      o[k] = v;
    }
    return o;
  } catch {
    return {};
  }
}

export async function dlocalCallbackController(request) {
  const appOrigin = new URL(request.url).origin;
  const rd = new URL(request.url).searchParams.get('rd');

  const body = await parseCallbackPayload(request);

  const paymentId = String(
    body.paymentId ?? body.payment_id ?? body.id ?? '',
  ).trim();
  const callbackStatus = String(body.status ?? '').trim();
  const signature = String(body.signature ?? '').trim();
  const bodyDate = String(body.date ?? '').trim();
  const xLogin = String(
    request.headers.get('x-login') || request.headers.get('X-Login') || getDefaultXLogin(),
  ).trim();
  const headerDate = String(
    request.headers.get('x-date') || request.headers.get('X-Date') || '',
  ).trim();
  const dateForSig = bodyDate || headerDate;

  console.info('[dlocal-callback] paymentId=', paymentId, 'status=', callbackStatus);

  const secretKey = getSecretKey();
  const hasSignature = !!signature;
  let signatureOk = true;
  if (hasSignature && secretKey && paymentId && callbackStatus && dateForSig) {
    signatureOk = verifyDlocalCallbackSignature({
      xLogin,
      date: dateForSig,
      status: callbackStatus,
      paymentId,
      signature,
      secretKey,
    });
    if (!signatureOk) {
      console.warn('[dlocal-callback] signature_mismatch');
    }
  }

  let verifiedStatus = null;
  let fetchErr = null;
  if (paymentId) {
    try {
      const remote = await fetchDlocalPaymentById(paymentId);
      verifiedStatus = String(remote?.status || '').trim().toUpperCase() || null;
    } catch (e) {
      fetchErr = e;
      console.warn('[dlocal-callback] fetch_payment_failed', e?.message || e);
    }
  }

  console.info('[dlocal-callback] verifiedStatus=', verifiedStatus);

  let paymentParam = 'error';
  if (!paymentId) {
    paymentParam = 'error';
  } else if (fetchErr) {
    paymentParam = 'error';
  } else if (hasSignature && secretKey && !signatureOk) {
    paymentParam = 'failure';
  } else if (verifiedStatus) {
    paymentParam = mapVerifiedStatusToPaymentParam(verifiedStatus);
  } else {
    paymentParam = 'error';
  }

  const location = buildRedirectLocation(appOrigin, rd, paymentParam);
  console.info('[dlocal-callback] redirectingTo=', location);

  return redirect302(location);
}
