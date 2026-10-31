# Genera el instalador de Walinka Print Connector para Windows x64.
# Requisitos: .NET 8 SDK y Inno Setup 6 (winget install JRSoftware.InnoSetup).
# Uso, desde la carpeta tools\walinka-print-connector:
#   .\installer\build-installer.ps1

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

# 1) Ejecutable autocontenido: el cliente no necesita instalar .NET.
& .\build.ps1
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación del ejecutable.' }

# 2) Versión: única fuente de verdad = WalinkaPrintConnector.csproj.
$version = (Select-String -Path 'WalinkaPrintConnector.csproj' -Pattern '<Version>(.+)</Version>').Matches[0].Groups[1].Value

# 3) Compilador de Inno Setup.
$iscc = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'No se encontró Inno Setup 6. Instálalo con: winget install JRSoftware.InnoSetup' }

& $iscc "/DAppVersion=$version" '.\installer\WalinkaPrintConnector.iss'
if ($LASTEXITCODE -ne 0) { throw 'Falló la generación del instalador.' }

$setup = Join-Path (Get-Location) "installer-output\WalinkaPrintConnector-Setup-$version.exe"
Write-Host ''
Write-Host "Listo: $((Resolve-Path $setup).Path)"
Write-Host 'Pruébalo en una cuenta de Windows limpia antes de distribuirlo.'
