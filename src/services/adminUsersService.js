/**
 * Servicio admin: gestión de usuarios (listar, ver, crear, editar, suspender, eliminar, rol admin).
 * Solo para usuarios con role admin. Llama a la Edge Function admin-users.
 */
import { supabase } from '../lib/supabase';

const FUNCTIONS_BASE = `${(import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/admin-users`;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
  if (!token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
  };
}

/** Listar usuarios (paginado). */
export async function listAdminUsers(opts = {}) {
  const headers = await getAuthHeaders();
  if (!headers) return { data: null, error: { message: 'No autenticado' } };
  const page = opts.page ?? 1;
  const perPage = opts.per_page ?? 50;
  const url = `${FUNCTIONS_BASE}?page=${page}&per_page=${perPage}`;
  const res = await fetch(url, { method: 'GET', headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: { message: data?.error ?? 'Error al listar usuarios' } };
  return { data: { users: data.users ?? [], total: data.total, page: data.page, per_page: data.per_page }, error: null };
}

/** Obtener detalle de un usuario y sus negocios. */
export async function getAdminUser(userId) {
  const headers = await getAuthHeaders();
  if (!headers) return { data: null, error: { message: 'No autenticado' } };
  const res = await fetch(FUNCTIONS_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'get', userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: { message: data?.error ?? 'Error al obtener usuario' } };
  return { data: { user: data.user, businesses: data.businesses ?? [] }, error: null };
}

/** Suspender usuario (no puede iniciar sesión). */
export async function banAdminUser(userId) {
  const headers = await getAuthHeaders();
  if (!headers) return { data: null, error: { message: 'No autenticado' } };
  const res = await fetch(FUNCTIONS_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'ban', userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: { message: data?.error ?? 'Error al suspender' } };
  return { data: data?.user ?? null, error: null };
}

/** Habilitar usuario suspendido. */
export async function unbanAdminUser(userId) {
  const headers = await getAuthHeaders();
  if (!headers) return { data: null, error: { message: 'No autenticado' } };
  const res = await fetch(FUNCTIONS_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'unban', userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: { message: data?.error ?? 'Error al habilitar' } };
  return { data: data?.user ?? null, error: null };
}

/** Crear usuario. */
export async function createAdminUser({ email, password = null, user_metadata = {} }) {
  const headers = await getAuthHeaders();
  if (!headers) return { data: null, error: { message: 'No autenticado' } };
  const res = await fetch(FUNCTIONS_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'create', email, password: password || undefined, user_metadata }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: { message: data?.error ?? 'Error al crear usuario' } };
  return { data: data?.user ?? null, error: null };
}

/** Actualizar usuario (email y/o user_metadata). */
export async function updateAdminUser(userId, { email, user_metadata }) {
  const headers = await getAuthHeaders();
  if (!headers) return { data: null, error: { message: 'No autenticado' } };
  const body = { action: 'update', userId };
  if (email !== undefined) body.email = email;
  if (user_metadata !== undefined) body.user_metadata = user_metadata;
  const res = await fetch(FUNCTIONS_BASE, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: { message: data?.error ?? 'Error al actualizar' } };
  return { data: data?.user ?? null, error: null };
}

/** Eliminar usuario (irreversible). */
export async function deleteAdminUser(userId) {
  const headers = await getAuthHeaders();
  if (!headers) return { data: null, error: { message: 'No autenticado' } };
  const res = await fetch(FUNCTIONS_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'delete', userId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: { message: data?.error ?? 'Error al eliminar' } };
  return { data: true, error: null };
}

/** Asignar o quitar rol admin. */
export async function setAdminUserRole(userId, isAdmin) {
  const headers = await getAuthHeaders();
  if (!headers) return { data: null, error: { message: 'No autenticado' } };
  const res = await fetch(FUNCTIONS_BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'setRole', userId, role: isAdmin ? 'admin' : null }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { data: null, error: { message: data?.error ?? 'Error al cambiar rol' } };
  return { data: data?.user ?? null, error: null };
}
