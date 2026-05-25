# CHANGELOG-CURRENT.md
> Generado automáticamente por auditoría de código. Fecha: 2026-05-25.
> Fuente: `git log --oneline`, migraciones SQL (orden cronológico), archivos recientes.

---

## Resumen de cambios recientes detectados

### Últimos commits (rama actual)

```
42244a3 feat: add restaurant location card and improve catalog copy
be46014 fix: route lifecycle events through n8n
4cae807 chore: remove unused loops v2 endpoint
2a246b9 fix: hard reset loops event endpoint
6496d75 feat: add clean loops v2 endpoint
e155a74 fix: remove loops test mode from production endpoint
607cce6 chore: remove temporary debug function
3b4871  debug: expose loops env on event endpoint (luego revertido)
0991bfd Merge remote-tracking branch 'origin/claude/fix-vercel-test-mode-l4swk'
750ee70 fix: disable loops test mode when VERCEL_ENV=production
27714b2 fix: make loops test mode explicit
96fcb76 chore: restore local loops billing changes
08157b4 feat: send subscription receipt emails via Loops
```

### Área más activa: Loops (email marketing)
- Se movió el routing de eventos de lifecycle a n8n
- Múltiples fixes en `api/loops/event.js` para modo test vs producción
- Implementación de emails de recibo de suscripción via Loops

---

## Migraciones SQL recientes (orden cronológico, últimas 15)

| Migración | Fecha | Descripción |
|-----------|-------|-------------|
| `20260501000000_wa_products_card_image.sql` | 2026-05-01 | Campo `card_image_url` en productos |
| `20260501090000_wa_businesses_print_legend.sql` | 2026-05-01 | Campo `print_legend` en negocios |
| `20260501120000_wa_products_thumbnail_url.sql` | 2026-05-01 | Campo `thumbnail_url` en productos |
| `20260503101500_admin_alert_queue_backoff.sql` | 2026-05-03 | Backoff en cola de alertas admin |
| `20260510000000_disable_internal_email_automation.sql` | 2026-05-10 | Deshabilita automatización de email interna |
| `20260515120000_wa_products_slug.sql` | 2026-05-15 | Campo `slug` en productos (URLs de producto) |
| `20260517090000_subscription_receipt_email_fields.sql` | 2026-05-17 | Campos para email de recibo de suscripción |

---

## Funciones/features nuevas detectadas

### Emails de recibo de suscripción (Loops)
- `docs/billing/subscription-receipt-email.md` — documento del diseño
- Migración `20260517090000_subscription_receipt_email_fields.sql` — campos en BD
- `backend/src/services/loops/subscriptionReceiptEmail.js` — implementación

### Slugs de producto
- Migración `20260515120000_wa_products_slug.sql`
- Ruta pública: `/p/:businessSlug/:productSlug` (ya existente en Routes)
- Permite URLs de producto SEO-friendly

### Card image y thumbnail de producto
- `card_image_url`: imagen optimizada para tarjeta en catálogo
- `thumbnail_url`: thumbnail para listados más ligero
- Scripts: `scripts/backfill-product-thumbnails.mjs`, `scripts/backfill-og-images.mjs`

### Modo restaurante
- `wa_businesses.business_mode = 'store' | 'restaurant'` (migración 20260429)
- UI del catálogo público se adapta (ubicación del restaurante visible — commit más reciente)

### Add-ons, combos y variantes de producto (migración 20260429)
- Campos `add_ons` (JSONB), `combo_config` (JSONB) en `wa_products`
- Variantes vía `options` (JSONB) ya existente

### Clientes (migración 20260428)
- Tabla `wa_customers` con deduplicación por teléfono
- Trigger `wa_orders_link_customer` (SECURITY DEFINER)
- Página `/customers/:customerId`

### Videos de producto (migración 20260421)
- Campo `video_url` en `wa_products`
- Edge Function `upload-video-r2`

### Deshabilitación email automation interna (migración 20260510)
- Se deshabilita el sistema propio de emails (`email_queue`) formalmente en BD
- Loops se convierte en el único sistema de email activo

---

## Funciones removidas o deprecated

### Endpoint Loops v2 legacy
- Commit `4cae807: chore: remove unused loops v2 endpoint` — eliminado endpoint v2 de Loops
- Commit `be46014: fix: route lifecycle events through n8n` — eventos de lifecycle ahora van a n8n en lugar de Loops directamente

### Plan "control"
- Eliminado del CHECK constraint en migración trial system
- Registros existentes migrados a "starter"

### Email automation propia
- Deshabilitada formalmente con `20260510000000_disable_internal_email_automation.sql`

---

## Cambios de arquitectura recientes

1. **n8n como intermediario de eventos:** Los lifecycle events de Loops ahora se enrutan a través de n8n. Esto sugiere que n8n está siendo incorporado como capa de automatización/workflow.

2. **Loops como sistema de email canónico:** El commit de recibos de suscripción y la migración de deshabilitar email_queue confirman que Loops es el único sistema activo.

3. **URLs de producto SEO (slugs):** Preparación para SEO de páginas de producto individuales.

4. **Modo restaurante:** Nueva segmentación de tipo de negocio en la UI del catálogo.

---

## Cambios pendientes sin documentar

- **n8n integration:** No hay documentación de qué workflows de n8n existen, qué eventos disparan, ni cómo configurar n8n. Solo hay código en `api/loops/event.js`.
- **`VITE_WELCOME_WEBHOOK_URL`:** Variable de entorno referenciada en `AuthContext.jsx` pero no está en `.env.example`. No documentada.
- **`paypal_plan_mappings` table:** No confirmado si se usa activamente o si los Plan IDs vienen solo de env vars.
- **Slugs de producto:** Ruta existe pero no confirmado si el backfill de slugs para productos existentes fue ejecutado en producción.
- **Card images y thumbnails:** Scripts de backfill existen pero no confirmado si corrieron en producción.

---

## Documentación existente probablemente desactualizada

| Archivo | Posible desactualización |
|---------|------------------------|
| `docs/DLOCAL_GO_INTEGRATION.md` | dLocal está en stand-by (`BILLING_DLOCAL_ENABLED=false`) |
| `docs/LEMONSQUEEZY.md` | LemonSqueezy no activo |
| `docs/SISTEMA_EMAILS_VENTALINK.md` | EMAIL_AUTOMATION_ENABLED=false; ahora es Loops |
| `docs/PLANES_SAAS_DIAGNOSTICO_Y_PLAN.md` | Posiblemente anterior al sistema `billing_subscriptions` |
| `docs/BILLING_AUDIT.md` | Puede preceder a la normalización con `billing_subscriptions` |
| `docs/CHECKLIST_VENTALINK_DOMINIOS.md` | Configuración de dominios puede haber cambiado |
| `AUDIT-TECHNICAL-REPORT.md` (raíz) | Reporte previo de auditoría, posiblemente desactualizado |
| `DEPLOYMENT_APP_GONG_CL.md` (raíz) | Puede referenciar dominios o configuraciones previas |
