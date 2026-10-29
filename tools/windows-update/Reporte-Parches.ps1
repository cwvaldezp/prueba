<#
.SYNOPSIS
    Reporte centralizado del estado de parches de los servidores Windows (solo lectura).

.DESCRIPTION
    Se ejecuta desde un servidor de administración y consulta a los demás por
    PowerShell Remoting (WinRM), en paralelo. Por cada servidor obtiene:
      - Build, último parche instalado y hace cuántos días.
      - Actualizaciones pendientes (y cuántas son críticas o importantes).
      - Si espera un reinicio y cuándo fue el último.
      - Si volvieron las políticas de WSUS, y si siguen SCCM o Endpoint Central.
      - Estado de SentinelOne y espacio libre en C:.

    Genera un reporte HTML y un CSV en la carpeta de salida. NO cambia nada en
    los servidores: no instala, no reinicia y no toca configuraciones.

.PARAMETER Servidores
    Lista de servidores a revisar. Si se omite, se usan todos los Windows Server
    de la OU indicada en -OU.

.PARAMETER OU
    OU de Active Directory donde buscar servidores cuando no se pasa -Servidores.

.PARAMETER SinBuscarPendientes
    No consulta a Microsoft las actualizaciones pendientes (más rápido; la
    búsqueda puede tardar varios minutos por servidor).

.EXAMPLE
    .\Reporte-Parches.ps1 -Servidores P-WS-INT-01, P-WS-INT-02, P-WS-EXT-01, P-WS-EXT-02

.EXAMPLE
    .\Reporte-Parches.ps1
#>
[CmdletBinding()]
param(
    [string[]]$Servidores,
    [string]$OU = 'OU=SERVERS,OU=Cumbaya,DC=usfq,DC=edu,DC=ec',
    [string]$Salida = 'C:\Temp\ReportesWU',
    [int]$DiasAtencion = 35,
    [int]$DiasCritico = 60,
    [switch]$SinBuscarPendientes
)

$Marca = Get-Date -Format 'yyyyMMdd_HHmm'

# ---------------------------------------------------------------- servidores

if (-not $Servidores) {
    Write-Host "Buscando Windows Server en $OU ..."
    $buscador = [adsisearcher]'(&(objectClass=computer)(operatingSystem=*Server*)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))'
    $buscador.SearchRoot = [adsi]"LDAP://$OU"
    $buscador.PageSize = 500
    $Servidores = $buscador.FindAll() | ForEach-Object { [string]$_.Properties.name[0] } | Sort-Object
}
if (-not $Servidores) {
    Write-Host 'No hay servidores que revisar.' -ForegroundColor Red
    exit 1
}
Write-Host "Servidores a revisar: $($Servidores.Count)"
if (-not $SinBuscarPendientes) {
    Write-Host 'Se consultarán las actualizaciones pendientes: puede tardar varios minutos.' -ForegroundColor Yellow
}

# ---------------------------------------------------------------- recolección (corre en cada servidor)

$recolectar = {
    param([bool]$Buscar)

    $r = [ordered]@{}
    $so = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $r.Sistema      = $so.ProductName
    $r.Build        = "$($so.CurrentBuild).$($so.UBR)"
    $r.UltimoInicio = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime

    $hf = Get-HotFix -ErrorAction SilentlyContinue | Where-Object InstalledOn | Sort-Object InstalledOn -Descending | Select-Object -First 1
    $r.UltimoParche      = $hf.HotFixID
    $r.FechaUltimoParche = $hf.InstalledOn

    $r.ReinicioPendiente = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or
                           (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')

    $pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' -ErrorAction SilentlyContinue
    $r.WUServer    = $pol.WUServer
    $r.ClienteSCCM = [bool](Get-Service ccmexec -ErrorAction SilentlyContinue)
    $r.AgenteEPC   = [bool](Get-Service 'ManageEngine UEMS - Agent' -ErrorAction SilentlyContinue)

    $s1 = Get-Service SentinelAgent -ErrorAction SilentlyContinue
    $r.SentinelOne = if ($s1) { [string]$s1.Status } else { 'No instalado' }

    $disco = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    $r.LibreC_GB = [math]::Round($disco.FreeSpace / 1GB, 1)

    $r.Pendientes          = $null
    $r.PendientesSeguridad = $null
    $r.ListaPendientes     = @()
    $r.ErrorBusqueda       = ''
    if ($Buscar) {
        try {
            $sesion = New-Object -ComObject Microsoft.Update.Session
            $resultado = $sesion.CreateUpdateSearcher().Search("IsInstalled=0 and IsHidden=0 and Type='Software'")
            $lista = @(foreach ($u in $resultado.Updates) { $u })
            $r.Pendientes          = $lista.Count
            $r.PendientesSeguridad = @($lista | Where-Object { $_.MsrcSeverity -in 'Critical', 'Important' }).Count
            $r.ListaPendientes     = @($lista | ForEach-Object { $_.Title })
        } catch {
            $r.ErrorBusqueda = $_.Exception.Message
        }
    }
    [pscustomobject]$r
}

$errores = $null
$datos = Invoke-Command -ComputerName $Servidores -ScriptBlock $recolectar -ArgumentList (-not $SinBuscarPendientes) `
    -ErrorAction SilentlyContinue -ErrorVariable errores

# ---------------------------------------------------------------- evaluación

$hoy = Get-Date
$filas = foreach ($nombre in $Servidores) {
    $d = $datos | Where-Object { $_.PSComputerName -eq $nombre } | Select-Object -First 1
    if (-not $d) {
        $err = $errores | Where-Object { "$($_.TargetObject) $($_.Exception.Message)" -match [regex]::Escape($nombre) } | Select-Object -First 1
        [pscustomobject]@{
            Servidor = $nombre; Estado = 'Sin respuesta'
            Motivos  = if ($err) { $err.Exception.Message.Split("`n")[0] } else { 'No respondió por WinRM' }
        }
        continue
    }

    $dias = if ($d.FechaUltimoParche) { [int]($hoy - $d.FechaUltimoParche).TotalDays } else { $null }
    $criticos = @(); $avisos = @()
    if ($d.WUServer)                                 { $criticos += "Apunta a WSUS ($($d.WUServer))" }
    if ($d.SentinelOne -ne 'Running')                { $criticos += "SentinelOne: $($d.SentinelOne)" }
    if ($null -eq $dias)                             { $avisos   += 'Sin fecha de último parche' }
    elseif ($dias -ge $DiasCritico)                  { $criticos += "Último parche hace $dias días" }
    elseif ($dias -ge $DiasAtencion)                 { $avisos   += "Último parche hace $dias días" }
    if ($d.PendientesSeguridad -gt 0)                { $avisos   += "$($d.PendientesSeguridad) actualizaciones de seguridad pendientes" }
    elseif ($d.Pendientes -gt 0)                     { $avisos   += "$($d.Pendientes) actualizaciones pendientes" }
    if ($d.ReinicioPendiente)                        { $avisos   += 'Reinicio pendiente' }
    if ($d.ClienteSCCM)                              { $avisos   += 'Cliente SCCM todavía instalado' }
    if ($d.LibreC_GB -lt 10)                         { $avisos   += "Poco espacio en C: ($($d.LibreC_GB) GB)" }
    if ($d.ErrorBusqueda)                            { $avisos   += "No se pudo buscar pendientes: $($d.ErrorBusqueda)" }

    [pscustomobject]@{
        Servidor            = $nombre
        Estado              = if ($criticos) { 'Crítico' } elseif ($avisos) { 'Atención' } else { 'OK' }
        Motivos             = ($criticos + $avisos) -join '; '
        Build               = $d.Build
        UltimoParche        = $d.UltimoParche
        FechaUltimoParche   = $d.FechaUltimoParche
        DiasSinParche       = $dias
        Pendientes          = $d.Pendientes
        PendientesSeguridad = $d.PendientesSeguridad
        ListaPendientes     = ($d.ListaPendientes -join '; ')
        ReinicioPendiente   = $d.ReinicioPendiente
        UltimoInicio        = $d.UltimoInicio
        WSUS                = if ($d.WUServer) { $d.WUServer } else { 'No' }
        ClienteSCCM         = $d.ClienteSCCM
        AgenteEPC           = $d.AgenteEPC
        SentinelOne         = $d.SentinelOne
        LibreC_GB           = $d.LibreC_GB
    }
}

$orden = @{ 'Crítico' = 0; 'Sin respuesta' = 1; 'Atención' = 2; 'OK' = 3 }
$filas = $filas | Sort-Object @{ e = { $orden[$_.Estado] } }, Servidor

# ---------------------------------------------------------------- salida

New-Item -ItemType Directory -Path $Salida -Force | Out-Null
$archivoCsv  = Join-Path $Salida "Reporte-Parches_$Marca.csv"
$archivoHtml = Join-Path $Salida "Reporte-Parches_$Marca.html"

$filas | Select-Object * | Export-Csv $archivoCsv -NoTypeInformation -Encoding UTF8 -Delimiter ';'

function H([object]$v) { [System.Net.WebUtility]::HtmlEncode([string]$v) }
function F([object]$v) { if ($v -is [datetime]) { $v.ToString('dd/MM/yyyy HH:mm') } else { [string]$v } }
function SiNo([object]$v) { if ($v -eq $true) { 'Sí' } elseif ($v -eq $false) { 'No' } else { '' } }

$conteo = $filas | Group-Object Estado -AsHashTable -AsString
$tarjetas = foreach ($e in 'Crítico', 'Atención', 'OK', 'Sin respuesta') {
    $n = if ($conteo -and $conteo[$e]) { @($conteo[$e]).Count } else { 0 }
    $clase = switch ($e) { 'Crítico' { 'critico' } 'Atención' { 'atencion' } 'OK' { 'ok' } default { 'sinresp' } }
    "<div class='tarjeta $clase'><b>$n</b><span>$e</span></div>"
}

$filasHtml = foreach ($f in $filas) {
    $clase = switch ($f.Estado) { 'Crítico' { 'critico' } 'Atención' { 'atencion' } 'OK' { 'ok' } default { 'sinresp' } }
    if ($f.Estado -eq 'Sin respuesta') {
        "<tr><td>$(H $f.Servidor)</td><td><span class='estado $clase'>$(H $f.Estado)</span></td><td colspan='9'>$(H $f.Motivos)</td></tr>"
        continue
    }
    $pend = if ($null -eq $f.Pendientes) { '—' } else { "$($f.Pendientes) ($($f.PendientesSeguridad) seg.)" }
    if ($f.ListaPendientes) {
        $items = ($f.ListaPendientes -split '; ' | ForEach-Object { "<li>$(H $_)</li>" }) -join ''
        $pend = "<details><summary>$pend</summary><ul>$items</ul></details>"
    }
    $parche = "$(H $f.UltimoParche)<br><small>$(F $f.FechaUltimoParche)$(if ($null -ne $f.DiasSinParche) { " · hace $($f.DiasSinParche) días" })</small>"
    @"
<tr><td>$(H $f.Servidor)</td><td><span class='estado $clase'>$(H $f.Estado)</span></td><td>$(H $f.Motivos)</td>
<td>$(H $f.Build)</td><td>$parche</td><td>$pend</td><td>$(SiNo $f.ReinicioPendiente)</td><td>$(H (F $f.UltimoInicio))</td>
<td>$(H $f.WSUS)</td><td>$(H $f.SentinelOne)</td><td>$(H $f.LibreC_GB) GB</td></tr>
"@
}

$html = @"
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Estado de parches</title>
<style>
 body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#222;background:#fff}
 h1{font-size:22px;margin:0 0 4px} p.sub{color:#666;margin:0 0 16px}
 .tarjetas{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
 .tarjeta{border-radius:8px;padding:10px 16px;min-width:110px} .tarjeta b{font-size:24px;display:block} .tarjeta span{font-size:13px}
 table{border-collapse:collapse;width:100%;font-size:13px} th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
 th{background:#f3f3f3;position:sticky;top:0} small{color:#666}
 .estado{border-radius:4px;padding:2px 8px;font-weight:600;white-space:nowrap}
 .critico{background:#fde2e1;color:#a4161a} .atencion{background:#fff3cd;color:#7a5a00} .ok{background:#dcf5e3;color:#1b6b34} .sinresp{background:#e7e7e7;color:#444}
 details ul{margin:4px 0 0 16px;padding:0}
</style></head><body>
<h1>Estado de parches de servidores</h1>
<p class="sub">Generado el $(Get-Date -Format 'dd/MM/yyyy HH:mm') desde $env:COMPUTERNAME · $($filas.Count) servidores · Atención a partir de $DiasAtencion días sin parches, crítico a partir de $DiasCritico.</p>
<div class="tarjetas">$($tarjetas -join '')</div>
<table><thead><tr><th>Servidor</th><th>Estado</th><th>Motivos</th><th>Build</th><th>Último parche</th><th>Pendientes</th><th>Reinicio pendiente</th><th>Último inicio</th><th>WSUS</th><th>SentinelOne</th><th>Libre C:</th></tr></thead>
<tbody>
$($filasHtml -join "`n")
</tbody></table>
</body></html>
"@
$html | Out-File $archivoHtml -Encoding UTF8

# ---------------------------------------------------------------- resumen en consola

$filas | Format-Table Servidor, Estado, Build, DiasSinParche, Pendientes, ReinicioPendiente, Motivos -AutoSize -Wrap
Write-Host "Reporte HTML: $archivoHtml" -ForegroundColor Green
Write-Host "Reporte CSV : $archivoCsv" -ForegroundColor Green
