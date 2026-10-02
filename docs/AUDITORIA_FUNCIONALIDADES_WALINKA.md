# Auditoría de funcionalidades reales — Walinka

**Fecha:** 2026-10-02
**Base auditada:** rama `main` @ `0b503b8` (último merge: PR #85, 2026-09-23).
**Objetivo:** inventario de lo que la plataforma **realmente ofrece hoy**, para construir una landing comercial basada solo en hechos.
**Método:** lectura del flujo real en el código (rutas → páginas → servicios → RPC/migraciones SQL → Edge Functions). No se modificó código.

> **Límite importante.** No fue posible verificar producción: el conector de Supabase disponible en esta sesión no tiene acceso al proyecto de Walinka. Todo lo de abajo describe lo que existe **en `main`**. Las funciones que dependen de secrets o flags en tiempo de ejecución (emails, PayPal, Vercel, OpenAI) quedan marcadas como "depende de configuración".

---

## 0. Datos técnicos que conviene saber antes de leer

| Tema | Realidad |
|---|---|
| Stack | **No es Next.js.** Es una SPA **React 18 + Vite** (`react-router-dom` v6, `src/Routes.jsx`), con backend en **Supabase** (Postgres + RLS + RPC + Edge Functions en Deno) y funciones serverless en **Vercel** (`/api/*`). No hay Server Actions ni Route Handlers de Next. |
| Marca en el código | El código y los textos internos todavía dicen **"Ventalink"** (`go.ventalink.app`, `PLAN_FEATURES — fuente única de verdad comercial de Ventalink`). "Walinka" aparece en módulos recientes (TPV, impresión, IA, comisión). Las tablas usan el prefijo histórico `wa_`. Los catálogos públicos se sirven también en `miralatienda.de`. |
| Modelo de cuenta | **1 usuario = 1 negocio.** No existen equipos, empleados, cajeros ni roles por negocio. Los únicos roles son "dueño del negocio" y "admin de la plataforma". |
| Planes | Starter (gratis), Pro y Full (`business`). Trial Pro de 14 días al registrarse. Límites: Starter 20 productos / 50 pedidos al mes / 5 proveedores; Pro 100 productos; Full sin límite (`src/constants/plans.js`). |
| Países | CL y AR activos con moneda local; BO y PE en beta (cobro de la suscripción por PayPal); resto con PayPal o activación manual. |
| Trabajo **no fusionado** relevante | `feat/point-smart-2` (Mercado Pago Point, PR #86 en borrador, 91 commits) y `feat/pos-held-sales` (ventas en espera del TPV, 30 commits). Ninguno está en `main`. |

### Leyenda de estados

- **IMPLEMENTADA:** funciona hoy y el flujo completo está disponible.
- **PARCIAL:** se puede usar, pero con limitaciones o partes pendientes.
- **EN DESARROLLO:** hay código, pero no está en `main` o no debe anunciarse.
- **INFRAESTRUCTURA:** existe la base (tabla, RPC, función), sin experiencia completa para el usuario.
- **LEGACY:** código antiguo, reemplazado o huérfano.

---

## 1. Mapa de módulos visibles para el comerciante

Menú lateral (`src/components/ui/BusinessSidebar.jsx`):

**Tienda online:** Mi tienda (dashboard) · Productos · Pedidos · Historial de pedidos · Configuración · Diseño · Plan y facturación · Ayuda.
**Gestión del negocio** (`/crm/*`, solo desde el plan **Pro**, bloqueo con `RequireCrm`): Resumen · Resumen del día · Informes · Clientes · Presupuestos · Notas de venta · **TPV** · Impresión · Caja · Centro de costos · Inventario · Proveedores.
Rutas que existen pero no están en el menú: `/crm/cost-center` (Termómetro del negocio, se llega desde Costos y Resumen CRM) y `/crm/barcodes` (etiquetas, se llega desde Resumen CRM).

> ⚠️ **Inconsistencia de planes que afecta a la landing.** `src/config/planFeatures.js` marca como incluidos en Starter "Caja diaria", "Control de stock", "Presupuestos", "Gestión de clientes" y "Salud financiera". Pero **todas** las rutas `/crm/*` exigen `crmAccess` (Pro). En la práctica, **Starter solo tiene catálogo, productos, pedidos, diseño y proveedores (hasta 5)**. Hay más textos que no cuadran: el TPV bloqueado dice "Disponible en plan Full", aunque la regla real es Pro; el Termómetro dice "Requiere el plan Business", aunque la regla real (`costCenter`) es Starter, filtrada por el gate Pro del CRM; y los insights de IA se muestran desde Pro, aunque la matriz dice Full. **La landing debe usar la regla real: todo el módulo de gestión es Pro o superior.**

---

## 2. TPV / Punto de Venta (`/crm/terminal` → `CrmTerminal.jsx` → RPC `crm_create_pos_sale`)

| Función | Estado | Detalle verificado |
|---|---|---|
| Crear venta en mostrador | **IMPLEMENTADA** | La RPC atómica `crm_create_pos_sale` (`SECURITY DEFINER`) crea la nota de venta, sus ítems, los pagos y los movimientos de stock en **una sola transacción**. Plan Pro+. |
| Carrito | **IMPLEMENTADA** | Grilla de productos marcados "Visible en TPV", filtros rápidos por categoría, búsqueda por nombre/SKU/código de barras/categoría sobre todos los productos activos y ajuste de cantidades. Se pueden agregar **ítems manuales** (servicio o producto sin ficha) con precio libre. |
| Lector de código de barras | **IMPLEMENTADA** | Funciona con lector USB/HID (código exacto + Enter: busca por `barcode`/`sku`/`public_code`). **No hay escaneo con cámara.** |
| Descuentos | **PARCIAL** | Solo un **descuento global en monto** sobre la venta. No hay descuento por línea ni porcentual en el TPV (sí existen en presupuestos y notas de venta). |
| Clientes en la venta | **IMPLEMENTADA** | Venta anónima o con cliente; buscador de clientes y **alta rápida** (`QuickCustomerModal`). |
| Medios de pago | **IMPLEMENTADA** | Efectivo, Débito, Crédito, Mercado Pago, Transferencia, Cheque, Otro y **Cuenta corriente**. **Pago dividido** en varios medios. El vuelto se calcula solo sobre efectivo. "Mercado Pago" es **solo un registro manual del medio**: no cobra en ningún dispositivo. |
| Venta a crédito / saldo pendiente | **IMPLEMENTADA** | El saldo no pagado pasa a cuenta corriente y exige un cliente registrado (`CREDIT_NO_CUSTOMER`). |
| Relación con caja | **IMPLEMENTADA** | Los pagos reales exigen una **caja abierta** (se valida en el cliente y en la RPC: `NO_OPEN_CASH`). Cada pago queda ligado a la sesión de caja. Una venta 100% a cuenta corriente no requiere caja. |
| Descuento automático de stock | **IMPLEMENTADA** | Bajo `FOR UPDATE`; si falta stock rechaza con detalle (`STOCK_INSUFFICIENT:producto:pedido:disponible`). Los productos con `stock_actual = NULL` no tienen control de stock (ilimitados). |
| Idempotencia / doble clic | **IMPLEMENTADA** | Clave de idempotencia por venta + `pg_advisory_xact_lock` + índice único `(business_id, pos_idempotency_key)`. Un reintento con la misma clave no duplica la venta. Hay bloqueo de envío en el cliente. |
| Recuperación ante cierre o recarga | **IMPLEMENTADA** | Borrador autoguardado en `localStorage` (carrito, cliente, descuento, notas, pagos y clave de idempotencia). Si es de hoy se restaura solo; si es más antiguo se ofrece recuperarlo o descartarlo. Es **por dispositivo**, no sincronizado. |
| Ticket en pantalla | **IMPLEMENTADA** | `CrmThermalTicket`: vista del comprobante tras la venta. |
| Impresión térmica automática | **IMPLEMENTADA** (requiere QZ Tray) | Ver §9. Se imprime sola al completar la venta si hay una impresora configurada. Tiene "Reintentar" y "Reimprimir" sin volver a crear la venta. |
| Reimpresión posterior | **IMPLEMENTADA** | Desde el detalle de un pago en Caja, solo para ventas creadas en el TPV. |
| Ventas suspendidas / en espera | **EN DESARROLLO** | Solo en la rama `feat/pos-held-sales` (migración `20261001190000_pos_held_sales.sql`, RPC con claim/token). No está en `main`. |
| Reserva de stock | **EN DESARROLLO** | Solo existe dentro de Point (`crm_point_reserve_stock`, rama `feat/point-smart-2`). |
| Anular una venta del TPV | **PARCIAL** | Se puede marcar la nota como "anulada" (`CrmInvoices`) y anular pagos individuales con motivo (Caja). **No se repone el stock** (lo dice el propio comentario de la RPC: "no maneja anulación/restock") y anular la nota no anula sus pagos de forma automática. No hay devoluciones ni notas de crédito. |
| Mercado Pago Point | **EN DESARROLLO** | Ver §3.3. |
| Validez tributaria del ticket | **NO EXISTE** | Es un comprobante interno; no es boleta electrónica (ver §11). |

---

## 3. Mercado Pago

Hay **tres usos distintos** de Mercado Pago en el repositorio. No hay que mezclarlos.

### 3.1 Cobros del comercio a sus clientes en el catálogo online (Marketplace OAuth)

| Función | Estado | Detalle |
|---|---|---|
| Conectar cuenta (OAuth 2.0 + PKCE) | **IMPLEMENTADA** | Configuración → pestaña "Pagos" (`MercadoPagoConnect.jsx`). Edge Functions `mp-oauth-start` y `mp-oauth-callback`. Las credenciales están separadas por país (`MP_CLIENT_ID_CL` / `_AR`) y se resuelven en el servidor desde `wa_businesses.country_code`. **Solo CL y AR.** No depende del plan. |
| Desconectar cuenta | **IMPLEMENTADA** | `mp-oauth-disconnect`. |
| Checkout Pro desde el catálogo | **IMPLEMENTADA** | `create-merchant-mp-checkout`: **recalcula precios y totales en el servidor** desde `wa_products` (nunca confía en el navegador), crea el pedido y la preferencia, y redirige a Mercado Pago. Al volver se muestra `/catalogo/:slug/pago/:status`. |
| Webhook y estados del pago | **IMPLEMENTADA** | `merchant-mp-webhook` vuelve a consultar el pago en la API de Mercado Pago (no confía en el payload) y valida monto, moneda y referencia. Es idempotente por `mp_payment_id`. `approved` → pedido "pagado" + **descuento de stock** + registro en `wa_order_payments`. `rejected`/`cancelled` → "anulado" solo si seguía pendiente. |
| Comisión Walinka | **IMPLEMENTADA** | `marketplace_fee` del **1%** (100 bps) que se descuenta de lo que liquida el comercio, **nunca como recargo al comprador**. CLP se redondea al peso y ARS al centavo (`_shared/walinkaMarketplaceFee.ts`). Se muestra en el detalle de pago del pedido. |
| Detalle del pago en el pedido | **PARCIAL** | Se muestran bruto, comisión Walinka y método. **La comisión de Mercado Pago y el neto del comercio quedan vacíos** (`mp_fee`/`net_amount` NULL por diseño, porque no se derivan de forma fiable). |
| Reembolsos / contracargos | **INFRAESTRUCTURA** | Los estados `refunded`/`charged_back` se reconocen y se guardan en el ledger, pero **no se procesan** (no revierten el pedido ni el stock). |
| Conciliación con Mercado Pago | **NO EXISTE** | No hay un reporte de liquidaciones ni conciliación contra los movimientos de MP. |
| Emails de confirmación de pago (comprador y comercio) | **PARCIAL / depende de configuración** | Cola `email_queue` + `process-email-queue`. Solo se envían si `PAYMENT_EMAILS_ENABLED=true`. |
| Efecto sobre el WhatsApp del catálogo | **IMPLEMENTADA** (decisión de producto) | Si el comercio tiene MP conectado, el checkout del catálogo pasa a **pagar con MP**, y WhatsApp queda **solo para consultas** (no crea pedido ni toca stock). |
| Limitación conocida | — | Las URLs de retorno usan el dominio de Walinka, no el dominio propio del comercio. |

### 3.2 Cobro de la suscripción SaaS (Walinka cobra al comercio)

| Función | Estado | Detalle |
|---|---|---|
| Suscripción mensual CL/AR con Mercado Pago | **IMPLEMENTADA** | `create-mp-preference` + `mp-webhook`, con token de plataforma por país. Incluye trial, prorrateo en upgrade (`plan-change-preview`) y downgrade programado (`apply-scheduled-plan-changes`). |
| PayPal (resto de países) | **PARCIAL / depende de configuración** | `api/paypal.js`, `api/paypal-webhook.js` y `backend/src/services/paypal`. El código está completo; desde el repo no se puede confirmar que las credenciales estén cargadas. |
| Planes anuales | **PARCIAL** | Los precios anuales se muestran (CLP/ARS/USD), pero el pago anual es **una solicitud de activación manual** (`provider: 'annual_manual'`), no un cobro automático. |
| Activación manual | **IMPLEMENTADA** | Fallback "Solicitar activación". |
| dLocal, Paddle, LemonSqueezy | **LEGACY** | Las Edge Functions de dLocal son stubs. Los endpoints `api/billing-dlocal-*` y `backend/` siguen en el repo. Hay que limpiarlos. |

### 3.3 Mercado Pago Point (cobro en terminal física desde el TPV)

**Estado: EN DESARROLLO. No anunciar.** En `main` no hay nada. En la rama `feat/point-smart-2` (PR #86 en borrador, último commit 2026-09-28) existe una implementación amplia:

- Conexión OAuth propia de Point.
- Descubrimiento de terminales y configuración en modo PDV.
- Creación idempotente de órdenes (Orders API).
- Consulta, cancelación y webhook.
- Reserva de stock mientras la orden está activa y bloqueo de órdenes concurrentes.
- Vínculo con la sesión de caja.

Su runbook (`docs/POINT-SMART-2-DEPLOY-RUNBOOK.md`, en esa rama) dice: *"Gate 0 — no cobrar todavía"*.

---

## 4. Caja (`/crm/caja` → `CrmCash.jsx`)

| Función | Estado | Detalle |
|---|---|---|
| Apertura con fondo inicial | **IMPLEMENTADA** | Monto inicial + nota (por ejemplo "Turno tarde"). |
| Turnos / varias cajas por día | **IMPLEMENTADA** | Se pueden abrir varias sesiones el mismo día (cambio de turno). Hay un índice único que impide tener **dos cajas abiertas a la vez**. |
| Ingresos y salidas de dinero | **IMPLEMENTADA** | Al registrar una salida hay que elegir su propósito: **Gasto del negocio** (crea automáticamente un gasto variable en Costos), **Pago de un costo registrado** (se vincula a un costo fijo existente), **Compra de mercadería** o **Retiro del dueño** (no afecta el resultado). |
| Cobros por medio de pago | **IMPLEMENTADA** | Desglose por efectivo, débito, crédito, Mercado Pago, transferencia, cheque y otro. |
| Cierre con arqueo por medio de pago | **IMPLEMENTADA** | Asistente de cierre: compara lo **esperado vs. lo contado** en cada medio y muestra la diferencia. La RPC `crm_close_cash_session` guarda una foto en `crm_cash_session_reconciliations`. El cierre es **idempotente** (PR #85). |
| Diferencias / descuadres | **IMPLEMENTADA** | Diferencia por medio + observación de cierre. |
| Historial de cajas | **IMPLEMENTADA** | Pestaña "Historial de cajas" con el detalle de cada sesión (cobros, movimientos y arqueo guardado). |
| Reabrir una caja | **IMPLEMENTADA** con regla | Se puede reabrir una caja cerrada, salvo que **tenga arqueo**: un trigger de la BD lo impide (`crm_cash_sessions_block_reopen_reconciled`). |
| Editar movimientos | **IMPLEMENTADA** | Se puede editar el monto y el medio de un pago, editar los datos de la caja (fondo y notas) y desde ahí abrir la venta asociada. |
| Anular movimientos | **IMPLEMENTADA** | Pagos y movimientos se anulan con motivo; quedan auditados (`voided_at/by/reason`), no se borran. |
| Relación con ventas TPV | **IMPLEMENTADA** | Cada pago del TPV queda en la caja abierta. Los pagos de pedidos del catálogo entran en la caja **solo** si se registran por el puente CRM (ver §8). Los pagos con MP online **no** entran en la caja. |
| Reimprimir comprobante desde caja | **IMPLEMENTADA** | Solo para ventas creadas en el TPV. |
| Caja por usuario o cajero | **NO EXISTE** | No hay usuarios múltiples. |
| `CrmCaja.jsx` | **LEGACY** | Archivo sin ruta, reemplazado por `CrmCash.jsx`. |

---

## 5. Inventario (`/crm/stock` → `CrmStock.jsx`)

| Función | Estado | Detalle |
|---|---|---|
| Productos con stock | **IMPLEMENTADA** | El stock es opcional por producto (`stock_actual` NULL = sin control). |
| Movimientos manuales | **IMPLEMENTADA** | Entrada, Salida y Ajuste (fija el valor absoluto), con notas. El trigger `crm_apply_stock_movement` aplica el cambio y hay constraints que impiden stock negativo. |
| Historial de movimientos | **IMPLEMENTADA** | Movimientos recientes y movimientos por producto. |
| Stock mínimo y alertas | **PARCIAL** | Se configura un mínimo por producto y se ve la lista de "productos críticos" dentro de la app y en el Resumen del día. **No hay notificaciones** (ni email ni push). |
| Descuento automático por venta TPV | **IMPLEMENTADA** | — |
| Descuento automático por pedido online pagado con MP | **IMPLEMENTADA** | Al aprobarse el webhook. |
| Descuento por pedido de WhatsApp | **NO** | El checkout de WhatsApp **valida** que la cantidad no supere el stock, pero **no lo descuenta**. |
| Descuento por notas de venta manuales y presupuestos convertidos | **NO** | `createCrmInvoice` no genera movimientos de stock. |
| Reposición por anulación | **NO EXISTE** | — |
| Reservas | **EN DESARROLLO** | Solo en la rama de Point. |
| Compras que suben el stock | **NO EXISTE** | Las facturas de proveedor no tienen ítems y no tocan el stock. El ingreso de mercadería se hace con "Entrada" manual. |
| Variantes con stock propio (talla/color) | **LEGACY / no conectado** | `VariantManager.jsx` existe, pero ningún archivo lo importa. |
| Agotado en el catálogo | **PARCIAL** | Es una marca **manual** "Agotado" (`is_sold_out`), no se deriva del stock. El ajuste de diseño "Mostrar stock" **no tiene efecto** en el catálogo. |
| Códigos de barras | **IMPLEMENTADA** | Genera EAN-13 internos únicos y los asigna al producto. |
| Etiquetas imprimibles | **IMPLEMENTADA** | `/crm/barcodes` con 4 tamaños de etiqueta (Pequeña, Mediana, Grande, XL), precio y código. Plan Pro+. |
| Importación masiva CSV/Excel | **NO EXISTE** | — |
| Costo unitario / valorización del inventario | **NO EXISTE** | — |

---

## 6. Clientes / CRM

| Función | Estado | Detalle |
|---|---|---|
| Ficha de cliente | **IMPLEMENTADA** | `/crm/clientes`: nombre, empresa, RUT/DNI, teléfono, WhatsApp, email, dirección y notas. Crear, editar y eliminar. Vista en tabla o tarjetas. |
| Base única de clientes | **IMPLEMENTADA** | Una misma tabla `wa_customers` para el CRM y el catálogo: cada pedido online con teléfono **crea o actualiza el cliente automáticamente** (trigger `wa_orders_link_customer`, deduplica por teléfono normalizado). |
| Búsqueda | **IMPLEMENTADA** | Filtro en la lista. |
| Cuenta corriente | **IMPLEMENTADA** | Saldo por cliente, notas pendientes, **registro de abonos** asignados a una nota, historial de pagos y resumen de deuda del negocio. Plan Pro+. |
| Historial de compras en el CRM | **IMPLEMENTADA** | El panel del cliente muestra sus notas de venta y pagos. |
| Historial de pedidos online | **IMPLEMENTADA** | `/customers/:id`, se llega desde el detalle de un pedido. Es una vista **separada** de la ficha del CRM. |
| Contacto rápido | **IMPLEMENTADA** | Botones de WhatsApp (`wa.me`) y email. |
| Segmentación, etiquetas, campañas, pipeline, recordatorios | **NO EXISTE** | — |
| Exportar clientes | **NO EXISTE** | — |

**Presupuestos y notas de venta (parte del módulo comercial):**

| Función | Estado | Detalle |
|---|---|---|
| Presupuestos | **IMPLEMENTADA** | Editor con ítems de catálogo o libres, descuento por línea (% o monto fijo), validez, notas y estados (borrador / enviado / aceptado / rechazado). Duplicar. **PDF descargable** con datos del negocio y del cliente. El nombre del documento es configurable (Cotización/Presupuesto). |
| Convertir presupuesto en venta | **IMPLEMENTADA** | Un presupuesto aceptado se convierte en nota de venta; un índice único impide la doble conversión. No descuenta stock. |
| Notas de venta (facturas internas) | **IMPLEMENTADA** | Creación manual con vencimiento, estados (pendiente / pagada / anulada), PDF y pagos. Plan Pro+. |
| Compartir por WhatsApp desde el documento | **NO EXISTE** | Solo se descarga el PDF. |

---

## 7. Catálogo online (público)

| Función | Estado | Detalle |
|---|---|---|
| URL del negocio | **IMPLEMENTADA** | `/catalogo/:slug`, `/catalog/:slug` y URL corta `/:slug`. El slug es editable (con advertencia). |
| Dominio propio | **PARCIAL** | Plan Pro+, autoservicio con instrucciones DNS y alta automática en Vercel. Si faltan `VERCEL_TOKEN`/`VERCEL_PROJECT_ID`, responde éxito **sin registrar el dominio**. La verificación es manual (botón). |
| Página de producto | **IMPLEMENTADA** | `/catalogo/:negocio/producto/:producto` y `/p/...`, con SEO. |
| Página de ofertas | **IMPLEMENTADA** | `/catalogo/:slug/ofertas`: productos marcados "Incluir en ofertas", con precio tachado (`compare_at_price`). |
| Productos | **IMPLEMENTADA** | Nombre, precio, precio comparativo, descripción corta y larga, **mejorar descripción con IA** (OpenAI, Pro+), categoría, SKU, código de barras, borrador, visible/oculto, destacado y destacado principal, "ocultar precio / consultar precio", agotado manual, visible en TPV. Duplicar y eliminar en masa. Hay borradores locales del editor para no perder cambios. |
| Imágenes y video | **IMPLEMENTADA** | Varias imágenes por producto (Cloudflare R2, con miniaturas), imagen de tarjeta y **video** por producto. |
| Variantes con precio o stock | **NO EXISTE** | Solo "requiere opciones" con **texto libre**. `VariantManager` está huérfano. |
| Complementos y combos (modo restaurante) | **PARCIAL** | Se configuran en el editor y el cliente los elige en el modal del producto, que calcula un "total estimado". **Solo viajan por un mensaje directo de WhatsApp**; no entran al carrito ni al precio del pedido (el checkout recalcula solo con el precio base). |
| Carrito y pedido por WhatsApp | **IMPLEMENTADA** | El pedido **se guarda en la BD** (RPC `wa_create_order_with_items`, con precios reconstruidos en el servidor) y luego se abre `wa.me` con el mensaje prellenado. Detecta el navegador interno de WhatsApp. **No hay integración con la API de WhatsApp Business**: el cliente envía el mensaje desde su app. |
| Plantilla del mensaje de pedido | **IMPLEMENTADA** | Editable en Configuración. |
| Pago online | **IMPLEMENTADA** (CL/AR con MP conectado) | Ver §3.1. |
| Datos de transferencia | **LEGACY / no visible** | Los datos bancarios se separaron por seguridad (`secure_wa_businesses_bank_fields`) y no hay UI para editarlos ni mostrarlos. |
| Modo restaurante | **IMPLEMENTADA** | Tipo de negocio "Restaurante / comida": vocabulario de menú/plato y pedido para **mesa**, **retiro** o **delivery** (con dirección). |
| Envíos | **PARCIAL** | Métodos y costo de envío son **texto informativo** en la cabecera; el costo no se suma al total. |
| Búsqueda, categorías y filtro de precio | **IMPLEMENTADA** | Del lado del cliente (se descarga todo el catálogo; no hay paginación). |
| Personalización visual | **IMPLEMENTADA** | Base visual (Minimal / Gradient / Dark), color principal (paleta + color personalizado), color de fondo, tipografía (Inter / Urbanist / Poppins), estilo de tarjetas (Clásico / Minimal / Destacado), vista en cuadrícula, lista o tarjeta, densidad móvil, mostrar u ocultar precio, descripción y botón de WhatsApp, logo, portada, pie de página, redes sociales (Instagram, TikTok, Facebook), dirección y **mapa** de ubicación, horario de atención. |
| Plantillas de catálogo | **PARCIAL** | Las plantillas visuales y de productos de ejemplo por rubro las gestiona **solo el admin de la plataforma**. En el onboarding se cargan productos de ejemplo si el catálogo está vacío. |
| Marca blanca (quitar "hecho con Walinka") | **IMPLEMENTADA** | Plan Full. |
| SEO y vista previa al compartir | **IMPLEMENTADA** | `api/seo.js` (meta tags del lado del servidor), imagen OG dinámica (`api/og-catalog.js`), sitemap por tienda (sin URLs de productos) y JSON-LD `LocalBusiness`. No hay `Product` schema. |
| QR del catálogo | **IMPLEMENTADA** | En "Primeros pasos" del dashboard. |
| Métricas del catálogo | **IMPLEMENTADA** | Visitas (con fuente) y clics a WhatsApp, usados en el embudo del dashboard. |
| App instalable (PWA) | **IMPLEMENTADA** | El panel del comerciante se puede instalar. |

---

## 8. Pedidos online (`/orders`, `/orders/historial`)

| Función | Estado | Detalle |
|---|---|---|
| Tablero Kanban | **IMPLEMENTADA** | Estados: Pedido → En preparación → Enviado → Entregado / Cancelado. Los entregados salen del tablero tras 60 minutos. |
| Tiempo real | **IMPLEMENTADA** | Supabase Realtime: aviso emergente y campana de notificaciones con cada pedido nuevo. |
| Detalle del pedido | **IMPLEMENTADA** | Cliente, ítems, opciones, mesa/dirección, tiempos de preparación y entrega, WhatsApp del cliente e **impresión del pedido**. |
| Estado de pago | **IMPLEMENTADA** | Pendiente / Pagado / Anulado. MP lo actualiza solo. **Pago manual** (efectivo, transferencia u otro) por la RPC `wa_register_manual_order_payment`, que exige el monto exacto. |
| Puente pedido → nota de venta CRM → caja | **PARCIAL** | Desde el detalle: "Generar nota de venta" y luego "Registrar pago", que exige caja abierta y crea `crm_payments` dentro de la caja. **Hay dos caminos para marcar un pedido como pagado** (pago manual vs. puente CRM) y solo el segundo afecta a la caja. Ninguno de los dos descuenta stock. |
| Historial con filtros | **IMPLEMENTADA** | — |
| Límite mensual en Starter | **IMPLEMENTADA** | 50 pedidos al mes (con trigger de BD). |

---

## 9. Impresión de tickets (QZ Tray)

| Función | Estado | Detalle |
|---|---|---|
| Integración QZ Tray | **IMPLEMENTADA** | `qzTrayProvider.js` + Edge Function `qz-sign` (firma en el servidor; la clave privada no llega al navegador). **El comerciante tiene que instalar QZ Tray en el equipo de la caja.** |
| Configuración (`/crm/impresion`) | **IMPLEMENTADA** | Estado de conexión, selección de impresora, ancho de papel (80 mm por defecto), corte automático, logo, modo de imagen y perfiles de compatibilidad (Recomendado / Compatibilidad / Solo texto). Ticket de prueba y de corte. |
| Tickets ESC/POS | **IMPLEMENTADA** | Renderizador propio con logo en raster. Validado físicamente en una Star TSP100/TSP143 según los comentarios. Leyenda del ticket configurable. |
| Alcance de la configuración | Limitación | Se guarda en `localStorage` **por navegador**: hay que configurarla en cada equipo. |
| Walinka POS Bridge | **NO EXISTE** | No aparece en ninguna rama. La interfaz `printerProvider` está pensada para "otro bridge a futuro". |
| Impresión de pedidos y documentos | **IMPLEMENTADA** | Por el navegador (pedidos) y en PDF (presupuestos, notas, resúmenes). |

---

## 10. Costos, gastos y proveedores

| Función | Estado | Detalle |
|---|---|---|
| Costos fijos mensuales | **IMPLEMENTADA** | `/crm/costos`, por mes y categoría (arriendo, sueldos, servicios básicos, servicios/software, impuestos/contabilidad, insumos, otros). **No se copian solos** de un mes al siguiente. |
| Gastos variables desde caja | **IMPLEMENTADA** | Las salidas "Gasto del negocio" se convierten en gasto variable de solo lectura (`source='cash_outflow'`). |
| Sueldos | **PARCIAL** | Solo como categoría de costo fijo. No hay módulo de nómina. |
| Calendario operativo | **IMPLEMENTADA** | Días de operación del negocio (Configuración → Operación). Se usa para **prorratear el costo fijo por día operativo**. |
| Termómetro del negocio | **IMPLEMENTADA** | `/crm/cost-center`: ventas del mes (CRM/TPV + catálogo), costos fijos, gastos directos, compras de mercadería por separado y **resultado operativo estimado**, con **calendario diario semáforo** (Rentable / Equilibrio / Bajo equilibrio / Cerrado). |
| Proveedores | **IMPLEMENTADA** | `/proveedores`: ficha, estado (Al día / Con deuda / Vencido), WhatsApp, **facturas de compra** (factura o boleta; tipo mercadería, gasto con o sin IVA, servicio u otro; IVA incluido; vencimiento) y **pagos parciales** con varios medios. Starter: hasta 5 proveedores. Estos pagos **no** salen de la caja. |
| Compras que suben el stock | **NO EXISTE** | — |
| `crm_purchases`, `/crm/compras` | **LEGACY** | Reemplazado por Proveedores (la ruta redirige). |

---

## 11. Facturación / documentos tributarios

| Función | Estado |
|---|---|
| Boleta/factura electrónica (SII Chile, AFIP/ARCA Argentina) | **NO EXISTE**: no hay ninguna integración. Los tickets, notas y presupuestos son **documentos internos sin validez tributaria**. |
| Resumen de IVA | **EN DESARROLLO**: rama `feat/monthly-purchases-sales-vat-summary` sin fusionar. La matriz de planes lo marca como `planned`. |

> En la landing, usar "ticket de venta" o "nota de venta", **nunca** "boleta electrónica" ni "factura".

---

## 12. Reportes y analítica

| Reporte | Estado | Contenido |
|---|---|---|
| Dashboard "Mi tienda" | **IMPLEMENTADA** | Métricas de pedidos y facturación del catálogo, pedidos por día, productos más vendidos, ingresos diarios y mensuales, **embudo de conversión** (visitas → clics WhatsApp → pedidos), uso del plan, resumen de proveedores, mensaje del día y actividad reciente. Starter ve muy poco. |
| Insights con IA | **IMPLEMENTADA / depende de configuración** | `dashboard-ai-insights` (OpenAI) genera hallazgo, alerta y acción. Se muestra desde Pro. |
| Resumen del día | **IMPLEMENTADA** | Ventas (por canal TPV / CRM manual / online, por hora, productos más vendidos, anuladas), dinero recibido por medio, gastos y egresos, saldo antes del costo de mercadería, cajas y conciliación del día, inventario y "necesita tu atención". **Impresión A4 y PDF.** El bloque "Walinka IA" es un **marcador sin conectar**. |
| Informes por período | **IMPLEMENTADA** | Hoy, ayer, semana, mes, mes anterior, 7 y 30 días o rango personalizado. **Comparación con el período anterior** (% de variación). Ventas netas, dinero recibido, gastos, saldo, N° de ventas, ticket promedio, unidades, cuentas por cobrar, ventas por día, medios de pago, gastos por categoría, cajas y conciliación, inventario y alertas. Impresión y PDF. |
| Resumen CRM (`/crm`) | **IMPLEMENTADA** | Accesos a los módulos y estadísticas básicas. |
| Termómetro (rentabilidad mensual) | **IMPLEMENTADA** | Ver §10. |
| Canales de venta | **IMPLEMENTADA** | TPV / CRM manual / online (solo las notas vinculadas a un pedido). WhatsApp no aparece como canal propio. |
| Medios de pago | **IMPLEMENTADA** | En Resumen del día, Informes y Caja. |
| Vendedores / cajeros | **NO EXISTE** | No hay usuarios múltiples. |
| Resúmenes semanales y mensuales | **IMPLEMENTADA** | Como presets de Informes ("Esta semana", "Este mes"…). |
| Resumen diario por email | **PARCIAL / depende de configuración** | `send-daily-summary` solo corre si `EMAIL_AUTOMATION_ENABLED=true`; la automatización interna de emails se **desactivó** en mayo de 2026. |
| IVA | **EN DESARROLLO** | Ver §11. |
| Exportar a Excel/CSV | **NO EXISTE** | Solo PDF e impresión. |

---

## 13. Omnicanal: qué está unificado hoy

| Elemento | ¿Unificado? | Cómo |
|---|---|---|
| TPV ↔ inventario | Sí | Descuento atómico. |
| Catálogo con pago MP ↔ inventario | Sí | El webhook descuenta stock. |
| Catálogo vía WhatsApp ↔ inventario | **No** | Solo valida disponibilidad. |
| Clientes catálogo ↔ CRM | Sí | Misma tabla `wa_customers`, alta automática por teléfono. |
| Pedidos online ↔ ventas CRM y caja | Parcial | Puente manual "Generar nota de venta" y "Registrar pago". |
| Reportes multicanal | Sí, con matices | Resumen del día e Informes separan TPV / CRM / online. El online solo cuenta pedidos convertidos en nota. El Termómetro suma CRM/TPV + catálogo pagado. |
| Pagos MP online ↔ caja | No | Quedan en `wa_order_payments`, fuera de la caja. |
| WhatsApp como canal automatizado | No | Solo enlaces `wa.me` (pedido, consulta, contacto). |
| MP Point ↔ TPV | No en `main` | En desarrollo. |

**Mensaje honesto para la landing:** "Vende en tu tienda online y en tu mostrador con un **solo inventario** y una **sola base de clientes**, con caja y reportes en un mismo lugar". Evitar "omnicanal total" o "WhatsApp automatizado".

---

## 14. Configuración del negocio, usuarios y plataforma

| Función | Estado | Detalle |
|---|---|---|
| Datos del negocio | **IMPLEMENTADA** | Nombre, slug, rubro, tipo de negocio (tienda o restaurante), presentación pública (con IA), email, WhatsApp con formato por país, dirección y mapa, horario, pie de página, leyenda del ticket, nombre del documento comercial y categorías propias del negocio. |
| País, moneda y localización | **IMPLEMENTADA** | Selección de país en el onboarding; moneda y formato local (CLP, ARS, etc.). |
| Onboarding | **IMPLEMENTADA** | Registro, verificación de email, elección de país, configuración inicial y productos de ejemplo por rubro. |
| Usuarios múltiples / roles por negocio | **NO EXISTE** | Marcado `planned` en la matriz de planes. |
| Varios negocios por usuario | **NO EXISTE** | — |
| Panel de administración de la plataforma | **IMPLEMENTADA** (interno) | Negocios, usuarios (crear y detalle), pagos y suscripciones, auditoría, emails, rubros y categorías, plantillas de catálogo, funciones por plan e **impersonación con modo soporte**. |
| Programa de afiliados / referidos | **EN DESARROLLO** (interno) | El backend está completo (comisiones, maduración, retiros, métodos de pago), pero `/afiliados` es **solo para admins** ("rollout temporal"). No anunciar. |
| Mensajes, novedades y emails de onboarding | **PARCIAL** | El mensaje del día existe. Las automatizaciones por email están desactivadas. Las ramas de novedades no se fusionaron. |

---

## 15. Código legacy o huérfano (no anunciar, conviene limpiar)

- `src/pages/crm/CrmCaja.jsx` (sin ruta).
- `src/pages/product-editor/components/VariantManager.jsx` (sin importar).
- `business-configuration/components/PaymentMethods.jsx`, `DeliveryOptions.jsx`, `BusinessHours.jsx`, `CatalogPreview.jsx`, `ProductListPanel.jsx` (sin importar). Lo que ofrecían, como "Nequi/Daviplata" o "PayPal" como medio de pago del catálogo, **ya no existe**.
- `crm_purchases` y `/crm/compras` (redirige a Proveedores).
- dLocal (`api/billing-dlocal-*`, `backend/src/services/providers/dlocal`), Paddle y LemonSqueezy.
- `crm_create_invoice_document` (RPC atómica creada pero el frontend no la usa; las notas manuales se crean con varios inserts).
- `LANDING-FEATURES.md` (raíz) y `supabase/functions/README_MERCADOPAGO.md` están **desactualizados**: hablan de un "pago único" de $5.000 y de PayPal/Nequi en el catálogo. **No usarlos como fuente para la landing.**
- Archivos basura en la raíz del repo (`ls`, `git`, `curl`, `cls`, `va`, `vite`, `debe`, `backup.sql` vacío, etc.).

---

## 16. Resumen para la landing

### ✅ Se puede anunciar (implementado en `main`)

1. **Catálogo online** con link propio, URL corta, QR, diseño personalizable, imágenes y video, ofertas, páginas de producto con SEO y vista previa al compartir, y modo restaurante (mesa, retiro, delivery).
2. **Pedidos por WhatsApp** que quedan registrados en un tablero en tiempo real.
3. **Cobro online con Mercado Pago** en el catálogo (Chile y Argentina): conexión en un clic y confirmación automática del pago con descuento de stock.
4. **TPV para mostrador**: búsqueda, lector de código de barras, pago dividido, cuenta corriente, ventas sin duplicados, recuperación del carrito y ticket térmico automático (con QZ Tray).
5. **Caja con turnos y arqueo por medio de pago**, ingresos y salidas clasificados, historial y auditoría de anulaciones.
6. **Inventario** con movimientos, stock mínimo, descuento automático, códigos EAN-13 y etiquetas.
7. **Clientes** con historial y **cuenta corriente** (abonos).
8. **Presupuestos en PDF** que se convierten en ventas, y notas de venta.
9. **Proveedores** con facturas de compra, deudas, vencimientos y pagos parciales.
10. **Costos fijos y gastos**, prorrateo por días operativos y **Termómetro de rentabilidad diaria**.
11. **Resumen del día e Informes por período** con comparación, impresión y PDF.
12. **IA** para descripciones de productos e insights del negocio (Pro+).
13. Dominio propio (Pro+) y marca blanca (Full).

### ⚠️ Anunciar con matices

- Stock unificado: sí para TPV y pagos con MP; **no** para pedidos de WhatsApp.
- Alertas de stock: solo dentro de la app.
- Planes anuales: hoy se activan manualmente.
- Combos y complementos (restaurantes): se envían por WhatsApp, no se cobran en el checkout.
- Impresión: hay que instalar QZ Tray.

### ❌ No anunciar todavía

Mercado Pago Point · ventas en espera · reservas de stock · boleta/factura electrónica · resumen de IVA · variantes con precio o stock · usuarios, roles y cajeros · reportes por vendedor · exportación a Excel · devoluciones y notas de crédito · WhatsApp automatizado/bot · conciliación con Mercado Pago · importación masiva de productos · afiliados.
