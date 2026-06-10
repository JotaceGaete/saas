# LUCID PRODUCTION READINESS
**Rama:** `claude/lucid-lovelace-OThhj`  
**Fecha:** 2026-06-05  
**Objetivo:** Verificación previa al deploy de producción. Sin merges, sin deploys, sin SQL.

---

## 1. Estado del Build

| Check | Resultado |
|-------|-----------|
| `npm run build` | ✅ OK — 4145 módulos transformados |
| Errores de compilación | Ninguno |
| Advertencias | Bundle size > 500 kB (no bloqueante) |
| Dependencia faltante (`jsbarcode`) | ✅ Instalada — resuelto |

**Nota:** `jsbarcode` estaba en `package.json` pero no en `node_modules`. Se ejecutó `npm install jsbarcode` y el build pasó limpio.

---

## 2. FeatureGate — Tabla completa de features

| Feature ID | Label | Status | Starter | Pro | Business | showLocked |
|------------|-------|--------|---------|-----|----------|------------|
| **CATÁLOGO** |
| `catalog` | Catálogo público | ✅ active | ✅ | ✅ | ✅ | No |
| `productManagement` | Gestión de productos | ✅ active | ✅ | ✅ | ✅ | No |
| `publicCatalogDesign` | Diseño del catálogo | ✅ active | ✅ | ✅ | ✅ | No |
| `productLimit` | Productos ilimitados | ✅ active | ❌ | ❌ | ✅ | Sí |
| `customDomains` | Dominio personalizado | ✅ active | ❌ | ✅ | ✅ | Sí |
| **VENTAS** |
| `orders` | Pedidos online | ✅ active | ✅ | ✅ | ✅ | No |
| `pos` | TPV básico | ✅ active | ✅ | ✅ | ✅ | No |
| `quotes` | Presupuestos | ✅ active | ✅ | ✅ | ✅ | No |
| `invoices` | Facturas internas | ✅ active | ❌ | ✅ | ✅ | Sí |
| `salesNotes` | Notas de venta | ✅ active | ❌ | ✅ | ✅ | Sí |
| `ticketPrinting` | Impresión de tickets | ✅ active | ❌ | ✅ | ✅ | Sí |
| **CLIENTES** |
| `customers` | Gestión de clientes | ✅ active | ✅ | ✅ | ✅ | No |
| `customerAccount` | Cuenta corriente | ✅ active | ❌ | ✅ | ✅ | Sí |
| `customerDebtTracking` | Seguimiento de deudas | ✅ active | ❌ | ✅ | ✅ | Sí |
| **INVENTARIO** |
| `stockManagement` | Control de stock | ✅ active | ✅ | ✅ | ✅ | No |
| `barcodePrinting` | Códigos de barras | ✅ active | ❌ | ✅ | ✅ | Sí |
| `labelPrinting` | Impresión de etiquetas | ✅ active | ❌ | ✅ | ✅ | Sí |
| **FINANZAS** |
| `cashRegister` | Caja diaria | ✅ active | ✅ | ✅ | ✅ | No |
| `purchaseInvoices` | Facturas de compra | ✅ active | ❌ | ✅ | ✅ | Sí |
| `fixedCosts` | Costos fijos | ✅ active | ❌ | ✅ | ✅ | Sí |
| `costCenter` | Salud financiera | ✅ active | ✅ | ✅ | ✅ | No |
| `ivaSummary` | Resumen de IVA | ⏳ planned | ❌ | ✅ | ✅ | Sí |
| `financialProjection` | Proyección financiera | ⏳ planned | ❌ | ❌ | ✅ | Sí |
| **IA** |
| `aiAssistant` | Asistente IA | ✅ active | ❌ | ✅ | ✅ | Sí |
| `aiProductDescription` | IA: descripciones de producto | ✅ active | ❌ | ✅ | ✅ | Sí |
| `aiBusinessInsights` | IA: análisis del negocio | ✅ active | ❌ | ❌ | ✅ | Sí |
| **REPORTES** |
| `basicReports` | Reportes básicos | ✅ active | ❌ | ✅ | ✅ | Sí |
| `advancedReports` | Reportes avanzados | ✅ active | ❌ | ❌ | ✅ | Sí |
| `exportPdf` | Exportar a PDF | ⏳ planned | ❌ | ✅ | ✅ | Sí |
| `exportExcel` | Exportar a Excel | ⏳ planned | ❌ | ❌ | ✅ | Sí |
| **ADMINISTRACIÓN** |
| `multiUser` | Múltiples usuarios | ⏳ planned | ❌ | ❌ | ✅ | Sí |
| `userRoles` | Roles de usuario | ⏳ planned | ❌ | ❌ | ✅ | Sí |
| `emailAutomation` | Automatización por email | ⏳ planned | ❌ | ❌ | ✅ | Sí |
| `whatsappAutomation` | Automatización por WhatsApp | ⏳ planned | ❌ | ❌ | ✅ | Sí |
| **PERSONALIZACIÓN** |
| `removeBranding` | Marca blanca | ✅ active | ❌ | ❌ | ✅ | Sí |

**Resumen:** 26 features `active` / 8 features `planned` (sin UI, ocultas correctamente con `showLocked: true`).

**Correcciones aplicadas en esta sesión:**
- `aiProductDescription`: `planned` → `active` ✅
- `aiBusinessInsights`: `planned` → `active` ✅
- `aiAssistant`: ya era `active` (sin cambio necesario)

---

## 3. Visibilidad CRM por plan

### Starter (plan gratuito, hasta 20 productos)

| Módulo CRM | Ruta | Visible | Bloqueado por FeatureGate |
|------------|------|---------|--------------------------|
| Dashboard CRM | `/crm` | ✅ | No — sin gate |
| Clientes | `/crm/clientes` | ✅ | No — sin gate |
| Presupuestos | `/crm/presupuestos` | ✅ | No — sin gate |
| Stock | `/crm/stock` | ✅ | No — sin gate |
| Terminal (TPV) | `/crm/terminal` | ✅ | No — sin gate |
| Caja | `/crm/caja` | ✅ | No — sin gate |
| Salud financiera | `/crm/cost-center` | ✅ | No — sin gate |
| Facturas | `/crm/facturas` | 🔒 | Sí — feature `invoices` (min: Pro) |
| Compras | `/crm/compras` | 🔒 | Sí — feature `purchaseInvoices` (min: Pro) |
| Costos fijos | `/crm/costos` | 🔒 | Sí — feature `fixedCosts` (min: Pro) |
| Códigos de barras | `/crm/barcodes` | 🔒 | Sí — feature `barcodePrinting` (min: Pro) |

**Starter ve:** 7 módulos activos / 4 módulos bloqueados (pantalla de upgrade).

### Pro (plan pago)

| Módulo CRM | Visible |
|------------|---------|
| Dashboard CRM | ✅ |
| Clientes + Cuenta corriente | ✅ |
| Presupuestos | ✅ |
| Stock | ✅ |
| Terminal (TPV) | ✅ |
| Caja | ✅ |
| Salud financiera | ✅ |
| Facturas | ✅ |
| Compras | ✅ |
| Costos fijos | ✅ |
| Códigos de barras | ✅ |

**Pro ve:** todos los 11 módulos CRM activos.

### Business (plan full)

Igual que Pro + acceso a `aiBusinessInsights`, `advancedReports`, `removeBranding`, `productLimit`. Todos los módulos CRM activos.

---

## 4. Rutas — Verificación completa

Todas las rutas requeridas están presentes en `src/Routes.jsx`:

| Ruta | Estado | FeatureGate |
|------|--------|-------------|
| `/crm` | ✅ | No |
| `/crm/clientes` | ✅ | No |
| `/crm/presupuestos` | ✅ | No |
| `/crm/presupuestos/nuevo` | ✅ | No |
| `/crm/presupuestos/:id` | ✅ | No |
| `/crm/facturas` | ✅ | `invoices` |
| `/crm/facturas/nueva` | ✅ | `invoices` |
| `/crm/facturas/:id` | ✅ | `invoices` |
| `/crm/stock` | ✅ | No |
| `/crm/terminal` | ✅ | No |
| `/crm/caja` | ✅ | No |
| `/crm/cost-center` | ✅ | No |
| `/crm/compras` | ✅ | `purchaseInvoices` |
| `/crm/costos` | ✅ | `fixedCosts` |
| `/crm/barcodes` | ✅ | `barcodePrinting` |

**Rutas faltantes:** Ninguna.  
**Rutas rotas:** Ninguna — build pasó con 4145 módulos sin errores.

---

## 5. Migraciones

### Obligatorias (sin estas no funciona el CRM)

| Archivo | Crea/Modifica | Prioridad |
|---------|---------------|-----------|
| `20260530100000_crm_module.sql` | `crm_quotes`, `crm_invoices`, `crm_items`, columnas de stock en `wa_products` | 🔴 Crítica |
| `20260530200000_crm_commercial_fields.sql` | Campos comerciales en clientes y presupuestos | 🔴 Crítica |
| `20260530210000_crm_payments.sql` | `crm_payments` | 🔴 Crítica |
| `20260602000000_crm_cost_center.sql` | `crm_cost_centers` | 🔴 Crítica |
| `20260602020000_crm_purchases.sql` | `crm_purchases` | 🔴 Crítica |
| `20260602040000_crm_cash_sessions.sql` | `crm_cash_sessions` | 🔴 Crítica |
| `20260602060000_pos_product_visibility.sql` | `show_in_pos`, `pos_sort_order` en `wa_products` | 🔴 Crítica |
| `20260530000000_enforce_expired_plans.sql` | Lógica de expiración de planes | 🟠 Alta |

### Opcionales / complementarias (mejoras sobre base existente)

| Archivo | Crea/Modifica | Prioridad |
|---------|---------------|-----------|
| `20260531100000_wa_businesses_document_title_type.sql` | Tipo de título en documentos | 🟡 Media |
| `20260531200000_crm_invoices_source.sql` | Campo `source` en facturas | 🟡 Media |
| `20260601000000_crm_items_discount_type.sql` | Tipo de descuento en ítems | 🟡 Media |
| `20260601000001_wa_products_show_price.sql` | Visibilidad de precio en catálogo | 🟡 Media |
| `20260602010000_crm_cost_center_onboarding.sql` | Datos iniciales para cost center | 🟡 Media |
| `20260602030000_admin_search_users_fn.sql` | Función RPC de búsqueda de usuarios (admin) | 🟡 Media |
| `20260602050000_crm_cash_sessions_notes.sql` | Campo `notes` en sesiones de caja | 🟢 Baja |
| `20260604070000_business_domains.sql` | `business_domains` con `vercel_config` | 🟡 Media |

### Ya ejecutadas manualmente (según indicación del usuario)

| Archivo | Estado |
|---------|--------|
| `20260604000000_user_sessions_tracking.sql` | ⚠️ Posiblemente ya ejecutada — verificar antes de correr |

**Total:** 17 migraciones en repo. Todas en orden correcto por timestamp.  
**Instrucción:** No ejecutar SQL automáticamente. Verificar en Supabase Dashboard → `supabase_migrations` qué ya existe antes de aplicar.

---

## 6. Bloqueos para deploy

| # | Bloqueo | Severidad | Estado |
|---|---------|-----------|--------|
| 1 | `jsbarcode` no instalado → build fallaba | 🔴 Crítico | ✅ Resuelto |
| 2 | `aiProductDescription` marcada como `planned` | 🟠 Alta | ✅ Resuelto |
| 3 | `aiBusinessInsights` marcada como `planned` | 🟠 Alta | ✅ Resuelto |
| 4 | Migraciones CRM sin ejecutar en producción | 🔴 Crítico | ⏳ Pendiente (decisión manual) |
| 5 | Backend validation para features gateadas (Fase 6) | 🟡 Media | ⏳ Pendiente — CRM_EARLY_ACCESS_MODE activo |

---

## 7. Qué puede ver un cliente hoy (tras deploy + migraciones)

### Starter — gratis

- Catálogo público con URL propia
- Hasta 20 productos con fotos
- Pedidos online
- TPV básico
- Presupuestos/cotizaciones
- Gestión de clientes
- Control de stock básico
- Caja diaria
- Salud financiera básica (semáforo)

### Pro — pago

Todo Starter, más:
- Dominio personalizado
- Facturas internas con historial de pagos
- Cuenta corriente de clientes
- Seguimiento de deudas
- Facturas de compra (IVA crédito)
- Costos fijos por categoría
- Códigos de barras EAN-13
- Impresión de etiquetas de precio
- Impresión de tickets (impresora térmica)
- Asistente IA
- IA: descripciones de producto
- Reportes básicos

### Business — full

Todo Pro, más:
- Productos ilimitados
- IA: análisis del negocio
- Reportes avanzados
- Marca blanca (sin "Powered by Ventalink")

---

## 8. Funciones que deben permanecer ocultas (FeatureGate = planned)

Estas features tienen UI pendiente. Están correctamente marcadas como `planned` y con `showLocked: true` (muestran pantalla de "próximamente"):

- `ivaSummary` — Resumen IVA
- `financialProjection` — Proyección financiera
- `exportPdf` — Exportar PDF
- `exportExcel` — Exportar Excel
- `multiUser` — Múltiples usuarios
- `userRoles` — Roles de usuario
- `emailAutomation` — Email automático
- `whatsappAutomation` — WhatsApp automático

---

## 9. Checklist final de deploy

```
[ ] Ejecutar migraciones obligatorias en Supabase producción (verificar cuáles ya existen)
[ ] Verificar que CRM_EARLY_ACCESS_MODE está habilitado (bypass plan-gate durante lanzamiento)
[ ] Configurar secrets: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, OPENAI_API_KEY, R2_*
[ ] Deploy en Vercel desde rama claude/lucid-lovelace-OThhj (o merge previo)
[ ] Smoke test post-deploy: crear presupuesto, factura, sesión de caja, barcode
[ ] Verificar que Starter ve 7 módulos y Pro ve 11 módulos CRM
[ ] Monitorear errores en Vercel logs las primeras 2 horas
```

---

*Generado en sesión Claude Code — rama `claude/lucid-lovelace-OThhj` — 2026-06-05*
