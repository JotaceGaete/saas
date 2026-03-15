// improve-product-description — optimizador de publicaciones para ventas (título + descripción).
// Requiere JWT. Usa OpenAI gpt-4o-mini para bajo costo.
// Entrada máx. 300 caracteres. Salida JSON: { title, description }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_INPUT_LENGTH = 300;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  const allowed = [
    'https://cl.ventalink.app',
    'https://ar.ventalink.app',
    'http://localhost:4028',
  ];

  if (allowed.includes(origin)) return true;

  try {
    const url = new URL(origin);
    return url.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = isAllowedOrigin(origin) ? origin : 'https://ar.ventalink.app';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function logAndReturn(response: Response, label: string) {
  console.log('[improve-product-description] response', label, 'status=', response.status);
  return response;
}

const SYSTEM_PROMPT = `Eres un optimizador de publicaciones para ventas online. Recibes un texto básico del usuario y devuelves un título y una descripción mejorados.

Reglas obligatorias:
- Corrige faltas de ortografía.
- Mejora la redacción y haz el texto más vendedor.
- NO inventes características que no estén en el texto original.
- NO agregues precios si no aparecen en el texto.
- Usa español claro y natural.
- Descripción: máximo 80 palabras. Título: corto y atractivo.
- Mantén siempre la información original; solo mejora la forma.

Responde ÚNICAMENTE con un JSON válido, sin texto antes ni después, con esta estructura exacta:
{"title": "Título optimizado del producto", "description": "Descripción mejorada para vender el producto"}`;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const corsHeaders = buildCorsHeaders(origin);
  console.log('[improve-product-description] method=', req.method, 'origin=', origin || '(none)');

  if (req.method === 'OPTIONS') {
    console.log('[improve-product-description] handling preflight');
    return logAndReturn(new Response('ok', {
      status: 200,
      headers: corsHeaders,
    }), 'preflight');
  }

  try {
    const authHeader = (req.headers.get('authorization') ?? '').trim();
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return logAndReturn(jsonResponse({ error: 'No autorizado' }, 401, corsHeaders), 'auth_missing');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';
    console.log('[improve-product-description] OPENAI_API_KEY configurada:', !!openaiKey);

    if (!openaiKey) {
      console.error('[improve-product-description] OPENAI_API_KEY no configurada');
      return logAndReturn(jsonResponse({ error: 'Servicio no configurado' }, 500, corsHeaders), 'missing_openai_key');
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.id) {
      return logAndReturn(jsonResponse({ error: 'No autorizado' }, 401, corsHeaders), 'auth_invalid');
    }

    let body: { text?: string; productName?: string };
    try {
      body = (await req.json().catch(() => ({}))) as { text?: string; productName?: string };
    } catch {
      return logAndReturn(jsonResponse({ error: 'Cuerpo inválido' }, 400, corsHeaders), 'invalid_body');
    }

    const rawText = typeof body?.text === 'string' ? body.text.trim() : '';
    const text = rawText.length > MAX_INPUT_LENGTH ? rawText.slice(0, MAX_INPUT_LENGTH) : rawText;
    const productName = typeof body?.productName === 'string' ? body.productName.trim() : '';

    const userMessage = text
      ? `Optimiza esta publicación para vender${productName ? ` (nombre de producto: ${productName})` : ''}. Devuelve solo el JSON con "title" y "description".\n\nTexto del usuario:\n${text}`
      : productName
        ? `Genera un título y una descripción de producto para vender: "${productName}". Devuelve solo el JSON con "title" y "description".`
        : '';

    if (!userMessage) {
      return logAndReturn(jsonResponse({ error: 'Envía "text" y/o "productName"' }, 400, corsHeaders), 'missing_input');
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
        max_tokens: 350,
        temperature: 0.5,
      }),
    });

    const openaiBody = await openaiRes.text();
    if (!openaiRes.ok) {
      console.error('[improve-product-description] OpenAI error:', openaiRes.status, openaiRes.statusText, openaiBody.slice(0, 500));
      return logAndReturn(jsonResponse({ error: 'Error al mejorar el texto. Intenta de nuevo.' }, 502, corsHeaders), 'openai_error');
    }

    let parsed: { choices?: Array<{ message?: { content?: string } }> };
    try {
      parsed = JSON.parse(openaiBody);
    } catch {
      return logAndReturn(jsonResponse({ error: 'Respuesta inválida del servicio' }, 502, corsHeaders), 'invalid_openai_response');
    }

    let content = parsed?.choices?.[0]?.message?.content?.trim() ?? '';
    if (!content) {
      return logAndReturn(jsonResponse({ error: 'No se obtuvo respuesta' }, 502, corsHeaders), 'empty_openai_content');
    }

    // Quitar posible bloque de código markdown
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) content = codeBlockMatch[1].trim();

    let result: { title?: string; description?: string };
    try {
      result = JSON.parse(content) as { title?: string; description?: string };
    } catch {
      console.error('[improve-product-description] JSON inválido:', content.slice(0, 200));
      return logAndReturn(jsonResponse({ error: 'La IA no devolvió un formato válido. Intenta de nuevo.' }, 502, corsHeaders), 'invalid_ai_json');
    }

    const title = typeof result?.title === 'string' ? result.title.trim() : '';
    const description = typeof result?.description === 'string' ? result.description.trim() : '';
    if (!description) {
      return logAndReturn(jsonResponse({ error: 'No se obtuvo descripción' }, 502, corsHeaders), 'missing_description');
    }

    return logAndReturn(jsonResponse({ title: title || undefined, description }, 200, corsHeaders), 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('[improve-product-description] unhandled_error:', error);
    return logAndReturn(jsonResponse({ error: message }, 500, corsHeaders), 'unhandled_error');
  }
});
