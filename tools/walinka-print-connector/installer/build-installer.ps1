# Genera el instalador de Walinka Print Connector para Windows x64.
#
# Requisitos: .NET 8 SDK e Inno Setup 6 o 7 (ambas versiones son compatibles
# con WalinkaPrintConnector.iss). Instalación rápida:
#   winget install JRSoftware.InnoSetup
#
# Uso, desde la carpeta tools\walinka-print-connector:
#   .\installer\build-installer.ps1
#   .\installer\build-installer.ps1 -IsccPath "D:\Herramientas\Inno Setup 7\ISCC.exe"
#
# Búsqueda de ISCC.exe (en este orden): -IsccPath, variable WALINKA_ISCC,
# carpetas estándar de Inno Setup 7 y 6, y el registro de desinstalación de
# Windows (cubre instalaciones en rutas personalizadas).

param(
  [string]$IsccPath
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Find-Iscc {
  param([string]$Explicit)

  if ($Explicit) {
    if (Test-Path -LiteralPath $Explicit -PathType Leaf) { return (Resolve-Path -LiteralPath $Explicit).Path }
    throw "No existe el compilador indicado: $Explicit"
  }
  if ($env:WALINKA_ISCC -and (Test-Path -LiteralPath $env:WALINKA_ISCC -PathType Leaf)) {
    return (Resolve-Path -LiteralPath $env:WALINKA_ISCC).Path
  }

  $candidates = @(
    "$env:ProgramFiles\Inno Setup 7\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 7\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
  )
  $found = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  if ($found) { return $found }

  # Instalaciones en otra ruta: el registro de desinstalación indica dónde quedaron.
  $uninstallRoots = @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  $entries = Get-ItemProperty -Path $uninstallRoots -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like 'Inno Setup*' -and $_.InstallLocation }
  foreach ($entry in $entries) {
    $exe = Join-Path $entry.InstallLocation 'ISCC.exe'
    if (Test-Path -LiteralPath $exe -PathType Leaf) { return $exe }
  }

  return $null
}

$iscc = Find-Iscc -Explicit $IsccPath
if (-not $iscc) {
  throw @"
No se encontró el compilador de Inno Setup (ISCC.exe).
Versiones admitidas: Inno Setup 6 y Inno Setup 7.
Opciones:
  1) Instalar:   winget install JRSoftware.InnoSetup
  2) Indicar la ruta: .\installer\build-installer.ps1 -IsccPath "C:\ruta\a\ISCC.exe"
"@
}
Write-Host "Usando compilador: $iscc"

# 1) Ejecutable autocontenido: el cliente no necesita instalar .NET.
& .\build.ps1
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación del ejecutable.' }

# 2) Versión: única fuente de verdad = WalinkaPrintConnector.csproj.
$version = (Select-String -Path 'WalinkaPrintConnector.csproj' -Pattern '<Version>(.+)</Version>').Matches[0].Groups[1].Value

& $iscc "/DAppVersion=$version" '.\installer\WalinkaPrintConnector.iss'
if ($LASTEXITCODE -ne 0) { throw 'Falló la generación del instalador.' }

$setup = Join-Path (Get-Location) "installer-output\WalinkaPrintConnector-Setup-$version.exe"
Write-Host ''
Write-Host "Listo: $((Resolve-Path $setup).Path)"
Write-Host 'Pruébalo en una cuenta de Windows limpia antes de distribuirlo.'
