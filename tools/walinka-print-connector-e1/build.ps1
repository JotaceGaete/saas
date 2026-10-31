# Compila y empaqueta el prototipo E1 para Windows x64.
# Ejecutar en PowerShell desde esta carpeta:  .\build.ps1
# Requiere .NET 8 SDK instalado (https://dotnet.microsoft.com/download/dotnet/8.0).

$ErrorActionPreference = 'Stop'

dotnet --version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se encontró .NET SDK. Instala .NET 8 SDK y vuelve a intentar.' }

dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o .\publish
if ($LASTEXITCODE -ne 0) { throw 'La compilación falló. Revisa los errores de arriba.' }

Write-Host ''
Write-Host 'Listo: .\publish\WalinkaPrintProbe.exe'
Write-Host 'Prueba sin impresora: .\publish\WalinkaPrintProbe.exe selftest'
