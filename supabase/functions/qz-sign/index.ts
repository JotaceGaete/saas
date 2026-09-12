// qz-sign — firma solicitudes de QZ Tray para eliminar el aviso "Unsigned
// request / Untrusted website" (PRINT-3A). Responsabilidad ÚNICA: validar
// la solicitud (origen + JWT del negocio), recibir el string exacto que
// QZ Tray pide firmar, firmarlo con la clave privada (secreto de esta
// función, nunca en el repo/frontend) y devolver solo la firma esperada.
//
// No conoce ventas, ESC/POS, ni impresoras -- eso vive en
// src/lib/printing/* del frontend, completamente separado de esto.
// No usa la service_role key: solo necesita saber QUIÉN llama (un usuario
// autenticado de Walinka), no leer/escribir ninguna tabla.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabasePublishableKeyOrEmpty } from '../_shared/supabasePublishableKey.ts';
import { isAllowedOrigin, buildCorsHeaders, extractSignPayload, signWithPrivateKey, QzSignError } from './lib.ts';

function jsonResponse(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  // Defensa adicional a CORS: CORS solo protege llamadas hechas desde un
  // navegador (un curl directo lo ignora por completo), así que esto
  // evita que qz-sign funcione como endpoint de firma abierto para
  // cualquier origen no reconocido de Walinka.
  if (!isAllowedOrigin(origin)) {
    console.warn('[qz-sign] origen no permitido:', origin);
    return jsonResponse({ error: 'Origen no permitido' }, 403, corsHeaders);
  }

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = getSupabasePublishableKeyOrEmpty();
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (!user?.id) {
    console.warn('[qz-sign] JWT inválido:', authError?.message ?? '(sin detalle)');
    return jsonResponse({ error: 'No autorizado' }, 401, corsHeaders);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo inválido' }, 400, corsHeaders);
  }

  const toSign = extractSignPayload(body);
  if (!toSign) {
    return jsonResponse({ error: 'Falta "request" (el string exacto que QZ Tray pide firmar)' }, 400, corsHeaders);
  }

  const privateKeyPem = Deno.env.get('QZ_SIGN_PRIVATE_KEY') ?? '';
  if (!privateKeyPem) {
    // Nunca se loguea el valor -- solo que falta. Esto es un error de
    // configuración del servidor, no algo que el frontend pueda arreglar.
    console.error('[qz-sign] QZ_SIGN_PRIVATE_KEY no está configurada');
    return jsonResponse({ error: 'Servicio de firma no configurado' }, 500, corsHeaders);
  }

  try {
    const signature = await signWithPrivateKey(privateKeyPem, toSign);
    return jsonResponse({ signature }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof QzSignError) {
      console.error('[qz-sign] error de configuración:', err.code, err.message);
      return jsonResponse({ error: 'Servicio de firma mal configurado' }, 500, corsHeaders);
    }
    console.error('[qz-sign] error inesperado al firmar:', err);
    return jsonResponse({ error: 'No se pudo firmar la solicitud' }, 500, corsHeaders);
  }
});
