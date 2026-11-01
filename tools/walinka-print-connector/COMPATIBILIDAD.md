# Informe de compatibilidad — prototipo E1

Estado: **prototipo sin prueba física todavía.** Lo que sigue es lo que se sabe por el código y la documentación del repo, y lo que falta confirmar en hardware.

## 1. Verificado en este entorno (Linux, sin impresora)

- Compila los fuentes con Roslyn contra las referencias .NET 8.0.33.
- `selftest`: 8 de 8 verificaciones pasan (bytes de corte, cajón, inicialización, ticket sin cajón, reemplazo de texto no ASCII).
- `bytes`: genera el ticket de prueba (477 bytes con corte modern). Termina en `ESC d 4` + `GS V B 00`.

No verificado aquí: winspool, listado de impresoras, envío RAW, estado de Windows. Esas partes solo corren en Windows.

**Limitación de compilación:** no pude generar `WalinkaPrintProbe.exe` en este entorno. El restore de NuGet está bloqueado por el proxy (no se pueden descargar los paquetes de runtime win-x64). Por eso el ejecutable autocontenido se debe generar en Windows con `build.ps1`.

## 2. Lo que ya está validado en Walinka (por el repo)

Fuente: `src/lib/printing/receipts/escPosCapabilities.js`, con hardware Star TSP100 Cutter / TSP143 80 mm.

| Tema | Resultado validado | Impacto en E1 |
|---|---|---|
| Corte `GS V 66 0` (gs-v-modern) | Funciona; es el default de producción | El ticket de prueba usa este corte |
| Corte `GS V 1` (gs-v-legacy) | Disponible como alternativa | Opción `--cut legacy` |
| Raster `GS v 0` | Se imprime como texto literal ("v0...") en TSP100/TSP143 | No se usa. Las imágenes van por `ESC *` |
| Imagen `ESC *` (bit image) | Imprime el patrón correctamente | Fuera de E1; usar en el futuro para logos |
| Star Line Mode vs ESC/POS | Si el modo ESC/POS no está activo, Star interpreta los bytes como Star Line y el ticket sale corrupto | Requisito de configuración en la impresora (ver §4) |

## 3. Lo que no está validado

- **Pulso de cajón `ESC p 0 25 250`:** no hay bytes de cajón en el repo. Es el comando estándar ESC/POS, pero no está probado en TSP143. Por eso el cajón requiere `--confirm` y no se usa en la prueba de corte.
- **Pin del cajón:** pin 2 (`m = 0`) es el valor típico. Algunos cajones usan pin 5. Hay que confirmarlo con el cajón real del comercio.
- **Tiempos del pulso:** 50 ms on / 500 ms off es un valor típico, no verificado.
- **Acentos y codepage:** el ticket de prueba es ASCII puro. Los acentos del español no se verifican en E1.
- **Corte en TSP143 con papel de 80 mm de la marca del cliente:** pendiente.
- **Winspool y driver Star:** no se sabe qué driver tiene instalado cada cliente, ni si la cola acepta RAW sin transformación.

## 4. Configuración requerida en la impresora

Estos pasos los hace el técnico o el comerciante, no el programa:

1. Instalar el driver de Star o una cola que acepte RAW.
2. Confirmar que la impresora está en ESC/POS, no en Star Line Mode. En la utilidad de configuración de Star, la opción es "Enable ESC/POS Routing" (según la documentación citada en `escPosCapabilities.js`).
3. Registrar el nombre exacto de la cola en Windows (`list`).

El programa no cambia estos valores. Requisito del proyecto.

## 5. Limitaciones del prototipo

- **Estado de Windows no es confirmación.** `DescribeStatus` detecta bits como sin conexión, sin papel o atascada. Algunos drivers no reportan estos bits, sobre todo en impresoras de red. La ausencia de error no garantiza impresión.
- **Aceptación del spooler ≠ impresión.** `test-print` lo dice en pantalla y el resultado final es visual.
- **Sin lectura de finalización del trabajo.** E1 no espera a que la cola termine el trabajo.
- **Sin detección de duplicados.** Cada ejecución envía de nuevo. Es intencional para E1 (son pruebas manuales). La idempotencia por `jobId` es parte de E3.
- **Sin manejo de reconexión.** Si la impresora se apaga durante el envío, Windows puede aceptar parte de los bytes. `SendRaw` detecta escritura parcial y lo informa, pero el ticket queda incompleto.
- **Sin firma de código.** SmartScreen va a advertir al ejecutar el `.exe`.
- **Solo x64.** No probado en ARM ni en Windows 10 anterior a 1809.

## 6. Prueba mínima para aprobar E1

- [ ] `selftest` en Windows: `Todo OK.`
- [ ] `list` muestra la Star TSP143 con nombre exacto.
- [ ] `test-print --cut modern` imprime el ticket completo, con texto legible, sin venta asociada.
- [ ] El corte modern corta el papel sin intervención.
- [ ] Mismo ticket en la TSP100 (si está disponible).
- [ ] Con la impresora apagada, `test-print` se niega a enviar y muestra el mensaje de sin conexión.
- [ ] Con la tapa abierta o sin papel, muestra el aviso correspondiente.
- [ ] `drawer --confirm` abre el cajón. Si no abre, probar pin 5 con otro comando antes de descartarlo.

## 7. Qué no cambia

- No se modifica el TPV, las ventas, pagos, caja ni emisión de boletas.
- No se elimina QZ Tray.
- No se instalan drivers.
- No se cambian configuraciones de impresoras.
- No hay API HTTP ni emparejamiento (E2).

---

## 8. Diagnóstico con hardware — v0.1 (resultados reales)

Hardware: Star TSP100 Cutter (TSP143), conexión USB008. Modo de la impresora: POS/ESC-POS, apagada y encendida después del cambio.

| Prueba | Resultado |
|---|---|
| `selftest` | 8/8 OK |
| Detección de impresora | Correcta |
| Envío RAW | Correcto, ticket completo |
| `--cut modern` (GS V 66 0) | Imprime, no corta |
| `--cut legacy` (GS V 1) | Imprime, no corta |
| Carácter "V" aislado al inicio | Aparece |

En el mismo modelo, Walinka corta con QZ Tray en otro computador. Los bytes de corte son idénticos a los de producción, así que el problema no está en el comando de corte en sí.

### 8.1 Diferencias de bytes encontradas al comparar con Walinka

| Aspecto | Walinka (`renderEscPosReceipt.js`) | Prototipo v0.1 | Cambio en v0.2 |
|---|---|---|---|
| Inicio | `ESC @` | `ESC @` | Igual |
| Alineación | `ESC a 0` antes del texto | No enviaba | Se agrega `ESC a 0` |
| Avance antes del corte | LF repetidos | `ESC d 4` | Se cambia a LF repetidos |
| Corte | `GS V 66 0` | `GS V 66 0` | Igual |

`ESC d n` es "imprimir y avanzar n líneas" en ESC/POS. En modo Star Line tiene otro significado, según la documentación de Star que hay que verificar para el TSP100. Eso hace que el prototipo v0.1 dependa de una ambigüedad que Walinka no tiene. v0.2 elimina `ESC d` del ticket.

No pude ejecutar el renderer de Walinka desde este entorno (no hay `node_modules` y sus imports no tienen extensión). La comparación es por lectura del código.

### 8.2 Hipótesis, ordenadas por probabilidad

1. **Configuración de la cola de Windows distinta a la del computador que sí corta.** Mismo modelo, mismos bytes, y el problema aparece solo en este PC: el driver, el tipo de datos por defecto o el procesador de impresión pueden transformar o interpretar el flujo. Qué revisar: `info --printer` en ambos PCs. Campos a comparar: Driver, Tipo de datos, Procesador, Puerto.
2. **Modo de emulación real del firmware distinto del que se ve en la impresora.** Que el panel o la configuración diga POS no garantiza que el firmware esté en ESC/POS. Qué revisar: imprimir la página de configuración de la TSP100 (ver manual) y confirmar el modo de emulación.
3. **La "V" aislada indica que el firmware o el driver trata bytes de control como texto.** Un byte 0x56 ('V') se imprime solo si el byte previo (0x1D, GS) no se interpreta como comando. Esto apunta a la misma causa que la hipótesis 1 o 2, no a un error de bytes. La variante T lo prueba: si T también imprime "V", el byte lo agrega la cola o el driver, no el prototipo.
4. **Cuchilla o firmware que no acepta el corte parcial.** Las variantes C y D prueban corte total. Si ninguna corta, el problema no es la forma del comando.

### 8.3 Prueba de corte independiente (v0.2)

Trabajos mínimos, sin ticket completo, sin cajón. Cada uno tiene una sola secuencia de corte distinta.

| Variante | Bytes de corte | Qué prueba |
|---|---|---|
| T | Ninguno | Si el driver o la cola agrega una "V" sin ningún comando |
| A | `GS V 66 0` | Igual que Walinka |
| B | `GS V 66 3` | Si el corte necesita avance |
| C | `GS V 65 0` | Corte total moderno |
| D | `GS V 0` | Corte total legacy |
| E | `GS V 1` | Corte parcial legacy (igual que v0.1) |

Orden recomendado: T, A, C, D, B, E. Anotar por cada una: texto completo (sí/no), "V" al inicio (sí/no), corte (sí/no).

### 8.4 Qué no se debe asumir

- Que cambiar de modo resuelve el corte: ya se probó y no alcanza.
- Que el comando sea el problema: los bytes son los mismos que en producción.
- Que "Windows aceptó el trabajo" implique impresión o corte.

## 9. Qué necesitamos para cerrar E1

1. Salida de `info --printer "..."` en este computador.
2. Salida de `info --printer "..."` en el computador donde QZ corta (si podés correr el prototipo allí, o al menos el nombre del driver y el tipo de datos desde Impresoras y escáneres > Propiedades de la impresora > Avanzadas).
3. Resultado de las variantes T, A, C, D, B, E con la anotación de texto, "V" y corte.
4. Si el panel o la página de configuración de la TSP100 indica el modo de emulación.

## 10. Prueba Star TSP100 Cutter / TSP143 — star-probe (v0.3, solo texto y corte)

Objetivo: saber qué combinación de avance + corte corta en la Star TSP100 con emulación ESC/POS,
sin logo ni gráficos. No cambia ventas, TPV, Supabase ni facturación.

Cambio respecto de v0.2: nuevo comando `star-probe` (archivo `StarProbe.cs`). Las variantes solo
cambian el avance antes del corte (LF repetidos frente a `ESC d 4`) y la forma del corte:

| Código | Bytes tras el texto | Qué responde |
|---|---|---|
| S0 | LF x4, sin corte | Control: ¿aparece 'V' o basura sin corte? |
| S1 | LF x4 + `GS V 66 0` | ¿Corta con avance LF, como Walinka 'Solo texto'? |
| S2 | `ESC d 4` + `GS V 66 0` | ¿Corta con avance ESC/POS explícito? |
| S3 | `ESC d 4` + `GS V 65 0` | ¿Corta solo con corte total? |

Todas empiezan con `ESC @`, no contienen pulso de cajón (`ESC p`) y pasan el validador de payload.

### 10.1 Cómo probar en Windows

1. Desde la carpeta del conector en PowerShell, compila (requiere .NET 8 SDK):
   `.\build.ps1`
2. Comprueba que el equipo ve la impresora y su estado (en ambos PCs si hay dos):
   `.\publish\WalinkaPrintConnector.exe info --printer "Star TSP100 Cutter (TSP143)"`
   Copia la salida completa (nombre de cola, puerto, driver, datatype, estado).
3. Lista las variantes:
   `.\publish\WalinkaPrintConnector.exe star-probe --list-variants`
4. Ejecuta una variante por vez, en este orden: S0, S1, S2, S3. Espera a que termine la impresión
   antes de la siguiente:
   `.\publish\WalinkaPrintConnector.exe star-probe --printer "Star TSP100 Cutter (TSP143)" --variant S0`
   Si la impresora reporta un estado (sin papel, tapa abierta), el comando no envía nada salvo que
   añadas `--force`; no lo uses sin revisar la impresora.
5. Anota en una tabla por variante:
   - ¿Texto legible? (sí / caracteres extraños / no imprime)
   - ¿'V' al inicio? (sí / no)
   - ¿Corta? (sí / no / parcial / corta y deja tira)
   - ¿Cuántos mm quedan tras el corte?
6. Envía la tabla y la salida de `info` para decidir el perfil de la Star.

### 10.2 Qué significa cada resultado

- S0 con 'V' o basura: el problema está en la cola o el driver, antes del corte. No es un problema de corte.
- S0 limpio y S1 sin corte: el cortador no responde a `GS V 66 0` con avance LF. Probar S2/S3.
- S2 corta y S1 no: el avance `ESC d` es necesario. Entonces el perfil Star debe usar `ESC d` antes del corte.
- Solo S3 corta: la cuchilla de la Star responde a corte total; el perfil Star usará `GS V 65 0`.
- Ninguna corta pero todas imprimen limpio: cambiar la emulación en el driver de Star (ESC/POS en lugar de Star Line)
  y repetir S0 antes de seguir.

### 10.3 Límites de esta versión

- No se ha compilado con .NET en Windows dentro de este entorno: el build y `selftest` se verificaron
  con un compilado de prueba para Linux (93 pruebas OK). La compilación oficial la hace `build.ps1` en Windows.
- Las pruebas no tocan la cola de ventas ni el registro de trabajos de impresión.
- El logo queda fuera; se aborda después de confirmar el corte.

## 11. Configuración que funcionó — Star TSP100IIU (prueba física 2026-11-01 13:02:41)

Confirmado físicamente: E1 (`test-print --cut modern`) imprimió el ticket completo y la impresora cortó sola.
Ticket `minimal-cut --cut modern` también cortó (una línea, un LF).

### 11.1 Comandos que se enviaron (E1, `TicketBuilder.Build(CutStyle.Modern)`)

- `1B 40` (ESC @, init)
- `1B 61 00` (ESC a 0, alineación izquierda)
- 17 líneas de texto ASCII, cada una con `0A`
- `0A 0A 0A 0A` (4 LF de avance)
- `1D 56 42 00` (GS V 66 0, corte parcial)

Mismo corte que `minimal-cut` (1 LF antes de `GS V 66 0`). La diferencia entre ambos es solo el número de LF y la cantidad de texto.

### 11.2 Transporte

- `Spooler.SendRaw`: `OpenPrinter` → `StartDocPrinterW` con `pDatatype = "RAW"` → `StartPagePrinter` → **un** `WritePrinter` con el buffer completo (verifica bytes escritos) → `EndPagePrinter` → `EndDocPrinter`.
- Sin render GDI ni XPS: el firmware de la impresora interpreta los bytes.

### 11.3 Configuración de la impresora y de la cola (pendiente de completar)

Estos datos definen el perfil de la TSP100IIU. Pégalos desde la salida de `info --printer "Star TSP100IIU"` y de la autoprueba:

- Modelo: Star TSP100IIU Ver3.0 (autoprueba)
- Cutter: Enable (autoprueba)
- USB Class: Printer (autoprueba)
- Área imprimible: 72 mm (autoprueba)
- Modo de emulación: **[PENDIENTE: ESC/POS o Star Line, según la autoprueba]**
- Nombre de la cola: **[PENDIENTE]**
- Driver: **[PENDIENTE]**
- Puerto: **[PENDIENTE]**
- Datatype por defecto de la cola: **[PENDIENTE]**
- Print processor: **[PENDIENTE]**

### 11.4 Qué no se ha validado

- Logo (raster) con corte automático: pendiente.
- Ticket de venta completo con productos y totales: pendiente.
- Avance: el ticket funcionó con 4 LF; reducir a 2 LF queda como prueba aparte.
- XP-80C: sin cambios; sigue con sus perfiles actuales.
