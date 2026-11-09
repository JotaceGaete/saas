# Volcado de SOLO ESQUEMA de producción (sin datos). Ejecutar en su equipo, en PowerShell.
# Requiere el cliente PostgreSQL (pg_dump) instalado y en PATH: https://www.postgresql.org/download/windows/
# La cadena de conexión se pide por consola como texto oculto; no se guarda en archivos ni se muestra.
# Use la cadena de solo lectura del proyecto (Supabase > Connect). Si el pooler de transacciones (puerto 6543)
# falla con pg_dump, use la de sesión (puerto 5432).

$ErrorActionPreference = 'Stop'
$salida = Join-Path (Get-Location) ("schema_produccion_{0}.sql" -f (Get-Date -Format 'yyyyMMdd_HHmm'))

$secure = Read-Host 'Cadena de conexion de solo lectura (oculta)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $url = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    # Solo esquema: sin datos. Se conservan los GRANT para verificar permisos de anon.
    & pg_dump --schema-only --schema=public --schema=fiscal --dbname="$url" --file="$salida"
    if ($LASTEXITCODE -ne 0) { throw "pg_dump terminó con código $LASTEXITCODE. No se generó un volcado válido." }
    $lineas = (Get-Content $salida | Measure-Object -Line).Lines
    Write-Host "OK. Volcado de esquema en: $salida ($lineas líneas)"
} catch {
    Write-Error $_
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    Remove-Variable -Name url -ErrorAction SilentlyContinue
}
