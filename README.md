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
- `PV_DEV_ORD_BLOCK_THRESHOLD` (default `5`, regla bloqueante ORD en devoluciones PV)

## Modulos y endpoints principales

- Salud:
- `/health`, `/health/db`
- Seguridad:
- `/auth/login`, `/auth/refresh`, `/auth/logout-all`
- `/me/profile`, `/me/front-menu`, `/me/datmodulos`, `/me/backend-perms`
- Maestros:
- `/roles`, `/deptos`, `/puestos`, `/users`, `/dat-suc`, `/datmodulos`
- Validacion relevante: `/users` exige `USERNAME` con minimo 3 caracteres.
- Accesos:
- `/access/modulos`, `/access/grupos-modulo`, `/access/roles/:id/permisos-backend`
- `/access/mod-front`, `/access/grupos-front`, `/access/roles/:id/enrolamientos-front`
- `/usr-mod-suc`
- Catalogos:
- `/datart`, `/datcatreg`, `/datcatuso`, `/dat-almacen`, `/dat-cmov`
- `/dat-form` (CRUD de catalogo de formas de pago sobre `DAT_FORM`)
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
- `/pv/devoluciones/*` (flujo de devoluciones de cotizaciones/ventas/apartados)
- `/pv/refdetalle` (flujo PV de creacion/asignacion/eliminacion de referencias por folio)
- `/pvticketlog/:id/precio` (edicion de `PVTA` con control de autorizacion `SUPERPV`)
- `/dat-form` (GET lista, POST crea; por defecto lista solo activas, opcional `includeInactive=true`)
- `/dat-form/:idform` (GET detalle, PATCH actualiza, DELETE elimina)
- `/dat-form/:idform/estado` (PATCH para activar/inactivar forma de pago)
- Clasificadores:
- `/jrqdepa`, `/jrqsubd`, `/jrqclas`, `/jrqscla`, `/jrqscla2`, `/jrqguia`

## Alta de cotizacion desde panel (integracion app)

- Flujo frontend: confirmacion de alta y luego modal de busqueda/seleccion de cliente por sucursal del usuario.
- Endpoints usados por la app:
- `GET /factclientshp` (listado de clientes; app filtra por SUC).
- `POST /pvctrfolasvr/auto` (creacion de folio).
- `PATCH /pvctrfolasvr/:idfol` (asignacion de `CLIEN` al folio creado).
- Correccion backend (2026-02): `PV_CTR_FOL_ASVR.CLIEN` se mapea como `float` en TypeORM para evitar `500 EPARAM` cuando el cliente excede el rango `int32`.
- No hay cambios de contrato API en este ajuste.

## Edicion de precio PV en detalle de cotizacion

- Endpoint:
- `PATCH /pvticketlog/:id/precio`
- `POST /pvticketlog/precio/authorize`
- Payload:
- `PVTA` (requerido), `AUTH_PASSWORD` (requerido solo si solicitante no es `SUPERPV`).
- Reglas:
- usuario con rol `SUPERPV` puede autorizar su propio cambio de precio.
- usuario sin rol `SUPERPV` debe proveer contraseña valida de un usuario activo `SUPERPV`.
- Si la contraseña no coincide con un `SUPERPV` activo, backend rechaza la autorización y el frontend no debe abrir captura de importe.
- Seguridad:
- `PATCH /pvticketlog/:id` no acepta cambios de `PVTA`; cualquier cambio de precio debe pasar por `PATCH /pvticketlog/:id/precio`.
- Actualizaciones:
- `PV_TICKET_LOG.PVTA` = nuevo precio
- `PV_TICKET_LOG.PVTAT` = `CTD * PVTA` recalculado
- `PV_TICKET_LOG.updated_at` = fecha actual
- Auditoria:
- inserta registro especifico en `AUDIT_LOG` con `ACTION='PVTA_OVERRIDE'`, entidad `PV_TICKET_LOG`, id renglón y metadata de antes/despues + autorizador.
- `AUDIT_LOG.IDUSUARIO` se guarda con el `IDUSUARIO` del `SUPERPV` que validó la contraseña (o el propio supervisor cuando aplica autorización directa).

## Cierre de cotizacion PV (nuevo flujo)

- Endpoint principal:
- `POST /pv/cotizaciones/:idfol/cierre`
- Endpoints auxiliares:
- `GET /pv/cotizaciones/:idfol/cierre/context`
- `POST /pv/cotizaciones/:idfol/cierre/preview`
- `GET /pv/cotizaciones/:idfol/cierre/print-preview`
- `GET /pv/refdetalle?idfol=:idfol&tipo=:tipo`
- `POST /pv/refdetalle/crear`
- `POST /pv/refdetalle/asignar`
- `DELETE /pv/refdetalle/:idref`
- Integracion frontend (`ioe_app`):
- flujo de pago reorganizado en `lib/features/modulos/punto_venta/cotizaciones/pago/*`.
- se retiro la visualizacion del bloque "Contexto del folio" en la pantalla de pago (sin cambios en API).
- trazabilidad UI: en cierre `CA`, el selector de formas en app solo permite `EFECTIVO`.
- trazabilidad UI: el campo `aut` (Autorizacion / referencia) y boton `Generar/Asignar referencia` se muestran en app para `TARJETA`, `CHEQUE`, `TRANSFERENCIA` y `DEPOSITO 3RO`.
- trazabilidad UI: la referencia se crea/asigna en `REF_DETALLE` y se retorna `IDREF` al formulario de pago.
- trazabilidad UI tecnica: app corrigio id temporal de formas para Flutter Web usando `nextInt(0x100000000)`; no cambia API.
- trazabilidad UI: app bloquea cambio de `tipotran` (`CA`/`VF`) cuando ya hay formas capturadas; no cambia endpoints ni payload.
- trazabilidad UI: `RQFAC` fue movido al AppBar y los totales de cotizacion/formas se presentan en un solo card en app; no cambia API.
- trazabilidad UI: app oculto `IVA integrado sucursal` en el resumen y recalcula preview al reingresar a pago; no cambia endpoints ni payload.
- trazabilidad UI: app guarda `RQFAC` en `PV_CTR_FOL_ASVR.REQF` al cambiar switch mediante `PATCH /pvctrfolasvr/:idfol`; no agrega endpoint nuevo.
- trazabilidad API/UI: al finalizar cierre, app permanece en pantalla de pago y habilita boton `Imprimir ticket`; al presionarlo consulta `GET /pv/cotizaciones/:idfol/cierre/print-preview` para abrir vista previa PDF.
- trazabilidad UI: app realiza prevalidacion de referencias no usadas (`GET /pv/refdetalle`) antes de cerrar; backend sigue validando de forma autoritativa.
- trazabilidad UI: si esa prevalidacion detecta referencias sin usar, app redirige a `.../cotizaciones/:idfol/ref-detalle` con la referencia detectada para gestionarla antes de reintentar cierre.
- trazabilidad UI tecnica: app migro seleccion con `RadioGroup` (cliente/referencias) para resolver deprecaciones Flutter 3.32; sin cambios de endpoints/payload.
- trazabilidad UI: cuando `tipotran=CA`, app fuerza `rqfac=false` y persiste `REQF=0` en `PV_CTR_FOL_ASVR` previo al preview; sin cambios de contrato API.
- trazabilidad API/UI: al finalizar cierre, backend persiste `PV_CTR_FOL_ASVR.ESTA='PAGADO'` y app mantiene la pantalla de pago para impresion/confirmacion de salida.
- trazabilidad UI: en estado `PAGADO`, app cambia el boton regresar a icono candado y al presionarlo ejecuta `PATCH /pvctrfolasvr/:idfol` para mover el folio a `ESTA='TRANSMITIR'` y volver al panel.
- trazabilidad UI: desde panel, filas en `ESTA='PAGADO'` abren directo la vista de pago para completar salida/transmision.
- trazabilidad UI: el panel incluye estados `PENDIENTE`, `PAGADO` y `EDITANDO` con filtro por `ESTA` (sin depender de `AUT`).
- Body de cierre:
- `{ suc, tipotran: 'CA'|'VF', rqfac, idopv, formas:[{ form, impp, aut? }] }`
- Procesamiento transaccional:
- `POST /pv/cotizaciones/:idfol/cierre` ejecuta el SP `dbo.sp_pv_cotizacion_cerrar`.
- Script fuente obligatorio: `sql/sp_pv_cotizacion_cerrar_create.sql`.
- Script de esquema de formas de pago: `sql/DAT_FORM_schema_alter.sql` (`IDFORM` identity PK + `ESTADO` activo/inactivo).
- Si el SP no existe en la BD, el endpoint responde `409` indicando instalar ese script.
- El service no abre una transaccion TypeORM alrededor del SP para evitar abortos `EABORT` por doble transaccion; la atomicidad queda en el SP.
- Los errores SQL de validacion del SP se retornan como `400/409` con mensaje legible (no `500` generico).
- Tablas y campos que actualiza:
- `PV_CTR_FOL_ASVR`: `ESTA='PAGADO'` al finalizar cierre (`TRANSMITIR` se aplica despues en `PATCH` desde frontend al salir), `IMPT=TOTAL`, `AUT='CA'|'VF'` (y `REQF`/campo equivalente si existe).
- `PV_CTR_FOL_FORM_SVR` (fallback `PV_CTR_FOL_FORM`): insercion transaccional de formas definitivas (`IDF`, `IDFOL`, `FORM`, `IMPP`, `AUT`, ...). En `CREDITO/DEUDOR` guarda `AUT=IDFOL`. En cualquier forma, `IMPD` persiste el total final de la cotizacion (costo total de articulos segun reglas de cierre).
- `PV_CTR_ORDS`: actualizacion de `ESTATUS=2` para las ordenes del `IDFOL` al cerrar.
- Tablas para calculo/validacion:
- `PV_TICKET_LOG` (`SUM(CTD * PVTA)`), `DAT_SUC` (`IVA_INTEGRADO`), `FACT_CLIENT_SHP` y `DAT_CTRL_CTAS` (credito).
- `REF_DETALLE` para validar referencias (`IDREF`, `IDFOL`, `TIPO`, `ESTATUS`, `RfcEmisor`, `IMPT`).
- `DAT_CTRL_CTAS` en `CREDITO/DEUDOR`: inserta cargo con `CMOV=602`, `CTA='101001002'`, `CLIENT`, `IDFOL`, `NDOC`, `IMPT` negativo.
- Compatibilidad de esquema en `DAT_CTRL_CTAS`: si no existe `CMOV` usa `CLSD`; ademas llena `FCND` y `RTXT` cuando esas columnas existen.
- Validacion de credito: disponible = `FACT_CLIENT_SHP.L_CRED - SUM(ABS(DAT_CTRL_CTAS.IMPT))` (misma `CTA` y `CLIENT`).
- `NDOC` se genera concurrente en transaccion (sin `DCount`) con base `N6000001+`.
- compatibilidad SQL: para obtener maximo `NDOC` en cierre se valida existencia de columna con `COL_LENGTH` + SQL dinamico, evitando errores `Invalid column name 'NDOC'` en variantes de esquema.
- El cierre exige `REF_DETALLE.ESTATUS='PROCESADO'` en formas no efectivo con referencia y rechaza referencias sobrantes sin usar.
- El cierre rechaza pagos que excedan el total (`sum(formas.impp) > total`) excepto cuando hay `EFECTIVO`, donde se permite excedente para cambio.
- La operacion es transaccional con rollback completo; no permite cierres parciales.
- Preview de impresion (`GET /pv/cotizaciones/:idfol/cierre/print-preview`):
- arma un payload de 5 bloques para PDF: cabecera (`DAT_SUC`), detalle ticket (`PV_TICKET_LOG`), totales/formas/cambio (`PV_CTR_FOL_FORM_SVR` fallback `PV_CTR_FOL_FORM`), pie transaccional (`PV_CTR_FOL_ASVR` + `PV_OPV` + `FACT_CLIENT_SHP`) y ORDs con detalle (`PV_CTR_ORDS` + `PV_CTR_ORDS_DET`) por `IDFOL`.
- trazabilidad UI de impresion: la app renderiza tickets 58/80 sin encabezado repetitivo (`COTIZACION FINALIZADA`) ni `IDFOL` superior.
- trazabilidad UI de impresion: la app aplica margen izquierdo fijo de `2mm` en ambos anchos de ticket.
- trazabilidad UI de impresion: cuando el cierre es `CA`, la app omite subtotal/IVA/total final/pagos/faltante/cambio y oculta `FORMAS`; mantiene TRANSACCION y ORDs.
- trazabilidad UI de impresion: en bloque ORDs, la app imprime `ORD` y `UPC`, agrega descripcion + `TIPO`, codigo de barras `CODE39` por ORD y una tabla con bordes (`JOB/ESF/CIL/EJE`) desde `PV_CTR_ORDS_DET`; omite `EST` y `ART` en cabecera ORD.
- trazabilidad UI de impresion: en la tabla ORD las celdas vacias se muestran sin guiones.
- trazabilidad UI de impresion: se imprime un bloque `RESUMEN DE ORDS` entre `TRANSACCION` y `ORDS` con `ORD`, descripcion y `UPC`.
- trazabilidad UI de impresion: en `DETALLE` se agrega `UPC` por producto y alternancia de fondo gris/blanco por renglon.
- trazabilidad UI de impresion: al iniciar cada bloque `ORD` se imprime linea de recorte con icono para separacion por orden.
- trazabilidad UI de impresion: frontend calcula altura dinamica del ticket segun contenido para minimizar hojas vacias y mantener multihoja solo cuando es necesario.
- trazabilidad UI de impresion: frontend renderiza `MultiPage` con margen izquierdo explicito de `2mm` para 58/80, evitando contenido pegado al borde.
- trazabilidad UI de impresion: se recalibra la altura dinamica en 80mm con estimacion mas conservadora (lineas/tablas/buffer por ORDs) para evitar hoja extra; en 58mm no se altera la logica actual.

## Devoluciones PV (nuevo flujo)

- Endpoints:
- `GET /pv/devoluciones`
- `POST /pv/devoluciones/crear`
- `GET /pv/devoluciones/:idfolDev/detalle`
- `POST /pv/devoluciones/:idfolDev/devolver-todo`
- `PATCH /pv/devoluciones/:idfolDev/lineas/:lineId`
- `POST /pv/devoluciones/:idfolDev/detalle/preparar`
- `POST /pv/devoluciones/:idfolDev/pago/preview`
- `POST /pv/devoluciones/:idfolDev/pago/finalizar`
- `GET /pv/devoluciones/:idfolDev/print-preview`
- Reglas de negocio:
- creación con autorización de supervisor `SUPERPV` por contraseña (`401` inválida, `403` no supervisor).
- folio origen permitido solo para `AUT in ('VF','CA','APF')`.
- bloqueo por facturación usando `FAC_SVR_SHAP`: si `ESTATUS='FACTURADO'`, responde `409`.
- bloqueo ORD configurable: `ESTSEGU >= PV_DEV_ORD_BLOCK_THRESHOLD` (default `5`).
- en detalle solo se edita `CTDD`; para líneas con ORD no bloqueante se exige devolución completa (`CTDD == CTD`).
- `devolver-todo` aplica `CTDD=DIFD` y omite (null) líneas bloqueadas por ORD.
- `detalle/preparar` valida selección e inserta en `PV_TICKET_LOG` del folio devolución solo artículos con `CTDD>0`.
- preview reutiliza reglas de IVA del cierre (`DAT_SUC.IVA_INTEGRADO`, `REQF`, tipotran del origen) y sugiere formas.
- trazabilidad UI (app): en pago de devolución `RQFAC` se muestra como dato derivado del origen (solo lectura en frontend, sin override manual).
- trazabilidad UI (app): en pago de devolución no se permite agregar, editar ni eliminar formas en la pantalla.
- trazabilidad UI (app): cuando la devolución queda en `PAGADO`, app muestra candado de salida y al presionarlo manda `PATCH /pvctrfolasvr/:idfol` con `ESTA='TRANSMITIR'`.
- `GET /pv/devoluciones` devuelve solo folios en `ESTA IN ('DEV PEND','PAGADO')` para filtros por `OPV` y por `OPVM`.
- trazabilidad UI (app): desde panel, devoluciones en `PAGADO` abren directo la vista de pago.
- trazabilidad API/UI (app): la impresión de devolución se dispara con botón explícito y selector 58mm/80mm, consumiendo `GET /pv/devoluciones/:idfolDev/print-preview`.
- finalización transaccional:
- registra `FACT_IDFOLDEV` (`IDFOLDEV`, `IDFOL_OR`, `NART`, `IMPTD`, `TIPOT='DF'` según columnas disponibles).
- actualiza líneas originales (`PV_TICKET_LOG.CTDDF += CTDD`).
- genera ticket devolución en `PV_TICKET_LOG` del folio devolución.
- guarda formas de pago en `PV_CTR_FOL_FORM_SVR` (fallback `PV_CTR_FOL_FORM`) con importes negativos.
- en `CREDITO/DEUDOR`, registra abonos en `DAT_CTR_DOC` (si existe) y `DAT_CTRL_CTAS` con clases `611/612`.
- marca ORDs afectadas como anuladas (`PV_CTR_ORDS.ESTATUS=4`).
- folio devolución termina en `ESTA='PAGADO'` y `AUT='DF'/'APDF'`; el envío a `TRANSMITIR` se realiza después mediante `PATCH /pvctrfolasvr/:idfol`.
- SQL soporte:
- `sql/PV_DEV_DET_TMP_create.sql` crea/ajusta la tabla staging `PV_DEV_DET_TMP`.

## Reloj Checador (Asistencia)

- Modulo backend:
- `src/modules/reloj-checador/reloj-checador.module.ts`
- `src/modules/reloj-checador/reloj-checador.controller.ts`
- `src/modules/reloj-checador/reloj-checador.service.ts`
- `src/modules/reloj-checador/dto/*`
- Endpoints:
- `GET /reloj-checador/context`
- `POST /reloj-checador/timelog`
- `GET /reloj-checador/timelogs`
- `PUT /reloj-checador/timelog/:id`
- `POST /reloj-checador/incidencias`
- `PUT /reloj-checador/incidencias/:id/status`
- `GET /reloj-checador/incidencias`
- `POST /reloj-checador/documentos`
- `GET /reloj-checador/documentos`
- `GET /reloj-checador/documentos/:id/download`
- `POST /reloj-checador/overrides`
- `GET /reloj-checador/overrides`
- `PUT /reloj-checador/overrides/:id/revoke`
- `GET /reloj-checador/policy`
- `POST /reloj-checador/policy`
- SQL versionado:
- `sql/reloj_checador/001_ATT_POLICY_create.sql`
- `sql/reloj_checador/002_ATT_TIME_LOG_create.sql`
- `sql/reloj_checador/003_ATT_BIOMETRIC_TEMPLATE_create.sql`
- `sql/reloj_checador/004_ATT_INCIDENCIA_create.sql`
- `sql/reloj_checador/005_ATT_DOCUMENTO_create.sql`
- `sql/reloj_checador/006_ATT_OVERRIDE_create.sql`
- `sql/reloj_checador/007_ATT_ALERTA_create.sql`
- `sql/reloj_checador/101_sp_att_policy_upsert.sql` .. `115_sp_att_override_list.sql`
- Comportamiento clave:
- `sp_att_timelog_create` valida secuencia ENTRADA/SALIDA_COMER/REGRESO_COMER/SALIDA, geocerca, ventanas y liveness.
- cuando corresponde, valida override vigente en `ATT_OVERRIDE`.
- inserta marcaje bloqueado (`ATT_TIME_LOG.LOCKED=1`) y genera alertas de overtime en `ATT_ALERTA`.
- Seguridad/alcance:
- employee: solo marcajes y consultas propias.
- manager/supervisor: consulta por SUC/DEPTO, aprobacion de incidencias y gestion de overrides.
- admin/rrhh: gestion completa, incluyendo correccion admin de timelog.
- Auditoria:
- todas las operaciones criticas escriben en `AUDIT_LOG` (`MODULO='reloj_checador'`) con metadata JSON (url, method, body, before/after, reason segun aplique).

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
- `sp_pv_cotizacion_cerrar`
- Scripts de esquema:
- `DAT_FORM_schema_alter.sql` (estructura y control de estado para formas de pago)
- `PV_CTR_ORDS_CLIEN_float.sql` (ajuste de CLIEN a FLOAT para IDs grandes)
- `PV_DEV_DET_TMP_create.sql` (staging de detalle para devoluciones PV)

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

Nota de watch/dev:

- `nest-cli.json` mantiene `compilerOptions.deleteOutDir=false` para evitar errores intermitentes `Cannot find module ...\\dist\\main` durante compilacion incremental.

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
