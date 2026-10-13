# ==============================================================================
# PaddleSafe - Script de Despliegue y Sincronización Exclusiva para Hostinger
#
# REGLA ESTRICTA DE DESPLIEGUE:
# - Se publica ÚNICAMENTE el contenido de 'Paddlesafe_frontend/public_html'.
# - La raíz del hosting (public_html en Hostinger) contiene SOLO lo que está dentro de public_html.
# - Todo lo que está fuera de public_html (backend, api, lib, sql, node_modules, .git, etc.)
#   queda TOTALMENTE IGNORADO y jamás se sube al servidor.
# ==============================================================================

param(
    [string]$FtpServer = "",
    [string]$FtpUser = "",
    [string]$FtpPass = "",
    [string]$RemotePath = "public_html",
    [switch]$CreateZipOnly
)

$ErrorActionPreference = "Stop"

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$publicHtmlDir = Join-Path $rootDir "Paddlesafe_frontend\public_html"

if (-not (Test-Path $publicHtmlDir)) {
    Write-Error "No se encontró el directorio public_html en: $publicHtmlDir"
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " PaddleSafe -> Sincronización Exclusiva para Hostinger    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Origen local: $publicHtmlDir" -ForegroundColor Yellow

# 1. Comprobar archivos clave requeridos en public_html
$requiredFiles = @("index.html", ".htaccess", "sw.js", "version.json", "manifest.json")
foreach ($rf in $requiredFiles) {
    $filePath = Join-Path $publicHtmlDir $rf
    if (-not (Test-Path $filePath)) {
        Write-Error "Falta archivo requerido en public_html: $rf"
        exit 1
    }
}

# 2. Listar archivos a sincronizar (exclusivamente los de public_html)
$filesToDeploy = Get-ChildItem -Path $publicHtmlDir -Recurse -File | Where-Object {
    $_.Name -ne "logs.txt" -and $_.Name -ne ".DS_Store" -and $_.Name -ne "Thumbs.db"
}

Write-Host "`nTotal de archivos listos para sincronizar: $($filesToDeploy.Count)" -ForegroundColor Green
Write-Host "Archivos incluidos:" -ForegroundColor Gray
$filesToDeploy | ForEach-Object {
    $rel = $_.FullName.Substring($publicHtmlDir.Length + 1).Replace("\", "/")
    Write-Host "  [+] $rel" -ForegroundColor Gray
}

# 3. Generar archivo ZIP limpio listo para subir al Administrador de Archivos de Hostinger
$zipOutput = Join-Path $rootDir "hostinger_public_html_ready.zip"
if (Test-Path $zipOutput) { Remove-Item $zipOutput -Force }

Write-Host "`nGenerando paquete ZIP para Hostinger: $zipOutput ..." -ForegroundColor Cyan
$compressScript = {
    param($src, $dst)
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open($dst, [System.IO.Compression.ZipArchiveMode]::Create)
    $files = Get-ChildItem -Path $src -Recurse -File
    foreach ($file in $files) {
        $relPath = $file.FullName.Substring($src.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relPath) | Out-Null
    }
    $zip.Dispose()
}
& $compressScript $publicHtmlDir $zipOutput

Write-Host "¡Paquete ZIP creado con éxito! Contiene solo los archivos de public_html en la raíz del ZIP con rutas compatibles (/). " -ForegroundColor Green

# 4. Si se especificaron credenciales FTP, realizar subida directa
if (-not [string]::IsNullOrWhiteSpace($FtpServer) -and -not [string]::IsNullOrWhiteSpace($FtpUser) -and -not $CreateZipOnly) {
    Write-Host "`nIniciando sincronización directa por FTP a $FtpServer ..." -ForegroundColor Cyan
    
    $cleanServer = $FtpServer.TrimEnd('/')
    if (-not $cleanServer.StartsWith("ftp://")) {
        $cleanServer = "ftp://$cleanServer"
    }

    foreach ($file in $filesToDeploy) {
        $relPath = $file.FullName.Substring($publicHtmlDir.Length + 1).Replace("\", "/")
        $targetUri = "$cleanServer/$RemotePath/$relPath"
        
        Write-Host "Subiendo: $relPath -> $targetUri" -ForegroundColor DarkGray
        
        # Crear directorios remotos si es necesario
        $subDirs = $relPath.Split('/')
        if ($subDirs.Count -gt 1) {
            $currPath = "$cleanServer/$RemotePath"
            for ($i = 0; $i -lt ($subDirs.Count - 1); $i++) {
                $currPath = "$currPath/$($subDirs[$i])"
                try {
                    $dirReq = [System.Net.FtpWebRequest]::Create($currPath)
                    $dirReq.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FtpPass)
                    $dirReq.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
                    $dirReq.UsePassive = $true
                    $dirReq.KeepAlive = $false
                    $dirResp = $dirReq.GetResponse()
                    $dirResp.Close()
                } catch {
                    # Si ya existe el directorio, se ignora el error
                }
            }
        }

        # Subir archivo
        $uploadReq = [System.Net.FtpWebRequest]::Create($targetUri)
        $uploadReq.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FtpPass)
        $uploadReq.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
        $uploadReq.UseBinary = $true
        $uploadReq.UsePassive = $true
        $uploadReq.KeepAlive = $false
        
        $fileBytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $uploadReq.ContentLength = $fileBytes.Length
        $reqStream = $uploadReq.GetRequestStream()
        $reqStream.Write($fileBytes, 0, $fileBytes.Length)
        $reqStream.Close()
        $uploadResp = $uploadReq.GetResponse()
        $uploadResp.Close()
    }

    Write-Host "`n¡Sincronización FTP completada con éxito!" -ForegroundColor Green
} else {
    Write-Host "`nInstrucciones para sincronizar con Hostinger:" -ForegroundColor Yellow
    Write-Host "Opción A (FTP automático): Ejecuta este script pasando credenciales:" -ForegroundColor White
    Write-Host "  .\scripts\deploy_hostinger.ps1 -FtpServer 'ftp.tudominio.com' -FtpUser 'usuario' -FtpPass 'contraseña'" -ForegroundColor Gray
    Write-Host "Opción B (Administrador de archivos de Hostinger):" -ForegroundColor White
    Write-Host "  1. Entra a hPanel -> Administrador de archivos -> public_html" -ForegroundColor Gray
    Write-Host "  2. Sube el archivo 'hostinger_public_html_ready.zip' directamente a public_html" -ForegroundColor Gray
    Write-Host "  3. Haz clic en 'Extraer' aquí. Todos los archivos quedarán en la raíz exacta del hosting." -ForegroundColor Gray
    Write-Host "  4. Elimina el archivo ZIP." -ForegroundColor Gray
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Despliegue completado respetando el aislamiento estricto " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
