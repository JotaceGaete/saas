# Biblioteca de plantillas de catálogo — Arquitectura

**Estado:** Fase 1 entregada (DB + migración + servicio). UI admin pendiente.
**Objetivo:** biblioteca de plantillas administrable por el equipo de Ventalink, sin perder el catálogo automático que elimina la pantalla vacía del onboarding.

---

## 1. Contexto: el sistema actual (que NO se reemplaza)

Flujo de onboarding vigente:

1. El usuario se registra y entra a `/business-configuration`.
2. Al guardar el **rubro principal**, `seedTemplateProductsIfEmpty()` (`src/services/productTemplateService.js`) busca un template para ese rubro en `src/utils/productTemplates.js` (datos hardcodeados en JS).
3. Si el negocio **no tiene productos reales** (los drafts no cuentan), inserta los productos de ejemplo en `wa_products` y devuelve el branding (logo SVG data-URL + cover Unsplash).
4. El caller aplica logo/cover **solo si el negocio no tiene imágenes propias**, y redes sociales demo una única vez (flag `demoSocialLinksApplied`).

Templates actuales: `ropa` (rubro `ropa`) y `restaurante` (rubro `comida-y-bebidas`), mapeados en `RUBRO_SLUG_TO_TEMPLATE`.

**Este flujo sigue funcionando exactamente igual.** La fase 1 no toca ninguno de esos archivos.

## 2. Arquitectura propuesta

```
                    ┌─────────────────────────────┐
                    │   Biblioteca de plantillas  │
                    │  catalog_templates (+hijas) │
                    │  seed = mismos datos que    │
                    │  productTemplates.js        │
                    └──────────┬──────────────────┘
              lectura admin    │      lectura usuario
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│ Panel admin       │  │ applyTemplate()  │  │ Onboarding (fase 3) │
│ /admin/catalog-   │  │ manual, aditivo  │  │ lee DB por          │
│ templates (fase 2)│  │                  │  │ rubro_slug, con     │
│ CRUD + duplicar + │  │                  │  │ fallback al JS      │
│ desactivar        │  │                  │  │ hardcodeado         │
└──────────────────┘  └────────┬─────────┘  └─────────┬───────────┘
                               ▼                      ▼
                  wa_business_categories     wa_products + branding
                  wa_products + branding     (idéntico a hoy)
```

Componentes:

| Pieza | Archivo | Estado |
|---|---|---|
| Migración DB + seed | `supabase/migrations/20260610000000_catalog_templates.sql` | ✅ Fase 1 |
| Servicio de biblioteca | `src/services/catalogTemplateService.js` | ✅ Fase 1 |
| Onboarding automático | `productTemplateService.js` + `productTemplates.js` | Sin cambios |
| Panel admin | `/admin/catalog-templates` | Fase 2 |
| Switch del onboarding a DB | `seedTemplateProductsIfEmpty` lee biblioteca con fallback | Fase 3 |
| Biblioteca visible al usuario final | opcional | Fase 4 |

## 3. Diseño de base de datos

### `catalog_templates`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | ej. "Ropa Básica" |
| `slug` | TEXT UNIQUE | identificador estable |
| `description` | TEXT | |
| `category` | TEXT | agrupador en la biblioteca (Moda, Gastronomía…) |
| `preview_image_url` | TEXT | imagen para la tarjeta de la biblioteca |
| `banner_url` | TEXT | → `wa_businesses.cover_image_url` al aplicar |
| `logo_url` | TEXT | → `wa_businesses.logo_url` (soporta data-URL SVG) |
| `is_active` | BOOLEAN | desactivar = ocultar sin borrar |
| `rubro_slug` | TEXT UNIQUE NULL | **vínculo con onboarding**: plantilla que se siembra para ese rubro; NULL = solo manual |
| `source` | `system`\|`custom` | `system` = seed equivalente al JS (el código puede depender de ellas) |
| `created_at` / `updated_at` | TIMESTAMPTZ | trigger `wa_set_updated_at` |

`rubro_slug` y `source` son las dos columnas agregadas sobre la propuesta original; son las que permiten cumplir el requisito 6 (un mismo template sirve para onboarding **y** biblioteca) sin tabla intermedia.

### `catalog_template_categories`

`id`, `template_id` (FK CASCADE), `name`, `sort_order`, `created_at`. UNIQUE `(template_id, name)`.

Al aplicar se crean como `wa_business_categories` (los productos siguen usando `category` TEXT, igual que hoy — no se introduce FK de categoría en productos).

### `catalog_template_products`

`id`, `template_id` (FK CASCADE), `name`, `description`, `price NUMERIC(12,2)`, `image_url`, `thumbnail_url` (agregado: `wa_products` usa card + thumbnail), `category_name` (TEXT, igual semántica que `wa_products.category`), `sort_order`, `created_at`.

### RLS

- **SELECT** (authenticated): plantillas activas para todos; inactivas solo admin (`wa_is_admin()`). Necesario para que `applyTemplate` corra con la sesión del usuario.
- **INSERT/UPDATE/DELETE**: solo `wa_is_admin()`.
- Sin acceso `anon`: la biblioteca no es pública.

### Seed

La migración inserta "Ropa Básica" (`rubro_slug='ropa'`) y "Restaurante" (`rubro_slug='comida-y-bebidas'`) con **exactamente los mismos** productos, precios, fotos Unsplash y logos SVG data-URL que `productTemplates.js`. Idempotente (`ON CONFLICT (slug) DO NOTHING`).

## 4. Servicio: `catalogTemplateService.js`

| Función | Comportamiento |
|---|---|
| `getTemplates({ includeInactive })` | Lista cabeceras; admin puede incluir inactivas |
| `getTemplate(templateId)` | Cabecera + categorías + productos |
| `getTemplateForRubroSlug(rubroSlug)` | Equivalente DB de `getTemplateForRubro()`; listo para el switch de fase 3 |
| `applyTemplate(businessId, templateId, options)` | Ver reglas abajo |
| `duplicateTemplate(templateId)` | Copia completa: nace `is_active=false`, `rubro_slug=null`, `source='custom'` |

### Reglas de `applyTemplate` (requisito 5)

- **Nunca elimina ni modifica productos existentes.** Los productos de la plantilla se agregan al final (`sort_order` después del máximo actual). No existe ningún `delete` en el servicio.
- Categorías: se crean solo las que no existan (match por slug); las del negocio se respetan.
- Branding: logo/banner solo si el negocio **no** tiene imagen propia — misma semántica que el onboarding. `overwriteBranding: true` permite pisarlas, pero el caller (UI) debe haber pedido confirmación explícita antes.
- Opciones `applyProducts` / `applyCategories` / `applyBranding` permiten aplicar parcialmente.
- Plantillas desactivadas no se pueden aplicar.

## 5. Compatibilidad con el onboarding (requisito 6)

- **Fase 1 (esta):** el onboarding sigue leyendo el JS hardcodeado. La DB queda sembrada con los mismos datos → no hay duplicación *de contenido divergente*: el seed es una copia 1:1 y el JS pasa a ser la "fuente de respaldo".
- **Fase 3:** `seedTemplateProductsIfEmpty` intenta primero `getTemplateForRubroSlug(rubroSlug)`; si la DB no responde o no hay plantilla para el rubro, cae al JS actual (`getTemplateForRubro`). El contrato de retorno (`created/skipped/reason/branding`) no cambia, así que `/business-configuration` no se toca. Recién cuando el switch lleve semanas estable se puede deprecar el contenido del JS (dejando solo el fallback mínimo).
- Editar la plantilla "Ropa Básica" en el panel afecta **ambos** usos (onboarding y biblioteca) — ese es el objetivo: una sola fuente. La restricción UNIQUE de `rubro_slug` garantiza que un rubro nunca tenga dos plantillas de onboarding compitiendo.

## 6. Plan de implementación por fases

**Fase 1 — Fundaciones (entregada).** Migración + seed + `catalogTemplateService.js`. Cero impacto en producción: nada llama todavía al servicio.

**Fase 2 — Panel admin `/admin/catalog-templates`.**
- Ruta con `RequireAdmin` en `Routes.jsx` (mismo patrón que `/admin/config/rubros`).
- Listado (activas/inactivas), crear/editar (cabecera + productos + categorías), duplicar (`duplicateTemplate`), desactivar (toggle `is_active`), vista previa (render reutilizando componentes del catálogo público con datos de la plantilla).
- Guardas de UI: advertir al editar plantillas `source='system'` (afectan el onboarding); al cambiar `rubro_slug` mostrar a qué rubro queda asociado el onboarding.

**Fase 3 — Switch del onboarding a DB con fallback.** Cambio acotado a `productTemplateService.js` (descrito en §5). Validar con un negocio nuevo por rubro antes de promover.

**Fase 4 (opcional) — Biblioteca para el usuario final.** Botón "Usar una plantilla" en el catálogo del usuario usando `getTemplates()` + `applyTemplate()`. La política RLS ya lo permite.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Divergencia JS ↔ DB mientras conviven (fases 1–2) | El JS no se edita más; cambios de contenido se hacen en DB. `source='system'` identifica qué plantillas espejan el JS |
| Editar/desactivar una plantilla `system` rompe el onboarding de ese rubro | El onboarding de fase 3 tiene fallback al JS; el panel (fase 2) advierte antes de editar/desactivar plantillas con `rubro_slug` |
| `applyTemplate` aplicado dos veces → productos duplicados | Es aditivo por diseño (no es bug de pérdida de datos). UI de fase 2/4 puede advertir si el negocio ya tiene productos con los mismos nombres; no se bloquea a nivel de servicio |
| Aplicación parcial (falla a mitad: categorías sí, productos no) | Operaciones idempotentes-aditivas: reintentar completa lo que faltó sin duplicar categorías (match por slug). Si se necesita atomicidad estricta más adelante, mover `applyTemplate` a una función RPC de Postgres |
| Fotos Unsplash externas (hotlink) | Riesgo preexistente del sistema actual; migrar assets a R2 es mejora ortogonal ya anotada en `productTemplates.js` |
| Usuario no admin intenta escribir plantillas | RLS: escritura solo `wa_is_admin()`; lectura de inactivas solo admin |
| Carrera del seed (dos sesiones aplican onboarding a la vez) | Mismo riesgo que hoy; sin cambios. La fase 3 no lo empeora porque el chequeo "negocio sin productos" se mantiene |

## 8. Qué NO hace este diseño (a propósito)

- No elimina ni modifica `productTemplates.js` / `productTemplateService.js`.
- No introduce FK de categorías en `wa_products` (sigue `category` TEXT).
- No construye UI todavía.
- No expone plantillas a `anon`.
