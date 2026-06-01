// admin-users — Panel admin: listar, ver, crear, editar, suspender, habilitar, eliminar usuarios y asignar rol admin.
// Solo usuarios con app_metadata.role === 'admin' (o user_metadata.role). Usa Auth Admin API con service_role.
// debugVersion: "admin-users-search-v3-2026-06-02"

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
  return (user.app_metadata?.role as string) === 'admin' || (user.user_metadata?.role as string) === 'admin';
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'No autorizado' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceRoleKey) return jsonResponse({ error: 'Server configuration error' }, 500);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await userClient.auth.getUser();
  if (!isAdminUser(caller)) {
    return jsonResponse({ error: 'Forbidden: solo admins' }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // GET: listar usuarios (query params: page, per_page, search)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const perPage = Math.min(1000, Math.max(10, parseInt(url.searchParams.get('per_page') ?? '100', 10)));
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();

    // ── Búsqueda server-side por campos de negocio ────────────────────────
    if (search.length >= 2) {
      // Buscar negocios que coincidan con el término en name, email, slug, id
      let bizQuery = adminClient
        .from('wa_businesses')
        .select('id, user_id, name, slug, email, plan_slug, plan_expires_at, trial_expires_at, is_active')
        .or(`name.ilike.%${search}%,email.ilike.%${search}%,slug.ilike.%${search}%`)
        .limit(100);

      // Si parece un UUID, buscar también por business_id exacto
      if (isUuid(search)) {
        bizQuery = adminClient
          .from('wa_businesses')
          .select('id, user_id, name, slug, email, plan_slug, plan_expires_at, trial_expires_at, is_active')
          .or(`name.ilike.%${search}%,email.ilike.%${search}%,slug.ilike.%${search}%,id.eq.${search}`)
          .limit(100);
      }

      const { data: matchedBiz, error: bizError } = await bizQuery;
      if (bizError) {
        console.error('[admin-users] search businesses error:', bizError.message);
        return jsonResponse({ error: bizError.message }, 500);
      }

      // Agrupar negocios por user_id para la respuesta
      const bizByUserId: Record<string, unknown[]> = {};
      const userIdsFromBiz = new Set<string>();
      for (const b of (matchedBiz ?? [])) {
        if (!b.user_id) continue;
        userIdsFromBiz.add(b.user_id as string);
        if (!bizByUserId[b.user_id]) bizByUserId[b.user_id] = [];
        bizByUserId[b.user_id].push(b);
      }

      // Buscar también por user_id exacto si parece UUID
      if (isUuid(search)) {
        userIdsFromBiz.add(search);
      }

      // Obtener los usuarios auth para los user_ids encontrados
      const authUsers: unknown[] = [];
      for (const uid of userIdsFromBiz) {
        const { data: au } = await adminClient.auth.admin.getUserById(uid);
        if (au?.user) authUsers.push(au.user);
      }

      // También intentar búsqueda por email exacto en auth si contiene @
      if (search.includes('@')) {
        try {
          const { data: emailUser } = await (adminClient.auth.admin as unknown as {
            getUserByEmail: (email: string) => Promise<{ data: { user: unknown } | null }>
          }).getUserByEmail(search);
          if (emailUser?.user) {
            const eu = emailUser.user as { id: string };
            if (!userIdsFromBiz.has(eu.id)) authUsers.push(eu);
          }
        } catch (_) { /* getUserByEmail puede no estar disponible */ }
      }

      const list = (authUsers as Array<{
        id: string;
        email?: string;
        created_at?: string;
        banned_until?: string | null;
        app_metadata?: Record<string, unknown>;
        user_metadata?: Record<string, unknown>;
      }>).map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        banned_until: u.banned_until ?? null,
        role: (u.app_metadata?.role as string) ?? (u.user_metadata?.role as string) ?? null,
        businesses: (bizByUserId[u.id] ?? []).length > 0
          ? bizByUserId[u.id]
          // Si el usuario fue encontrado por UUID directo, traer sus negocios
          : await (async () => {
              const { data } = await adminClient
                .from('wa_businesses')
                .select('id, user_id, name, slug, email, plan_slug, plan_expires_at, trial_expires_at, is_active')
                .eq('user_id', u.id);
              return data ?? [];
            })(),
      }));

      console.log('[admin-users] search:', { search, bizMatches: (matchedBiz ?? []).length, userIds: [...userIdsFromBiz], authUsersFound: authUsers.length });
      return jsonResponse({ users: list, total: list.length, page: 1, per_page: list.length, search, debugVersion: 'admin-users-search-v3-2026-06-02' }, 200);
    }

    // ── Lista paginada sin búsqueda ───────────────────────────────────────
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({ page, per_page: perPage });
    if (listError) {
      console.error('[admin-users] listUsers error:', listError.message);
      return jsonResponse({ error: listError.message }, 500);
    }
    const users = listData?.users ?? [];
    const userIds = users.map((u) => u.id);

    let businessesByUser: Record<string, unknown[]> = {};
    if (userIds.length > 0) {
      const { data: businesses } = await adminClient
        .from('wa_businesses')
        .select('id, user_id, name, slug, email, plan_slug, plan_expires_at, trial_expires_at, is_active')
        .in('user_id', userIds);

      businessesByUser = (businesses ?? []).reduce<Record<string, unknown[]>>((acc, b) => {
        const uid = b.user_id as string;
        if (!acc[uid]) acc[uid] = [];
        acc[uid].push(b);
        return acc;
      }, {});
    }

    const list = users.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      banned_until: u.banned_until ?? null,
      role: (u.app_metadata?.role as string) ?? (u.user_metadata?.role as string) ?? null,
      businesses: businessesByUser[u.id] ?? [],
    }));

    console.log('[admin-users] GET list:', { page, perPage, total: list.length });
    return jsonResponse({
      users: list,
      total: list.length,
      page,
      per_page: perPage,
      debugVersion: 'admin-users-search-v3-2026-06-02',
    }, 200);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = (body?.action as string) ?? '';
  if (!action) return jsonResponse({ error: 'Falta "action"' }, 400);

  switch (action) {
    case 'get': {
      const userId = body?.userId as string;
      if (!userId) return jsonResponse({ error: 'Falta userId' }, 400);
      const { data: authUser, error: getErr } = await adminClient.auth.admin.getUserById(userId);
      if (getErr || !authUser?.user) {
        return jsonResponse({ error: getErr?.message ?? 'Usuario no encontrado' }, 404);
      }
      const u = authUser.user;
      const { data: bizRows } = await adminClient
        .from('wa_businesses')
        .select('*')
        .eq('user_id', userId);
      return jsonResponse({
        user: {
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          banned_until: u.banned_until ?? null,
          role: (u.app_metadata?.role as string) ?? (u.user_metadata?.role as string) ?? null,
          user_metadata: u.user_metadata ?? {},
        },
        businesses: bizRows ?? [],
      }, 200);
    }

    case 'ban':
    case 'unban': {
      const userId = body?.userId as string;
      if (!userId) return jsonResponse({ error: 'Falta userId' }, 400);
      const banned_until = action === 'ban' ? '9999-12-31T23:59:59Z' : null;
      const { data, error } = await adminClient.auth.admin.updateUserById(userId, { banned_until });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true, banned_until, user: data?.user ?? null }, 200);
    }

    case 'create': {
      const email = (body?.email as string)?.trim();
      const password = (body?.password as string) || undefined;
      const user_metadata = (body?.user_metadata as Record<string, unknown>) ?? {};
      if (!email) return jsonResponse({ error: 'Falta email' }, 400);
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: password || undefined,
        email_confirm: true,
        user_metadata: Object.keys(user_metadata).length ? user_metadata : undefined,
      });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true, user: data?.user ?? null }, 200);
    }

    case 'update': {
      const userId = body?.userId as string;
      if (!userId) return jsonResponse({ error: 'Falta userId' }, 400);
      const updates: { email?: string; user_metadata?: Record<string, unknown> } = {};
      if (typeof body?.email === 'string') updates.email = body.email.trim();
      if (body?.user_metadata && typeof body.user_metadata === 'object') updates.user_metadata = body.user_metadata as Record<string, unknown>;
      const { data, error } = await adminClient.auth.admin.updateUserById(userId, updates);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true, user: data?.user ?? null }, 200);
    }

    case 'delete': {
      const userId = body?.userId as string;
      if (!userId) return jsonResponse({ error: 'Falta userId' }, 400);
      if (userId === caller?.id) return jsonResponse({ error: 'No puedes eliminarte a ti mismo' }, 400);
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true }, 200);
    }

    case 'setRole': {
      const userId = body?.userId as string;
      const role = body?.role as string | null;
      if (!userId) return jsonResponse({ error: 'Falta userId' }, 400);
      const { data: existing } = await adminClient.auth.admin.getUserById(userId);
      const current = (existing?.user?.app_metadata as Record<string, unknown>) ?? {};
      const app_metadata = role === 'admin' ? { ...current, role: 'admin' } : (() => { const { role: _r, ...rest } = current; return rest; })();
      const { data, error } = await adminClient.auth.admin.updateUserById(userId, { app_metadata });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true, user: data?.user ?? null }, 200);
    }

    default:
      return jsonResponse({ error: 'action inválida' }, 400);
  }
});
