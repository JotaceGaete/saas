# Depuración y corrección en producción

## PART A — Auth: "Invalid Refresh Token: Refresh Token Not Found"

### Qué se comprobó en código

1. **Inicialización de sesión**: Un solo cliente Supabase en `src/lib/supabase.js`. Toda la app usa ese mismo cliente.
2. **Varios clientes**: No hay varios clientes en el front; solo las Edge Functions crean sus propios clientes (server-side).
3. **URL/anon key**: Vienen de `import.meta.env.VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (build-time). Si en Vercel (o tu host) esas variables son distintas al proyecto donde los usuarios hacen login, el refresh falla con "Refresh Token Not Found" porque el token pertenece a otro proyecto.
4. **Persistencia**: `persistSession: true` y `autoRefreshToken: true`, sin `storage` custom. La clave de localStorage depende de la URL de Supabase. Misma URL en build = misma clave.
5. **Causa del refresh inválido**: Sesión antigua en storage (por ejemplo de otro proyecto o token ya revocado) o URL/anon key distinta entre el build que guardó la sesión y el actual.

### Cambios realizados

- **Archivo**: `src/contexts/AuthContext.jsx`
  - Tras `getSession()`, si hay sesión se valida con `getUser()`. Si `getUser()` devuelve error cuyo mensaje contiene "Refresh Token" / "refresh_token" / "JWT", se considera sesión inválida: se llama a `signOut({ scope: 'local' })` y se actualiza el estado a "no sesión", así el usuario no entra al dashboard con sesión rota.
- **Archivo**: `src/lib/supabase.js`
  - URL sin barra final. `detectSessionInUrl: false` para evitar conflictos con sesión en URL.

### Logs temporales de auth

En la consola del navegador (F12) ejecuta:

```js
window.__AUTH_DEBUG__ = true
```

Luego recarga. Verás:

- `[Auth] getSession result` — sesión inicial (y si tiene refresh_token).
- `[Auth] onAuthStateChange` — evento y sesión en cada cambio.
- `[Auth] signIn result` — tras login: si hay sesión y refresh_token.
- `[Auth] signOut done` — tras cerrar sesión.
- Si la sesión se considera inválida: `[Auth] invalid/expired session, clearing`.

### Causa raíz y archivo a tocar

- **Causa**: Sesión guardada con refresh token inválido o de otro proyecto (p. ej. URL/anon key distinta en producción).
- **Archivo**: `src/contexts/AuthContext.jsx` (ya modificado: validación con `getUser()` y limpieza al detectar error de refresh/JWT).

### Qué revisar en producción

1. **Vercel (o tu host)**  
   Variables de entorno del proyecto de front:
   - `VITE_SUPABASE_URL` = URL del proyecto Supabase donde los usuarios hacen login (ej. `https://xxxx.supabase.co`).
   - `VITE_SUPABASE_ANON_KEY` = anon key de ese mismo proyecto.  
   Si no coinciden con el proyecto real, reconfigura y haz un **nuevo deploy** (las VITE_ se inyectan en build).

2. **Sesión vieja**  
   Con el cambio actual, al cargar la app se valida la sesión; si el refresh falla, se limpia y el usuario vuelve a login. Para forzar limpieza una vez en un dispositivo: en la app, cerrar sesión; en F12 → Application → Local Storage → borrar las claves que empiecen por `sb-`.

---

## PART B — Visitas al catálogo en producción

### 1. ¿La página de catálogo público llama a record-catalog-visit?

- Abre la app en producción (otro IP/móvil como hiciste).
- Abre **DevTools → pestaña Network**.
- Filtra por "record-catalog-visit" o por el dominio de Supabase.
- Entra en una ruta de catálogo: `/catalogo/<slug>`.
- Debe aparecer una petición **POST** a `https://<tu-proyecto>.supabase.co/functions/v1/record-catalog-visit`.  
  Si no aparece: o no se está ejecutando el código del catálogo (ruta distinta, error antes), o el bundle no incluye la llamada (revisar build y que `recordCatalogVisit` se llame en `loadCatalog`).

### 2. Estado HTTP en producción

- En esa misma petición en Network, revisa **Status**:
  - **200**: La función respondió. Revisa el body (JSON): `recorded: true` = insertó; `recorded: false, reason: "throttled"` = no inserta por throttle 30 min.
  - **404**: Función no desplegada o URL incorrecta (otro proyecto).
  - **500**: Error dentro de la función (p. ej. tabla no existe, env faltante).
  - **CORS**: Si el navegador bloquea por CORS, verás error en consola; la función ya envía `Access-Control-Allow-Origin: *`.

En consola ya hay logs: `[record-catalog-visit]` con status y body, y `[public-catalog] recordCatalogVisit result`. Úsalos para ver status y error en producción.

### 3. ¿La Edge Function está desplegada en el mismo proyecto?

En tu máquina (con Supabase CLI y proyecto enlazado):

```bash
cd c:\saas1
supabase functions list
```

Debe aparecer `record-catalog-visit`. Si no:

```bash
supabase functions deploy record-catalog-visit
```

El proyecto usado por la CLI debe ser el mismo que `VITE_SUPABASE_URL` en el front (mismo project ref).

### 4. ¿Existe la tabla wa_catalog_visits en la BD en vivo?

En **Supabase Dashboard** del mismo proyecto → **SQL Editor**:

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'wa_catalog_visits'
);
```

Si devuelve `false`, aplica la migración:

```bash
supabase db push
```

O aplica solo el archivo de visitas si lo tienes separado (migración `20260310600000_wa_catalog_visits.sql`).

### 5. ¿Existe el RPC wa_get_business_visit_stats en la BD en vivo?

En el mismo SQL Editor:

```sql
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'wa_get_business_visit_stats'
);
```

Si devuelve `false`, la migración no se aplicó por completo; vuelve a aplicar (misma migración incluye tabla + RPC):

```bash
supabase db push
```

### 6. Si todo existe y el POST devuelve 200 con recorded: true pero el dashboard sigue en 0

- Comprueba que el dashboard usa el **mismo proyecto** (mismo Supabase client = misma URL/anon key).
- En SQL Editor:

```sql
SELECT COUNT(*) FROM public.wa_catalog_visits;
SELECT * FROM public.wa_catalog_visits ORDER BY created_at DESC LIMIT 5;
```

Si hay filas, el RPC debería devolver números. Si el dashboard sigue en 0:
- Revisa que la tarjeta de "Visitas al catálogo" tome `visitStats` de `getBusinessVisitStats(business.id)` y que `business.id` sea el de tu negocio.
- En Dashboard → Logs → Postgres, revisa si hay errores al llamar a `wa_get_business_visit_stats`.

### 7. Si algo falla: comandos concretos

| Problema | Comando / acción |
|----------|-------------------|
| Función no desplegada | `supabase functions deploy record-catalog-visit` |
| Migración no aplicada | `supabase db push` |
| URL/anon key distinta en front | En Vercel (o host): corregir `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` y volver a desplegar el front |
| CORS | La función ya envía CORS; si sigue fallando, revisar que la petición vaya a la misma URL que el resto del proyecto |

---

## PART C — Comprobación de extremo a extremo (tras aplicar correcciones)

Sigue estos pasos y comprueba cada uno:

1. **Abrir catálogo público**  
   En otro dispositivo o navegación privada: `https://<tu-dominio>/catalogo/<slug>`.

2. **Comprobar petición en Network**  
   DevTools → Network → filtrar por "record-catalog-visit". Debe existir una petición POST a `/functions/v1/record-catalog-visit`.

3. **Comprobar HTTP 200**  
   Esa petición debe tener Status **200** y en Response (JSON) algo como `{ "recorded": true }` (o `recorded: false, reason: "throttled"` si ya contaste esa visita en los últimos 30 min).

4. **Comprobar fila en wa_catalog_visits**  
   Supabase Dashboard → SQL Editor:

   ```sql
   SELECT id, business_id, slug, created_at
   FROM public.wa_catalog_visits
   ORDER BY created_at DESC
   LIMIT 5;
   ```

   Debe aparecer una fila nueva con `created_at` reciente.

5. **Comprobar que la métrica del dashboard sube**  
   Con la misma cuenta dueña del negocio, entra al dashboard. La tarjeta "Visitas al catálogo" (o equivalente) debe mostrar al menos 1 visita (o más si ya había). Si sigue en 0, revisar que la tarjeta use `getBusinessVisitStats(business.id)` y que no haya error en la llamada al RPC (consola o Logs de Postgres).

Cuando todo funcione, puedes quitar los `console.log`/`console.warn` temporales de `src/services/waBusinessService.js`, `src/pages/public-catalog/index.jsx` y los que usan `window.__AUTH_DEBUG__` en `src/contexts/AuthContext.jsx`.
