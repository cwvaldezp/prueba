<#
.SYNOPSIS
    Recolecta todo lo migrable de este Windows hacia una carpeta, para llevarlo a NixOS.

.DESCRIPTION
    Ejecutar en PowerShell "Como Administrador" (para poder leer los perfiles de
    otros usuarios como 00210460 y srvaccount). Compatible con Windows PowerShell 5.1
    y PowerShell 7.

    Por cada usuario recoge:
      - Historial de PowerShell (PSReadLine: consola, VS Code, ISE)
      - Perfiles de PowerShell ($PROFILE) y lista de módulos instalados
      - Scripts .ps1/.psm1/.psd1/.bat/.cmd/.sh/.py de Documentos, Escritorio, Descargas
        y de las carpetas extra que indiques con -CarpetasExtra
      - VS Code: settings, keybindings, snippets, tasks, perfiles, lista de extensiones
      - Insomnia: carpeta de datos completa (sin cachés)
      - KeePassXC: configuración + las bases .kdbx y archivos llave que tenga registrados
      - .ssh, .gitconfig, .aws/.azure/.kube (opcional, con -IncluirSecretos)
      - Windows Terminal

    A nivel de máquina:
      - Tareas programadas y servicios que corren como esos usuarios (srvaccount)
      - Variables de entorno (máquina y por usuario), PATH
      - Programas instalados (winget export + registro)
      - Archivo hosts, unidades de red mapeadas, nombres de credenciales guardadas

.PARAMETER Usuarios
    Usuarios a exportar. Por defecto: el actual, 00210460 y srvaccount.
    Usa -Usuarios * para todos los perfiles de C:\Users.

.PARAMETER Destino
    Carpeta donde se deja todo. Por defecto: Escritorio\migracion-nixos-<fecha>.

.PARAMETER CarpetasExtra
    Carpetas adicionales donde tengas scripts (p. ej. C:\Scripts, D:\Tools).

.PARAMETER IncluirSecretos
    Copia también .ssh, .aws, .azure, .kube y perfiles Wi-Fi con su clave.
    Sin esto solo se listan, no se copian.

.EXAMPLE
    Set-ExecutionPolicy -Scope Process Bypass -Force
    .\Exportar-Windows.ps1 -CarpetasExtra C:\Scripts -IncluirSecretos
#>
[CmdletBinding()]
param(
    [string[]] $Usuarios = @($env:USERNAME, '00210460', 'srvaccount'),
    [string]   $Destino = (Join-Path ([Environment]::GetFolderPath('Desktop')) ("migracion-nixos-" + (Get-Date -Format 'yyyyMMdd-HHmm'))),
    [string[]] $CarpetasExtra = @(),
    [switch]   $IncluirSecretos,
    [int]      $MaxMBPorScript = 5
)

$ErrorActionPreference = 'Continue'
$script:Avisos = New-Object System.Collections.Generic.List[string]

function Write-Paso($texto) { Write-Host "==> $texto" -ForegroundColor Cyan }
function Add-Aviso($texto)  { $script:Avisos.Add($texto); Write-Host "  ! $texto" -ForegroundColor Yellow }

function Copy-Seguro {
    param([string] $Origen, [string] $DestinoDir, [string[]] $Excluir = @())
    if (-not (Test-Path -LiteralPath $Origen)) { return $false }
    New-Item -ItemType Directory -Force -Path $DestinoDir | Out-Null
    $item = Get-Item -LiteralPath $Origen -Force
    if ($item.PSIsContainer) {
        # robocopy maneja rutas largas y archivos en uso mejor que Copy-Item
        $rcArgs = @($Origen, (Join-Path $DestinoDir $item.Name), '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XJ')
        if ($Excluir.Count -gt 0) { $rcArgs += "/XD"; $rcArgs += $Excluir }
        & robocopy @rcArgs | Out-Null
        if ($LASTEXITCODE -ge 8) { Add-Aviso "robocopy tuvo errores copiando $Origen (código $LASTEXITCODE)" }
    } else {
        try { Copy-Item -LiteralPath $Origen -Destination $DestinoDir -Force -ErrorAction Stop }
        catch { Add-Aviso "No se pudo copiar $Origen : $($_.Exception.Message)" ; return $false }
    }
    return $true
}

function Test-EsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ---------------------------------------------------------------------------
if (-not (Test-EsAdmin)) {
    Write-Warning "No estás como Administrador: solo podré leer tu propio perfil."
}
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
Start-Transcript -Path (Join-Path $Destino 'log-exportacion.txt') -Force | Out-Null
Write-Paso "Destino: $Destino"

# Resolver perfiles (el nombre de la carpeta puede no coincidir con el usuario,
# p. ej. 00210460.DOMINIO), así que se mira el registro ProfileList.
$perfiles = Get-CimInstance Win32_UserProfile | Where-Object { -not $_.Special -and $_.LocalPath -like '*\Users\*' }
$perfilesElegidos = @()
foreach ($p in $perfiles) {
    $carpeta = Split-Path $p.LocalPath -Leaf
    $nombre = $carpeta
    try { $nombre = ((New-Object Security.Principal.SecurityIdentifier $p.SID).Translate([Security.Principal.NTAccount]).Value -split '\\')[-1] } catch {}
    $coincide = ($Usuarios -contains '*')
    foreach ($u in $Usuarios) { if ($nombre -ieq $u -or $carpeta -ieq $u -or $carpeta -like "$u.*") { $coincide = $true } }
    if ($coincide) { $perfilesElegidos += [pscustomobject]@{ Usuario = $nombre; Ruta = $p.LocalPath; SID = $p.SID } }
}
foreach ($u in $Usuarios) {
    if ($u -ne '*' -and -not ($perfilesElegidos | Where-Object { $_.Usuario -ieq $u -or (Split-Path $_.Ruta -Leaf) -like "$u*" })) {
        Add-Aviso "No encontré perfil para '$u' en este equipo (¿nunca inició sesión aquí?)."
    }
}
$perfilesElegidos | Format-Table -AutoSize | Out-String | Write-Host

# ---------------------------------------------------------------------------
foreach ($perfil in $perfilesElegidos) {
    $home_ = $perfil.Ruta
    $out = Join-Path $Destino ("usuarios\" + $perfil.Usuario)
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    Write-Paso "Usuario $($perfil.Usuario) ($home_)"

    $appdata = Join-Path $home_ 'AppData\Roaming'
    $local   = Join-Path $home_ 'AppData\Local'
    # Documentos puede estar redirigido a OneDrive
    $docsCandidatos = @((Join-Path $home_ 'Documents')) + @(Get-ChildItem -LiteralPath $home_ -Directory -Filter 'OneDrive*' -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'Documents'; Join-Path $_.FullName 'Documentos' })
    $docs = $docsCandidatos | Where-Object { Test-Path -LiteralPath $_ }

    # --- PowerShell: historial -------------------------------------------
    $hist = Join-Path $appdata 'Microsoft\Windows\PowerShell\PSReadLine'
    if (Test-Path -LiteralPath $hist) {
        $dHist = Join-Path $out 'powershell\historial'
        New-Item -ItemType Directory -Force -Path $dHist | Out-Null
        Get-ChildItem -LiteralPath $hist -Filter '*history*.txt' -Force | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $dHist -Force
            Write-Host "  historial: $($_.Name) ($((Get-Content -LiteralPath $_.FullName -ErrorAction SilentlyContinue | Measure-Object).Count) líneas)"
        }
    } else { Add-Aviso "$($perfil.Usuario): sin historial de PSReadLine" }

    # --- PowerShell: perfiles y módulos ----------------------------------
    foreach ($d in $docs) {
        foreach ($sub in 'WindowsPowerShell', 'PowerShell') {
            $psDir = Join-Path $d $sub
            if (-not (Test-Path -LiteralPath $psDir)) { continue }
            $dPerf = Join-Path $out "powershell\perfiles\$sub"
            New-Item -ItemType Directory -Force -Path $dPerf | Out-Null
            Get-ChildItem -LiteralPath $psDir -Filter '*.ps1' -File -Force | Copy-Item -Destination $dPerf -Force
            $mods = Join-Path $psDir 'Modules'
            if (Test-Path -LiteralPath $mods) {
                Get-ChildItem -LiteralPath $mods -Directory | ForEach-Object {
                    $ver = (Get-ChildItem -LiteralPath $_.FullName -Directory -ErrorAction SilentlyContinue | Select-Object -Last 1).Name
                    "{0}`t{1}" -f $_.Name, $ver
                } | Set-Content -LiteralPath (Join-Path $out "powershell\modulos-$sub.txt") -Encoding UTF8
            }
        }
    }

    # --- Scripts sueltos --------------------------------------------------
    $buscarEn = @($docs) + @((Join-Path $home_ 'Desktop'), (Join-Path $home_ 'Downloads'), (Join-Path $home_ 'Scripts'), (Join-Path $home_ 'source'), (Join-Path $home_ 'repos'))
    $extensiones = '*.ps1', '*.psm1', '*.psd1', '*.bat', '*.cmd', '*.sh', '*.py', '*.vbs'
    $dScripts = Join-Path $out 'scripts'
    $n = 0
    foreach ($raiz in ($buscarEn | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -Unique)) {
        Get-ChildItem -LiteralPath $raiz -Recurse -File -Include $extensiones -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Length -le ($MaxMBPorScript * 1MB) -and $_.FullName -notmatch '\\(node_modules|\.git|\.venv|venv|site-packages|WindowsPowerShell\\Modules|PowerShell\\Modules)\\' } |
            ForEach-Object {
                $rel = $_.FullName.Substring($home_.Length).TrimStart('\')
                $dst = Join-Path $dScripts $rel
                New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
                Copy-Item -LiteralPath $_.FullName -Destination $dst -Force
                $n++
            }
    }
    Write-Host "  scripts copiados: $n"

    # --- VS Code (y variantes) -------------------------------------------
    foreach ($variante in 'Code', 'Code - Insiders', 'VSCodium') {
        $vsUser = Join-Path $appdata "$variante\User"
        if (-not (Test-Path -LiteralPath $vsUser)) { continue }
        $dVs = Join-Path $out "vscode\$variante"
        New-Item -ItemType Directory -Force -Path $dVs | Out-Null
        foreach ($f in 'settings.json', 'keybindings.json', 'tasks.json', 'launch.json', 'mcp.json') {
            Copy-Seguro (Join-Path $vsUser $f) $dVs | Out-Null
        }
        foreach ($dir in 'snippets', 'profiles', 'prompts') {
            Copy-Seguro (Join-Path $vsUser $dir) $dVs | Out-Null
        }
        Write-Host "  VS Code ($variante): configuración copiada"
    }
    $extDir = Join-Path $home_ '.vscode\extensions'
    if (Test-Path -LiteralPath $extDir) {
        $dVs = Join-Path $out 'vscode'
        New-Item -ItemType Directory -Force -Path $dVs | Out-Null
        $extJson = Join-Path $extDir 'extensions.json'
        $ids = @()
        if (Test-Path -LiteralPath $extJson) {
            try { $ids = (Get-Content -LiteralPath $extJson -Raw | ConvertFrom-Json) | ForEach-Object { $_.identifier.id } } catch {}
        }
        if (-not $ids) {
            $ids = Get-ChildItem -LiteralPath $extDir -Directory | ForEach-Object { $_.Name -replace '-\d+\.\d+\.\d+.*$', '' }
        }
        $ids | Sort-Object -Unique | Set-Content -LiteralPath (Join-Path $dVs 'extensiones.txt') -Encoding UTF8
        Write-Host "  VS Code: $(@($ids | Sort-Object -Unique).Count) extensiones listadas"
    }

    # --- Insomnia ---------------------------------------------------------
    foreach ($ins in 'Insomnia', 'insomnia-app', 'Insomnia Designer') {
        $insDir = Join-Path $appdata $ins
        if (Test-Path -LiteralPath $insDir) {
            Copy-Seguro $insDir (Join-Path $out 'insomnia') -Excluir @('Cache', 'Code Cache', 'GPUCache', 'logs', 'Crashpad', 'blob_storage', 'Service Worker', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache') | Out-Null
            Write-Host "  Insomnia: carpeta $ins copiada"
            Add-Aviso "$($perfil.Usuario): exporta además desde Insomnia > Preferences > Data > Export data (formato Insomnia v4/v5) — es lo más fiable para reimportar."
        }
    }

    # --- KeePassXC --------------------------------------------------------
    $kpIni = @((Join-Path $appdata 'KeePassXC\keepassxc.ini'), (Join-Path $local 'KeePassXC\keepassxc.ini'), (Join-Path $local 'KeePassXC\keepassxc_cache.ini'))
    foreach ($ini in $kpIni) {
        if (-not (Test-Path -LiteralPath $ini)) { continue }
        $dKp = Join-Path $out 'keepassxc'
        Copy-Seguro $ini $dKp | Out-Null
        $contenido = Get-Content -LiteralPath $ini -Raw
        # Rutas de .kdbx y archivos llave mencionadas en el ini
        $rutas = [regex]::Matches($contenido, '[A-Za-z]:[\\/][^,\r\n"=]+?\.(kdbx|keyx|key)') | ForEach-Object { $_.Value -replace '/', '\' } | Sort-Object -Unique
        foreach ($r in $rutas) {
            if (Copy-Seguro $r (Join-Path $dKp 'bases')) { Write-Host "  KeePassXC: copiado $r" }
            else { Add-Aviso "KeePassXC menciona $r pero no existe/no se pudo copiar" }
        }
        $rutas | Set-Content -LiteralPath (Join-Path $dKp 'rutas-originales.txt') -Encoding UTF8
    }
    # Por si hay .kdbx que el ini no menciona
    foreach ($raiz in ($buscarEn | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -Unique)) {
        Get-ChildItem -LiteralPath $raiz -Recurse -File -Include '*.kdbx', '*.keyx' -Force -ErrorAction SilentlyContinue | ForEach-Object {
            if (Copy-Seguro $_.FullName (Join-Path $out 'keepassxc\bases')) { Write-Host "  KeePassXC: encontrado $($_.FullName)" }
        }
    }

    # --- Windows Terminal, git, ssh y otros dotfiles ---------------------
    Get-ChildItem -LiteralPath (Join-Path $local 'Packages') -Directory -Filter 'Microsoft.WindowsTerminal*' -ErrorAction SilentlyContinue | ForEach-Object {
        Copy-Seguro (Join-Path $_.FullName 'LocalState\settings.json') (Join-Path $out "windows-terminal\$($_.Name)") | Out-Null
    }
    foreach ($f in '.gitconfig', '.git-credentials', '.bashrc', '.bash_profile', '.vimrc', '.wslconfig', '.npmrc', '.condarc') {
        if ($f -eq '.git-credentials' -and -not $IncluirSecretos) { continue }
        Copy-Seguro (Join-Path $home_ $f) (Join-Path $out 'dotfiles') | Out-Null
    }
    foreach ($d in '.ssh', '.aws', '.azure', '.kube', '.docker', '.gnupg') {
        $ruta = Join-Path $home_ $d
        if (-not (Test-Path -LiteralPath $ruta)) { continue }
        if ($IncluirSecretos) {
            Copy-Seguro $ruta (Join-Path $out 'dotfiles') -Excluir @('cliextensions', 'bin', 'logs', 'cache') | Out-Null
            Write-Host "  secretos: $d copiado"
        } else {
            Add-Aviso "$($perfil.Usuario): existe $d (no copiado; usa -IncluirSecretos)"
        }
    }
}

# ---------------------------------------------------------------------------
$maq = Join-Path $Destino 'maquina'
New-Item -ItemType Directory -Force -Path $maq | Out-Null

foreach ($extra in $CarpetasExtra) {
    Write-Paso "Carpeta extra $extra"
    if (-not (Copy-Seguro $extra (Join-Path $maq 'carpetas-extra') -Excluir @('node_modules', '.venv', 'venv', '__pycache__'))) {
        Add-Aviso "No existe la carpeta extra $extra"
    }
}

Write-Paso "Tareas programadas y servicios de esos usuarios"
$nombres = $perfilesElegidos.Usuario
$dTareas = Join-Path $maq 'tareas-programadas'
New-Item -ItemType Directory -Force -Path $dTareas | Out-Null
Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } | ForEach-Object {
    $t = $_
    $deUsuario = $false
    foreach ($u in $nombres) { if ($t.Principal.UserId -like "*$u") { $deUsuario = $true } }
    if ($deUsuario -or $Usuarios -contains '*' -or $t.Principal.UserId -match 'srv') {
        $archivo = (($t.TaskPath + $t.TaskName) -replace '[\\/:*?"<>|]', '_').Trim('_') + '.xml'
        try { Export-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath | Set-Content -LiteralPath (Join-Path $dTareas $archivo) -Encoding UTF8 } catch {}
        [pscustomobject]@{ Tarea = $t.TaskPath + $t.TaskName; Usuario = $t.Principal.UserId; Estado = $t.State
                           Accion = ($t.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join ' ; ' }
    }
} | Export-Csv -LiteralPath (Join-Path $maq 'tareas-programadas.csv') -NoTypeInformation -Encoding UTF8

Get-CimInstance Win32_Service | Where-Object { $_.StartName -and $_.StartName -notmatch '^(LocalSystem|NT AUTHORITY|NT SERVICE)' } |
    Select-Object Name, DisplayName, StartName, StartMode, State, PathName |
    Export-Csv -LiteralPath (Join-Path $maq 'servicios-con-cuenta.csv') -NoTypeInformation -Encoding UTF8

Write-Paso "Variables de entorno"
[Environment]::GetEnvironmentVariables('Machine').GetEnumerator() | Sort-Object Name | ForEach-Object { "{0}={1}" -f $_.Name, $_.Value } |
    Set-Content -LiteralPath (Join-Path $maq 'env-maquina.txt') -Encoding UTF8
foreach ($perfil in $perfilesElegidos) {
    $clave = "Registry::HKEY_USERS\$($perfil.SID)\Environment"
    if (Test-Path $clave) {
        (Get-ItemProperty $clave).PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { "{0}={1}" -f $_.Name, $_.Value } |
            Set-Content -LiteralPath (Join-Path $Destino "usuarios\$($perfil.Usuario)\env-usuario.txt") -Encoding UTF8
    } else {
        Add-Aviso "$($perfil.Usuario): su registro no está cargado (no ha iniciado sesión); variables de usuario no exportadas."
    }
}

Write-Paso "Programas instalados"
if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget export -o (Join-Path $maq 'winget.json') --include-versions --accept-source-agreements 2>&1 | Out-Null
}
$claves = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
Get-ItemProperty $claves -ErrorAction SilentlyContinue | Where-Object DisplayName | Select-Object DisplayName, DisplayVersion, Publisher |
    Sort-Object DisplayName -Unique | Export-Csv -LiteralPath (Join-Path $maq 'programas.csv') -NoTypeInformation -Encoding UTF8
if (Get-Command choco -ErrorAction SilentlyContinue) { choco list 2>$null | Set-Content -LiteralPath (Join-Path $maq 'choco.txt') -Encoding UTF8 }
if (Get-Command scoop -ErrorAction SilentlyContinue) { scoop export 2>$null | Set-Content -LiteralPath (Join-Path $maq 'scoop.json') -Encoding UTF8 }
Get-InstalledModule -ErrorAction SilentlyContinue | Select-Object Name, Version, Repository |
    Export-Csv -LiteralPath (Join-Path $maq 'modulos-powershell-globales.csv') -NoTypeInformation -Encoding UTF8

Write-Paso "Red y credenciales (solo nombres)"
Copy-Seguro "$env:SystemRoot\System32\drivers\etc\hosts" $maq | Out-Null
Get-SmbMapping -ErrorAction SilentlyContinue | Select-Object LocalPath, RemotePath | Export-Csv -LiteralPath (Join-Path $maq 'unidades-red.csv') -NoTypeInformation -Encoding UTF8
cmdkey /list | Set-Content -LiteralPath (Join-Path $maq 'credenciales-guardadas-nombres.txt') -Encoding UTF8
Add-Aviso "Las contraseñas del Administrador de credenciales de Windows NO se exportan; revisa credenciales-guardadas-nombres.txt y pásalas a KeePassXC."
if ($IncluirSecretos) {
    $dWifi = Join-Path $maq 'wifi'
    New-Item -ItemType Directory -Force -Path $dWifi | Out-Null
    netsh wlan export profile key=clear folder="$dWifi" | Out-Null
}

# ---------------------------------------------------------------------------
Write-Paso "Resumen de comandos más usados (para saber qué traducir a Linux)"
$todo = Get-ChildItem -LiteralPath (Join-Path $Destino 'usuarios') -Recurse -Filter '*history*.txt' -ErrorAction SilentlyContinue | ForEach-Object { Get-Content -LiteralPath $_.FullName }
if ($todo) {
    $todo | Where-Object { $_ -and $_.Trim() } | ForEach-Object { ($_.Trim() -split '\s+')[0] } | Group-Object | Sort-Object Count -Descending |
        Select-Object -First 150 | ForEach-Object { "{0,6}  {1}" -f $_.Count, $_.Name } |
        Set-Content -LiteralPath (Join-Path $Destino 'comandos-frecuentes.txt') -Encoding UTF8
    $todo | Where-Object { $_ -and $_.Trim() } | Select-Object -Unique |
        Set-Content -LiteralPath (Join-Path $Destino 'historial-unificado.txt') -Encoding UTF8
}

$script:Avisos | Set-Content -LiteralPath (Join-Path $Destino 'AVISOS.txt') -Encoding UTF8
Stop-Transcript | Out-Null

Write-Paso "Comprimiendo"
$zip = "$Destino.zip"
$sieteZip = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($sieteZip) {
    $zip = "$Destino.7z"
    Write-Host "Se usará 7-Zip con contraseña (contiene datos sensibles). Escríbela cuando la pida:"
    & $sieteZip a -t7z -mhe=on -p $zip "$Destino\*" | Out-Null
} else {
    Compress-Archive -Path "$Destino\*" -DestinationPath $zip -Force
    Write-Warning "El .zip NO tiene contraseña. Guárdalo en un USB cifrado o instala 7-Zip y vuelve a ejecutar."
}

Write-Host ""
Write-Host "Listo: $zip" -ForegroundColor Green
Write-Host "Revisa $Destino\AVISOS.txt" -ForegroundColor Green
