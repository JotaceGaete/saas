/**
 * customDomainService — cliente para la Edge Function manage-custom-domain.
 * Todas las operaciones requieren JWT de usuario autenticado.
 */
import { supabase } from '../lib/supabase';

const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const ANON_KEY     = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/manage-custom-domain`;

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token?.trim();
  if (token?.includes('.')) return token;
  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed?.session?.access_token?.trim() ?? null;
}

function headers(token) {
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
    const res = await fetch(FUNCTION_URL, { headers: headers(token) });
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
      headers: headers(token),
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
      headers: headers(token),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: new Error(body?.error ?? `HTTP ${res.status}`) };
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

/** Verifica el estado actual del dominio en Vercel (alias de getBusinessDomain con recarga forzada). */
export const verifyBusinessDomain = getBusinessDomain;

/**
 * Devuelve las instrucciones DNS para un dominio dado.
 * www.subdominio → CNAME
 * dominio raíz  → A record
 */
export function getDnsInstructions(domain) {
  if (!domain) return [];
  const isApex = domain.split('.').length === 2; // ej: mitienda.cl (sin www)
  if (isApex) {
    return [
      { type: 'A', name: '@', value: '76.76.21.21', description: 'Registro A para dominio raíz' },
      { type: 'AAAA', name: '@', value: '2606:4700:4700::1111', description: 'Registro AAAA (IPv6, opcional)' },
    ];
  }
  const prefix = domain.split('.')[0]; // www, tienda, shop, etc.
  return [
    { type: 'CNAME', name: prefix, value: 'cname.vercel-dns.com.', description: 'Registro CNAME para subdominio' },
  ];
}
