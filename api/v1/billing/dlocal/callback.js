/**
 * POST /api/v1/billing/dlocal/callback
 * Tras el checkout dLocal: verifica el pago y redirige al SPA en /planes.
 */

function getAbsoluteOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  return 'https://go.ventalink.app';
}

function readBodySync(req) {
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      try {
        const o = {};
        new URLSearchParams(req.body).forEach((v, k) => {
          o[k] = v;
        });
        return o;
      } catch {
        return {};
      }
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8'));
    } catch {
      return {};
    }
  }
  return null;
}

function parseBodyFromStream(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      const ct = req.headers['content-type'] || '';
      try {
        if (ct.includes('application/json')) {
          resolve(JSON.parse(raw));
        } else {
          const o = {};
          new URLSearchParams(raw).forEach((v, k) => {
            o[k] = v;
          });
          resolve(o);
        }
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const origin = getAbsoluteOrigin(req);

  try {
    let body = readBodySync(req);
    if (body == null) {
      body = await parseBodyFromStream(req);
    }

    console.log('[dlocal-callback] incoming:', body);

    const paymentId = body?.paymentId || body?.id;

    if (!paymentId) {
      console.warn('[dlocal-callback] missing paymentId');
      return res.redirect(302, `${origin}/planes?payment=error`);
    }

    const baseUrl = String(process.env.DLOCAL_BASE_URL || '').trim().replace(/\/$/, '');
    const apiKey = String(process.env.DLOCAL_API_KEY || '').trim();
    const secretKey = String(process.env.DLOCAL_SECRET_KEY || '').trim();
    if (!baseUrl || !apiKey || !secretKey) {
      console.error('[dlocal-callback] missing DLOCAL env');
      return res.redirect(302, `${origin}/planes?payment=error`);
    }

    const verifyRes = await fetch(`${baseUrl}/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}:${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const payment = await verifyRes.json().catch(() => ({}));

    console.log('[dlocal-callback] verified:', payment);

    let redirectTo = `${origin}/planes?payment=pending`;
    const status = String(payment?.status || '').toUpperCase();

    if (status === 'PAID' || status === 'APPROVED') {
      redirectTo = `${origin}/planes?payment=success`;
    } else if (status === 'REJECTED' || status === 'CANCELLED' || status === 'CANCELED') {
      redirectTo = `${origin}/planes?payment=failed`;
    }

    console.log('[dlocal-callback] redirect:', redirectTo);

    return res.redirect(302, redirectTo);
  } catch (error) {
    console.error('[dlocal-callback] error:', error);
    return res.redirect(302, `${origin}/planes?payment=error`);
  }
}
