// send-email — envía correos vía Resend API.
// Requiere RESEND_API_KEY en secrets. No exponer la key al frontend.

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = 'Ventalink <hola@mail.ventalink.app>';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: { to?: unknown; subject?: unknown; html?: unknown };
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const html = typeof body?.html === 'string' ? body.html : '';

  if (!to) return jsonResponse({ error: 'to is required' }, 400);
  if (!subject) return jsonResponse({ error: 'subject is required' }, 400);
  if (!html) return jsonResponse({ error: 'html is required' }, 400);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey || !apiKey.trim()) {
    console.error('[send-email] RESEND_API_KEY not configured');
    return jsonResponse({ error: 'Email service not configured' }, 500);
  }

  const resendBody = {
    from: FROM_EMAIL,
    to: [to],
    subject,
    html,
  };

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendBody),
    });

    const resText = await res.text();
    let resData: Record<string, unknown> = {};
    try {
      resData = resText ? (JSON.parse(resText) as Record<string, unknown>) : {};
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      console.error('[send-email] Resend API error:', res.status, resText?.slice(0, 300));
      const message = (resData?.message as string) || (resData?.name as string) || 'Failed to send email';
      return jsonResponse({ error: message, details: resData }, res.status >= 400 && res.status < 500 ? res.status : 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[send-email] fetch error:', msg);
    return jsonResponse({ error: 'Failed to send email', details: msg }, 500);
  }
});
