# Informe: Usuarios legacy (plan control) y Panel admin de usuarios

## 1. USUARIOS LEGACY CON PLAN CONTROL

### 1.1 De dónde sale el crédito

El crédito (ej. $432, $466 CLP o equivalente) aparece cuando un usuario **sube de plan** (upgrade) y el sistema aplica **prorrateo**: se calcula un crédito por el “tiempo no usado” del plan actual y se descuenta del precio del plan destino.

La fórmula está en las **Edge Functions** que calculan el cambio de plan:

- **Archivos:**  
  `supabase/functions/plan-change-preview/index.ts`  
  `supabase/functions/create-paddle-checkout/index.ts`  
  `supabase/functions/create-mp-preference/index.ts`

- **Lógica relevante (ej. en `plan-change-preview`):**

```ts
let creditAmount = 0;
if (changeType === 'upgrade' && currentPlanPrice > 0) {
  const rawCredit = (currentPlanPrice / 30) * remainingDaysFraction;
  creditAmount = Math.floor(rawCredit);
  creditAmount = Math.min(creditAmount, currentPlanPrice);
}
// finalAmount = targetPlanPrice - creditAmount
```

- **Campo que lleva el crédito al frontend/checkout:**  
  `creditAmount` en la respuesta del preview y en el `metadata` de `wa_payments` (si aplica).

Es decir: el crédito lo genera la **combinación** de:

1. `currentPlanSlug` del negocio (viene de `wa_businesses.plan_slug`).
2. Catálogo de precios donde ese plan tiene **precio > 0**.
3. `plan_expires_at` con fecha futura (días restantes).
4. Tipo de cambio = `upgrade`.

Si el plan actual se considera de pago (precio > 0), se aplica prorrateo y puede salir un crédito alto (ej. 432 CLP).

### 1.2 Qué tiene que ver el plan "control"

En las **tres** Edge Functions anteriores el catálogo de planes **sigue incluyendo "control"** con precio mayor que cero:

| Archivo                    | Catálogo (ej. CL)     | Precio "control" |
|---------------------------|------------------------|-------------------|
| plan-change-preview       | PLAN_CATALOG_CL / AR / USD | 500 CLP / 500 ARS / 5 USD |
| create-paddle-checkout    | PLAN_CATALOG_USD       | 5 USD             |
| create-mp-preference      | PLAN_CATALOG_CL / AR   | 500 CLP / 500 ARS |

Y en todas se usa el **orden de planes**:

```ts
const PLAN_ORDER = { starter: 0, control: 1, pro: 2, business: 3 };
```

Además:

- El **plan actual** se toma directamente del negocio:  
  `currentPlanSlug = (business).plan_slug ?? 'starter'` (sin normalizar).
- Si en algún entorno **no se aplicó** la migración que convierte `control` → `starter`, o se restauró una BD antigua, puede seguir existiendo `plan_slug = 'control'` en `wa_businesses`.
- En ese caso, al hacer upgrade a Pro/Full:
  - `currentPlanPrice = 500` (CLP) o 5 (USD),
  - `remainingDaysFraction` según `plan_expires_at`,
  - y se calcula un **crédito heredado** por ese “plan control” (ej. ~432 CLP para ~26 días).

En la **base de datos**, la migración `20260313200000_trial_system.sql` ya:

- Hace `UPDATE wa_businesses SET plan_slug = 'starter' WHERE plan_slug = 'control'`.
- Deja el CHECK de `plan_slug` solo en `('starter', 'pro', 'business')`.

Por tanto, en un entorno donde esa migración sí se aplicó, **en BD ya no debería haber `control`**. El problema puede darse si:

- La migración no está aplicada en algún ambiente, o
- Las **Edge Functions** siguen usando catálogos y lógica donde "control" tiene precio y entra en el prorrateo (por si en el pasado el negocio tenía `control` y algo lo volviera a leer, o por consistencia de código).

### 1.3 Dónde se genera y persiste el crédito

- **Cálculo:** En las tres Edge Functions, dentro de la función `computePlanChange` (o equivalente).
- **Respuesta al cliente:** Campo `creditAmount` (y `finalAmount`, `changeType`, etc.) en la respuesta del preview y en el flujo de checkout.
- **Persistencia:** En `wa_payments.metadata` se guarda el contexto del cambio (incl. datos de prorrateo) al crear el pago.

Ningún “campo mágico” adicional: el crédito es un **resultado calculado** a partir de plan actual, precios del catálogo y días restantes.

### 1.4 Cómo corregirlo sin romper Starter / Pro / Full

Objetivo: que usuarios que en el pasado tuvieron "control" **no reciban descuentos heredados** al subir a Pro o Full, y que el modelo actual (solo starter / pro / business) no se rompa.

#### a) Mapear control → starter en la lógica de prorrateo

En las **tres** Edge Functions, **antes** de llamar a `computePlanChange` (o al inicio de esa función), normalizar el plan actual:

- Si `currentPlanSlug === 'control'` → usar `'starter'` para el cálculo.

Con eso, en el cálculo:

- `currentPlanPrice` será el de starter (0), por tanto `creditAmount = 0` y no se aplica crédito por “control”.

Puedes hacerlo en un solo sitio si todas leen el plan del negocio en el mismo punto, por ejemplo:

```ts
const rawCurrent = (business.plan_slug ?? 'starter').toLowerCase();
const currentPlanSlug = rawCurrent === 'control' ? 'starter' : rawCurrent;
```

Y usar siempre `currentPlanSlug` (no `business.plan_slug`) en `computePlanChange`.

#### b) Desactivar crédito heredado de "control"

Con el mapeo anterior, al tratar "control" como "starter" en el cálculo, el crédito por plan actual queda en 0. No hace falta una regla aparte “desactivar crédito solo para control”: se desactiva por vía de precio 0.

Opcional y recomendable: en `computePlanChange`, si quieres ser explícito:

- Si `currentPlanSlug === 'control'` → forzar `creditAmount = 0` y no usar el precio de "control" del catálogo.

La opción más limpia es (a) y no tener "control" en los catálogos usados para prorrateo (ver siguiente punto).

#### c) Limpiar "control" en catálogos y validaciones

- En las tres Edge Functions:
  - Quitar `control` de `PLAN_ORDER` o tratarlo como alias de `starter` (solo para orden, no para precio).
  - En los catálogos (`PLAN_CATALOG_*`), **no** definir precio para `control` (o eliminarlo): así, si en algún flujo se usara "control", `catalog['control']?.price` sería 0 o undefined y el crédito seguiría siendo 0.
- Validación de planes válidos: no aceptar `planSlug === 'control'` como plan de destino; solo `starter`, `pro`, `business` (alineado con `wa_admin_change_plan` y con el CHECK de la BD).

#### d) Base de datos y scheduled changes

- La migración `20260313200000_trial_system.sql` ya mapea `plan_slug = 'control'` → `'starter'` en `wa_businesses`. Si en algún entorno no está aplicada, ejecutarla (o un script equivalente).
- Limpiar datos residuales:
  - `scheduled_plan_slug`: si en algún fila queda `scheduled_plan_slug = 'control'`, actualizar a `NULL` o a `'starter'` según la semántica de tu flujo (downgrade programado).
  - Lo mismo si tienes otros lugares que guarden `plan_slug` (vistas, cachés): asegurar que no quede "control".

Resumen de cambios recomendados:

1. **Edge Functions (plan-change-preview, create-paddle-checkout, create-mp-preference):**  
   Normalizar `currentPlanSlug`: si es `'control'` usar `'starter'` antes de calcular prorrateo.
2. **Mismo lugar:** No dar precio a "control" en los catálogos (o quitarlo) y no aceptar "control" como plan destino.
3. **BD:** Confirmar migración que pone `plan_slug = 'starter'` donde había `'control'` y limpiar `scheduled_plan_slug = 'control'` si existe.

Con esto se corrige el crédito heredado y se mantiene intacto el comportamiento de Starter / Pro / Full.

---

## 2. PANEL ADMIN DE USUARIOS

### 2.1 Funciones solicitadas

- Listar usuarios  
- Ver usuario (detalle)  
- Crear usuario  
- Editar usuario  
- Suspender usuario  
- Habilitar usuario suspendido  
- Eliminar usuario  
- Cambiar plan manualmente (por negocio)  
- Ver trial activo / fecha de expiración  
- Asignar o quitar rol admin  

Requisitos: suspender no borra datos; eliminar con confirmación; mostrar plan actual, estado y rol; poder limpiar usuarios de prueba y administrar usuarios reales.

### 2.2 Tablas y entidades afectadas

| Entidad / tabla        | Uso actual / relevante para usuarios |
|------------------------|--------------------------------------|
| **auth.users**         | Usuarios de Supabase Auth (id, email, created_at, banned_until, raw_user_meta_data, app_metadata). No accesible por RLS desde el cliente; solo vía Admin API o service_role. |
| **wa_businesses**      | Un usuario puede tener 1+ negocios. Aquí están plan_slug, plan_expires_at, trial_expires_at, is_active (del negocio), scheduled_plan_slug, scheduled_change_at. |
| **wa_admin_business_overview** | Vista que une negocios + user_email (auth.users). Sirve para listar “negocios con su usuario”. |
| **wa_admin_audit_log** | Auditoría de cambios de plan y otras acciones admin (por negocio). |
| **wa_admin_change_plan** (RPC) | Cambio de plan por negocio; ya existe. |

No existe hoy una “tabla de usuarios” en `public`: el concepto de usuario es `auth.users`; el panel admin trabaja sobre **negocios** y, vía JOIN con `auth.users`, muestra el email del usuario.

### 2.3 Campos necesarios (resumen)

Para **listar/ver usuarios** en el panel necesitas al menos:

- **De usuario (auth):** id, email, created_at, banned_until (suspensión), role (app_metadata.role o user_metadata.role).
- **De negocio (para plan/trial):** por cada negocio del usuario: plan_slug, plan_expires_at, trial_expires_at, is_active, scheduled_plan_slug, scheduled_change_at.

Para **suspender/habilitar:** `auth.users.banned_until` (Supabase Auth).  
Para **rol admin:** `app_metadata.role = 'admin'` (asignar/quitar vía Auth Admin API).  
Para **crear/editar/eliminar usuario:** Auth Admin API (createUser, updateUserById, deleteUser).

### 2.4 Qué ya existe y qué falta

**Ya existe:**

- Panel admin (rutas `/admin`, `/admin/payments`).
- Listado de **negocios** con user_email y plan (vista `wa_admin_business_overview`).
- Cambio de plan por **negocio** (`wa_admin_change_plan`) y extensión de plan (`wa_admin_extend_plan`).
- En la vista/negocio: plan_slug, plan_expires_at, trial_expires_at (trial activo y fecha de expiración).
- Rol admin: determinado por `app_metadata.role === 'admin'` (o user_metadata), comprobado con `wa_is_admin()` y en el front (RequireAdmin, AuthContext).
- Auditoría de acciones por negocio en `wa_admin_audit_log`.

**No existe (o no está expuesto):**

- Listado de **usuarios** (auth.users) desde el cliente; solo se ven usuarios indirectamente como “dueños” de negocios en la vista de negocios.
- Vista detalle “usuario” (un usuario y sus negocios, estado de auth, banned_until, role).
- Crear / editar / suspender / habilitar / eliminar **usuario** desde el panel (requiere Auth Admin API, típicamente desde Edge Function con service_role).
- Asignar/quitar rol admin desde el panel (Auth Admin API).
- Flujo de “eliminar usuario” con confirmación en la UI.
- Concepto explícito de “suspender usuario” (bloquear login): en BD está `banned_until` en auth.users, pero no hay UI ni API propia que lo setee.

### 2.5 Propuesta de implementación paso a paso

#### Fase 1: Acceso a datos de usuarios (listar / ver)

1. **Edge Function “admin-list-users” (o similar)**  
   - Con service_role, leer de `auth.users` los campos: id, email, created_at, banned_until, raw_user_meta_data (o solo role), app_metadata.  
   - Opcional: para cada usuario, contar o listar sus negocios desde `wa_businesses` (por user_id).  
   - Devolver lista paginada/filtrable (por email, estado, etc.).  
   - Proteger la ruta: solo si el JWT del request es de un usuario admin (comprobar app_metadata.role o llamar a una RPC que use `wa_is_admin()`).

2. **Edge Function “admin-get-user” (detalle)**  
   - Input: user_id.  
   - Con service_role: leer auth.users por id; leer wa_businesses donde user_id = id (con plan_slug, plan_expires_at, trial_expires_at, is_active, etc.).  
   - Respuesta: usuario + lista de negocios con plan/trial.  
   - Misma protección por rol admin.

3. **Front: página “Usuarios” en admin**  
   - Ruta ej. `/admin/users`.  
   - Listado: tabla con columnas usuario (email, id), estado (activo/suspendido según banned_until), rol (admin/sin rol), plan/estado por negocio (ej. “Pro – trial hasta dd/mm”), acciones (Ver, Suspender, etc.).  
   - Al hacer clic en “Ver”, ir a detalle (usuario + negocios, trial, plan, auditoría reciente).

#### Fase 2: Suspender / habilitar usuario

4. **Edge Function “admin-set-user-banned”**  
   - Parámetros: user_id, banned (boolean).  
   - Si banned === true: auth.admin.updateUserById(user_id, { banned_until: '9999-12-31' o fecha lejana }).  
   - Si banned === false: updateUserById(..., { banned_until: null }).  
   - Solo llamable por admin (verificar JWT + role).  
   - No tocar wa_businesses ni borrar datos; solo bloqueo de login.

5. **Front**  
   - En listado y detalle de usuario: botón “Suspender” / “Habilitar” según estado.  
   - Confirmación corta (“El usuario no podrá iniciar sesión”).  
   - Llamar a la Edge Function y refrescar estado.

#### Fase 3: Crear / editar usuario

6. **Edge Function “admin-create-user”**  
   - Parámetros: email, password (opcional), user_metadata (nombre, etc.).  
   - Usar auth.admin.inviteUserByEmail o createUser.  
   - Devolver id y email (y enlace de invitación si aplica).  
   - Solo admins.

7. **Edge Function “admin-update-user”**  
   - Parámetros: user_id, email y/o user_metadata (y lo que permita updateUserById).  
   - Solo admins.

8. **Front**  
   - “Crear usuario”: formulario (email, contraseña opcional, nombre) que llama a admin-create-user.  
   - “Editar usuario”: formulario en la vista detalle que llama a admin-update-user.

#### Fase 4: Eliminar usuario

9. **Edge Function “admin-delete-user”**  
   - Parámetros: user_id.  
   - Opción A: auth.admin.deleteUser(user_id). Supabase borra en cascada lo que esté definido (depende de FKs).  
   - Opción B: solo marcar “eliminado” si introduces una columna o tabla de soft-delete en tu esquema (menos estándar con Auth).  
   - Comprobar que el usuario no sea el último admin (opcional).  
   - Solo admins.

10. **Front**  
    - Botón “Eliminar usuario” en detalle (y/o en fila del listado).  
    - **Modal de confirmación** con texto claro (“Se eliminará el usuario y sus datos asociados. Esta acción no se puede deshacer”).  
    - Doble confirmación (ej. escribir “ELIMINAR” o checkbox).  
    - Llamar a admin-delete-user y redirigir al listado.

#### Fase 5: Rol admin y plan/trial (ya casi todo está)

11. **Asignar/quitar rol admin**  
    - Edge Function “admin-set-user-role”: auth.admin.updateUserById(user_id, { app_metadata: { role: 'admin' } }) o sin role para quitar.  
    - Front: en detalle de usuario, toggle o botón “Es admin” que llame a esta función.

12. **Cambio de plan y trial**  
    - Ya lo tienes por **negocio**: desde el panel de pagos/negocios usas `wa_admin_change_plan` y `wa_admin_extend_plan`.  
    - En la nueva vista de **usuario** (detalle), mostrar sus negocios y para cada uno: plan actual, trial_expires_at, plan_expires_at, y botón “Cambiar plan” que lleve al flujo existente (o un modal que llame a wa_admin_change_plan).  
    - No hace falta nueva lógica de “cambiar plan de usuario”: se sigue cambiando por negocio; la UI de usuarios solo agrupa por usuario y muestra/actúa sobre sus negocios.

#### Fase 6: Ajustes y seguridad

13. **RLS / políticas**  
    - Las tablas `wa_*` ya tienen políticas para admins.  
    - auth.users no se expone por PostgREST al cliente; todo el acceso a usuarios debe ser vía Edge Functions con service_role y comprobación de que el llamante es admin.

14. **Navegación y permisos**  
    - Añadir en el sidebar del panel admin un enlace “Usuarios” a `/admin/users`.  
    - Mantener RequireAdmin en todas las rutas de admin.

15. **Limpieza de usuarios de prueba**  
    - Con el listado y filtros (ej. por email, por fecha), el admin puede identificar cuentas de prueba y usar “Suspender” o “Eliminar” con confirmación, sin tocar otros datos si solo suspende.

### 2.6 Resumen de tablas y campos (referencia rápida)

- **auth.users (Supabase):** id, email, created_at, banned_until, raw_user_meta_data, app_metadata.  
- **wa_businesses:** id, user_id, plan_slug, plan_expires_at, trial_expires_at, is_active, scheduled_plan_slug, scheduled_change_at, name, slug, email, …  
- **wa_admin_business_overview:** vista que ya incluye user_email, plan, trial, effective_plan, is_trial.  
- No hace falta nueva tabla para “usuarios” si usas Edge Functions que lean auth.users; si prefieres no tocar Auth desde el panel, podrías tener una tabla “copia” de usuarios (sincronizada por trigger o job) solo con id, email, created_at, banned_until, role, pero es más mantenimiento.

Con esta propuesta tienes un informe claro del origen del crédito legacy, cómo corregirlo, y los pasos para ampliar el panel admin a gestión de usuarios (listar, ver, crear, editar, suspender, habilitar, eliminar con confirmación, cambiar plan por negocio, ver trial, asignar/quitar rol admin) sin romper Starter/Pro/Full ni borrar datos al suspender.
