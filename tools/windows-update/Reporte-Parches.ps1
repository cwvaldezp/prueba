<#
.SYNOPSIS
    Reporte centralizado del estado de parches de los servidores Windows (solo lectura).

.DESCRIPTION
    Se ejecuta desde un servidor de administración y consulta a los demás por
    PowerShell Remoting (WinRM), en paralelo. Por cada servidor obtiene:
      - Build, último parche instalado y hace cuántos días.
      - Actualizaciones pendientes con su KB, clasificación, fecha de publicación y,
        según el boletín del MSRC, severidad, CVE que corrigen y si están explotados.
      - Instalaciones fallidas de los últimos 30 días.
      - Si espera un reinicio y cuándo fue el último.
      - Si volvieron las políticas de WSUS, y si siguen SCCM o Endpoint Central.
      - SentinelOne, espacio libre en C:, SMBv1, firewall y fin de soporte del sistema.

    Genera un reporte HTML y tres CSV (servidores, KB pendientes e instalaciones
    fallidas). NO cambia nada en los servidores: no instala, no reinicia y no toca
    configuraciones.

.PARAMETER Servidores
    Lista de servidores a revisar. Si se omite, se usan todos los Windows Server
    de la OU indicada en -OU.

.PARAMETER OU
    OU de Active Directory donde buscar servidores cuando no se pasa -Servidores.

.PARAMETER Credencial
    Cuenta con la que conectarse a los servidores (por ejemplo USFQ\usuario).
    Pide la contraseña al momento de ejecutar. Si se omite, usa la sesión actual.

.PARAMETER SinBuscarPendientes
    No consulta a Microsoft las actualizaciones pendientes (más rápido; la
    búsqueda puede tardar varios minutos por servidor).

.PARAMETER SinMsrc
    No consulta el boletín del Microsoft Security Response Center (MSRC) para
    completar severidad, CVE y explotación activa de cada KB.

.PARAMETER IncluirDefiniciones
    Incluye las firmas de Microsoft Defender (por defecto se omiten: con
    SentinelOne, Defender está detenido y no se actualiza).

.EXAMPLE
    .\Reporte-Parches.ps1 -Servidores P-WS-INT-01, P-WS-INT-02, P-WS-EXT-01, P-WS-EXT-02

.EXAMPLE
    .\Reporte-Parches.ps1 -Credencial USFQ\usuario-admin

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
    [System.Management.Automation.PSCredential]
    [System.Management.Automation.Credential()]
    $Credencial = [System.Management.Automation.PSCredential]::Empty,
    [switch]$SinBuscarPendientes,
    [switch]$SinMsrc,
    [switch]$IncluirDefiniciones
)

$Marca = Get-Date -Format 'yyyyMMdd_HHmm'

# Fin del soporte extendido de Microsoft, por build de Windows Server
$FinSoporte = @{
    '9600'  = [datetime]'2023-10-10'   # Windows Server 2012 R2
    '14393' = [datetime]'2027-01-12'   # Windows Server 2016
    '17763' = [datetime]'2029-01-09'   # Windows Server 2019
    '20348' = [datetime]'2031-10-14'   # Windows Server 2022
    '26100' = [datetime]'2034-11-14'   # Windows Server 2025
}

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
    $r.BuildMayor   = [string]$so.CurrentBuild
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

    $r.SMB1 = try { [bool](Get-SmbServerConfiguration -ErrorAction Stop).EnableSMB1Protocol } catch { $null }
    $r.FirewallApagado = @(Get-NetFirewallProfile -ErrorAction SilentlyContinue | Where-Object { -not $_.Enabled } | ForEach-Object { [string]$_.Name }) -join ', '

    # Los detalles viajan como JSON: los objetos anidados se aplanan a texto al cruzar WinRM
    $clasificaciones = 'Security Updates', 'Critical Updates', 'Updates', 'Update Rollups', 'Definition Updates',
                       'Service Packs', 'Feature Packs', 'Tools', 'Drivers', 'Upgrades'
    $sesion   = New-Object -ComObject Microsoft.Update.Session
    $buscador = $sesion.CreateUpdateSearcher()

    # Historial: instalaciones fallidas o canceladas en los últimos 30 días
    $r.FallidasJson = '[]'
    try {
        $total = $buscador.GetTotalHistoryCount()
        if ($total -gt 0) {
            $limite = (Get-Date).AddDays(-30)
            $fallidas = foreach ($h in $buscador.QueryHistory(0, [math]::Min($total, 300))) {
                $fecha = $h.Date.ToLocalTime()
                if ($h.Operation -eq 1 -and $h.ResultCode -in 4, 5 -and $fecha -ge $limite) {
                    [pscustomobject]@{
                        Fecha  = $fecha.ToString('yyyy-MM-dd HH:mm')
                        Titulo = $h.Title
                        Codigo = '0x{0:X8}' -f $h.HResult
                    }
                }
            }
            if ($fallidas) { $r.FallidasJson = ConvertTo-Json @($fallidas) -Compress }
        }
    } catch { }

    $r.Pendientes          = $null
    $r.PendientesSeguridad = $null
    $r.PendientesJson      = '[]'
    $r.ErrorBusqueda       = ''
    if ($Buscar) {
        try {
            $resultado = $buscador.Search("IsInstalled=0 and IsHidden=0 and Type='Software'")
            $detalle = foreach ($u in $resultado.Updates) {
                $categorias = @(foreach ($c in $u.Categories) { $c.Name })
                [pscustomobject]@{
                    KB          = (@(foreach ($k in $u.KBArticleIDs) { "KB$k" }) -join ', ')
                    Titulo      = $u.Title
                    Clase       = ($categorias | Where-Object { $_ -in $clasificaciones } | Select-Object -First 1)
                    Severidad   = [string]$u.MsrcSeverity
                    Publicado   = $u.LastDeploymentChangeTime.ToString('yyyy-MM-dd')
                    CVE         = (@(foreach ($c in $u.CveIDs) { $c }) -join ', ')
                    Descargada  = [bool]$u.IsDownloaded
                }
            }
            $detalle = @($detalle)
            $r.Pendientes          = $detalle.Count
            $r.PendientesSeguridad = @($detalle | Where-Object { $_.Severidad -in 'Critical', 'Important' -or $_.Clase -eq 'Security Updates' }).Count
            if ($detalle.Count) { $r.PendientesJson = ConvertTo-Json $detalle -Compress }
        } catch {
            $r.ErrorBusqueda = $_.Exception.Message
        }
    }
    [pscustomobject]$r
}

$conexion = @{ ComputerName = $Servidores }
if ($Credencial -ne [System.Management.Automation.PSCredential]::Empty) {
    $conexion.Credential = $Credencial
    Write-Host "Conectando como $($Credencial.UserName)"
}
$errores = $null
$datos = Invoke-Command @conexion -ScriptBlock $recolectar -ArgumentList (-not $SinBuscarPendientes) `
    -ErrorAction SilentlyContinue -ErrorVariable errores

# ---------------------------------------------------------------- utilidades

# Nombres largos: 'H' es un alias de Get-History y tiene prioridad sobre una función
function Codificar([object]$v) { [System.Net.WebUtility]::HtmlEncode([string]$v) }
function FormatoFecha([object]$v, [string]$Formato = 'dd/MM/yyyy HH:mm') {
    if ($v -is [datetime]) { $v.ToString($Formato) } else { [string]$v }
}
function SiNo([object]$v) { if ($v -eq $true) { 'Sí' } elseif ($v -eq $false) { 'No' } else { '' } }
function Plural([int]$n, [string]$uno, [string]$varios) { if ($n -eq 1) { "$n $uno" } else { "$n $varios" } }
function RangoSeveridad([string]$s) {
    switch ($s) { 'Critical' { 0 } 'Important' { 1 } 'Moderate' { 2 } 'Low' { 3 } default { 9 } }
}

# Firmas de Defender: con SentinelOne como antivirus, Defender está detenido y estas
# "pendientes" o "fallidas" son ruido; se excluyen salvo que se pida -IncluirDefiniciones.
function EsDefinicion($u) {
    $u.Clase -eq 'Definition Updates' -or $u.Titulo -match 'Security Intelligence Update|antimalware platform'
}

# Descarga del MSRC (api.msrc.microsoft.com, pública y sin clave) los boletines de los meses
# indicados y devuelve, por KB: CVE que corrige, severidad máxima y CVE explotados activamente.
function Obtener-DatosMsrc([string[]]$Meses) {
    $mapa = @{}
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    foreach ($mes in $Meses) {
        Write-Host "Consultando boletín de seguridad de Microsoft $mes ..."
        try {
            $cvrf = Invoke-RestMethod "https://api.msrc.microsoft.com/cvrf/v3.0/cvrf/$mes" -Headers @{ Accept = 'application/json' } -UseBasicParsing -TimeoutSec 120
        } catch {
            Write-Host "  No se pudo consultar MSRC ($mes): $($_.Exception.Message)" -ForegroundColor Yellow
            continue
        }
        foreach ($v in $cvrf.Vulnerability) {
            $sev = $v.Threats | Where-Object { $_.Type -eq 3 } | ForEach-Object { $_.Description.Value } |
                Sort-Object { RangoSeveridad $_ } | Select-Object -First 1
            $explotada = [bool]($v.Threats | Where-Object { $_.Type -eq 1 -and $_.Description.Value -match 'Exploited:Yes' })
            $kbs = $v.Remediations | Where-Object { $_.Type -eq 2 -and $_.Description.Value -match '^\d{6,7}$' } |
                ForEach-Object { "KB$($_.Description.Value)" } | Sort-Object -Unique
            foreach ($kb in $kbs) {
                if (-not $mapa.ContainsKey($kb)) {
                    $mapa[$kb] = [pscustomobject]@{
                        CVE        = New-Object 'System.Collections.Generic.SortedSet[string]'
                        Explotadas = New-Object 'System.Collections.Generic.SortedSet[string]'
                        Severidad  = ''
                    }
                }
                [void]$mapa[$kb].CVE.Add($v.CVE)
                if ($explotada) { [void]$mapa[$kb].Explotadas.Add($v.CVE) }
                if ((RangoSeveridad $sev) -lt (RangoSeveridad $mapa[$kb].Severidad)) { $mapa[$kb].Severidad = $sev }
            }
        }
    }
    $mapa
}

# ---------------------------------------------------------------- datos por servidor

$hoy = Get-Date
$kbPendientes  = New-Object System.Collections.Generic.List[object]
$fallidasTodas = New-Object System.Collections.Generic.List[object]
$porServidor   = @{}

foreach ($nombre in $Servidores) {
    $d = $datos | Where-Object { $_.PSComputerName -eq $nombre } | Select-Object -First 1
    if (-not $d) { continue }
    # En PowerShell 5.1 ConvertFrom-Json devuelve el arreglo como un solo objeto: se enumera con el pipeline
    $pend = @((ConvertFrom-Json $d.PendientesJson) | ForEach-Object { $_ })
    $fall = @((ConvertFrom-Json $d.FallidasJson) | ForEach-Object { $_ })
    if (-not $IncluirDefiniciones) {
        $pend = @($pend | Where-Object { -not (EsDefinicion $_) })
        $fall = @($fall | Where-Object { -not (EsDefinicion $_) })
    }
    foreach ($p in $pend) {
        $p | Add-Member -NotePropertyName Servidor -NotePropertyValue $nombre
        $p | Add-Member -NotePropertyName Explotadas -NotePropertyValue ''
        $kbPendientes.Add($p)
    }
    foreach ($x in $fall) { $x | Add-Member -NotePropertyName Servidor -NotePropertyValue $nombre; $fallidasTodas.Add($x) }
    $porServidor[$nombre] = @{ Datos = $d; Pendientes = $pend; Fallidas = $fall }
}

# Severidad, CVE y explotación según el MSRC, para los meses en que se publicaron los pendientes
$msrcConsultado = $false
if (-not $SinMsrc -and $kbPendientes.Count) {
    $ingles = [Globalization.CultureInfo]::InvariantCulture
    $meses = $kbPendientes | Where-Object { $_.Publicado } |
        ForEach-Object { ([datetime]::ParseExact($_.Publicado, 'yyyy-MM-dd', $ingles)).ToString('yyyy-MMM', $ingles) } |
        Sort-Object -Unique
    $msrc = Obtener-DatosMsrc $meses
    $msrcConsultado = $msrc.Count -gt 0
    foreach ($p in $kbPendientes) {
        foreach ($kb in ($p.KB -split ',\s*')) {
            $m = $msrc[$kb]
            if (-not $m) { continue }
            if ((RangoSeveridad $m.Severidad) -lt (RangoSeveridad $p.Severidad)) { $p.Severidad = $m.Severidad }
            if (-not $p.CVE) { $p.CVE = @($m.CVE) -join ', ' }
            $p.Explotadas = @($m.Explotadas) -join ', '
        }
    }
}

# ---------------------------------------------------------------- evaluación

$filas = foreach ($nombre in $Servidores) {
    if (-not $porServidor.ContainsKey($nombre)) {
        $err = $errores | Where-Object { "$($_.TargetObject) $($_.Exception.Message)" -match [regex]::Escape($nombre) } | Select-Object -First 1
        [pscustomobject]@{
            Servidor = $nombre; Estado = 'Sin respuesta'
            Motivos  = if ($err) { $err.Exception.Message.Split("`n")[0] } else { 'No respondió por WinRM' }
        }
        continue
    }
    $d    = $porServidor[$nombre].Datos
    $pend = $porServidor[$nombre].Pendientes
    $fall = $porServidor[$nombre].Fallidas

    $dias       = if ($d.FechaUltimoParche) { [int]($hoy - $d.FechaUltimoParche).TotalDays } else { $null }
    $diasEnc    = if ($d.UltimoInicio) { [int]($hoy - $d.UltimoInicio).TotalDays } else { $null }
    $soporte    = $FinSoporte[$d.BuildMayor]
    $seguridad  = @($pend | Where-Object { $_.Clase -eq 'Security Updates' -or (RangoSeveridad $_.Severidad) -le 1 })
    $criticas   = @($pend | Where-Object { $_.Severidad -eq 'Critical' })
    $explotadas = @($pend | ForEach-Object { $_.Explotadas -split ',\s*' } | Where-Object { $_ } | Sort-Object -Unique)

    $criticos = @(); $avisos = @(); $config = @()
    if ($d.WUServer)                      { $criticos += "Apunta a WSUS ($($d.WUServer))" }
    if ($d.SentinelOne -ne 'Running')     { $criticos += "SentinelOne: $($d.SentinelOne)" }
    if ($soporte -and $soporte -lt $hoy)  { $criticos += "Sistema sin soporte de Microsoft desde $($soporte.ToString('dd/MM/yyyy'))" }
    if ($explotadas.Count)                { $criticos += "Falta el parche de $(Plural $explotadas.Count 'vulnerabilidad explotada' 'vulnerabilidades explotadas') activamente" }
    if ($criticas.Count)                  { $criticos += "$(Plural $criticas.Count 'actualización CRÍTICA pendiente' 'actualizaciones CRÍTICAS pendientes')" }
    elseif ($seguridad.Count)             { $avisos   += "$(Plural $seguridad.Count 'actualización de seguridad pendiente' 'actualizaciones de seguridad pendientes')" }
    elseif ($pend.Count)                  { $avisos   += "$(Plural $pend.Count 'actualización pendiente' 'actualizaciones pendientes')" }
    # Con reinicio pendiente, los parches "instalados" todavía no protegen
    if ($d.ReinicioPendiente -and $diasEnc -ge 30) { $criticos += "Reinicio pendiente y $diasEnc días encendido: los parches instalados no están aplicados" }
    elseif ($d.ReinicioPendiente)         { $avisos   += 'Reinicio pendiente' }
    elseif ($diasEnc -ge 90)              { $avisos   += "Sin reiniciar hace $diasEnc días" }
    if ($null -eq $dias)                  { $avisos   += 'Sin fecha de último parche' }
    elseif ($dias -ge $DiasCritico)       { $criticos += "Último parche hace $dias días" }
    elseif ($dias -ge $DiasAtencion)      { $avisos   += "Último parche hace $dias días" }
    if ($fall.Count)                      { $avisos   += "$(Plural $fall.Count 'instalación fallida' 'instalaciones fallidas') en 30 días" }
    if ($d.ClienteSCCM)                   { $avisos   += 'Cliente SCCM todavía instalado (ejecutar Reparar-WindowsUpdate.ps1)' }
    if ($d.LibreC_GB -lt 10)              { $avisos   += "Poco espacio en C: ($($d.LibreC_GB) GB)" }
    if ($soporte -and $soporte -ge $hoy -and ($soporte - $hoy).TotalDays -le 365) {
        $avisos += "Fin de soporte el $($soporte.ToString('dd/MM/yyyy'))"
    }
    if ($d.ErrorBusqueda)                 { $avisos   += "No se pudo buscar pendientes: $($d.ErrorBusqueda)" }
    # Hallazgos de configuración: se informan aparte y no cambian el estado de parches
    if ($d.SMB1)                          { $config   += 'SMBv1 habilitado' }
    if ($d.FirewallApagado)               { $config   += "Firewall apagado: $($d.FirewallApagado)" }

    [pscustomobject]@{
        Servidor            = $nombre
        Estado              = if ($criticos) { 'Crítico' } elseif ($avisos) { 'Atención' } else { 'OK' }
        Motivos             = ($criticos + $avisos) -join '; '
        Configuracion       = $config -join '; '
        Sistema             = $d.Sistema
        Build               = $d.Build
        FinSoporte          = $soporte
        UltimoParche        = $d.UltimoParche
        FechaUltimoParche   = $d.FechaUltimoParche
        DiasSinParche       = $dias
        Pendientes          = if ($null -eq $d.Pendientes) { $null } else { $pend.Count }
        PendientesSeguridad = $seguridad.Count
        PendientesCriticas  = $criticas.Count
        CVEExplotados       = $explotadas -join ', '
        Fallidas30Dias      = $fall.Count
        ReinicioPendiente   = $d.ReinicioPendiente
        UltimoInicio        = $d.UltimoInicio
        DiasEncendido       = $diasEnc
        WSUS                = if ($d.WUServer) { $d.WUServer } else { 'No' }
        ClienteSCCM         = $d.ClienteSCCM
        AgenteEPC           = $d.AgenteEPC
        SentinelOne         = $d.SentinelOne
        SMB1                = $d.SMB1
        FirewallApagado     = $d.FirewallApagado
        LibreC_GB           = $d.LibreC_GB
    }
}

$orden = @{ 'Crítico' = 0; 'Sin respuesta' = 1; 'Atención' = 2; 'OK' = 3 }
$filas = $filas | Sort-Object @{ e = { $orden[$_.Estado] } }, Servidor

# KB pendientes agrupados: un KB, en qué servidores falta
$kbAgrupados = $kbPendientes | Group-Object Titulo | ForEach-Object {
    $p = $_.Group[0]
    [pscustomobject]@{
        KB         = $p.KB
        Titulo     = $p.Titulo
        Clase      = $p.Clase
        Severidad  = $p.Severidad
        Publicado  = $p.Publicado
        CVE        = $p.CVE
        Explotadas = $p.Explotadas
        Servidores = @($_.Group | ForEach-Object Servidor | Sort-Object -Unique)
    }
} | Sort-Object @{ e = { if ($_.Explotadas) { 0 } else { 1 } } }, @{ e = { RangoSeveridad $_.Severidad } },
                @{ e = { $_.Servidores.Count }; Descending = $true }, Publicado

# ---------------------------------------------------------------- salida

New-Item -ItemType Directory -Path $Salida -Force | Out-Null
$archivoHtml     = Join-Path $Salida "Reporte-Parches_$Marca.html"
$archivoCsv      = Join-Path $Salida "Reporte-Parches_$Marca.csv"
$archivoCsvKb    = Join-Path $Salida "KB-Pendientes_$Marca.csv"
$archivoCsvFallo = Join-Path $Salida "Instalaciones-Fallidas_$Marca.csv"

# Fechas en formato año-mes-día y Sí/No: Excel en español no confunde día y mes
function ParaCsv {
    process {
        $o = [ordered]@{}
        foreach ($prop in $_.PSObject.Properties) {
            $v = $prop.Value
            $o[$prop.Name] = if ($v -is [datetime]) { $v.ToString('yyyy-MM-dd HH:mm') } elseif ($v -is [bool]) { SiNo $v } else { $v }
        }
        [pscustomobject]$o
    }
}
$filas | Select-Object Servidor, Estado, Motivos, Configuracion, Sistema, Build, FinSoporte, UltimoParche, FechaUltimoParche,
    DiasSinParche, Pendientes, PendientesSeguridad, PendientesCriticas, CVEExplotados, Fallidas30Dias, ReinicioPendiente,
    UltimoInicio, DiasEncendido, WSUS, ClienteSCCM, AgenteEPC, SentinelOne, SMB1, FirewallApagado, LibreC_GB |
    ParaCsv | Export-Csv $archivoCsv -NoTypeInformation -Encoding UTF8 -Delimiter ';'
$kbPendientes | Select-Object Servidor, KB, Titulo, Clase, Severidad, Publicado, CVE, Explotadas, Descargada | ParaCsv |
    Export-Csv $archivoCsvKb -NoTypeInformation -Encoding UTF8 -Delimiter ';'
$fallidasTodas | Select-Object Servidor, Fecha, Titulo, Codigo |
    Export-Csv $archivoCsvFallo -NoTypeInformation -Encoding UTF8 -Delimiter ';'

function ClaseEstado([string]$e) {
    switch ($e) { 'Crítico' { 'critico' } 'Atención' { 'atencion' } 'OK' { 'ok' } default { 'sinresp' } }
}
function Severidad([string]$s) {
    switch ($s) {
        'Critical'  { "<span class='estado critico'>Crítica</span>" }
        'Important' { "<span class='estado atencion'>Importante</span>" }
        'Moderate'  { 'Moderada' }
        'Low'       { 'Baja' }
        default     { '—' }
    }
}
function EnlacesKB([string]$kbs) {
    (($kbs -split ',\s*') | Where-Object { $_ } | ForEach-Object {
        "<a href='https://support.microsoft.com/help/$($_ -replace '^KB','')' target='_blank'>$(Codificar $_)</a>"
    }) -join ' '
}
function EnlacesCVE([string]$cves, [string]$explotadas) {
    $lista = @(($cves -split ',\s*') | Where-Object { $_ })
    if (-not $lista.Count) { return '—' }
    $exp = @(($explotadas -split ',\s*') | Where-Object { $_ })
    $enlaces = ($lista | ForEach-Object {
        $marca = if ($_ -in $exp) { " class='explotada' title='Explotada activamente'" } else { '' }
        "<a href='https://msrc.microsoft.com/update-guide/vulnerability/$_' target='_blank'$marca>$(Codificar $_)</a>"
    }) -join ' '
    if ($lista.Count -le 3) { return $enlaces }
    "<details><summary>$($lista.Count) CVE</summary>$enlaces</details>"
}

$conteo = $filas | Group-Object Estado -AsHashTable -AsString
$tarjetas = foreach ($e in 'Crítico', 'Atención', 'OK', 'Sin respuesta') {
    $n = if ($conteo -and $conteo[$e]) { @($conteo[$e]).Count } else { 0 }
    "<div class='tarjeta $(ClaseEstado $e)'><b>$n</b><span>$e</span></div>"
}

# Tabla 1: servidores
$filasHtml = foreach ($f in $filas) {
    $clase = ClaseEstado $f.Estado
    if ($f.Estado -eq 'Sin respuesta') {
        "<tr><td>$(Codificar $f.Servidor)</td><td><span class='estado $clase'>$(Codificar $f.Estado)</span></td><td colspan='9'>$(Codificar $f.Motivos)</td></tr>"
        continue
    }
    $pend = if ($null -eq $f.Pendientes) { '—' } else {
        "$($f.Pendientes)<br><small>$($f.PendientesSeguridad) de seguridad$(if ($f.PendientesCriticas) { ", $($f.PendientesCriticas) críticas" })</small>"
    }
    $parche = "$(Codificar $f.UltimoParche)<br><small>$(FormatoFecha $f.FechaUltimoParche 'dd/MM/yyyy')$(if ($null -ne $f.DiasSinParche) { " · hace $(Plural $f.DiasSinParche 'día' 'días')" })</small>"
    $inicio = "$(FormatoFecha $f.UltimoInicio 'dd/MM/yyyy')<br><small>hace $(Plural $f.DiasEncendido 'día' 'días')$(if ($f.ReinicioPendiente) { ' · <b>reinicio pendiente</b>' })</small>"
    $soporte = if ($f.FinSoporte) { FormatoFecha $f.FinSoporte 'dd/MM/yyyy' } else { '—' }
    $motivos = if ($f.Motivos) { Codificar $f.Motivos } else { '—' }
    $config  = if ($f.Configuracion) { Codificar $f.Configuracion } else { '—' }
    @"
<tr><td>$(Codificar $f.Servidor)<br><small>$(Codificar $f.Sistema)</small></td><td><span class='estado $clase'>$(Codificar $f.Estado)</span></td><td>$motivos</td>
<td>$(Codificar $f.Build)<br><small>Soporte hasta $soporte</small></td><td>$parche</td><td>$pend</td><td>$($f.Fallidas30Dias)</td><td>$inicio</td>
<td>$(Codificar $f.SentinelOne)</td><td>$(Codificar $f.LibreC_GB) GB</td><td>$config</td></tr>
"@
}

# Tabla 2: KB pendientes
$filasKb = foreach ($k in $kbAgrupados) {
    $servs = ($k.Servidores | ForEach-Object { Codificar $_ }) -join '<br>'
    $exp = if ($k.Explotadas) { "<span class='estado critico'>Sí</span><br><small>$(Codificar $k.Explotadas)</small>" } else { 'No' }
    @"
<tr><td>$(EnlacesKB $k.KB)</td><td>$(Codificar $k.Titulo)</td><td>$(Codificar $k.Clase)</td><td>$(Severidad $k.Severidad)</td>
<td>$(Codificar $k.Publicado)</td><td>$(EnlacesCVE $k.CVE $k.Explotadas)</td><td>$exp</td><td><b>$($k.Servidores.Count)</b><br><small>$servs</small></td></tr>
"@
}
$notaMsrc = if ($SinMsrc) { 'No se consultó el MSRC (se usó -SinMsrc).' }
            elseif ($msrcConsultado) { 'Severidad, CVE y explotación activa según el boletín mensual del Microsoft Security Response Center (MSRC).' }
            elseif ($kbPendientes.Count) { 'No se pudo consultar el MSRC: la severidad y los CVE pueden faltar.' }
            else { '' }
$notaDef = if ($IncluirDefiniciones) { '' } else { ' No se incluyen las firmas de Microsoft Defender (usar -IncluirDefiniciones para verlas).' }
$seccionKb = if ($SinBuscarPendientes) {
    "<p class='sub'>No se buscaron actualizaciones pendientes (se usó -SinBuscarPendientes).</p>"
} elseif (-not $kbAgrupados) {
    "<p class='sub'>Ningún servidor tiene actualizaciones pendientes.$notaDef</p>"
} else {
    "<p class='sub'>$notaMsrc$notaDef</p><table><thead><tr><th>KB</th><th>Actualización</th><th>Clasificación</th><th>Severidad</th><th>Publicada</th><th>CVE que corrige</th><th>Explotada activamente</th><th>Servidores donde falta</th></tr></thead><tbody>$($filasKb -join "`n")</tbody></table>"
}

# Tabla 3: instalaciones fallidas
$seccionFallos = if (-not $fallidasTodas.Count) {
    "<p class='sub'>No hay instalaciones fallidas en los últimos 30 días.</p>"
} else {
    $filasF = foreach ($x in ($fallidasTodas | Sort-Object Fecha -Descending)) {
        "<tr><td>$(Codificar $x.Servidor)</td><td>$(Codificar $x.Fecha)</td><td>$(Codificar $x.Titulo)</td><td><code>$(Codificar $x.Codigo)</code></td></tr>"
    }
    "<table><thead><tr><th>Servidor</th><th>Fecha</th><th>Actualización</th><th>Código de error</th></tr></thead><tbody>$($filasF -join "`n")</tbody></table>"
}

$html = @"
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Estado de parches</title>
<style>
 body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#222;background:#fff}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:17px;margin:28px 0 8px} p.sub{color:#666;margin:0 0 16px}
 .tarjetas{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
 .tarjeta{border-radius:8px;padding:10px 16px;min-width:110px} .tarjeta b{font-size:24px;display:block} .tarjeta span{font-size:13px}
 table{border-collapse:collapse;width:100%;font-size:13px} th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
 th{background:#f3f3f3;position:sticky;top:0} small{color:#666} a{color:#0b5cad} a.explotada{color:#a4161a;font-weight:700}
 .estado{border-radius:4px;padding:2px 8px;font-weight:600;white-space:nowrap}
 .critico{background:#fde2e1;color:#a4161a} .atencion{background:#fff3cd;color:#7a5a00} .ok{background:#dcf5e3;color:#1b6b34} .sinresp{background:#e7e7e7;color:#444}
 details summary{cursor:pointer;color:#0b5cad}
</style></head><body>
<h1>Estado de parches de servidores</h1>
<p class="sub">Generado el $(Get-Date -Format 'dd/MM/yyyy HH:mm') desde $env:COMPUTERNAME · $($filas.Count) servidores · Atención a partir de $DiasAtencion días sin parches, crítico a partir de $DiasCritico.</p>
<div class="tarjetas">$($tarjetas -join '')</div>

<h2>Servidores</h2>
<p class="sub">"Configuración" muestra hallazgos de seguridad que no dependen de parches; no cambian el estado.</p>
<table><thead><tr><th>Servidor</th><th>Estado</th><th>Motivos</th><th>Build</th><th>Último parche</th><th>Pendientes</th><th>Fallidas (30 d)</th><th>Último inicio</th><th>SentinelOne</th><th>Libre C:</th><th>Configuración</th></tr></thead>
<tbody>
$($filasHtml -join "`n")
</tbody></table>

<h2>Actualizaciones pendientes por KB</h2>
$seccionKb

<h2>Instalaciones fallidas (últimos 30 días)</h2>
$seccionFallos
</body></html>
"@
$html | Out-File $archivoHtml -Encoding UTF8

# ---------------------------------------------------------------- resumen en consola

$filas | Format-Table Servidor, Estado, Build, DiasSinParche, Pendientes, PendientesCriticas, ReinicioPendiente, Motivos -AutoSize -Wrap
if ($kbAgrupados) {
    Write-Host 'KB pendientes:' -ForegroundColor Cyan
    $kbAgrupados | Format-Table KB, Severidad, @{ n = 'Explotada'; e = { if ($_.Explotadas) { 'SÍ' } else { '' } } }, Publicado,
        @{ n = 'Servidores'; e = { $_.Servidores.Count } }, Titulo -AutoSize -Wrap
}
Write-Host "Reporte HTML  : $archivoHtml" -ForegroundColor Green
Write-Host "CSV servidores: $archivoCsv" -ForegroundColor Green
Write-Host "CSV KB        : $archivoCsvKb" -ForegroundColor Green
Write-Host "CSV fallidas  : $archivoCsvFallo" -ForegroundColor Green
