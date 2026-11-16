# Error 500 al publicar con Web Deploy

Si Visual Studio no puede publicar en un servidor IIS y devuelve `ERROR_COULD_NOT_CONNECT_TO_REMOTESVC` con `(500)`, revisa primero si un perfilador .NET (agente de monitoreo) se está cargando en el servicio WMSVC. Se resolvió en el nodo 01 de un clúster de alta disponibilidad aplicando el mismo ajuste que ya tenía el nodo 02.

_Última actualización: 2026-11-16_

## Síntoma

Al publicar desde Visual Studio (Web Deploy) aparece este error:

```
No se pudo conectar con el equipo remoto ("SERVIDOR") mediante el proceso especificado ("Servicio de administración web") porque el servidor no respondió.
ERROR_COULD_NOT_CONNECT_TO_REMOTESVC. Error en el servidor remoto: (500) Error interno del servidor.
```

En el log del servicio de administración (`C:\inetpub\logs\WMSvc`), la primera petición falla antes de enviar el usuario (`cs-username` vacío):

```
HEAD /msdeploy.axd site=NOMBRE_SITIO 8172 - IP_CLIENTE - - 500 0 0
```

Cómo distinguirlo de otros problemas:

| Lo que se ve | Qué significa |
| --- | --- |
| 500 en `/msdeploy.axd`, sin usuario | El servicio responde, pero falla al arrancar el handler: **este caso** |
| 401 / `ERROR_USER_UNAUTHORIZED` | Usuario o permisos en IIS |
| 404 en `/msdeploy.axd` | Falta el IIS Deployment Handler de Web Deploy |
| Tiempo agotado / no conecta | Firewall o WMSVC detenido (puerto 8172) |

La advertencia de certificado del navegador al abrir `https://SERVIDOR:8172/msdeploy.axd` es normal (certificado autofirmado) y no es la causa.

## Causa

El servidor tiene un perfilador .NET activo para toda la máquina (agente de monitoreo/APM). Ese perfilador también se carga en el servicio de publicación WMSVC y hace que `msdeploy.axd` devuelva 500.

- Se detecta en el Visor de eventos (Application, origen **.NET Runtime**): `The profiler was loaded successfully. Profiler CLSID: '{846F5F1C-F9AE-4B07-969E-05C26BC060D8}'`. Hasta donde sabemos, ese CLSID corresponde al tracer .NET de Datadog.
- El nodo que sí publicaba tenía WMSVC con las variables `COR_ENABLE_PROFILING=0` y `CORECLR_ENABLE_PROFILING=0`. El que fallaba no las tenía.
- La versión de Web Deploy (3.6 frente a 4.0), los archivos instalados y `administration.config` **no** eran la causa: se igualaron y el error seguía.

## Diagnóstico

Ejecuta estos comandos en PowerShell como administrador, en el servidor que falla y en uno que funciona, y compara los resultados.

1. Confirma que se puede llegar al puerto 8172 (desde la PC con Visual Studio):

   ```powershell
   Test-NetConnection SERVIDOR -Port 8172
   ```

2. Intenta publicar y revisa el log de WMSvc. Busca `500` en `/msdeploy.axd`:

   ```powershell
   Get-ChildItem "$env:SystemDrive\inetpub\logs\WMSvc" -Recurse -Filter *.log | Sort LastWriteTime | Select -Last 1 | Get-Content -Tail 20
   ```

3. Comprueba si hay un perfilador .NET cargándose en la máquina:

   ```powershell
   Get-WinEvent -LogName Application -MaxEvents 50 | Where { $_.ProviderName -eq '.NET Runtime' -and $_.Message -match 'profiler' } | Format-List TimeCreated, Message
   ```

4. Comprueba si WMSVC tiene el perfilador desactivado. Si no devuelve nada, falta el ajuste:

   ```powershell
   Get-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Services\WMSVC -Name Environment -ErrorAction SilentlyContinue | Select -Expand Environment
   ```

Si el paso 2 muestra el 500, el paso 3 muestra un perfilador y el paso 4 sale vacío, aplica la solución.

## Solución

Desactiva el perfilador solo para el servicio WMSVC. Los sitios web y su monitoreo no cambian.

**Importante:** si el paso 4 del diagnóstico devolvió algún valor, no ejecutes esto tal cual. Agrega las dos líneas a las que ya existen para no borrarlas.

```powershell
# 1. Respaldo
reg export HKLM\SYSTEM\CurrentControlSet\Services\WMSVC C:\wmsvc-backup.reg

# 2. Desactivar el perfilador en WMSVC
New-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Services\WMSVC -Name Environment -PropertyType MultiString -Value @('COR_ENABLE_PROFILING=0','CORECLR_ENABLE_PROFILING=0') -Force

# 3. Reiniciar el servicio
Restart-Service WMSVC
```

Después, vuelve a publicar desde Visual Studio.

Para revertir:

```powershell
reg import C:\wmsvc-backup.reg
Restart-Service WMSVC
```

Alternativa: configura el agente de monitoreo para que excluya `WMSvc.exe`. En Datadog se hace con la variable `DD_PROFILER_EXCLUDE_PROCESSES=WMSvc.exe`.

## Prevención

Revisa esta lista en cada servidor nuevo, después de reinstalar el agente de monitoreo o después de actualizar Web Deploy:

- [ ] Misma versión de Web Deploy en todos los nodos, instalada con la opción **Completa** (incluye IIS Deployment Handler)
- [ ] WMSVC en ejecución y con inicio automático
- [ ] `EnableRemoteManagement = 1` en `HKLM:\SOFTWARE\Microsoft\WebManagement\Server`
- [ ] Puerto 8172 abierto en el firewall
- [ ] WMSVC con `COR_ENABLE_PROFILING=0` y `CORECLR_ENABLE_PROFILING=0` si el servidor tiene un agente APM
- [ ] Perfil de publicación con `AllowUntrustedCertificate = true` y el nombre del sitio igual al de IIS en ese nodo
- [ ] Prueba de publicación desde Visual Studio en cada nodo del clúster
