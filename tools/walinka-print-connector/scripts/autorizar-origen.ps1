<#
Autoriza (o quita) UN origen exacto en el Walinka Print Connector instalado.

Uso, en PowerShell del PC de la caja (sin administrador):
  powershell -ExecutionPolicy Bypass -File autorizar-origen.ps1 -Origen "https://saas-git-claude-project-thread-34xw19-juan-s-projects-afd7e18e.vercel.app"
  powershell -ExecutionPolicy Bypass -File autorizar-origen.ps1 -Origen "https://..." -Quitar

Reglas, iguales a ConnectorConfig.Validate del conector:
  - Solo https, solo esquema + host (sin ruta, sin consulta, sin barra final), sin comodines.
  - Nunca abre CORS a "*" ni a un dominio completo: el origen se compara exacto.
  - Los dominios de producción (go.ventalink.app, go.walinka.com) no se quitan.
Después reinicia el conector. El token de emparejamiento queda ligado a cada
origen: en el sitio nuevo hay que emparejar con un código de "pair".
#>
param(
  [Parameter(Mandatory = $true)][string]$Origen,
  [switch]$Quitar
)
$ErrorActionPreference = 'Stop'

$dataDir = Join-Path $env:LOCALAPPDATA 'WalinkaPrintConnector'
$configPath = Join-Path $dataDir 'config.json'
$exe = Join-Path $env:LOCALAPPDATA 'Programs\Walinka Print Connector\WalinkaPrintConnector.exe'
$produccion = @('https://go.ventalink.app', 'https://go.walinka.com')

$Origen = $Origen.Trim()
if ($Origen -notmatch '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') {
  throw "Origen no válido: '$Origen'. Debe ser https://host exacto, sin ruta, sin barra final y sin comodines."
}
if (-not (Test-Path $configPath)) { throw "No existe $configPath. Inicia el conector una vez antes." }
if (-not (Test-Path $exe)) { throw "No se encontró el conector en $exe." }

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$actuales = @($config.AllowedOrigins)
if ($Quitar) {
  if ($produccion -contains $Origen) { throw 'Los orígenes de producción no se quitan con este script.' }
  $nuevos = @($actuales | Where-Object { $_ -ine $Origen })
} else {
  $nuevos = @($actuales)
  if (-not ($actuales | Where-Object { $_ -ieq $Origen })) { $nuevos += $Origen }
}
if ($nuevos.Count -eq 0) { throw 'Debe quedar al menos un origen permitido.' }

Copy-Item $configPath "$configPath.bak" -Force
$config.AllowedOrigins = $nuevos
# UTF-8 sin BOM, como lo escribe el conector.
$json = $config | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding($false)))

& $exe config | Out-Null
if ($LASTEXITCODE -ne 0) {
  Copy-Item "$configPath.bak" $configPath -Force
  throw 'El conector rechazó la configuración nueva; se restauró la anterior.'
}
& $exe restart
Write-Host ''
Write-Host 'Orígenes permitidos:'
$nuevos | ForEach-Object { Write-Host "  $_" }
if (-not $Quitar) {
  Write-Host ''
  Write-Host 'Ahora genera un código y empareja en ese sitio:'
  & $exe pair
}
