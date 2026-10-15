# Coolify: fuente de despliegue IOE

## Integración productiva API + Flutter Web — 2026-10-15

Esta integración deja fuente reproducible para reconstruir API y front juntos. El release del 2026-10-15 quedó activo en Coolify con API `17feeb19a776704adcdf457fa8ce5831730651c3`, App `5163f2fbbfc64d8f5c556bde825bda21bfeccf0d` e imagen `ioe-allinone:production-17feeb19a776-5163f2fbbfc6` (`sha256:a69914372cf624a04824a45516051929026ef9a648666767450d78f4e7d735f4`).

### Contrato de base de datos y red

- `production.compose.yaml` contiene solo `erp-api` y `standby-front`; no crea ni modifica SQL Server.
- API y front comparten red privada Coolify; solo API se conecta además a `ioe_ha`.
- API mantiene `DB_HOST=ioe-sql-standby`, `DB_PORT=1433` y `DB_NAME=IOELOCAL`. Alias `ioe-sql-standby` apunta a instancia IOELOCAL CU25 en `.40`; conservar alias mientras recurso use `ioe_ha`.
- No confundir endpoints homónimos: `ioe-sql-standby:1433` dentro de red Docker `ioe_ha` es IOELOCAL; host `.40:1433` llega a instancia FEDERADA distinta. Ambas instancias permanecen separadas aunque SQL escuche `1433` dentro de cada contenedor.
- FEDERADA sigue en instancia SQL separada. `.40:1433` continúa fuera de este Compose y no cambia. SQL IOELOCAL conserva Docker bind `127.0.0.1:1434`; además, socket systemd del host escucha en `172.16.100.40:1434` y reenvía TCP a ese bind. SSMS entra directo a `172.16.100.40,1434`, sin túnel SSH local. ACL nftables limita ese listener al gateway VPN `.2`; SQL conserva autenticación propia. API tampoco depende de este listener: usa `ioe_ha`/`ioe-sql-standby:1433`. Cualquier puerto futuro requiere publicación explícita e independiente; esta app Compose no administra puertos SQL.
- Solo una API productiva: `ScheduleModule` inicia cron/workers al arrancar. No levantar candidato en red productiva para validar ni permitir réplicas en paralelo.
- Front publica solo `172.16.100.40:18085`; Nginx entrega Flutter y envía `/api/*` al API. Nginx config ahora vive en Git/imágen, no en bind mount sin versionar.

### Persistencia y secretos

- Mantener `/srv/ioe/erp/uploads` → `/srv/api/uploads` sin cambiar propietario ni contenido.
- Mantener `/ArchivosUsuarios/respaldoCFDI` en API. En host debe seguir montado por SMB desde almacenamiento persistente `.234`; no guardar respaldos CFDI en disco de `.40`, no quitar túnel SMB ni cambiar origen durante este cambio.
- Compose usa `bind.create_host_path: false`, pero eso solo evita crear rutas ausentes. **Antes de recrear API**, validar en Proxmox que `findmnt -T /mnt/ioe-cfdi234` siga mostrando el CIFS esperado de `.234`, que el bind hacia CT `.40` llegue a `/ArchivosUsuarios/respaldoCFDI`, y que un CFDI existente sea visible desde `.40`. No arrancar si la cadena SMB/bind está caída: el directorio local vacío de `.40` no reemplaza almacenamiento persistente.
- `api.production.env` contiene variables privadas del API en el directorio del recurso Coolify; mantenerlo fuera de Git con modo `0600`. `production.compose.yaml` lo carga como `env_file`. `IOE_IMAGE` y `COOLIFY_APP_NETWORK` son valores no secretos del `.env` del recurso; nunca copiar valores secretos a YAML, commits, logs ni build args. Destino DB se fija en Compose, no se toma del entorno.
- Dockerfile usa Node 24 LTS para API build/runtime; Node 20 terminó soporte el 2026-03-24. Tras compilar, elimina dependencias de desarrollo del runtime. El candidato conjunto ejecuta compilación API y Flutter Web antes de activación; no mezclar el cambio de runtime con cambios de red/DB.

### Construcción y activación

1. Revisar y cerrar todos los cambios pendientes en `ioe-api` e `ioe_app`; crear commits coordinados conforme a instrucciones de workspace.
2. Preparar checkouts limpios de ambos commits. Ejecutar `build-production-image.sh` con `API_REPO_DIR`, `APP_REPO_DIR`, `EXPECTED_API_SHA` y `EXPECTED_APP_SHA`. Script rechaza cambios sin commit, SHAs distintos, rutas CRM retiradas y archivos de secreto/respaldo; crea tag `ioe-allinone:production-<API>-<App>` y reporta image ID. No inicia servicios ni mueve tag `primary`; no reutilizar tag existente.
3. En `.env` del recurso Coolify, establecer `IOE_IMAGE` al tag candidato y `COOLIFY_APP_NETWORK` al nombre de red vigente (`tysuzjl0xcdbhfje49pbcqyg` al observar runtime). Conservar `api.production.env` privado, existente y con modo `0600`; no volcar sus valores. Registrar image ID.
4. Activar únicamente en ventana coordinada. Compose reemplaza una API y un front en conjunto; no asumir actualización sin interrupción. Health de API consulta DB con `SELECT 1`; `depends_on` espera API saludable antes de arrancar front.
5. Postflight: confirmar `DB_NAME()=IOELOCAL`, instancia ONLINE, front/API y proxy; comprobar `.40:1433` continúa hacia FEDERADA, el socket `.40:1434` filtra por gateway VPN y llega al bind local `127.0.0.1:1434`, SMB CFDI sigue en `.234`, y envío de logs `.40`→`.234` sigue con LSN/timers sanos. Completar UAT autenticada. Rollback ordinario vuelve a tag/config previos sin recuperar `.234` ni cambiar escritor SQL.

La sintaxis Compose se valida con variables ficticias y el script construye una imagen candidata sin iniciar servicios. Este cambio de fuente no cambia firewall, Docker runtime, servicios, instancias DB, backups, Nginx `.3` ni DNS.

### Ejecución del release — 2026-10-15

- El Compose activo del recurso conserva nombres/etiquetas Coolify, redes, puerto `18085`, uploads y bind CFDI. La configuración de ejecución coincide con `production.compose.yaml`; `api.production.env` sigue privado con modo `0600`.
- API y front quedaron `healthy`. `/` y `/api/health/db` respondieron `200` localmente y por `erp.ioebusiness.com.mx`; consulta read-only confirmó `DB_NAME()=IOELOCAL` y `ONLINE`. Runtime API confirmó Node `v24.22.0`.
- CFDI se validó en Proxmox como CIFS desde `.234`, bind a CT `105` y lectura desde API. Timers de log shipping inverso y verificación de rol siguen activos. Puertos `.40:1433` y `.40:1434` conservaron conectividad TCP.
- Corrección PV: el API calcula hora de operación desde UTC con `AT TIME ZONE 'Central Standard Time (Mexico)'`, sin depender de zona del proceso SQL; la pantalla muestra el error API específico. No hubo migración SQL ni reintento de devolución. UAT autenticada del flujo queda pendiente.
- El build reportó `0` críticas, `16` altas, `14` moderadas y `2` bajas tras actualizar `proxy-addr`; no se aplicó actualización amplia de dependencias.
- Se conservó imagen anterior `ioe-allinone:primary-20261015` y copia previa de Compose para rollback. No se podaron imágenes ni volúmenes.

El listener SSMS es configuración de host separada del Compose. Fue activado el 2026-10-15 sin reiniciar SQL ni API; la ruta TCP y el health de API/DB respondieron. La estación aparece en `.40` detrás del gateway VPN `172.16.100.2`; el firewall de `.40` limita a ese origen. Para limitar por cliente individual, aplicar ACL en el gateway antes de su NAT.

### Integración del front

`ioe_app` se compila como Flutter Web dentro de la imagen conjunta con `API_BASE_URL_WEB=/api`; Nginx reenvía `/api/` a servicio `erp-api:3001`. El navegador no se conecta directamente a SQL. El fallback de releases móviles es independiente y no cambia en este rebuild.

---

# Coolify: front standby privado (registro histórico)

## Documentos públicos y enlaces UI — 2026-10-13

App b8ff8e3 agrega LegalLinks a Home/Login y HTML estático web/legal. API 3d9b9dc
versiona contenido aprobado del operador JOEL JIMENEZ CRUZ. Coolify construye
desde GitHub; /legal/ del vhost TLS .3 se enruta a .40:18085 con fragmento
legal-proxy-location.conf. ERP/API conserva upstream .2:8085 hacia .234.
Respaldo de vhost en .3: erp.ioebusiness.com.mx.conf.before-legal-20261013.
nginx -t PASS, reload aplicado, tres páginas públicas HTML HTTP 200.

El frontend compilado por Coolify se incorporó también a imagen runtime .234,
con API previa y configuración privada preservadas. Imagen legal-20261013:
sha256:9af55e7043f773c7727ec7bd7b3f3da28dc7dad00a12fdc0101cccd22e581c7b.
Archive del frontend transferido sin secretos y con SHA256 verificado;
rollback detenido ioe-before-legal-20261013. Login público inspeccionado:
ambos enlaces visibles sin autenticación. Home tiene mismo componente; su
validación visual autenticada queda pendiente. Flutter analyze limpio y
20 tests PASS. No se activó API/worker de Coolify.

`standby-front.compose.yaml` inicia solo Nginx/Flutter. No inicia API, jobs ni conexiones SQL. La imagen antigua enviada desde `.234` intentaba enviar `/api/` a `127.0.0.1:3001` dentro del contenedor; la imagen automática responde `503` para dejar explícito que API standby está inactiva. Este recurso sirve únicamente para comprobar front estático en sombra.

La imagen previa `ioe-allinone:master-crm-retired-20261007` se importó al Docker de `ioevps` como punto de retorno. Imagen de origen: `192.168.10.234`, ID `sha256:dc7440ee7c2e0212802720c91e6d5635aee78d0aef10fabc760f3542bfbf1047`, HEAD de build API `4f501807e6271b6e8441ba4885799ad2d53624d8` y App `463a3c1f6c739e8e89b9ff2921c06dd3f34789d1`. Tras `docker save`/`docker load`, el almacén OCI de Docker 29 en `.40` presenta ID `sha256:4dc2ef1fd07b08100187aadfc68520e0396fd93f70c484f882bee85d996b894d`; configuración e índice de 13 capas coinciden por SHA-256 con origen.

Crear recurso **Docker Compose Empty** en proyecto `IOE Standby`, entorno `standby`, con el YAML de este directorio. Revisar Compose desplegable de Coolify antes de arrancar. El puerto `18085` debe quedar ligado solo a `127.0.0.1`. Probar por SSH con `ssh -L 18085:127.0.0.1:18085 root@172.16.100.40` y abrir `http://127.0.0.1:18085`.

## Actualización desde ambos repositorios

El recurso existente usa `ioe-allinone:standby-auto` en Docker local de `.40`. `ioe-standby-auto.timer` revisa cada cinco minutos `master` de `https://github.com/drhazul/ioe-api.git` y `https://github.com/drhazul/ioe_app.git`. Si cambia cualquiera, `standby-auto-update.sh` descarga ambos HEAD, construye una imagen conjunta con `Dockerfile.standby-auto` y recrea solo `standby-front` con el Compose generado por Coolify. El API queda compilado en la imagen, pero el `entrypoint` inicia exclusivamente Nginx. La ruta `/api/` responde 503 en este preview privado. Nunca iniciar el API standby mediante este timer.

`assets/.env` rastreado por Git queda fuera del build Docker; durante compilación se crea únicamente `API_BASE_URL_WEB=/api` y `API_BASE_URL` vacío. Otros `.env`, claves, `.git`, `node_modules` y salidas de build también se excluyen. El script bloquea rutas del CRM retirado y despliegue si cambian UUID, imagen, puertos, mounts o entrypoint de Compose. Si falla build no mueve etiqueta activa; si health/HTTP del front nuevo falla restaura la imagen anterior. No borra volúmenes ni imágenes antiguas.

Instalación en `.40`: copiar Dockerfile, Nginx, `.dockerignore` y script a `/opt/ioe-coolify-auto/` (directorio `0700`); copiar unidades a `/etc/systemd/system/`; dar `0700` al script; ejecutar `systemctl daemon-reload`. Antes de activar timer, etiquetar imagen previa como `ioe-allinone:standby-auto`, guardar Compose fuente con esa etiqueta y ejecutar una vez `systemctl start ioe-standby-auto.service`. Tras comprobar salud, `systemctl enable --now ioe-standby-auto.timer`.

Operación: `systemctl status ioe-standby-auto.timer`, `journalctl -u ioe-standby-auto.service -n 100 --no-pager`, y `cat /var/lib/ioe-coolify-auto/active-heads` muestran temporizador, último build y SHA de API/App. `systemctl stop ioe-standby-auto.timer` pausa futuros cambios; para retorno manual, etiquetar `ioe-allinone:standby-previous` como `ioe-allinone:standby-auto` y recrear solo `standby-front` con el Compose de Coolify. El reinicio automático directo por Compose aparece en systemd/Docker, no en historial de despliegues Coolify. No publicar panel para usar webhooks GitHub; el sondeo es saliente y privado.

Conservar `ioe-standby-front` anterior en `127.0.0.1:8085` hasta validar el recurso. No arrancar `ioe-standby-api` mientras `IOELOCAL` destino esté `RESTORING`. Estado posterior: dominio público `erp.ioebusiness.com.mx` ya no apunta a este preview; Nginx `.3` enruta producción a HAProxy `.2:8085` y build conjunto `.234:8085`. El preview `.40` permanece privado. Ver plan y seguimiento en raíz `docs/COOLIFY_*.md`.
