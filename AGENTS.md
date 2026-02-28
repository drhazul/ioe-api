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
- validacion `users`: `USERNAME` requiere minimo 3 caracteres.
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
- `dat-form`: fuente `DAT_FORM` para catalogo de formas de pago (`IDFORM`, `ASPEL`, `FORM`, `NOM`, `ESTADO`).

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
- `pv-devoluciones`: flujo transaccional de devoluciones PV sobre `PV_CTR_FOL_ASVR`, `PV_TICKET_LOG`, `PV_CTR_FOL_FORM(_SVR)`, `PV_CTR_ORDS`, `FAC_SVR_SHAP`, `FACT_IDFOLDEV`, `DAT_CTRL_CTAS`.
- `refdetalle`: `REF_DETALLE` (`IDREF`, `SUC`, `FCNR`, `FCND`, `OPV`, `IDFOL`, `IDC`, `RFCEMISOR`, `TIPO`, `IMPT`, `ESTATUS`).
- `pv/refdetalle`: flujo PV para crear/asignar/eliminar referencia ligada a folio, sobre `REF_DETALLE`.
- `PATCH /pvticketlog/:id/precio`: actualiza `PVTA/PVTAT` con autorizacion de supervisor PV.
- `POST /pvticketlog/precio/authorize`: valida contraseña de `SUPERPV` para habilitar captura de nuevo importe en frontend.
- Regla autorizacion precio PV:
- si solicitante tiene rol `SUPERPV`, autoriza directo.
- si no es `SUPERPV`, exige `AUTH_PASSWORD` valida de cualquier usuario activo con rol `SUPERPV`.
- `PATCH /pvticketlog/:id` (update general) ya no permite editar `PVTA`; para precio se exige el endpoint dedicado.
- Auditoria especifica: al cambiar precio se registra `ACTION='PVTA_OVERRIDE'` en `AUDIT_LOG` con metadata de antes/despues y autorizador.
- `AUDIT_LOG.IDUSUARIO` en `PVTA_OVERRIDE` corresponde al `IDUSUARIO` del `SUPERPV` que autorizo (o al mismo usuario cuando el solicitante ya es `SUPERPV`).
- `datretctrsvr`, `datretdetsvr`, `datretdetefecsvr`: tablas de retorno en flujo de venta.
- `jrqdepa`, `jrqsubd`, `jrqclas`, `jrqscla`, `jrqscla2`, `jrqguia`: catalogos de clasificacion.

## Punto de venta: cierre transaccional de cotizacion (implementado)

- Controller/Service:
- `src/modules/pvctrfolasvr/pv-cotizaciones-cierre.controller.ts`
- `src/modules/pvctrfolasvr/pv-cotizaciones-cierre.service.ts`
- `src/modules/refdetalle/pv-refdetalle.controller.ts`
- `src/modules/refdetalle/refdetalle.service.ts`
- Endpoints:
- `GET /pv/cotizaciones/:idfol/cierre/context`
- `POST /pv/cotizaciones/:idfol/cierre/preview`
- `GET /pv/cotizaciones/:idfol/cierre/print-preview`
- `POST /pv/cotizaciones/:idfol/cierre`
- `GET /dat-form` (lista de formas; `?includeInactive=true` opcional para incluir inactivas)
- `GET /dat-form/:idform` (detalle por id)
- `POST /dat-form` (alta de forma de pago)
- `PATCH /dat-form/:idform` (edicion de forma de pago)
- `PATCH /dat-form/:idform/estado` (activar/bloquear forma de pago por `ESTADO`)
- `DELETE /dat-form/:idform` (eliminacion de forma de pago)
- `GET /pv/refdetalle?idfol=:idfol&tipo=:tipo`
- `POST /pv/refdetalle/crear`
- `POST /pv/refdetalle/asignar`
- `DELETE /pv/refdetalle/:idref`
- Integracion frontend (`ioe_app`):
- los archivos del flujo quedaron en `lib/features/modulos/punto_venta/cotizaciones/pago/*`.
- la UI ya no muestra la tarjeta de contexto del folio; no cambia contrato ni payload API.
- trazabilidad UI adicional: en `tipotran=CA`, el modal de formas solo expone `EFECTIVO`.
- trazabilidad UI adicional: `Autorizacion / referencia` y boton `Generar/Asignar referencia` solo aparecen en `TARJETA`, `CHEQUE`, `TRANSFERENCIA` y `DEPOSITO 3RO`.
- trazabilidad UI adicional: la referencia se crea/asigna en `REF_DETALLE` y se regresa `IDREF` al pago.
- trazabilidad UI tecnica: app corrigio generacion de id temporal de formas para web (`nextInt(0x100000000)`), sin impacto en contrato API.
- trazabilidad UI adicional: al registrar una forma de pago, app bloquea el cambio de tipo de cierre (`CA`/`VF`) hasta limpiar todas las formas; sin cambios de contrato API.
- trazabilidad UI adicional: `RQFAC` se renderiza en el AppBar de pago y los bloques de totales se muestran unificados en un solo card; sin cambios de endpoints/payload.
- trazabilidad UI adicional: app oculta visualmente `IVA integrado sucursal` en el resumen y fuerza recalculo de preview al reingresar a pago; sin cambios de contrato API.
- trazabilidad UI adicional: app persiste `RQFAC` en `PV_CTR_FOL_ASVR.REQF` al cambiar el switch, usando endpoint existente `PATCH /pvctrfolasvr/:idfol`; sin endpoint nuevo.
- trazabilidad API/UI adicional: al cierre exitoso, app no redirige automaticamente y habilita boton `Imprimir ticket`; al usarlo consume `GET /pv/cotizaciones/:idfol/cierre/print-preview` para la vista previa PDF.
- trazabilidad UI adicional: app agrega prevalidacion de referencias sin usar (`GET /pv/refdetalle`) y bloquea finalizar en frontend si detecta `CAPTURADO/PROCESADO` no usados; backend mantiene validacion autoritativa.
- trazabilidad UI adicional: cuando detecta referencias sin usar en esa prevalidacion, app redirige a `.../cotizaciones/:idfol/ref-detalle` con la referencia detectada preseleccionada para gestionarla antes de cerrar.
- trazabilidad UI tecnica: app migro dialogos de seleccion a `RadioGroup` para eliminar warnings deprecated de Flutter 3.32; sin cambio de contrato API.
- trazabilidad UI adicional: en cierre `CA`, app fuerza `RQFAC=false` y persiste `REQF=0` en `PV_CTR_FOL_ASVR` antes de recalcular preview; no cambia endpoint/payload.
- trazabilidad API/UI adicional: al cerrar exitosamente, el backend persiste `PV_CTR_FOL_ASVR.ESTA='PAGADO'`; la app muestra pago en modo bloqueado para impresion/salida.
- trazabilidad UI adicional: al regresar desde pago en estado `PAGADO`, app usa `PATCH /pvctrfolasvr/:idfol` para pasar el folio a `ESTA='TRANSMITIR'` y volver al panel.
- trazabilidad UI adicional: desde panel, si `ESTA='PAGADO'`, app abre directo la vista de pago (no detalle).
- trazabilidad UI adicional: el panel lista `PENDIENTE`, `PAGADO` y `EDITANDO` por `ESTA`, sin filtrar por `AUT`.
- Reglas base del cierre:
- valida folio en `PV_CTR_FOL_ASVR` y articulos en `PV_TICKET_LOG`.
- calcula total desde `SUM(CTD * PVTA)` + regla de IVA segun `DAT_SUC.IVA_INTEGRADO`, `tipotran` y `rqfac`.
- valida formas (`EFECTIVO`, `TARJETA`, `CHEQUE`, `TRANSFERENCIA`, `DEPOSITO 3RO`, `CREDITO`, `DEUDOR`) y restricciones.
- para `TARJETA/CHEQUE/TRANSFERENCIA/DEPOSITO 3RO`, valida `aut=IDREF` existente en `REF_DETALLE`, mismo `IDFOL`, `ESTATUS='PROCESADO'` y datos completos.
- bloquea cierre si existen referencias del folio en `CAPTURADO/PROCESADO` no utilizadas en `formas.aut`.
- Cierre transaccional:
- el endpoint `POST /pv/cotizaciones/:idfol/cierre` ejecuta `dbo.sp_pv_cotizacion_cerrar`; si el SP no existe, devuelve error indicando ejecutar `sql/sp_pv_cotizacion_cerrar_create.sql`.
- el service de cierre no envuelve al SP en una transaccion TypeORM adicional (evita `EABORT`/`Transaction has been aborted` por doble manejo transaccional); el SP mantiene la atomicidad.
- errores SQL del SP se mapean a `400/409` con mensaje de negocio en lugar de `500` generico.
- reescribe `PV_CTR_FOL_FORM_SVR` si existe; fallback `PV_CTR_FOL_FORM`.
- en formas `CREDITO`/`DEUDOR` guarda `AUT=IDFOL` y `IMPP` positivo en la tabla de formas.
- en cualquier forma (`CA` o `VF`), guarda `IMPD` con el total final de la cotizacion (costo total de articulos segun reglas de IVA/cierre), no con el importe capturado por forma.
- valida `CREDITO` con `FACT_CLIENT_SHP.L_CRED - SUM(ABS(DAT_CTRL_CTAS.IMPT))` filtrando `CTA='101001002'` y `CLIENT`.
- registra cargo para `CREDITO`/`DEUDOR` en `DAT_CTRL_CTAS` (`CMOV=602`, `CTA='101001002'`, `CLIENT`, `IDFOL`, `NDOC`, `IMPT` negativo).
- compatibilidad de columnas en cargo `DAT_CTRL_CTAS`: usa `CMOV` o `CLSD` (lo que exista), y llena `FCND`/`RTXT` cuando esas columnas existen.
- genera `NDOC` concurrente en transaccion (lock transaccional + max numerico), base `N6000001+`.
- el calculo de maximo `NDOC` usa SQL dinamico con `COL_LENGTH` para evitar `Invalid column name 'NDOC'` en esquemas legacy donde la columna no existe en alguna tabla auxiliar.
- no permite que `sum(formas.impp)` exceda el total del cierre, excepto cuando hay `EFECTIVO` (se permite excedente para cambio).
- actualiza `PV_CTR_FOL_ASVR` a `ESTA='PAGADO'` al finalizar cierre, `IMPT=TOTAL` y `AUT` con `CA` o `VF` segun `tipotran`.
- el cambio a `ESTA='TRANSMITIR'` queda en el flujo de salida de frontend (PATCH al regresar desde pago con estado pagado).
- actualiza `PV_CTR_ORDS.ESTATUS = 2` para las ordenes del `IDFOL` cerrado.
- rollback completo ante error (sin estados parciales).
- Endpoint de impresion de cierre (`GET /pv/cotizaciones/:idfol/cierre/print-preview`):
- retorna payload consolidado para PDF con: cabecera sucursal (`DAT_SUC`), detalle de articulos (`PV_TICKET_LOG`), totales+formas+cambio (`PV_CTR_FOL_FORM_SVR` fallback `PV_CTR_FOL_FORM`), pie transaccional (`PV_CTR_FOL_ASVR` + nombre OPV de `PV_OPV` + cliente de `FACT_CLIENT_SHP`) y ORDs con detalle (`PV_CTR_ORDS` + `PV_CTR_ORDS_DET`) por `IDFOL`.
- trazabilidad UI de impresion: frontend aplica formato ticket 58/80 sin titulo repetitivo (`COTIZACION FINALIZADA`) ni `IDFOL` superior.
- trazabilidad UI de impresion: frontend aplica margen izquierdo fijo de `2mm` en tickets 58/80.
- trazabilidad UI de impresion: en `tipotran=CA`, la app omite subtotal/IVA/total final/pagos/faltante/cambio y oculta `FORMAS`; mantiene TRANSACCION y ORDs.
- trazabilidad UI de impresion: en ORDs se imprime `ORD` + `UPC`, descripcion + `TIPO`, codigo de barras `CODE39` por ORD y tabla con bordes `JOB/ESF/CIL/EJE` desde `PV_CTR_ORDS_DET`; no muestra `EST` ni `ART` en cabecera ORD.
- trazabilidad UI de impresion: en tabla ORD no se imprimen guiones para celdas vacias.
- trazabilidad UI de impresion: se agrega bloque `RESUMEN DE ORDS` entre `TRANSACCION` y `ORDS` con `ORD`, descripcion y `UPC`.
- trazabilidad UI de impresion: en `DETALLE` de ticket se imprime `UPC` por renglon y alternancia visual gris/blanco.
- trazabilidad UI de impresion: cada bloque de `ORD` inicia con linea de recorte e icono de recorte.
- trazabilidad UI de impresion: frontend estima altura dinamica del ticket segun contenido para reducir hojas sobrantes y conservar multihoja solo cuando el contenido lo exige.
- trazabilidad UI de impresion: frontend aplica margen izquierdo explicito de `2mm` en `MultiPage` para 58/80 y evitar contenido pegado al borde.
- trazabilidad UI de impresion: frontend recalibra altura dinamica de 80mm con estimacion mas conservadora (lineas/tablas/buffer por ORDs) para disminuir hoja extra; formato 58mm sin cambio funcional.

## Punto de venta: devoluciones de cotizacion/venta/apartado (implementado 2026-02)

- Modulo NestJS:
- `src/modules/pv-devoluciones/pv-devoluciones.module.ts`
- `src/modules/pv-devoluciones/pv-devoluciones.controller.ts`
- `src/modules/pv-devoluciones/pv-devoluciones.service.ts`
- `src/modules/pv-devoluciones/dto/*`
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
- Validaciones núcleo:
- alta exige contraseña de supervisor `SUPERPV` (401 contraseña inválida, 403 usuario sin rol supervisor).
- folio origen debe tener `AUT in ('VF','CA','APF')`.
- bloqueo por facturación: si `FAC_SVR_SHAP.ESTATUS='FACTURADO'` para el folio origen, responde `409` con mensaje de negocio.
- bloqueo por ORD: si la línea tiene ORD con `ESTSEGU >= ORD_BLOCK_THRESHOLD`, no permite devolución.
- `ORD_BLOCK_THRESHOLD` configurable por `PV_DEV_ORD_BLOCK_THRESHOLD` (default `5`).
- Reglas de detalle:
- staging temporal en `PV_DEV_DET_TMP` (script `sql/PV_DEV_DET_TMP_create.sql`).
- única edición permitida: `CTDD`.
- `POST .../devolver-todo` asigna `CTDD=DIFD` salvo líneas con ORD bloqueante (`CTDD=NULL`).
- regla ORD no bloqueante: solo permite devolución completa (`CTDD == CTD`).
- preparación de detalle: `POST .../detalle/preparar` valida líneas seleccionadas e inserta en `PV_TICKET_LOG` del folio devolución únicamente renglones con `CTDD>0` (flujo idempotente por `DELETE + INSERT`).
- Reglas de pago/finalización:
- preview calcula `subtotal/iva/total` con la misma lógica de IVA del cierre de cotización (`DAT_SUC.IVA_INTEGRADO`, `REQF`, `tipotran` derivado del folio origen).
- preview sugiere formas según forma original; en origen `CREDITO/DEUDOR` divide sugerencia entre crédito/deudor y efectivo usando saldo por `DAT_CTRL_CTAS`.
- trazabilidad UI (app): en pago de devolución, `RQFAC` se consume desde preview/contexto del origen y se mantiene en solo lectura (sin edición manual).
- trazabilidad UI (app): en pago de devolución no se permite agregar, editar ni eliminar formas desde frontend.
- trazabilidad UI (app): cuando una devolución queda en `PAGADO`, app muestra candado para salida y al presionarlo ejecuta `PATCH /pvctrfolasvr/:idfol` con `ESTA='TRANSMITIR'`.
- `GET /pv/devoluciones` filtra panel exclusivamente por `ESTA IN ('DEV PEND','PAGADO')` para ambas ramas (`OPV` y `OPVM`).
- trazabilidad UI (app): desde panel, folios de devolución en `PAGADO` abren directo en `/pago` (sin pasar por selección/detalle).
- trazabilidad API/UI (app): tras finalizar devolución, la impresión de ticket se ejecuta con botón explícito y flujo 58mm/80mm consumiendo `GET /pv/devoluciones/:idfolDev/print-preview`.
- finalización transaccional:
- inserta control en `FACT_IDFOLDEV` (`IDFOLDEV`, `IDFOL_OR`, `NART`, `IMPTD`, `TIPOT='DF'` según columnas disponibles).
- aplica `CTDDF += CTDD` en líneas originales de `PV_TICKET_LOG`.
- genera ticket de devolución en `PV_TICKET_LOG` del folio devolución.
- reescribe formas en `PV_CTR_FOL_FORM_SVR` (fallback `PV_CTR_FOL_FORM`) con importes negativos y `AUT=idfolDev` para `CREDITO/DEUDOR`.
- en formas `CREDITO/DEUDOR`, registra movimientos de abono en `DAT_CTR_DOC` (si existe) y `DAT_CTRL_CTAS` con clase `611/612`, `CTA='101001002'`, `NDOC` concurrente (`N6100001+`).
- anula ORDs afectadas con `PV_CTR_ORDS.ESTATUS=4`.
- deja folio devolución en `ESTA='PAGADO'` y `AUT='DF'/'APDF'`; el paso a `TRANSMITIR` se realiza posteriormente vía `PATCH /pvctrfolasvr/:idfol` desde frontend.

## Punto de venta: alta de cotizacion desde panel (trazabilidad app)

- Flujo frontend actualizado: despues de confirmar alta en panel de cotizaciones, la app abre modal para buscar/seleccionar cliente de la SUC del usuario logueado.
- La app usa `GET /factclientshp` para listado y filtra por SUC en frontend.
- Tras `POST /pvctrfolasvr/auto`, la app asigna cliente al folio via `PATCH /pvctrfolasvr/:idfol` enviando `CLIEN`.
- Correccion backend (2026-02): `PV_CTR_FOL_ASVR.CLIEN` se mapea como `float` en entidad TypeORM (no `int`) para soportar IDs de cliente > `2,147,483,647` y evitar `EPARAM` en `PATCH /pvctrfolasvr/:idfol`.
- Este ajuste no introduce endpoints nuevos ni cambia contratos API existentes.

## Reloj Checador (asistencia) - implementado (2026-02)

- Modulo NestJS:
- `src/modules/reloj-checador/reloj-checador.module.ts`
- `src/modules/reloj-checador/reloj-checador.controller.ts`
- `src/modules/reloj-checador/reloj-checador.service.ts`
- `src/modules/reloj-checador/dto/*`
- registrado en `src/app.module.ts`.
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
- carpeta `sql/reloj_checador/` con scripts `001..007` de tablas y `101..115` de SPs.
- Reglas core en SP de marcaje (`sp_att_timelog_create`):
- validacion de SUC/usuario/enum, secuencia diaria, geocerca, ventanas, liveness.
- lock de concurrencia para evitar doble marcaje.
- insercion en `ATT_TIME_LOG` inmutable (`LOCKED=1`).
- alertas de overtime diario/semanal en `ATT_ALERTA` sin bloquear marcaje.
- Auditoria obligatoria:
- operaciones criticas insertan en `dbo.AUDIT_LOG` usando `MODULO='reloj_checador'`.
- metadata incluye `url`, `method`, `body` (sin binarios), y `before/after` cuando aplica.
- Correcciones admin:
- `sp_att_timelog_admin_update` guarda `before/after` + `reason` y registra `ACTION='ADMIN_UPDATE'`.
- Manejo de errores HTTP:
- reglas de secuencia/ventana/geocerca/liveness => `409`.
- validaciones de entrada => `400`.
- autorizacion por rol/alcance => `403`.

## Stored procedures y consultas clave

- Inventarios:
- `sp_cont_upload_clear`, `sp_cont_build_det_svr`, `sp_cont_sync_captura_art`, `sp_cont_apply_adjustment`.
- MB51/MB52:
- `sp_dat_mb51_search`, `sp_dat_mb52_resumen`.
- Catalogo articulos:
- `sp_datart_massive_apply`, `sp_art_masiva_validate_batch`, `sp_art_masiva_commit_batch`.
- Punto de venta y clientes:
- `sp_factclientshp_create`, `sp_pvctrfolasvr_create`, `sp_pv_ctr_ords_create_from_quote_line`, `sp_pv_cotizacion_cerrar`.
- Scripts de esquema PV:
- `sql/DAT_FORM_schema_alter.sql` agrega `IDFORM` identity como PK y `ESTADO` para activar/bloquear visibilidad de formas de pago.
- `sql/PV_CTR_ORDS_CLIEN_float.sql` ajusta `PV_CTR_ORDS.CLIEN` a `FLOAT` para soportar IDs grandes.
- `sql/PV_DEV_DET_TMP_create.sql` crea/ajusta staging de líneas para devoluciones PV.
- Control de cuentas:
- `sp_ctrlctas_resumen_cliente`, `sp_ctrlctas_resumen_transaccion`, `sp_ctrlctas_detalle_transaccion`.

## Ejecucion (watch)

- `nest-cli.json` usa `compilerOptions.deleteOutDir=false` para evitar errores intermitentes `Cannot find module ...\\dist\\main` en ciclos de compilacion incremental.

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
