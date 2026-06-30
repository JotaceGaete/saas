# Walinka Business Engine v1
## La Constitución del Producto

> Este documento define el modelo mental, el lenguaje oficial y las reglas del motor
> de decisiones de Walinka. Todo el frontend, backend, base de datos y funciones de IA
> deben derivar su lógica de este documento — no al revés.

---

## 1. Principio Fundamental

**El centro del sistema es el negocio. No el sitio web.**

Un negocio en Walinka puede:
- Tener un sitio web publicado pero no usar el CRM
- Usar el CRM y la caja sin tener sitio web
- Vender por WhatsApp sin tener dominio propio
- Crecer de presencia básica a gestión completa sin migrar de plataforma

El sistema acompaña al negocio en su evolución. No impone un camino.

---

## 2. El Lenguaje Oficial

Dos vocabularios coexisten: el **técnico** (código, DB, documentación interna)
y el **humano** (UI, onboarding, soporte). Nunca mezclarlos en la interfaz.

| Técnico (código) | Humano (UI) |
|---|---|
| Blueprint | Tipo de negocio |
| Goal | Necesidad |
| Output | Herramienta |
| Module | *(invisible — nunca aparece)* |
| Stage | *(invisible — nunca aparece)* |
| Provisioner | *(invisible — nunca aparece)* |
| Website | Sitio web |
| CRM | Clientes |
| TPV | Punto de venta |
| Stock | Inventario |
| Catalog | Catálogo / Productos |

**Regla:** Si una palabra técnica aparece en un componente `.jsx` visible al usuario, es un bug de producto.

---

## 3. Blueprints — Los Tipos de Negocio

Cada Blueprint es un arquetipo real de pequeño negocio latinoamericano.
No es un template visual. Es una identidad de negocio con estrategia, tono, y estructura operativa propia.

### Los 5 Blueprints v1

```
TIENDA          🛍
RESTAURANTE     🍽
SERVICIOS       🔧
BELLEZA         💅
PROFESIONAL     👨‍💼
```

### Definición de cada Blueprint

#### 🛍 TIENDA
- **Quién es:** Comercio minorista. Ropa, electrónica, librería, ferretería, bazar.
- **Cómo vende:** En local, por WhatsApp, online.
- **Qué más necesita:** Control de stock, caja, clientes frecuentes.
- **Tono de marca:** Confiable, variado, accesible.
- **Layout del sitio:** Catálogo central, búsqueda, categorías.
- **Goals predefinidos:** Mostrar productos, Vender por WhatsApp, Controlar ventas.

#### 🍽 RESTAURANTE
- **Quién es:** Restaurante, cafetería, food truck, rotisería, servicio de catering.
- **Cómo vende:** Presencial, delivery por WhatsApp, reservas.
- **Qué más necesita:** Menú visual, horarios, pedidos rápidos.
- **Tono de marca:** Apetitoso, cercano, local.
- **Layout del sitio:** Menú visual como protagonista, fotos grandes, horarios visibles.
- **Goals predefinidos:** Mostrar productos (menú), Vender por WhatsApp, Aparecer en internet.

#### 🔧 SERVICIOS
- **Quién es:** Plomero, electricista, jardinero, limpieza, reparaciones, delivery.
- **Cómo vende:** Contacto directo, WhatsApp, presupuestos.
- **Qué más necesita:** Lista de servicios clara, contacto fácil, historial de clientes.
- **Tono de marca:** Confiable, eficiente, local.
- **Layout del sitio:** Servicios + precios estimados + contacto directo.
- **Goals predefinidos:** Aparecer en internet, Mostrar productos (servicios), Organizar clientes.

#### 💅 BELLEZA
- **Quién es:** Peluquería, barbería, estética, manicura, spa, maquillaje.
- **Cómo vende:** Turnos, venta de productos, fidelización.
- **Qué más necesita:** Galería de trabajos, agenda de clientes, WhatsApp como canal principal.
- **Tono de marca:** Estético, aspiracional, personal.
- **Layout del sitio:** Galería visual prominente, servicios con precios, reserva de turno.
- **Goals predefinidos:** Aparecer en internet, Mostrar productos (trabajos), Organizar clientes.

#### 👨‍💼 PROFESIONAL
- **Quién es:** Abogado, contador, psicólogo, coach, consultor, diseñador freelance.
- **Cómo vende:** Consultas, proyectos, honorarios por hora.
- **Qué más necesita:** Credenciales visibles, formulario de contacto, facturación.
- **Tono de marca:** Confiable, experto, formal o moderno según perfil.
- **Layout del sitio:** Hero personal + servicios + credenciales + contacto.
- **Goals predefinidos:** Aparecer en internet, Organizar clientes, Controlar ventas (honorarios).

---

## 4. Goals — Las Necesidades del Negocio

Los Goals son lo que el dueño quiere lograr. Son el contrato entre el negocio y Walinka.

El usuario los ve como preguntas en onboarding. Internamente, cada Goal activa un conjunto de Outputs.

### Los 7 Goals v1

```
FIND_ME           "Quiero aparecer en internet"
SHOW_PRODUCTS     "Quiero mostrar mis productos o servicios"
SELL_WHATSAPP     "Quiero vender o recibir pedidos por WhatsApp"
MANAGE_CLIENTS    "Quiero organizar mis clientes"
CONTROL_SALES     "Quiero controlar mis ventas"
MANAGE_INVENTORY  "Quiero llevar mi inventario"
SELL_IN_PERSON    "Quiero cobrar en mi local"
```

### Mapeo Goal → Outputs activados

| Goal | Outputs que activa |
|---|---|
| FIND_ME | website (home + contact) |
| SHOW_PRODUCTS | website (products), catalog |
| SELL_WHATSAPP | whatsapp, catalog |
| MANAGE_CLIENTS | crm |
| CONTROL_SALES | crm, dashboard |
| MANAGE_INVENTORY | stock, catalog |
| SELL_IN_PERSON | tpv, caja |

**Regla:** Un Goal puede activar múltiples Outputs. Un Output puede ser requerido por múltiples Goals. Si un Output ya está activo, no se duplica.

---

## 5. Outputs — Las Herramientas del Negocio

Los Outputs son los productos concretos que Walinka entrega al negocio.
El usuario los ve como herramientas en el menú lateral. Nunca como "módulos activados".

### Los 8 Outputs v1

```
WEBSITE       → Sitio web público del negocio
CATALOG       → Catálogo de productos/servicios
WHATSAPP      → Canal de ventas por WhatsApp
CRM           → Gestión de clientes, facturas, presupuestos
TPV           → Punto de venta presencial
CAJA          → Sesiones de caja y movimientos
STOCK         → Inventario y alertas de stock
DASHBOARD     → Vista unificada de métricas del negocio
```

### Propiedades de cada Output

Cada Output tiene:
- `status`: `inactive` | `setup` | `active`
- `setupComplete`: boolean — si fue configurado mínimamente
- `dependsOn`: lista de otros Outputs que deben estar activos primero
- `connectsTo`: lista de Outputs con los que comparte datos

```
CAJA dependsOn [TPV]
TPV connectsTo [CATALOG, CRM]
STOCK connectsTo [CATALOG]
WHATSAPP connectsTo [CATALOG]
WEBSITE connectsTo [CATALOG]
DASHBOARD connectsTo [todos]
```

**Regla crítica:** Los Outputs comparten datos — nunca los duplican. Si el negocio actualiza un producto en CATALOG, ese cambio se refleja automáticamente en WEBSITE y WHATSAPP. No hay sincronización: hay una única fuente de datos.

---

## 6. Stages — La Evolución del Negocio

Un negocio no configura todo de una vez. El sistema reconoce en qué etapa está y sugiere el próximo paso.

```
STAGE 1 — PRESENCIA
    Objetivo: que los clientes encuentren el negocio
    Outputs mínimos: WEBSITE activo y publicado
    Señal de avance: primeros 10 visitantes al sitio

STAGE 2 — VENTAS
    Objetivo: generar pedidos o contactos calificados
    Outputs mínimos: CATALOG + WHATSAPP activos
    Señal de avance: primer pedido recibido por WhatsApp

STAGE 3 — GESTIÓN
    Objetivo: organizar clientes y dinero
    Outputs mínimos: CRM activo + CAJA activa
    Señal de avance: primera factura emitida o primer cierre de caja

STAGE 4 — CRECIMIENTO
    Objetivo: escalar con datos
    Outputs mínimos: STOCK + DASHBOARD activos
    Señal de avance: primer reporte de ventas revisado
```

**Regla:** El sistema sugiere el próximo Stage pero nunca fuerza al usuario. Un restaurante puede ir directo de Stage 1 a Stage 3 sin pasar por Stage 2 si su modelo de negocio lo requiere.

---

## 7. El Motor de Decisiones — `businessEngine`

Este es el corazón del sistema. Una función pura que dado un Blueprint y Goals devuelve la configuración completa del negocio.

### Contrato de la función

```typescript
type Blueprint = 'tienda' | 'restaurante' | 'servicios' | 'belleza' | 'profesional';

type Goal =
  | 'find_me'
  | 'show_products'
  | 'sell_whatsapp'
  | 'manage_clients'
  | 'control_sales'
  | 'manage_inventory'
  | 'sell_in_person';

type Output =
  | 'website'
  | 'catalog'
  | 'whatsapp'
  | 'crm'
  | 'tpv'
  | 'caja'
  | 'stock'
  | 'dashboard';

type BusinessConfig = {
  blueprint: Blueprint;
  goals: Goal[];
  outputs: Output[];           // derivados de goals + dependencias
  stage: 1 | 2 | 3 | 4;       // derivado de outputs activos
  website: {
    layout: string;            // derivado de blueprint
    theme: string;             // derivado de blueprint + branding
    pages: string[];           // derivadas de goals
    navigation: NavItem[];     // derivada de pages
    initialCopy: Record<string, string>; // generado por blueprint
  };
  menu: MenuItem[];            // menú lateral de la app, derivado de outputs
  nextStageHint: string;       // sugerencia de qué activar para crecer
};

function createBusinessConfig(blueprint: Blueprint, goals: Goal[]): BusinessConfig
```

### Reglas del motor

1. **Nunca duplicar datos.** Si CATALOG está activo, WEBSITE y WHATSAPP lo consumen — no copian.
2. **Dependencias en cascada.** Activar CAJA activa TPV automáticamente si no estaba activo.
3. **Goals aditivos.** Agregar un Goal nunca desactiva Outputs existentes.
4. **Outputs = menú de la app.** El menú lateral se genera desde los Outputs activos, no está hardcodeado.
5. **El motor no tiene estado.** Es una función pura. El estado vive en la base de datos.
6. **El motor es portable.** Puede ejecutarse en el frontend, en un Edge Function, o como regla de IA. No depende de React ni de Supabase.

---

## 8. El Onboarding — La Experiencia del Usuario

El usuario nunca ve la arquitectura. Ve preguntas simples con respuestas claras.

### Pantalla 1: Tipo de negocio
```
¿Qué tipo de negocio tenés?

  [🛍 Tienda]    [🍽 Restaurante]    [🔧 Servicios]
  [💅 Belleza]   [👨‍💼 Profesional]   [Otro →]
```
*(selección única — fija el Blueprint)*

### Pantalla 2: Necesidades
```
¿Qué querés lograr? (podés elegir varios)

  ◉ Quiero aparecer en internet
  ◉ Quiero mostrar mis productos o servicios
  ◉ Quiero vender o recibir pedidos por WhatsApp
  ○ Quiero organizar mis clientes
  ○ Quiero controlar mis ventas
  ○ Quiero llevar mi inventario
  ○ Quiero cobrar en mi local
```
*(preseleccionados por Blueprint — el usuario confirma o ajusta)*

### Pantalla 3: Datos del negocio
```
Contanos sobre tu negocio

  Nombre del negocio: _______________
  Ciudad: _______________
  Teléfono de WhatsApp: _______________
  Logo o foto (opcional): [Subir imagen]
```

### Resultado instantáneo
Con esos tres pasos, el motor genera:
- Borrador del sitio web (si FIND_ME o SHOW_PRODUCTS seleccionados)
- Catálogo listo para cargar productos (si SHOW_PRODUCTS o SELL_WHATSAPP)
- Link de WhatsApp configurado (si SELL_WHATSAPP)
- CRM vacío listo para cargar clientes (si MANAGE_CLIENTS)
- Dashboard con métricas en cero esperando datos (siempre activo)

---

## 9. La Estructura de Código

```
src/business/
├── WALINKA_BUSINESS_ENGINE.md   ← este documento
│
├── blueprints/
│   └── index.js                 ← BLUEPRINT_DEFINITIONS
│
├── goals/
│   └── index.js                 ← GOAL_DEFINITIONS + Goal→Output mapping
│
├── outputs/
│   └── index.js                 ← OUTPUT_DEFINITIONS + dependencias
│
├── stages/
│   └── index.js                 ← STAGE_DEFINITIONS + reglas de avance
│
├── provisioner/
│   └── index.js                 ← activa Outputs en DB según Goals
│
└── businessEngine.js            ← la función pura createBusinessConfig()
```

**Regla de arquitectura:** Ningún archivo fuera de `src/business/` importa lógica de decisión directamente. Todo el resto de la app consume `businessEngine.js` o las constantes de `blueprints/`, `goals/`, `outputs/`.

---

## 10. Lo que este motor habilita en el futuro

Una vez que existe `businessEngine.js` como fuente de verdad, habilita:

**IA contextual:** "Veo que sos una peluquería en Stage 2. Tus competidores en la zona suben fotos de trabajos los jueves. ¿Querés activar la galería en tu sitio?"

**Onboarding adaptativo:** Si el negocio lleva 3 meses y solo usa el catálogo, el sistema sabe sugerirle activar CRM — no porque lo programamos explícitamente, sino porque el Stage lo indica.

**Templates inteligentes:** El copy inicial del sitio se genera desde `blueprint.initialCopy(businessData)` — no es un template fijo, es una función que conoce el nombre, la ciudad y el tipo de negocio.

**Migración de negocios existentes:** Los negocios que ya usan Walinka (CRM, catálogo, caja) pueden "descubrir" su Blueprint respondiendo las mismas dos preguntas del onboarding. El motor detecta qué Outputs ya están activos y saltea el setup.

**Multi-negocio:** Si un usuario tiene dos negocios, cada uno tiene su propio `BusinessConfig`. El motor no asume que hay un solo negocio por cuenta.

---

## Decisiones que este documento no toma todavía

*(Para resolver en Sprint 0 antes de escribir código)*

1. **¿Los Blueprints son extensibles por el usuario?** ¿Un "restaurante vegetariano" puede ser un Blueprint derivado de RESTAURANTE? Por ahora: no. Los 5 Blueprints son fijos en v1.

2. **¿Qué pasa con negocios que no encajan en ningún Blueprint?** La opción "Otro" en onboarding activa SERVICIOS como Blueprint default con cero Goals preseleccionados. El usuario elige todo manual.

3. **¿El Stage puede retroceder?** Si un negocio desactiva un Output, ¿baja de Stage? Por ahora: no. El Stage solo sube. Un Output desactivado queda en `status: inactive` pero no revierte el Stage.

4. **¿El WEBSITE es obligatorio?** No. Un negocio puede ser 100% CRM + TPV sin sitio web publicado. El Output WEBSITE puede estar en `status: setup` indefinidamente sin bloquear el resto.

5. **¿El motor vive solo en el frontend?** Por ahora sí — es JS puro. Cuando agreguemos IA, el motor se expone como Edge Function para que el modelo lo consulte.

---

*Walinka Business Engine v1 — Junio 2026*
*Este documento evoluciona. Toda decisión arquitectónica que lo contradiga debe actualizar este documento primero.*
