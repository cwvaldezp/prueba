# Módulo de NixOS con lo necesario para lo que te traes de Windows.
# Cópialo a /etc/nixos/ y añádelo en configuration.nix:
#
#   imports = [ ./hardware-configuration.nix ./nixos-migracion.nix ];
#
# Luego:  sudo nixos-rebuild switch
{ config, pkgs, lib, ... }:

let
  # Cambia por tu usuario de NixOS
  usuario = "tu-usuario";
in
{
  nixpkgs.config.allowUnfree = true;   # vscode e insomnia no son software libre

  environment.systemPackages = with pkgs; [
    powershell        # pwsh: tus scripts .ps1 y tu historial
    keepassxc
    insomnia
    vscode            # o vscodium si prefieres la versión libre
    git
    openssh
    p7zip             # para abrir el .7z cifrado de la exportación
    unzip
    # Útiles al traducir comandos de Windows:
    dos2unix          # CRLF -> LF
    jq
    curl
    wget
    dig               # Resolve-DnsName / nslookup
    inetutils         # ping, telnet ...
    cifs-utils        # montar recursos compartidos de Windows (unidades de red)
    freerdp           # mstsc / escritorio remoto
  ];

  users.users.${usuario} = {
    isNormalUser = true;
    extraGroups = [ "wheel" "networkmanager" ];
    # pwsh como shell por defecto (opcional; bash sigue disponible):
    # shell = pkgs.powershell;
  };

  # Integración de KeePassXC con el navegador y como agente SSH:
  # actívalo en KeePassXC > Preferencias > Integración con navegador / Agente SSH.
  programs.ssh.startAgent = true;

  # Ejemplo: una tarea programada de Windows (tareas-programadas.csv) como timer de systemd.
  # Descomenta y adapta. Equivale a "ejecutar script.ps1 todos los días a las 02:00
  # como srvaccount".
  #
  # users.users.srvaccount = { isSystemUser = true; group = "srvaccount"; };
  # users.groups.srvaccount = { };
  # systemd.services.mi-tarea = {
  #   description = "Migrada desde el Programador de tareas de Windows";
  #   serviceConfig = {
  #     Type = "oneshot";
  #     User = "srvaccount";
  #     ExecStart = "${pkgs.powershell}/bin/pwsh -NoProfile -File /home/${usuario}/scripts-windows/srvaccount/Desktop/mi-script.ps1";
  #   };
  # };
  # systemd.timers.mi-tarea = {
  #   wantedBy = [ "timers.target" ];
  #   timerConfig = { OnCalendar = "*-*-* 02:00:00"; Persistent = true; };
  # };

  # Ejemplo: una unidad de red mapeada (unidades-red.csv), \\servidor\compartido -> /mnt/compartido
  # fileSystems."/mnt/compartido" = {
  #   device = "//servidor/compartido";
  #   fsType = "cifs";
  #   options = [ "credentials=/etc/nixos/smb-secrets" "uid=1000" "x-systemd.automount" "noauto" ];
  # };

  # Entradas de tu archivo hosts de Windows (maquina/hosts):
  # networking.extraHosts = ''
  #   10.0.0.5  servidor.interno
  # '';
}
