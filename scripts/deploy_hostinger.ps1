# ==============================================================================
# PaddleSafe - Script de Despliegue y Sincronización Inteligente para Hostinger
#
# POLÍTICA ESTRICTA DE DESPLIEGUE EN HOSTINGER:
# 1. ÁMBITO EXCLUSIVO: Se trabaja exclusivamente dentro del directorio 'public_html'.
# 2. ANÁLISIS PREVIO: Analiza el contenido existente en el servidor y compara cada
#    archivo por fecha de modificación (UTC) y tamaño en bytes.
# 3. REGLA DE VERSIÓN:
#    - Si el archivo local es más reciente -> se reemplaza/sube.
#    - Si el archivo del servidor es más reciente -> se conserva el del servidor.
#    - Si tienen idéntica fecha y tamaño -> se omite la subida (ya sincronizado).
# 4. LIMPIEZA DE DUPLICADOS Y OBSOLETOS:
#    - Elimina automáticamente del servidor cualquier archivo o carpeta que no
#      pertenezca a la rama de despliegue o sea una versión duplicada/obsoleta.
# 5. AISLAMIENTO TOTAL:
#    - Prohibido crear carpetas que no existan en el repositorio.
#    - Prohibido subir o duplicar SQL, backend, src, node_modules, .git ni nada
#      fuera de public_html.
# ==============================================================================

param(
    [string]$FtpServer = "",
    [string]$FtpUser = "",
    [string]$FtpPass = "",
    [string]$RemotePath = "public_html",
    [switch]$CreateZipOnly,
    [switch]$ForceOverwrite
)

$ErrorActionPreference = "Stop"

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$publicHtmlDir = Join-Path $rootDir "public_html"
if (-not (Test-Path $publicHtmlDir)) {
    $publicHtmlDir = Join-Path $rootDir "Paddlesafe_frontend\public_html"
}

if (-not (Test-Path $publicHtmlDir)) {
    Write-Error "No se encontró el directorio public_html en: $publicHtmlDir"
    exit 1
}

# Validación estricta del destino: debe ser exclusivamente public_html
if ($RemotePath.Trim('/') -ne "public_html") {
    Write-Error "POLÍTICA DE SEGURIDAD: RemotePath debe ser estrictamente 'public_html'. Valor recibido: '$RemotePath'"
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " PaddleSafe -> Sincronización Inteligente para Hostinger  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Origen local: $publicHtmlDir" -ForegroundColor Yellow
Write-Host "Destino remoto estricto: /$RemotePath" -ForegroundColor Yellow

# 1. Comprobar archivos clave requeridos en public_html
$requiredFiles = @("index.html", ".htaccess", "index.php", "sw.js", "version.json", "manifest.json")
foreach ($rf in $requiredFiles) {
    $filePath = Join-Path $publicHtmlDir $rf
    if (-not (Test-Path $filePath)) {
        Write-Error "Falta archivo requerido en public_html: $rf"
        exit 1
    }
}

# 2. Listar archivos de la rama de despliegue (exclusivamente los de public_html)
$filesToDeploy = Get-ChildItem -Path $publicHtmlDir -Recurse -File | Where-Object {
    $_.Name -ne "logs.txt" -and $_.Name -ne ".DS_Store" -and $_.Name -ne "Thumbs.db"
}

$localRelLookup = @{}
foreach ($f in $filesToDeploy) {
    $rel = $f.FullName.Substring($publicHtmlDir.Length + 1).Replace("\", "/")
    $localRelLookup[$rel] = $f
}

Write-Host "`nTotal de archivos de frontend autorizados: $($filesToDeploy.Count)" -ForegroundColor Green

# 3. Generar archivo ZIP limpio listo para subir a hPanel
$zipOutput = Join-Path $rootDir "hostinger_public_html_ready.zip"
if (Test-Path $zipOutput) { Remove-Item $zipOutput -Force }

Write-Host "Generando paquete ZIP auditado: $zipOutput ..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($zipOutput, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($file in $filesToDeploy) {
    $relPath = $file.FullName.Substring($publicHtmlDir.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relPath) | Out-Null
}
$zip.Dispose()

Write-Host "¡Paquete ZIP creado con éxito! Contiene exclusivamente public_html con rutas normalizadas." -ForegroundColor Green

# 4. Helper functions para FTP inteligente
function Get-FtpFileMetadata {
    param([string]$Uri, [string]$User, [string]$Pass)
    $res = @{ Exists = $false; Size = 0; TimestampUtc = $null }
    try {
        $req = [System.Net.FtpWebRequest]::Create($Uri)
        $req.Credentials = New-Object System.Net.NetworkCredential($User, $Pass)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::GetDateTimestamp
        $req.UsePassive = $true
        $req.KeepAlive = $false
        $resp = $req.GetResponse()
        $res.TimestampUtc = $resp.LastModified.ToUniversalTime()
        $resp.Close()

        $sizeReq = [System.Net.FtpWebRequest]::Create($Uri)
        $sizeReq.Credentials = New-Object System.Net.NetworkCredential($User, $Pass)
        $sizeReq.Method = [System.Net.WebRequestMethods+Ftp]::GetFileSize
        $sizeReq.UsePassive = $true
        $sizeReq.KeepAlive = $false
        $sizeResp = $sizeReq.GetResponse()
        $res.Size = $sizeResp.ContentLength
        $sizeResp.Close()
        $res.Exists = $true
    } catch {
        $res.Exists = $false
    }
    return $res
}

function Get-FtpDirectoryListing {
    param([string]$Uri, [string]$User, [string]$Pass)
    $list = @()
    try {
        $req = [System.Net.FtpWebRequest]::Create($Uri)
        $req.Credentials = New-Object System.Net.NetworkCredential($User, $Pass)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectory
        $req.UsePassive = $true
        $req.KeepAlive = $false
        $resp = $req.GetResponse()
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        while (-not $reader.EndOfStream) {
            $line = $reader.ReadLine().Trim()
            if (-not [string]::IsNullOrWhiteSpace($line) -and $line -ne "." -and $line -ne "..") {
                $leaf = Split-Path $line -Leaf
                $list += $leaf
            }
        }
        $reader.Close()
        $resp.Close()
    } catch {}
    return $list
}

function Remove-FtpFile {
    param([string]$Uri, [string]$User, [string]$Pass)
    try {
        $req = [System.Net.FtpWebRequest]::Create($Uri)
        $req.Credentials = New-Object System.Net.NetworkCredential($User, $Pass)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::DeleteFile
        $req.UsePassive = $true
        $req.KeepAlive = $false
        $resp = $req.GetResponse()
        $resp.Close()
        return $true
    } catch {
        return $false
    }
}

function Upload-FtpFile {
    param([string]$Uri, [string]$LocalPath, [string]$User, [string]$Pass)
    $uploadReq = [System.Net.FtpWebRequest]::Create($Uri)
    $uploadReq.Credentials = New-Object System.Net.NetworkCredential($User, $Pass)
    $uploadReq.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
    $uploadReq.UseBinary = $true
    $uploadReq.UsePassive = $true
    $uploadReq.KeepAlive = $false

    $fileBytes = [System.IO.File]::ReadAllBytes($LocalPath)
    $uploadReq.ContentLength = $fileBytes.Length
    $reqStream = $uploadReq.GetRequestStream()
    $reqStream.Write($fileBytes, 0, $fileBytes.Length)
    $reqStream.Close()
    $uploadResp = $uploadReq.GetResponse()
    $uploadResp.Close()
}

function Ensure-FtpDirectory {
    param([string]$BaseUri, [string]$SubPath, [string]$User, [string]$Pass)
    $parts = $SubPath.Split('/')
    $curr = $BaseUri
    foreach ($p in $parts) {
        $curr = "$curr/$p"
        try {
            $dirReq = [System.Net.FtpWebRequest]::Create($curr)
            $dirReq.Credentials = New-Object System.Net.NetworkCredential($User, $Pass)
            $dirReq.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
            $dirReq.UsePassive = $true
            $dirReq.KeepAlive = $false
            $dirResp = $dirReq.GetResponse()
            $dirResp.Close()
        } catch {}
    }
}

# 5. Sincronización inteligente por FTP si se proporcionan credenciales
if (-not [string]::IsNullOrWhiteSpace($FtpServer) -and -not [string]::IsNullOrWhiteSpace($FtpUser) -and -not $CreateZipOnly) {
    Write-Host "`nIniciando análisis previo del servidor en $FtpServer/$RemotePath ..." -ForegroundColor Cyan

    $cleanServer = $FtpServer.TrimEnd('/')
    if (-not $cleanServer.StartsWith("ftp://")) {
        $cleanServer = "ftp://$cleanServer"
    }

    $baseRemoteUri = "$cleanServer/$RemotePath"

    $uploadedCount = 0
    $keptServerCount = 0
    $skippedIdenticalCount = 0
    $deletedObsoleteCount = 0

    # A. Escaneo y eliminación de archivos obsoletos / no autorizados en public_html
    Write-Host "`n[Fase 1] Analizando archivos remotos para detectar duplicados y obsoletos..." -ForegroundColor Yellow
    $knownRemoteDirs = @("", "js", "js/club")
    foreach ($dirRel in $knownRemoteDirs) {
        $targetDirUri = if ($dirRel -eq "") { $baseRemoteUri } else { "$baseRemoteUri/$dirRel" }
        $remoteEntries = Get-FtpDirectoryListing -Uri $targetDirUri -User $FtpUser -Pass $FtpPass

        foreach ($entry in $remoteEntries) {
            # Evitar evaluar subcarpetas conocidas
            if ($entry -eq "js" -or $entry -eq "club") { continue }

            $fullRemoteRel = if ($dirRel -eq "") { $entry } else { "$dirRel/$entry" }

            # Prohibición total de carpetas o archivos de backend / SQL / desarrollo
            $isForbidden = ($fullRemoteRel -match "^(sql|api|lib|src|node_modules|\.git)") -or
                           ($entry -match "\.(sql|env|log)$") -or
                           ($entry -eq "package.json") -or ($entry -eq "vercel.json") -or
                           ($entry -eq "logs.txt")

            if ($isForbidden -or (-not $localRelLookup.ContainsKey($fullRemoteRel))) {
                $obsoleteUri = "$baseRemoteUri/$fullRemoteRel"
                Write-Host "  [-] Eliminando archivo obsoleto/no autorizado: $fullRemoteRel" -ForegroundColor Red
                if (Remove-FtpFile -Uri $obsoleteUri -User $FtpUser -Pass $FtpPass) {
                    $deletedObsoleteCount++
                }
            }
        }
    }

    # B. Comparación y sincronización de cada archivo del repositorio
    Write-Host "`n[Fase 2] Comparando versiones por fecha y tamaño..." -ForegroundColor Yellow
    foreach ($relPath in $localRelLookup.Keys) {
        $localFile = $localRelLookup[$relPath]
        $targetUri = "$baseRemoteUri/$relPath"
        $localUtc = $localFile.LastWriteTimeUtc
        $localSize = $localFile.Length

        # Crear estructura de carpetas si es necesario (solo las requeridas por el frontend)
        $subDirs = $relPath.Split('/')
        if ($subDirs.Count -gt 1) {
            $parentRel = ($subDirs[0..($subDirs.Count - 2)]) -join '/'
            Ensure-FtpDirectory -BaseUri $baseRemoteUri -SubPath $parentRel -User $FtpUser -Pass $FtpPass
        }

        # Obtener metadatos remotos
        $remoteMeta = Get-FtpFileMetadata -Uri $targetUri -User $FtpUser -Pass $FtpPass

        if ($remoteMeta.Exists -and -not $ForceOverwrite) {
            $remoteUtc = $remoteMeta.TimestampUtc
            $remoteSize = $remoteMeta.Size

            if ($remoteUtc -gt $localUtc) {
                # La versión del servidor es más reciente -> conservar la del servidor
                Write-Host "  [=] Servidor más reciente (conservado): $relPath" -ForegroundColor DarkCyan
                $keptServerCount++
                continue
            } elseif ($remoteUtc -eq $localUtc -and $remoteSize -eq $localSize) {
                # Archivos idénticos -> omitir subida
                Write-Host "  [OK] Idéntico y sincronizado: $relPath" -ForegroundColor DarkGray
                $skippedIdenticalCount++
                continue
            } else {
                # Repositorio más reciente o tamaño modificado -> reemplazar
                Write-Host "  [+] Actualizando (repo más reciente): $relPath" -ForegroundColor Green
                Upload-FtpFile -Uri $targetUri -LocalPath $localFile.FullName -User $FtpUser -Pass $FtpPass
                $uploadedCount++
            }
        } else {
            # Archivo nuevo no existente en el servidor -> subir
            Write-Host "  [+] Subiendo nuevo: $relPath" -ForegroundColor Green
            Upload-FtpFile -Uri $targetUri -LocalPath $localFile.FullName -User $FtpUser -Pass $FtpPass
            $uploadedCount++
        }
    }

    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host " Resumen de Sincronización Inteligente:                   " -ForegroundColor Green
    Write-Host "  - Archivos subidos / reemplazados: $uploadedCount" -ForegroundColor Green
    Write-Host "  - Archivos del servidor conservados: $keptServerCount" -ForegroundColor Cyan
    Write-Host "  - Archivos idénticos (sin cambios): $skippedIdenticalCount" -ForegroundColor DarkGray
    Write-Host "  - Archivos obsoletos eliminados del servidor: $deletedObsoleteCount" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Host "`nPara sincronización automática inteligente:" -ForegroundColor Yellow
    Write-Host "  .\scripts\deploy_hostinger.ps1 -FtpServer 'ftp.tudominio.com' -FtpUser 'usuario' -FtpPass 'contraseña'" -ForegroundColor Gray
    Write-Host "`nPara despliegue por Git en Hostinger hPanel:" -ForegroundColor Yellow
    Write-Host "  1. Selecciona la rama: frontend-deploy" -ForegroundColor Gray
    Write-Host "  2. Directorio de instalación: public_html" -ForegroundColor Gray
    Write-Host "  3. Git mantendrá public_html sincronizado y sin archivos obsoletos de backend o SQL." -ForegroundColor Gray
}

Write-Host "`nDespliegue finalizado respetando el aislamiento estricto y la higiene de public_html." -ForegroundColor Cyan
