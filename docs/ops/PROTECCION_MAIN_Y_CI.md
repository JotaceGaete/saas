# Protección de `main` y CI — propuesta (2026-11-09)

Estado al 2026-11-09:
- `main` sin protección, sin rulesets ni verificaciones obligatorias.
- Las fusiones por squash, merge y rebase están permitidas, y las ramas no se borran al fusionar.
- La CI solo corre en algunas rutas fiscales y del conector de impresión.
- Production se despliega automáticamente desde `main` (Vercel).
- Preview y Production comparten la misma base de Supabase y la misma `fiscal-emit`.

Esta propuesta **no se activa sola**: el ruleset se configura en GitHub y el workflow se agrega en una PR
aparte, con su propia revisión.

## 1. Ruleset para `main`

GitHub → Settings → Rules → Rulesets → New branch ruleset. Nombre: `main-protegida`. Destino: rama por
defecto. Modo: **Active**.

| Regla | Valor | Por qué |
|---|---|---|
| Restrict deletions | Sí | Nadie borra `main` |
| Block force pushes | Sí | El historial de lo desplegado no se reescribe |
| Require a pull request before merging | Sí, con 0 aprobaciones obligatorias mientras haya un solo desarrollador | Todo cambio pasa por una PR revisable. Subir a 1 aprobación cuando haya otro revisor. |
| Require conversation resolution | Sí | No se fusiona con comentarios abiertos |
| Require status checks to pass | `pruebas`, `build`, `secretos`, `trazabilidad` (jobs de `ci.yml`) y `Vercel` (Preview) | Ninguna fusión sin pruebas, build, escaneo y Preview en verde |
| Require branches to be up to date | Sí | Se prueba exactamente lo que se fusiona |
| Allowed merge methods | Solo **merge commit** | Un commit de fusión por PR = un punto de reversión (`git revert -m 1`) |
| Bypass | Ninguno, ni siquiera el administrador | Las urgencias también van por PR; el Instant Rollback de Vercel no necesita bypass |

Ajustes del repositorio:
- **Automatically delete head branches** activado.
- Desactivar **Allow squash merging** y **Allow rebase merging**.

**Orden de activación:** primero el workflow de CI (sección 2) en verde sobre `main`. Después el ruleset. Si
se activa antes, ninguna PR podría cumplir las verificaciones obligatorias.

## 2. CI en cada PR (`.github/workflows/ci.yml`)

Implementada en la PR de CI. Diferencias con lo planeado:
- Las pruebas corren **sin red**, con `scripts/ci/sin-red.sh` (espacio de red propio, solo loopback).
- Se instala con `npm ci`. El lockfile está sincronizado con `package.json` y con `.npmrc` (`legacy-peer-deps=true`). El fallo inicial de `npm ci` venía de probar sin `.npmrc`.
- Los jobs son `pruebas`, `build`, `secretos` y `trazabilidad`.

Disparadores: `pull_request` hacia `main`, y `push` a `main` para verificar lo fusionado. Sin secretos de
producción.

Job `pruebas`:
1. `npm ci`
2. **Vitest con línea base.** Con variables Supabase ficticias (`VITE_SUPABASE_URL=http://127.0.0.1:9`,
   `VITE_SUPABASE_PUBLISHABLE_KEY=dummy`), los 2 archivos que hoy no cargan sin `.env` pasan a ejecutarse.
   - Se ejecuta la suite completa con reporte JSON.
   - Un script compara las fallas con `docs/ops/vitest-baseline-2026-11-09.txt`.
   - **Falla si aparece cualquier falla nueva.** Avisa sin fallar si una prueba de la línea base empieza a
     pasar, para borrarla de la lista.
3. `node --test` de los archivos `node:test`, excepto los que necesitan base (`test/db`, `contract`).
4. Deno: `deno test` y `deno check` de `supabase/functions/fiscal-emit`.
5. **Escaneo de secretos** (gitleaks) sobre el diff de la PR.
6. **Trazabilidad de base de datos:** si la PR agrega o cambia SQL en `supabase/`, exige que modifique también
   el ledger (`supabase/fiscal-recovery/PRODUCTION-MIGRATION-LEDGER-*.md`) o lo justifique en la descripción.

Job `build`: `npm run build` con las mismas variables ficticias.

### Las 33 fallas preexistentes de Vitest

Todas fallan igual en `main` y no son regresiones de las PR fiscales. La lista exacta está en
`docs/ops/vitest-baseline-2026-11-09.txt`.

| Archivo | Fallas | Causa observada |
|---|---|---|
| `src/pages/crm/CrmPrintSettings.test.jsx` | 22 | Pruebas desactualizadas tras el rediseño: QZ Tray pasó a ruta secundaria |
| `src/pages/crm/CrmTerminal.test.js` | 5 | Pruebas que leen el código fuente con patrones frágiles |
| `src/pages/crm/CrmCostos.test.jsx` | 2 | Textos de la interfaz cambiados |
| `src/services/crmService.dailySummary.test.js` | 2 | Expectativas de stock bajo desactualizadas |
| `src/pages/crm/CrmCostCenter.test.jsx` | 1 | Calendario de días operativos |
| `src/components/ui/BusinessSidebar.test.jsx` | 1 | Menú «Afiliados» |
| `src/pages/crm/CrmInvoiceEditor.test.jsx`, `src/pages/crm/components/CrmThermalTicket.test.jsx` | 0 (no cargan) | Faltan variables Supabase. Con variables ficticias pasan (18/18) |

**Plan:**
- No desactivar ni borrar pruebas.
- La línea base congela las fallas actuales y la CI bloquea solo las nuevas.
- Corregirlas en PR pequeñas, en este orden:
  1. variables ficticias en la CI: 2 archivos;
  2. `CrmPrintSettings`: 22;
  3. `CrmTerminal`: 5;
  4. el resto.
- Cada PR borra sus líneas de la línea base. El objetivo es dejarla vacía y luego retirarla.

## 3. Despliegues y deriva

- **Vercel:** Production solo desde `main`. Las Preview validan, pero comparten base de datos con Production:
  ninguna prueba en Preview debe vender, emitir ni registrar credenciales sin autorización.
- **Supabase, migraciones:** solo con archivo en el repositorio y entrada en el ledger, en la misma PR. Nunca
  desde el SQL Editor sin registrar después la entrada y su md5.
- **Supabase, Edge Functions:** desplegar solo desde un commit de `main`, idealmente desde la CI. Hoy hay
  funciones desplegadas desde copias locales distintas (`saas-walinka-standby`, `saas-mp-oauth-deploy`).
  - Desplegadas y ausentes del repositorio: `lemonsqueezy-webhook`, `og-catalog-share` y
    `supabase-new-user-webhook`.
  - En el repositorio y no desplegada: `create-dlocal-checkout`.
- **Revisión semanal programada**, solo lectura:
  - commit de Production igual a `main`;
  - hash de cada Edge Function frente al build de `main`;
  - ramas con trabajo sin fusionar hace más de 14 días;
  - ramas de Supabase de vista previa activas (hoy: `fiscal-audit-ag-20261104`, del 2026-11-04).

## 4. Estado explícito de cada tarea

Toda PR y toda tarea termina con esta tabla en su descripción:

| Desarrollado | Probado | Fusionado | Desplegado | Verificado |
|---|---|---|---|---|
| sí / no | qué pruebas y resultado | commit de fusión | despliegue (Vercel, Supabase) | qué se comprobó después |

## 5. Estado de la protección (2026-11-09)

- Ruleset `main-protegida` **activo** sobre la rama por defecto, sin excepciones, con:
  - borrado de la rama y force push prohibidos;
  - PR obligatoria con 0 aprobaciones, conversaciones resueltas y solo merge commit;
  - los checks `pruebas`, `build`, `secretos` y `trazabilidad`, exigidos a GitHub Actions (integración 15368), con la rama al día.
- Repositorio: solo merge commits y el botón «Update branch» activado.
- Ensayo previo en `ci-ruleset-ensayo`: GitHub rechazó un push directo y un force push (`GH013`).

### Pendientes

1. ~~Sincronizar `package-lock.json` y volver a `npm ci` en la CI.~~ Hecho: el lockfile ya estaba sincronizado con `.npmrc` y la CI usa `npm ci`.
2. Corregir las 33 fallas de Vitest de la línea base. Primero, borrar las 2 entradas que ya pasan (`CrmInvoiceEditor` y `CrmThermalTicket`).
3. Borrar el ruleset `ensayo-temporal` y después las ramas `ci-ruleset-ensayo` y `claude/ci-prueba-negativa`.
4. Si se renombra un job de `ci.yml`, actualizar el ruleset en el mismo momento.
