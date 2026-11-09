# Consulta de SOLO LECTURA: XML de la boleta 39, folio 51106 (GET).
# Uso: ejecutar en el equipo del propietario, en PowerShell.
#
# Preparación única (la clave queda cifrada con DPAPI para este usuario de Windows; no se muestra):
#   New-Item -ItemType Directory -Force "$env:USERPROFILE\.walinka" | Out-Null
#   Read-Host -AsSecureString "Clave SII" | ConvertFrom-SecureString | Set-Content "$env:USERPROFILE\.walinka\sii_apikey.dpapi"
#
# Después: .\consulta-xml-51106.ps1
# El script nunca escribe la clave en pantalla, en archivos de registro ni en la URL.

$ErrorActionPreference = 'Stop'
$keyFile = Join-Path $env:USERPROFILE '.walinka\sii_apikey.dpapi'
if (-not (Test-Path $keyFile)) { throw 'No existe el archivo de clave. Ejecute primero la preparación indicada arriba.' }

$secure = Get-Content -Raw $keyFile | ConvertTo-SecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $headers = @{ 'X-Api-Key' = $apiKey; 'Accept' = 'application/json' }
    $url = 'https://api.siisolutions.cl/dte/documentos/39/51106/xml'
    $out = Join-Path (Get-Location) 'boleta_51106_xml_respuesta.json'
    try {
        Invoke-WebRequest -Uri $url -Method Get -Headers $headers -UseBasicParsing -OutFile $out | Out-Null
        Write-Host "OK. Respuesta guardada en: $out"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        Write-Error "El proveedor respondió HTTP $code. No se guardó ningún documento."
    }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    Remove-Variable -Name apiKey, headers -ErrorAction SilentlyContinue
}
