# Prueba del instalador en Windows (E4)

Carpeta de prueba: `C:\proyectos\walinka-print-test`. Esta guía no declara nada aprobado:
cada punto se marca solo cuando se ejecuta y se observa el resultado esperado.

## 0. Preparar la carpeta

Requisitos en la máquina de build: .NET 8 SDK y Inno Setup 6 o 7.

```
winget install Microsoft.DotNet.SDK.8
winget install JRSoftware.InnoSetup
```

Obtener el código (rama E4):

```
cd C:\proyectos
git clone https://github.com/JotaceGaete/saas.git walinka-print-test
cd walinka-print-test
git checkout feat/print-connector-e4
cd tools\walinka-print-connector
```

## 1. Compilar y probar el ejecutable

```
.\build.ps1
.\publish\WalinkaPrintConnector.exe selftest
```

Esperado: `Todo OK (87 pruebas).` y código de salida 0.

## 2. Generar el instalador

```
.\installer\build-installer.ps1
```

Esperado: `installer-output\WalinkaPrintConnector-Setup-0.3.0.exe`. Si el compilador no aparece,
usar `-IsccPath "C:\ruta\a\ISCC.exe"`.

## 3. Preparar un equipo limpio

Usar una cuenta de Windows nueva (Configuración → Cuentas → Otros usuarios) o una máquina virtual.
Si el conector ya estaba instalado en la cuenta, desinstalarlo antes. Anotar la versión de Windows.

## 4. Pruebas

Marcar cada punto solo con su resultado observado.

| # | Prueba | Cómo | Resultado esperado |
|---|---|---|---|
| 1 | Instalación sin administrador | Ejecutar el Setup como usuario normal | No pide UAC. Queda en `%LOCALAPPDATA%\Programs\Walinka Print Connector`. |
| 2 | Arranque tras instalar | Menú Inicio → Walinka → "Estado del conector" | Vigilante y servicio "en ejecución". |
| 3 | Respuesta local | `curl http://127.0.0.1:47801/v1/health` | JSON con `walinka-print-connector`. |
| 4 | Inicio con sesión | `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run /v WalinkaPrintConnector`; cerrar sesión y volver a entrar | La clave existe y el estado vuelve a "en ejecución" sin abrir nada. |
| 5 | Reinicio tras caída | Administrador de tareas → terminar `WalinkaPrintConnector.exe` (el proceso de servicio) | En unos segundos vuelve. El log dice "terminó inesperadamente". |
| 6 | Instancia única | Con el conector ya corriendo: `WalinkaPrintConnector.exe watch` | Dice "ya está en ejecución". `echo %errorlevel%` = 4. No se duplica. |
| 7 | Puerto ocupado | Cerrar el conector y `python -m http.server 47801 --bind 127.0.0.1`; luego `WalinkaPrintConnector.exe serve` | Avisa del puerto ocupado. Código 3. |
| 8 | Emparejamiento sin PowerShell | Menú Inicio → "Emparejar con Walinka" | Muestra código de 6 dígitos. Walinka lo acepta. |
| 9 | Ticket y corte | En Walinka: ticket de prueba, luego venta TPV real | Sale completo y corta solo. XP-80C. |
| 10 | Reimpresión, caja abierta | Caja abierta → Movimientos → NV de venta TPV → "Reimprimir" | Muestra "Reimpresión enviada…" y sale el ticket cortado. Ningún movimiento ni venta nueva. |
| 11 | Reimpresión, conector detenido | Menú Inicio → "Detener conector" → "Reimprimir" | Aviso rojo con el motivo. No imprime por QZ. |
| 12 | Límite de reinicios | Matar el proceso 11 veces en una hora (script de prueba) | El log dice "se cayó más de 10 veces". El vigilante se detiene. "Reiniciar conector" lo vuelve a levantar. |
| 13 | Actualización | Instalar una versión nueva encima | Se detiene el conector, se actualiza y no hace falta emparejar. |
| 14 | Desinstalación, conservar datos | Configuración → Aplicaciones → Desinstalar → "No" | Se quita el programa y la clave de inicio. Al reinstalar, sigue emparejado. |
| 15 | Desinstalación, borrar datos | Igual, responder "Sí" | `%LOCALAPPDATA%\WalinkaPrintConnector` desaparece. |
| 16 | Cajón bloqueado | `WalinkaPrintConnector.exe validate --file archivo-con-ESC-p.bin` | RECHAZADO con `escpos_drawer_blocked`. |

## 5. Dónde mirar si algo falla

- Log: `%LOCALAPPDATA%\WalinkaPrintConnector\logs\connector.log`
- Instalador: `%TEMP%\Setup Log*.txt` (activo con `SetupLogging=yes`)
- Estado: "Estado del conector" en el menú Inicio

## 6. Registrar el resultado

Por cada fila: fecha, versión de Windows, número de prueba, resultado observado y, si falló,
la línea del log. No cerrar E4 hasta tener las filas 1 a 15 observadas.
