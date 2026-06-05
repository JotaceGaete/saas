# VENTALINK — AUDITORÍA DE DESPLIEGUE
## Fecha: Junio 2026 · Branches analizados: main, lucid-lovelace, zen-einstein

---

## 1. TABLA COMPARATIVA

| Funcionalidad | main | lucid-lovelace | zen-einstein |
|---|---|---|---|
| **Catálogo público** | Sí | Sí | Sí |
| **Pedidos WhatsApp** | Sí | Sí | Sí |
| **Dashboard + métricas** | Sí | Sí | Sí |
| **Configuración de negocio** | Sí | Sí | Sí |
| **Categorías de productos** | Sí | Sí | Sí |
| **Gestión de productos** | Sí | Sí | Sí |
| **Diseño del catálogo** | Sí | Sí | Sí |
| **IA: mejora de descripción** | Sí | Sí | Sí |
| **IA: insights del negocio** | Sí | Sí | Sí |
| **Planes / Billing** | Sí | Sí | Sí |
| **Admin interno** | Sí | Sí | Sí |
| **Ubicación en catálogo (mapa real)** | No | No | Sí |
| **Selector de ubicación (LocationPicker)** | No | No | Sí |
| **OG/SEO personalizado en dominio propio** | No | Parcial | Sí |
| **Dominio personalizado — UX (config)** | No | Parcial | Sí |
| **Dominio personalizado — registro Vercel API** | No | Parcial | Sí |
| **URLs shareable con dominio propio** | No | No | Sí |
| **CRM (módulo central)** | No | Sí | No |
| **Clientes (lista CRM completa)** | No | Sí | No |
| **Presupuestos / Cotizaciones** | No | Sí | No |
| **Facturas internas / Notas de venta** | No | Sí | No |
| **TPV / Terminal de ventas** | No | Sí | No |
| **Caja diaria** | No | Sí | No |
| **Stock numérico (actual + mínimo)** | No | Sí | No |
| **Centro de costos / Salud financiera** | No | Sí | No |
| **Costos fijos** | No | Sí | No |
| **Compras / Facturas de compra** | No | Sí | No |
| **Códigos de barras / EAN-13** | No | Sí | No |
| **Etiquetas de productos** | No | Sí | No |
| **Sistema FeatureGate (acceso por plan)** | No | Sí | No |
| **Panel admin de plan features** | No | Sí | No |
| **Tracking de sesiones de usuario** | No | Sí | No |
| **Navegación mobile (MobileBottomNav)** | No | Sí | No |

---

## 2. QUÉ FUNCIONALIDADES ESTÁN SOLO EN LUCID-LOVELACE

Todo el módulo CRM completo más infraestructura nueva de planes:

### Módulo CRM (14 páginas)
- `/crm` — Dashboard CRM con métricas del negocio
- `/crm/clientes` — Lista de clientes con métricas, cards, contacto directo
- `/crm/presupuestos` — Lista + editor con PDF, líneas de productos, descuentos
- `/crm/facturas` — Notas de venta con seguimiento de pagos
- `/crm/stock` — Control de stock numérico (stock actual + stock mínimo)
- `/crm/terminal` — TPV con carrito, búsqueda, ticket térmico 58mm
- `/crm/caja` — Apertura y cierre de caja diaria
- `/crm/cost-center` — Semáforo financiero: ¿gano o pierdo hoy?
- `/crm/costos` — Registro de costos fijos mensuales
- `/crm/compras` — Registro de facturas de compra
- `/crm/barcodes` — Generador EAN-13, etiquetas multi-tamaño, impresión

### Infraestructura de planes
- `src/config/planFeatures.js` — 30+ features mapeadas por plan (starter/pro/business)
- `src/components/ui/FeatureGate.jsx` — Wrapper que bloquea/muestra features según plan
- `src/components/ui/LockedFeatureCard.jsx` — Tarjeta de feature bloqueada con CTA de upgrade
- `src/hooks/usePlanFeature.js` — Hook para verificar acceso a feature
- `src/pages/admin/AdminPlanFeaturesPage.jsx` — Panel admin para gestionar features

### UX mejorada
- `src/components/ui/PanelHeader.jsx` — Header reutilizable para todas las páginas CRM
- `src/components/MobileBottomNav.jsx` — Navegación inferior mobile
- `src/components/ui/DashboardAppShell.jsx` — Shell mejorado del dashboard
- Avatares animados con Lottie para BusinessStatusAvatar (peligro/éxito/alerta)

### Migraciones SQL (17 nuevas tablas/columnas)
```
20260530000000 — enforce_expired_plans
20260530100000 — crm_module (crm_quotes, crm_invoices, crm_items + stock en wa_products)
20260530200000 — crm_commercial_fields (campos comerciales en presupuestos/facturas)
20260530210000 — crm_payments (pagos por factura)
20260531100000 — wa_businesses_document_title_type
20260531200000 — crm_invoices_source
20260601000000 — crm_items_discount_type, wa_products_show_price
20260602000000 — crm_cost_center (gastos fijos, metas diarias)
20260602010000 — crm_cost_center_onboarding
20260602020000 — crm_purchases (facturas de compra)
20260602030000 — admin_search_users_fn
20260602040000 — crm_cash_sessions (apertura/cierre de caja)
20260602050000 — crm_cash_sessions_notes
20260602060000 — pos_product_visibility (visibilidad en TPV)
20260604000000 — user_sessions_tracking
20260604070000 — business_domains (tabla base para dominios custom)
```

---

## 3. QUÉ FUNCIONALIDADES ESTÁN SOLO EN ZEN-EINSTEIN

Todo lo relacionado con dominios personalizados completos + mapas:

### Mapas y ubicación
- `src/pages/business-configuration/components/LocationPicker.jsx` — Selector de ubicación con Nominatim + Leaflet (4 pasos: buscar → seleccionar → confirmar en mapa → guardar)
- `src/pages/public-catalog/CatalogStoreHeader.jsx` — Mapa real Leaflet en el catálogo público cuando hay coordenadas
- Migración `20260605120000_wa_businesses_lat_lng.sql` — columnas lat/lng en wa_businesses

### Dominios personalizados (capa completa)
- `src/config/appUrl.js` — `SAAS_HOST_RE`, `getEffectiveCatalogUrl()`, `getEffectiveProductUrl()`, `isCustomDomainHost()` — todas las URLs generadas usan el dominio propio si está configurado
- `src/pages/business-configuration/components/CustomDomainSection.jsx` — Sección UX completa con DNS reales de Vercel, estado, FAQ, WhatsApp soporte
- `api/seo.js` modo `custom-domain` — inyecta OG tags del merchant en dominios propios (WhatsApp preview con branding correcto)
- `supabase/functions/manage-custom-domain/index.ts` — Edge Function que llama Vercel API para registrar y verificar dominios
- RPCs `get_slug_by_custom_domain` y `get_active_custom_domain` con SECURITY DEFINER (acceso desde anon)
- `vercel.json` rewrite: `"/"` → `api/seo?mode=custom-domain` para OG en dominios propios

### Páginas que leen y propagan el dominio propio
- `src/pages/public-catalog/index.jsx` — Carga `customDomain` desde DB, lo pasa a todos los links
- `src/pages/public-offers/index.jsx` — Idem
- `src/pages/public-product/index.jsx` — Idem
- `src/pages/order-confirmation/index.jsx` — Idem
- `src/pages/dashboard/index.jsx` — Carga dominio para links de compartir

### Admin mejorado
- `AdminAuditLogPage`, `AdminBusinessDetailPage`, `AdminBusinessesPage`, `AdminConfigRubrosPage`, `AdminEmailsPage`, `AdminPaymentsPage`, `AdminUserNewPage` — páginas de admin sin overflow horizontal (fix responsive)

---

## 4. QUÉ DEBERÍA MERGEARSE PARA UNA VERSIÓN UNIFICADA

### Estrategia recomendada: tomar lucid-lovelace como base, aplicar zen-einstein encima

**Paso 1 — Base: merge lucid-lovelace → main**
Lucid tiene más cambios, más migraciones, y la infraestructura de planes. Es la base correcta.

**Paso 2 — Aplicar encima: cherry-pick de zen-einstein**
Los archivos exclusivos de zen que no existen en lucid son seguros de aplicar directamente:
- `src/config/appUrl.js` ← nuevo archivo, sin conflicto
- `src/pages/business-configuration/components/LocationPicker.jsx` ← nuevo, sin conflicto
- `src/pages/public-catalog/CatalogStoreHeader.jsx` ← nuevo, sin conflicto
- `src/styles/tailwind.css` ← verificar cambios
- `src/pages/public-offers/index.jsx`, `public-product/index.jsx`, `order-confirmation/index.jsx` ← propagan customDomain, revisar
- Migraciones `20260605120000` al `20260605150000` ← se aplican después de las de lucid

**Paso 3 — Resolver conflictos en 11 archivos comunes**

| Archivo | Conflicto | Resolución |
|---------|-----------|------------|
| `src/Routes.jsx` | Lucid tiene CRM routes + FeatureGate; zen tiene GoRootEntry custom domain | Tomar lucid como base, agregar GoRootEntry de zen |
| `api/seo.js` | Lucid tiene `handleDomainLookup()`; zen tiene `handleCustomDomainHtml()` | Necesitan coexistir — son enfoques distintos para lo mismo |
| `vercel.json` | Lucid: rewrite con `missing` para dominios custom; zen: rewrite `"/"` → `mode=custom-domain` | Zen es más correcto para OG — usar enfoque zen |
| `src/pages/business-configuration/index.jsx` | Lucid: no tiene LocationPicker; zen: tiene CustomDomainSection pero no CustomDomainSettings | Merge manual: incluir ambos componentes |
| `src/pages/public-catalog/index.jsx` | Lucid: tiene `CatalogForSlug`; zen: tiene `slugOverride` prop y carga `customDomain` | Zen es más completo — tomar zen como base |
| `src/services/waBusinessService.js` | Ambos modifican el archivo principal de servicios | Diff manual cuidadoso |
| `supabase/functions/manage-custom-domain/index.ts` | 272 líneas de diferencia | Zen es más completo (obtiene DNS reales de Vercel) — usar zen |
| `src/components/ui/BusinessSidebar.jsx` | Ambos modifican el sidebar | Lucid agrega links CRM; zen agrega links admin — merge ambos |
| `src/pages/admin/AdminUserDetailPage.jsx` | Ambos modifican | Diff para tomar lo mejor de cada uno |
| `src/pages/admin/AdminUsersPage.jsx` | Ambos modifican | Idem |
| `package.json` | Ambos agregan dependencias | Merge: lucid agrega lottie/barcode libs; zen agrega leaflet |

---

## 5. RIESGOS DEL MERGE

### Riesgo ALTO — base de datos
**El orden de migraciones importa.**
- Lucid tiene `20260604070000_business_domains.sql` que ya crea la tabla con `vercel_config` incluido
- Zen tiene `20260605150000_business_domains_vercel_config.sql` que hace `ALTER TABLE ADD COLUMN IF NOT EXISTS vercel_config`
- **Si se ejecutan las dos, la de zen falla silenciosamente** (IF NOT EXISTS lo maneja). Seguro, pero hay que saber que es redundante.
- Las RPCs de zen (`get_slug_by_custom_domain`, `get_active_custom_domain`) dependen de que la tabla `business_domains` exista → deben ejecutarse DESPUÉS de la migración de lucid.

### Riesgo ALTO — custom domain: dos implementaciones distintas
Lucid y zen implementaron dominios personalizados de forma diferente:
- **Lucid** (`api/seo.js`): endpoint `handleDomainLookup` que resuelve dominio vía query directa a `business_domains`
- **Zen** (`api/seo.js`): `handleCustomDomainHtml` que inyecta OG tags para el merchant
- **Lucid** (`Routes.jsx`): `isCustomDomain()` con lista hardcodeada de plataforma hosts
- **Zen** (`Routes.jsx`): `SAAS_HOSTS` regex + `GoRootEntry` que llama RPC vía Supabase
- El enfoque de zen es más robusto (no lista hardcodeada, usa RPC con SECURITY DEFINER)

### Riesgo MEDIO — FeatureGate en CRM
El sistema de planes de lucid usa `FeatureGate` para bloquear features.
- Las features `planned` en `planFeatures.js` (IVA, proyección financiera, multi-usuario, exportar PDF/Excel) existen en el config pero no están construidas
- Si `FeatureGate` las muestra como "próximamente" sin implementación → experiencia confusa para el usuario

### Riesgo MEDIO — waBusinessService.js modificado en ambos
Es el archivo más grande del proyecto (~1800 líneas). Ambos branches lo modificaron. Un merge automático puede mezclar funciones incorrectamente.

### Riesgo BAJO — Lottie en BusinessStatusAvatar
Lucid agrega animaciones Lottie (archivos JSON en `/public/lotties/`). Aumenta el bundle. El commit siguiente los reemplaza por SVG puro. El SVG es la versión correcta.

### Riesgo BAJO — `api/paypal-subscriptions.js`
Lucid lo elimina (archivo vacío que superaba el límite de 12 funciones de Vercel Hobby). Zen no lo toca. Al mergear, confirmar que el archivo esté eliminado.

---

## 6. QUÉ VE UN USUARIO HOY EN PRODUCCIÓN

**Producción = branch `main`.**

Un usuario que entra a `https://go.ventalink.app` hoy puede usar:

| ¿Qué puede hacer? | Disponible |
|---|---|
| Registrarse y crear un negocio | ✅ |
| Crear y editar productos con imágenes/video | ✅ |
| Organizar productos en categorías | ✅ |
| Publicar catálogo en `/catalogo/:slug` | ✅ |
| Compartir catálogo por WhatsApp con QR y link | ✅ |
| Recibir pedidos por WhatsApp | ✅ |
| Gestionar pedidos en tablero Kanban | ✅ |
| Ver dashboard con métricas y gráficos | ✅ |
| Obtener insights de IA sobre su negocio | ✅ |
| Mejorar descripciones de productos con IA | ✅ |
| Personalizar diseño del catálogo (colores, logo) | ✅ |
| Configurar método de pago, horarios, entrega | ✅ |
| Gestionar su suscripción y plan | ✅ |
| Ver ficha de cliente individual (`/customers/:id`) | ✅ (básico) |
| Ver historial de pedidos | ✅ |
| Usar dominio personalizado | ❌ |
| Ver mapa de ubicación en catálogo | ❌ |
| Acceder al CRM (presupuestos, facturas, TPV) | ❌ |
| Ver stock numérico | ❌ (solo toggle "agotado") |
| Generar códigos de barras o etiquetas | ❌ |
| Usar centro de costos / semáforo financiero | ❌ |

**En resumen**: el usuario de producción hoy tiene un catálogo online funcional con pedidos por WhatsApp y dashboard. Todo lo demás está desarrollado pero sin deployar.

---

## RESUMEN EJECUTIVO

```
LUCID-LOVELACE  →  CRM completo (11 páginas) + plan features + TPV + barcodes
ZEN-EINSTEIN    →  Dominios propios completos + mapas + OG tags + RPCs
MAIN            →  Catálogo + Pedidos + Dashboard + IA (solo lo básico)

Para una versión unificada:
  1. Merge lucid-lovelace → main  (base: CRM, planes, migraciones)
  2. Cherry-pick zen-einstein     (complemento: mapas, dominios, OG)
  3. Resolver 11 conflictos       (Routes, seo.js, vercel.json, waBusinessService)
  4. Ejecutar 21 migraciones SQL  (17 de lucid + 4 de zen, en orden)
  5. Configurar env vars Vercel   (VERCEL_TOKEN, VERCEL_PROJECT_ID)
```
