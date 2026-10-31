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

## Pruebas reales en Windows (antes de declarar terminado)

1. `.\build.ps1` → genera `publish\WalinkaPrintConnector.exe`.
2. `.\publish\WalinkaPrintConnector.exe selftest` → debe decir `Todo OK (53 pruebas)`.
3. `.\publish\WalinkaPrintConnector.exe serve` (dejar la consola abierta).
4. En otra consola: `.\publish\WalinkaPrintConnector.exe pair` y copiar el código.
5. En Walinka (`http://localhost:5173/crm/impresion`): estado "Conectado" y código de emparejamiento.
   Elegir la impresora XP-80C, activar "Usar para ventas".
6. "Imprimir ticket de prueba": debe salir un ticket de 80 mm y cortarse solo.
7. "Probar corte" y "Probar logo": deben salir por el conector.
8. Venta real en el TPV: debe imprimir una vez y cortar. Repetir la reimpresión manual
   debe imprimir de nuevo; un reintento automático no debe duplicar.
9. Apagar el conector y cobrar: el TPV debe mostrar error, no imprimir por QZ Tray.

Verificación de código hecha fuera de Windows: `node --test` sobre los módulos de
impresión (32 pruebas en printRouting, localConnectorProvider y connectorConfigStorage),
y selftest del conector (53). No se ejecutó vitest ni `vite build` en este entorno.

---

# E4 — Instalador y ejecución automática (Windows)

## Decisiones

- **Instalador: Inno Setup 6**, por usuario (`PrivilegesRequired=lowest`), sin administrador.
  Motivo: un solo `.exe` de instalación, desinstalador, entradas de menú Inicio y
  mantenimiento sencillo en un script `.iss`. WiX exige más infraestructura para lo mismo.
- **Sin bandeja ni app residente (por ahora).** Un vigilante en segundo plano basta. Una
  bandeja agrega un proceso de interfaz que hay que mantener; se evalúa después del piloto.
- **Inicio con sesión**: entrada `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` que
  lanza `conhost.exe --headless WalinkaPrintConnector.exe watch`. `--headless` evita la
  ventana de consola (Windows 10 1903 o superior). No requiere administrador.
- **Vigilante (`watch`)**: ejecuta `serve` como proceso hijo sin ventana. Si `serve`
  termina inesperadamente, lo reinicia con espera creciente (1, 2, 5, 10, 30 s). Un proceso
  que estuvo sano al menos 1 minuto reinicia el contador. Log en
  `%LOCALAPPDATA%\WalinkaPrintConnector\logs\connector.log` (se recorta a 2 MB, sin tickets ni tokens).
- **Instancia única**: mutex `Local\WalinkaPrintConnector.Watch` y `…Serve`. Un segundo
  arranque responde "ya está en ejecución" y sale con código 4.
- **Parada**: `WalinkaPrintConnector.exe stop` activa el evento
  `Local\WalinkaPrintConnector.Stop`; el vigilante y el servicio terminan limpiamente.
- **Puerto ocupado**: si 47801 responde como Walinka Print Connector, `serve` sale con código 0.
  Si lo usa otra aplicación, sale con código 3 y explica qué hacer.
- **Datos fuera del programa**: `%LOCALAPPDATA%\WalinkaPrintConnector` (configuración,
  emparejamiento, logs). El instalador nunca los toca; por eso una actualización conserva
  el emparejamiento. Al desinstalar pregunta si los borra.

## Orígenes de producción

- La configuración por defecto solo tiene `https://go.ventalink.app` y `https://go.walinka.com`.
- `http://localhost` se rechaza salvo que `config.json` tenga `"AllowLocalDevOrigin": true`
  (solo desarrollo). **Un equipo de desarrollo con `localhost:5173` debe agregar ese flag**
  en `%LOCALAPPDATA%\WalinkaPrintConnector\config.json`, o `serve` no arrancará.

## Generar el instalador

Requisitos en la máquina de build: .NET 8 SDK y Inno Setup 6 (`winget install JRSoftware.InnoSetup`).

```
cd tools\walinka-print-connector
.\installer\build-installer.ps1
```

Resultado: `tools\walinka-print-connector\installer-output\WalinkaPrintConnector-Setup-0.3.0.exe`.
La versión sale de `WalinkaPrintConnector.csproj`; subirla ahí antes de cada release.

## Instalar y probar en tu computadora

1. Ejecutar `WalinkaPrintConnector-Setup-0.3.0.exe`. No pide administrador.
2. Al terminar, el conector queda corriendo. Menú Inicio → Walinka → "Estado del conector".
3. Reiniciar Windows y comprobar que el conector arranca solo (`Estado del conector` debe mostrar que responde).
4. En Walinka: Configuración de impresión → emparejar, elegir la XP-80C, activar para ventas.
5. Probar ticket de prueba, corte, venta real y reimpresión (ver lista de Windows más arriba).
6. Matar el proceso `WalinkaPrintConnector.exe` desde el Administrador de tareas y comprobar que vuelve en pocos segundos.
7. Ocupar el puerto (`python -m http.server 47801 --bind 127.0.0.1`) y ejecutar `serve`: debe avisar y salir con código 3.
8. Instalar encima de la versión anterior y comprobar que el emparejamiento sigue activo.
9. Desinstalar desde Configuración → Aplicaciones y elegir si se borra la configuración.

Menú Inicio: Reiniciar conector, Detener conector, Estado del conector, Desinstalar.

## Estado de las pruebas

Verificado en este entorno (Linux, sin Windows):
- `selftest`: 60 pruebas OK (incluye reglas de reinicio, nombres de instancia y orígenes de producción).
- Compilación del código del conector con Roslyn (csc) contra los paquetes de referencia .NET 8.
- Puerto ocupado por otra aplicación: `serve` sale con código 3.
- Sintaxis del script de build revisada a ojo; no se ejecutó.

Pendiente, NO verificado (requiere Windows):
- Compilación del instalador con ISCC y el instalador generado.
- Instancia única y parada con `stop`: los objetos `Local\` no existen fuera de Windows. La lógica compila y se prueba en Windows, nada más.
- Vigilante: reinicio tras matar el proceso, espera creciente, inicio con sesión, `conhost --headless`.
- Instalación limpia, actualización conservando emparejamiento, desinstalación en Windows 10 y 11.
- Impresión y corte desde el instalador instalado (ya probado con el ejecutable de pruebas, no con el instalador).

## Riesgo abierto: cajón portamonedas (ESC p)

El conector no expone ningún comando de cajón, pero el contenido de un trabajo es bytes
ESC/POS arbitrarios. Un origen permitido con token válido podría enviar `ESC p` (0x1B 0x70)
dentro de un trabajo. El origen y el token lo limitan, pero no lo bloquean.

Un filtro simple de bytes **no es seguro**: el raster del logo es binario y puede contener
0x1B 0x70 legítimamente. Las opciones reales son:
1. Analizar el flujo ESC/POS comando por comando (longitudes conocidas) y rechazar `ESC p` y `DLE DC4`
   fuera del raster. Es la opción correcta, pero requiere trabajo y pruebas con cada comando.
2. Hacer que Walinka envíe el logo siempre en formato que no pueda confundirse (por ejemplo, un
   perfil de solo texto para el cajón) y el conector rechace cualquier trabajo que no lo cumpla.
3. Aceptar el riesgo documentado mientras el origen esté restringido a Walinka y el token sea privado.

Recomendación: opción 1 antes de vender a terceros. Se necesita tu decisión antes de avanzar.
