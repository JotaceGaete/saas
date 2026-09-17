# Informe técnico de estado — Walinka / VentALink

_Auditoría de código sobre el repositorio actual (rama `claude/walinka-code-audit-yrgmui`, ~200 migraciones SQL, stack React 18 + Vite + Supabase, desplegado en Vercel). No es un resumen de marketing: cada afirmación está respaldada por archivos y líneas concretas del código. Objetivo: que el equipo pueda comunicar hacia afuera con precisión y priorizar desarrollo con datos reales, no supuestos._

> **Nota de identidad de marca**: la plataforma opera bajo varios nombres/dominios según el momento del proyecto (Gong, VentALink, Walinka — `go.walinka.com`, `go.ventalink.app`, `ar.ventalink.app`, `cl.ventalink.app`, `miralatienda.de`). El código y las tablas de base de datos siguen usando el prefijo histórico `wa_` (de "WhatsApp"). El propio código documenta que la arquitectura vigente es un dominio único (`go.ventalink.app`, con país elegido dentro de la app) y que los subdominios por país (`ar.ventalink.app`, `cl.ventalink.app`) son un esquema anterior o paralelo — pero esos subdominios **siguen vivos** en whitelists de CORS de producción (`qz-sign`, `improve-product-description`), y `ar.ventalink.app` ni siquiera está en la lista de hosts de plataforma que reconoce el frontend (`src/lib/platformHosts.js`). Tres rebrandings sucesivos han dejado configuración duplicada y parcialmente contradictoria.

---

## 1. Funcionalidades implementadas

Leyenda: 🟢 **FUNCIONAL** (backend real, en producción) · 🟡 **PARCIAL** (funciona pero con huecos/bugs conocidos) · 🟠 **SOLO UI** (interfaz sin lógica de backend real, o componente huérfano) · 🔴 **NO IMPLEMENTADO**.

### 1.1 TPV / POS

| Función | Estado | Evidencia |
|---|---|---|
| Venta end-to-end en terminal (`CrmTerminal.jsx`) | 🟢 | Carrito con búsqueda por nombre/SKU/barcode/categoría; llama `createPosInvoice()` (`crmService.js:921`) → RPC atómica `crm_create_pos_sale` (`supabase/migrations/20260910220000_crm_pos_atomic_sale.sql`) |
| Transaccionalidad de la venta (stock, factura, pago, movimiento) | 🟢 | Una sola función `SECURITY DEFINER`, bloqueo `FOR UPDATE` sobre stock, idempotencia real vía `pg_advisory_xact_lock` + índice único parcial `(business_id, pos_idempotency_key)` — evita ventas duplicadas por doble clic/reintento |
| Métodos de pago (efectivo, débito, crédito, transferencia, Mercado Pago, cheque, otro) | 🟢 | Validados en la RPC y en `CHECK` de `crm_payments`; vuelto solo se calcula sobre efectivo |
| Apertura/cierre simple de caja | 🟢 | `openCashSession` / `closeCashSession` en `crmService.js` |
| Arqueo de caja por medio de pago (esperado vs. contado) | 🟢 (reciente, sep-2026) | RPC `crm_close_cash_session` (`20260915180000_crm_cash_session_reconciliations.sql`); las columnas de arqueo existían desde agosto pero **ningún código las escribía** hasta esta migración |
| Boleta/ticket impreso (térmica ESC/POS vía QZ Tray) | 🟢 | `src/lib/printing/providers/qzTrayProvider.js` + Edge Function `qz-sign` (firma JWT, clave privada solo en backend) — integración bien diseñada |
| **Boleta/factura electrónica con validez fiscal (SII Chile, AFIP Argentina)** | 🔴 | Sin rastro de integración: 0 resultados para "SII", "AFIP", "DTE", "folio electrónico" en todo el repo. Lo que se genera es un ticket/PDF interno **sin validez tributaria** |
| Anulación / reversa de una venta POS | 🔴 | Documentado explícitamente en el propio comentario del trigger de stock: "no maneja anulación/restock — eso no existe todavía" |
| Cuentas corrientes de clientes (saldo, abonos, historial) | 🟢 | `getCustomerBalance`, `registerCustomerAbono`, `getBusinessCreditSummary` en `crmService.js`; ventas a crédito exigen cliente registrado |
| Cotizaciones/presupuestos + conversión a venta | 🟢 | `CrmQuotes.jsx`/`CrmQuoteEditor.jsx`, máquina de estados `borrador → enviado → aceptado`, `convertQuoteToInvoice()` genera factura real. *Ojo*: esta conversión usa un camino de creación de facturas separado del TPV (no pasa por la RPC atómica) |
| Códigos de barra: generación e impresión de etiquetas | 🟢 | `generateUniqueBarcode` (EAN-13), `CrmBarcodes.jsx` con `jsbarcode`, 4 tamaños de etiqueta |
| Códigos de barra: lectura | 🟢 (solo lector físico USB/HID) | `findExactProduct()` matchea `barcode`/`sku`/`public_code` al tipear+Enter. No hay escaneo por cámara |
| Control de stock ligado a la venta | 🟢 | Descuento atómico + trigger con lock; productos con `stock_actual IS NULL` = sin control de stock (ilimitados) |

**Riesgo transversal**: evidencia documentada por el propio equipo de **drift de esquema entre producción y las migraciones versionadas en git** — el `CHECK` de `crm_payments_payment_method_check` "no tiene rastro en control de versiones" (comentario textual en `20260916150000_...sql`), y una migración anterior afirmó falsamente que esa columna era "TEXT libre sin CHECK en la BD". Indica cambios de esquema aplicados a mano en el SQL Editor de Supabase, fuera del flujo de migraciones. También hubo un bug real en producción documentado en las mismas migraciones: una venta con "Débito" devolvía `400 INVALID_PAYMENT` porque el vocabulario server-side de la RPC no se había actualizado cuando el frontend agregó nuevos métodos de pago.

### 1.2 Catálogo público

| Función | Estado | Evidencia |
|---|---|---|
| Catálogo por slug (`/catalogo/:slug`, `/catalog/:slug`, `/:slug`) | 🟢 | SPA con React Router; `getBusinessBySlug` + `getPublicProducts` |
| Categorías, búsqueda y filtros de precio | 🟢 (100% client-side) | Todo el catálogo se descarga de una vez y se filtra en memoria; sin búsqueda server-side ni paginación — no escala bien para catálogos grandes |
| Stock visible en el catálogo | 🔴 | Flag `showStock` en la UI sin campo real de stock consumido desde el servicio público — placeholder |
| Imágenes múltiples por producto (hasta 5) | 🟢 | `ImageUploadSection.jsx` |
| Variantes de producto con precio/stock por combinación (talla, color) | 🟠 | `VariantManager.jsx` tiene UI completa pero **está huérfano: no se importa en ningún otro archivo del repo**. Código muerto |
| Opciones de producto (texto libre) | 🟢 (limitado) | Solo booleano `has_options` + texto libre `options_description` — sin SKU ni precio por variante |
| Carga masiva de productos (CSV/Excel) | 🔴 | Sin ninguna referencia a CSV/XLSX/PapaParse; carga es producto por producto |
| Templates de catálogo (temas visuales) | 🟡 | Solo paletas de color (light/dark/pastel); no cambia estructura ni layout |
| Templates de catálogo (biblioteca de productos demo por rubro) | 🟡 | Solo 2 templates sembrados (Ropa, Restaurante); editables **solo por admins de Walinka** — el dueño del negocio no puede crear/editar los suyos; la fase que conecta esto al onboarding real no está implementada |

### 1.3 WhatsApp-native ordering

| Función | Estado | Evidencia |
|---|---|---|
| Pedido persistido en BD (`wa_orders`/`wa_order_items`) desde el checkout | 🟢 | `createOrder()` valida límites de plan antes de insertar |
| Envío del pedido por WhatsApp | 🟢 pero **solo deep-link `wa.me`** | Se abre `https://wa.me/{numero}?text=...` tras crear el pedido — el cliente debe presionar "enviar" desde su propio WhatsApp |
| Integración con WhatsApp Business API / bot / respuestas automáticas | 🔴 | Búsqueda exhaustiva sin resultados en todo el repo. El nombre "WhatsApp-native" describe más de lo que hay: no hay servidor que envíe o reciba mensajes de WhatsApp |
| Caso especial: negocio con Mercado Pago conectado | 🟡 | El botón "Consultar por WhatsApp" en ese flujo **no llama a `createOrder()`** (comentario explícito en el código) — no crea el pedido en BD, no toca stock |

### 1.4 Dominios propios

| Elemento | Estado | Evidencia |
|---|---|---|
| Autoservicio: cliente ingresa su dominio, ve instrucciones DNS | 🟢 | `CustomDomainSettings.jsx`, solo en planes Pro/Business |
| Alta automática del dominio en Vercel vía API | 🟢 (con punto de falla silenciosa) | `manage-custom-domain/index.ts` llama a la API de Vercel en el mismo request. **Si faltan los secrets `VERCEL_TOKEN`/`VERCEL_PROJECT_ID`, la función responde éxito (`skipped: true`) sin agregar el dominio real** — el cliente configura DNS correctamente y el sitio nunca resuelve, sin que la UI lo distinga de una demora de propagación |
| Verificación de estado del dominio | 🟡 (manual, "pull") | Botón "Verificar dominio"; sin polling automático ni webhook |
| Emisión de certificado SSL | 🟢 (delegado a Vercel) | Automático una vez el dominio está agregado al proyecto y el DNS resuelve — sin código propio |
| Verificación de propiedad real del dominio (TXT challenge) | 🔴 | Solo se valida sintaxis + que el dominio no esté tomado por otro negocio. La protección real la aporta Vercel, no este código |
| Enrutamiento en runtime por dominio custom | 🟢 | `vercel.json` reescribe a `index.html` → `Routes.jsx` detecta `isCustomDomain()` → resuelve el slug vía `/api/seo?mode=domain-lookup` |

**Clasificación global: PARCIALMENTE AUTOMATIZADO.** Autoservicio real de cara al cliente, pero con un punto de falla silenciosa dependiente de configuración de secrets, y sin verificación de propiedad propia.

### 1.5 SEO de la plataforma

| Aspecto | Estado | Evidencia |
|---|---|---|
| Renderizado | 🔴 CSR puro | Sin Next.js/Remix/SSR real; SPA Vite. Hay una capa de "meta-SSR" solo para el `<head>` (ver abajo); el `<div id="root">` sigue vacío hasta que React hidrata |
| Metadata dinámica (title/description por tienda y producto) | 🟢 | Doble vía: servidor (`api/seo.js`) y cliente (`react-helmet`) |
| Endpoint SEO servidor (`api/seo.js`, sirve HTML con `<head>` completo a todo visitante, sin user-agent sniffing) | 🟢 | Más robusto que cloaking por sniffing; pero `docs/OG-PREVIEW.md` describe una arquitectura de Edge Middleware que **ya no existe en el repo** — documentación desactualizada |
| Open Graph / Twitter Cards / imagen OG dinámica | 🟢 | `api/og-catalog.js` genera PNG 1200×630 server-side |
| Sitemap dinámico por tienda | 🟡 | Solo incluye la URL de catálogo de cada tienda, nunca productos individuales |
| **Riesgo no verificado**: `public/sitemap.xml` estático (con comentario propio admitiendo ser un placeholder obsoleto de 1 URL) convive con el rewrite dinámico a `/api/seo?mode=sitemap`. El comportamiento por defecto de Vercel puede priorizar el archivo estático sobre el rewrite — riesgo real de que Google solo vea 1 URL, a confirmar con `curl` contra producción | 🔴 riesgo abierto | `vercel.json` + `public/sitemap.xml` |
| `robots.txt` | 🟢 | Correcto: bloquea rutas privadas, permite `/catalogo/`, declara el sitemap |
| Structured data `LocalBusiness` (negocio) | 🟢 | JSON-LD presente server- y client-side |
| **Structured data `Product`/`Offer` (producto individual)** | 🔴 | Ausente por completo — sin esto, Google no puede mostrar precio/disponibilidad en resultados de búsqueda para el activo de mayor valor comercial: los productos |
| Canonical tags (contenido, mismo dominio) | 🟢 | `/catalog/:slug` y `/catalogo/:slug` consolidan correctamente |
| **Canonical tags en dominios propios de clientes** | 🔴 **hallazgo crítico** | `CATALOG_ORIGIN` es una constante global hardcodeada (`miralatienda.de`). Una tienda con dominio propio funcionando correctamente **declara en su propio HTML que la URL canónica es `miralatienda.de/catalogo/:slug`**, no su dominio — anula gran parte del valor SEO de tener dominio propio |
| Core Web Vitals / code splitting | 🔴 | `Routes.jsx` importa estáticamente ~75 páginas (dashboard, CRM completo, admin, billing) en un único árbol, **sin un solo `React.lazy()`**. Un visitante anónimo del catálogo carga en el mismo grafo de bundling el JS de todo el panel administrativo |
| Lazy loading de imágenes | 🟡 | Solo 2 ocurrencias de `loading="lazy"` en el catálogo público; no aplicado sistemáticamente |
| CDN de imágenes | 🟢 | Cloudflare R2 en vez de Supabase Storage directo |

### 1.6 CRM

| Función | Estado | Evidencia |
|---|---|---|
| Ficha de cliente (contacto, métricas, historial de compras) | 🟢 | `src/pages/customers/index.jsx`, `getCustomer`/`getCustomerOrders` |
| CRUD de clientes con notas internas | 🟢 | `CrmCustomers.jsx` — nombre, RUT, teléfono, WhatsApp, email, dirección, notas libres |
| Cuenta corriente integrada en la ficha de cliente | 🟢 | `getBusinessCreditSummary`, `getCustomerPendingInvoices`, `registerCustomerAbono` |
| Segmentación / tags de clientes | 🔴 | Sin campo de tags/segmento en ningún lado del módulo |
| Campañas de marketing (email/WhatsApp masivo) | 🔴 | No existe |
| Pipeline comercial / seguimiento estructurado (oportunidades, recordatorios) | 🔴 | "Notas" es solo un textarea libre, no un sistema de actividades/tareas |

**Conclusión**: es un módulo de clientes con ficha + cuenta corriente + notas, no un CRM con pipeline, segmentación ni campañas — vale la pena ajustar expectativas de marketing sobre el término "CRM".

### 1.7 Gestión de gastos y costos

| Función | Estado | Evidencia |
|---|---|---|
| Costos fijos (arriendo, sueldos, servicios, software, impuestos, insumos, otros) | 🟢 | `CrmCostos.jsx`, CRUD completo vía `crmService.js` |
| Gastos variables desde caja (salidas de efectivo) | 🟢 | Se agregan automáticamente como `source: 'cash_outflow'`, bloqueados para edición directa fuera de caja |
| "Termómetro del negocio" — snapshot de rentabilidad diaria | 🟢 | `CrmCostCenter.jsx`: combina ventas + costos fijos prorrateados por día operativo + gastos variables + compras a proveedor; semáforo Rentable/Equilibrio/Bajo equilibrio/Cerrado por día |
| Proveedores y facturas de compra | 🟢 | `wa_supplier_invoices` (rediseño reciente que deriva estado/saldo de una vista sobre `wa_supplier_payment_allocations`, evitando inconsistencias); `src/pages/suppliers/` con estado de salud (Al día/Con deuda/Vencido) y registro de pagos |

### 1.8 Estadísticas / reportes

| Función | Estado | Evidencia |
|---|---|---|
| Dashboard con ventas por día, ingresos, top productos, embudo de conversión, uso de plan | 🟢 | `src/pages/dashboard/` |
| Insights con IA sobre ventas del día | 🟢 | Edge Function `dashboard-ai-insights` — hallazgo/alerta/acción/prioridad vía LLM |
| Resumen diario detallado (ventas, dinero por método de pago, gastos, caja, inventario, rentabilidad) | 🟢 | `CrmResumenDia.jsx` (890 líneas) — capa de presentación pura que no recalcula nada, garantizando consistencia pantalla/PDF |
| Exportación a PDF (resumen diario, facturas, presupuestos) | 🟢 | `react-pdf` |
| Exportación a Excel/CSV | 🔴 | Sin ninguna librería de exportación tabular (`xlsx`/`exceljs`/`papaparse`) en el proyecto |

### 1.9 Multi-tenant / multi-negocio

**No existe multi-negocio por usuario: el modelo es estrictamente 1 usuario = 1 negocio.**

- `getMyBusiness()` (`waBusinessService.js:596-621`) consulta `wa_businesses` por `user_id`, ordena por `created_at ASC` y aplica `.limit(1).maybeSingle()` — **toma solo el negocio más antiguo** si existiera más de uno, y **no expone los demás**.
- `wa_businesses.user_id` **nunca tuvo constraint `UNIQUE`** (confirmado en la migración de creación y en comentarios de al menos 3 migraciones posteriores que documentan el hecho explícitamente).
- **No hay ningún selector/switch de negocio en la UI** para el usuario final.
- **Implicación de producto**: un cliente con 2 sucursales o 2 marcas necesita **2 cuentas de usuario separadas** (2 emails distintos). Si por un bug de onboarding llegaran a crearse 2 negocios bajo el mismo `user_id`, el segundo queda huérfano e inaccesible desde la UI normal — el mismo mecanismo que "soluciona" el bug de duplicados (sección 2) es, a la vez, la razón por la que el multi-negocio no es viable hoy sin rediseño.

### 1.10 Aislamiento de datos entre tenants (RLS)

La gran mayoría de tablas de negocio (`wa_businesses`, `wa_products`, `wa_orders`, `crm_invoices`, `crm_quotes`, `crm_stock_movements`, `crm_cash_movements`, `wa_supplier_invoices`, etc.) tienen RLS habilitado correctamente.

**Hallazgo de seguridad — 4 tablas sin `ENABLE ROW LEVEL SECURITY` encontrado en ninguna migración**:
- `public.billing_subscriptions` — contiene `business_id`, `plan_slug`, `amount`, `status`, fechas de facturación por negocio.
- `public.billing_webhook_events` — payloads crudos de webhooks de billing.
- `public.paypal_webhook_events` — payloads de eventos PayPal.
- `public.wa_lifecycle_events` — tiene `business_id`/`user_id`, sin RLS propia (solo una vista encima, que hereda permisos).

Esto contrasta con el patrón que el propio equipo usa en otras tablas sensibles del mismo dominio (ej. `wa_mp_connections`, con comentario explícito: "RPC-only desde el cliente... sin GRANT de tabla a ningún rol"), patrón que **no se aplicó** a estas 4 tablas. Si los privilegios por defecto del proyecto Supabase otorgan `SELECT` a `authenticated` (patrón común salvo que se hayan revocado explícitamente), **cualquier usuario autenticado podría leer datos de suscripción/facturación de otros negocios** llamando directo a `supabase.from('billing_subscriptions').select('*')` desde el cliente. **Es el hallazgo de seguridad más relevante de esta auditoría** y amerita verificación inmediata (vía `get_advisors` de Supabase o revisión manual de `GRANT`/`REVOKE`).

### 1.11 Pagos (Mercado Pago, PayPal) — qué está conectado y qué falta

Hay **tres sistemas de pago distintos** en el repo que conviene no confundir:

**A) Mercado Pago OAuth marketplace — tenant cobra a su cliente final en el catálogo.** 🟢 **EN PRODUCCIÓN Y FUNCIONAL.** Cada negocio conecta su propia cuenta de MP vía OAuth 2.0 + PKCE (`mp-oauth-start`/`mp-oauth-callback`, credenciales separadas por país `MP_CLIENT_ID_CL`/`MP_CLIENT_ID_AR`, resueltas siempre server-side desde `wa_businesses.country_code`, nunca desde el frontend). El checkout del catálogo público (`create-merchant-mp-checkout`) usa el token del propio comercio, cobra una comisión marketplace del 1% (`computeWalinkaMarketplaceFee`), y el webhook (`merchant-mp-webhook`) revalida siempre contra la API de MP en vez de confiar en el payload. Diseño robusto: idempotencia, validación de monto/moneda/`external_reference`. Limitación conocida y documentada en el propio código: las `back_urls` del checkout usan el dominio canónico de Walinka, no el dominio propio del comercio.

**B) Billing SaaS — Walinka cobra la suscripción a sus tenants.** 🟢 **FUNCIONAL para CL/AR (Mercado Pago)**, 🟡 **CONECTADO CON LIMITACIONES para el resto del mundo (PayPal)**.
- CL y AR: `create-mp-preference` + `mp-webhook`, con credenciales de plataforma (`MP_ACCESS_TOKEN_CL`/`MP_ACCESS_TOKEN_AR`, distintas de las OAuth del punto A). Incluye trial de 14 días, prorrateo real en upgrade (crédito por días restantes) y downgrade programado para el fin del período pagado (no inmediato).
- Resto de países: PayPal (`api/paypal.js`, `backend/src/services/paypal/`) — suscripciones mensuales con planes Pro/Full, verificación de firma de webhook, idempotencia por `event_id`. Código completo y bien estructurado, pero **no se pudo confirmar desde el repo que las credenciales de producción (`PAYPAL_CLIENT_ID/SECRET/WEBHOOK_ID`) estén efectivamente cargadas** — si no lo están, el sistema cae a un proveedor `manual`.
- **Contradicción documental relevante**: `docs/BILLING_AUDIT.md` y `docs/BILLING_DELIVERABLES.md` (documentación "oficial" del proyecto) describen un modelo con LemonSqueezy y "fuera de Chile: activación manual + WhatsApp" que **ya no corresponde al código actual** — PayPal reemplazó ese estado sin que la documentación se actualizara. Además `src/config/paymentProvider.js` es un archivo legacy que sigue en el repo (usado por 2 archivos) y contradice directamente a `src/lib/billing/*`, que es la fuente de verdad real.

**C) Mercado Pago Point (cobro en terminal física desde el POS).** 🔴 **NO EXISTE.** Búsqueda exhaustiva en todo el repo (frontend, backend, Edge Functions) sin ningún resultado relacionado con dispositivos Point. Ver detalle y plan de trabajo en sección 3.a.

**D) dLocal.** 🟡 **PARCIALMENTE ELIMINADO — con riesgo residual real, no solo código muerto inofensivo.** La documentación (`docs/LIMPIEZA_DLOCAL_GO_INFORME.md`) afirma limpieza completa, y es cierto que las Edge Functions de Supabase (`create-dlocal-checkout`, `dlocal-webhook`) sí son stubs 410. **Pero el código paralelo en Vercel/`backend/` sigue activo y desplegado**: `api/billing.js` registra rutas reales (`/api/v1/billing/dlocal/checkout`, `/api/v1/billing/webhooks/dlocal`) que llegan a controladores funcionales en `backend/src/services/providers/dlocal/` (893 líneas de código), y además existen archivos legacy independientes (`api/billing-dlocal-callback.js`, `api/billing-dlocal-webhook.js`) también activos — este último **actualiza `wa_payments` y activa planes cuando recibe `status: 'PAID'`, sin verificación de firma visible en el archivo**, a diferencia del webhook de PayPal. La creación de *nuevos* checkouts sí está bloqueada (`isDlocalFeatureEnabled()` devuelve `false` hardcodeado, con fallback a PayPal), pero los webhooks siguen siendo una superficie alcanzable. Requiere limpieza real, no solo desactivar la creación de checkouts nuevos.

---

## 2. Deuda técnica

- **Bug de duplicados en `wa_businesses` — sigue sin resolverse de raíz.** `user_id` nunca tuvo constraint `UNIQUE`. En vez de corregir el esquema, el código lo parchea defensivamente en al menos 3 lugares: `getMyBusiness()` (comentario explícito: "Orden + limit defensivo... esta consulta devuelve la más antigua sin explotar"), el sistema de referidos y la conexión OAuth de Mercado Pago ("se toma el más antiguo"). El trigger de creación de negocio previene duplicados *nuevos* comprobando existencia antes de insertar, pero no hay backfill que elimine/fusione duplicados históricos, y nada impide que una inserción fuera del trigger (ej. Edge Function con `service_role`) cree uno nuevo. Es, además, la misma razón estructural por la que hoy no es viable el multi-negocio por usuario (sección 1.9).
- **Riesgo de seguridad: 4 tablas de billing/eventos sin RLS** (`billing_subscriptions`, `billing_webhook_events`, `paypal_webhook_events`, `wa_lifecycle_events`) — ver detalle y por qué es potencialmente explotable en la sección 1.10. Verificar con prioridad.
- **Riesgo residual de dLocal**: webhooks activos y alcanzables en producción (`api/billing-dlocal-webhook.js`) sin verificación de firma visible, pese a que la documentación dice que la integración fue "eliminada". Ver 1.11.d.
- **Sin CI real.** Los únicos GitHub Actions (`.github/workflows/`) son dos jobs de backup programado de Supabase a R2. Ningún workflow corre tests, lint o build en cada PR — los ~117 archivos de test existentes no se ejecutan automáticamente antes de mergear.
- **Sin linter configurado.** No hay `.eslintrc*` ni `eslint.config.*` en el repo.
- **Drift de esquema entre producción y migraciones versionadas**, documentado por el propio equipo en comentarios de migración (constraints/columnas vivas en producción sin migración en git) — compromete reproducibilidad y rollback confiable.
- **Límites de plan (productos activos, pedidos/mes) validados solo en frontend.** Las funciones RPC `wa_check_product_limit`/`wa_check_order_limit` existen pero no están conectadas a ningún trigger — nada impide saltarse el límite del plan Free llamando directo a la API.
- **Doble/triple fuente de verdad para precios y proveedores de pago.** Límites de plan duplicados entre SQL y `src/constants/plans.js`; hay al menos un archivo de configuración de proveedor de pago (`src/config/paymentProvider.js`) que es legacy y contradice la fuente actual (`src/lib/billing/*`), y sigue siendo importado por 2 archivos activos. Bug documentado de moneda incorrecta mostrada al usuario (`docs/BILLING_AUDIT.md`: "5990 CLP mostrado como USD").
- **Plan legado "control" con residuos en lógica de prorrateo**, con riesgo de generar créditos heredados incorrectos si el mapeo `control → starter` no se aplica antes del cálculo en todas las Edge Functions relevantes.
- **Sin panel real de gestión de usuarios** (solo de negocios, vía JOIN a `auth.users`) — sin UI para crear/editar/suspender/eliminar un usuario ni asignar/quitar rol admin.
- **Componentes huérfanos / código muerto.** `VariantManager.jsx` (gestión de variantes de producto) tiene UI completa pero no está conectado a ningún flujo real.
- **Emails transaccionales apagados por flag en producción** (`EMAIL_AUTOMATION_ENABLED=false`, `PAYMENT_EMAILS_ENABLED=false` por defecto) — el sistema existe en código pero su estado real en producción depende de secrets no verificables desde el repo.
- **Documentación interna desactualizada respecto al código real, en varios casos de forma significativa**: `docs/OG-PREVIEW.md` describe un Edge Middleware que ya no existe; `docs/BILLING_AUDIT.md`/`docs/BILLING_DELIVERABLES.md` describen un modelo de pagos (LemonSqueezy, "manual + WhatsApp" fuera de Chile) que PayPal ya reemplazó en el código sin que la documentación se actualizara. Esto es un riesgo real de que se tomen decisiones de negocio o de desarrollo sobre información obsoleta.
- **Inconsistencia de hosts de plataforma reconocidos.** `ar.ventalink.app` no está en `src/lib/platformHosts.js` pero sí lo reconoce genéricamente `src/config/appUrl.js` — dos fuentes de verdad desalineadas para la misma decisión (¿es un dominio de plataforma o un dominio custom de cliente?).
- **Deuda de SEO específica** (detalle en 1.5 y 3.d): sin code splitting, sin `Product`/`Offer` schema.org, canonical roto en dominios custom, sitemap sin URLs de producto y con riesgo de conflicto contra un archivo estático obsoleto.
- **Catálogo público sin paginación ni búsqueda server-side** — todo el catálogo se descarga completo y se filtra en memoria.
- **Sin carga masiva de productos** (CSV/Excel) — barrera de adopción real para comercios con catálogos grandes migrando desde otra plataforma.
- **Sin exportación a Excel/CSV** en ningún reporte — solo PDF.

---

## 3. Funciones faltantes / incompletas — PRIORIDAD ALTA

### a) Integración con Mercado Pago Point (cobro automático en la máquina desde el POS)

**No existe ningún código relacionado.** Búsqueda exhaustiva en frontend, `backend/src` y `supabase/functions` de "Point", terminal física, SDK/API de dispositivos Mercado Pago Point: cero resultados. Lo único parecido hoy es registrar manualmente en el TPV que "se pagó con Mercado Pago" (probablemente por otro medio, como el link de cobro o la app del comerciante) — **no dispara ningún cobro real en un dispositivo**.

Lo que sí existe y es reutilizable: la infraestructura OAuth por negocio (MP OAuth marketplace, sección 1.11.A) ya obtiene y guarda de forma segura el `access_token` de cada comercio — ese es el mismo token que se necesitaría para hablar con la API de dispositivos Point.

**Qué se necesita construir end-to-end**:
1. Registrar el/los dispositivo(s) Point del comerciante (`POST /point/integration-api/devices` de la API de Mercado Pago) y persistir su `device_id` asociado al `business_id` (nueva tabla o columna).
2. Al cerrar una venta en `CrmTerminal.jsx` con método "Mercado Pago Point": nueva Edge Function que cree una orden de cobro en el dispositivo (`POST /point/integration-api/devices/{device_id}/payment-intents`) con el monto de la venta, usando el `access_token` ya conectado.
3. Resolver el resultado del cobro de forma asíncrona: vía webhook (reutilizando el patrón ya probado en `merchant-mp-webhook`) o polling del `payment-intent`.
4. Solo tras confirmación aprobada, cerrar la venta en `crm_create_pos_sale` — o extender esa RPC para aceptar un estado "pendiente de confirmación de terminal" resuelto luego por el webhook.
5. Manejo de errores del dispositivo (fuera de línea, cobro rechazado o cancelado desde el propio Point) y reintentos.

Complejidad media-alta: no es un endpoint simple, requiere manejar el ciclo de vida asíncrono del cobro físico y decidir qué pasa con el estado de la venta mientras se espera esa confirmación.

### b) Activación completa del servicio para Argentina

**Lo que funciona hoy para tenants argentinos:**
- **Cobro de la suscripción SaaS en ARS vía Mercado Pago**: funcional end-to-end (`create-mp-preference` con catálogo `PLAN_CATALOG_AR`, token dedicado `MP_ACCESS_TOKEN_AR`, webhook que resuelve el token por país).
- **Cobro del comercio a sus propios clientes finales**: funcional vía el mismo OAuth marketplace (credenciales `MP_CLIENT_ID_AR`/`MP_CLIENT_SECRET_AR` separadas de CL, sin fallback entre países).
- **Onboarding**: AR está completamente habilitado en `country-select` (moneda ARS, locale es-AR, prefijo +54) y en `countryPricing.js` con `marketStatus: ACTIVE` — no es un país "próximamente", está al mismo nivel que Chile.

**Lo que está bloqueado o incompleto:**
- **Facturación electrónica AFIP**: no existe ninguna integración (cero resultados de "AFIP" en el repo) — ni para el billing SaaS ni para las ventas de los tenants vía POS/CRM.
- **IVA / motor de impuestos argentino**: no hay lógica de cálculo de IVA; el único campo "tax_included" encontrado es de facturas de compra a proveedor (uso interno del comercio), no un motor fiscal.
- **Inconsistencia de infraestructura de dominio**: la documentación describe `ar.ventalink.app` como dominio propio del mercado argentino, pero el propio código actual dice explícitamente que "CL/AR también están soportados, pero no se usan subdominios por mercado: todo vive en `go.ventalink.app`" — sin embargo `ar.ventalink.app` sigue apareciendo en whitelists de CORS de Edge Functions en producción. Vale la pena decidir y limpiar cuál es la arquitectura vigente.

**Qué se necesitaría para dejarlo 100% operativo**: el bloqueador real no es de pagos (esa parte funciona) sino de **cumplimiento fiscal**: sin facturación electrónica AFIP ni IVA, un tenant argentino puede cobrar y operar el POS, pero no puede emitir comprobantes con validez fiscal ante AFIP desde la plataforma — la misma brecha que existe para Chile con el SII (sección 1.1).

### c) Dominios propios — qué falta para conexión 100% sin intervención manual

1. **Eliminar el fallo silencioso** cuando faltan los secrets de Vercel: hoy reporta éxito falso; debería fallar explícitamente y dejar un estado `error` visible en vez de un `pending` indistinguible de una demora normal de DNS.
2. **Verificación automática periódica** (hoy es solo "pull" manual al presionar un botón) en vez de depender de que el negocio vuelva a revisar el panel.
3. **Verificación de propiedad real del dominio** (TXT challenge propio) antes de aceptar el registro.
4. Notificar al negocio (email/WhatsApp) cuando su dominio pasa a `active`.

### d) SEO — qué falta para que los catálogos posicionen bien (por tienda y por producto)

En orden de impacto esperado:
1. **Corregir el canonical en dominios propios** — usar el host real de la petición en vez de la constante `CATALOG_ORIGIN`; es el fix de mayor impacto y menor esfuerzo relativo.
2. **Resolver el posible conflicto entre `sitemap.xml` estático y el dinámico** — verificar contra producción y, si aplica, eliminar el archivo estático obsoleto.
3. **Agregar URLs de producto individual al sitemap** (hoy solo lista catálogos de tienda).
4. **Agregar structured data `Product`/`Offer`** en las páginas de producto — hoy solo existe `LocalBusiness`; sin esto no hay rich snippets de precio/disponibilidad para productos.
5. **Code splitting del bundle público** — hoy el catálogo (única superficie vista por bots y usuarios anónimos) carga en el mismo grafo de build que todo el panel administrativo, sin `React.lazy()`. Impacta directamente Core Web Vitals, señal de ranking de Google.
6. Lazy loading sistemático de imágenes en el grid de productos.
7. Evaluar SSR/SSG real (o pre-renderizado de las páginas de producto más visitadas) para no depender de que Googlebot complete su segundo pase de renderizado JS, y para que crawlers que no ejecutan JS (relevante para varios bots de redes sociales y algunos casos de Bing) vean contenido real, no solo el `<head>`.

---

## 4. Resumen ejecutivo

### Lo que se promete vs. lo que realmente funciona hoy

| Se promete | Realidad en el código | Veredicto |
|---|---|---|
| TPV completo con boletas | Venta, caja, arqueo, stock y pagos múltiples funcionan de verdad con backend transaccional sólido. La "boleta" es un ticket térmico interno **sin validez fiscal** (sin SII ni AFIP) | Fuerte en operación, débil en cumplimiento tributario — comunicar como "ticket de venta", no "boleta electrónica" |
| Catálogo público con templates | Catálogo funcional; "templates" son solo paletas de color + 2 packs de productos demo editables únicamente por el equipo interno, sin layouts alternativos ni self-service para el comerciante | Sobreprometido en el uso de la palabra "templates" |
| Dominios propios (`go.walinka.com` y dominios de clientes) | El flujo self-service funciona en el caso feliz, pero con un punto de falla silenciosa (secrets de Vercel) y, más grave, **el SEO de un dominio propio queda anulado** por un canonical mal configurado | El dominio "funciona" para servir contenido, pero no aporta el valor SEO que un cliente esperaría de tenerlo |
| SEO optimizado del catálogo | Metadata dinámica y OG están bien resueltos; falta schema de producto, el sitemap no cubre productos (con riesgo de estar roto por un archivo estático viejo), y el bundle sin code splitting perjudica Core Web Vitals | Base sólida, lejos de "optimizado" |
| Pedidos por WhatsApp ("WhatsApp-native") | Es un enlace `wa.me` (click-to-chat) tras guardar el pedido en BD, no una integración con la API de WhatsApp Business ni un bot | El pedido sí se registra; el canal no está automatizado — "nativo" es un término engañoso |
| Cuentas corrientes y cotizaciones | Ambas funcionan de verdad, con conversión de cotización a venta | Cumple lo prometido |
| CRM | Ficha de cliente + cuenta corriente + notas libres, real y funcional. Sin segmentación, campañas ni pipeline comercial | Es un módulo de clientes, no un CRM en el sentido de herramienta comercial/marketing |
| Gestión de gastos y estadísticas/reportes | Costos fijos/variables, termómetro de rentabilidad, proveedores, dashboard y resumen diario: todo funcional con datos reales. Sin exportación a Excel/CSV | Cumple lo prometido, con un hueco de exportación |
| Multi-negocio / multi-tenant | **No existe multi-negocio por usuario** — 1 usuario = 1 negocio por diseño actual (`getMyBusiness` toma solo el más antiguo si hay más de uno) | Un cliente con varias sucursales necesita varias cuentas separadas hoy |
| Pagos: Mercado Pago (comercio → cliente final) | Funcional y bien diseñado (OAuth marketplace, comisión, webhook con revalidación) | Cumple lo prometido |
| Pagos: Mercado Pago (billing SaaS CL/AR) | Funcional, con trial y prorrateo reales | Cumple lo prometido |
| Pagos: PayPal (billing SaaS, resto del mundo) | Código completo, pero la documentación oficial del proyecto no lo refleja y no se pudo confirmar que las credenciales de producción estén cargadas | Probablemente funcional, pero no verificable con certeza desde el repo — validar en el entorno real |
| Cobro automático en máquina Mercado Pago Point desde el POS | **No existe ningún código.** Se registra manualmente que "se pagó con MP" | No comunicar como disponible — es un desarrollo end-to-end completo |
| Activación para Argentina | Cobro en ARS (suscripción y ventas del comercio) funcional; onboarding completamente habilitado | Falta cumplimiento fiscal (AFIP/IVA), igual que Chile con el SII |

### Riesgos que ameritan atención inmediata (no solo desarrollo — también auditoría de datos y comunicación con clientes actuales)

1. **Seguridad**: verificar con prioridad si `billing_subscriptions`, `billing_webhook_events`, `paypal_webhook_events` y `wa_lifecycle_events` están realmente expuestas sin RLS a usuarios autenticados — es el hallazgo más grave de esta auditoría y puede resolverse rápido si se confirma.
2. **Seguridad/limpieza**: los webhooks de dLocal siguen activos en producción sin verificación de firma visible, pese a que la integración se documentó como "eliminada" — cerrar esa superficie.
3. **SEO**: cualquier cliente con dominio propio activo probablemente está perdiendo valor SEO por el bug de canonical — corregible rápido y de alto impacto.
4. **Producto**: el fallo silencioso en alta de dominios (secrets de Vercel faltantes) puede estar dejando a algún cliente con "dominio conectado" en la UI que nunca sirve contenido — vale la pena auditar los dominios en estado `pending`/`verifying` de larga data.
5. **Ingresos**: los límites de plan (Free: 10 productos, 30 pedidos/mes) son bypasseables técnicamente llamando la API directo — no es una vulnerabilidad de datos, pero sí una fuga de ingresos potencial.
6. **Datos**: el bug de duplicados en `wa_businesses` sigue sin solución de raíz (solo mitigaciones puntuales) — cualquier código nuevo que consulte esa tabla por `user_id` sin el mismo patrón defensivo puede fallar o mostrar datos incorrectos.
7. **Documentación**: al menos 3 documentos internos "oficiales" (`BILLING_AUDIT.md`, `BILLING_DELIVERABLES.md`, `OG-PREVIEW.md`) describen arquitecturas que ya no existen en el código — riesgo de que se tomen decisiones de negocio sobre información obsoleta. Vale la pena una limpieza de documentación como tarea de bajo esfuerzo y alto valor.
