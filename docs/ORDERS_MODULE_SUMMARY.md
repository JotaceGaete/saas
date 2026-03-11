# Módulo de pedidos – Resumen de implementación

## 1. Auditoría y cambios en modelo de datos

### Tablas existentes
- **wa_orders**: `id`, `business_id`, `customer_name`, `customer_phone`, `total_amount`, `status`, `notes`, `internal_notes`, `created_at`, `updated_at`.
- **wa_order_items**: `id`, `order_id`, `product_id`, `product_name`, `product_price`, `quantity`, `subtotal`, `created_at`.

### Migración `20260310500000_wa_orders_status_and_fields.sql`
- **wa_orders**: columnas opcionales `customer_email`, `subtotal`, `currency` (default `'CLP'`).
- **Estados únicos**: `CHECK (status IN ('pedido','en_preparacion','enviado','entregado','cancelado'))`, default `'pedido'`.
- Migración de datos: cualquier `status` anterior (`pending`, `new`, `confirmed`, etc.) se actualiza a `'pedido'`.
- **wa_order_items**: columna `selected_options JSONB DEFAULT '[]'`.
- Índices: `idx_wa_orders_status`, `idx_wa_orders_created_at_d`, y los que ya existían para `business_id` y `order_id`.

---

## 2. Estados del pedido

- En BD: `pedido` | `en_preparacion` | `enviado` | `entregado` | `cancelado`.
- En UI (español): **Pedido**, **En preparación**, **Enviado**, **Entregado**, **Cancelado**.
- Validación en backend: `updateOrder` solo acepta esos valores (array `ORDER_STATUS_VALID` en `waBusinessService.js`).
- Badges por estado en listado, detalle y ActivityFeed del dashboard.

---

## 3. Listado de pedidos (`/orders`)

- Tarjetas por pedido con: **#código** (8 primeros caracteres del UUID), fecha, cliente, teléfono, productos, total, estado, notas internas, imprimir.
- Filtros por estado: **Todos** + los 5 estados (strip de chips con conteo).
- Buscador por: nombre cliente, teléfono, ID de pedido (o producto en ítems).
- Orden: más recientes primero (`created_at` desc).
- **Ver detalle**: abre drawer con datos completos y selector de estado.

---

## 4. Detalle del pedido

- Componente **OrderDetailDrawer**: id/código, fecha, cliente, teléfono, email (si existe), notas, estado actual, botones para cambiar estado, tabla de ítems (producto, cantidad, precio unitario, subtotal), total.
- Al cambiar estado se llama `updateOrder`, se actualiza la lista y el drawer.

---

## 5. Dashboard

- **Pedidos recientes**: cuenta de pedidos de los **últimos 30 días** (sin mocks). Si hay 0 pedidos reales se muestra 0; si hay pedidos, el número es real.
- Subtítulo de la tarjeta: “Últimos 30 días” y “X total” (total de pedidos del negocio).
- Realtime: al llegar un INSERT en `wa_orders` para el `business_id`, se refresca la lista de pedidos y se muestra notificación/toast; el nuevo pedido se mapea con `status: 'pedido'`.
- **ActivityFeed**: usa los nuevos estados (pedido, en_preparacion, enviado, entregado, cancelado) para etiquetas y colores.

---

## 6. Creación de pedidos desde checkout

- **OrderConfirmation** (`/catalogo/:slug/checkout`): llama `createOrder(biz.id, { customerName, customerPhone, totalAmount, notes }, orderItems)`.
- **createOrder** (waBusinessService):
  - Inserta en **wa_orders** con `business_id`, `customer_name`, `customer_phone`, `customer_email` (opcional), `total_amount`, `subtotal` (o total), `currency: 'CLP'`, `status: 'pedido'`, `notes`.
  - Inserta en **wa_order_items** cada ítem con `order_id`, `product_id`, `product_name`, `product_price`, `quantity`, `subtotal`, `selected_options` (array).
- RLS: `wa_orders_anon_insert` y `wa_order_items_anon_insert` con `WITH CHECK (true)` permiten que el checkout público cree pedidos; el dueño del negocio solo ve los suyos por `wa_orders_owner_select` (vía `business_id` → `wa_businesses.user_id = auth.uid()`).
- Cada pedido creado desde el catálogo aparece en `/orders`, en las estadísticas del dashboard y en Realtime.

---

## 7. Realtime

- Ya existía: `ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_orders` (migración `20260309400000_realtime_wa_orders.sql`).
- En **Dashboard** y **Orders**: suscripción a `postgres_changes` en `wa_orders` con `filter: business_id=eq.${business.id}`.
- Al recibir INSERT: se refresca la lista con `getOrders(business.id)`, se muestra toast de nuevo pedido y se actualiza la tarjeta “Pedidos recientes” (al refrescar la lista el count de últimos 30 días se recalcula).

---

## 8. Servicios

- **getOrders(businessId, opts)**: listado con filtros opcionales `status`, `search`, `limit`, `offset`; devuelve `{ data, error, total }`.
- **getOrderById(orderId)**: un pedido con ítems (solo si pertenece al negocio del usuario por RLS).
- **updateOrder(orderId, updates)**: solo `status` (validado), `notes`, `internalNotes`.
- **createOrder(businessId, orderData, items)**: crea orden con `status: 'pedido'` e ítems con `selected_options`.
- **getBusinessOrderStats(businessId)**: `{ totalOrders, last7Days, last30Days, monthlyRevenue, byStatus }` (disponible para ampliar el dashboard si se quiere).

---

## 9. Archivos tocados

| Archivo | Cambios |
|--------|---------|
| `supabase/migrations/20260310500000_wa_orders_status_and_fields.sql` | Nuevo: estados, columnas, índices, CHECK |
| `src/services/waBusinessService.js` | Estados, mapOrderFromDb (customerEmail, subtotal, currency, selectedOptions), createOrder (pedido, campos), updateOrder (validación status), getOrders (opts, filtros), getOrderById, getBusinessOrderStats |
| `src/pages/orders/index.jsx` | 5 estados + “Todos”, orderShortId, búsqueda por id, OrderDetailDrawer, Ver detalle |
| `src/pages/orders/components/OrderDetailDrawer.jsx` | Nuevo: drawer con detalle y cambio de estado |
| `src/pages/order-confirmation/index.jsx` | Sin cambios (ya usaba createOrder con biz.id y ítems) |
| `src/pages/dashboard/index.jsx` | Realtime: status del nuevo pedido mapeado a `'pedido'` |
| `src/pages/dashboard/components/ActivityFeed.jsx` | STATUS_CONFIG con pedido, en_preparacion, enviado, entregado, cancelado |

---

## 10. Flujo de prueba

1. **Aplicar migración**
   ```bash
   supabase db push
   ```

2. **Checkout que crea pedido real**
   - Entrar como cliente al catálogo público: `/catalogo/{slug}`.
   - Añadir productos al carrito y ir a “Confirmar pedido”.
   - Completar nombre (y opcionalmente teléfono y notas) y pulsar “Confirmar y enviar por WhatsApp”.
   - Comprobar en Supabase (Table Editor) que existe una fila en `wa_orders` con `business_id` del negocio, `status = 'pedido'`, y filas en `wa_order_items` con ese `order_id`.

3. **Listado y detalle (dueño del negocio)**
   - Iniciar sesión como dueño del negocio.
   - Ir a **Pedidos** (`/orders`).
   - Ver el pedido recién creado (código, cliente, total, estado “Pedido”).
   - Filtrar por estado (Todos, Pedido, En preparación, etc.) y buscar por nombre o teléfono.
   - Abrir **Ver detalle**: comprobar datos, ítems y total.
   - Cambiar estado (por ejemplo a “En preparación”): guardar y comprobar que se actualiza en lista y drawer.

4. **Dashboard**
   - En el dashboard del mismo negocio, comprobar que la tarjeta **Pedidos recientes** muestra al menos 1 (y “X total”).
   - En “Actividad reciente” debe aparecer el pedido con estado “Pedido” (o el que hayas puesto).

5. **Realtime**
   - Con el panel del negocio abierto (dashboard o pedidos), desde otro dispositivo o ventana hacer un nuevo pedido desde el catálogo.
   - Comprobar que en la lista de pedidos (o en el dashboard) aparece el nuevo pedido sin recargar la página y, si está implementado, el toast de “¡Nuevo pedido!”.

---

## 11. Qué quedó funcionando

- Estados unificados en BD y UI (pedido, en_preparacion, enviado, entregado, cancelado).
- Checkout crea `wa_orders` + `wa_order_items` con `business_id` correcto y `status: 'pedido'`.
- Listado en `/orders` con filtros, búsqueda y código de pedido.
- Detalle en drawer con cambio de estado y tabla de ítems.
- Dashboard con “Pedidos recientes” y actividad basados en datos reales.
- Realtime para nuevos pedidos.
- Validación de estado en backend y badges en español en toda la UI.

## 12. Posibles mejoras (no hechas)

- Más métricas en el dashboard usando `getBusinessOrderStats` (total pedidos, últimos 7 días, ingresos del mes, por estado).
- Paginación en `/orders` usando `getOrders(..., { limit, offset })` si hay muchos pedidos.
- Búsqueda por ID de pedido en el backend (ahora el filtro `search` se aplica en cliente sobre la lista cargada; se podría pasar a la API con `opts.search` que ya existe).
