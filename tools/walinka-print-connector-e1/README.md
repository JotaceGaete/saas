# Walinka Print Connector — prototipo E1

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
   Genera `publish\WalinkaPrintProbe.exe` (autocontenido, sin runtime aparte).

Si PowerShell bloquea el script: `Set-ExecutionPolicy -Scope Process Bypass` y vuelve a ejecutar.

## Probar

Todos los comandos se ejecutan desde `publish\`.

1. Verifica las secuencias de bytes (no usa impresora):
   ```powershell
   .\WalinkaPrintProbe.exe selftest
   ```
   Debe terminar con `Todo OK.`

2. Revisa las impresoras instaladas:
   ```powershell
   .\WalinkaPrintProbe.exe list
   ```
   Anota el nombre exacto de la Star TSP143 (incluye espacios y mayúsculas tal como aparece).

3. Genera el ticket sin imprimir, para revisar los bytes:
   ```powershell
   .\WalinkaPrintProbe.exe bytes --out ticket-e1.bin --cut modern
   ```

4. Imprime el ticket de prueba con corte:
   ```powershell
   .\WalinkaPrintProbe.exe test-print --printer "Star TSP143" --cut modern
   ```
   - Si Windows reporta problemas (sin conexión, sin papel, atascada), el programa no envía nada. Revisa la impresora y vuelve a intentar.
   - `--force` envía igual. Úsalo solo para diagnóstico.

5. Prueba de corte alternativa, si el modern no corta:
   ```powershell
   .\WalinkaPrintProbe.exe test-print --printer "Star TSP143" --cut legacy
   ```

6. Cajón (opcional, solo con confirmación explícita):
   ```powershell
   .\WalinkaPrintProbe.exe drawer --printer "Star TSP143" --confirm
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
