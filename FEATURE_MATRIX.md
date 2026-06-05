# VENTALINK — TABLA DE VERDAD DEL PROYECTO
## Fecha: Junio 2026

---

> **Cómo leer esta tabla**: se analizaron 4 branches del repositorio y se compararon archivo por archivo, ruta por ruta, y migración por migración. Las columnas reflejan la realidad del código, no el marketing.

---

## LEYENDA

| Símbolo | Significado |
|---------|-------------|
| ✅ | Sí / Existe / Completo |
| ❌ | No / No existe |
| ⚠️ | Parcial / Incompleto |
| 🔒 | Existe pero bloqueado (solo admin interno, no usuarios) |
| 📋 | En roadmap (planFeatures.js marcado como `planned`) |
| 🧪 | Existe en branch, no mergeado a main |

---

## TABLA PRINCIPAL

| Función | main | lucid-lovelace | zen-einstein | codex-crm | En producción | Terminada | Parcial | Roadmap |
|---------|------|----------------|--------------|-----------|--------------|-----------|---------|---------|
| **Catálogo público** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| **Pedidos WhatsApp** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| **CRM (módulo central)** | ❌ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ✅ | — |
| **Clientes** | ⚠️ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ✅ | — |
| **Presupuestos** | ❌ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ✅ | — |
| **Cotizaciones** | ❌ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ✅ | — |
| **Facturas internas** | ❌ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ✅ | — |
| **TPV / Terminal** | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ | — |
| **Stock** | ❌ | ✅ | ❌ | ✅ | ❌ | ⚠️ | ✅ | — |
| **Centro de costos** | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ | — |
| **Dominios personalizados** | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | — | — |
| **Códigos de barras** | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | — | — |
| **Etiquetas de productos** | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | — | — |
| **Configuración de negocio** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| **Categorías de productos** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| **IA (descripción productos)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| **IA (insights negocio)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| **Dashboard** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |

---

## ANÁLISIS DETALLADO POR FUNCIÓN

### CATÁLOGO PÚBLICO
- **main**: `/catalogo/:slug`, `/catalog/:slug`, mapa decorativo de ubicación
- **zen-einstein**: agrega mapa real (Leaflet), coordenadas lat/lng, dominio custom en URLs
- **lucid-lovelace**: igual que zen-einstein + integración con sistema de planes FeatureGate
- **codex-crm**: sin cambios en catálogo
- **Estado**: ✅ **En producción. Feature completa.**

---

### PEDIDOS WHATSAPP
- **main**: Kanban con estados (pendiente/confirmado/entregado/cancelado), detalle, impresión
- **Todos los branches**: sin cambios relevantes en pedidos
- **Estado**: ✅ **En producción. Feature completa.**

---

### CRM (MÓDULO CENTRAL)
- **main**: ❌ No existe. No hay rutas `/crm/*`
- **codex-crm**: Primera implementación. Rutas: `/crm`, `/crm/clientes`, `/crm/presupuestos`, `/crm/facturas`, `/crm/stock`. Acceso bloqueado: `RequireAdmin` (solo admins internos, no usuarios comunes)
- **lucid-lovelace**: Versión más completa. Rutas adicionales: `/crm/terminal`, `/crm/caja`, `/crm/cost-center`, `/crm/compras`, `/crm/costos`, `/crm/barcodes`. Acceso por plan del negocio (`RequireAuth + FeatureGate`) — ya no solo admins
- **Estado**: 🧪 **No está en producción. Existe en 2 branches no mergeados. Parcialmente terminado.**

---

### CLIENTES
- **main**: Existe tabla `wa_customers` y ruta `/customers/:customerId` (ficha individual), pero **sin lista de clientes en CRM**
- **codex-crm**: `CrmCustomers.jsx` — lista completa con métricas, cards, acciones de contacto
- **lucid-lovelace**: Igual que codex + cuenta corriente, seguimiento de deudas (features `customerAccount`, `customerDebtTracking`)
- **Migración**: `20260530100000_crm_module.sql` agrega campos a `wa_customers`: company, rut, whatsapp, address, notes
- **Estado**: ⚠️ **En producción solo la ficha individual. Lista CRM completa en branches no mergeados.**

---

### PRESUPUESTOS
- **main**: ❌ No existe
- **codex-crm**: `CrmQuotes.jsx` + `CrmQuoteEditor.jsx` + tabla `crm_quotes` en SQL. Editor con líneas de productos, descuentos, totales, PDF. Solo acceso admin
- **lucid-lovelace**: Mismas páginas + acceso por plan (`quotes: starter:true, pro:true, business:true` — disponible para todos los planes)
- **Tabla SQL `crm_quotes`**: id, business_id, customer_id, quote_number, status (borrador/enviado/aceptado/rechazado), valid_until, subtotal, discount_amount, total, converted_to_invoice_id
- **Estado**: 🧪 **Feature implementada en branches. No mergeada a main. No en producción.**

---

### COTIZACIONES
- **Nota**: En Ventalink, Presupuestos y Cotizaciones son el **mismo módulo** (`CrmQuotes`). El término varía por país (Argentina = presupuesto, Chile = cotización). El componente unifica ambos.
- **Estado**: Idéntico a Presupuestos.

---

### FACTURAS INTERNAS
- **main**: ❌ No existe
- **codex-crm**: `CrmInvoices.jsx` + `CrmInvoiceEditor.jsx`. PDF renombrado como "Nota de Venta". Incluye tabla `crm_payments` para registrar pagos por factura. Sección de pagos en editor
- **lucid-lovelace**: Igual + acceso por plan (`invoices: starter:false, pro:true, business:true`)
- **Aclaración importante**: No es facturación tributaria (SII/AFIP). Es un documento interno de venta, equivalente a una "nota de venta" informal
- **Estado**: 🧪 **Feature implementada en branches. No mergeada a main. No en producción.**

---

### TPV / TERMINAL DE VENTAS
- **main**: ❌ No existe
- **codex-crm**: ❌ Tampoco (no tiene CrmTerminal ni CrmCaja)
- **lucid-lovelace**: ✅ `CrmTerminal.jsx` (TPV completo), `CrmCaja.jsx` (apertura/cierre de caja), `CrmCash.jsx`. Acceso: `pos: starter:true, pro:true, business:true`. Incluye `CrmThermalTicket.jsx` para impresión de ticket 58mm
- **Estado**: 🧪 **Implementado solo en lucid-lovelace. El más avanzado de los branches no mergeados.**

---

### STOCK
- **main**: Solo `is_sold_out` (toggle agotado/disponible). Sin stock numérico
- **codex-crm**: `CrmStock.jsx` + migración agrega `stock_actual` y `stock_minimo` a `wa_products`
- **lucid-lovelace**: Igual + mejoras UX de onboarding y `feat(crm-stock)` según commits
- **Estado**: ⚠️ **Stock básico (agotado/disponible) en producción. Stock numérico con mínimos en branches no mergeados.**

---

### CENTRO DE COSTOS
- **main**: ❌ No existe
- **codex-crm**: ❌ No incluido en este branch
- **lucid-lovelace**: ✅ `CrmCostCenter.jsx` — semáforo financiero, gastos mensuales, días hábiles, meta diaria, indicador "¿gano o pierdo?". Feature `costCenter: starter:true`. También `CrmCostos.jsx` (gastos fijos, `fixedCosts: pro+business`) y `CrmPurchases.jsx` (facturas de compra, `purchaseInvoices: pro+business`)
- **Estado**: 🧪 **Implementado solo en lucid-lovelace. No en producción.**

---

### DOMINIOS PERSONALIZADOS
- **main**: ❌ No existe
- **codex-crm**: ❌ No incluido
- **zen-einstein**: ✅ Implementación completa — Edge Function `manage-custom-domain`, `CustomDomainSection.jsx`, RPCs `get_slug_by_custom_domain` / `get_active_custom_domain`, DNS real desde Vercel API, SEO/OG en dominios custom
- **lucid-lovelace**: ✅ También implementado (`CustomDomainSettings.jsx`, rutas en `api/seo.js`). Acceso: `customDomains: starter:false, pro:true, business:true`
- **Estado**: 🧪 **Implementado en zen-einstein y lucid-lovelace. Requiere ejecutar migraciones SQL y configurar env vars antes de activar.**

---

### CÓDIGOS DE BARRAS
- **main**: ❌ No existe
- **codex-crm**: ❌ No incluido
- **lucid-lovelace**: ✅ `CrmBarcodes.jsx` — generador EAN-13, soporte SKU, impresión de etiquetas multi-tamaño. Migración: `add_sku_barcode_to_products.sql`. Feature: `barcodePrinting: starter:false, pro:true, business:true`
- **zen-einstein**: ❌ No incluido
- **Estado**: 🧪 **Implementado solo en lucid-lovelace. No en producción.**

---

### ETIQUETAS DE PRODUCTOS
- **main**: ❌ No existe
- **lucid-lovelace**: ✅ Incluido en `CrmBarcodes.jsx`. Etiquetas multi-tamaño con precio, nombre, código de barras. Feature `labelPrinting: starter:false, pro:true, business:true`
- **Estado**: 🧪 **Implementado junto con Códigos de Barras en lucid-lovelace.**

---

### CONFIGURACIÓN DE NEGOCIO
- **main**: ✅ Completa — logo, portada, nombre, rubro, categorías, entrega, pagos, horarios, WhatsApp, diseño
- **zen-einstein**: Agrega `LocationPicker` (mapa + coordenadas) y `CustomDomainSection`
- **lucid-lovelace**: Agrega `CustomDomainSettings` (versión diferente de dominio custom)
- **Estado**: ✅ **En producción. Feature base completa. Extensiones en branches.**

---

### CATEGORÍAS DE PRODUCTOS
- **main**: ✅ Categorías de productos con `BusinessCategoriesManager`, tabla `wa_business_categories`
- **Todos los branches**: sin cambios relevantes
- **Estado**: ✅ **En producción. Feature completa.**

---

### IA — DESCRIPCIÓN DE PRODUCTOS
- **main**: ✅ Edge Function `improve-product-description` (OpenAI gpt-4o-mini), botón en product editor
- **Estado**: ✅ **En producción. Feature activa.**

---

### IA — INSIGHTS DE NEGOCIO
- **main**: ✅ Edge Function `dashboard-ai-insights` (Google Gemini), widget `AiInsightsCard` en dashboard
- **Estado**: ✅ **En producción. Feature activa.**

---

### DASHBOARD
- **main**: ✅ Completo — métricas, gráficos (Recharts), insights IA, actividad, pedidos, productos, plan usage, trial banner
- **zen-einstein**: mejoras menores en responsive
- **lucid-lovelace**: `CrmDashboard.jsx` — dashboard específico del CRM (separado del main dashboard)
- **Estado**: ✅ **En producción. Dashboard principal completo. Dashboard CRM en branch.**

---

## MAPA DE BRANCHES

```
main ──────────────────────────────────────────── PRODUCCIÓN HOY
  │
  ├─► zen-einstein ── Custom domains + mapa + OG/SEO
  │                   (NO mergeado — requiere migraciones SQL + env vars Vercel)
  │
  ├─► codex-crm ───── CRM base: clientes, presupuestos, facturas, stock
  │                   (NO mergeado — CRM solo accesible por admins internos)
  │
  └─► lucid-lovelace ─ CRM completo + TPV + barcodes + etiquetas + centro costos
                       + dominios custom + plan features system
                       (NO mergeado — el branch más avanzado del proyecto)
```

---

## RESUMEN EJECUTIVO

| Categoría | Estado |
|-----------|--------|
| Funciones en producción (main) | Catálogo, Pedidos, Dashboard, IA, Configuración básica |
| Funciones implementadas pero NO en producción | CRM, Presupuestos, Facturas, TPV, Stock numérico, Centro de costos, Códigos de barras, Etiquetas, Dominios personalizados |
| Funciones planificadas (no implementadas) | IVA, Proyección financiera, Multi-usuario, Automatización WA/email, Exportar Excel |

### Branch más avanzado: `lucid-lovelace`
Contiene prácticamente todo el product roadmap implementado: CRM completo (14+ páginas), sistema de planes con `FeatureGate`, dominios personalizados, TPV, barcodes, etiquetas, centro de costos, caja diaria, compras. **Este es el candidato principal para mergear a main.**

### Acción recomendada
1. **Mergear lucid-lovelace** (con review de acceso: ya no es solo admin, es por plan de negocio)
2. **Ejecutar migraciones SQL** de codex-crm y zen-einstein en producción
3. **Configurar env vars** de Vercel en Supabase Edge Functions para dominios custom
4. **Desactivar features `planned`** en producción hasta terminarlas (ivaSummary, financialProjection, exportPdf, exportExcel, multiUser)

---

*Generado mediante análisis directo de git diff entre branches — no es una estimación.*
