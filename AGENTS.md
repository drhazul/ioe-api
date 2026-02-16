# Instrucciones de agente para ioe-api

## Contexto del proyecto
- Backend API en NestJS (TypeScript) para el sistema IOE.
- Arquitectura modular por feature (`controller -> service -> dto/entity`).
- Persistencia con TypeORM sobre MSSQL (schema `dbo`, entidades/columnas en mayusculas).
- Seguridad con JWT, `RolesGuard` global y `AuditInterceptor` global.
- Validacion global con `ValidationPipe` (`whitelist + transform + forbid`).

## Arquitectura y estructura real
- `src/main.ts`: bootstrap, CORS configurable por `CORS_ORIGINS`, Swagger en `/docs`.
- `src/app.module.ts`: registro de modulos de dominio.
- `src/config/database.module.ts`: conexion MSSQL con `TypeOrmModule.forRootAsync`.
- `src/common/`: guards, decorators e interceptors.
- `src/modules/`: modulos funcionales por dominio.

## Conexiones y consultas (estado actual)
- Conexion DB:
- `type: mssql`, `autoLoadEntities: true`, `synchronize: false`, `logging: false`.
- variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_SCHEMA`.
- `trustServerCertificate: true`, `encrypt: false`.
- Patrones de acceso a datos:
- TypeORM repository/query builder para CRUD y catalogos.
- SQL directo con `dataSource.query(...)` para reportes, filtros complejos y compatibilidad legacy.
- transacciones con `QueryRunner` para procesos de inventario, cargas masivas y operaciones compuestas.
- uso de stored procedures para procesos criticos de negocio.

## Inventario funcional (modulos -> tablas/campos clave)

### Seguridad y accesos
- `auth`: `USUARIO_TOKEN` (`IDTOKEN`, `IDUSUARIO`, `JTI`, `REFRESH_TOKEN_HASH`, `ISSUED_AT`, `EXPIRES_AT`, `REVOKED_AT`), `USUARIO`.
- `users`: `USUARIO` (`IDUSUARIO`, `USERNAME`, `NOMBRE`, `APELLIDOS`, `MAIL`, `ESTATUS`, `NIVEL`, `IDROL`, `IDDEPTO`, `IDPUESTO`, `SUC`).
- `roles`: `ROL` (`IDROL`, `CODIGO`, `NOMBRE`, `DESCRIPCION`, `ACTIVO`).
- `deptos`: `DEPARTAMENTO` (`IDDEPTO`, `NOMBRE`, `ACTIVO`).
- `puestos`: `PUESTO` (`IDPUESTO`, `IDDEPTO`, `NOMBRE`, `ACTIVO`).
- `dat-suc`: `DAT_SUC` (`SUC`, `DESC`, `ENCAR`, `ZONA`, `RFC`, `DIRECCION`, `CONTACTO`, `IVA_INTEGRADO`).
- `usr-mod-suc`: `USR_MOD_SUC` (`MODULO`, `USUARIO`, `SUC`, `ACTIVO`, `FCNR`).
- `access` y `admin`:
- `MODULO`, `GRUP_MODULO`, `GRUPMOD_MODULO`, `ROL_GRUP_MODULO_PERM`.
- `MOD_FRONT`, `GRUPMOD_FRONT`, `GRUPMOD_FRONT_MOD`, `ROL_GRUPMOD_FRONT`.
- `datmodulos`: opera sobre `MOD_FRONT`.
- `audit`: `AUDIT_LOG` (`IDLOG`, `IDUSUARIO`, `ACTION`, `MODULO`, `ENTIDAD`, `ENTIDAD_ID`, `SUC`, `METADATA_JSON`, `IP`, `FCNR`).

### Catalogos y maestros operativos
- `datart`: `DAT_ART` (`SUC`, `ART`, `UPC`, `DES`, `TIPO`, `PVTA`, `CTOP`, `DEPA`, `SUBD`, `CLAS`, `SCLA`, `SCLA2`, ...).
- `datcatreg`: `DAT_CAT_REG` (`C_REGIMENFISCAL`, `DESCRIPCION`).
- `datcatuso`: `DAT_CAT_USO` (`USOCFDI`, `DESCRIPCION`).
- `dat-almacen`: `DAT_ALMACEN` (`ALMACEN`, `DESCRIPCION`, `ACTIVO`, `FCNR`).
- `dat-cmov`: fuente `DAT_CMOV` (descubrimiento dinamico de columnas).

### Inventarios y conteos
- `datcontctrl`: `DAT_CONT_CTRL` (`TOKENREG`, `CONT`, `SUC`, `ESTA`, `TIPOCONT`, `TOTAL_ITEMS`, `FILE_NAME`, `LAST_ERROR`, `FCNC`, `FCNAJ`, `ARTAJ`, `ARTCONT`).
- `datcontcap`: `DAT_CONT_CAPTURA` (`ID`, `SUC`, `CONT`, `ART`, `UPC`, `ALMACEN`, `CANT`, `TIPO_MOV`, `IDUSUARIO`, `CAPTURA_UUID`, `FCNR`).
- `datdetsvr`: `DAT_DET_SVR` (`ID`, `SUC`, `CONT`, `ART`, `UPC`, `[001]`, `[002]`, `M001`, `T001`, `TOTAL`, `DIF_*`, `EXT`).
- `conteos`: orquesta upload/process/sync/apply sobre tablas anteriores.
- `datmb51`: `DAT_MB51` (`IDPD`, `USER`, `CLSM`, `DOCP`, `ART`, `CTDA`, `CTOT`, `FCND`, `FCNC`, `TXT`, `ALMACEN`, `SUC`).
- `datmb52`: resumen sobre `DAT_MB51` + descripcion de `DAT_ART`.

### Control de cuentas
- `ctrl-ctas`: fuente principal `DAT_CTRL_CTAS`, catalogos `DAT_CAT_CTAS`, `FACT_CLIENT_SHP`, `PV_OPV`.
- `cat-ctas`: `DAT_CAT_CTAS` (`CTA`, `DCTA`, `RELACION`, `SUC`), con autorizacion por `USR_MOD_SUC`.

### Punto de venta / referencias
- `factclientshp`: `FACT_CLIENT_SHP` (`IDC`, `CLIEN_UNI`, `RazonSocialReceptor`, `RfcReceptor`, `UsoCfdi`, `SUC`, ...).
- `pvctrfolasvr`: `PV_CTR_FOL_ASVR` (`IDFOL`, `CLIEN`, `SUC`, `OPV`, `ESTA`, `IMPT`, ...).
- `pvctrfolform`: `PV_CTR_FOL_FORM` (`IDF`, `IDFOL`, `FORM`, `IMPA`, `IMPP`, `IMPC`, `IMPD`, ...).
- `pvctrords`: `PV_CTR_ORDS` (`IORD`, `IDFOL`, `ART`, `CTD`, `SUC`, `ESTATUS`, ...).
- `pvctrordsdet`: `PV_CTR_ORDS_DET` (`IORDP`, `IORD`, `ART`, `JOB`, `ESF`, `CIL`, `EJE`).
- `pvticketlog`: `PV_TICKET_LOG` (`ID`, `IDFOL`, `ART`, `UPC`, `CTD`, `PVTA`, `CTDD`, `CTDDF`, `UPDATED_AT`).
- `refdetalle`: `REF_DETALLE` (`IDREF`, `SUC`, `FCNR`, `FCND`, `OPV`, `IDFOL`, `IDC`, `RFCEMISOR`, `TIPO`, `IMPT`, `ESTATUS`).
- `datretctrsvr`, `datretdetsvr`, `datretdetefecsvr`: tablas de retorno en flujo de venta.
- `jrqdepa`, `jrqsubd`, `jrqclas`, `jrqscla`, `jrqscla2`, `jrqguia`: catalogos de clasificacion.

## Punto de venta: cierre transaccional de cotizacion (implementado)
- Controller/Service:
- `src/modules/pvctrfolasvr/pv-cotizaciones-cierre.controller.ts`
- `src/modules/pvctrfolasvr/pv-cotizaciones-cierre.service.ts`
- Endpoints:
- `GET /pv/cotizaciones/:idfol/cierre/context`
- `POST /pv/cotizaciones/:idfol/cierre/preview`
- `POST /pv/cotizaciones/:idfol/cierre`
- Reglas base del cierre:
- valida folio en `PV_CTR_FOL_ASVR` y articulos en `PV_TICKET_LOG`.
- calcula total desde `SUM(CTD * PVTA)` + regla de IVA segun `DAT_SUC.IVA_INTEGRADO`, `tipotran` y `rqfac`.
- valida formas (`EFECTIVO`, `TARJETA`, `CHEQUE`, `TRANSFERENCIA`, `CREDITO`, `DEUDOR`) y restricciones.
- Cierre transaccional:
- reescribe `PV_CTR_FOL_FORM` para el folio.
- actualiza `PV_CTR_FOL_ASVR` a `ESTA='TRANSMITIR'` e `IMPT=TOTAL`.
- rollback completo ante error (sin estados parciales).

## Stored procedures y consultas clave
- Inventarios:
- `sp_cont_upload_clear`, `sp_cont_build_det_svr`, `sp_cont_sync_captura_art`, `sp_cont_apply_adjustment`.
- MB51/MB52:
- `sp_dat_mb51_search`, `sp_dat_mb52_resumen`.
- Catalogo articulos:
- `sp_datart_massive_apply`, `sp_art_masiva_validate_batch`, `sp_art_masiva_commit_batch`.
- Punto de venta y clientes:
- `sp_factclientshp_create`, `sp_pvctrfolasvr_create`, `sp_pv_ctr_ords_create_from_quote_line`.
- Control de cuentas:
- `sp_ctrlctas_resumen_cliente`, `sp_ctrlctas_resumen_transaccion`, `sp_ctrlctas_detalle_transaccion`.

## Reglas estrictas
- No modificar logica de negocio sin confirmacion previa.
- No cambiar versiones de dependencias ni agregar nuevas sin permiso.
- No eliminar codigo, endpoints ni entidades sin confirmacion explicita.
- No editar archivos generados (`dist/`) ni dependencias (`node_modules/`).
- No modificar `.env` ni exponer secretos.
- Evitar comandos destructivos.

## Refactors
- Deben ser incrementales y de bajo riesgo.
- No romper contratos HTTP ni modelos de base de datos.
- Mantener rutas, nombres de propiedades y DTOs existentes.
- Actualizar tests y Swagger si el cambio lo requiere.

## Cambios estructurales
- Mover carpetas o renombrar modulos requiere aprobacion previa.
- Mantener el patron controller -> service -> entity/dto.
- Registrar nuevos modulos en `src/app.module.ts`.

## Cambios de dependencias
- Requieren aprobacion previa y justificacion tecnica.
- No actualizar versiones por iniciativa propia.

## Logica critica
- Autenticacion, roles, auditoria y configuracion de BD son criticos.
- Consultar antes de modificar JWT payload, guards, interceptors o config de TypeORM.

## Inventarios: autorizacion por sucursal
- Para Inventarios (`DAT_JAA_ALM`), la autorizacion por sucursal se rige por `USR_MOD_SUC` (`MODULO`, `USUARIO`, `SUC`, `ACTIVO`).
- Admin (roleId `1`) mantiene bypass por rol, pero usuarios no-admin solo pueden operar dentro de sucursales activas en `USR_MOD_SUC`.
- La validacion de sucursal autorizada debe aplicarse en lectura y acciones de cambio (ej. `apply-adjustment`, upload/process/detalle/summary).
- No confiar en filtros de frontend como control de seguridad; la API debe rechazar sucursales no autorizadas.

## Control de Cuentas / Catalogo Cuentas: autorizacion por sucursal
- Para `ctrl-ctas` y `cat-ctas`, la autorizacion por sucursal debe resolverse con `USR_MOD_SUC` para modulos `DAT_CONS_CTAS`, `DAT_CTRL_CTAS` y `DAT_CTRL_CUENTAS`.
- Endpoints de consulta (catalogos y reportes) deben aplicar interseccion entre sucursales solicitadas y sucursales autorizadas del usuario no-admin.
- Operaciones CRUD de `cat-ctas` (insert/update/delete/find) para no-admin solo deben permitir sucursales autorizadas.
- Admin (roleId `1`) mantiene bypass por rol y puede operar sin filtro de `USR_MOD_SUC`.
- Compatibilidad legacy: si no existen filas en `USR_MOD_SUC` para ese usuario/modulo, se permite fallback a `user.suc` para no romper usuarios existentes.
- `GET /ctrl-ctas/config` debe exponer contexto para UI (`allowedSucs`, `forcedSuc`, `canSelectSucs`) y no depender solo de `user.suc`.
- Trazabilidad UI (frontend): la regla de habilitacion de exportar en `Resumen por Deudor` se controla en app (CTA unica o CLIENT seleccionado) y no modifica contrato ni payload de los endpoints `/ctrl-ctas/consulta/*`.
- Trazabilidad UI (frontend): en exportacion sin CLIENT (CTA unica), la app consulta `resumen-transaccion` y `detalle` para todos los CLIENT aplicables, enviando `idfols` por cliente en bloques; tampoco cambia contrato API.
- Trazabilidad UI (frontend): el progreso de exportacion se muestra en modal de app; no introduce endpoints nuevos ni cambios de payload.
- Trazabilidad UI (frontend): el filtro visual `!= 0` inicia activo por defecto en los tres niveles de la pantalla de resumen, sin cambios de contrato API.

## Buenas practicas
- Controllers delgados; logica en services.
- DTOs con class-validator y transform.
- Manejo de errores con excepciones de Nest.
- No habilitar `synchronize` sin aprobacion.

## Documentacion viva obligatoria
- Cada nueva implementacion que cambie modulos, endpoints, tablas, campos, stored procedures o consultas SQL debe actualizar en el mismo trabajo:
- `C:\Users\PCDESARROLLO\Proyectos\ioe_app\AGENTS.md`
- `C:\Users\PCDESARROLLO\Proyectos\ioe_app\README.md`
- `C:\Users\PCDESARROLLO\Proyectos\ioe-api\AGENTS.md`
- `C:\Users\PCDESARROLLO\Proyectos\ioe-api\README.md`
- No cerrar una tarea sin mantener la trazabilidad de arquitectura y datos sincronizada entre app y api.
