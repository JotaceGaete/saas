import crypto from 'node:crypto';

/**
 * Firma del callback dLocal (documentación "Configure callback URL"):
 * HMAC-SHA256(secretKey, X-Login + date + RequestBody)
 * RequestBody = {status:<status>,paymentId:<paymentId>}
 */
export function buildDlocalCallbackSignaturePayload({ status, paymentId }) {
  const st = String(status || '').trim();
  const pid = String(paymentId || '').trim();
  return `{status:${st},paymentId:${pid}}`;
}

export function computeDlocalCallbackSignature({ xLogin, date, status, paymentId, secretKey }) {
  const login = String(xLogin || '').trim();
  const dateStr = String(date || '').trim();
  const body = buildDlocalCallbackSignaturePayload({ status, paymentId });
  const message = `${login}${dateStr}${body}`;
  return crypto.createHmac('sha256', String(secretKey || '')).update(message, 'utf8').digest('hex');
}

function signaturesEqual(received, expected) {
  const a = String(received || '').trim().toLowerCase();
  const b = String(expected || '').trim().toLowerCase();
  if (a.length !== b.length) return false;
  if (a.length % 2 === 0) {
    try {
      return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch {
      /* fall through */
    }
  }
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export function verifyDlocalCallbackSignature({
  xLogin,
  date,
  status,
  paymentId,
  signature,
  secretKey,
}) {
  if (!secretKey || !signature) return false;
  const expected = computeDlocalCallbackSignature({ xLogin, date, status, paymentId, secretKey });
  return signaturesEqual(signature, expected);
}
