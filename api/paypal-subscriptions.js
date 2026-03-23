import {
  createPaypalSubscriptionController,
  getPaypalSubscriptionController,
} from './src/controllers/paypalSubscriptionController.js';

function toHeadersMap(headersObj = {}) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(headersObj)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }
  return headers;
}

async function toWebRequest(req) {
  const method = req.method || 'GET';
  const origin =
    req.headers['x-forwarded-proto'] && req.headers.host
      ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
      : `https://${req.headers.host}`;

  const url = new URL(req.url, origin);

  let bodyText = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    bodyText = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  return new Request(url.toString(), {
    method,
    headers: toHeadersMap(req.headers),
    body: bodyText,
  });
}

async function sendWebResponse(webResponse, res) {
  const status = webResponse?.status || 200;

  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const text = await webResponse.text();
  res.status(status).send(text);
}

export default async function handler(req, res) {
  try {
    const request = await toWebRequest(req);

    let response;
    if (req.method === 'POST') {
      response = await createPaypalSubscriptionController(request);
    } else if (req.method === 'GET') {
      response = await getPaypalSubscriptionController(request);
    } else {
      response = new Response(
        JSON.stringify({ ok: false, error: 'method_not_allowed' }),
        {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    await sendWebResponse(response, res);
  } catch (error) {
    console.error('[PAYPAL_SUBSCRIPTIONS_ROUTE_ERROR]', {
      message: error?.message || 'unknown_error',
    });

    res
      .status(503)
      .json({ ok: false, error: 'route_error', reason: error?.message || 'unknown_error' });
  }
}