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
    'https://go.ventalink.app',
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

const SYSTEM_PROMPT = `Eres un optimizador de publicaciones para ventas online. Recibes un texto básico del usuario y devuelves datos estructurados para publicar el producto.

Reglas obligatorias:
- Corrige faltas de ortografía.
- Mejora la redacción y haz el texto más vendedor.
- NO inventes características que no estén en el texto original.
- NO agregues precios si no aparecen en el texto.
- Usa español claro y natural.
- Descripción: máximo 80 palabras. Título: corto y atractivo.
- Mantén siempre la información original; solo mejora la forma.

Campos del JSON de salida:
- "title": título optimizado del producto, corto y atractivo.
- "description": descripción mejorada, máximo 80 palabras, tono comercial simple.
- "benefits": array de 2 a 4 frases cortas que destacan beneficios reales del producto (sin inventar).
- "call_to_action": frase corta de llamada a la acción (ej: "¡Pedí el tuyo hoy!", "Disponible para entrega inmediata.").
- "hashtags": array de 5 a 8 hashtags sin el símbolo #, solo texto limpio, relevantes al producto, útiles para Instagram, en el mismo idioma del usuario, sin repetir palabras innecesarias, sin inventar marcas.

Responde ÚNICAMENTE con un JSON válido, sin texto antes ni después, sin bloques de código, con esta estructura exacta:
{"title":"","description":"","benefits":[],"call_to_action":"","hashtags":[]}`;

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
    const keyPresent = !!openaiKey;
    const keyHint = keyPresent ? openaiKey.slice(0, 7) + '...' : '(vacía)';
    console.log('[improve-product-description] OPENAI_API_KEY presente:', keyPresent, '| prefijo:', keyHint);

    if (!openaiKey) {
      console.error('[improve-product-description] OPENAI_API_KEY no está configurada en los secrets de la función');
      return logAndReturn(jsonResponse({ error: 'Servicio no configurado: falta OPENAI_API_KEY' }, 500, corsHeaders), 'missing_openai_key');
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    console.log('[improve-product-description] auth user_id:', user?.id ?? null, '| auth error:', authError?.message ?? null);
    if (!user?.id) {
      return logAndReturn(jsonResponse({ error: 'No autorizado' }, 401, corsHeaders), 'auth_invalid');
    }

    let body: { text?: string; productName?: string };
    try {
      body = (await req.json().catch(() => ({}))) as { text?: string; productName?: string };
    } catch {
      return logAndReturn(jsonResponse({ error: 'Cuerpo inválido' }, 400, corsHeaders), 'invalid_body');
    }
    console.log('[improve-product-description] body recibido: text.length=', (body?.text ?? '').length, '| productName=', body?.productName ?? '');

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

    console.log('[improve-product-description] llamando a OpenAI | userMessage.length=', userMessage.length);
    let openaiRes: Response;
    try {
      openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
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
    } catch (fetchErr) {
      console.error('[improve-product-description] fetch a OpenAI falló (red/timeout):', fetchErr);
      return logAndReturn(jsonResponse({ error: 'No se pudo conectar con el servicio de IA. Intenta de nuevo.' }, 500, corsHeaders), 'openai_fetch_error');
    }

    const openaiBody = await openaiRes.text();
    console.log('[improve-product-description] OpenAI status:', openaiRes.status, '| body (primeros 300):', openaiBody.slice(0, 300));

    if (!openaiRes.ok) {
      console.error('[improve-product-description] OpenAI respondió error:', openaiRes.status, openaiRes.statusText, openaiBody.slice(0, 500));
      // 401 = API key inválida, 429 = cuota/rate limit, otros = error OpenAI
      const hint = openaiRes.status === 401
        ? 'API key inválida o sin permisos'
        : openaiRes.status === 429
          ? 'Cuota de OpenAI agotada o rate limit'
          : 'Error en el servicio de IA';
      return logAndReturn(jsonResponse({ error: `${hint}. Intenta de nuevo.` }, 500, corsHeaders), 'openai_error');
    }

    let parsed: { choices?: Array<{ message?: { content?: string } }> };
    try {
      parsed = JSON.parse(openaiBody);
    } catch {
      console.error('[improve-product-description] JSON de OpenAI no parseable:', openaiBody.slice(0, 200));
      return logAndReturn(jsonResponse({ error: 'Respuesta inválida del servicio de IA' }, 500, corsHeaders), 'invalid_openai_response');
    }

    let content = parsed?.choices?.[0]?.message?.content?.trim() ?? '';
    console.log('[improve-product-description] content de IA (primeros 200):', content.slice(0, 200));
    if (!content) {
      return logAndReturn(jsonResponse({ error: 'La IA no devolvió contenido' }, 500, corsHeaders), 'empty_openai_content');
    }

    // Quitar posible bloque de código markdown
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) content = codeBlockMatch[1].trim();

    let result: {
      title?: string;
      description?: string;
      benefits?: unknown;
      call_to_action?: string;
      hashtags?: unknown;
    };
    try {
      result = JSON.parse(content);
    } catch {
      console.error('[improve-product-description] JSON de IA no parseable:', content.slice(0, 200));
      return logAndReturn(jsonResponse({ error: 'La IA no devolvió el formato esperado. Intenta de nuevo.' }, 500, corsHeaders), 'invalid_ai_json');
    }

    const title = typeof result?.title === 'string' ? result.title.trim() : '';
    const description = typeof result?.description === 'string' ? result.description.trim() : '';

    const benefits = Array.isArray(result?.benefits)
      ? (result.benefits as unknown[]).filter((b): b is string => typeof b === 'string' && b.trim().length > 0).map((b) => b.trim())
      : [];

    const call_to_action = typeof result?.call_to_action === 'string' ? result.call_to_action.trim() : '';

    const hashtags = Array.isArray(result?.hashtags)
      ? (result.hashtags as unknown[])
          .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
          .map((h) => h.trim().replace(/^#/, ''))
          .slice(0, 8)
      : [];

    console.log('[improve-product-description] resultado final | title=', title, '| description.length=', description.length, '| benefits=', benefits.length, '| hashtags=', hashtags.length);

    if (!description) {
      return logAndReturn(jsonResponse({ error: 'No se obtuvo descripción de la IA' }, 500, corsHeaders), 'missing_description');
    }

    return logAndReturn(jsonResponse({
      title: title || undefined,
      description,
      benefits,
      call_to_action: call_to_action || undefined,
      hashtags,
    }, 200, corsHeaders), 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('[improve-product-description] unhandled_error:', error);
    return logAndReturn(jsonResponse({ error: message }, 500, corsHeaders), 'unhandled_error');
  }
});
