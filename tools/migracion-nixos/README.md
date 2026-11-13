# Migración de Windows a NixOS

Tres piezas:

| Archivo | Dónde se ejecuta | Qué hace |
|---|---|---|
| `Exportar-Windows.ps1` | Windows, PowerShell **como Administrador** | Junta todo en una carpeta y la comprime (con contraseña si tienes 7-Zip) |
| `nixos-migracion.nix` | NixOS, `/etc/nixos/` | Instala pwsh, KeePassXC, Insomnia, VS Code y utilidades |
| `importar-en-nixos.sh` | NixOS, como tu usuario | Pone cada cosa en su ruta de Linux |

## 1. En Windows

Antes de ejecutar el script:

1. **Insomnia**: abre la app → *Preferences → Data → Export data* → todas las colecciones → guárdalo en el Escritorio. Es la forma más fiable de reimportar; el script además copia la carpeta de datos cruda como respaldo.
2. **KeePassXC**: ciérralo (para que la `.kdbx` no esté bloqueada). Apunta dónde está tu archivo llave si usas uno fuera de Documentos.
3. **VS Code**: si usas *Settings Sync* con GitHub/Microsoft, en NixOS bastará con iniciar sesión; el script lo deja todo copiado igualmente.
4. Si `srvaccount` u otra cuenta nunca inició sesión de forma interactiva en este equipo, no tendrá perfil y no habrá nada que copiar (lo avisará).

Abre **PowerShell como Administrador**, ve a la carpeta del script y ejecuta:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\Exportar-Windows.ps1 -IncluirSecretos -CarpetasExtra C:\Scripts
```

- `-Usuarios` por defecto es: el usuario actual, `00210460` y `srvaccount`. Para todos: `-Usuarios *`.
- `-CarpetasExtra`: cualquier carpeta fuera de tu perfil donde tengas scripts (C:\Scripts, D:\Tools…).
- `-IncluirSecretos`: copia `.ssh`, `.aws`, `.azure`, `.kube`, `.git-credentials` y perfiles Wi‑Fi con clave. Sin esto solo se listan.

Resultado: `C:\migracion-nixos-AAAAMMDD-HHMM\` + `.7z` (o `.zip`). Mira `AVISOS.txt`. El script se niega a escribir dentro de OneDrive/Dropbox, porque la exportación lleva secretos.

### Archivos de OneDrive "solo en línea"

Si Documentos o Escritorio están en OneDrive, los archivos que solo están en la nube no se pueden descargar desde una consola de Administrador ("El proveedor de archivos de nube no se está ejecutando"). El script los salta y los lista en `archivos-solo-en-nube.txt`. Para incluirlos: en el Explorador, clic derecho sobre la carpeta de OneDrive (Documentos/Escritorio) → **Mantener siempre en este dispositivo**, espera a que termine de descargar y vuelve a ejecutar el script.

### Qué se recoge

Por usuario (`usuarios\<usuario>\`):
- `powershell\historial\` — todo lo que has ejecutado (consola, terminal de VS Code, ISE). Si ejecutabas "como administrador" con tu misma cuenta, el historial es el mismo archivo; si usabas *runas* con otra cuenta, está en el perfil de esa cuenta.
- `powershell\perfiles\` y `modulos-*.txt` — tu `$PROFILE` y módulos instalados.
- `scripts\` — `.ps1 .psm1 .psd1 .bat .cmd .sh .py .vbs` de Documentos (incl. OneDrive), Escritorio, Descargas, `source`, `repos`.
- `vscode\` — settings, keybindings, snippets, tasks, perfiles y `extensiones.txt`.
- `insomnia\`, `keepassxc\` (config + bases `.kdbx` y llaves que el ini menciona o que aparezcan en tus carpetas).
- `dotfiles\`, `windows-terminal\`, `env-usuario.txt`.

De la máquina (`maquina\`): tareas programadas (`.xml` + `.csv`), servicios que corren con cuentas como `srvaccount`, variables de entorno, programas instalados (`winget.json`, `programas.csv`), `hosts`, unidades de red, **nombres** de credenciales guardadas.

Extra: `comandos-frecuentes.txt` (los 150 comandos que más usas) y `historial-unificado.txt`.

**No se puede exportar**: las contraseñas del Administrador de credenciales de Windows (solo sus nombres). Pásalas a KeePassXC antes de formatear.

## 2. En NixOS

```bash
sudo cp nixos-migracion.nix /etc/nixos/
```

Edita `/etc/nixos/configuration.nix`, añade `./nixos-migracion.nix` en `imports` y cambia `usuario` dentro del archivo. Después:

```bash
sudo nixos-rebuild switch
```

Descomprime la exportación e importa:

```bash
7z x migracion-nixos-*.7z -omigracion
```

```bash
./importar-en-nixos.sh ./migracion 00210460
```

El segundo argumento es de qué usuario de Windows tomar VS Code/KeePassXC/Insomnia. El historial de PowerShell se fusiona de todos.

Dónde queda cada cosa:

| Qué | Ruta en NixOS |
|---|---|
| Historial pwsh | `~/.local/share/powershell/PSReadLine/ConsoleHost_history.txt` |
| Perfil pwsh | `~/.config/powershell/Microsoft.PowerShell_profile.ps1` |
| Scripts | `~/scripts-windows/<usuario>/…` |
| VS Code | `~/.config/Code/User/` |
| KeePassXC | `~/Documentos/KeePassXC/*.kdbx` |
| Insomnia | `~/.config/Insomnia/` (o *Import* del JSON exportado) |
| SSH | `~/.ssh/` con permisos 600 |

Ejecuta `pwsh` y con ↑ / `Ctrl+R` tendrás todo tu historial de Windows.

## 3. Lo que queda a mano

- **Tareas programadas** (`maquina/tareas-programadas.csv`): conviértelas en `systemd.timers`; hay un ejemplo comentado en `nixos-migracion.nix`, incluido uno para un usuario de sistema `srvaccount`.
- **Comandos solo-Windows** en scripts/perfil (`Get-WmiObject`, `Get-Service`, rutas `C:\`, `.exe`): `comandos-frecuentes.txt` te dice cuáles importan más.
- **Programas**: recorre `programas.csv` y añade a `environment.systemPackages` lo que quieras (busca con `nix search nixpkgs <nombre>`).
- **Borra la exportación** de Windows, del USB y de NixOS al terminar: contiene contraseñas y llaves.
- No subas nunca la carpeta exportada a este repositorio (está en `.gitignore`).
