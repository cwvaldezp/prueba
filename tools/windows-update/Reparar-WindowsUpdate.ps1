<#
.SYNOPSIS
    Repara Windows Update en servidores Windows Server 2019 que quedaron apuntando
    al antiguo servidor SCCM/WSUS (P-SCCM-01) o a Endpoint Central, para que se
    actualicen directamente desde Microsoft por la interfaz de Windows.

.DESCRIPTION
    El script primero hace un diagnóstico (no cambia nada) y luego pide confirmación
    antes de cada cambio:
      1. Desinstalar el cliente de Configuration Manager (SCCM), si existe.
      2. Respaldar y borrar las políticas de Windows Update (WUServer, UseWUServer...).
      3. Reiniciar la caché de Windows Update (SoftwareDistribution).
      4. Probar la conexión a los servidores de Microsoft.
      5. Iniciar la búsqueda de actualizaciones.

    No desinstala el agente de ManageEngine Endpoint Central ni toca antivirus/EDR
    (SentinelOne, Qualys, Acronis): solo los reporta.
    No reinicia el servidor.

    Todo queda registrado en C:\Temp\ReparaWU\<servidor>_<fecha>.log y las claves
    de registro se respaldan en un .reg en la misma carpeta.

.PARAMETER SoloDiagnostico
    Solo muestra el diagnóstico, sin ofrecer ningún cambio.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\Reparar-WindowsUpdate.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\Reparar-WindowsUpdate.ps1 -SoloDiagnostico
#>
[CmdletBinding()]
param(
    [switch]$SoloDiagnostico
)

$ErrorActionPreference = 'Continue'

$ClaveWU      = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
$ClaveWUReg   = 'HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
$CarpetaLog   = 'C:\Temp\ReparaWU'
$Marca        = Get-Date -Format 'yyyyMMdd_HHmmss'
$Servidor     = $env:COMPUTERNAME
$ArchivoLog   = Join-Path $CarpetaLog "${Servidor}_$Marca.log"
$ArchivoReg   = Join-Path $CarpetaLog "${Servidor}_WindowsUpdate_$Marca.reg"
$DestinosMS   = @(
    @{ Host = 'fe2.update.microsoft.com';   Puerto = 443 },
    @{ Host = 'sls.update.microsoft.com';   Puerto = 443 },
    @{ Host = 'download.windowsupdate.com'; Puerto = 80  }
)

# Resultado de cada paso para el resumen final
$Resumen = [ordered]@{}

# ---------------------------------------------------------------- utilidades

function Escribir-Titulo([string]$Texto) {
    Write-Host ''
    Write-Host ('=' * 70) -ForegroundColor Cyan
    Write-Host " $Texto" -ForegroundColor Cyan
    Write-Host ('=' * 70) -ForegroundColor Cyan
}

function Escribir-Ok([string]$Texto)    { Write-Host "  [OK]    $Texto" -ForegroundColor Green }
function Escribir-Aviso([string]$Texto) { Write-Host "  [AVISO] $Texto" -ForegroundColor Yellow }
function Escribir-Error([string]$Texto) { Write-Host "  [ERROR] $Texto" -ForegroundColor Red }
function Escribir-Info([string]$Texto)  { Write-Host "          $Texto" }

# Pide confirmación S/N. Por defecto es NO: si el usuario solo pulsa Enter, no se hace nada.
function Confirmar([string]$Pregunta) {
    while ($true) {
        $r = Read-Host "  >> $Pregunta [s/N]"
        if ([string]::IsNullOrWhiteSpace($r)) { return $false }
        switch ($r.Trim().ToLower()) {
            { $_ -in 's', 'si', 'sí', 'y', 'yes' } { return $true }
            { $_ -in 'n', 'no' }                   { return $false }
            default { Write-Host '     Responde s (sí) o n (no).' -ForegroundColor Yellow }
        }
    }
}

function Obtener-PoliticasWU {
    $p = [ordered]@{}
    foreach ($ruta in @($ClaveWU, "$ClaveWU\AU")) {
        $item = Get-ItemProperty $ruta -ErrorAction SilentlyContinue
        if ($item) {
            $item.PSObject.Properties |
                Where-Object { $_.Name -notlike 'PS*' } |
                ForEach-Object { $p["$(Split-Path $ruta -Leaf)\$($_.Name)"] = $_.Value }
        }
    }
    return $p
}

# Devuelve las GPO (de dominio o "Local Group Policy") que configuran Windows Update, según gpresult
function Obtener-OrigenGpoWU {
    $xmlRuta = Join-Path $CarpetaLog "${Servidor}_rsop_$Marca.xml"
    & gpresult.exe /scope computer /x $xmlRuta /f 2>&1 | Out-Null
    if (-not (Test-Path $xmlRuta)) { return @() }
    try { [xml]$rsop = Get-Content $xmlRuta -Raw } catch { return @() }
    $nombreGpo = { param($g) if ($g.Name -is [string]) { $g.Name } else { $g.Name.InnerText } }
    $ext = $rsop.Rsop.ComputerResults.ExtensionData.Extension
    $ext.Policy | Where-Object { $_ -and $_.Category -match 'Windows Update' } |
        ForEach-Object { [pscustomobject]@{ Ajuste = $_.Name; GPO = (& $nombreGpo $_.GPO) } }
    $ext.RegistrySetting | Where-Object { $_ -and $_.KeyPath -match 'WindowsUpdate' } |
        ForEach-Object { [pscustomobject]@{ Ajuste = "$($_.KeyPath)\$($_.AdmSetting)"; GPO = (& $nombreGpo $_.GPO) } }
}

function Obtener-ProgramasInstalados([string]$Patron) {
    Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
                     'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -match $Patron } |
        Select-Object DisplayName, DisplayVersion -Unique
}

function Probar-Puerto([string]$Destino, [int]$Puerto) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $tarea = $c.ConnectAsync($Destino, $Puerto)
        $ok = $tarea.Wait(5000) -and $c.Connected
        $c.Close()
        return $ok
    } catch {
        return $false
    }
}

# ---------------------------------------------------------------- inicio

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
    Write-Host 'Este script debe ejecutarse en PowerShell como Administrador.' -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Path $CarpetaLog -Force | Out-Null
Start-Transcript -Path $ArchivoLog -Append | Out-Null

# ---------------------------------------------------------------- diagnóstico

Escribir-Titulo "DIAGNÓSTICO - $Servidor (no se cambia nada)"

$so    = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$build = "$($so.CurrentBuild).$($so.UBR)"
Escribir-Info "Sistema : $($so.ProductName) ($($so.ReleaseId))"
Escribir-Info "Build   : $build"
$ultimoParche = Get-HotFix -ErrorAction SilentlyContinue | Where-Object InstalledOn | Sort-Object InstalledOn -Descending | Select-Object -First 1
if ($ultimoParche) {
    Escribir-Info "Último parche: $($ultimoParche.HotFixID) instalado el $($ultimoParche.InstalledOn.ToString('dd/MM/yyyy'))"
}
$Resumen['Build inicial'] = $build

# Políticas de Windows Update
Write-Host ''
Write-Host '  Políticas de Windows Update:' -ForegroundColor White
$politicas = Obtener-PoliticasWU
if ($politicas.Count -eq 0) {
    Escribir-Ok 'No hay políticas de Windows Update configuradas.'
} else {
    $politicas.GetEnumerator() | ForEach-Object { Escribir-Info ("{0,-55} = {1}" -f $_.Key, $_.Value) }
    $wuServer = $politicas['WindowsUpdate\WUServer']
    if ($wuServer) {
        $hostWsus = ([Uri]$wuServer).Host
        $puertoWsus = ([Uri]$wuServer).Port
        try {
            $ip = [System.Net.Dns]::GetHostAddresses($hostWsus) | Select-Object -First 1
            Escribir-Aviso "Apunta a $wuServer (resuelve a $ip)."
            if (Probar-Puerto $hostWsus $puertoWsus) {
                Escribir-Aviso "El servidor $hostWsus responde en el puerto $puertoWsus. Confirma que de verdad ya no se usa antes de borrar las políticas."
            } else {
                Escribir-Error "El servidor $hostWsus NO responde en el puerto $puertoWsus."
            }
        } catch {
            Escribir-Error "Apunta a $wuServer, pero el nombre $hostWsus NO se resuelve por DNS (servidor inexistente)."
        }
    }
}

# Agentes de gestión
Write-Host ''
Write-Host '  Agentes de gestión:' -ForegroundColor White
$sccm = Obtener-ProgramasInstalados 'Configuration Manager Client'
$epc  = Obtener-ProgramasInstalados 'ManageEngine'
if ($sccm) { Escribir-Aviso "Cliente SCCM instalado: $($sccm.DisplayName) $($sccm.DisplayVersion)" }
else       { Escribir-Ok 'Cliente SCCM no instalado.' }
if ($epc) {
    $epc | ForEach-Object { Escribir-Aviso "$($_.DisplayName) $($_.DisplayVersion)" }
    Escribir-Info 'El script NO desinstala Endpoint Central. Si su política de parches sigue activa,'
    Escribir-Info 'puede volver a escribir las claves: excluye este servidor de los parches en la consola de EPC.'
} else {
    Escribir-Ok 'Endpoint Central no instalado.'
}
$Resumen['Cliente SCCM']    = if ($sccm) { 'Instalado' } else { 'No instalado' }
$Resumen['Endpoint Central'] = if ($epc) { 'Instalado (no se toca)' } else { 'No instalado' }

# Seguridad (solo informativo)
Write-Host ''
Write-Host '  Seguridad (solo informativo, no se toca):' -ForegroundColor White
$servSeg = Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^(SentinelAgent|WinDefend|QualysAgent|AcronisActiveProtectionService)$' }
if ($servSeg) {
    $servSeg | ForEach-Object { Escribir-Info ("{0,-35} {1}" -f $_.DisplayName, $_.Status) }
} else {
    Escribir-Info 'No se encontraron servicios de seguridad conocidos.'
}
if (-not ($servSeg | Where-Object { $_.Name -in 'SentinelAgent', 'WinDefend' -and $_.Status -eq 'Running' })) {
    Escribir-Aviso 'Ni SentinelOne ni Defender están corriendo. Revisa la protección antivirus de este servidor.'
}

# Conectividad
Write-Host ''
Write-Host '  Conexión a Microsoft:' -ForegroundColor White
$proxy = (netsh winhttp show proxy) -join ' '
if ($proxy -match 'Direct access') { Escribir-Info 'Proxy WinHTTP: acceso directo (sin proxy).' }
else                               { Escribir-Info "Proxy WinHTTP: $(($proxy -replace '\s+', ' ').Trim())" }
$conexionOk = $true
foreach ($d in $DestinosMS) {
    if (Probar-Puerto $d.Host $d.Puerto) { Escribir-Ok "$($d.Host):$($d.Puerto)" }
    else { Escribir-Error "$($d.Host):$($d.Puerto) no responde"; $conexionOk = $false }
}
$Resumen['Conexión a Microsoft (inicial)'] = if ($conexionOk) { 'OK' } else { 'FALLA' }
if (-not $conexionOk) {
    Escribir-Aviso 'Sin salida a Microsoft, Windows Update no funcionará aunque se limpien las políticas.'
    Escribir-Aviso 'Pide a redes que habiliten *.windowsupdate.com, *.update.microsoft.com y *.delivery.mp.microsoft.com (80/443).'
}

if ($SoloDiagnostico) {
    Escribir-Titulo 'Modo solo diagnóstico: no se hizo ningún cambio.'
    Escribir-Info "Registro: $ArchivoLog"
    Stop-Transcript | Out-Null
    exit 0
}

Write-Host ''
if (-not (Confirmar "¿Continuar con la reparación de ${Servidor}? (se pedirá confirmación en cada paso)")) {
    Escribir-Info 'Cancelado por el usuario. No se hizo ningún cambio.'
    Stop-Transcript | Out-Null
    exit 0
}

# ---------------------------------------------------------------- paso 1: SCCM

Escribir-Titulo 'PASO 1 de 5 - Desinstalar cliente de SCCM'
$ccmsetup = 'C:\Windows\ccmsetup\ccmsetup.exe'
if (-not $sccm) {
    Escribir-Ok 'No hay cliente SCCM. Se omite.'
    $Resumen['Paso 1 - SCCM'] = 'No aplicaba'
} elseif (-not (Test-Path $ccmsetup)) {
    Escribir-Error "No se encontró $ccmsetup. Desinstálalo desde Panel de control > Programas."
    $Resumen['Paso 1 - SCCM'] = 'Pendiente (sin ccmsetup.exe)'
} elseif (Confirmar 'Se desinstalará el cliente de Configuration Manager (tarda varios minutos). ¿Continuar?') {
    Escribir-Info 'Desinstalando... no cierres esta ventana.'
    $logCcm = 'C:\Windows\ccmsetup\Logs\ccmsetup.log'
    # Solo se leen las líneas nuevas del log, para no confundir el código de una instalación anterior
    $lineasAntes = @(Get-Content $logCcm -ErrorAction SilentlyContinue).Count
    Start-Process -FilePath $ccmsetup -ArgumentList '/uninstall' -Wait
    # ccmsetup puede seguir trabajando en otro proceso después de que el primero termina
    $espera = 0
    Write-Host '          ' -NoNewline
    while ((Get-Process ccmsetup -ErrorAction SilentlyContinue) -and $espera -lt 1800) {
        Start-Sleep -Seconds 10; $espera += 10
        Write-Host '.' -NoNewline
    }
    Write-Host ''
    $linea = Get-Content $logCcm -ErrorAction SilentlyContinue |
        Select-Object -Skip $lineasAntes |
        Select-String -Pattern 'exiting with return code' |
        Select-Object -Last 1
    if ($linea -and $linea.Line -match 'return code (\d+)') {
        $codigo = [int]$Matches[1]
        switch ($codigo) {
            0       { Escribir-Ok 'Cliente SCCM desinstalado (código 0).'; $Resumen['Paso 1 - SCCM'] = 'Desinstalado' }
            7       { Escribir-Aviso 'Desinstalado, pero requiere reinicio (código 7).'; $Resumen['Paso 1 - SCCM'] = 'Desinstalado (requiere reinicio)' }
            default { Escribir-Error "ccmsetup terminó con código $codigo. Revisa C:\Windows\ccmsetup\Logs\ccmsetup.log"; $Resumen['Paso 1 - SCCM'] = "Error (código $codigo)" }
        }
    } else {
        Escribir-Aviso 'No se encontró el código de salida en ccmsetup.log. Revísalo manualmente.'
        $Resumen['Paso 1 - SCCM'] = 'Sin confirmar'
    }
} else {
    Escribir-Info 'Omitido por el usuario.'
    $Resumen['Paso 1 - SCCM'] = 'Omitido'
}

# ---------------------------------------------------------------- paso 2: políticas

Escribir-Titulo 'PASO 2 de 5 - Borrar políticas de Windows Update'
$politicas = Obtener-PoliticasWU
if ($politicas.Count -eq 0) {
    Escribir-Ok 'No hay políticas que borrar. Se omite.'
    $Resumen['Paso 2 - Políticas'] = 'No aplicaba'
} else {
    $politicas.GetEnumerator() | ForEach-Object { Escribir-Info ("{0,-55} = {1}" -f $_.Key, $_.Value) }
    Escribir-Info "Se hará un respaldo en $ArchivoReg (para restaurar: reg import `"$ArchivoReg`")."
    if (Confirmar 'Se borrará la clave WindowsUpdate completa. ¿Continuar?') {
        & reg.exe export $ClaveWUReg $ArchivoReg /y | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $ArchivoReg)) {
            Escribir-Error 'No se pudo crear el respaldo. No se borra nada.'
            $Resumen['Paso 2 - Políticas'] = 'Error en respaldo'
        } else {
            Escribir-Ok "Respaldo creado: $ArchivoReg"
            Remove-Item $ClaveWU -Recurse -Force
            Escribir-Ok 'Políticas borradas.'
            $Resumen['Paso 2 - Políticas'] = 'Borradas'

            if (Confirmar '¿Ejecutar gpupdate para comprobar si una GPO de dominio las vuelve a aplicar?') {
                & gpupdate.exe /target:computer /force | Out-Null
                $devueltas = Obtener-PoliticasWU
                if ($devueltas.Count -gt 0) {
                    Escribir-Error 'Algunas políticas VOLVIERON después de gpupdate:'
                    $devueltas.GetEnumerator() | ForEach-Object { Escribir-Info ("{0,-55} = {1}" -f $_.Key, $_.Value) }
                    $origen = @(Obtener-OrigenGpoWU)
                    if ($origen.Count -gt 0) {
                        Escribir-Info 'Las aplica esta GPO ("Local Group Policy" = política local del servidor):'
                        $origen | ForEach-Object { Escribir-Info ("  {0}  <-  {1}" -f $_.GPO, $_.Ajuste) }
                    } else {
                        Escribir-Info 'No se pudo identificar la GPO. Revisa: gpresult /scope computer /h C:\Temp\gpresult.html'
                    }
                    $Resumen['Paso 2 - Políticas'] = 'Borradas, pero una GPO las reaplica'
                } else {
                    Escribir-Ok 'Las políticas no volvieron después de gpupdate.'
                }
            }
        }
    } else {
        Escribir-Info 'Omitido por el usuario.'
        $Resumen['Paso 2 - Políticas'] = 'Omitido'
    }
}

# ---------------------------------------------------------------- paso 3: caché

Escribir-Titulo 'PASO 3 de 5 - Reiniciar la caché de Windows Update'
Escribir-Info 'Se detienen wuauserv y bits, se renombra C:\Windows\SoftwareDistribution y se vuelven a iniciar.'
Escribir-Info 'No se detiene cryptsvc (Acronis Active Protection depende de él).'
if (Confirmar '¿Reiniciar la caché de Windows Update?') {
    Stop-Service wuauserv, bits -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    $destino = "SoftwareDistribution.old_$Marca"
    try {
        Rename-Item 'C:\Windows\SoftwareDistribution' $destino -ErrorAction Stop
        Escribir-Ok "Caché renombrada a C:\Windows\$destino"
        $Resumen['Paso 3 - Caché'] = 'Reiniciada'
    } catch {
        Escribir-Error "No se pudo renombrar SoftwareDistribution: $($_.Exception.Message)"
        $Resumen['Paso 3 - Caché'] = 'Error al renombrar'
    }
    Start-Service bits, wuauserv -ErrorAction SilentlyContinue
    Get-Service wuauserv, bits | ForEach-Object {
        if ($_.Status -eq 'Running') { Escribir-Ok "$($_.Name) en ejecución" }
        else { Escribir-Error "$($_.Name) está $($_.Status)" }
    }
} else {
    Escribir-Info 'Omitido por el usuario.'
    $Resumen['Paso 3 - Caché'] = 'Omitido'
}

# ---------------------------------------------------------------- paso 4: conexión

Escribir-Titulo 'PASO 4 de 5 - Comprobar conexión a Microsoft'
$conexionOk = $true
foreach ($d in $DestinosMS) {
    if (Probar-Puerto $d.Host $d.Puerto) { Escribir-Ok "$($d.Host):$($d.Puerto)" }
    else { Escribir-Error "$($d.Host):$($d.Puerto) no responde"; $conexionOk = $false }
}
$Resumen['Paso 4 - Conexión a Microsoft'] = if ($conexionOk) { 'OK' } else { 'FALLA' }

# ---------------------------------------------------------------- paso 5: búsqueda

Escribir-Titulo 'PASO 5 de 5 - Buscar actualizaciones'
if ((Obtener-PoliticasWU)['WindowsUpdate\WUServer']) {
    Escribir-Aviso 'El servidor todavía apunta a un WSUS. La búsqueda probablemente fallará.'
}
if (-not $conexionOk) {
    Escribir-Aviso 'No hay conexión a Microsoft. La búsqueda probablemente fallará.'
}
Escribir-Info 'Esto solo inicia la búsqueda y descarga; la instalación y el reinicio los controlas tú'
Escribir-Info 'desde Settings > Update & Security > Windows Update.'
if (Confirmar '¿Iniciar la búsqueda de actualizaciones ahora?') {
    & UsoClient.exe StartInteractiveScan
    Escribir-Ok 'Búsqueda iniciada. Revisa el progreso en Settings > Update & Security > Windows Update.'
    $Resumen['Paso 5 - Búsqueda'] = 'Iniciada'
} else {
    Escribir-Info 'Omitido por el usuario.'
    $Resumen['Paso 5 - Búsqueda'] = 'Omitido'
}

# ---------------------------------------------------------------- resumen

Escribir-Titulo "RESUMEN - $Servidor"
$Resumen.GetEnumerator() | ForEach-Object { Escribir-Info ("{0,-32} : {1}" -f $_.Key, $_.Value) }
Write-Host ''
Escribir-Info 'Pendientes manuales:'
Escribir-Info ' - Instalar las actualizaciones y reiniciar en una ventana de mantenimiento.'
Escribir-Info ' - Elegir el modo de actualización: sconfig > opción 5 > M (Manual).'
Escribir-Info " - En unos días, comprobar que no vuelvan las claves: Get-ItemProperty '$ClaveWU'"
Escribir-Info ' - Cuando todo funcione, borrar C:\Windows\SoftwareDistribution.old_*'
Write-Host ''
Escribir-Info "Registro completo: $ArchivoLog"

Stop-Transcript | Out-Null
