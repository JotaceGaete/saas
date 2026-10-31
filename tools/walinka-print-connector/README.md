# Walinka Print Connector — E2 (servicio local con emparejamiento)

Fase E1 del diseño `docs/printing/walinka-print-connector.md`: demostrar impresión RAW, corte y apertura de cajón desde un programa Windows propio, sin QZ Tray.

Alcance de este prototipo:
- Lista impresoras de Windows y su estado reportado.
- Envía bytes RAW a la cola de Windows (winspool).
- Imprime un ticket de prueba de 80 mm con corte. No contiene ventas, montos, RUT ni boletas.
- Envía el pulso de cajón solo con `--confirm`.

Fuera de alcance (no implementado a propósito): API HTTP local, emparejamiento, token, instalación automática, cambios al TPV, ventas, caja, boletas, QZ Tray, instalación de drivers, cambios de configuración de impresoras.

## Compilar en Windows

1. Instala .NET 8 SDK.
2. Abre PowerShell en esta carpeta y ejecuta:
   ```powershell
   .\build.ps1
   ```
   Genera `publish\WalinkaPrintConnector.exe` (autocontenido, sin runtime aparte).

Si PowerShell bloquea el script: `Set-ExecutionPolicy -Scope Process Bypass` y vuelve a ejecutar.

## Probar

Todos los comandos se ejecutan desde `publish\`.

1. Verifica las secuencias de bytes (no usa impresora):
   ```powershell
   .\WalinkaPrintConnector.exe selftest
   ```
   Debe terminar con `Todo OK.`

2. Revisa las impresoras instaladas:
   ```powershell
   .\WalinkaPrintConnector.exe list
   ```
   Anota el nombre exacto de la Star TSP143 (incluye espacios y mayúsculas tal como aparece).

3. Genera el ticket sin imprimir, para revisar los bytes:
   ```powershell
   .\WalinkaPrintConnector.exe bytes --out ticket-e1.bin --cut modern
   ```

4. Imprime el ticket de prueba con corte:
   ```powershell
   .\WalinkaPrintConnector.exe test-print --printer "Star TSP143" --cut modern
   ```
   - Si Windows reporta problemas (sin conexión, sin papel, atascada), el programa no envía nada. Revisa la impresora y vuelve a intentar.
   - `--force` envía igual. Úsalo solo para diagnóstico.

5. Prueba de corte alternativa, si el modern no corta:
   ```powershell
   .\WalinkaPrintConnector.exe test-print --printer "Star TSP143" --cut legacy
   ```

6. Diagnóstico de corte (v0.2). Cada variante es un job mínimo, sin ticket completo ni cajón:
   ```powershell
   .\WalinkaPrintConnector.exe info --printer "NOMBRE"
   .\WalinkaPrintConnector.exe cut-probe --list-variants
   .\WalinkaPrintConnector.exe cut-probe --printer "NOMBRE" --variant T
   .\WalinkaPrintConnector.exe cut-probe --printer "NOMBRE" --variant A
   .\WalinkaPrintConnector.exe cut-probe --printer "NOMBRE" --variant C
   .\WalinkaPrintConnector.exe cut-probe --printer "NOMBRE" --variant D
   .\WalinkaPrintConnector.exe cut-probe --printer "NOMBRE" --variant B
   .\WalinkaPrintConnector.exe cut-probe --printer "NOMBRE" --variant E
   ```
   Anotá por variante: texto completo (sí/no), "V" al inicio (sí/no), corte (sí/no).
   Ejecutá también `info` en el computador donde QZ sí corta y compará los bloques.

7. Cajón (opcional, solo con confirmación explícita):
   ```powershell
   .\WalinkaPrintConnector.exe drawer --printer "Star TSP143" --confirm
   ```
   Sin `--confirm` no envía nada.

## Qué confirma cada prueba

- `test-print` con "Windows ACEPTÓ el trabajo" solo dice que el spooler recibió los bytes.
- Que el papel salió completo y se cortó lo confirmas tú, mirando la impresora.
- Un trabajo aceptado puede no imprimirse si la impresora pierde energía, se queda sin papel o el driver la mapea a otro modo. Por eso el resultado es visual.

## Requisitos del modo de la impresora

El ticket usa ESC/POS. La Star debe estar en modo que interprete ESC/POS. No cambies la configuración de la impresora desde el programa: si hace falta, hazlo tú desde la utilidad de Star, y registra qué modo usaste en el informe de compatibilidad.

## Archivos

- `Program.cs`: comandos CLI.
- `Spooler.cs`: envío RAW y lectura de estado con winspool.
- `EscPos.cs`: bytes ESC/POS. El corte `GS V 66 0` coincide con la estrategia `gs-v-modern` ya validada en `src/lib/printing/receipts/escPosCapabilities.js`.
- `TicketBuilder.cs`: ticket de prueba.
- `COMPATIBILIDAD.md`: informe de compatibilidad y limitaciones.

## E2 — servicio local (Walinka se conecta aquí)

El ejecutable además corre como servicio HTTP en `http://127.0.0.1:47801`.
Solo escucha en loopback y solo acepta orígenes permitidos (`https://go.ventalink.app`,
`https://go.walinka.com`).

```
.\WalinkaPrintConnector.exe serve
```

Emparejamiento (una vez por equipo):

1. En este equipo ejecuta `.\WalinkaPrintConnector.exe pair`. Muestra un código de 6 dígitos.
2. En Walinka, Configuración de impresión → Walinka Print Connector → escribe ese código y pulsa "Emparejar". Vale 5 minutos.
3. Tras 5 intentos fallidos el código caduca. Un código solo sirve una vez.
4. El token queda guardado solo como hash SHA-256, ligado al origen que emparejó.

Endpoints: `GET /v1/health`, `POST /v1/pair`, `GET /v1/printers`,
`POST /v1/printers/test` (corte de prueba), `POST /v1/print` (ticket con `idempotencyKey`),
`GET /v1/jobs/{key}`. No hay endpoint de cajón: `ESC p` no se expone.

Idempotencia: el mismo `idempotencyKey` no vuelve a imprimirse mientras esté en
`printing` o `sent_to_spooler`; solo se reenvía si quedó en `failed`.
Estado `sent_to_spooler` significa "Windows aceptó el trabajo", no "la impresora cortó".

Autoprueba sin impresora: `.\WalinkaPrintConnector.exe selftest` (53 pruebas).

Pendiente antes de piloto: instalador, arranque automático, firma de código,
verificación en navegador con venta real y corte del Xprinter.
