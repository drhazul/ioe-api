# IOE API

Backend del sistema IOE, construido con NestJS + TypeORM sobre MSSQL.
Expone autenticacion JWT, administracion de accesos, maestros, inventarios,
control de cuentas y punto de venta.

## Planteamiento funcional
- Proveer una API central para frontend `ioe_app`.
- Mantener reglas de autorizacion por rol y por sucursal en backend.
- Operar procesos de negocio con consultas SQL y stored procedures donde aplica.
- Auditar operaciones de escritura para trazabilidad.

## Arquitectura
- Arquitectura modular por feature en `src/modules`.
- Patron: `controller -> service -> dto/entity`.
- Validacion global `ValidationPipe` (`whitelist`, `transform`, `forbidNonWhitelisted`).
- Seguridad global:
- `RolesGuard` (`APP_GUARD`).
- `AuditInterceptor` (`APP_INTERCEPTOR`).
- Swagger habilitado en `/docs`.

## Estructura del proyecto
- `src/main.ts`: bootstrap, CORS, Swagger, pipes globales.
- `src/app.module.ts`: registro de modulos.
- `src/config/database.module.ts`: TypeORM + MSSQL.
- `src/config/env.validation.ts`: validacion de variables de entorno con Joi.
- `src/common/`: guards, decorators, interceptors comunes.
- `src/modules/`: modulos de dominio.
- `test/`: pruebas e2e.
- `dist/`: build output (no editar).

## Conexion a base de datos
- Driver: `mssql` via TypeORM.
- Config relevante (`database.module.ts`):
- `autoLoadEntities: true`
- `synchronize: false`
- `logging: false`
- `trustServerCertificate: true`
- `encrypt: false`
- Pool:
- `max: 20`
- `acquireTimeoutMillis: 60000`
- `requestTimeout: 120000`

## Variables de entorno
Requeridas:
- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`
- `JWT_SECRET`

Opcionales:
- `PORT` (default `3001`)
- `DB_PORT` (default `1433`)
- `DB_SCHEMA` (default `dbo`)
- `JWT_EXPIRES_IN` (default `15m`)
- `REFRESH_EXPIRES_DAYS` (default `30`)
- `CORS_ORIGINS`
- `ADMIN_ROLE_IDS`, `ADMIN_ROLE_ID`, `ADMIN_NIVELES`, `ADMIN_NIVEL`

## Modulos y endpoints principales
- Salud:
- `/health`, `/health/db`
- Seguridad:
- `/auth/login`, `/auth/refresh`, `/auth/logout-all`
- `/me/profile`, `/me/front-menu`, `/me/datmodulos`, `/me/backend-perms`
- Maestros:
- `/roles`, `/deptos`, `/puestos`, `/users`, `/dat-suc`, `/datmodulos`
- Accesos:
- `/access/modulos`, `/access/grupos-modulo`, `/access/roles/:id/permisos-backend`
- `/access/mod-front`, `/access/grupos-front`, `/access/roles/:id/enrolamientos-front`
- `/usr-mod-suc`
- Catalogos:
- `/datart`, `/datcatreg`, `/datcatuso`, `/dat-almacen`, `/dat-cmov`
- Inventarios:
- `/conteos/*`, `/capturas/*`, `/datcontctrl`, `/datdetsvr`, `/datmb51`, `/dat-mb51/search`, `/dat-mb52/resumen`
- Control de cuentas:
- `/cat-ctas/*`, `/ctrl-ctas/config`, `/ctrl-ctas/catalog/*`, `/ctrl-ctas/consulta/*`
- Nota de integracion UI: la condicion para habilitar exportacion Excel en `Resumen por Deudor` (CTA unica o CLIENT seleccionado) se resuelve en frontend y no requiere cambios de API.
- Nota de integracion UI: cuando hay CTA unica y no hay CLIENT seleccionado, frontend exporta `resumen-transaccion` y `detalle` para todos los CLIENT de esa consulta (consulta `detalle` por cliente en bloques de `idfols`), sin cambios de contrato.
- Nota de integracion UI: el progreso de exportacion se maneja en un modal del frontend; no requiere cambios en API.
- Nota de integracion UI: el filtro `!= 0` inicia activo por defecto en la pantalla de resumen (comportamiento solo frontend).
- Punto de venta:
- `/factclientshp`, `/pvctrfolasvr`, `/pvctrfolform`, `/pvctrords`, `/pvctrordsdet`, `/pvticketlog`, `/refdetalle`
- Clasificadores:
- `/jrqdepa`, `/jrqsubd`, `/jrqclas`, `/jrqscla`, `/jrqscla2`, `/jrqguia`

## Cierre de cotizacion PV (nuevo flujo)
- Endpoint principal:
- `POST /pv/cotizaciones/:idfol/cierre`
- Endpoints auxiliares:
- `GET /pv/cotizaciones/:idfol/cierre/context`
- `POST /pv/cotizaciones/:idfol/cierre/preview`
- Body de cierre:
- `{ suc, tipotran: 'CA'|'VF', rqfac, idopv, formas:[{ form, impp, aut? }] }`
- Tablas y campos que actualiza:
- `PV_CTR_FOL_ASVR`: `ESTA='TRANSMITIR'`, `IMPT=TOTAL` (y `REQF`/campo equivalente si existe).
- `PV_CTR_FOL_FORM`: insercion transaccional de formas definitivas (`IDF`, `IDFOL`, `FORM`, `IMPA`, `IMPP`, `IMPC`, `IMPD`, `AUT`).
- Tablas para calculo/validacion:
- `PV_TICKET_LOG` (`SUM(CTD * PVTA)`), `DAT_SUC` (`IVA_INTEGRADO`), `FACT_CLIENT_SHP` y `DAT_CTRL_CTAS` (credito).
- La operacion es transaccional con rollback completo; no permite cierres parciales.

## Modelo de datos (tablas y campos clave)

### Seguridad y acceso
- `USUARIO`: `IDUSUARIO`, `USERNAME`, `PASSWORD_HASH`, `NOMBRE`, `APELLIDOS`, `IDROL`, `IDDEPTO`, `IDPUESTO`, `SUC`, `ESTATUS`.
- `ROL`: `IDROL`, `CODIGO`, `NOMBRE`, `DESCRIPCION`, `ACTIVO`.
- `USUARIO_TOKEN`: `IDTOKEN`, `IDUSUARIO`, `JTI`, `REFRESH_TOKEN_HASH`, `ISSUED_AT`, `EXPIRES_AT`, `REVOKED_AT`.
- `USR_MOD_SUC`: `MODULO`, `USUARIO`, `SUC`, `ACTIVO`, `FCNR`.
- `MODULO`, `GRUP_MODULO`, `GRUPMOD_MODULO`, `ROL_GRUP_MODULO_PERM`.
- `MOD_FRONT`, `GRUPMOD_FRONT`, `GRUPMOD_FRONT_MOD`, `ROL_GRUPMOD_FRONT`.
- `AUDIT_LOG`: `IDLOG`, `IDUSUARIO`, `ACTION`, `MODULO`, `ENTIDAD`, `ENTIDAD_ID`, `SUC`, `METADATA_JSON`, `IP`.

### Maestros y catalogos
- `DEPARTAMENTO`: `IDDEPTO`, `NOMBRE`, `ACTIVO`.
- `PUESTO`: `IDPUESTO`, `IDDEPTO`, `NOMBRE`, `ACTIVO`.
- `DAT_SUC`: `SUC`, `DESC`, `ENCAR`, `ZONA`, `RFC`, `DIRECCION`.
- `DAT_ART`: `SUC`, `ART`, `UPC`, `DES`, `TIPO`, `PVTA`, `CTOP`, `DEPA`, `SUBD`, `CLAS`, `SCLA`, `SCLA2`, `MODELO`, etc.
- `DAT_CAT_REG`: `C_REGIMENFISCAL`, `DESCRIPCION`.
- `DAT_CAT_USO`: `USOCFDI`, `DESCRIPCION`.
- `DAT_ALMACEN`: `ALMACEN`, `DESCRIPCION`, `ACTIVO`.
- `DAT_CMOV`: catalogo de clases de movimiento (columnas detectadas dinamicamente).

### Inventarios
- `DAT_CONT_CTRL`: `TOKENREG`, `CONT`, `SUC`, `ESTA`, `TIPOCONT`, `TOTAL_ITEMS`, `FILE_NAME`, `LAST_ERROR`, `FCNC`.
- `DAT_CONT_CAPTURA`: `ID`, `SUC`, `CONT`, `ART`, `UPC`, `ALMACEN`, `CANT`, `TIPO_MOV`, `IDUSUARIO`, `CAPTURA_UUID`.
- `DAT_DET_SVR`: `ID`, `SUC`, `CONT`, `ART`, `UPC`, `[001]`, `[002]`, `M001`, `T001`, `TOTAL`, `DIF_*`, `EXT`.
- `DAT_MB51`: `IDPD`, `CLSM`, `DOCP`, `ART`, `CTDA`, `CTOT`, `FCND`, `FCNC`, `TXT`, `ALMACEN`, `SUC`.

### Control de cuentas y PV
- `DAT_CAT_CTAS`: `CTA`, `DCTA`, `RELACION`, `SUC`.
- `FACT_CLIENT_SHP`: `IDC`, `CLIEN_UNI`, `RazonSocialReceptor`, `RfcReceptor`, `UsoCfdi`, `SUC`.
- `PV_CTR_FOL_ASVR`: `IDFOL`, `CLIEN`, `SUC`, `OPV`, `ESTA`, `IMPT`.
- `PV_CTR_FOL_FORM`: `IDF`, `IDFOL`, `FORM`, `IMPA`, `IMPP`, `IMPC`, `IMPD`.
- `PV_CTR_ORDS`: `IORD`, `IDFOL`, `ART`, `CTD`, `SUC`, `ESTATUS`.
- `PV_CTR_ORDS_DET`: `IORDP`, `IORD`, `ART`, `JOB`, `ESF`, `CIL`, `EJE`.
- `PV_TICKET_LOG`: `ID`, `IDFOL`, `UPC`, `ART`, `CTD`, `PVTA`, `CTDD`, `CTDDF`.
- `REF_DETALLE`: `IDREF`, `SUC`, `FCNR`, `FCND`, `OPV`, `IDFOL`, `IDC`, `TIPO`, `IMPT`.

## Consultas y stored procedures clave
- Inventarios:
- `sp_cont_upload_clear`
- `sp_cont_build_det_svr`
- `sp_cont_sync_captura_art`
- `sp_cont_apply_adjustment`
- MB51/MB52:
- `sp_dat_mb51_search`
- `sp_dat_mb52_resumen`
- Articulos (masivos):
- `sp_datart_massive_apply`
- `sp_art_masiva_validate_batch`
- `sp_art_masiva_commit_batch`
- Control de cuentas:
- `sp_ctrlctas_resumen_cliente`
- `sp_ctrlctas_resumen_transaccion`
- `sp_ctrlctas_detalle_transaccion`
- Punto de venta/clientes:
- `sp_factclientshp_create`
- `sp_pvctrfolasvr_create`
- `sp_pv_ctr_ords_create_from_quote_line`

## Reglas de autorizacion por sucursal (criticas)
- Inventarios (`DAT_JAA_ALM`): validar `USR_MOD_SUC` para usuarios no-admin.
- Control de cuentas/catalogo cuentas: validar `USR_MOD_SUC` para
  `DAT_CONS_CTAS`, `DAT_CTRL_CTAS`, `DAT_CTRL_CUENTAS`.
- `admin` (roleId `1`) mantiene bypass por rol.
- Frontend no es control de seguridad: validacion efectiva se hace en API.

## Ejecucion
```bash
npm install
npm run start:dev
```

Produccion:
```bash
npm run build
npm run start:prod
```

Swagger:
- `http://localhost:3001/docs` (si `PORT` no cambia)

## Scripts utiles
- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run test:cov`

## Documentacion viva obligatoria
- Cada implementacion nueva que modifique modulos, endpoints, tablas, campos,
  stored procedures o consultas SQL debe actualizar en el mismo trabajo:
- `C:\Users\PCDESARROLLO\Proyectos\ioe_app\AGENTS.md`
- `C:\Users\PCDESARROLLO\Proyectos\ioe_app\README.md`
- `C:\Users\PCDESARROLLO\Proyectos\ioe-api\AGENTS.md`
- `C:\Users\PCDESARROLLO\Proyectos\ioe-api\README.md`
- Esta actualizacion es obligatoria para retroalimentacion y trazabilidad cruzada app/api.
