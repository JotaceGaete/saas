# Tarjeta “Entregado”: hora vs “Entregado en …”

## Comportamiento intencional

| Dato en cliente | Origen BD | Uso |
|-----------------|-----------|-----|
| `createdAt` | `created_at` | Siempre presente en pedidos creados por la app. |
| `deliveredAt` | `delivered_at` | Se escribe al **pasar a entregado** desde otro estado (`updateOrder` en `waBusinessService.js`). |

### Hora principal en tarjeta kanban

- Función: `getOrderCardTimeCaption` en `src/utils/orderDates.js`.
- Con **`delivered_at`**: **“Entregado HH:mm”** usando solo ese instante.
- **Sin `delivered_at`**: **“Entregado (sin hora registrada)”** — no se usa `createdAt` como hora de entrega.

`getOrderCardDisplayTimeIso` para `entregado` devuelve solo `deliveredAt` (sin fallback).

### Línea “Entregado en X min / Xd …”

- Función: `formatDeliveryDurationLabel(order)`.
- Requiere **ambos** `deliveredAt` y `createdAt`. Sin `deliveredAt` → **no se muestra** la línea.

## Cuándo falta `delivered_at`

1. **Pedidos antiguos** anteriores a la columna o al flujo que la rellena.
2. **Cambios de estado fuera de `updateOrder`** (SQL manual, migraciones, otro cliente) con `order_status = 'entregado'` pero sin tocar `delivered_at`.
3. **Transición rara**: solo se escribe `delivered_at` cuando el estado **anterior** no era ya `entregado` (`prevStatus !== 'entregado'`). Re-marcar entregado no sobrescribe la fecha (comportamiento actual).

## Mapeo desde BD

`mapOrderFromDb` asigna `deliveredAt: row?.delivered_at ?? null` — no hay otro nombre de campo; si la columna viene null, el cliente ve `deliveredAt === null`.

## Inspección en desarrollo

1. Abrir **Pedidos** con query: `?debugDeliveredAt=1` (solo en `import.meta.env.DEV`).
2. En consola se listan pedidos **entregados sin `deliveredAt`** (`console.table` con `id`, `createdAt`).
3. En cualquier momento en dev: `window.__inspectDeliveredAtGaps__()` devuelve el mismo array y lo registra.

## Backfill (opcional, en base de datos)

Si se considera fiable **`updated_at`** (u otra columna) como proxy del momento de entrega para filas `entregado` sin `delivered_at`, se puede actualizar en SQL de forma controlada; no está automatizado en la app.
