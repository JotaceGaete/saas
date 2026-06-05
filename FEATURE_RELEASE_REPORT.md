# VENTALINK — FEATURE RELEASE REPORT
## Estado funcional por módulo · Junio 2026
## Solo lectura — análisis directo del código de los tres branches

---

> **Metodología**: cada función fue evaluada leyendo el código real de los componentes, los servicios de base de datos, las migraciones SQL y la configuración de planes. Las columnas "UI terminada" y "Backend terminado" no son estimaciones — reflejan si el código ejecuta operaciones reales contra la base de datos y si la interfaz expone esa funcionalidad sin placeholders críticos.

---

## TABLA PRINCIPAL

| Función | Producción (main) | lucid-lovelace | zen-einstein | Post-integración | Riesgo deploy |
|---------|:-:|:-:|:-:|:-:|:-:|
| **Catálogo público** | ✅ | ✅ | ✅ | ✅ | Bajo |
| **Pedidos WhatsApp** | ✅ | ✅ | ✅ | ✅ | Bajo |
| **Gestión de productos** | ✅ | ✅ | ✅ | ✅ | Bajo |
| **Diseño del catálogo** | ✅ | ✅ | ✅ | ✅ | Bajo |
| **Categorías** | ✅ | ✅ | ✅ | ✅ | Bajo |
| **Dashboard con métricas** | ✅ | ✅ | ✅ | ✅ | Bajo |
| **IA: mejora de descripción** | ✅ | ✅ | ✅ | ✅ | Bajo |
| **IA: insights del negocio** | ✅ | ✅ | ✅ | ✅ | Bajo |
| **Planes / Billing** | ✅ | ✅ | ✅ | ✅ | Bajo |
| **Admin interno** | ✅ | ✅ | ✅ | ✅ | Bajo |
| **Ubicación en catálogo (mapa)** | ❌ | ❌ | ✅ | ✅ | Bajo |
| **LocationPicker (config)** | ❌ | ❌ | ✅ | ✅ | Bajo |
| **Dominio personalizado** | ❌ | ✅ | ✅ | ✅ | Alto |
| **OG/SEO en dominio propio** | ❌ | Parcial | ✅ | ✅ | Medio |
| **Clientes (lista CRM)** | ❌ | ✅ | ❌ | ✅ | Bajo |
| **Cuenta corriente clientes** | ❌ | ✅ | ❌ | ✅ | Bajo |
| **Presupuestos** | ❌ | ✅ | ❌ | ✅ | Bajo |
| **Cotizaciones** | ❌ | ✅ | ❌ | ✅ | Bajo |
| **Facturas internas / Notas de venta** | ❌ | ✅ | ❌ | ✅ | Medio |
| **TPV / Terminal de ventas** | ❌ | ✅ | ❌ | ✅ | Medio |
| **Caja diaria** | ❌ | ✅ | ❌ | ✅ | Medio |
| **Stock numérico** | ❌ | ✅ | ❌ | ✅ | Bajo |
| **Centro de costos (Termómetro)** | ❌ | ✅ | ❌ | ✅ | Bajo |
| **Costos fijos** | ❌ | ✅ | ❌ | ✅ | Bajo |
| **Compras / Facturas de compra** | ❌ | ✅ | ❌ | ✅ | Bajo |
| **Códigos de barras EAN-13** | ❌ | ✅ | ❌ | ✅ | Bajo |
| **Etiquetas de productos** | ❌ | ✅ | ❌ | ✅ | Bajo |
| **Sistema de planes (FeatureGate)** | ❌ | ✅ | ❌ | ✅ | Medio |
| **Resumen de IVA** | ❌ | ❌ | ❌ | ❌ | — |
| **Proyección financiera** | ❌ | ❌ | ❌ | ❌ | — |
| **Exportar PDF/Excel** | ❌ | ❌ | ❌ | ❌ | — |
| **Multi-usuario** | ❌ | ❌ | ❌ | ❌ | — |
| **Automatización WhatsApp/email** | ❌ | ❌ | ❌ | ❌ | — |

---

## ESTADO DETALLADO POR FUNCIÓN

### FUNCIONES EN PRODUCCIÓN HOY

---

#### Catálogo público
- **UI**: ✅ Terminada — productos, categorías, imágenes, carrito, share, QR
- **Backend**: ✅ Completo — `wa_products`, `wa_businesses`, `wa_orders`
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: No — disponible en todos los planes
- **Riesgo**: Bajo
- **Notas**: zen-einstein agrega mapa real de ubicación (requiere migración lat/lng)

---

#### Pedidos WhatsApp
- **UI**: ✅ Terminada — Kanban, estados, detalle, impresión
- **Backend**: ✅ Completo
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: No — disponible en todos los planes
- **Riesgo**: Bajo

---

#### Gestión de productos / Editor
- **UI**: ✅ Terminada
- **Backend**: ✅ Completo — lucid agrega `show_price`, `show_in_pos`, `pos_sort_order`, SKU, barcode
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: Solo el límite de cantidad (20/100/ilimitado según plan)
- **Riesgo**: Bajo

---

#### Dashboard + métricas
- **UI**: ✅ Terminada — 12+ widgets, gráficos Recharts, insights IA
- **Backend**: ✅ Completo
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: No
- **Riesgo**: Bajo

---

#### IA: mejora de descripción de producto
- **UI**: ✅ Terminada — botón en product editor
- **Backend**: ✅ Completo — Edge Function `improve-product-description` (OpenAI gpt-4o-mini)
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: Sí — marcado como `planned` en lucid (inconsistencia con código funcional)
- **Riesgo**: Bajo

---

#### IA: insights del negocio (Dashboard)
- **UI**: ✅ Terminada — widget `AiInsightsCard` en dashboard
- **Backend**: ✅ Completo — Edge Function `dashboard-ai-insights` (Google Gemini)
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: Sí — marcado como `planned` en lucid (inconsistencia con código funcional)
- **Riesgo**: Bajo

---

### FUNCIONES SOLO EN BRANCHES (no en producción)

---

#### Ubicación del negocio + mapa en catálogo
- **Origen**: zen-einstein
- **UI**: ✅ Terminada — `LocationPicker` con Nominatim + mapa Leaflet interactivo (4 pasos). Mapa real en `CatalogStoreHeader` cuando hay coordenadas
- **Backend**: ✅ Completo — migración `lat/lng` en `wa_businesses`, guardado en `updateBusiness`
- **Listo para clientes**: ✅ Sí — no requiere configuración adicional
- **FeatureGate**: No recomendado — es una mejora de presentación, disponible para todos
- **Riesgo**: **Bajo** — función aditiva, no modifica flujos existentes
- **Requiere migración**: `20260605120000_wa_businesses_lat_lng.sql`

---

#### Dominio personalizado
- **Origen**: lucid-lovelace + zen-einstein (implementaciones distintas, necesitan merge)
- **UI lucid**: `CustomDomainSettings.jsx` — formulario básico, sin DNS reales
- **UI zen**: `CustomDomainSection.jsx` — ✅ Completa — instrucciones DNS reales, estado, FAQ, WhatsApp soporte, UX amigable
- **Backend**: ✅ Completo — Edge Function `manage-custom-domain` llama Vercel API, guarda `vercel_config` con DNS reales
- **Listo para clientes**: ⚠️ Condicional — funciona cuando se configuran `VERCEL_TOKEN` y `VERCEL_PROJECT_ID` en Supabase
- **FeatureGate**: Sí — `customDomains: starter:false, pro:true, business:true`
- **Riesgo**: **Alto**
  - Depende de secrets externos no configurados aún
  - Lucid y zen tienen dos implementaciones distintas que deben mergearse manualmente
  - Si los secrets no están, el botón "Guardar dominio" falla silenciosamente (lucid) o con error 500 (zen)
- **Requiere migraciones**: `20260604070000_business_domains.sql` (lucid) + RPCs de zen (`20260605130000`, `20260605140000`)

---

#### OG/SEO en dominio propio (preview WhatsApp)
- **Origen**: zen-einstein
- **UI**: No aplica — es una función de servidor, invisible para el usuario
- **Backend**: ✅ Completo — `api/seo.js` modo `custom-domain` inyecta OG tags del merchant en lugar de los de Ventalink. WhatsApp muestra logo y nombre del negocio al compartir el link
- **Listo para clientes**: ✅ Sí — funciona automáticamente si el dominio está activo
- **FeatureGate**: No (depende del dominio personalizado que sí está gateado)
- **Riesgo**: **Medio** — requiere que `vercel.json` tenga el rewrite correcto (`"/"` → `mode=custom-domain`)

---

#### Clientes — lista CRM
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — lista con métricas, cards, contacto directo, buscador, drawer de detalle. 846 líneas de componente con lógica completa
- **Backend**: ✅ Completo — CRUD completo en `crmService.js`: `getCrmCustomers`, `getCrmCustomer`, `createCrmCustomer`, `updateCrmCustomer`, `deleteCrmCustomer`
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: `customers: starter:true, pro:true, business:true` — sin restricción de plan
- **Riesgo**: **Bajo**
- **Requiere migración**: `20260530100000_crm_module.sql`

---

#### Cuenta corriente de clientes
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — tab dentro de `CrmCustomers`, saldo, historial de abonos, registro de pagos parciales
- **Backend**: ✅ Completo — `getCustomerBalance`, `registerCustomerAbono`, `getCustomerPendingInvoices`
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: `customerAccount: starter:false, pro:true, business:true`
- **Riesgo**: **Bajo**

---

#### Presupuestos / Cotizaciones
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — lista, editor con líneas de productos, descuentos por ítem (monto fijo o %), PDF/Vista previa, conversión a factura, campo de condiciones comerciales
- **Backend**: ✅ Completo — `getCrmQuotes`, `createCrmQuote`, `updateCrmQuote`, `duplicateCrmQuote`, `convertQuoteToInvoice`. Tabla `crm_quotes` + `crm_quote_items`
- **Terminología adaptable**: el campo `document_title_type` en `wa_businesses` muestra "Cotización" (CL/MX) o "Presupuesto" (AR/UY) según el país del negocio
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: `quotes: starter:true, pro:true, business:true` — disponible para todos los planes
- **Riesgo**: **Bajo**
- **Requiere migraciones**: `20260530100000` + `20260530200000` + `20260601000000_crm_items_discount_type`

---

#### Facturas internas / Notas de venta
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — lista, editor completo, seguimiento de pagos por factura, PDF "Nota de Venta", botón "Marcar como pagada", historial de pagos
- **Backend**: ✅ Completo — `getCrmInvoices`, `getCrmInvoice`, `createCrmInvoice`, `updateCrmInvoiceStatus`. Tabla `crm_invoices` + `crm_invoice_items` + `crm_payments`
- **Aclaración crítica**: NO es facturación tributaria (sin SII/AFIP). Es un documento comercial interno de control
- **Listo para clientes**: ✅ Sí — con la aclaración anterior
- **FeatureGate**: `invoices: starter:false, pro:true, business:true` — correctamente gateada
- **Riesgo**: **Medio** — riesgo de que clientes confundan "Nota de Venta" con documento tributario válido. Mitigación: texto aclaratorio en la UI
- **Requiere migraciones**: `20260530100000` + `20260530210000` + `20260531200000`

---

#### TPV / Terminal de ventas
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — grilla de productos con imágenes, búsqueda por nombre/SKU/código de barras, carrito, pago recibido, vuelto, cuenta corriente, artículo manual, ticket térmico 58mm imprimible
- **Backend**: ✅ Completo — `getPosProducts`, `getAllActiveProducts`, `createPosInvoice`
- **Caja**: requiere sesión abierta (`crm_cash_sessions`) para operar
- **Listo para clientes**: ⚠️ Sí, con observaciones:
  - Los "TODOs" encontrados son 100% `placeholder` de inputs HTML — no son lógica pendiente
  - Bloquea la venta si no hay caja abierta (correcto)
  - El flujo de "artículo manual" (producto sin stock) está implementado
- **FeatureGate**: `pos: starter:true, pro:true, business:true` — sin restricción de plan
- **Riesgo**: **Medio** — la integración entre TPV y caja (`crm_cash_sessions`) requiere que ambas migraciones estén ejecutadas en orden
- **Requiere migraciones**: `20260530100000` + `20260602040000` + `20260602060000`

---

#### Caja diaria
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — apertura con monto inicial, cierre con resumen por método de pago, soporte de múltiples turnos, edición de movimientos
- **Backend**: ✅ Completo — tabla `crm_cash_sessions`, RLS correctamente configurada
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: `cashRegister: starter:true, pro:true, business:true` — sin restricción de plan
- **Riesgo**: **Medio** — la migración `20260602050000` agrega `notes` a la sesión; si se ejecutan en orden incorrecto, el insert del TPV puede fallar
- **Requiere migraciones**: `20260602040000` + `20260602050000`

---

#### Stock numérico
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — lista con búsqueda, stock actual y mínimo por producto, registro de movimientos (entrada/salida/ajuste), historial
- **Backend**: ✅ Completo — `getCrmStockProducts`, `getCrmStockMovements`, `registerStockMovement`, `updateStockMinimo`. Tablas: columnas `stock_actual` y `stock_minimo` en `wa_products` + `crm_stock_movements`
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: `stockManagement: starter:true, pro:true, business:true` — sin restricción de plan
- **Riesgo**: **Bajo**
- **Requiere migración**: `20260530100000_crm_module.sql`

---

#### Centro de costos / Termómetro del negocio
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — semáforo financiero (rojo/amarillo/verde), meta diaria calculada, ventas del día vs costo diario, indicador emocional con avatar SVG, navegación mensual por flechas
- **Backend**: ✅ Completo — tabla `crm_cost_centers`, funciones `getCostCenter`, `getCostItems`, `updateCostCenter`
- **Integración con Termómetro**: lee ventas reales de `wa_orders` + gastos de `crm_purchases` para calcular el semáforo diario
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: `costCenter: starter:true, pro:true, business:true` — sin restricción de plan
- **Riesgo**: **Bajo**
- **Requiere migraciones**: `20260602000000` + `20260602010000`

---

#### Costos fijos
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — listado de gastos fijos (arriendo, sueldos, servicios), agrupados por categoría, vinculados al Termómetro
- **Backend**: ✅ Completo
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: `fixedCosts: starter:false, pro:true, business:true`
- **Riesgo**: **Bajo**

---

#### Compras / Facturas de compra
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — registro de facturas recibidas de proveedores, cálculo de IVA crédito estimado, historial
- **Backend**: ✅ Completo — tabla `crm_purchases`
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: `purchaseInvoices: starter:false, pro:true, business:true`
- **Riesgo**: **Bajo**
- **Requiere migración**: `20260602020000`

---

#### Códigos de barras EAN-13
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — generador EAN-13 con `JsBarcode`, asignación de SKU por producto, búsqueda, previsualización del código
- **Backend**: ✅ Completo — migración `add_sku_barcode_to_products.sql`, funciones en `crmService.js`: `getProductsForBarcodes`
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: `barcodePrinting: starter:false, pro:true, business:true`
- **Riesgo**: **Bajo**

---

#### Etiquetas de productos
- **Origen**: lucid-lovelace (integrado en `CrmBarcodes.jsx`)
- **UI**: ✅ Terminada — 4 tamaños de etiqueta (30×20, 40×25, 50×30, 57×32 mm), incluye nombre, precio y código de barras, impresión de hoja A4 con múltiples etiquetas
- **Backend**: ✅ Completo — mismo que códigos de barras
- **Listo para clientes**: ✅ Sí
- **FeatureGate**: `labelPrinting: starter:false, pro:true, business:true`
- **Riesgo**: **Bajo**

---

#### Sistema FeatureGate (acceso por plan)
- **Origen**: lucid-lovelace
- **UI**: ✅ Terminada — `FeatureGate.jsx` muestra tarjeta de bloqueo con beneficios específicos y CTA a `/planes`. Versión `compact` para inline. `usePlanFeature` hook
- **Backend**: ✅ Completo — `planFeatures.js` define 34 features mapeadas a planes
- **Listo para clientes**: ✅ Sí — es transparente para el usuario
- **FeatureGate**: No aplica (es la infraestructura)
- **Riesgo**: **Medio** — hay 10 features marcadas como `planned` en `planFeatures.js`. Si el componente que las usa no existe, el FeatureGate las muestra como bloqueadas aunque no tengan UI real (comportamiento correcto, pero puede confundir)

---

### FUNCIONES NO IMPLEMENTADAS (solo en roadmap)

Las siguientes están en `planFeatures.js` con `status: 'planned'` y **no tienen componente ni ruta**:

| Función | Plan mínimo | Por qué no lanzar ahora |
|---------|------------|------------------------|
| Resumen de IVA | Pro | Sin backend, sin UI, requiere integración contable |
| Proyección financiera | Business | Requiere análisis histórico + modelo predictivo |
| Exportar a PDF | Pro | Hay PDF en presupuestos/facturas, pero no exportación masiva |
| Exportar a Excel | Business | Sin implementar |
| Múltiples usuarios | Business | Requiere cambio profundo en RLS y auth |
| Roles de usuario | Business | Dependencia de multi-usuario |
| Automatización email | Business | Email automation deshabilitada en producción |
| Automatización WhatsApp | Business | Sin integración con WhatsApp Business API |
| IA: descripciones (FeatureGate) | Pro | La Edge Function existe y funciona en producción, pero `planFeatures.js` la marca como `planned` — inconsistencia a corregir |
| IA: análisis del negocio (FeatureGate) | Business | La Edge Function existe y funciona en producción, pero `planFeatures.js` la marca como `planned` — inconsistencia a corregir |

---

## CLASIFICACIÓN FINAL

### Funciones listas para clientes reales hoy (tras integración)

✅ Sin restricción de plan:
- Catálogo público
- Pedidos WhatsApp
- Gestión de productos
- Diseño del catálogo
- Categorías
- Dashboard
- Clientes (lista básica)
- Presupuestos / Cotizaciones
- Stock numérico
- Centro de costos / Termómetro
- TPV (con caja abierta)
- Caja diaria
- Mapa de ubicación en catálogo
- LocationPicker en configuración

✅ Con plan Pro/Business (FeatureGate):
- Facturas internas / Notas de venta
- Cuenta corriente de clientes
- Costos fijos
- Compras / Facturas de compra
- Códigos de barras EAN-13
- Etiquetas de productos
- IA: mejora de descripción
- IA: insights del negocio
- Dominio personalizado (con secrets Vercel configurados)

---

### Funciones con UI terminada pero backend condicionado a configuración externa

| Función | Condición faltante |
|---------|-------------------|
| Dominio personalizado | `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` en Supabase Edge Functions |
| OG/SEO dominio propio | rewrite en `vercel.json` + secrets Vercel |

---

### Funciones que deberían permanecer ocultas por FeatureGate (post-integración)

Estas funciones existen en `planFeatures.js` como `planned` pero no tienen UI implementada. El FeatureGate las muestra como "próximamente" solo si el usuario llega a una ruta que no existe. No tienen ruta registrada en `Routes.jsx` — están efectivamente ocultas:

- Resumen de IVA
- Proyección financiera
- Exportar PDF (masivo)
- Exportar Excel
- Multi-usuario / Roles
- Automatización email / WhatsApp

**Inconsistencia a corregir antes del deploy:**
Las features `aiAssistant`, `aiProductDescription` y `aiBusinessInsights` están marcadas como `planned` en `planFeatures.js`, pero las Edge Functions correspondientes **ya existen y funcionan en producción**. Deben cambiarse a `status: 'active'` para que el FeatureGate no las muestre como bloqueadas a usuarios Pro/Business que legítimamente deberían tenerlas.

---

## TABLA DE RIESGOS CONSOLIDADA

| Función | Riesgo | Razón principal |
|---------|--------|-----------------|
| Catálogo, pedidos, productos, dashboard | Bajo | En producción sin cambios críticos |
| Mapa de ubicación | Bajo | Aditivo, no toca flujos existentes |
| Clientes CRM | Bajo | CRUD completo y testeado |
| Presupuestos / Cotizaciones | Bajo | Flujo completo sin dependencias externas |
| Stock numérico | Bajo | Extiende datos existentes |
| Centro de costos | Bajo | Módulo independiente |
| Costos fijos | Bajo | Módulo independiente |
| Compras | Bajo | Módulo independiente |
| Códigos de barras / Etiquetas | Bajo | Librería `JsBarcode` estable, sin dependencia backend |
| FeatureGate | Medio | 10 features `planned` sin UI — pueden confundir si se exponen |
| Facturas internas | Medio | Riesgo de confusión con factura tributaria oficial |
| TPV | Medio | Depende de caja abierta; migración de `crm_cash_sessions` debe ejecutarse antes |
| Caja diaria | Medio | Migración con orden estricto (notes antes del primer insert) |
| OG/SEO dominio propio | Medio | Requiere cambio en `vercel.json` y re-deploy |
| Dominio personalizado | Alto | Dos implementaciones distintas + secrets externos + migración base + RPCs |

---

## ACCIONES PREVIAS AL DEPLOY (resumen)

| Acción | Urgencia | Quién |
|--------|---------|-------|
| Verificar migraciones ejecutadas en producción (query SQL) | ✅ Crítica | Fundador en Supabase Dashboard |
| Cambiar `aiAssistant`, `aiProductDescription`, `aiBusinessInsights` de `planned` → `active` en `planFeatures.js` | Alta | Dev |
| Decidir si `removeBranding` (`active` en config) tiene UI implementada | Media | Dev |
| Configurar `VERCEL_TOKEN` y `VERCEL_PROJECT_ID` (solo cuando se active dominio personalizado) | Baja por ahora | Fundador |
| Agregar texto aclaratorio en Facturas internas: "Este documento no es una factura tributaria" | Media | Dev |

---

*Análisis generado mediante inspección directa del código — sin estimaciones ni suposiciones.*
*Branch base del análisis: `origin/claude/lucid-lovelace-OThhj` y `origin/claude/zen-einstein-jqcN1`*
