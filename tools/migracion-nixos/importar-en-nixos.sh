#!/usr/bin/env bash
# Coloca en su sitio (en NixOS) lo exportado por Exportar-Windows.ps1.
#
# Uso:
#   ./importar-en-nixos.sh /ruta/a/migracion-nixos-AAAAMMDD-HHMM  [usuario-windows]
#
# usuario-windows: de qué usuario de Windows tomar VS Code / KeePassXC / Insomnia
# (por defecto el primero que encuentre). El historial de PowerShell se fusiona
# de TODOS los usuarios exportados.
#
# No borra nada: si un archivo de destino ya existe, lo respalda como *.antes-migracion.
set -euo pipefail

ORIGEN="${1:?Indica la carpeta descomprimida de la exportación}"
[ -d "$ORIGEN/usuarios" ] || { echo "No encuentro $ORIGEN/usuarios" >&2; exit 1; }
USUARIO_WIN="${2:-$(ls "$ORIGEN/usuarios" | head -n1)}"
U="$ORIGEN/usuarios/$USUARIO_WIN"
echo "==> Usando configuración de: $USUARIO_WIN"

respaldar() { [ -e "$1" ] && [ ! -e "$1.antes-migracion" ] && cp -a "$1" "$1.antes-migracion" || true; }
poner() { # poner ORIGEN DESTINO
  [ -e "$1" ] || return 0
  mkdir -p "$(dirname "$2")"; respaldar "$2"
  cp -a "$1" "$2"; echo "    $2"
}
# Convierte CRLF de Windows a LF
a_unix() { sed -i 's/\r$//' "$@" 2>/dev/null || true; }

# --- PowerShell (pwsh) --------------------------------------------------------
echo "==> PowerShell"
PS_CFG="$HOME/.config/powershell"
PS_HIST="$HOME/.local/share/powershell/PSReadLine/ConsoleHost_history.txt"
mkdir -p "$PS_CFG" "$(dirname "$PS_HIST")"
respaldar "$PS_HIST"
# Fusiona todos los historiales (todos los usuarios y hosts), sin duplicados, conservando orden
{ [ -f "$PS_HIST" ] && cat "$PS_HIST"
  find "$ORIGEN/usuarios" -path '*powershell/historial/*' -name '*.txt' -print0 | xargs -0 -r cat
} | sed 's/\r$//' | awk 'NF && !seen[$0]++' > "$PS_HIST.nuevo"
mv "$PS_HIST.nuevo" "$PS_HIST"
echo "    $PS_HIST ($(wc -l < "$PS_HIST") comandos)"

# Perfil: PowerShell 7 primero; si no, el de Windows PowerShell 5.1
for sub in PowerShell WindowsPowerShell; do
  for f in Microsoft.PowerShell_profile.ps1 profile.ps1; do
    if [ -f "$U/powershell/perfiles/$sub/$f" ] && [ ! -e "$PS_CFG/$f.importado" ]; then
      poner "$U/powershell/perfiles/$sub/$f" "$PS_CFG/$f"; a_unix "$PS_CFG/$f"; touch "$PS_CFG/$f.importado"
    fi
  done
done
echo "    (revisa el perfil: rutas C:\\..., alias de Windows y módulos solo-Windows no funcionarán)"

# --- Scripts --------------------------------------------------------------------
echo "==> Scripts -> ~/scripts-windows/"
for d in "$ORIGEN"/usuarios/*/; do
  n=$(basename "$d")
  [ -d "$d/scripts" ] && mkdir -p "$HOME/scripts-windows/$n" && cp -a "$d/scripts/." "$HOME/scripts-windows/$n/"
done
[ -d "$ORIGEN/maquina/carpetas-extra" ] && mkdir -p "$HOME/scripts-windows/_extra" && cp -a "$ORIGEN/maquina/carpetas-extra/." "$HOME/scripts-windows/_extra/"
find "$HOME/scripts-windows" -type f \( -name '*.sh' -o -name '*.py' -o -name '*.ps1' -o -name '*.psm1' \) -exec sed -i 's/\r$//' {} + 2>/dev/null || true
find "$HOME/scripts-windows" -type f \( -name '*.sh' -o -name '*.py' -o -name '*.ps1' \) -exec chmod +x {} + 2>/dev/null || true

# --- VS Code --------------------------------------------------------------------
echo "==> VS Code"
VS_SRC="$U/vscode/Code"
VS_DST="$HOME/.config/Code/User"
if [ -d "$VS_SRC" ]; then
  for f in settings.json keybindings.json tasks.json launch.json mcp.json; do poner "$VS_SRC/$f" "$VS_DST/$f"; done
  for d in snippets profiles prompts; do
    [ -d "$VS_SRC/$d" ] && mkdir -p "$VS_DST/$d" && cp -a "$VS_SRC/$d/." "$VS_DST/$d/" && echo "    $VS_DST/$d/"
  done
  # Avisar de rutas de Windows dentro de settings.json
  grep -nE '[A-Za-z]:\\\\|\.exe"' "$VS_DST/settings.json" 2>/dev/null | sed 's/^/    revisar settings.json:/' || true
fi
EXT="$U/vscode/extensiones.txt"
if [ -f "$EXT" ]; then
  CODE_BIN="$(command -v code || command -v codium || true)"
  if [ -n "$CODE_BIN" ]; then
    sed 's/\r$//' "$EXT" | while read -r ext; do
      [ -n "$ext" ] && "$CODE_BIN" --install-extension "$ext" --force >/dev/null 2>&1 \
        && echo "    + $ext" || echo "    x $ext (instálala a mano o vía Nix)"
    done
  else
    echo "    'code' no está en PATH; lista en $EXT"
  fi
fi

# --- KeePassXC ------------------------------------------------------------------
echo "==> KeePassXC -> ~/Documentos/KeePassXC/"
if [ -d "$U/keepassxc/bases" ]; then
  mkdir -p "$HOME/Documentos/KeePassXC"
  cp -a --update=none "$U/keepassxc/bases/." "$HOME/Documentos/KeePassXC/"
  chmod 600 "$HOME"/Documentos/KeePassXC/* 2>/dev/null || true
  ls -1 "$HOME/Documentos/KeePassXC" | sed 's/^/    /'
  echo "    El keepassxc.ini de Windows NO se copia (rutas C:\\); ábrelas desde KeePassXC y ajusta Preferencias."
fi

# --- Insomnia -------------------------------------------------------------------
echo "==> Insomnia"
if [ -d "$U/insomnia" ]; then
  INS_SRC="$(find "$U/insomnia" -mindepth 1 -maxdepth 1 -type d | head -n1)"
  INS_DST="$HOME/.config/Insomnia"
  if pgrep -x insomnia >/dev/null 2>&1; then
    echo "    Cierra Insomnia y vuelve a ejecutar para copiar sus datos."
  elif [ -n "$INS_SRC" ]; then
    respaldar "$INS_DST"
    mkdir -p "$INS_DST"; cp -a "$INS_SRC/." "$INS_DST/"
    echo "    $INS_DST  (si no aparecen tus colecciones, usa Import con el JSON/YAML exportado desde la app)"
  fi
fi

# --- dotfiles -------------------------------------------------------------------
echo "==> dotfiles"
poner "$U/dotfiles/.gitconfig" "$HOME/.gitconfig" && a_unix "$HOME/.gitconfig"
if [ -d "$U/dotfiles/.ssh" ]; then
  mkdir -p "$HOME/.ssh"; cp -a --update=none "$U/dotfiles/.ssh/." "$HOME/.ssh/"
  a_unix "$HOME"/.ssh/config "$HOME"/.ssh/known_hosts 2>/dev/null || true
  chmod 700 "$HOME/.ssh"; find "$HOME/.ssh" -type f -exec chmod 600 {} +
  find "$HOME/.ssh" -name '*.pub' -exec chmod 644 {} +
  echo "    ~/.ssh (permisos ajustados)"
fi
for d in .aws .azure .kube .docker; do
  [ -d "$U/dotfiles/$d" ] && mkdir -p "$HOME/$d" && cp -a --update=none "$U/dotfiles/$d/." "$HOME/$d/" && echo "    ~/$d"
done

echo
echo "Listo. Pendiente manual:"
echo "  - $ORIGEN/comandos-frecuentes.txt : comandos que más usas (para buscar equivalentes)"
echo "  - $ORIGEN/maquina/tareas-programadas.csv : pasarlas a systemd.timers en configuration.nix"
echo "  - $ORIGEN/maquina/programas.csv / winget.json : para tu lista de environment.systemPackages"
echo "  - $ORIGEN/AVISOS.txt"
echo "  - Borra la exportación cuando termines (tiene secretos):  rm -rf \"$ORIGEN\""
