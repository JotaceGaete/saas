/**
 * customDomainService — cliente para la Edge Function manage-custom-domain.
 * Todas las operaciones requieren JWT de usuario autenticado.
 */
import { supabase } from '../lib/supabase';

const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const ANON_KEY     = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/manage-custom-domain`;

async function getToken() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = session?.access_token?.trim();
    if (token?.includes('.')) return token;
    // Token ausente o inválido: intentar refrescar
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) throw refreshErr;
    return refreshed?.session?.access_token?.trim() ?? null;
  } catch {
    return null;
  }
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  };
}

/** Obtiene el dominio registrado del negocio y su estado actual (consulta Vercel). */
export async function getBusinessDomain() {
  const token = await getToken();
  if (!token) return { data: null, error: new Error('No autenticado') };
  try {
    const res = await fetch(FUNCTION_URL, { method: 'GET', headers: authHeaders(token) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: new Error(body?.error ?? `HTTP ${res.status}`) };
    return { data: body, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/** Registra o actualiza el dominio propio del negocio. */
export async function saveBusinessDomain(domain) {
  const token = await getToken();
  if (!token) return { data: null, error: new Error('No autenticado') };
  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ domain }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: new Error(body?.error ?? `HTTP ${res.status}`) };
    return { data: body, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/** Elimina el dominio propio del negocio. */
export async function deleteBusinessDomain() {
  const token = await getToken();
  if (!token) return { error: new Error('No autenticado') };
  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: new Error(body?.error ?? `HTTP ${res.status}`) };
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

/** Fuerza una re-verificación del estado del dominio en Vercel. */
export const verifyBusinessDomain = getBusinessDomain;

/**
 * Devuelve los registros DNS necesarios para un dominio.
 *
 * Lógica:
 *  - Empieza con "www." → CNAME (subdominio www)
 *  - Solo 2 segmentos (ej: mitienda.cl) → apex → A record + AAAA
 *  - 3+ segmentos sin www (ej: shop.mitienda.cl) → CNAME con el primer segmento
 */
export function getDnsInstructions(domain) {
  if (!domain) return [];
  const parts = domain.split('.');

  if (domain.startsWith('www.')) {
    return [
      { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com.', description: 'Apunta www a Vercel' },
    ];
  }

  if (parts.length === 2) {
    // Dominio raíz (apex): requiere A record (CNAME no está permitido en apex)
    return [
      { type: 'A',    name: '@', value: '76.76.21.21',              description: 'Registro A para dominio raíz (IPv4)' },
      { type: 'AAAA', name: '@', value: '2606:4700:4700::1111',     description: 'Registro AAAA para dominio raíz (IPv6, opcional)' },
    ];
  }

  // Subdominio distinto de www (ej: shop.mitienda.cl)
  const sub = parts[0];
  return [
    { type: 'CNAME', name: sub, value: 'cname.vercel-dns.com.', description: `Apunta el subdominio "${sub}" a Vercel` },
  ];
}
