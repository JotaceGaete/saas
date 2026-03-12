# Verificación y corrección: visitas al catálogo

## 1. Comandos para verificar (ejecutar en orden)

Abre terminal en la raíz del proyecto (`c:\saas1`). Asegúrate de tener Supabase CLI instalado y login hecho (`supabase login` si hace falta).

### Enlazar proyecto (si no está linkeado)

```bash
supabase link --project-ref TU_PROJECT_REF
```

(Obtén `TU_PROJECT_REF` desde Dashboard Supabase → Project Settings → General → Reference ID.)

### 1) ¿La Edge Function está desplegada?

```bash
supabase functions list
```

- Si **no** aparece `record-catalog-visit` → la función no está desplegada.

### 2) ¿La migración está aplicada?

```bash
supabase migration list
```

- Revisa la columna **REMOTE**. Si `20260310600000` (o el nombre del archivo `20260310600000_wa_catalog_visits.sql`) no figura como aplicada en remoto → la migración no está aplicada.

### 3) ¿Existen la tabla y el RPC en la BD en vivo?

En **Supabase Dashboard** → **SQL Editor**, ejecuta:

```sql
-- Tabla
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'wa_catalog_visits'
);

-- RPC
SELECT EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'wa_get_business_visit_stats'
);
```

Si alguno devuelve `false`, la migración no se aplicó o se aplicó solo en parte.

---

## 2. Comandos para corregir

### Si la función NO está desplegada

```bash
supabase functions deploy record-catalog-visit
```

(En Supabase Cloud las env `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` se inyectan solas; no hace falta configurarlas.)

### Si la migración NO está aplicada

```bash
supabase db push
```

O aplicar solo esa migración (si usas reparación de historial):

```bash
supabase migration repair --status applied 20260310600000
```

Solo usa `repair` si la migración ya se aplicó a mano y quieres marcar el historial; si nunca se aplicó, usa `supabase db push`.

### Si la URL de Supabase en el frontend es incorrecta

- Revisa en **Vercel** (o donde hospedes el frontend) que la variable **VITE_SUPABASE_URL** sea exactamente la URL del proyecto (ej. `https://xxxx.supabase.co`), sin barra final.
- Revisa en **.env** local que `VITE_SUPABASE_URL` coincida con el proyecto que usas en producción.

### Si en consola ves CORS

- La Edge Function ya envía `Access-Control-Allow-Origin: *`. Si aun así hay error CORS, confirma que la petición va a la misma base (mismo dominio que `VITE_SUPABASE_URL`). Si el front está en otro dominio, el navegador puede bloquear; en ese caso el backend ya está preparado para CORS. Verifica en Network que la respuesta incluya la cabecera CORS.

### Si en consola ves "Missing Supabase URL"

- El build no tiene `VITE_SUPABASE_URL`. En Vercel: Project → Settings → Environment Variables → añade `VITE_SUPABASE_URL` y redeploy.

### Si el RPC falla (dashboard muestra 0 y el resto está bien)

- El RPC `wa_get_business_visit_stats` exige que el usuario esté autenticado y sea dueño del negocio. Si el dashboard carga con usuario dueño y aun así da 0, revisa en **Dashboard Supabase → Logs → Postgres** si hay errores al llamar al RPC. Que la tabla tenga filas: en SQL Editor `SELECT COUNT(*) FROM public.wa_catalog_visits;`

---

## 3. Logs temporales añadidos

En el código se añadieron logs para depurar:

- **Servicio** (`src/services/waBusinessService.js`): al llamar a la función se imprime en consola la URL (redactada), `status`, `ok` y el cuerpo de la respuesta. Si falta `VITE_SUPABASE_URL`, se imprime un warning.
- **Página de catálogo** (`src/pages/public-catalog/index.jsx`): tras `recordCatalogVisit` se imprime el resultado (`recorded`, `throttled`, `error`).

Abre la **consola del navegador** (F12 → Console), entra en una página de catálogo público y revisa:

- `[record-catalog-visit]` → URL, status, body.
- `[public-catalog] recordCatalogVisit result` → resultado en la página.

Interpretación rápida:

| Consola | Causa probable |
|--------|-----------------|
| `Missing VITE_SUPABASE_URL` | Variable de entorno no definida en build |
| `status: 404` | Función no desplegada o URL incorrecta |
| `status: 502` / `503` | Función falló (revisar Supabase → Edge Functions → Logs) |
| `status: 500` y body "Failed to record visit" | Tabla no existe o migración no aplicada |
| Error de red / CORS | URL incorrecta, función no desplegada o CORS (ya cubierto en la función) |

Cuando termines de depurar, puedes quitar los `console.log` / `console.warn` / `console.error` añadidos en `waBusinessService.js` y en `public-catalog/index.jsx`.
