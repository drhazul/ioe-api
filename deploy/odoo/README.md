# Odoo 19 para IOE: base de despliegue

Estado al 2026-10-21: proyecto y servicio `Odoo IOE Piloto` desplegados mediante Coolify en CT105. Base `ioe_odoo_pilot` inicializada con `base`, `account` y `l10n_mx`; empresa en México; catálogo disponible y cero movimientos contables. Administrador nuevo verificado, PostgreSQL saludable, Odoo y pgAdmin responden HTTP 200. Gestor público de bases deshabilitado. DNS A `odoo.ioebusiness.com.mx` → `74.208.174.229` publicado; certificado TLS y proxy HTTPS activos. Página de acceso pública verificada. Sin clave API ni sincronización comercial.

## Alcance

- Odoo, PostgreSQL y pgAdmin como servicios Docker distintos en CT105 administrado por Coolify.
- PostgreSQL sin puerto publicado. Odoo en `172.16.100.40:18069` para proxy privado CT `.3`; pgAdmin solo en `127.0.0.1:15050`.
- Volúmenes persistentes separados para PostgreSQL, filestore Odoo y pgAdmin.
- La imagen oficial `odoo:19.0` es Community. `account` y `l10n_mx` ya están instalados en el piloto. El titular reporta que ya tiene licencia; falta verificar estado `In Progress`, destino de la suscripción y acceso a módulos Enterprise 19.0. Enterprise/EDI siguen ausentes en CT105.
- Credenciales reales solo en archivos privados del CT montados como Docker secrets. La contraseña compartida previamente en chat no debe reutilizarse.

## Preflight pendiente

1. CT105 confirmado por titular como `172.16.100.40` (`ioevps`, Debian 12, SSH root); Docker/Coolify funcionan. Verificar su ID Proxmox desde host si se necesita operar sobre CT.
2. CT105 ya aloja IOE y dos SQL Server. Medición inicial: 16 GiB RAM total, 7.2 GiB disponible y 56 GiB libres en raíz. Definir cuota/capacidad y backup externo antes de añadir Odoo productivo.
3. Titular reporta licencia disponible. Verificar estado `In Progress`, cobertura on-premise/API y si está asignada a Odoo Online o CT105. No instalar módulos Enterprise hasta tener fuente oficial y restauración probada.
4. IOE usa proxy HTTPS externo en CT `.3`; Odoo escucha en `172.16.100.40:18069`. Vhost dedicado `odoo.ioebusiness.com.mx` instalado en `.3`, con HTTP→HTTPS, certificado Let's Encrypt propio y proxy hacia Odoo; `proxy_mode = True`. `nginx -t` y recarga gradual pasaron. DNS autoritativo `ns94`/`ns95` y Google 8.8.8.8 resolvieron `74.208.174.229`; Cloudflare 1.1.1.1 y el resolvedor local aún mostraron NXDOMAIN intermitente. Navegador interno cargó la página HTTPS. Vhost `erp` no se modificó.
5. Host `.40` presenta `/ArchivosUsuarios/respaldoCFDI` por CIFS desde `//127.0.0.1/IOE_CFDI`, modo RW para IOE; `.234:445` no respondió en prueba TCP directa. Verificar origen final y permiso de solo lectura desde **contenedor integrador**. No montar SMB directamente en contenedor Odoo ni escribir CFDI originales.

## Puesta en marcha

1. Hecho: contraseñas nuevas y diferentes en archivos modo `0600` bajo `/root/ioe_odoo_pilot/secrets` en CT105. Archivos legibles por UID de imagen (`odoo` 100, `pgadmin` 5050); directorio privado `0700`. `compose.yaml` monta secretos PostgreSQL y pgAdmin sin copiarlos a Git ni a variables visibles en Compose.
2. Hecho: `odoo.conf` privado con clave maestra única y permiso `0600`. La clave maestra gestiona bases; usuario administrador de UI se crea aparte.
3. Hecho: `/root/ioe_odoo_pilot/compose.yaml` validado con `docker compose -f /root/ioe_odoo_pilot/compose.yaml config --quiet`. La validación no arrancó contenedores.
4. Hecho: servicio Coolify `odoo-ioe-piloto` (UUID `va0fcfaqujzb3vpgxlhziy7x`) desplegado. PostgreSQL saludable, Odoo `/web/login` HTTP 200 desde `.3` por IP privada y pgAdmin `/login` HTTP 200 por loopback. Reinicio controlado y persistencia de la base inicializada comprobados.
5. Hecho: se publicó en HostGator el A `odoo` → `74.208.174.229`, TTL 300. Certificado Let's Encrypt emitido con renovación programada; proxy HTTPS en `.3` validado con `nginx -t` y recarga gradual. `https://odoo.ioebusiness.com.mx/web/login` responde HTTP 200 y HTTP redirige a HTTPS. Resolver público Google y ambos autoritativos responden; Cloudflare y resolver local conservan NXDOMAIN intermitente.
6. Hecho: base `ioe_odoo_pilot` inicializada sin datos demo, administrador UI con contraseña aleatoria privada en `/root/ioe_odoo_pilot/secrets/odoo_ui_admin_password`; autenticación comprobada. `db_name`, `dbfilter` y `list_db = False` fijados en `odoo.conf`; el gestor responde que fue deshabilitado. País México fijado por ORM; `account` y `l10n_mx` instalados. Verificado: 148 cuentas, 33 impuestos, 8 diarios y 0 movimientos contables. `l10n_mx_edi` y `l10n_mx_reports` no están disponibles en esta imagen Community.
7. Registrar servidor PostgreSQL `db:5432` en pgAdmin desde su UI. Acceso pgAdmin por túnel autenticado, sin DNS público.
8. Hecho antes de instalar Contabilidad: dump PostgreSQL y filestore creados en `/root/ioe_odoo_pilot/backups/` (`ioe_odoo_pilot_mx_pre_modules_20261021.dump`, `ioe_odoo_pilot_mx_filestore_pre_modules_20261021.tar`), permisos `0600`; `pg_restore --list` y listado tar pasaron desde el contenedor. Restauración aún no probada. No considerar snapshot Docker/CT como único respaldo.
9. Integrar IOE por API de Odoo: usuario bot, clave, prueba solo lectura, luego piloto CFDI en borrador. Ningún movimiento contable automático sin mapeo aprobado.

Prueba de API: ejecutar desde `ioe-api` con `node deploy/odoo/probe-json2.mjs`. El script lee solo `API_ODOO`, `ODOO_URL` y `ODOO_DATABASE` desde el `.env` privado del repositorio; por defecto apunta a `https://ioeb.odoo.com`. También acepta `ODOO_API_KEY` y `ODOO_URL` en el entorno del proceso. Consulta únicamente el ID de una empresa; no escribe ni imprime contenido de la respuesta. No pasar claves en la línea de comandos. Requiere JSON-2 habilitado por el plan Odoo.

Preflight API 2026-10-21: desde el contenedor `erp-api` de IOE, `GET /web/login` a `http://172.16.100.40:18069` respondió HTTP 200; `POST /json/2/res.partner/search_read` sin clave respondió HTTP 401. El 2026-10-21 se repitió el POST sin credenciales por HTTPS público válido y volvió HTTP 401. Esto confirma ruta y transporte TLS, no valida una clave ni autoriza lectura. No enviar API keys ni datos fiscales por HTTP. Titular indica que seleccionará plan Custom durante la prueba; verificar activación y cobertura antes de crear una clave para un bot con permisos mínimos. Mantener piloto de ventas como borrador y sin asientos hasta aprobar mapeo contable.

## Red de integración

- Navegador e IOE API hacia Odoo por HTTPS. PostgreSQL permanece en red Docker.
- `192.168.10.234:445` proporciona XML/PDF por SMB según ruta efectiva de IOE; consumidor dedicado de solo lectura, identidad mínima, sin duplicar almacenamiento fiscal.
- Acceso a SQL Server IOE no forma parte del requisito SMB; solo si un contrato de datos aprobado lo requiere.

Referencias: https://hub.docker.com/_/odoo/ y https://www.odoo.com/documentation/19.0/developer/reference/external_api.html

## Cambio a Enterprise

El preflight de CT105 confirma Odoo 19 Community; el corte a Enterprise sigue pendiente de suscripción Custom activa, acceso autorizado a Enterprise 19.0 y restauración de respaldo probada. Ver [ENTERPRISE-CT105.md](ENTERPRISE-CT105.md) para puertas, procedimiento de copia aislada, reversa y responsables. No registrar código ni instalar módulos mientras falten esas condiciones.
