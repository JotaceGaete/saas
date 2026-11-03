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

- **Instalador: Inno Setup 6 o 7**, por usuario (`PrivilegesRequired=lowest`), sin administrador.
  Motivo: un solo `.exe` de instalación, desinstalador, entradas de menú Inicio y
  mantenimiento sencillo en un script `.iss`. WiX exige más infraestructura para lo mismo.
- **Sin bandeja ni app residente (por ahora).** Un vigilante en segundo plano basta. Una
  bandeja agrega un proceso de interfaz que hay que mantener; se evalúa después del piloto.
- **Inicio con sesión**: entrada `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` que
  lanza `conhost.exe --headless WalinkaPrintConnector.exe watch`. `--headless` evita la
  ventana de consola (Windows 10 1903 o superior). No requiere administrador.
- **Vigilante (`watch`)**: ejecuta `serve` como proceso hijo sin ventana. Si `serve`
  termina inesperadamente, lo reinicia con espera creciente (1, 2, 5, 10, 30 s). Un proceso
  que estuvo sano al menos 1 minuto reinicia el contador. Tope absoluto: si `serve` se cae
  más de 10 veces en una hora, el vigilante se rinde (código 5) y deja de reiniciarlo; hay que
  corregir la causa y ejecutar `restart`. Log en
  `%LOCALAPPDATA%\WalinkaPrintConnector\logs\connector.log` (se recorta a 2 MB, sin tickets ni tokens).
- **Instancia única**: mutex `Local\WalinkaPrintConnector.Watch` y `…Serve`. Un segundo
  arranque responde "ya está en ejecución" y sale con código 4. `Local\` es por sesión de
  inicio de sesión, no por cuenta de Windows. El puerto 47801 es de toda la máquina, así que
  dos sesiones no pueden tener dos servicios activos a la vez (la segunda recibe código 3).
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

## Previews de Vercel (pruebas)

Una Preview (`https://saas-git-<rama>-juan-s-projects-afd7e18e.vercel.app`) no
está en los orígenes de fábrica: el conector responde a `/v1/health` sin
cabeceras CORS y el navegador bloquea la respuesta, así que Walinka dice que no
encuentra el conector. Desde el PR #118, la pantalla de impresión lo distingue
con una sonda `no-cors` (sin token) y muestra el origen exacto que falta.

Para autorizar una Preview concreta, sin abrir CORS a otros dominios y sin
recompilar el conector:

```powershell
powershell -ExecutionPolicy Bypass -File tools\walinka-print-connector\scripts\autorizar-origen.ps1 -Origen "https://saas-git-<rama>-juan-s-projects-afd7e18e.vercel.app"
```

El script agrega solo ese origen exacto a `AllowedOrigins`, valida la
configuración con el propio conector (si falla, restaura la copia `.bak`),
reinicia el conector y muestra un código de emparejamiento. El token queda
ligado a ese origen, así que hay que emparejar en la Preview. Para revocar:
`-Quitar`. No se aceptan comodines: el conector solo compara orígenes exactos
(`OriginPolicy.IsAllowed`). Chrome y Edge pueden pedir el permiso de acceso a
la red local la primera vez que la Preview llama a `127.0.0.1`: hay que aceptarlo.

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
- `selftest`: 87 pruebas OK (incluye reglas de reinicio, tope de reinicios, orígenes y ESC/POS).
- Compilación del código del conector con Roslyn (csc) contra los paquetes de referencia .NET 8.
- Puerto ocupado por otra aplicación: `serve` sale con código 3.
- Sintaxis del script de build revisada a ojo; no se ejecutó.

Pendiente, NO verificado (requiere Windows):
- Compilación del instalador con ISCC y el instalador generado.
- Instancia única y parada con `stop`: los objetos `Local\` no existen fuera de Windows. La lógica compila y se prueba en Windows, nada más.
- Vigilante: reinicio tras matar el proceso, espera creciente, inicio con sesión, `conhost --headless`.
- Instalación limpia, actualización conservando emparejamiento, desinstalación en Windows 10 y 11.
- Impresión y corte desde el instalador instalado (ya probado con el ejecutable de pruebas, no con el instalador).

## Seguridad ESC/POS (E4.1): cajón portamonedas bloqueado

Cada trabajo se valida comando por comando antes de llegar a la cola de Windows
(`EscPosStreamValidator.cs`). No se buscan bytes sueltos: cada comando se consume con su
longitud. Por eso los datos de imagen (`GS v 0`, `ESC *`) pueden contener 0x1B 0x70 sin
que se rechacen, y un `ESC p` real fuera de esos datos sí se rechaza.

Comandos admitidos: `ESC @`, `ESC a`, `ESC E`, `ESC 2`, `ESC 3`, `ESC d`, `ESC $`, `ESC *`
(m = 0, 1, 32, 33), `GS !` (0x00, 0x01, 0x10, 0x11), `GS V` (0, 1, 48, 49, 65, 66) y
`GS v 0`, más texto imprimible y LF. Todo lo demás se rechaza con un código concreto:
`escpos_drawer_blocked`, `escpos_truncated`, `escpos_unknown_command`, `escpos_bad_parameter`,
`escpos_control_not_allowed`.

Comprobar un archivo sin imprimirlo:
`.\WalinkaPrintConnector.exe validate --file ticket.bin`

Verificado: los bytes reales generados por el renderizador de Walinka (ticket de prueba,
corte moderno y legacy, raster de logo en `GS v 0`, imagen en `ESC *` de 8 y 24 puntos,
posición absoluta) pasan la validación. El `selftest` cubre 83 casos, incluidos los
rechazos.

Límite conocido: el validador no decide si un comando es seguro para una impresora concreta;
solo garantiza la forma del flujo. El cajón no se abre desde ningún endpoint ni comando.

---

## Comerciantes: instalar, configurar y actualizar

### Instalar
1. Descargar `WalinkaPrintConnector-Setup-<versión>.exe` desde Walinka.
2. Ejecutarlo. No pide administrador. Dejar marcada la opción de iniciar con Windows.
3. Al terminar, el conector queda corriendo. Menú Inicio → Walinka → "Estado del conector".

### Configuración inicial
1. En Walinka: Configuración de impresión → Walinka Print Connector.
2. En el equipo: Menú Inicio → Walinka → "Emparejar con Walinka". Muestra un código de 6 dígitos
   válido 5 minutos. No hace falta PowerShell.
3. Escribir el código en Walinka y pulsar "Emparejar".
4. Elegir la impresora (por ejemplo, la XP-80C) y activar "Usar para ventas".
5. Pulsar "Imprimir ticket de prueba": debe salir completo y cortarse solo.

### Solución de problemas
| Síntoma | Qué hacer |
|---|---|
| Walinka dice "Conector no encontrado" | Menú Inicio → "Estado del conector". Si no responde, "Reiniciar conector". |
| "Configuración inválida" en el log o en la consola | Revisar `%LOCALAPPDATA%\WalinkaPrintConnector\config.json` y corregirlo. El vigilante reintenta solo cada 30 s. |
| "El puerto 47801 está ocupado" | Cerrar la aplicación que usa el puerto y reiniciar el conector. |
| "se cayó más de 10 veces en una hora" en el log | El vigilante se detuvo a propósito. Revisar el log, corregir la causa y usar "Reiniciar conector". |
| Walinka dice que el conector no está emparejado | Menú Inicio → "Emparejar con Walinka" → escribir el código en Walinka. |
| "No hay impresoras" | Instalar la impresora en Windows (Configuración → Impresoras) y pulsar "Verificar conector". |
| La impresora no corta | Probar "Probar corte" desde Walinka. Si no corta, revisar el modelo y la cola de Windows. |
| El ticket no sale | Ver el log en `%LOCALAPPDATA%\WalinkaPrintConnector\logs\connector.log`. |

### Actualizar
1. Ejecutar el instalador nuevo encima de la versión anterior. Se detiene el conector, se actualiza y se reinicia.
2. La configuración y el emparejamiento se conservan: no hace falta emparejar de nuevo.

### Desinstalar
Configuración → Aplicaciones → Walinka Print Connector → Desinstalar. Al final pregunta si
borrar también la configuración y el emparejamiento. Responder "No" permite reinstalar
sin emparejar otra vez.

---

## Desarrollo vs. producción

| | Producción (instalador) | Desarrollo (equipo de pruebas) |
|---|---|---|
| Orígenes permitidos | `https://go.ventalink.app`, `https://go.walinka.com` | Además `http://localhost:5173` |
| Cómo se habilita | Por defecto | `"AllowLocalDevOrigin": true` en `config.json` |
| Instalador | Sí | No, se ejecuta desde `publish\` |

El instalador nunca escribe `localhost` ni activa `AllowLocalDevOrigin`. Un equipo de
desarrollo que use `localhost:5173` debe agregar el flag a mano en su `config.json`.

---

## Estado de las pruebas

### Automatizadas (sin Windows)
- `selftest` del conector: 87 pruebas OK (seguridad, pairing, cola, ESC/POS, configuración, vigilante, tope de reinicios).
- Bytes reales de Walinka validados con `validate`: ticket de prueba, cortes moderno y legacy,
  raster de logo, imagen `ESC *`, posición absoluta.
- Tests `node --test` del lado Walinka (cliente, configuración y enrutamiento): 39 OK.
- Compilación del código con Roslyn, incluido el validador.
- Puerto ocupado y configuración inválida: códigos de salida correctos (3 y 2).
- No ejecutadas en este entorno: vitest de las pantallas, `vite build`, y `build-installer.ps1`
  (PowerShell no disponible aquí; el script se revisó a mano).

### Físicas (requieren Windows)
Pendientes de la lista que acompaña al PR. Las ya confirmadas en E4 son: instalación, inicio,
detección desde Walinka, XP-80C, impresión y corte sin QZ Tray, y conservación de configuración.

---

## Licencia de Inno Setup (revisión antes de distribuir)

- La licencia de Inno Setup permite uso comercial y redistribución, con cuatro condiciones:
  conservar los avisos de copyright, no atribuirse el software, marcar las versiones modificadas
  y, en el caso de web sites en pantallas "Acerca de", mantener las direcciones.
- El sitio de Jordan Russell pide que los usuarios comerciales (empresas o freelancers con ingresos
  anuales superiores a USD 5.000) compren licencia, aunque no es obligatoria. Aplica a cualquier versión.
- Lo que no pude verificar: el texto exacto del aviso «Non-commercial use only» que aparece en la
  versión 7 del compilador. Hay que revisarlo en la consola de ISCC antes de decidir.
- Antes de distribuir comercialmente: decidir si se compra la licencia (Single User para un solo
  compilador) y confirmar con el autor si el instalador generado necesita algún aviso de copyright.
  Esta revisión no autoriza la distribución por sí sola.
