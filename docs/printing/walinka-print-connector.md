# Walinka Print Connector — documento de diseño

Estado: **propuesta para aprobación. No implementado.**
Reemplaza progresivamente a QZ Tray como puente entre Walinka (navegador) y la impresora térmica del comercio.

---

## 1. Objetivo

Un comerciante debe poder:

1. Instalar un programa sencillo una sola vez en Windows.
2. Abrir Walinka en Chrome o Edge.
3. Elegir su impresora.
4. Imprimir automáticamente al cerrar una venta, con corte de papel.
5. Abrir el cajón de dinero cuando corresponda.

Sin licencias comerciales, sin ventanas de autorización por cada venta y sin que el comerciante toque certificados ni configuración técnica.

Fuera de alcance para esta fase: balanzas y lectores de código de barras (se contemplan en el diseño, ver §11), emisión de boletas (sigue en el flujo fiscal existente), impresoras que no sean ESC/POS.

## 2. Punto de integración actual

| Capa | Archivo | Rol | Cambia en esta propuesta |
|---|---|---|---|
| Fachada | `src/lib/printing/printService.js` | Única API que usa el resto de Walinka | No |
| Contrato | `src/lib/printing/providers/printerProvider.js` | Forma que debe cumplir cualquier provider | No |
| Provider actual | `src/lib/printing/providers/qzTrayProvider.js` | Habla con QZ Tray y con `qz-sign` | Se mantiene como fallback |
| Recibo | `src/lib/printing/receipts/renderEscPosReceipt.js`, `buildSaleReceipt.js` | Genera bytes ESC/POS | No |
| Perfiles | `receipts/printerCompatibilityProfiles.js`, `escPosCapabilities.js` | Diferencias por modelo | Se amplían con Star TSP143 si falta |
| Firma QZ | `supabase/functions/qz-sign/` | Firma solicitudes QZ | Se retira al migrar |

Regla: ningún componente de negocio importa el conector ni QZ directamente. Todo pasa por `printService`.

## 3. Arquitectura propuesta

```
Walinka (https://go.ventalink.app, Chrome/Edge)
   │  printService.printReceipt(receipt, { printerName, jobId })
   │  connectorProvider (nuevo provider, mismo contrato PrinterProvider)
   │
   │  HTTPS → http://127.0.0.1:<puerto>   (solo local, con token de equipo)
   ▼
Walinka Print Connector (Windows, proceso en segundo plano)
   ├─ Listener HTTP (solo 127.0.0.1)
   ├─ Validación: origen, token, tamaño, jobId
   ├─ Registro de trabajos (SQLite local): jobId → estado y resultado
   └─ Spooler de Windows (winspool, datatype RAW) → impresora elegida
```

Selección de provider: por negocio, con fallback. Si el conector responde a `GET /v1/health`, se usa; si no, se usa `qzTrayProvider` mientras dure la transición.

El ticket ya llega en bytes ESC/POS desde `renderEscPosReceipt`. El conector no interpreta el recibo: solo transporta bytes a la impresora. Eso mantiene intacta la lógica de tickets.

## 4. API local (versión 1)

Todas las rutas requieren `Authorization: Bearer <token de equipo>`, excepto `GET /v1/health` (que solo devuelve versión y estado, sin datos del comercio).

| Método | Ruta | Uso |
|---|---|---|
| GET | `/v1/health` | Versión, estado. Lo usa Walinka para detectar el conector. |
| POST | `/v1/pair` | Empareja el equipo con un código de un solo uso generado en Walinka. Devuelve el token. |
| GET | `/v1/printers` | Lista impresoras instaladas en Windows. |
| POST | `/v1/print` | Imprime bytes ESC/POS: `{ jobId, printer, copies, dataBase64 }`. |
| GET | `/v1/jobs/{jobId}` | Estado de un trabajo: `queued`, `printing`, `done`, `failed`. |
| POST | `/v1/cashdrawer` | Pulso de apertura de cajón por la impresora indicada. |

Límites: tamaño máximo de 256 KB por trabajo; máximo 2 trabajos simultáneos; timeout de 15 s por trabajo.

## 5. Seguridad

Este es el requisito más importante. Cualquier página web abierta en el navegador puede intentar llamar a `localhost`.

**Red**
- El listener escucha solo en `127.0.0.1`, nunca en `0.0.0.0`.
- Valida el header `Host` (solo `127.0.0.1:<puerto>` o `localhost:<puerto>`). Esto evita DNS rebinding.
- CORS: `Access-Control-Allow-Origin` solo para `https://go.ventalink.app` (y el dominio de staging si se usa). Nunca `*`.
- Chrome y Edge exigen `Access-Control-Allow-Private-Network: true` en el preflight para peticiones desde una web pública hacia una red local. Hay que responderlo y probarlo en ambos navegadores.

**Origen y token**
- Cada petición debe traer `Origin` en la lista permitida. Origen ausente o distinto: 403.
- Emparejamiento: Walinka genera un código de 6 dígitos de un solo uso, válido 5 minutos, vinculado al negocio. El conector lo canjea por un token aleatorio de 256 bits.
- El token se guarda cifrado con DPAPI del usuario de Windows. No se guarda en texto plano ni en el registro sin cifrar.
- Límite de intentos de emparejamiento: 5 por código; después se invalida.
- Revocación: desde Walinka se puede revocar un equipo, y el conector deja de aceptar ese token.

**Datos**
- El conector no almacena recibos ni datos de clientes. Solo `jobId`, estado, impresora y timestamps.
- Logs sin contenido de tickets ni tokens.
- Solo imprime en modo RAW a la impresora que el usuario eligió. No ejecuta comandos del sistema ni acepta rutas de archivo.

**Actualizaciones**
- El conector revisa un manifiesto firmado (Ed25519) servido desde `go.ventalink.app`. Instala solo actualizaciones con firma válida y versión mayor.

## 6. Prevención de tickets duplicados

Riesgo: un reintento o una reconexión puede imprimir dos veces el mismo ticket.

- **`jobId` determinístico** generado por Walinka: `venta:{saleId}:{tipo}`. Mismo `jobId` = misma intención de impresión.
- **Registro previo**: Walinka registra el intento en la base antes de enviarlo.
- **Idempotencia en el conector**: si llega un `jobId` ya en `done`, responde `done` sin imprimir. Si está en `printing`, responde `printing` y no reenvía.
- **Reintentos**: solo se reenvía el mismo `jobId` si el estado es `failed` o si no hubo respuesta. Nunca se crea un `jobId` nuevo para reintentar la misma venta.
- **Cierre de venta independiente**: la impresión es un efecto secundario. Si falla, la venta queda cerrada y el ticket puede reimprimirse desde el historial con acción explícita. Un fallo de impresión nunca bloquea ni revierte el cobro.
- **Boletas**: el flujo fiscal tiene su propio registro y su propia clave. El conector no emite ni reenvía documentos tributarios.

## 7. Impresión: Star TSP100 / TSP143

- Modo de emulación: ESC/POS. El modo Star Line queda fuera del alcance; si el modelo está configurado en Star Line, el instalador debe avisar.
- Corte: se usa el comando de corte de ESC/POS (`GS V`) que ya funciona hoy en producción. No cambia.
- Cajón: pulso `ESC p` por el pin configurado. Hay que confirmar en el manual de la TSP143 qué pin y tiempos usa; el perfil se guarda por modelo.
- Driver: la impresora debe estar instalada en Windows con el driver de Star o con un driver genérico de texto RAW. El conector no instala drivers.
- Papel: el perfil de 80 mm ya existe (PRINT-5). Se mantiene.

Pruebas de hardware obligatorias antes de piloto: TSP100 y TSP143 por USB; TSP143 por red; corte en cada modelo; cajón con y sin venta; impresora apagada durante el trabajo; papel agotado durante el trabajo.

## 8. Instalación

- Tecnología: .NET 8, publicado como ejecutable único autocontenido (sin que el usuario instale runtime).
- Instalador: Inno Setup. Instalación por usuario (sin permisos de administrador).
- Arranque: registro de inicio por usuario (`HKCU\...\Run`) o tarea programada al iniciar sesión.
- Desinstalación limpia: elimina token, registro de trabajos y arranque automático.
- Firma del instalador y del ejecutable: **necesaria** para que SmartScreen no bloquee la instalación. Ver §12 sobre costos.

## 9. Plan por etapas

| Etapa | Contenido | Criterio de salida | Estimación |
|---|---|---|---|
| E0 | Corrección de clasificación de errores (PR #104) | Tests pasan en Node 22 y en CI | Hecho en rama local, falta push |
| E1 | Spike: imprimir RAW por winspool a TSP143 USB y red, con corte y cajón | Ticket con corte y cajón en ambos modelos | 3 a 5 días |
| E2 | Listener local, CORS, Private Network Access, emparejamiento y token | Pruebas de origen, host, token, rate limit | 1 a 1,5 semanas |
| E3 | `connectorProvider` en Walinka, `jobId`, idempotencia y estados | Venta de prueba sin duplicados, con reintento | 1 semana |
| E4 | Instalador, inicio automático, desinstalación | Instalación limpia en Windows 10 y 11 | 1 semana |
| E5 | Piloto con 3 comercios reales | Cero duplicados, cero impresiones perdidas sin aviso | 2 semanas de uso |
| E6 | Firma de código, manifiesto de actualizaciones, retiro de QZ | Decisión de costos aprobada | Según decisión |

Estimación total para un MVP usable en piloto: 4 a 6 semanas, con una persona. Son estimaciones; el hardware real puede cambiar el número.

## 10. Qué conservar y qué reemplazar

**Conservar**
- `printService`, `printerProvider`, el contrato y `assertPrinterProvider`.
- `renderEscPosReceipt`, `buildSaleReceipt`, `escPosImage`, perfiles de compatibilidad.
- Lógica de origen y JWT de `qz-sign`, como referencia para el emparejamiento.
- `printerOnboarding.js` y sus tests (ahora con clasificación corregida).

**Reemplazar (gradualmente)**
- `qzTrayProvider` como camino principal. Queda como fallback durante la transición y después se retira.
- `qz-sign` y el certificado demo. Sin QZ no hay firma que mantener.

## 11. Extensiones futuras

Balanzas, lectores de código de barras y otras marcas entran como módulos del conector con el mismo patrón: un adaptador por tipo de dispositivo, descubierto por el conector y expuesto por la API. Walinka no cambia para agregar un dispositivo nuevo; cambia el adaptador.

## 12. Riesgos y costos

- **SmartScreen y firma de código.** Sin firma, Windows advierte y muchos comercios no van a seguir la instalación. Hay que elegir entre un certificado de firma de código tradicional (costo anual) o un servicio de firma en la nube (costo mensual menor). Los precios cambian; hay que cotizarlos antes de decidir.
- **Antivirus.** Ejecutables nuevos sin reputación pueden marcarse como sospechosos. Mitigación: firma, publicación con hash, y envío de falsos positivos a los antivirus principales.
- **Chrome y Edge.** Cambios en la política de red local pueden romper el flujo. Hay que monitorear.
- **Soporte.** Cada equipo es un punto de falla distinto (drivers, USB, Windows). Necesitamos un registro de diagnóstico que el comerciante pueda enviar sin datos sensibles.
- **Mantenimiento.** Un programa instalado en cientos de equipos requiere actualizaciones seguras. Sin canal de actualización, el parche de seguridad no llega.
- **QZ en paralelo.** Mientras dure la transición, dos caminos de impresión aumentan la superficie de error. Hay que limitar el fallback y registrar cuál se usó.

## 13. Decisiones que necesito aprobar

1. Tecnología: .NET 8 (recomendado) o Node.
2. Firma de código: cuál proveedor y presupuesto anual.
3. Puerto local fijo o rango con descubrimiento.
4. Piloto: qué comercios y en qué fecha.
5. Confirmar que el modo ESC/POS es el usado en las TSP143 de los clientes actuales.
6. Retiro de QZ: fecha tentativa tras el piloto.

Cuando estas decisiones estén aprobadas, arranco por E1 (spike en hardware) antes de escribir la API completa.
