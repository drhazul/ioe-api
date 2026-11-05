# Contrato compartido de fechas IOE

Activación productiva completada el 5 de noviembre de 2026, CDMX, por autorización del titular. Reparación NC300007708, migración SQL, CT/SQL/API/App y cruce real de medianoche verificados. [Acta de activación, versiones, evidencia y reversa](ACTIVACION_CDMX_20261105.md). Las secciones de procedimiento conservan diseño y comandos de referencia; no volver a aplicar sobre postimágenes sin revisar estado.

## Causa demostrada

SQL estaba en UTC y `sp_cont_apply_adjustment` guardó GETDATE como datetime comercial. TypeORM 0.3.28 usa `useUTC=false`; el API productivo fija CDMX en main.js. Al leer 04/nov 18:39, Date/JSON generaban 05/nov 00:39Z. MB51 formateaba componentes UTC. El reloj absoluto de Proxmox estaba sincronizado; el defecto está en la semántica y transporte de fechas.

## Contrato

| Dato | SQL / API | Flutter |
|---|---|---|
| Calendario comercial CDMX | `BusinessDateTime`: ISO sin zona, p.ej. `2026-11-04T12:39:38.623` | `BusinessDateTime`, componentes de calendario; no `toLocal()` |
| Instante real / auditoría UTC | `SYSUTCDATETIME`, `UtcInstant`, ISO con Z al exponer un instante | `UtcInstant`, conserva epoch |
| Fecha calendario / filtro | `YYYY-MM-DD`, límites locales explícitos | `businessDateOnly`, sin serializar fecha como instante |

`src/common/time` es la implementación compartida. `runtime-clock.ts` se carga antes de AppModule, fija America/Mexico_City y rechaza TZ distinta. `database.module.ts` declara `useUTC=false` tanto en options como extra.options, conservando el comportamiento real del driver; no cambiar globalmente a true sobre históricos con semántica mixta.

`businessDateTime` acepta datetime SQL sin zona o Date hidratado por ese driver. Un texto con Z no se trata como reloj comercial. `businessFromInstant` convierte un instante real mediante IANA. `businessSqlDate` convierte entradas con offset explícito a CDMX y construye entradas sin zona por componentes. Los filtros MB51 evitan Date.parse de fecha sola y el tick .999 que SQL datetime redondea al día siguiente: usan límite inclusivo .997.

`BusinessTimeInterceptor` centraliza contratos por rutas comerciales registradas en `BUSINESS_RESPONSE_CONTRACTS`: PS, PV, órdenes, MB51, conteos, transferencias, mermas, sugeridos, recepciones, devoluciones a proveedor, factclientshp y caja. No convierte indiscriminadamente cualquier Date ni infiere UTC/comercial por un nombre global de columna. Auditoría FCNR y CREADO quedan fuera de la transformación comercial. Las fechas de PAC/CFDI no están incluidas en ese catálogo.

Para leer columnas UTC sin zona usando driver legacy, `utcSqlInstant` recupera instante desde sus componentes; no pasar ese Date hidratado a utcInstant directamente. AUDIT_LOG declara default SYSUTCDATETIME en entidad y migración. /health expone timestamp UTC, timeZone y businessDateTime del mismo instante para comparar contrato desplegado.

MB51 adapta también CRUD/search antes de responder y separa entidades internas de DTO serializado. Su SP/fallback proyecta FCND/FCNC como ISO 126 sin zona. PS y conteos usan el interceptor compartido. Entradas comerciales de folios/formas PV, ORD, tickets y referencias también usan businessSqlDate; fecha de entrega ORD se envía como calendario sin zona desde Flutter. Consecutivos NC/REP y fecha final predeterminada de consulta Facturify derivan día de fechaEnZona, evitando cortar un instante UTC como fecha comercial. Flutter comparte `lib/core/time/business_datetime.dart`; MB51/PS/conteos consumen el contrato explícito y sus vistas comerciales no convierten según zona del dispositivo. El DateTime UTC interno de BusinessDateTime es solo contenedor de componentes, no un instante; `businessCalendarIso` lo serializa sin Z. No persistirlo con toUtc/toLocal/toIso8601String directamente.

## Prevención transversal

`BusinessClockService` comprueba GETDATE contra SYSUTCDATETIME convertido a CDMX y exige CURRENT_TIMEZONE_ID de México, con tolerancia de dos segundos. Verifica durante OnModuleInit, antes del arranque de cron en OnApplicationBootstrap. `BusinessClockGuard` verifica POST/PUT/PATCH/DELETE de todos los módulos; reutiliza validación por cinco segundos y falla cerrado ante reloj inválido o SQL inaccesible. IOELOCAL y NODE_ENV=production siempre exigen esta verificación; el flag no permite desactivarla en producción. En desarrollo puede habilitarse con IOE_REQUIRE_CDMX_SQL_CLOCK=true.

La guardia evita aceptar operaciones HTTP en una configuración equivocada y bloquea arranque productivo antes de iniciar jobs. No sustituye disciplina de escritura en integraciones externas que se conecten directamente a SQL. El reloj SQL persistente y los procedimientos migrados protegen esas rutas de generación conocidas. Cada campo nuevo debe declarar su significado; no añadir otro parser local ni un ajuste fijo de seis horas.

## Migración SQL preparada

`sql/2026-11-04_horario_cdmx/clock.sql` define `dbo.fn_ioe_business_datetime(@InstantUtc)`, que usa zonas nombradas UTC → Central Standard Time (Mexico). No depende de TZ del proceso SQL. Capturar un instante por operación cuando sus sellos deban coincidir.

`patches.json` contiene 75 definiciones: 74 módulos con 146 referencias clasificadas de reloj (130 comerciales y 16 UTC para auditoría/metadata), más la proyección MB51. Incluye decisiones por línea, hash UTF-16 SQL antes/después y hash del artefacto. El inventario fresco contiene 112 módulos con relojes; los que ya tienen UTC/zona explícita permanecen intactos. Las modificaciones son de reloj/serialización, conservan firma y cuerpo funcional productivos. No reaplicar instaladores históricos que ejecutan backfills ajenos.

89 defaults se hacen explícitos: 86 conservan la base UTC observada en servidor UTC y tres campos documentales confirmados usan función comercial. Los defaults que ya tenían UTC o conversión México permanecen intactos. Conservar base UTC no afirma que todos esos campos sean auditoría: evita desplazarlos por cambiar TZ mientras sus consumidores mantienen contratos anteriores. No convertir históricos en bloque.

Ejecutar desde ioe-api, con entorno privado vigente. Nunca imprimir .env. El destino es obligatorio y no se toma DB_NAME del archivo:

```powershell
node scripts/migrate-business-clock.cjs --database IOELOCAL --mode preflight --output C:/ruta/privada/preflight
node scripts/migrate-business-clock.cjs --database IOEDESARROLLO --mode validate-schema --output C:/ruta/privada/ensayo
```

Preflight consulta; validate-schema compila DDL y prueba función dentro de una transacción que revierte. En IOEDESARROLLO pueden existir diferencias de versión y faltar SP; el ensayo no los deja instalados. No ejecuta ningún procedimiento de negocio.

Aplicación solo en ventana, con API/escritores detenidos, respaldo fresco verificado y preflight sin deriva:

```powershell
node scripts/migrate-business-clock.cjs --database IOELOCAL --mode apply --maintenance --output C:/ruta/privada/aplicacion
```

El runner conserva preimagen privada de DDL, revalida hashes en transacción, ejecuta cambios, comprueba postimágenes y no sobrescribe respaldos existentes. SQL Server canonicaliza CREATE OR ALTER como CREATE con espacios en sys.sql_modules; el manifiesto distingue hash de artefacto y hash de metadata, reproducido en ensayo.

Reversa preparada, sin ejecutar: detener escritores, recuperar configuración SQL/imagen coordinadas y usar `--mode rollback` con el mismo directorio de aplicación. Exige postimágenes sin deriva; no fuerza una reversa sobre cambios posteriores. Mantener hostname SQL al recrear para conservar identidad y guardas. La reversa DDL conserva datos comerciales y no revierte automáticamente la reparación histórica FCNC.

## Infraestructura y ventana

Imagen conjunta: `deploy/coolify/Dockerfile.production` incorpora tzdata, /etc/localtime, /etc/timezone y TZ CDMX; ambos servicios Compose declaran TZ. API declara guardia de reloj. El navegador recibe calendario comercial; TZ de Nginx no configura reloj del dispositivo.

SQL: `deploy/coolify/sql-timezone.compose.yaml` conserva imagen exacta CU25, hostname dd7842d7ba7e, usuario, volumen sqlserver_cu25_alignment_data, puerto local 1434 y red bridge. La conexión adicional ioe_ha se realiza antes de arrancar, con alias ioe-sql-standby. `prepare-sql-timezone.py` solo valida/captura configuración original y entorno en directorio privado 0700/archivos 0600, sin imprimir secretos ni detener Docker. El env_file raw evita interpolar contraseñas; requiere Compose >=2.30, CT observado usa 5.5.1. [Contrato Compose](https://docs.docker.com/reference/compose-file/services/#format).

Secuencia de referencia, ejecutada en ventana y documentada en acta de activación:

1. Integrar historias sin descartar cambios, commits de API/App y construir imagen conjunta localmente. Confirmar UAT de fuente pendiente ajena a fechas, bindings CFDI y estado de réplica/log shipping. No publicar funcionalidades DEV ONLY por efecto lateral.
2. Inventariar y congelar cron/timers externos que puedan escribir; registrar zona de su agenda. Cerrar acceso operativo y detener una sola API y front. Obtener respaldo fresco verificado, preflight DDL sin deriva y snapshot privado de configuración; el respaldo de la reparación no sustituye uno fresco de la ventana.
3. Aplicar DDL transaccional mientras SQL original conserva identidad. Ejecutar `prepare-sql-timezone.py --output /var/private/ioe-cdmx/ventana` en CT; validar config Compose con `config --quiet`, sin volcar entorno. No borrar ni copiar volumen SQL.
4. En CT105, `timedatectl set-timezone America/Mexico_City`; verificar epoch/Chrony del padre. No cambiar hora absoluta, NTP compartido ni CAP_SYS_TIME. CT no requiere reconstrucción. El host Proxmox puede conservar UTC para sus agendas.
5. Detener SQL, renombrar contenedor original como reversa y desconectarlo de ioe_ha para evitar alias duplicado. Con SQL_PRIVATE_ENV apuntando al archivo privado, `docker compose -p ioe-sql-cdmx -f sql-timezone.compose.yaml create`; después `docker network connect --alias ioe-sql-standby ioe_ha sqlserver-cu25-alignment`; luego `docker compose ... start`. Conservar viejo contenedor detenido y su configuración, sin dos escritores al mismo volumen.
6. Verificar volumen, digest, hostname, redes/alias, IOELOCAL ONLINE, GETDATE México y SYSUTCDATETIME UTC. FEDERADA/.40:1433 y réplica mantienen su destino; no restaurar otra base sobre principal. Si falla, detener candidato, devolver nombre/red al original y recuperar TZ/DDL según preimagen antes de abrir API.
7. Transferir/activar imagen conjunta API/App por flujo vigente; verificar ambas versiones, /health/db, web/proxy, CFDI externo y workers únicos. Ejecutar UAT de venta/PS, conteo nuevo y sus MB51, recepción, merma y transferencia; comparar calendario de pantalla, filtros/exportación y SQL con dispositivo en otra zona.
8. Reanudar timers con agenda revisada y vigilar cruce UTC, medianoche CDMX, persistencia tras recreación y siguiente corte. No cambiar reloj productivo para simular límites.

## Reparación productiva independiente

Autorización del titular: “integra correcion general para la aplicacion y correcion de registros”. En IOELOCAL/dd7842d7ba7e se normalizó solo FCNC de 15 filas NC300007708: 04/nov/2026 18:39:38.623 UTC sin zona → 04/nov/2026 12:39:38.623 CDMX. Conteo correcto BIOFINITY-TORICO-EJE180-04-NOV, DF01.

Respaldo COPY_ONLY, CHECKSUM, COMPRESSION y RESTORE VERIFYONLY completados; preimagen `dbo.IOE_BKP_MB51_NC300007708_TZ_20261104`, 15 filas. Preflight fresco 15/15 hashes; transacción y guardas de invariantes pasaron. CTDA -19, CTOT -7675.32; 16 filas NC300007707 conservan hash completo. No se ejecutó ajuste de inventario ni se actualizaron stock/cabecera/log/auditoría. FCND conserva valor anterior conforme al alcance aprobado. Su representación comercial quedará sin falsa Z al desplegar contrato compartido.

Evidencia privada fuera de Git: `outputs/fecha_inventarios_20261104/NC300007708/resultado_aplicacion.json`, `postflight_aplicacion.json`, `backup_fresco_verificado.json`, `gate_contrato_aplicacion.json`; plan/seguimiento del workspace en `docs/planes_horarios_cdmx_20261104`. La reversa de datos es el script 03 de ese expediente y exige postimagen intacta.

## Validación final de esta integración

API: npm run build correcto, 445 pruebas en 67 suites. Flutter: analyze sin incidencias y 36 pruebas correctas, incluida fecha elegida de ORD. SQL: ensayo de 75 módulos/89 defaults revertido y postflight confirma restauración de definiciones originales; preflight productivo sin deriva. Compose de ambos servicios y SQL validado; configuración viva SQL coincide con candidato. Guardia nueva probada mediante SELECT contra SQL productivo UTC: devuelve bloqueo 503 esperado, sin arrancar API ni activar código. Lectura TypeORM posterior a reparación confirmó 15 FCNC 04/nov 12:39:38.623, JSON actual 04/nov 18:39:38.623Z. No hubo UAT visual: hot reload intentado, sin app DTD conectada. Imagen conjunta no construida/publicada todavía; activación y UAT corresponden a mantenimiento.

## Cierre productivo

Estado vigente y límites en [ACTIVACION_CDMX_20261105.md](ACTIVACION_CDMX_20261105.md). Prevención activa; 75 módulos/89 defaults en AFTER, CT/SQL/API/front CDMX y 34 muestras de medianoche correctas. Cierre final validado con 448 pruebas API y 36 Flutter; notas de integración local anteriores quedan como evidencia de esa fase, no como estado actual.
