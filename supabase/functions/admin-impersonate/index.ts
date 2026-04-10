// admin-impersonate — Genera un magic link para entrar a la cuenta de un usuario sin enviar email.
// Solo para admins autenticados (app_metadata.role === 'admin' o user_metadata.role === 'admin').
// Usa SUPABASE_SERVICE_ROLE_KEY exclusivamente en el servidor. Nunca se expone al cliente.

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

function isAdminUser(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null): boolean {
  if (!user) return false;
  return (
    (user.app_metadata?.role as string) === 'admin' ||
    (user.user_metadata?.role as string) === 'admin'
  );
}

// ── Allowed redirect origins ─────────────────────────────────────────────────
// All origins that the app is legitimately served from.
// VITE_APP_URL is set to the canonical production origin (e.g. https://go.ventalink.app).
// Localhost variants are allowed for development only.
const ALLOWED_ORIGINS = new Set([
  Deno.env.get('APP_ORIGIN') ?? '',           // e.g. https://go.ventalink.app
  Deno.env.get('VITE_APP_URL') ?? '',         // same value, different env name
  'http://localhost:4028',
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean));

function isAllowedRedirectOrigin(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return ALLOWED_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  // ── 1. Extract & validate admin token ────────────────────────────────────
  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'No autorizado' }, 401);
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!serviceRoleKey) {
    console.error('[admin-impersonate] FATAL: Missing SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  // Verify calling user with their own token (never the service role key)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();

  if (!caller) {
    return jsonResponse({ error: 'No autorizado: sesión inválida' }, 401);
  }
  if (!isAdminUser(caller)) {
    console.warn('[admin-impersonate] Forbidden attempt by non-admin:', caller.id);
    return jsonResponse({ error: 'Forbidden: solo admins pueden usar esta función' }, 403);
  }

  // ── 2. Parse request body ────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Body JSON inválido' }, 400);
  }

  const targetUserId = (body?.userId as string)?.trim();
  if (!targetUserId) {
    return jsonResponse({ error: 'Falta userId' }, 400);
  }
  if (targetUserId === caller.id) {
    return jsonResponse({ error: 'No puedes impersonarte a ti mismo' }, 400);
  }

  // ── 3. Fetch target user (service role) ──────────────────────────────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: targetUserData, error: getUserErr } = await adminClient.auth.admin.getUserById(targetUserId);
  if (getUserErr || !targetUserData?.user) {
    console.error('[admin-impersonate] getUserById error:', getUserErr?.message, '| targetUserId:', targetUserId);
    return jsonResponse({ error: getUserErr?.message ?? 'Usuario no encontrado' }, 404);
  }

  const targetUser  = targetUserData.user;
  const targetEmail = targetUser.email;

  if (!targetEmail) {
    return jsonResponse({ error: 'El usuario objetivo no tiene email' }, 400);
  }

  // ── 4. Block admin-on-admin impersonation ────────────────────────────────
  if (isAdminUser(targetUser)) {
    console.warn('[admin-impersonate] Blocked admin-on-admin:', caller.id, '→', targetUserId);
    return jsonResponse({ error: 'No se puede impersonar a otro administrador' }, 403);
  }

  // ── 5. Validate redirectTo — strict origin allowlist ────────────────────
  const rawRedirectTo = (body?.redirectTo as string)?.trim();

  // Compute a safe default if not provided
  const defaultOrigin = [...ALLOWED_ORIGINS].find((o) => o.startsWith('https://')) ??
    [...ALLOWED_ORIGINS][0] ?? 'http://localhost:4028';
  const safeDefault = `${defaultOrigin}/dashboard`;

  const finalRedirectTo = rawRedirectTo || safeDefault;

  if (!isAllowedRedirectOrigin(finalRedirectTo)) {
    console.warn(
      '[admin-impersonate] Rejected redirectTo origin:',
      (() => { try { return new URL(finalRedirectTo).origin; } catch { return finalRedirectTo; } })(),
      '| allowedOrigins:', [...ALLOWED_ORIGINS],
    );
    return jsonResponse({
      error: 'redirectTo apunta a un dominio no autorizado',
    }, 400);
  }

  // ── 6. Generate magic link (no email sent) ───────────────────────────────
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
    options: { redirectTo: finalRedirectTo },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    console.error('[admin-impersonate] generateLink error:', linkErr?.message, '| target:', targetUserId);
    return jsonResponse({ error: linkErr?.message ?? 'No se pudo generar el magic link' }, 500);
  }

  const loginUrl = linkData.properties.action_link;

  // ── 7. Audit log (non-fatal, structured error on failure) ─────────────────
  const { error: auditErr } = await adminClient
    .from('wa_admin_audit_log')
    .insert({
      admin_user_id: caller.id,
      action:        'impersonate_user',
      entity_type:   'user',
      entity_id:     targetUserId,
      payload: {
        target_email:  targetEmail,
        admin_email:   caller.email,
        redirect_to:   finalRedirectTo,
        generated_at:  new Date().toISOString(),
      },
    });

  if (auditErr) {
    console.error('[admin-impersonate] AUDIT FAILED — action will proceed but was not logged.', {
      admin_user_id: caller.id,
      target_user_id: targetUserId,
      action: 'impersonate_user',
      audit_error: auditErr.message,
      audit_code: auditErr.code,
    });
  }

  // ── 8. Return login URL ───────────────────────────────────────────────────
  // Single-use, ~1h TTL. Must only be opened by the admin, never forwarded.
  return jsonResponse({
    loginUrl,
    targetEmail,
    targetUserId,
  }, 200);
});
