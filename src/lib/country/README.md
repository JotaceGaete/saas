# Country State Model

Este módulo define una capa única para resolver país/mercado y evitar lógica duplicada entre registro, onboarding y checkout.

## Archivos

- `state-model.js`: resolución de estado (`uxCountry`, `businessCountry`, `billingCountry`) y setup de billing.
- `market-config.js`: configuración central por país (`marketStatus`, `currency`, `billingProvider`, `enabled`).

## Contrato principal

### `resolveCountryState(input)`

Devuelve:

- `uxCountry`: país temporal para UX/formularios.
- `businessCountry`: país persistido real del negocio (si existe).
- `billingCountry`: país efectivo para reglas de pago.
- `marketStatus`: estado del mercado (`active`, `beta`, `coming_soon`, `unsupported`).
- `marketConfig`: snapshot de configuración central del país resuelto.

Prioridad de resolución de `billingCountry`:

1. `businessCountry`
2. selección explícita de onboarding
3. `user metadata`
4. sugerencia por hostname
5. fallback

### `resolveBillingSetup(countryState)`

Devuelve:

- `billingCountry`
- `marketStatus`
- `enabled`
- `billingProvider`
- `currency`
- `paymentOptions`
- `checkoutPolicy` (`allowed`, `message`)

## Scopes y responsabilidades

- `uxCountry`
  - Uso: formularios de registro/onboarding y validaciones de teléfono.
  - Naturaleza: temporal, editable por el usuario.
- `businessCountry`
  - Uso: fuente de verdad del negocio para mercado/billing.
  - Naturaleza: persistida en DB al completar onboarding/creación de negocio.
- `billingCountry`
  - Uso: selección de provider/moneda/políticas de checkout.
  - Naturaleza: derivada por prioridad; no depende solo del hostname.

## Nota importante sobre `go.ventalink.app`

En `go.` el hostname solo sugiere país inicial.  
Nunca fija el país final de billing por sí mismo.

## Ejemplos de uso

### Registro

- Se usa `resolveCountryState(...)` para hints de UX y moneda inicial.
- No se persiste `businessCountry` definitivo en `signUp` inicial.

### Onboarding / createBusiness

- El país elegido explícitamente en onboarding se pasa a `createBusiness`.
- Ahí se define `businessCountry` persistente (incluye free/trial).

### Checkout / Planes

- `resolveBillingSetup(...)` define `billingProvider` y `currency`.
- Si `marketStatus` es `coming_soon` o `unsupported`, `checkoutPolicy.allowed = false` y se bloquea checkout automático con mensaje UX.

## Debug logs

Formato estándar:

`[country-state] ux=... business=... billing=... provider=... currency=...`
