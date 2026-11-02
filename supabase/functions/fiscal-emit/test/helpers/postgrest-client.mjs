// Cliente mínimo con la misma forma que supabase-js para lo que usa store-supabase:
//   rpc(fn, args)                      -> Promise<{ data, error }>   (POST /rpc/<fn>)
//   from(table).select(cols).eq(c, v).maybeSingle() -> Promise<{ data, error }>
// Solo para PRUEBAS. El emisor en producción usa supabase-js real (index.ts).
//
// Reglas que replica de supabase-js / PostgREST:
//  - Error de PostgREST: { data: null, error: { message, code, details, hint } }.
//  - maybeSingle sin filas: 406 con PGRST116 -> { data: null, error: null }.
//  - Respuesta vacía (204) -> data null.
//  - Fallo de red (fetch rechaza) -> la promesa se RECHAZA (no se convierte en error de PostgREST).
//
// Autenticación: el rol de la petición lo fija el JWT (HS256) que se pasa en `key`. Este módulo no
// firma nada; ver signServiceRoleJwt más abajo para generar el token de prueba.

import { createHmac } from 'node:crypto';

export function signJwt(payload, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function signRoleJwt(role, secret, { iss = 'walinka-contract', ttlSeconds = 3600, now = Date.now() } = {}) {
  const iat = Math.floor(now / 1000);
  return signJwt({ role, iss, iat, exp: iat + ttlSeconds }, secret);
}

export function createPostgrestClient({ url, key, fetchImpl = globalThis.fetch }) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error('postgrest url required');
  if (typeof key !== 'string' || key.length < 20) throw new Error('postgrest key required');
  const base = url.replace(/\/+$/, '');
  const headers = (extra = {}) => ({
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    ...extra,
  });

  async function parse(res) {
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  async function rpc(fn, args = {}) {
    const res = await fetchImpl(`${base}/rpc/${encodeURIComponent(fn)}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(args),
    });
    const body = await parse(res);
    if (!res.ok) return { data: null, error: body ?? { message: `HTTP ${res.status}`, code: String(res.status) } };
    return { data: body, error: null };
  }

  function from(table) {
    const q = { table, columns: '*', filters: [] };
    const builder = {
      select(columns = '*') { q.columns = columns; return builder; },
      eq(column, value) { q.filters.push([column, value]); return builder; },
      async maybeSingle() {
        const qs = new URLSearchParams({ select: q.columns, limit: '1' });
        for (const [c, v] of q.filters) qs.append(c, `eq.${v}`);
        const res = await fetchImpl(`${base}/${encodeURIComponent(q.table)}?${qs}`, {
          method: 'GET',
          headers: headers({ Accept: 'application/vnd.pgrst.object+json' }),
        });
        const body = await parse(res);
        if (res.status === 406 && body?.code === 'PGRST116') return { data: null, error: null };
        if (!res.ok) return { data: null, error: body ?? { message: `HTTP ${res.status}`, code: String(res.status) } };
        return { data: body, error: null };
      },
    };
    return builder;
  }

  return Object.freeze({ rpc, from });
}
