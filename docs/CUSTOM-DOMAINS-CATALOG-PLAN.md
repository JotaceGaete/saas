# CUSTOM-DOMAINS-CATALOG-PLAN.md
> Auditoría y plan técnico. Fecha: 2026-05-25.
> Todo lo descrito sale del código real. Nada inventado.

---

## 1. Estado actual del catálogo público

El catálogo público es una SPA React (Vite) que se sirve desde `go.ventalink.app` con dominio canónico de catálogos en `miralatienda.de`.

### Cómo funciona hoy

```
Visitante ingresa a:
  miralatienda.de/catalogo/mi-tienda
  ↓
Vercel rewrite → /api/seo?slug=mi-tienda&publicPath=catalogo
  ↓
api/seo.js → query Supabase wa_businesses WHERE slug = 'mi-tienda'
  ↓
Inyecta OG meta tags en index.html
  ↓
Devuelve HTML al browser → React Router monta <PublicCatalog slug="mi-tienda" />
  ↓
PublicCatalog → getBusinessBySlug('mi-tienda') → Supabase
  ↓
Renderiza el catálogo
```

### Datos críticos del estado actual

- **Resolución:** siempre por `slug` extraído del path URL. No existe lookup por hostname.
- **Canonical URL fija:** `CATALOG_ORIGIN/catalogo/:slug` = `https://miralatienda.de/catalogo/:slug` (hardcoded en `src/config/appUrl.js` línea 18-20 y `api/seo.js` línea 34-36).
- **OG image:** siempre apunta a `/api/og-catalog?slug=:slug` en `CATALOG_ORIGIN`.
- **Tracking:** `recordCatalogVisit(slug, path)` y `recordCatalogWhatsAppClick(slug, path)` usan `slug` como clave, no hostname.
- **No existe ninguna tabla ni columna de dominio personalizado** en el schema actual.
- **No existe ninguna lógica de hostname** en `getBusinessBySlug`, `api/seo.js`, ni en `src/Routes.jsx`.

---

## 2. Cómo se resuelve hoy un negocio por slug

### Función principal: `getBusinessBySlug(slug)`

**Archivo:** `src/services/waBusinessService.js` línea 639

```js
export const getBusinessBySlug = async (slug) => {
  const { data, error } = await supabase
    .from('wa_businesses')
    .select('*, wa_rubros(name, slug)')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  ...
};
```

**Problema para dominios propios:** La función toma `slug` como parámetro, que viene de `useParams()` en el componente. Si el usuario entra por `catalogo.mi-negocio.cl/` (dominio propio), no hay `:slug` en la URL — hay que resolver el negocio por hostname.

### Función en api/seo.js (serverless)

**Archivo:** `api/seo.js` línea 173+

```js
async function handleCatalogHtml(request) {
  const slug = url.searchParams.get('slug')?.trim();
  // ...
  let { data: row } = await supabase
    .from('wa_businesses')
    .select(FULL_SELECT)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
```

Igual que el frontend: lookup exclusivo por slug.

### Canonical URL generada

Siempre usa `CATALOG_ORIGIN` (`miralatienda.de`):
- `api/seo.js` línea 284: `const catalogUrl = getOfficialCatalogUrl(slug);`
- `getOfficialCatalogUrl(slug)` → `${CATALOG_ORIGIN}/catalogo/${slug}` → `https://miralatienda.de/catalogo/mi-tienda`

Con dominio propio habría que cambiar el canonical a `https://catalogo.mi-negocio.cl/` o `https://mi-negocio.cl/`.

---

## 3. Rutas públicas existentes

| Ruta | Dominio | Rewrite Vercel | Handler |
|------|---------|---------------|---------|
| `/catalogo/:slug` | `miralatienda.de`, `go.ventalink.app` | → `/api/seo?slug=:slug&publicPath=catalogo` | `api/seo.js#handleCatalogHtml` |
| `/catalog/:slug` | `go.ventalink.app` | → `/api/seo?slug=:slug&publicPath=catalog` | `api/seo.js#handleCatalogHtml` |
| `/:slug` | `miralatienda.de`, `go.ventalink.app` | → `/api/seo?slug=:slug&publicPath=short` | `api/seo.js#handleCatalogHtml` |
| `/p/:bizSlug/:prodSlug` | `miralatienda.de`, `go.ventalink.app` | → `/api/seo?publicPath=product&...` | `api/seo.js#handleProductHtml` |
| `/catalogo/:slug/checkout` | Ambos | → `/index.html` | React Router (`OrderConfirmation`) |
| `/catalogo/:slug/ofertas` | Ambos | → `/index.html` | React Router (`PublicOffers`) |

**Ninguna ruta está preparada para hostname personalizado como `catalogo.mi-negocio.cl`.**

---

## 4. Cambios mínimos para resolver un catálogo por hostname

Para soportar `catalogo.mi-negocio.cl` → catálogo del negocio con ese dominio configurado, se necesita:

### A. Nueva consulta en backend (api/seo.js)

Cuando el hostname del request NO es `go.ventalink.app`, `ventalink.app`, `miralatienda.de` ni `.vercel.app`, intentar resolver el negocio por hostname antes de por slug:

```js
// Nuevo flujo en handleCatalogHtml (y en el router principal)
const incomingHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
const isOwnDomain = !isVentalinkHost(incomingHost);

if (isOwnDomain) {
  // Resolver negocio por hostname, no por slug
  const { data: row } = await supabase
    .from('wa_custom_domains')
    .select('business_id, wa_businesses(*)')
    .eq('hostname', incomingHost)
    .eq('status', 'active')
    .maybeSingle();
  // Continuar con row.wa_businesses como el negocio
}
```

### B. Nueva función `getBusinessByHostname(hostname)` en frontend

Análoga a `getBusinessBySlug` pero lookup por hostname:

```js
export const getBusinessByHostname = async (hostname) => {
  const { data, error } = await supabase
    .from('wa_custom_domains')
    .select('business_id, wa_businesses(*, wa_rubros(name, slug))')
    .eq('hostname', hostname)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return { data: null, error };
  return { data: mapBusinessFromDb(data.wa_businesses), error: null };
};
```

### C. Detección de hostname en PublicCatalog

En `src/pages/public-catalog/index.jsx`, el componente `CatalogInner` recibe `slug` de `useParams()`. Cuando no hay slug (dominio propio en `/`), hay que detectar el hostname:

```js
function CatalogInner({ slug: slugFromParams }) {
  const isCustomDomain = !slugFromParams && isCustomDomainHost(window.location.hostname);
  const slug = slugFromParams || null; // puede ser null en dominio propio
  // Si isCustomDomain → getBusinessByHostname(window.location.hostname)
  // Si slug → getBusinessBySlug(slug) [actual]
```

### D. Canonical URL adaptativa

La canonical URL debe cambiar según el contexto:
- Desde `miralatienda.de/catalogo/mi-tienda` → canonical = `https://miralatienda.de/catalogo/mi-tienda`
- Desde `catalogo.mi-negocio.cl/` → canonical = `https://catalogo.mi-negocio.cl/`

**Archivo a modificar:** `src/config/appUrl.js`, `api/seo.js`, `src/utils/catalogSeo.js`

### E. OG image también debe cambiar de origen

`/api/og-catalog` vive hoy en `go.ventalink.app`. Cuando el catálogo se sirve desde dominio propio, la og:image debe referirse a `go.ventalink.app/api/og-catalog?slug=...` de todas formas (CORS, origen fijo) — **no** al dominio propio.

### F. Tracking: pasar hostname además de slug

En `recordCatalogVisit()` agregar el hostname para saber desde dónde entró el visitante. La Edge Function `record-catalog-visit` ya almacena `path` y `source`; agregar `hostname` al payload es mínimo.

---

## 5. Propuesta de tabla `wa_custom_domains`

```sql
CREATE TABLE IF NOT EXISTS public.wa_custom_domains (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.wa_businesses(id) ON DELETE CASCADE,

  -- El hostname tal como lo configuró el cliente (sin protocol, sin trailing slash)
  -- Ejemplos: 'catalogo.mi-negocio.cl', 'menu.laparrilla.com.ar', 'mi-negocio.cl'
  hostname         TEXT NOT NULL,

  -- Tipo: subdomain = catalogo.negocio.cl | apex = negocio.cl | subdomain_walinka = negocio.walinka.cl
  domain_type      TEXT NOT NULL DEFAULT 'custom'
                   CHECK (domain_type IN ('custom', 'subdomain_walinka')),

  -- Estado del ciclo de vida del dominio
  status           TEXT NOT NULL DEFAULT 'pending_dns'
                   CHECK (status IN (
                     'pending_dns',     -- cliente configuró, esperando que los DNS apunten
                     'dns_detected',    -- los DNS apuntan al servidor correcto
                     'verified',        -- dominio verificado (CNAME/A record correcto)
                     'ssl_pending',     -- Let's Encrypt/CF emitiendo certificado
                     'active',          -- dominio activo y sirviendo tráfico
                     'error',           -- error no recuperable (dominio inválido, conflicto, etc.)
                     'inactive'         -- desactivado por el cliente o por admin
                   )),

  -- Valor del registro DNS que el cliente debe configurar (para instrucciones UX)
  -- Para CNAME: 'cname-proxy.ventalink.app' (Vercel/Cloudflare)
  -- Para A: IP del edge
  dns_target       TEXT,

  -- Tipo de registro DNS recomendado: 'CNAME' | 'A'
  dns_record_type  TEXT DEFAULT 'CNAME',

  -- Token secreto para verificación (TXT record o header)
  verification_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),

  -- Última vez que se verificó el estado DNS (para polling/cron)
  last_checked_at  TIMESTAMPTZ,

  -- Último error detectado (para mostrar al cliente)
  last_error       TEXT,

  -- Cuándo se activó exitosamente por primera vez
  activated_at     TIMESTAMPTZ,

  -- Cuándo expira el dominio (si se usa por plan)
  expires_at       TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un negocio puede tener a lo sumo un dominio activo a la vez
-- (pero varios en estados pendientes/error pueden coexistir)
CREATE UNIQUE INDEX wa_custom_domains_business_active_uq
  ON public.wa_custom_domains(business_id)
  WHERE status = 'active';

-- Lookup rápido por hostname (la consulta más frecuente)
CREATE UNIQUE INDEX wa_custom_domains_hostname_uq
  ON public.wa_custom_domains(hostname);

-- Para filtrar por estado (polling/cron de verificación)
CREATE INDEX wa_custom_domains_status_idx
  ON public.wa_custom_domains(status);

-- Para saber qué negocios tienen dominio propio
CREATE INDEX wa_custom_domains_business_id_idx
  ON public.wa_custom_domains(business_id);

COMMENT ON TABLE public.wa_custom_domains IS
  'Dominios personalizados de clientes para sus catálogos públicos.';
COMMENT ON COLUMN public.wa_custom_domains.hostname IS
  'Hostname exacto sin protocol ni path: ej. catalogo.mi-negocio.cl';
COMMENT ON COLUMN public.wa_custom_domains.verification_token IS
  'Token para registro TXT DNS: _ventalink-verify.{hostname} = {token}';
```

---

## 6. RLS recomendada

```sql
ALTER TABLE public.wa_custom_domains ENABLE ROW LEVEL SECURITY;

-- Dueño del negocio: puede ver y gestionar sus propios dominios
CREATE POLICY "wa_custom_domains_owner_select"
  ON public.wa_custom_domains FOR SELECT TO authenticated
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

CREATE POLICY "wa_custom_domains_owner_insert"
  ON public.wa_custom_domains FOR INSERT TO authenticated
  WITH CHECK (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

CREATE POLICY "wa_custom_domains_owner_update"
  ON public.wa_custom_domains FOR UPDATE TO authenticated
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ))
  -- El cliente solo puede cambiar hostname y activar/desactivar.
  -- status y verification_token los cambia solo el backend (service_role).
  WITH CHECK (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

CREATE POLICY "wa_custom_domains_owner_delete"
  ON public.wa_custom_domains FOR DELETE TO authenticated
  USING (business_id IN (
    SELECT id FROM public.wa_businesses WHERE user_id = auth.uid()
  ));

-- Backend (api/seo.js y Edge Functions): acceso por service_role (sin RLS)
-- Lookup por hostname para resolver catálogos públicos: necesita acceso anon
-- OPCIÓN A: RPC SECURITY DEFINER para lookup público (recomendado)
-- OPCIÓN B: política SELECT para anon — requiere cuidado para no exponer datos sensibles

-- Recomendación: usar RPC para lookup público
CREATE OR REPLACE FUNCTION public.wa_get_business_by_hostname(p_hostname TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row JSONB;
BEGIN
  SELECT to_jsonb(b.*)
  INTO v_row
  FROM public.wa_custom_domains cd
  JOIN public.wa_businesses b ON b.id = cd.business_id
  WHERE cd.hostname = p_hostname
    AND cd.status = 'active'
    AND b.is_active = true
  LIMIT 1;
  RETURN v_row;
END;
$$;
```

---

## 7. Flujo UX para que el cliente agregue su dominio

```
Panel → Configuración → "Dominio propio" (nuevo panel)
  │
  ├─ [1] Input: ingresar hostname (ej. catalogo.mi-negocio.cl)
  │      Validación frontend: no protocol, no trailing slash, formato válido
  │
  ├─ [2] Backend crea registro en wa_custom_domains con status='pending_dns'
  │      Devuelve: hostname, dns_target (CNAME), verification_token
  │
  ├─ [3] UI muestra instrucciones DNS:
  │      ┌─────────────────────────────────────────────────────┐
  │      │ Configura estos registros en tu proveedor DNS:       │
  │      │                                                       │
  │      │  CNAME  catalogo.mi-negocio.cl → cname.ventalink.app│
  │      │  TXT    _ventalink-verify.catalogo.mi-negocio.cl    │
  │      │         → abc123...                                  │
  │      └─────────────────────────────────────────────────────┘
  │      Botón: "Ya lo configuré, verificar ahora"
  │
  ├─ [4] Verificación (polling o trigger manual):
  │      Edge Function / Cron verifica DNS (CNAME y TXT)
  │      status → 'dns_detected' → 'verified' → 'ssl_pending' → 'active'
  │
  └─ [5] Cuando status = 'active':
         Panel muestra: "Tu dominio está activo 🎉"
         Link al catálogo: https://catalogo.mi-negocio.cl
```

---

## 8. Estados posibles del dominio

| Estado | Descripción | Siguiente estado | Acción requerida |
|--------|-------------|-----------------|------------------|
| `pending_dns` | Dominio registrado, DNS no verificado | `dns_detected` o `error` | Cliente configura CNAME/TXT |
| `dns_detected` | DNS apunta al target correcto, pendiente verificación completa | `verified` | Sistema verifica CNAME y TXT |
| `verified` | DNS verificado. Esperando provisión SSL | `ssl_pending` o `active` | Sistema solicita certificado (Vercel/CF) |
| `ssl_pending` | Certificado SSL en proceso | `active` o `error` | Esperar Let's Encrypt/Cloudflare |
| `active` | Dominio funcionando y sirviendo tráfico | `inactive` o `error` | Monitoreo periódico |
| `error` | Error no recuperable. `last_error` describe el problema | Requiere intervención | Cliente corrige config o contacta soporte |
| `inactive` | Desactivado manual (cliente o admin) | `pending_dns` | Cliente reactiva |

---

## 9. Cambios requeridos en Frontend

### 9.1 Detección de hostname en PublicCatalog

**Archivo:** `src/pages/public-catalog/index.jsx`

```
Cambio: CatalogInner({ slug }) debe manejar slug = null (dominio propio en /)
Función nueva: isCustomDomainHost(hostname) → boolean
Lógica: if (!slug && isCustomDomain) → getBusinessByHostname(hostname)
         else → getBusinessBySlug(slug)  [sin cambios]
```

El `useParams()` en el componente raíz `PublicCatalog` devuelve `slug = undefined` cuando la URL es `/` en el dominio propio. React Router necesita una ruta `<Route path="/" element={...}>` específica para el dominio propio — **pero esto no se puede hacer con routing estático**: el mismo `Routes.jsx` sirve tanto para `go.ventalink.app` como para el dominio propio (si usamos la misma SPA).

**Opciones:**
- A) Detectar hostname en el componente y bifurcar lógica (más simple, mismo bundle)
- B) Build separado con configuración de dominio propio (más complejo)

**Recomendación:** Opción A para Fase 1 y 2.

### 9.2 Canonical URL adaptativa

**Archivo:** `src/config/appUrl.js`

```
Función nueva: getCanonicalCatalogUrl(slug, hostname) → string
  Si hostname es dominio propio → `https://${hostname}/`  (Fase 2/3)
  Si hostname es Ventalink → `${CATALOG_ORIGIN}/catalogo/${slug}` (actual)
```

### 9.3 Compartir y botón "Ver catálogo"

**Archivos:** `src/config/appUrl.js`, `src/utils/catalogSeo.js`, `src/components/BrandingFooter.jsx`

Hoy `getPublicCatalogUrl(slug)` siempre genera `miralatienda.de/catalogo/slug`. Para dominio propio debería generar `https://catalogo.mi-negocio.cl/`.

### 9.4 waBusinessService.js — Nueva función

```
Agregar: getBusinessByHostname(hostname) → { data, error }
Agregar: isCustomDomainHost(hostname) → boolean (no es go/ventalink/miralatienda)
```

### 9.5 Panel de configuración de dominio

**Nueva página/sección:** en `/business-configuration` o página dedicada (ej. `/domain-settings`)

Componentes nuevos:
- `DomainSetupPanel.jsx` — formulario de configuración
- `DomainStatusBadge.jsx` — muestra el estado del dominio
- `DomainInstructions.jsx` — instrucciones DNS visuales

### 9.6 Tracking — hostname en payload

**Archivo:** `src/services/waBusinessService.js` función `recordCatalogVisit`

```
Agregar campo: hostname: window.location.hostname
```

---

## 10. Cambios requeridos en Supabase

### 10.1 Nueva migración: tabla wa_custom_domains

Archivo nuevo: `supabase/migrations/<timestamp>_wa_custom_domains.sql`

Contenido: tabla, índices, RLS, RPC `wa_get_business_by_hostname` (ver sección 5 y 6).

### 10.2 Nueva Edge Function: `verify-custom-domain`

**Archivo nuevo:** `supabase/functions/verify-custom-domain/index.ts`

Responsabilidades:
- Recibe `hostname` o `domain_id`
- Hace lookup DNS del CNAME (via `Deno.resolveDns` o DNS-over-HTTPS)
- Verifica TXT record de verificación
- Actualiza `wa_custom_domains.status` según resultado
- Actualiza `last_checked_at`, `last_error`

```
POST /functions/v1/verify-custom-domain
Body: { hostname: "catalogo.mi-negocio.cl" }
Auth: service_role o JWT del dueño
```

### 10.3 Cron de verificación periódica

Puede ser:
- Supabase pg_cron: llama a la Edge Function periódicamente para dominios en `pending_dns`/`dns_detected`
- Vercel Cron: nueva ruta `/api/cron/verify-custom-domains`

### 10.4 Nueva Edge Function: `register-custom-domain` (opcional)

Para cuando Vercel o Cloudflare requieran registro programático del dominio.

### 10.5 Actualización de `record-catalog-visit`

**Archivo:** `supabase/functions/record-catalog-visit/index.ts`

Agregar columna `hostname` al cuerpo del request y al insert en `wa_catalog_visits`.
Migración: `ALTER TABLE wa_catalog_visits ADD COLUMN IF NOT EXISTS hostname TEXT;`

---

## 11. Cambios requeridos en Vercel o Cloudflare

Este es el punto más crítico y determina el enfoque arquitectónico.

### Opción A: Vercel Custom Domains (Recomendado para Fase 2)

Vercel permite agregar dominios personalizados **programáticamente** via API:

```
POST https://api.vercel.com/v9/projects/{projectId}/domains
Authorization: Bearer {VERCEL_TOKEN}
Body: { "name": "catalogo.mi-negocio.cl" }
```

Luego Vercel maneja automáticamente:
- Provisión de certificado SSL (Let's Encrypt)
- Serving de la SPA en el dominio personalizado

**Limitación:** En plan Vercel Pro/Enterprise. En Hobby no está disponible la API de dominios.

**Flujo:**
1. Cliente agrega dominio en panel Ventalink
2. Backend llama a Vercel API para registrar el dominio en el proyecto
3. Vercel devuelve instrucciones DNS (CNAME target)
4. Se muestran instrucciones al cliente
5. Vercel verifica automáticamente cuando el DNS propaga

### Opción B: Cloudflare for Platforms (SaaS)

Cloudflare for Platforms permite gestionar dominios de clientes sin tocar Vercel:
- Cloudflare actúa como proxy
- El cliente hace CNAME a `proxy.ventalink.app` (un Cloudflare Worker)
- El Worker resuelve el negocio por hostname y hace proxy a `go.ventalink.app`
- SSL gestionado por Cloudflare

**Ventaja:** No depende de plan Vercel. Más control.
**Desventaja:** Más complejidad de infraestructura. Costo adicional de Cloudflare for Platforms.

### Opción C: Subdominio Walinka controlado (Fase 1, sin cambios en DNS clientes)

Para Fase 1, usar subdominios bajo un dominio controlado (ej. `negocio.walinka.cl`):
- El cliente no configura DNS propio
- Ventalink crea subdominios `*.walinka.cl` apuntando al mismo Vercel
- Vercel maneja el wildcard SSL
- Resolución por hostname en la app

**Cambios DNS necesarios:** Solo agregar `*.walinka.cl` como wildcard domain en Vercel (una vez).

### Cambios en vercel.json (Fase 1 — subdominio Walinka)

```json
// Agregar rewrite para dominios que no son ventalink/miralatienda
// Vercel no admite wildcards en host conditions, pero sí se puede
// usar la función serverless para manejar cualquier host
{
  "rewrites": [
    // NUEVO: catch-all para dominios propios (antes del fallback a index.html)
    {
      "source": "/",
      "destination": "/api/seo?mode=custom_domain"
    }
  ]
}
```

**Problema:** `vercel.json` no soporta condición `host` wildcard para dominios externos. La solución es hacer que `/api/seo.js` detecte el hostname y bifurque la lógica internamente.

### Cambios en api/seo.js

```js
// Función nueva
function isVentalinkOwnedHost(host) {
  const h = (host || '').toLowerCase();
  return h.endsWith('.ventalink.app') ||
         h.endsWith('.miralatienda.de') ||
         h.endsWith('.vercel.app') ||
         h === 'ventalink.app' ||
         h === 'miralatienda.de';
}

// En routeSeoRequest:
const host = url.searchParams.get('host') || 
             request.headers.get('x-forwarded-host') || 
             request.headers.get('host') || '';

if (!isVentalinkOwnedHost(host)) {
  // Dominio propio → resolver por hostname
  return handleCustomDomainHtml(request, host);
}
```

---

## 12. Riesgos técnicos

| Riesgo | Severidad | Descripción |
|--------|-----------|-------------|
| **Propagación DNS lenta** | 🟡 Media | El cliente puede esperar hasta 48h. La UX debe comunicar esto claramente. |
| **Colisión de hostnames** | 🔴 Alta | Dos clientes con el mismo dominio. UNIQUE index en hostname previene esto, pero la UX debe dar feedback claro. |
| **SSL provisioning delay** | 🟡 Media | Vercel/Cloudflare puede tardar minutos a horas en emitir el certificado. |
| **Dominio propio con / sin www** | 🟡 Media | `negocio.cl` y `www.negocio.cl` son hostnames diferentes. El cliente debe configurar ambos o redirigir uno al otro. |
| **Canonical URL duplicado** | 🔴 Alta | Si el catálogo sirve tanto en `miralatienda.de/catalogo/slug` como en `negocio.cl/`, Google ve contenido duplicado. Hay que usar `<link rel="canonical">` apuntando al dominio propio cuando el negocio tiene uno activo. |
| **OG image desde dominio propio** | 🟡 Media | WhatsApp crawlea la og:image desde el dominio del catálogo. Si la imagen apunta a `go.ventalink.app/api/og-catalog`, puede haber problemas de CORS o de resolución. La imagen debe ser absoluta HTTPS desde un origen crawleable. |
| **Plan Vercel** | 🔴 Alta | La API de dominios de Vercel solo está en Pro/Enterprise. Verificar el plan actual antes de comprometerse con Opción A. |
| **Tracking roto** | 🟡 Media | `recordCatalogVisit(slug, ...)` necesita slug, pero desde dominio propio el slug no está en la URL. Hay que obtenerlo desde el negocio resuelto por hostname. |
| **Seguridad: domain takeover** | 🔴 Alta | Si un dominio apunta a Ventalink pero el registro en `wa_custom_domains` se borra, Vercel seguiría sirviendo tráfico sin negocio asignado. Necesita verificación periódica y estado `inactive`. |
| **Sin staging de Supabase** | 🟡 Media | Las migraciones de tabla nueva deben probarse manualmente antes de producción. |
| **Throttle de visitas con dominio propio** | 🟢 Baja | `shouldThrottleVisit(slug)` usa el slug como key. Desde dominio propio habría que obtener el slug del negocio resuelto. |

---

## 13. Plan por fases

### Fase 1: Subdominio Walinka (`negocio.walinka.cl`)

**Objetivo:** Permitir a clientes tener una URL limpia bajo un subdominio de Ventalink, sin gestionar DNS propios.

**Ejemplo resultado:** `tienda-lucia.walinka.cl` → catálogo de "Tienda Lucia"

**Lo que Ventalink controla:** DNS wildcard `*.walinka.cl → go.ventalink.app`. El cliente no toca nada.

**Cambios técnicos:**
1. Agregar `*.walinka.cl` como dominio en Vercel (una vez, manual)
2. Agregar DNS wildcard `*.walinka.cl CNAME go.ventalink.app` (una vez)
3. Migración SQL: tabla `wa_custom_domains` (solo columnas `hostname`, `status`, `business_id`, `domain_type='subdomain_walinka'`)
4. `api/seo.js`: detectar hostname `*.walinka.cl` → lookup por hostname → `wa_custom_domains`
5. `getBusinessByHostname()` en frontend (lookup en `wa_custom_domains`)
6. Panel: campo simple "Subdominio Walinka" → genera `mi-negocio.walinka.cl`

**Dependencias externas:** Registrar `walinka.cl` en registrador de dominios (si no existe).

**Complejidad:** Baja-media. No requiere API de Vercel ni gestión de DNS del cliente.

**Criterio de éxito:** Un negocio puede acceder a su catálogo en `mi-negocio.walinka.cl` con todo funcionando (catálogo, checkout, SEO, tracking).

---

### Fase 2: Dominio propio tipo `catalogo.negocio.cl`

**Objetivo:** El cliente agrega un subdominio de su propio dominio. Solo requiere configurar un CNAME.

**Ejemplo resultado:** `catalogo.la-parrilla.cl` → catálogo de "La Parrilla"

**Cambios técnicos adicionales sobre Fase 1:**
1. Panel: formulario para ingresar hostname personalizado
2. UI de instrucciones DNS (CNAME target + TXT de verificación)
3. Edge Function `verify-custom-domain`: verifica CNAME y TXT via DNS
4. Cron de verificación: polling cada N minutos para dominios en `pending_dns`
5. Vercel API (o Cloudflare): registrar el dominio programáticamente para SSL
6. Ciclo completo de estados (`pending_dns → dns_detected → verified → ssl_pending → active`)
7. Canonical URL en el catálogo apunta al dominio propio cuando está activo
8. Sitemap excluye la URL de `miralatienda.de` para negocios con dominio propio activo

**Dependencias externas:** Vercel Pro/Enterprise (para API de dominios) O Cloudflare for Platforms.

**Complejidad:** Alta. Requiere coordinación con infra (Vercel/Cloudflare), DNS verification, y manejo de estados asíncronos.

---

### Fase 3: Dominio raíz `negocio.cl`

**Objetivo:** El cliente apunta su dominio raíz al catálogo. Requiere registro A o CNAME según el registrador.

**Ejemplo resultado:** `la-parrilla.cl` → catálogo de "La Parrilla"

**Complejidad adicional sobre Fase 2:**
- Algunos registradores no permiten CNAME en apex (`negocio.cl`). Requiere registro A (IP fija) o soporte ALIAS/ANAME.
- `www.negocio.cl` debe redirigir a `negocio.cl` (requiere manejo en Cloudflare Worker o Vercel config).
- Riesgo mayor de conflicto con email del cliente (registros MX en mismo dominio).

**Recomendación:** Solo ofrecer esto cuando el cliente ya tiene experiencia técnica o soporte asistido.

**Dependencias:** Cloudflare for Platforms (más robusto para apex), o documentación clara para cada registrador.

---

## 14. Archivos que probablemente habría que tocar

| Archivo | Cambio requerido | Fase |
|---------|-----------------|------|
| `src/services/waBusinessService.js` | Agregar `getBusinessByHostname()`, `isCustomDomainHost()` | 1 |
| `src/pages/public-catalog/index.jsx` | Detectar hostname, bifurcar entre slug y hostname lookup | 1 |
| `src/pages/order-confirmation/index.jsx` | Obtener slug desde business.slug (no solo useParams) cuando dominio propio | 1 |
| `src/config/appUrl.js` | `getCanonicalCatalogUrl(slug, hostname)` adaptativo | 1 |
| `src/utils/catalogSeo.js` | `getCatalogOgImageUrl` — fijar origen a `go.ventalink.app` en dominio propio | 1 |
| `src/Routes.jsx` | Ruta `/` para dominio propio → `<PublicCatalog slug={null} />` | 1 |
| `api/seo.js` | `handleCustomDomainHtml`, `isVentalinkOwnedHost`, lookup por hostname | 1 |
| `vercel.json` | Agregar dominio `*.walinka.cl` (Fase 1); rewrites para dominios propios | 1/2 |
| `supabase/migrations/<ts>_wa_custom_domains.sql` | Nueva tabla + índices + RLS + RPC | 1 |
| `supabase/functions/verify-custom-domain/index.ts` | NUEVA: verificación DNS | 2 |
| `supabase/functions/record-catalog-visit/index.ts` | Agregar hostname al payload | 1 |
| `supabase/migrations/<ts>_wa_catalog_visits_hostname.sql` | `ADD COLUMN hostname TEXT` | 1 |
| `src/pages/business-configuration/index.jsx` | Integrar panel de configuración de dominio | 1/2 |
| **Nuevo:** `src/pages/business-configuration/components/DomainSetupPanel.jsx` | UI de configuración | 1/2 |
| **Nuevo:** `src/components/DomainStatusBadge.jsx` | Badge de estado del dominio | 2 |
| `src/services/waBusinessService.js` `recordCatalogVisit()` | Agregar hostname al payload | 1 |

---

## 15. Criterios de aceptación

### Fase 1 — Subdominio Walinka

- [ ] Un negocio puede elegir `mi-negocio.walinka.cl` desde el panel
- [ ] `mi-negocio.walinka.cl/` renderiza el catálogo del negocio correcto
- [ ] `mi-negocio.walinka.cl/checkout` (o path equivalente) funciona correctamente
- [ ] El titulo de la página, og:title y og:description son los del negocio
- [ ] `<link rel="canonical">` apunta a `https://mi-negocio.walinka.cl/`
- [ ] La og:image es una URL HTTPS absoluta crawleable por WhatsApp
- [ ] `recordCatalogVisit` registra visita correctamente (con slug del negocio, no de la URL)
- [ ] El botón WhatsApp abre la URL correcta con el mensaje del negocio
- [ ] Dos negocios no pueden tener el mismo subdominio (error claro en UI)
- [ ] El panel muestra el dominio asignado y un link para copiarlo/compartirlo

### Fase 2 — Dominio propio (subdominio)

Todo lo de Fase 1, más:
- [ ] El cliente puede ingresar un hostname personalizado
- [ ] Se muestran instrucciones DNS claras (CNAME target, TXT record)
- [ ] El sistema detecta cuando el DNS propagó correctamente
- [ ] El certificado SSL se provisiona automáticamente
- [ ] El panel muestra el estado actual del dominio en tiempo real
- [ ] Cuando `status = 'active'`, el catálogo funciona en el dominio propio
- [ ] El catálogo anterior en `miralatienda.de/catalogo/slug` sigue funcionando (no se rompe)
- [ ] El canonical apunta al dominio propio cuando está activo
- [ ] Los bots de WhatsApp obtienen OG correcto desde el dominio propio
- [ ] `last_error` describe errores comprensibles para el cliente no técnico

---

## 16. Prompt para implementar la Fase 1

Usar este prompt en una nueva sesión para implementar exclusivamente la Fase 1 (subdominios Walinka):

```
Contexto del proyecto: ver docs/PROJECT-CONTEXT.md, docs/ARCHITECTURE.md y docs/CUSTOM-DOMAINS-CATALOG-PLAN.md

Tarea: implementar la Fase 1 del plan de dominios personalizados — subdominios bajo `*.walinka.cl`.

El objetivo es que un negocio pueda elegir `mi-negocio.walinka.cl` desde el panel, 
y ese subdominio sirva su catálogo público.

Archivos clave a leer antes de implementar:
- src/services/waBusinessService.js (getBusinessBySlug, recordCatalogVisit)
- src/pages/public-catalog/index.jsx (CatalogInner, loadCatalog)
- src/pages/order-confirmation/index.jsx
- src/config/appUrl.js
- api/seo.js (handleCatalogHtml)
- vercel.json

Cambios a implementar (en orden):

1. MIGRACIÓN SQL: crear supabase/migrations/<timestamp>_wa_custom_domains.sql
   - Tabla `wa_custom_domains` con columnas: id, business_id, hostname, domain_type, status, 
     verification_token, last_checked_at, last_error, activated_at, created_at, updated_at
   - Índices: hostname UNIQUE, business_id + status = 'active' UNIQUE, status
   - RLS: dueño CRUD, RPC SECURITY DEFINER `wa_get_business_by_hostname(TEXT) → JSONB`
   - Trigger updated_at

2. FUNCIÓN BACKEND: agregar en src/services/waBusinessService.js
   - `isCustomDomainHost(hostname)`: retorna true si NO es go.ventalink.app, 
     ventalink.app, miralatienda.de, .vercel.app, localhost, 127.0.0.1
   - `getBusinessByHostname(hostname)`: llama a RPC `wa_get_business_by_hostname` 
     y mapea con `mapBusinessFromDb`
   - Modificar `recordCatalogVisit`: agregar hostname al body enviado a la Edge Function

3. FRONTEND PublicCatalog: modificar src/pages/public-catalog/index.jsx
   - En `PublicCatalog`, si !slug && isCustomDomainHost(window.location.hostname),
     usar getBusinessByHostname para resolver el negocio
   - Pasar el slug resuelto (business.slug) a todas las funciones que lo necesitan
     (recordCatalogVisit, checkout URL, canonical, etc.)
   - La ruta / en dominio propio debe mostrar el catálogo, no el 404

4. FRONTEND OrderConfirmation: modificar src/pages/order-confirmation/index.jsx
   - El checkout en dominio propio usa /checkout o /:slug/checkout (definir)
   - Asegurar que getPublicCatalogRelativePath devuelva path correcto

5. API SEO: modificar api/seo.js
   - Agregar función `isVentalinkOwnedHost(host)` 
   - En `routeSeoRequest`, detectar si el host es un dominio propio
   - Si es dominio propio: lookup en `wa_custom_domains` por hostname (via Supabase service_role),
     obtener el negocio, continuar con el mismo flujo de handleCatalogHtml
   - Canonical URL: si es dominio propio → `https://${host}/`

6. APPURL: modificar src/config/appUrl.js
   - Agregar `getCanonicalCatalogUrl(slug, hostname)`: si hostname es dominio propio,
     devolver `https://${hostname}/`; sino, `${CATALOG_ORIGIN}/catalogo/${slug}`

7. PANEL UI (mínimo viable): agregar en business-configuration una sección "Subdominio Walinka"
   - Input: prefijo del subdominio (ej. "mi-tienda")
   - Preview: "Tu catálogo quedará en: mi-tienda.walinka.cl"
   - Guardar: crear/actualizar registro en wa_custom_domains con domain_type='subdomain_walinka'
     y status='active' (para Fase 1 no hay verificación DNS — Ventalink controla el wildcard)
   - Mostrar el subdominio activo si ya existe

8. VERCEL CONFIG (manual, documentar en el PR):
   - Agregar *.walinka.cl como wildcard domain en el proyecto Vercel
   - Configurar DNS: *.walinka.cl CNAME go.ventalink.app

No implementes verificación DNS automática (eso es Fase 2).
No implementes dominios externos (eso es Fase 2).
Solo implementa lo descrito arriba.

Antes de hacer cualquier cambio, leer los archivos relevantes completos.
No inventar. No agregar features no pedidas.
```

---

*Fin del documento. Nada implementado todavía — solo plan técnico.*
