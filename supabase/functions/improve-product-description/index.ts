// improve-product-description — mejora el texto de descripción de producto con IA.
// Requiere JWT. Usa OpenAI gpt-4o-mini para bajo costo.
// Reglas: máximo 80 palabras, tono comercial simple, español neutro.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `Eres un redactor comercial. Tu tarea es mejorar descripciones de productos para tiendas online.

Reglas estrictas:
- Máximo 80 palabras. Si el texto resultante supera 80 palabras, recórtalo sin cambiar el tono.
- Tono: comercial, simple, fácil de leer. Sin exageraciones ni frases grandilocuentes.
- Español neutro (evitar jerga muy local).
- Objetivo: que el cliente entienda el producto y quiera comprarlo, sin sensacionalismo.
- Responde ÚNICAMENTE con el texto mejorado, sin explicaciones ni prefijos.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'No autorizado' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  console.log('[improve-product-description] OPENAI_API_KEY configurada:', !!openaiKey);

  if (!openaiKey) {
    console.error('[improve-product-description] OPENAI_API_KEY no configurada');
    return jsonResponse({ error: 'Servicio no configurado' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.id) {
    return jsonResponse({ error: 'No autorizado' }, 401);
  }

  let body: { text?: string; productName?: string };
  try {
    body = (await req.json().catch(() => ({}))) as { text?: string; productName?: string };
  } catch {
    return jsonResponse({ error: 'Cuerpo inválido' }, 400);
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const productName = typeof body?.productName === 'string' ? body.productName.trim() : '';

  const userMessage = text
    ? `Mejora esta descripción de producto${productName ? ` (producto: ${productName})` : ''}:\n\n${text}`
    : productName
      ? `Redacta una descripción corta y atractiva para este producto: "${productName}". Máximo 80 palabras, tono comercial simple, español neutro. Responde solo con el texto.`
      : '';

  if (!userMessage) {
    return jsonResponse({ error: 'Envía "text" y/o "productName"' }, 400);
  }

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 200,
      temperature: 0.6,
    }),
  });

  const openaiBody = await openaiRes.text();
  if (!openaiRes.ok) {
    console.error('[improve-product-description] OpenAI error:', openaiRes.status, openaiRes.statusText, openaiBody.slice(0, 500));
    return jsonResponse({ error: 'Error al mejorar el texto. Intenta de nuevo.' }, 502);
  }

  let parsed: { choices?: Array<{ message?: { content?: string } }> };
  try {
    parsed = JSON.parse(openaiBody);
  } catch {
    return jsonResponse({ error: 'Respuesta inválida del servicio' }, 502);
  }

  const content = parsed?.choices?.[0]?.message?.content?.trim() ?? '';
  if (!content) {
    return jsonResponse({ error: 'No se obtuvo texto' }, 502);
  }

  return jsonResponse({ improved: content }, 200);
});
