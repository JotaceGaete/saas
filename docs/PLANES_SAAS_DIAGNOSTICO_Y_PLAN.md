# Planes SaaS – Diagnóstico y plan de implementación

## 1. Diagnóstico de la lógica actual

### 1.1 Nomenclatura y planes actuales

| Tu pedido | Código actual | Notas |
|-----------|----------------|-------|
| Free | `starter` | Coincide (gratis). |
| Pro | `pro` | Coincide. |
| Full | `business` | En UI se muestra como "Full". |

No hay plan "control" en BD (ya migrado a `starter` en `20260313200000_trial_system.sql`).

### 1.2 Límites actuales vs deseados

**Base de datos** (fuente actual en backend):

- `wa_plan_max_products(p_plan)` en `supabase/migrations/20260313200000_trial_system.sql`:
  - `starter`: 10
  - `pro`: **50**
  - `business`: NULL (ilimitado)
- `wa_plan_max_orders_per_month(p_plan)`:
  - `starter`: 30
  - `pro`: NULL
  - `business`: NULL

**Frontend** (`src/constants/plans.js` – `PLAN_LIMITS`):

- `starter`: maxProducts 10, maxOrdersPerMonth 30
- `pro`: maxProducts **50**, maxOrdersPerMonth null
- `business`: maxProducts null, maxOrdersPerMonth null

**Deseado:**

- Free (starter): 10 productos activos, 30 transacciones/mes (ya está bien).
- Pro: **100** productos (no 50), transacciones ilimitadas (ya está bien).
- Full (business): ilimitado + funciones avanzadas (ya está bien).

**Problemas detectados:**

1. **Doble fuente de verdad**: Límites definidos en (a) funciones SQL `wa_plan_max_products` / `wa_plan_max_orders_per_month` y (b) `src/constants/plans.js`. Cualquier cambio (ej. Pro = 100) hay que hacerlo en ambos sitios.
2. **Pro = 50 en ambos**: Hay que pasarlo a 100 en BD y en frontend (y que la única fuente sea la BD o una tabla de planes).

### 1.3 Productos: estados y límite

- **Estado actual**: Solo `is_active` (boolean) en `wa_products`. No existe `inactive` ni `archived` como estados diferenciados.
- **Conteo para límite**: Las funciones `wa_check_product_limit` y `wa_get_plan_usage` cuentan `WHERE is_active = true`. Correcto.
- **Catálogo público**: RLS `wa_products_public_read` usa `is_active = true`. Solo productos activos se muestran. Correcto.
- **Crear producto**: `waBusinessService.createProduct` valida el límite en **frontend** con `getPlanLimits(effectivePlan)` y `getActiveProductCount`. No hay trigger ni RPC que bloquee el INSERT en BD.
- **Activar producto**: `waBusinessService.updateProduct` valida al poner `isActive === true` en **frontend** (mismo límite). No hay validación en BD en el UPDATE.

**Conclusión**: La validación de límite de productos es solo en frontend; se puede bypassear con llamadas directas a la API. Hace falta validación en backend (trigger o RPC).

### 1.4 Transacciones (pedidos) – plan Free

- **Límite**: 30 pedidos/mes para starter; en BD y frontend está correcto.
- **Validación**: En `waBusinessService.createOrder` se valida en **frontend** (plan efectivo, `getPlanLimits`, conteo de pedidos del mes). Si se supera, se devuelve error con `code: 'PLAN_LIMIT_EXCEEDED'`.
- **Inserción**: El insert a `wa_orders` lo hace el cliente (Supabase). RLS permite `INSERT TO public` en `wa_orders` y `wa_order_items` (`WITH CHECK (true)`). No hay trigger que compruebe el límite antes del INSERT.
- **Conclusión**: Un cliente que llame directamente a PostgREST puede insertar pedidos aunque se haya superado el límite. La validación debe estar en backend (trigger en `wa_orders` o Edge Function que cree el pedido).

### 1.5 Funciones RPC existentes (no usadas para bloquear)

- `wa_check_product_limit(p_business_id)`: devuelve TRUE si puede crear/activar más productos. No se usa en INSERT/UPDATE de `wa_products`.
- `wa_check_order_limit(p_business_id)`: devuelve TRUE si puede crear más pedidos este mes. No se usa en INSERT de `wa_orders`.
- `wa_get_plan_usage(p_business_id)`: usado en frontend para mostrar uso (productos activos, pedidos del mes, límites). Incluye auto-downgrade si el plan venció.

### 1.6 Downgrade de plan

- **Cambio inmediato (admin)**: `wa_admin_change_plan` solo actualiza `wa_businesses` (plan_slug, plan_expires_at, etc.). No toca productos.
- **Cambio programado**: `wa_apply_scheduled_plan_changes` solo actualiza `plan_slug` (y limpia scheduled_*). No desactiva productos.
- **Efecto**: Si un negocio pasa de Pro (50 activos) a Free (10), los 50 siguen con `is_active = true`. El límite solo se aplica al **crear** o **activar** otro producto (en frontend). No hay “bajar a inactive” los excedentes ni una sola fuente de verdad para el límite en ese momento.

**Deseado**: En downgrade, no borrar datos; dejar todos los productos existentes pero solo N activos según el nuevo plan; el resto pasar a `inactive`; el usuario elige cuáles reactivar.

### 1.7 Pedidos históricos

- Los ítems de pedido guardan `product_name`, `product_price`, etc. No dependen de que el producto siga activo. Las estadísticas por pedidos no se rompen si un producto pasa a inactivo. Correcto para no tocar historial.

---

## 2. Archivos que se modificarán

### 2.1 Base de datos (nuevas migraciones)

- **Nueva migración 1**: Tabla `wa_plans` (fuente única de límites) y/o actualizar funciones `wa_plan_max_*` para leer de esa tabla; ajustar Pro a 100.
- **Nueva migración 2**: En `wa_products`, añadir estado (p. ej. `status`: active | inactive | archived) o conservar `is_active` y añadir `archived`; adaptar RLS y funciones que cuentan “activos”.
- **Nueva migración 3**: Trigger en `wa_products` (BEFORE INSERT / UPDATE) que llame a lógica de límite (o a `wa_check_product_limit`) y rechace si se supera.
- **Nueva migración 4**: Trigger en `wa_orders` (BEFORE INSERT) que compruebe límite mensual (o llame a `wa_check_order_limit`) y rechace si el negocio es Free y ya tiene 30 pedidos en el mes.
- **Nueva migración 5**: Al cambiar plan a uno con menos productos (downgrade), desactivar excedentes: función llamada desde `wa_admin_change_plan` y desde `wa_apply_scheduled_plan_changes` (o trigger sobre `wa_businesses`) que ponga `inactive` (o `is_active = false`) a los productos que excedan el nuevo máximo (p. ej. dejar solo 10 activos por antigüedad o por orden definido).

### 2.2 Backend (Supabase)

- **Funciones SQL** (en migraciones):
  - `wa_plan_max_products` / `wa_plan_max_orders_per_month`: que lean de `wa_plans` si se crea tabla, o dejar en funciones pero con Pro = 100.
  - Nueva función o extensión de `wa_admin_change_plan` y de `wa_apply_scheduled_plan_changes` para ejecutar “desactivar excedentes” al bajar de plan.
- **Triggers**: ya citados en 2.1 (productos y pedidos).
- **Edge Functions**: si el flujo de checkout pasara por una Edge Function para crear pedido, habría que validar ahí también; con trigger en `wa_orders` sería suficiente y no obligatorio tocar Edge Functions.

### 2.3 Frontend

- **`src/constants/plans.js`**: Ajustar `PLAN_LIMITS.pro.maxProducts` a 100. Idealmente que los límites “de exhibición” se obtengan del backend (wa_get_plan_usage / wa_plans) y no estén hardcodeados para lógica de negocio; al menos alinear 100 con la BD.
- **`src/services/waBusinessService.js`**:
  - `createProduct`: mantener validación en cliente como UX; el backend será la autoridad.
  - `updateProduct`: igual al activar producto.
  - `createOrder`: mantener validación en cliente; mensaje de error unificado (ver 4.2).
- **`src/pages/public-catalog/index.jsx`** y **`src/pages/order-confirmation/index.jsx`**: Mostrar mensaje claro cuando `orderError.code === 'PLAN_LIMIT_EXCEEDED'`: *"Tu plan Free permite 30 pedidos por mes. Actualiza a Pro para recibir pedidos ilimitados."*
- **Pantallas de productos**: Si se añade estado `archived`, listar/filtrar por active / inactive / archived y permitir “archivar” en lugar de solo desactivar.

### 2.4 Resumen por archivo

| Ámbito | Archivo / elemento |
|--------|---------------------|
| DB | Nueva migración: `wa_plans` (opcional) + actualizar límites Pro a 100 |
| DB | Nueva migración: `wa_products.status` o `archived` |
| DB | Nueva migración: triggers productos y pedidos |
| DB | Nueva migración: lógica downgrade (desactivar excedentes) |
| Backend | `wa_plan_max_products`, `wa_plan_max_orders_per_month`, `wa_admin_change_plan`, `wa_apply_scheduled_plan_changes` |
| Frontend | `src/constants/plans.js` |
| Frontend | `src/services/waBusinessService.js` (createProduct, updateProduct, createOrder) |
| Frontend | `src/pages/public-catalog/index.jsx`, `src/pages/order-confirmation/index.jsx` |
| Frontend | Páginas de productos (estados active/inactive/archived si aplica) |

---

## 3. Cambios backend (detalle)

### 3.1 Fuente única de verdad para límites

- **Opción A – Tabla `wa_plans`**  
  - Columnas: `slug` (starter, pro, business), `max_products` (int, nullable), `max_orders_per_month` (int, nullable).  
  - `wa_plan_max_products(p_plan)` y `wa_plan_max_orders_per_month(p_plan)` leen de esa tabla.  
  - Ventaja: cambiar límites sin nuevas migraciones.  
  - Inconveniente: más cambios y posible caché en frontend.

- **Opción B – Sin tabla**  
  - Dejar las funciones actuales y solo cambiar el valor de Pro de 50 a 100 en SQL.  
  - Ventaja: mínimo cambio.  
  - Inconveniente: la “fuente única” sigue siendo la BD, pero el frontend debe seguir alineado (o leer vía `wa_get_plan_usage`).

Recomendación: Opción B para esta iteración (Pro = 100 en BD y en frontend); Opción A en una fase posterior si se quiere administrar planes sin desplegar código.

### 3.2 Validaciones obligatorias en backend

- **Productos**  
  - Trigger `BEFORE INSERT` en `wa_products`: si `is_active = true` (o `status = 'active'`), comprobar con lógica equivalente a `wa_check_product_limit(business_id)`; si devuelve FALSE, `RAISE EXCEPTION` con mensaje claro.  
  - Trigger `BEFORE UPDATE` en `wa_products`: si se está pasando a activo (`is_active = true` o `status = 'active'`), misma comprobación; si no hay cupo, `RAISE EXCEPTION`.

- **Pedidos**  
  - Trigger `BEFORE INSERT` en `wa_orders`: para el `business_id` del nuevo pedido, comprobar con lógica equivalente a `wa_check_order_limit(business_id)`; si FALSE, `RAISE EXCEPTION` con mensaje tipo: *"Tu plan Free permite 30 pedidos por mes. Actualiza a Pro para recibir pedidos ilimitados."*  
  - Así se valida siempre, aunque el insert venga del catálogo público o de cualquier cliente.

### 3.3 Downgrade: no borrar datos; desactivar excedentes

- Al ejecutar `wa_admin_change_plan` o `wa_apply_scheduled_plan_changes` y el plan resultante sea uno con límite de productos (p. ej. starter = 10):
  - Obtener `max_products` del nuevo plan.
  - Contar productos activos del negocio.
  - Si `active_count > max_products`, actualizar a `inactive` (o `is_active = false`) los que excedan. Criterio sugerido: por `updated_at ASC, id ASC` para dejar activos los “primeros” N (determinístico). No borrar filas.
- Los pedidos históricos no se tocan; siguen mostrando el producto por nombre/precio guardado en el ítem.

### 3.4 Pedidos históricos

- No cambiar lógica de `wa_order_items`: siguen con `product_name`, `product_price`, etc. Si un producto pasa a inactivo o archivado, los pedidos antiguos y las estadísticas siguen correctos.

---

## 4. Cambios frontend

### 4.1 Límites y constantes

- En `src/constants/plans.js`, poner `PLAN_LIMITS.pro.maxProducts = 100` (y comentar que debe coincidir con backend / que el backend es la autoridad).
- Si más adelante se usa tabla `wa_plans`, se puede dejar en `plans.js` solo labels/precios y obtener límites desde `wa_get_plan_usage` o un endpoint de planes.

### 4.2 Mensaje al bloquear nuevo pedido (Free, 30/mes)

- En `public-catalog` y `order-confirmation`, al recibir error de `createOrder` con `orderError.code === 'PLAN_LIMIT_EXCEEDED'` (o mensaje que contenga el límite), mostrar:
  - *"Tu plan Free permite 30 pedidos por mes. Actualiza a Pro para recibir pedidos ilimitados."*
- El backend (trigger) puede devolver un código o mensaje estándar para que el frontend muestre siempre el mismo texto.

### 4.3 Productos: estados active / inactive / archived

- Si en BD se añade `status` (active, inactive, archived):
  - Listado de productos: filtros por estado; solo `active` cuenta para el límite y se muestra en el catálogo.
  - Al bajar de plan, el backend pondrá los excedentes en `inactive`; el usuario puede elegir cuáles volver a `active` (hasta el límite), y opcionalmente “archivar” para ocultar sin borrar.
- Si en BD solo se añade `archived` (boolean) y se mantiene `is_active`:
  - “Activo” = `is_active = true AND archived = false` (cuenta para límite y catálogo).
  - “Inactivo” = `is_active = false`, “Archivado” = `archived = true` (no cuenta para límite).

### 4.4 Contador mensual de pedidos

- El reinicio “cada mes” ya está implícito: las funciones cuentan `created_at >= date_trunc('month', now())`. No requiere cambio en frontend más allá de mostrar el uso (ya existe con `wa_get_plan_usage`).

---

## 5. Posibles migraciones de base de datos

| Migración | Descripción |
|-----------|-------------|
| **Límites** | Crear tabla `wa_plans` (opcional) o solo actualizar `wa_plan_max_products` para Pro = 100. |
| **Estados de producto** | Añadir a `wa_products` columna `status` (`active` \| `inactive` \| `archived`) con default `active`, o añadir `archived` boolean default false. Si se usa `status`, migrar datos: `is_active = true` → `status = 'active'`, `is_active = false` → `status = 'inactive'`. Ajustar RLS y vistas/funciones que usen `is_active`. |
| **Trigger productos** | `BEFORE INSERT OR UPDATE` en `wa_products` que compruebe límite de productos activos del plan y lance excepción si se supera. |
| **Trigger pedidos** | `BEFORE INSERT` en `wa_orders` que compruebe límite de pedidos del mes (plan Free) y lance excepción si se supera. |
| **Downgrade** | Función `wa_deactivate_excess_products(p_business_id, p_new_plan_slug)` que, si el nuevo plan tiene `max_products` no nulo, deje solo N productos activos y ponga el resto en inactive. Llamarla desde `wa_admin_change_plan` y desde `wa_apply_scheduled_plan_changes` cuando el nuevo plan sea de menor techo de productos. |

---

## 6. Casos borde detectados

1. **Cambio de plan en el mismo mes**  
   - De Free a Pro a mitad de mes: ya no aplica límite de 30. De Pro a Free: a partir del cambio sí aplica 30; el conteo mensual ya usa `date_trunc('month', now())`, correcto.

2. **Downgrade con muchos productos**  
   - Criterio de qué N productos quedan activos: definir orden (ej. más recientemente actualizados primero, o más antiguos primero). Dejar documentado y estable (p. ej. “los que excedan se desactivan por `updated_at ASC, id ASC`”).

3. **Usuario reactiva productos uno a uno**  
   - Al activar, el trigger de `wa_products` impide superar el límite; el frontend ya evita activar si no hay cupo. Sin problema.

4. **Pedidos desde varios clientes a la vez**  
   - Dos peticiones que insertan el pedido 30 y 31 en el mismo mes: el trigger rechazará una. El cliente verá error; mensaje claro en frontend.

5. **Trial vencido**  
   - `wa_get_effective_plan` y `wa_expire_trials` ya dejan el plan en starter. Al aplicar límites con el plan efectivo, Free (10 productos, 30 pedidos) se aplica correctamente después del trial.

6. **Catálogo público y RLS**  
   - Si se introduce `status`, la política `wa_products_public_read` debe seguir mostrando solo productos que cuenten como “activos” (p. ej. `status = 'active'` o `is_active = true AND (archived IS NOT TRUE)`).

7. **Orden de ejecución en downgrade**  
   - Primero actualizar `wa_businesses.plan_slug`, luego ejecutar “desactivar excedentes” con el nuevo plan. Así las funciones de límite ven ya el plan correcto.

8. **Idioma y mensajes**  
   - Los mensajes de excepción en triggers son para logs y para el cliente; conviene que el frontend no dependa del texto exacto sino de un código (ej. `PLAN_LIMIT_EXCEEDED`) si PostgREST lo expone en la respuesta de error.

---

## 7. Resumen de prioridades

1. **Backend**: Triggers en `wa_products` y `wa_orders` para que nunca se superen los límites, independientemente del frontend.  
2. **Backend**: Pro = 100 en `wa_plan_max_products` (y alinear frontend).  
3. **Backend**: En downgrade, desactivar excedentes de productos (no borrar).  
4. **Frontend**: Mensaje unificado al bloquear pedido por límite Free.  
5. **DB/UX**: Estados de producto (active / inactive / archived) según diseño acordado (columna `status` o `archived`).  
6. **Opcional**: Tabla `wa_plans` como única fuente de límites para futuras ampliaciones.

Si quieres, el siguiente paso puede ser implementar en este orden: (1) migración de límites y triggers, (2) lógica de downgrade, (3) cambios de frontend y (4) estados de producto con migración de datos.
