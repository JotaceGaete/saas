# DATA-MODEL.md
> Generado automáticamente por auditoría de código. Fecha: 2026-05-25.
> Fuente: `supabase/migrations/` (127 archivos). Tabla base: migración `20260309142017`.

---

## Convenciones

- Prefijo `wa_` en todas las tablas del dominio principal.
- RLS habilitado en todas las tablas.
- Función `wa_set_updated_at()` como trigger de `updated_at` en casi todas las tablas.

---

## Tablas principales

### `wa_businesses`
**Fuente de verdad del negocio (tenant).**

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → `auth.users` | ON DELETE CASCADE |
| `name` | TEXT | Nombre del negocio |
| `description` | TEXT | |
| `whatsapp` | TEXT | Normalizado a E.164 (`+digits`) |
| `email` | TEXT | |
| `address` | TEXT | |
| `city` | TEXT | |
| `country` | TEXT | País (texto libre legacy) |
| `country_code` | TEXT | ISO 2 letras (CL, AR, MX...) — añadido en migración 20260313 |
| `currency` | TEXT | Moneda para catálogo de productos (no para billing) |
| `logo_url` | TEXT | URL logo (R2 o Supabase Storage) |
| `slug` | TEXT UNIQUE | Slug URL del catálogo |
| `is_active` | BOOLEAN | |
| `plan_slug` | TEXT | `starter` \| `pro` \| `business` (CHECK constraint) |
| `plan_expires_at` | TIMESTAMPTZ | NULL = sin expiración (admin-asignado legacy) |
| `plan_started_at` | TIMESTAMPTZ | Cuándo inició el plan de pago |
| `trial_expires_at` | TIMESTAMPTZ | NULL si no es trial |
| `region` | TEXT | No confirmado uso activo |
| `cover_image_url` | TEXT | Portada del catálogo |
| `og_image_url` | TEXT | OG image pre-generada |
| `design_settings` | JSONB | Configuración de diseño del catálogo |
| `order_message_template` | TEXT | Template del mensaje de pedido para WhatsApp |
| `bank_fields` | JSONB | Datos bancarios para transferencias |
| `social_links` | JSONB | Links a redes sociales (instagram, facebook, tiktok...) |
| `catalog_seo_content` | JSONB | Título y descripción SEO del catálogo |
| `business_mode` | TEXT | `store` \| `restaurant` (CHECK constraint) |
| `print_legend` | TEXT | Leyenda de impresión |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto via trigger |

**RLS:**
- `wa_businesses_owner_all`: usuario autenticado ve/edita solo su propio negocio.
- `wa_businesses_public_read`: lectura pública total (catálogos sin auth).

---

### `wa_products`
**Catálogo de productos por negocio.**

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | |
| `business_id` | UUID FK → `wa_businesses` | ON DELETE CASCADE |
| `name` | TEXT | |
| `description` | TEXT | Descripción corta |
| `long_description` | TEXT | Descripción larga (añadida 20260411) |
| `price` | NUMERIC(10,2) | |
| `compare_at_price` | NUMERIC(10,2) | Precio tachado (antes de oferta) (añadido 20260413) |
| `image_url` | TEXT | Imagen principal (legacy, usar `images`) |
| `images` | TEXT[] | Array de URLs de imágenes (migración 20260309270000) |
| `thumbnail_url` | TEXT | Thumbnail optimizado para listados (20260501) |
| `card_image_url` | TEXT | Imagen para tarjeta en catálogo (20260501) |
| `video_url` | TEXT | Video del producto (20260421) |
| `is_active` | BOOLEAN | |
| `is_draft` | BOOLEAN | Producto en borrador (20260422) |
| `is_sold_out` | BOOLEAN | Sin stock (20260429) |
| `is_featured` | BOOLEAN | Producto destacado (20260322) |
| `is_on_sale` | BOOLEAN | En oferta (20260322) |
| `is_main_featured` | BOOLEAN | Destacado principal (20260429) |
| `sort_order` | INTEGER | |
| `public_code` | TEXT | Código público del producto (20260324) |
| `slug` | TEXT | Slug URL del producto (20260515) |
| `category_id` | UUID FK → `wa_categories` | |
| `options` | JSONB | Opciones/variantes del producto |
| `add_ons` | JSONB | Complementos (add-ons) (20260429) |
| `combo_config` | JSONB | Configuración de combo (20260429) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto via trigger |

**RLS:**
- `wa_products_owner_all`: CRUD solo para dueño.
- `wa_products_public_read`: SELECT público donde `is_active = true`.

---

### `wa_orders`
**Pedidos de clientes.**

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | |
| `business_id` | UUID FK → `wa_businesses` | |
| `customer_id` | UUID FK → `wa_customers` | Nullable, vinculado por trigger |
| `customer_name` | TEXT | |
| `customer_phone` | TEXT | |
| `total_amount` | NUMERIC(10,2) | |
| `status` | TEXT | Estado del pedido |
| `payment_status` | TEXT | Estado del pago |
| `notes` | TEXT | |
| `table_reference` | TEXT | Referencia de mesa (restaurante) (20260316) |
| `service_type` | TEXT | `delivery` \| `pickup` \| `dine_in` (No confirmado valores exactos) |
| `delivery_address` | TEXT | Dirección de entrega (20260316) |
| `order_message_template` | TEXT | Template usado al momento de crear el pedido |
| `sent_at` | TIMESTAMPTZ | Cuándo se envió por WhatsApp (20260324) |
| `paid_at` | TIMESTAMPTZ | Cuándo se marcó como pagado (20260321) |
| `archived_at` | TIMESTAMPTZ | Cuándo se archivó |
| `delivered_at` | TIMESTAMPTZ | Cuándo se entregó (20260321) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto via trigger |

**RLS:**
- `wa_orders_owner_select`: SELECT solo para dueño.
- `wa_orders_owner_update`: UPDATE solo para dueño.
- `wa_orders_anon_insert`: INSERT público (compradores anónimos crean pedidos).

**Realtime:** Habilitado para cambios en tiempo real en el dashboard.

---

### `wa_order_items`
**Ítems individuales de cada pedido.**

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | |
| `order_id` | UUID FK → `wa_orders` | ON DELETE CASCADE |
| `product_id` | UUID FK → `wa_products` | Nullable (producto puede haber sido eliminado) |
| `product_name` | TEXT | Copia del nombre en momento del pedido |
| `product_price` | NUMERIC(10,2) | Copia del precio |
| `quantity` | INTEGER | |
| `subtotal` | NUMERIC(10,2) | |
| `options_selected` | JSONB | Opciones elegidas por el cliente (No confirmado nombre exacto) |
| `created_at` | TIMESTAMPTZ | |

---

### `wa_customers`
**Ficha de cliente (agregada migración 20260428).**

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | |
| `business_id` | UUID FK → `wa_businesses` | ON DELETE CASCADE |
| `name` | TEXT | |
| `phone` | TEXT | Tal como fue ingresado |
| `phone_normalized` | TEXT | Solo dígitos (para deduplicación) |
| `email` | TEXT | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto via trigger |

**Constraint UNIQUE:** `(business_id, phone_normalized)` — un cliente por teléfono por negocio.

**Trigger `wa_orders_link_customer`:** SECURITY DEFINER — al insertar un pedido con teléfono, hace upsert en `wa_customers` y enlaza `customer_id` en el pedido automáticamente.

---

### `wa_categories` / `wa_rubros`
**Categorías de productos y rubros de negocio.**

- `wa_categories`: categorías de productos por negocio (añadida ~20260406).
- Rubros: `public.rubros` o tabla similar para clasificar tipos de negocio (migración 20260309300000).

---

### `billing_subscriptions`
**Estado normalizado de suscripción por negocio (fuente de verdad billing).**

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | |
| `business_id` | UUID FK → `wa_businesses` UNIQUE | Una suscripción por negocio |
| `provider` | TEXT | `paypal` \| `mercado_pago` \| `dlocal` \| `paddle` |
| `provider_subscription_id` | TEXT | ID del proveedor externo |
| `plan_slug` | TEXT | `starter` \| `pro` \| `business` |
| `currency_code` | TEXT | |
| `amount` | NUMERIC(12,2) | |
| `interval_unit` | TEXT | `month` (default) |
| `status` | TEXT | `trial_without_subscription` \| `trial_with_subscription` \| `pending_approval` \| `scheduled` \| `active` \| `past_due` \| `cancelled` \| `expired` |
| `provider_status` | TEXT | Estado crudo del proveedor (ej: `APPROVAL_PENDING`) |
| `trial_ends_at` | TIMESTAMPTZ | |
| `starts_at` | TIMESTAMPTZ | |
| `current_period_starts_at` | TIMESTAMPTZ | |
| `current_period_ends_at` | TIMESTAMPTZ | |
| `cancel_at_period_end` | BOOLEAN | |
| `cancelled_at` | TIMESTAMPTZ | |
| `metadata_json` | JSONB | Datos extra del proveedor |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

### `wa_payments`
**Historial de intentos de pago (principalmente Mercado Pago legacy).**

Columnas clave: `business_id`, `user_id`, `plan_slug`, `amount`, `currency`, `status`, `mp_preference_id`, `mp_payment_id`, `external_reference` (formato: `waP:<payment_id>:<business_id>:<plan_slug>`), `raw_mp_response` (JSONB).

---

### `wa_payment_events`
**Audit log de webhooks de pago (idempotencia).**

Columnas: `payment_id`, `mp_payment_id`, `event_type`, `mp_status`, `raw_payload`, `processed_at`.

---

### `billing_webhook_events`
**Audit log de webhooks multi-proveedor (migración 20260324).**

Para deduplicación y auditoría de todos los proveedores.

---

### `paypal_webhook_events`
**Eventos de webhook específicos de PayPal (migración 20260323).**

---

### `wa_catalog_visits`
**Visitas al catálogo público.**

Columnas: `business_id`, `slug`, `path`, `visitor_id`, `referrer`, `user_agent`, `created_at`, `source` (añadido 20260409).

**RPC:** `wa_get_business_visit_stats(p_business_id UUID) → JSONB`

---

### `wa_catalog_whatsapp_clicks`
**Clics en botón WhatsApp del catálogo (migración 20260320).**

---

### `wa_site_visits`
**Visitas al sitio principal Ventalink (migración 20260409).**

Columnas: `path`, `hostname`, `source`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `visitor_id`, `user_agent`.

Solo lectura admin via RPC `wa_admin_get_site_visit_stats()`.

---

### `wa_business_daily_ai_insights`
**Caché de insights de IA por negocio (migración 20260320).**

---

### `wa_ai_product_description_cache`
**Caché semántico de descripciones de producto generadas por IA (migración 20260330).**

Columnas: `cache_key` (hash semántico), `description`, `created_at`.

---

### `wa_ai_usage_log`
**Log de uso de IA por negocio (migración 20260330).**

---

### `email_queue`
**Cola de emails pendientes de envío.**

Columnas: `to_email`, `template`, `payload` (JSONB), `status`, `retry_count`, `created_at`, `processed_at`. Añadido `retry_count` en 20260407. Endurecido con idempotencia en 20260402.

---

### `email_logs`
**Log de emails enviados (migración 20260317).**

---

### `admin_alert_queue`
**Cola de alertas para el panel admin (migración 20260424).**

Con backoff (migración 20260503).

---

### `wa_admin_settings`
**Configuración global del sistema (migración 20260409).**

Tabla de settings key-value para administradores.

---

### `wa_admin_email_test_logs`
**Logs de pruebas de email desde el panel admin (migración 20260320).**

---

## RLS relevante

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `wa_businesses` | Público (todos) | Solo dueño | Solo dueño | Solo dueño |
| `wa_products` | Público (`is_active=true`) | Solo dueño | Solo dueño | Solo dueño |
| `wa_orders` | Solo dueño | Público (anon) | Solo dueño | No confirmado |
| `wa_order_items` | Solo dueño | Público (anon) | — | — |
| `wa_customers` | Solo dueño | Via trigger SECURITY DEFINER | Solo dueño | — |
| `billing_subscriptions` | No confirmado (probablemente service_role) | — | — | — |
| `wa_catalog_visits` | Solo dueño | Via Edge Function (service_role) | — | — |
| `wa_site_visits` | Solo via RPC admin | Via Edge Function (service_role) | — | — |

---

## Triggers importantes

| Trigger | Tabla | Función | Descripción |
|---------|-------|---------|-------------|
| `wa_businesses_updated_at` | `wa_businesses` | `wa_set_updated_at()` | Auto updated_at |
| `wa_products_updated_at` | `wa_products` | `wa_set_updated_at()` | Auto updated_at |
| `wa_orders_updated_at` | `wa_orders` | `wa_set_updated_at()` | Auto updated_at |
| `wa_customers_updated_at` | `wa_customers` | `wa_set_updated_at()` | Auto updated_at |
| `wa_orders_link_customer` | `wa_orders` | `wa_orders_link_customer()` | SECURITY DEFINER: vincula cliente por teléfono |
| `wa_handle_new_user_business` (No confirmado nombre exacto) | `auth.users` | Función trigger | Crea `wa_businesses` automáticamente al registrarse |

---

## RPC / Functions SQL relevantes

| Función | Descripción |
|---------|-------------|
| `wa_get_effective_plan(plan_slug, plan_expires_at, trial_expires_at)` | Calcula el plan efectivo considerando vencimientos |
| `wa_get_business_visit_stats(p_business_id)` | Stats de visitas: total, 30d, 7d, hoy |
| `wa_admin_get_site_visit_stats()` | Stats de visitas al sitio Ventalink (solo admin) |

---

## Tablas legacy o en transición

| Tabla | Estado |
|-------|--------|
| `wa_subscriptions_lemonsqueezy` | Migración 20260319. LemonSqueezy no activo. Tabla presente, sin uso confirmado. |
| `wa_payments` | Historial MP legacy. `billing_subscriptions` es la fuente de verdad normalizada actual. |
| `paypal_plan_mappings` | Mapeo PayPal Plan IDs. Puede coexistir con env vars. No confirmado uso activo. |
| `paypal_catalog` | Datos de catálogo PayPal. Relacionado con scripts `paypal-catalog-bootstrap.js`. |

---

## Fuentes de verdad por dominio

| Dominio | Fuente de verdad |
|---------|-----------------|
| Datos del negocio | `wa_businesses` |
| Productos | `wa_products` |
| Pedidos | `wa_orders` + `wa_order_items` |
| Clientes | `wa_customers` |
| Estado de suscripción/billing | `billing_subscriptions` |
| Historial de pagos MP | `wa_payments` |
| Plan efectivo | `wa_get_effective_plan()` + `wa_businesses.plan_slug/plan_expires_at/trial_expires_at` |
| Visitas catálogo | `wa_catalog_visits` |
| Emails pendientes | `email_queue` |
