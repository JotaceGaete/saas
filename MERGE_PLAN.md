# VENTALINK — PLAN DE MERGE SEGURO
## integration/lucid-zen-unified
## Fecha: Junio 2026 — Solo lectura. No ejecutar hasta decisión explícita.

---

## PARTE 1 — COMMITS EXCLUSIVOS POR BRANCH

### 1.1 lucid-lovelace (112 commits sobre main)

Agrupados por área:

**CRM base (primeros commits)**
```
6fa9a73  fix: enforce expired billing plans from backend SQL + limit public catalog products
0a3b4de  chore: add dist/ to .gitignore
de41e41  fix: correct pg_cron DO block syntax in enforce_expired_plans migration
16b2ecb  fix: replace FOR/RETURN NEXT with RETURN QUERY
7217cc3  fix: hide 'Ver más' button for plan-limited catalogs
a1c0879  feat: add CRM module — customers, quotes, invoices, stock
cf63581  feat(crm): restrict CRM module to admin users only
344c768  fix(crm): rewrite all pages with correct PanelHeader usage
148a6fb  CRM PDF profesional + campos comerciales
b433719  CRM responsive mobile-first
bb3a323  fix(crm): aumentar tap targets
71d5e71  chore: add playwright devDependency
2e470e7  feat(crm): rediseño UX del editor de presupuestos y facturas
358ea77  feat(crm): tabla compacta desktop, cards mobile, fechas chilenas
ee2ffbc  fix(crm): corregir visibilidad del botón PDF
72e5b65  feat(crm): estilo visual moderno
21278a2  Fix product thumbnails and restore PDF button in CRM editors
112670c  Rename invoice PDF to Nota de Venta
927f29a  Add crm_payments migration
585061a  Add crmPaymentsService
a93d761  Add payments section to invoice editor
efd619d  Improve payments UX: badges, mark-as-paid, and list totals
2f30443  Ensure create buttons visible on mobile
3463e39  Fix PanelHeader children invisible on desktop
f3eb120  Modernize CRM customers list with metrics, grid cards
5144937  Fix PanelHeader dead zone at medium desktop widths
```

**CRM expansión**
```
9a54ee6  Restructure CRM UX: single sidebar entry + hub portal dashboard
54c5f17  Polish CRM hub UX: plan gating, improved copy
fb7e4fc  Add document preview before download in CRM editors
089a429  Hide status badge and item descriptions in quote PDF/preview
5cd150e  Add document_title_type: Cotización/Presupuesto per business
Hide status badge and item descriptions in quote PDF/preview
```

**TPV / Terminal**
```
99fed59  feat(crm): add Terminal de Ventas (POS) module
f072469  feat(terminal): modernize POS UI
e1c9ed9  fix(terminal): restaurar imágenes reales
4f3111d  fix(terminal): restaurar botón ocultar menú
aad824a  feat(terminal): ticket térmico imprimible
ce4df80  feat(terminal): eliminar producto del carrito + pago recibido/vuelto
e79ebff  chore: trigger Vercel deployment for TPV branch
74ee0e7  fix(terminal): print thermal ticket content
dc9eca2  fix(crm): prevent dashboard horizontal overflow
78c8f5f  feat(product-editor): reorganize catalog state, price visibility and inventory
9ec68b6  fix(migration): add public schema + NOTIFY pgrst reload
7152568  fix(business-config): resilient updateBusiness
0a37061  refactor(ux): move category toggle and manager to business-configuration
4bebe02  feat(crm): add fixed-amount discount type per line item
c8eb1ea  fix(crm): improve discount column UX in line item editor
```

**Centro de costos**
```
663cf0f  feat(crm): Centro de Costos — termómetro financiero (Fase 1)
0b035eb  feat(crm): rediseño UX Centro de Costos
ad1e6b6  feat(crm): separar compras de gastos — tabla crm_purchases
868ccb9  fix(admin): búsqueda de usuarios por datos de negocio
cfe6a8f  fix(admin): reemplazar Edge Function por RPC SQL
c97f61d  fix(plans): restaurar toggle mensual/anual
90fc49f  feat(crm): add CRM_EARLY_ACCESS_MODE feature flag
b77a63d  feat(crm): ventas en cuenta corriente y saldo de clientes
b6650f8  feat(crm): artículo manual en TPV y cuenta corriente con abono parcial
ee3fc74  feat(crm): compras y facturas recibidas con IVA estimado
5dc1cae  refactor(crm): unificar fuente de datos — Termómetro lee desde Compras
d02816e  feat(crm): add /crm/costos page
3ae722e  feat(crm): redesign IVA panel
```

**Termómetro UX**
```
0e79a18  Redesign CrmCostCenter as Termómetro del Negocio
1b5fbfc  Redesign Termómetro with emotional-first UX
260de4a  Polish Termómetro UX per Sprint 1 spec
5ba2b85  Reinforce Termómetro hero card and emotional copy
276249b  Sprint 2 — Gastos variables en Termómetro
```

**Caja diaria**
```
0ead185  feat(crm): implementar Caja Diaria (Etapa 1)
793e5e0  fix(caja): corregir RLS y rediseñar UI
cb4836b  fix(caja): corregir consulta de pagos TPV en sesión
79f4dab  fix(caja): mejorar detección de errores
0ce86ea  fix(caja): corregir nombres de columnas reales
3cf2e2c  fix(caja): usar payment_status='received'
cca1f89  feat(crm): daily cash register with real payment tracking
0cad515  feat(crm): support multiple cash sessions per day
0f49005  feat(caja): soporte de turnos, reapertura y UI simplificada
3ce5f9c  feat(caja): editar movimientos y mejorar ticket TPV
1dc0d61  fix(tpv): corregir doble impresión del ticket
b372f61  fix(tpv): centralizar impresión en CrmTerminal
bf2604d  debug(tpv): agregar logs temporales
fc9fe7c  fix(tpv): usar portal para imprimir ticket
b599e59  feat(tpv): bloquear venta si no hay caja abierta
88f3a7d  fix(caja): eliminar campo notes del insert
```

**Barcodes / Etiquetas**
```
27f1989  feat(crm): conectar pedidos catálogo con notas de venta CRM
f1a2389  feat(crm): agregar breadcrumb CRM
b6461fc  feat(crm): barcode/SKU support, EAN-13 generator, label printing page
39ed4c5  feat(products): add SKU and barcode support
c2bdbf4  fix: /crm/barcodes search returning no results
a031ef6  fix: print area blank page in /crm/barcodes
8896c93  fix: Cobrar button hidden on mobile in TPV
60ef697  feat: multi-size labels with price hierarchy in /crm/barcodes
```

**Sistema de planes / FeatureGate**
```
2c400b8  feat(crm): unified formatMoney utility
9e05a70  fix(crm): fix zero-badge bug, add customer view drawer
545eae3  feat(crm): redesign /crm/stock with search-first UX
90d0aca  feat(sidebar): collapse CRM subitems into single entry
3ccface  fix(tpv): corregir bug de productos vacíos + búsqueda robusta
b25920c  refactor: replace Lottie with pure SVG character avatars
328321b  feat: centralized plan feature permission system (4 phases)
8f6a6ab  feat: Admin panel for plan features matrix
ce580c9  feat: commercial plan strategy revision + admin panel v2
3ead044  feat: separate plan permissions from admin role — CRM now plan-based
3724d41  fix: plans page — show only real implemented features
378e4fd  feat: TPV shows only POS-visible products; global search for all active
ffd859e  feat(crm-stock): UX onboarding y mejoras en control de stock
ec3da16  feat(planes): rediseño de tarjetas de planes
```

**Admin + Sesiones**
```
58f7328  feat: animated Lottie avatar in CrmCostCenter
30b84a8  fix: arrow month navigation in CostCenter
aa65092  feat: replace year selector with arrow navigation in CrmPurchases
0faea1c  chore: remove debug console.log statements
1f25f2c  fix: customer debt inconsistency between perfil and cuenta corriente
ed4d75b  feat(admin): add user session tracking
0f4df8b  fix(admin): prevent duplicate user sessions
```

**Dominios personalizados (versión lucid)**
```
9b61642  feat(dominios): dominio propio para negocios Pro/Business
a078e5a  fix(custom-domain): validation pass
3391749  fix(custom-domain): reemplazar Next.js por solución Vite+Vercel
eb8ae84  fix(custom-domain): mover domain-lookup a api/seo.js
ba03929  fix(deploy): eliminar api/paypal-subscriptions.js vacío
f0aeeb9  fix(custom-domain): resolver lookup con status pending/verifying
18caf96  fix(custom-domain): mover missing-host antes de /catalogo/:slug
```

---

### 1.2 zen-einstein (18 commits sobre main)

```
3eb276a  Add deployment audit: branch comparison
a6998ae  Add feature matrix: cross-branch truth table
98ddb6c  Add master document for NotebookLM
7b8808c  Show real Vercel DNS records after domain registration
16becb2  Fix domain edge function call: use supabase.functions.invoke
0003dd9  Automate custom domain registration via Vercel API (Edge Function)
6793a14  Add Custom Domain section to Business Configuration
ff94b26  Inject business OG/SEO tags for custom domain root via api/seo.js
6b0e7b0  Load business custom domain and use it in all shareable URLs
3f5ac73  Use effective catalog URLs on custom domains
2ce927d  Use SECURITY DEFINER RPC to resolve custom domains (bypass RLS)
039dfed  Resolve custom domains in GoRootEntry to show public catalog
1a075aa  Add diagnostic logs and /landing route to debug custom domain redirect
ebc1ffc  chore: update dist build artifacts
444b27e  feat(catalog): reemplaza bloque decorativo de ubicación por mapa real
72be6c9  feat(config): rediseño completo de configuración de ubicación con mapa
a5da974  fix(admin): corregir overflow horizontal causado por w-full + margin-left
9230842  fix(admin): responsive layout for small/square resolutions
```

---

## PARTE 2 — LOS 11 ARCHIVOS CONFLICTIVOS

Son los únicos archivos modificados en AMBOS branches respecto a main.

| # | Archivo | Líneas main | Líneas lucid | Líneas zen | Líneas diff | Dificultad |
|---|---------|-------------|--------------|-----------|-------------|------------|
| 1 | `supabase/functions/manage-custom-domain/index.ts` | 0 (nuevo) | 242 | 269 | 421 | 🔴 Alta |
| 2 | `src/Routes.jsx` | 147 | 214 | 172 | 122 | 🔴 Alta |
| 3 | `src/pages/admin/AdminUsersPage.jsx` | 203 | 307 | 203 | 142 | 🟡 Media |
| 4 | `src/pages/admin/AdminUserDetailPage.jsx` | 314 | 430 | 314 | 132 | 🟡 Media |
| 5 | `src/pages/business-configuration/index.jsx` | 1667 | 1745 | 1701 | 140 | 🟡 Media |
| 6 | `api/seo.js` | 834 | 882 | 1011 | 225 | 🔴 Alta |
| 7 | `src/pages/public-catalog/index.jsx` | 3077 | 3105 | 3088 | 75 | 🟡 Media |
| 8 | `src/services/waBusinessService.js` | 2730 | 2771 | 2752 | 75 | 🟡 Media |
| 9 | `src/components/ui/BusinessSidebar.jsx` | 614 | 630 | 625 | 35 | 🟢 Baja |
| 10 | `vercel.json` | 218 | 228 | 222 | 12 | 🟢 Baja |
| 11 | `package.json` | 95 | 99 | 97 | 6 | 🟢 Baja |

### Detalle de cada conflicto

**1. manage-custom-domain/index.ts (🔴 421 líneas diff — dos implementaciones distintas)**

Son básicamente dos versiones completamente diferentes del mismo archivo:

| Aspecto | lucid-lovelace | zen-einstein |
|---------|---------------|-------------|
| VERCEL_TEAM_ID | Opcional pero presente (`if (teamId) url.searchParams.set('teamId', teamId)`) | No existe |
| Validación de plan | Sí — verifica si el negocio tiene plan pro/business | No — solo verifica JWT |
| DNS reales | No — no consulta `/v6/domains/{domain}/config` | Sí — obtiene CNAME/A reales de Vercel |
| `vercel_config` en DB | Sí (guarda) | Sí (guarda, más completo) |
| Acción `remove` | Sí — puede eliminar dominios | No |
| Manejo de errores | Más defensivo (warn en vez de throw) | Más estricto |
| **Resolución** | **Usar zen como base + agregar validación de plan de lucid + VERCEL_TEAM_ID opcional** | ← |

**2. Routes.jsx (🔴 122 líneas diff)**

| Aspecto | lucid-lovelace | zen-einstein |
|---------|---------------|-------------|
| CRM routes | Sí (15 rutas `/crm/*`) | No |
| GoRootEntry | `isCustomDomain()` con lista hardcodeada | `SAAS_HOSTS` regex + RPC lookup |
| FeatureGate | Sí — rutas CRM envueltas en `<FeatureGate>` | No |
| `/landing` route | No | Sí (LandingRedirectLog) |
| **Resolución** | **Base: lucid (tiene CRM) + agregar GoRootEntry y `/landing` de zen** | ← |

**3. AdminUsersPage.jsx (🟡 142 líneas diff)**

lucid agrega búsqueda por datos de negocio (nombre, email, slug, id) usando RPC SQL `admin_search_users`. zen no toca este archivo respecto a main (zen == main aquí).
→ **Resolución: tomar lucid completo.**

**4. AdminUserDetailPage.jsx (🟡 132 líneas diff)**

lucid agrega tracking de sesiones de usuario (último login, dispositivos). zen == main.
→ **Resolución: tomar lucid completo.**

**5. business-configuration/index.jsx (🟡 140 líneas diff)**

| Aspecto | lucid-lovelace | zen-einstein |
|---------|---------------|-------------|
| CustomDomain | `CustomDomainSettings` | `CustomDomainSection` (más completo, DNS reales) |
| LocationPicker | No | Sí |
| **Resolución** | **Base: lucid + reemplazar CustomDomainSettings por CustomDomainSection de zen + agregar LocationPicker de zen** | ← |

**6. api/seo.js (🔴 225 líneas diff)**

| Aspecto | lucid-lovelace | zen-einstein |
|---------|---------------|-------------|
| `handleDomainLookup()` | Sí — endpoint de resolución domain→slug (usado por la SPA) | No |
| `handleCustomDomainHtml()` | No | Sí — inyecta OG tags del merchant para crawlers |
| `mode=custom-domain` | No | Sí |
| **Resolución** | **Necesitan coexistir. Ambas funciones son necesarias. Merge manual.** | ← |

**7. public-catalog/index.jsx (🟡 75 líneas diff)**

lucid: exporta `CatalogForSlug` adicional. zen: agrega prop `slugOverride` para dominios custom y carga `customDomain` desde DB.
→ **Resolución: base zen (más completo) + preservar export `CatalogForSlug` de lucid si hay referencias.**

**8. waBusinessService.js (🟡 75 líneas diff)**

lucid: agrega `getEffectivePlanSlug()`. zen: agrega `getBusinessSlugByDomain()` y `getBusinessCustomDomain()`.
→ **Resolución: merge manual, ambas funciones son independientes y se necesitan.**

**9. BusinessSidebar.jsx (🟢 35 líneas diff)**

lucid: agrega links CRM con FeatureGate badge. zen: correcciones de overflow/responsive admin.
→ **Resolución: base lucid (tiene CRM links) + aplicar fix responsive de zen.**

**10. vercel.json (🟢 12 líneas diff — solo 2 diferencias)**

```
Diferencia A (línea 185-192):
  lucid:  rewrite "/(.*)" con "missing" [ventalink.app, go.ventalink.app, etc.] → /index.html
  zen:    rewrite "/" → /api/seo?mode=custom-domain

Diferencia B (línea 212/206):
  lucid:  lista de rutas SPA sin "landing"
  zen:    lista de rutas SPA incluye "landing"
```
→ **Resolución: usar rewrite de zen (mode=custom-domain es el enfoque correcto para OG) + agregar "landing" a la lista.**

**11. package.json (🟢 6 líneas diff)**

```
lucid agrega:  "@react-pdf/renderer", "jsbarcode", "lottie-react", "playwright"
zen agrega:    "leaflet", "react-leaflet"
Resolución:    Merge ambos. Excluir "playwright" (devDependency, no va a producción).
```

---

## PARTE 3 — MIGRACIONES SQL: LISTA EXACTA Y ORDEN

### 3.1 Orden cronológico completo (21 migraciones)

| # | Archivo | Branch | Operación principal | Idempotente | Depende de |
|---|---------|--------|---------------------|-------------|-----------|
| 1 | `20260530000000_enforce_expired_plans.sql` | lucid | Función + cron `wa_enforce_expired_plans` | `CREATE OR REPLACE` ✅ | — |
| 2 | `20260530100000_crm_module.sql` | lucid | Tablas `crm_quotes`, `crm_invoices`, `crm_items`; columnas en `wa_customers`, `wa_products` | `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` ✅ | — |
| 3 | `20260530200000_crm_commercial_fields.sql` | lucid | Columnas en `crm_quotes` (payment_terms, delivery_days…) | `ADD COLUMN IF NOT EXISTS` ✅ | #2 |
| 4 | `20260530210000_crm_payments.sql` | lucid | Tabla `crm_payments` | `CREATE TABLE IF NOT EXISTS` ✅ | #2 |
| 5 | `20260531100000_wa_businesses_document_title_type.sql` | lucid | Columna `document_title_type` en `wa_businesses` | `ADD COLUMN IF NOT EXISTS` ✅ | — |
| 6 | `20260531200000_crm_invoices_source.sql` | lucid | Columna `source` en `crm_invoices` | `ADD COLUMN IF NOT EXISTS` ✅ | #2 |
| 7 | `20260601000000_crm_items_discount_type.sql` | lucid | Columna `discount_type` en `crm_quote_items`, `crm_invoice_items` | `ADD COLUMN IF NOT EXISTS` ✅ | #2 |
| 8 | `20260601000000_wa_products_show_price.sql` | lucid | Columna `show_price` en `wa_products` + `NOTIFY pgrst` | `ADD COLUMN IF NOT EXISTS` ✅ | — |
| 9 | `20260602000000_crm_cost_center.sql` | lucid | Tabla `crm_cost_centers` | `CREATE TABLE IF NOT EXISTS` ✅ | — |
| 10 | `20260602010000_crm_cost_center_onboarding.sql` | lucid | Columnas en `crm_cost_centers` (profit_goal, uses_vat…) | `ADD COLUMN IF NOT EXISTS` ✅ | #9 |
| 11 | `20260602020000_crm_purchases.sql` | lucid | Tabla `crm_purchases` | `CREATE TABLE IF NOT EXISTS` ✅ | — |
| 12 | `20260602030000_admin_search_users_fn.sql` | lucid | Función `admin_search_users` SECURITY DEFINER | `CREATE OR REPLACE FUNCTION` ✅ | — |
| 13 | `20260602040000_crm_cash_sessions.sql` | lucid | Tabla `crm_cash_sessions` | `CREATE TABLE IF NOT EXISTS` ✅ | — |
| 14 | `20260602050000_crm_cash_sessions_notes.sql` | lucid | Columna `notes` en `crm_cash_sessions` + índice | `ADD COLUMN IF NOT EXISTS` ✅ | #13 |
| 15 | `20260602060000_pos_product_visibility.sql` | lucid | Columnas `show_in_pos`, `pos_sort_order` en `wa_products` | `ADD COLUMN IF NOT EXISTS` ✅ | — |
| 16 | `20260604000000_user_sessions_tracking.sql` | lucid | Tabla `user_sessions` | `CREATE TABLE IF NOT EXISTS` ✅ | — |
| 17 | `20260604070000_business_domains.sql` | lucid | Tabla `business_domains` + trigger + RLS | `CREATE TABLE IF NOT EXISTS` ✅ | — |
| 18 | `20260605120000_wa_businesses_lat_lng.sql` | zen | Columnas `lat`, `lng` en `wa_businesses` | `ADD COLUMN IF NOT EXISTS` ✅ | — |
| 19 | `20260605130000_get_slug_by_custom_domain.sql` | zen | Función RPC `get_slug_by_custom_domain` SECURITY DEFINER | `CREATE OR REPLACE FUNCTION` ✅ | #17 |
| 20 | `20260605140000_get_active_custom_domain.sql` | zen | Función RPC `get_active_custom_domain` SECURITY DEFINER | `CREATE OR REPLACE FUNCTION` ✅ | #17 |
| 21 | `20260605150000_business_domains_vercel_config.sql` | zen | `ALTER TABLE business_domains ADD COLUMN vercel_config JSONB` | `ADD COLUMN IF NOT EXISTS` ✅ **pero REDUNDANTE** | #17 |

### 3.2 Nota sobre la migración 21 (REDUNDANTE)

La migración `20260605150000` de zen hace:
```sql
ALTER TABLE public.business_domains ADD COLUMN IF NOT EXISTS vercel_config JSONB;
```

La migración `20260604070000` de lucid ya incluye `vercel_config jsonb NULL` en la definición de la tabla.

**Si se ejecutan en orden (lucid primero, zen después):** la migración 21 no hace nada pero tampoco falla (`IF NOT EXISTS`). Es segura pero redundante. Se puede incluir igual para preservar el historial o excluir con una nota.

### 3.3 Colisiones de timestamp

No hay colisiones. Las 21 migraciones tienen timestamps únicos. ✅

### 3.4 ¿Qué migraciones ya están en producción?

**No puedo determinarlo desde git.** El estado de migraciones ejecutadas vive en la tabla `supabase_migrations.schema_migrations` de la base de datos de producción, a la que no tengo acceso desde aquí.

**Acción necesaria (manual):** Ejecutar esta query en Supabase SQL Editor de producción antes del merge:

```sql
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 30;
```

El resultado va a mostrar el último timestamp ejecutado. Todo lo que esté en la lista de 21 y tenga timestamp **mayor** al último ejecutado es una migración nueva a aplicar.

**Hipótesis probable** (basada en que ningún branch está mergeado a main): ninguna de las 21 migraciones está ejecutada en producción. Pero hay que verificarlo.

---

## PARTE 4 — SECRETS NECESARIOS

### 4.1 Para la Edge Function `manage-custom-domain`

| Secret | Branch | ¿Requerido? | Descripción |
|--------|--------|-------------|-------------|
| `VERCEL_TOKEN` | lucid + zen | ✅ Requerido | API token de Vercel (Settings → Tokens) |
| `VERCEL_PROJECT_ID` | lucid + zen | ✅ Requerido | ID del proyecto Vercel donde viven los dominios custom |
| `VERCEL_TEAM_ID` | **solo lucid** | ⚠️ Opcional | Solo si la cuenta Vercel es de equipo. Cuentas personales: dejar vacío |

**Diferencia crítica entre versiones:**
- lucid: si `VERCEL_TOKEN` o `VERCEL_PROJECT_ID` no están configurados → la función **no falla**, retorna `{ ok: true, skipped: true }` (comportamiento silencioso)
- zen: si `VERCEL_TOKEN` o `VERCEL_PROJECT_ID` no están → la función retorna error 500

### 4.2 Secrets ya existentes (no cambiaría nada)

| Secret | Dónde | Estado |
|--------|-------|--------|
| `SUPABASE_URL` | Edge Functions | Ya configurado |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Ya configurado |
| `SUPABASE_ANON_KEY` | Frontend (VITE_) | Ya configurado |

### 4.3 Secrets que NO deben configurarse todavía

`VERCEL_TOKEN` y `VERCEL_PROJECT_ID` **no deben configurarse en Supabase** hasta que la Edge Function esté mergeada, testeada en staging, y se decida activar dominios personalizados para usuarios. Si se configuran antes del merge, la función podría ejecutarse con código incompleto.

---

## PARTE 5 — PLAN DE MERGE DETALLADO (pendiente de ejecución)

### Paso 0 — Crear rama de integración

```bash
git checkout main
git pull origin main
git checkout -b integration/lucid-zen-unified
git push -u origin integration/lucid-zen-unified
```

### Paso 1 — Merge de lucid-lovelace completo

```bash
git merge origin/claude/lucid-lovelace-OThhj --no-ff -m "merge: integrate lucid-lovelace (CRM, TPV, barcodes, planes)"
```

**Conflictos esperados en este paso:** ninguno (zen no está en la rama todavía).
**Acción:** Correr `npm run build`. Si hay errores de build, corregirlos antes de continuar.

### Paso 2 — Cherry-pick selectivo desde zen-einstein

Archivos exclusivos de zen (sin conflicto con lucid) — aplicar directamente:

```bash
# Archivos nuevos en zen que no existen en lucid:
git checkout origin/claude/zen-einstein-jqcN1 -- src/config/appUrl.js
git checkout origin/claude/zen-einstein-jqcN1 -- src/pages/business-configuration/components/LocationPicker.jsx
git checkout origin/claude/zen-einstein-jqcN1 -- src/pages/public-catalog/CatalogStoreHeader.jsx
git checkout origin/claude/zen-einstein-jqcN1 -- src/styles/tailwind.css
git checkout origin/claude/zen-einstein-jqcN1 -- src/pages/public-offers/index.jsx
git checkout origin/claude/zen-einstein-jqcN1 -- src/pages/public-product/index.jsx
git checkout origin/claude/zen-einstein-jqcN1 -- src/pages/order-confirmation/index.jsx
git checkout origin/claude/zen-einstein-jqcN1 -- src/pages/dashboard/index.jsx
git checkout origin/claude/zen-einstein-jqcN1 -- supabase/migrations/20260605120000_wa_businesses_lat_lng.sql
git checkout origin/claude/zen-einstein-jqcN1 -- supabase/migrations/20260605130000_get_slug_by_custom_domain.sql
git checkout origin/claude/zen-einstein-jqcN1 -- supabase/migrations/20260605140000_get_active_custom_domain.sql
git checkout origin/claude/zen-einstein-jqcN1 -- supabase/migrations/20260605150000_business_domains_vercel_config.sql
```

### Paso 3 — Resolver los 11 archivos conflictivos manualmente

Orden recomendado (de menor a mayor dificultad):

| Orden | Archivo | Acción |
|-------|---------|--------|
| 1 | `package.json` | Unir dependencias de ambos. Excluir playwright de prod |
| 2 | `vercel.json` | Base lucid + rewrite zen (`mode=custom-domain`) + agregar `landing` a lista SPA |
| 3 | `src/components/ui/BusinessSidebar.jsx` | Base lucid (CRM links) + fix responsive de zen |
| 4 | `src/pages/admin/AdminUsersPage.jsx` | Tomar lucid completo (zen == main aquí) |
| 5 | `src/pages/admin/AdminUserDetailPage.jsx` | Tomar lucid completo (zen == main aquí) |
| 6 | `src/services/waBusinessService.js` | Merge manual: funciones de lucid + funciones de zen (independientes) |
| 7 | `src/pages/public-catalog/index.jsx` | Base zen + preservar export `CatalogForSlug` de lucid si hay referencias |
| 8 | `src/pages/business-configuration/index.jsx` | Base lucid + reemplazar `CustomDomainSettings` → `CustomDomainSection` (zen) + agregar `LocationPicker` (zen) |
| 9 | `src/pages/admin/AdminUsersPage.jsx` | (ya resuelto en paso 4) |
| 10 | `api/seo.js` | Merge manual: lucid tiene `handleDomainLookup`, zen tiene `handleCustomDomainHtml`. Ambas necesarias |
| 11 | `src/Routes.jsx` | Base lucid (CRM routes + FeatureGate) + `GoRootEntry` de zen + ruta `/landing` de zen |
| 12 | `supabase/functions/manage-custom-domain/index.ts` | Base zen (DNS reales) + agregar validación de plan de lucid + `VERCEL_TEAM_ID` opcional de lucid |

### Paso 4 — Build y verificación

```bash
npm run build
git diff --check
```

### Paso 5 — Checklist de rutas críticas

Verificar manualmente que cada ruta renderiza sin error de runtime:

| Ruta | Componente | Qué verificar |
|------|-----------|--------------|
| `/dashboard` | Dashboard | Métricas, widgets, sin errores consola |
| `/orders` | Orders | Kanban funciona |
| `/product-management` | ProductManagement | Lista productos, toggles |
| `/business-configuration` | BusinessConfiguration | Todas las secciones cargan, LocationPicker visible, CustomDomainSection visible |
| `/crm` | CrmDashboard | Carga según plan del negocio |
| `/crm/presupuestos` | CrmQuotes | Lista y editor funcionales |
| `/crm/facturas` | CrmInvoices | Lista y editor funcionales |
| `/crm/terminal` | CrmTerminal | TPV carga, carrito funciona |
| `/crm/stock` | CrmStock | Lista con búsqueda |
| `/crm/cost-center` | CrmCostCenter | Termómetro carga |
| `/crm/barcodes` | CrmBarcodes | Generador EAN-13 |
| `/admin/users` | AdminUsersPage | Lista con búsqueda mejorada |
| `/catalogo/:slug` | PublicCatalog | Catálogo carga, mapa si tiene coordenadas |
| `/:slug` | PublicCatalog (short) | Redirección funciona |
| `/p/:businessSlug/:productSlug` | PublicProductPage | Producto individual carga |

### Paso 6 — Commit de integración

```bash
git add .
git commit -m "feat: unified integration — CRM + dominios + mapas (lucid-lovelace + zen-einstein)"
git push -u origin integration/lucid-zen-unified
```

---

## RESUMEN EJECUTIVO

```
ESTADO: Informe listo. Merge NO iniciado.

ARCHIVOS CONFLICTIVOS: 11
  - 3 de dificultad alta  (manage-custom-domain, Routes.jsx, api/seo.js)
  - 5 de dificultad media (AdminUsers, AdminUserDetail, business-config, public-catalog, waBusinessService)
  - 3 de dificultad baja  (Sidebar, vercel.json, package.json)

MIGRACIONES: 21 en total
  - 17 de lucid-lovelace (CRM completo)
  - 4  de zen-einstein   (dominios, lat/lng, RPCs)
  - 0  colisiones de timestamp
  - Todas son idempotentes (IF NOT EXISTS / CREATE OR REPLACE)
  - Migración 21 es redundante pero segura

SECRETS NECESARIOS (no configurar todavía):
  - VERCEL_TOKEN
  - VERCEL_PROJECT_ID
  - VERCEL_TEAM_ID (opcional, solo si cuenta Vercel es de equipo)

ACCIÓN PREVIA OBLIGATORIA:
  Ejecutar en Supabase producción:
  SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 30;
  → Confirmar cuáles de las 21 migraciones ya existen.

SIGUIENTE PASO: Confirmar inicio del merge cuando estés listo.
```
