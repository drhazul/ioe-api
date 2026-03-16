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
- `users`: `USUARIO` (`IDUSUARIO`, `USERNAME`, `NOMBRE`, `APELLIDOS`, `MAIL`, `ESTATUS`, `NIVEL`, `IDROL`, `IDDEPTO`, `IDPUESTO`, `SUC`, `FORZAR_CAMBIO_PASS`).
- validacion `users`: `USERNAME` requiere minimo 3 caracteres.
- alta usuarios (2026-03): backend acepta `PASSWORD` opcional; cuando no llega, genera contraseña temporal aleatoria de 6 dígitos y responde `PASSWORD_TEMPORAL`.
- primer acceso (2026-03): al crear usuario se marca `FORZAR_CAMBIO_PASS=1`; login JWT incluye claim `mustChangePassword`; `POST /auth/change-password` actualiza contraseña y limpia la marca.
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
- Trazabilidad app (2026-03): `ioe_app` agregó impresión de etiquetas en `datart_page.dart` (selección local por renglón/filtrados + impresión masiva), usando endpoints existentes de `datart` sin cambios de contrato API.
- Regla EAN13 en app: para `UPC` mayor a 12 dígitos, frontend usa los 12 dígitos derechos para calcular dígito verificador y renderizar código de barras en etiqueta `76mm x 56mm` (una página por artículo).
- Detalle cotización DAT_ART (2026-03-12): `GET /datart` soporta `sucExact=true` para resolver `SUC = @SUC` y `bloqNe=-1` para aplicar visibilidad `BLOQ IS NULL OR BLOQ <> -1` desde SQL/TypeORM; `ioe_app` usa estos parámetros en `detalle_cot`.
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
- compatibilidad histórica `ctrl-ctas` (2026-03): en `POST /ctrl-ctas/consulta/*`, API ejecuta SQL directo (sin depender de SP legacy para estos reportes), normaliza `FCND`, rellena faltantes (`fecIni`/`fecFin`) con `1900-01-01` y `2100-12-31`, e incluye filas legacy con `SUC` nulo/vacío cuando hay filtro por sucursal.
- `cat-ctas`: `DAT_CAT_CTAS` (`CTA`, `DCTA`, `RELACION`, `SUC`), con autorizacion por `USR_MOD_SUC`.

### Punto de venta / referencias

- `factclientshp`: `FACT_CLIENT_SHP` (`IDC`, `CLIEN_UNI`, `RazonSocialReceptor`, `RfcReceptor`, `UsoCfdi`, `SUC`, ...).
- Integración UI clientes PV (2026-03): la app puede enviar defaults de alta `RFCEMISOR='SELECCIONAR'`, `USOCFDI='SELECCIONAR'`, `REGIMENFISCALRECEPTOR=0` (sentinela numérico de selección) y `EMAILRECEPTOR='COLOCAR'`; el backend mantiene aceptación con validación de no-vacío/numérica vigente.
- `pvctrfolasvr`: `PV_CTR_FOL_ASVR` (`IDFOL`, `CLIEN`, `SUC`, `OPV`, `ESTA`, `IMPT`, ...).
- `facturacion`: endpoints `/facturacion/*` para pendientes/validación/emisión/seguimiento/cancelación sobre `FAC_SVR_SHAP` + `FACT_TICKET_SHP`.
- compatibilidad facturación legacy (2026-03-13): `FacturacionService` detecta columnas disponibles de `FAC_SVR_SHAP` y resuelve `AUT` con fallback `TIPOVTA` (o `NULL`), además de fallback en `REQF/RQFAC`, `FormaPagoSAT` y `Exportacion` para evitar `500 Invalid column name 'AUT'`.
- facturación pendientes paginada (2026-03-13): `GET /facturacion/pendientes` ahora acepta `page`, `pageSize`, `suc`, `estatus`, `razonSocialReceptor`, `rfcReceptor`, `clien`, `idFol`, `tipoFact`.
- facturación pendientes paginada (2026-03-13): el filtrado se aplica server-side sobre todo el universo (`ESTATUS IN ('PENDIENTE','CANCELACION PENDIENTE')`) y ordena por `FCN DESC`.
- facturación pendientes paginada (2026-03-13): la respuesta incluye `data`, `total`, `page`, `pageSize`, `totalPages`, `hasPrevPage`, `hasNextPage`.
- facturación pendientes base SQL (2026-03-13): la consulta de listado parte de `SELECT FAC_SVR_SHAP.* FROM FAC_SVR_SHAP WHERE ESTATUS IN ('PENDIENTE','CANCELACION PENDIENTE') ORDER BY FCN DESC`; los filtros opcionales se agregan encima de esa base.
- facturación pendientes formato IMPT (2026-03-15): el backend redondea `IMPT` a 2 decimales en la respuesta de `GET /facturacion/pendientes` para evitar variaciones por precisión.
- validación facturación detalle (2026-03-14): `GET /facturacion/:idFol/validar` incorpora `detalleArticulos` (fuente `FACT_TICKET_SHP`) con columnas `IDFOL`, `UPC`, `Descripcion`, `ClaveProdServ`, `Unidad`, `Cantidad`, `ValorUnitario`, `PVTAT`, `Impuesto`, `Total`, además de `totalesDetalle` para UI.
- validación facturación redondeo (2026-03-14): en `GET /facturacion/:idFol/validar`, la conciliación de importes usa redondeo fijo a 2 decimales para `totales.cabecera`, `totales.detalle` y `totales.diferencia`, evitando ruido por precisiones mayores.
- almacenamiento CFDI con alternancia (2026-03-15): `FacturacionService.saveCfdiArtifacts` intenta guardado en rutas candidatas (`CFDI_STORAGE_BASE_PATH`, `CFDI_STORAGE_BASE_PATH_ALT`, `CFDI_STORAGE_BASE_PATH_DEV/PROD`, `CFDI_STORAGE_BASE_PATHS` y defaults por SO); ante error en una ruta, prueba la siguiente.
- conciliación facturación en origen VF (2026-03-15): `sp_fact_sync_folio_vf` recalcula al final `FAC_SVR_SHAP.IMPT` desde `FACT_TICKET_SHP` con suma por renglón `ROUND(PVTAT + ROUND(PVTAT*0.16,2),2)` para evitar descuadres de centavos entre cabecera y detalle.
- saneamiento histórico facturación (2026-03-15): `sql/2026-03-15_facturacion_reconcile_impt_from_detail.sql` corrige folios existentes (`PENDIENTE`/`CANCELACION PENDIENTE`) ajustando `FAC_SVR_SHAP.IMPT` con base en su detalle.
- trazabilidad UI facturación (2026-03-15): mejoras visuales de grilla en `ioe_app` (scroll horizontal visible, alineación de encabezados/valores y formato `IMPT` a 2 decimales) no requieren cambios backend.
- trazabilidad UI facturación tipografía (2026-03-15): `ioe_app` incorpora modal de configuración visual para ajustar escala global y fuentes por componente (AppBar, títulos, labels, body, botones y tabla), sin impacto de contrato API.
- trazabilidad UI facturación columnas (2026-03-15): `ioe_app` habilita ajuste persistente de ancho por columna/separación entre campos (`SharedPreferences`) y separadores arrastrables en encabezado de grilla, sin cambios backend.
- facturación pendientes seguridad funcional (2026-03-13): el endpoint no fuerza `SUC` por token; la sucursal se controla mediante el filtro explícito `suc` cuando el usuario la captura.
- unificación facturación sucursal JWT (2026-03-16): `POST /facturacion/unificaciones/preview` y `POST /facturacion/unificaciones` no deben forzar `@SUC` desde `user.suc` para usuarios con permiso de gestión (`FACTURA`/compat), evitando bloqueos falsos por "folios fuera de la sucursal autorizada".
- `GET /pvctrfolasvr` (optimizacion 2026-03): soporta query params `suc`, `opv`, `search` para panel de cotizaciones, con filtro SQL por `ESTA IN ('PENDIENTE','EDITANDO','PAGADO')` y busqueda por `IDFOL`/`IDFOLINICIAL`/cliente.
- Compatibilidad query cotizaciones (2026-03): `ListPvCtrFolAsvrQueryDto` tolera parametro opcional `_` para clientes legacy que usen cache-buster, evitando `400 property _ should not exist`.
- `GET /pvctrfolasvr` (2026-03): incluye `RazonSocialReceptor` en la respuesta (join a `FACT_CLIENT_SHP`) para visualizacion de panel en app.
- `GET /pvctrfolasvr/:idfol` (2026-03): retorna vista de lectura con `RazonSocialReceptor` (join a `FACT_CLIENT_SHP`) y resuelve por `IDFOL` actual o `IDFOLINICIAL` para compatibilidad cuando el folio visible cambia de `CP` a `CA/VF`.
- Trazabilidad UI cotizaciones (2026-03-10): búsqueda por OPV desde `search` permite búsqueda cruzada entre OPV solo para folios con `AUT='CP'` y `ESTA='PENDIENTE'`.
- Trazabilidad UI paneles (2026-03-10): cotizaciones/devoluciones/PS ejecutan anulación lógica vía `PATCH /pvctrfolasvr/:idfol` con `ESTA='ANULADO'` (sin `DELETE` físico), habilitada solo para filas en `PENDIENTE`.
- `pvctrfolform`: `PV_CTR_FOL_FORM` (`IDF`, `IDFOL`, `FORM`, `IMPA`, `IMPP`, `IMPC`, `IMPD`, ...).
- `pvctrords`: `PV_CTR_ORDS` (`IORD`, `IDFOL`, `ART`, `CTD`, `SUC`, `ESTATUS`, ...).
- `pvctrordsdet`: `PV_CTR_ORDS_DET` (`IORDP`, `IORD`, `ART`, `JOB`, `ESF`, `CIL`, `EJE`).
- `pvticketlog`: `PV_TICKET_LOG` (`ID`, `IDFOL`, `ART`, `UPC`, `CTD`, `PVTA`, `CTDD`, `CTDDF`, `UPDATED_AT`).
- `pv-devoluciones`: flujo transaccional de devoluciones PV sobre `PV_CTR_FOL_ASVR`, `PV_TICKET_LOG`, `PV_CTR_FOL_FORM(_SVR)`, `PV_CTR_ORDS`, `FAC_SVR_SHAP`, `FACT_IDFOLDEV`, `DAT_CTRL_CTAS`.
- `pagos-servicios`: flujo PS sobre `PV_CTR_FOL_ASVR`, `PV_TICKET_LOG`, `PV_CTR_FOL_FORM`, `DAT_CTRL_CTAS`, `PV_DAT_PS`, `DAT_REF_GTO`.
- PS cliente: endpoint `PUT /ps/folios/:idFol/cliente` actualiza `PV_CTR_FOL_ASVR.CLIEN`; regla bloqueante cuando ya existen líneas en `PV_TICKET_LOG`.
- Script PS crea/siembra `PV_TIPO_ESTA` con `RELACION` (AD/AP/CR/DC/DG -> PAD/PAP/PCR/PDC/PDG) para normalizar `AUT` al agregar primer servicio.
- Adeudos PS soporta clientes grandes: `sp_ps_adeudos_cliente(@CLIENT BIGINT)` con filtros `TRY_CONVERT(BIGINT, CLIENT)`.
- Adeudos PS fuente primaria (2026-03): `sp_ps_adeudos_cliente` consulta `DAT_CTRL_CTAS` agrupando por `SUC/CLIENT/CTA/IDFOL`; `ADEUDOS_RES_JSON` se forma desde ese agregado con `ADEUDO < 0`.
- Referencia folio PS (2026-03): `sp_ps_ticket_set_reference_folio` quedó depurado para no depender de `DAT_CTRL_CTAS_RES`; valida/toma el folio de referencia directamente desde `DAT_CTRL_CTAS` del cliente activo del folio PS.
- Cálculo adeudo PS (2026-03-03): `sp_ps_ticket_set_reference_folio` y `sp_ps_ticket_update_pvta` consolidan `DAT_CTRL_CTAS` por `IDFOL/NDOC + RELACION` para validar referencia y límite de importe sin falsos positivos por mezcla de cargos/abonos.
- Regla AD/AP/CR (2026-03-03): `sp_ps_ticket_update_pvta` impide que `PVTA` por línea supere la deuda del folio referenciado y controla saldo acumulado por `ORD` sumando líneas `AD/AP/CR` del ticket.
- Trazabilidad UI PS pago (2026-03): la app mueve el flujo de cierre a `PAGADO -> impresion -> TRANSMITIR`; el backend confirma `PAGADO` en `POST /ps/folios/:idFol/finalizar` y la salida a `TRANSMITIR` se mantiene con `PATCH /pvctrfolasvr/:idfol`.
- Trazabilidad UI PS pago (2026-03): el modal de formas en app excluye `CREDITO/DEUDOR`; para formas no `EFECTIVO`, la referencia se captura reutilizando `ref_detalle_page.dart` de cotizaciones y se envía en `aut`.
- Referencia folio PS (2026-03): se mantiene bloqueo de referencia repetida entre líneas del mismo ticket (`ORD` ya usado en otra línea => rechazo).
- Formas PS (2026-03): `sp_ps_form_summary` prioriza `PV_CTR_FOL_FORM`; el cierre definitivo de pago se procesa en `sp_ps_pago_finalize` (inserta formas y movimientos contables al finalizar).
- `refdetalle`: `REF_DETALLE` (`IDREF`, `SUC`, `FCNR`, `FCND`, `OPV`, `IDFOL`, `IDC`, `RFCEMISOR`, `TIPO`, `IMPT`, `ESTATUS`).
- `pv/refdetalle`: flujo PV para crear/asignar/eliminar referencia ligada a folio, sobre `REF_DETALLE`.
- `cajon-estado`: resumen diario por OPV en base a `DAT_FORM`, `PV_CTR_FOL_ASVR`, `PV_CTR_FOL_FORM`, `DAT_RET_CTR_SVR`, `DAT_RET_DET_SVR`.
- Endpoints `cajon-estado`:
  - `POST /cajon-estado/autorizar` (valida contraseña de rol `SUPERVISOR` y emite token de sesión para visualización de estado de cajón).
  - `GET /cajon-estado/resumen?fecha=YYYY-MM-DD` (requiere JWT + header `X-Cajon-Estado-Token`; ejecuta `dbo.sp_cajon_estado_resumen`).
- `PATCH /pvticketlog/:id/precio`: actualiza `PVTA/PVTAT` con autorizacion de supervisor PV.
- `POST /pvticketlog/precio/authorize`: valida contraseña de `SUPERPV` para habilitar captura de nuevo importe en frontend.
- Regla autorizacion precio PV:
- si solicitante tiene rol `SUPERPV`, autoriza directo.
- si no es `SUPERPV`, exige `AUTH_PASSWORD` valida de cualquier usuario activo con rol `SUPERPV`.
- Compatibilidad frontend (2026-03): el cliente puede intentar `PATCH /pvticketlog/:id/precio` sin `AUTH_PASSWORD`; si backend detecta no-`SUPERPV`, responde `403` para que frontend solicite autorizacion y reintente con `AUTH_PASSWORD`.
- `PATCH /pvticketlog/:id` (update general) ya no permite editar `PVTA`; para precio se exige el endpoint dedicado.
- Auditoria especifica: al cambiar precio se registra `ACTION='PVTA_OVERRIDE'` en `AUDIT_LOG` con metadata de antes/despues y autorizador.
- `AUDIT_LOG.IDUSUARIO` en `PVTA_OVERRIDE` corresponde al `IDUSUARIO` del `SUPERPV` que autorizo (o al mismo usuario cuando el solicitante ya es `SUPERPV`).
- `datretctrsvr`, `datretdetsvr`, `datretdetefecsvr`: tablas de retorno en flujo de venta.
- `retiros`: modulo de negocio para retiros parciales sobre `DAT_RET_CTR_SVR`, `DAT_RET_DET_SVR`, `DAT_RET_DET_EFEC_SVR` y catalogo `VW_PV_FORM_TIPOTRAN_DISTINCT`.
- Endpoints retiros:
  - `POST /retiros`
  - `GET /retiros/today`
  - `GET /retiros/:idret`
  - `POST /retiros/:idret/detalles`
  - `PUT /retiros/detalles/:idfor/efectivo`
  - `DELETE /retiros/detalles/:idfor`
  - `POST /retiros/:idret/finalize`
  - `POST /retiros/:idret/cancel`
  - `GET /catalogos/formas-retiro`
- Reglas retiros:
  - solo 1 retiro `ABIERTO` por día para combinación `OPV+TER`.
  - `EFECTIVO` inicializa denominaciones `1000,500,200,100,50,20,10,5,2,1` y recalcula `IMPF` por `SUM(TOTAL)`.
  - finaliza solo con detalles y `IMPR > 0`; cancelación permitida solo en `ABIERTO`.
  - mutaciones registran auditoría en `AUDIT_LOG` con `MODULO='retiros'`.
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
- trazabilidad UI adicional: en `tipotran=CA`, el modal de formas expone `EFECTIVO` y `CREDITO`.
- trazabilidad UI adicional: `Autorizacion / referencia` y boton `Generar/Asignar referencia` solo aparecen en `TARJETA`, `CHEQUE`, `TRANSFERENCIA` y `DEPOSITO 3RO`.
- trazabilidad UI adicional: la referencia se crea/asigna en `REF_DETALLE` y se regresa `IDREF` al pago.
- trazabilidad UI tecnica: app corrigio generacion de id temporal de formas para web (`nextInt(0x100000000)`), sin impacto en contrato API.
- trazabilidad UI adicional: al registrar una forma de pago, app bloquea el cambio de tipo de cierre (`CA`/`VF`) hasta limpiar todas las formas; sin cambios de contrato API.
- trazabilidad UI adicional: `RQFAC` se renderiza en el AppBar de pago y los bloques de totales se muestran unificados en un solo card; sin cambios de endpoints/payload.
- trazabilidad UI adicional: app oculta visualmente `IVA integrado sucursal` en el resumen y fuerza recalculo de preview al reingresar a pago; sin cambios de contrato API.
- trazabilidad UI adicional: app persiste `RQFAC` en `PV_CTR_FOL_ASVR.REQF` al cambiar el switch, usando endpoint existente `PATCH /pvctrfolasvr/:idfol`; sin endpoint nuevo.
- trazabilidad API/UI adicional: al cierre exitoso, app no redirige automaticamente y habilita boton `Imprimir ticket`; al usarlo consume `GET /pv/cotizaciones/:idfol/cierre/print-preview` para la vista previa PDF.
- trazabilidad UI adicional (2026-03): en ticket de cotización, la app imprime al final voucher `SOPORTE RECEPCION PAGO` por cada forma no `EFECTIVO`.
- trazabilidad UI adicional (2026-03): el voucher de cotización incluye espacio en blanco para firma y renglón `Firma cliente` después de `FCN`.
- trazabilidad UI adicional (2026-03): en cotizaciones, la app separa vouchers en un segundo PDF; al cerrar la vista previa del ticket principal solicita confirmación y luego abre la vista previa de vouchers (sin cambios de contrato API).
- trazabilidad UI adicional (2026-03): se agrega línea de recorte entre `RESUMEN DE ORDS` y `ORDS`; `GRACIAS POR SU CONFIANZA` se imprime después de `RESUMEN DE ORDS` y antes del recorte hacia `ORDS`.
- trazabilidad UI adicional: app agrega prevalidacion de referencias sin usar (`GET /pv/refdetalle`) y bloquea finalizar en frontend si detecta `CAPTURADO/PROCESADO` no usados; backend mantiene validacion autoritativa.
- trazabilidad UI adicional: cuando detecta referencias sin usar en esa prevalidacion, app redirige a `.../cotizaciones/:idfol/ref-detalle` con la referencia detectada preseleccionada para gestionarla antes de cerrar.
- trazabilidad UI tecnica: app migro dialogos de seleccion a `RadioGroup` para eliminar warnings deprecated de Flutter 3.32; sin cambio de contrato API.
- trazabilidad UI adicional: en cierre `CA`, app fuerza `RQFAC=false` y persiste `REQF=0` en `PV_CTR_FOL_ASVR` antes de recalcular preview; no cambia endpoint/payload.
- trazabilidad API/UI adicional: al cerrar exitosamente, el backend persiste `PV_CTR_FOL_ASVR.ESTA='PAGADO'`; la app muestra pago en modo bloqueado para impresion/salida.
- trazabilidad UI adicional: al regresar desde pago en estado `PAGADO`, app usa `PATCH /pvctrfolasvr/:idfol` para pasar el folio a `ESTA='MB51PROCES'` y volver al panel.
- trazabilidad UI adicional: desde panel, si `ESTA='PAGADO'`, app abre directo la vista de pago (no detalle).
- trazabilidad UI adicional: el panel lista `PENDIENTE`, `EDITANDO` y `PAGADO` por `ESTA`, sin filtrar por `AUT`; `MB51PROCES` se usa como estado operativo de salida y no se muestra en panel.
- trazabilidad UI adicional: en `DetalleCotPage` se ocultan en AppBar los campos `IDFOLINICIAL`, `AUT`, `ESTA` y `ORIGEN_AUT`; no cambia contrato API ni payload de cotización.
- Reglas base del cierre:
- valida folio en `PV_CTR_FOL_ASVR` y articulos en `PV_TICKET_LOG`.
- `dbo.sp_pv_next_visible_folio` usa `DAT_FOLIOS_CONSEC` para reservar consecutivos visibles `CP/CA/VF` con formato `SUC-YYYYMMDD-TIPO-####`.
- `dbo.sp_pvctrfolasvr_create` genera el folio inicial visible `CP` con esa nomenclatura y fija `IDFOLINICIAL = IDFOL`.
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
- en cualquier forma (`CA` o `VF`), guarda `IMPD` por forma aplicada (`IMPP-IMPC`; en no-efectivo coincide con `IMPP`).
- `CREDITO` no se puede combinar con otras formas de pago dentro del mismo cierre.
- valida `CREDITO` con saldo neto de `DAT_CTRL_CTAS` (`SUM(IMPT)`) filtrando `CTA='101001002'` y `CLIENT`; disponible = `FACT_CLIENT_SHP.L_CRED - MAX(-SUM(IMPT), 0)` (cargos negativos consumen crédito y abonos positivos lo liberan).
- registra cargo para `CREDITO`/`DEUDOR` en `DAT_CTRL_CTAS` (`CMOV=602`, `CTA='101001002'`, `CLIENT`, `IDFOL`, `NDOC`, `IMPT` negativo).
- compatibilidad de columnas en cargo `DAT_CTRL_CTAS`: usa `CMOV` o `CLSD` (lo que exista), y llena `FCND`/`RTXT` cuando esas columnas existen.
- genera `NDOC` concurrente en transaccion (lock transaccional + max numerico), base `N6000001+`.
- el calculo de maximo `NDOC` usa SQL dinamico con `COL_LENGTH` para evitar `Invalid column name 'NDOC'` en esquemas legacy donde la columna no existe en alguna tabla auxiliar.
- no permite que `sum(formas.impp)` exceda el total del cierre, excepto cuando hay `EFECTIVO` (se permite excedente para cambio).
- actualiza `PV_CTR_FOL_ASVR` a `ESTA='PAGADO'` al finalizar cierre, `IMPT=TOTAL` y `AUT` con `CA` o `VF` segun `tipotran`.
- al finalizar cierre de cotización, backend ejecuta `dbo.sp_mb51_transmitir_folio` para insertar renglones en `DAT_MB51` y actualizar `DAT_ART.STOCK` por resumen `ART+SUC`; `ESTA` permanece en `PAGADO`.
- sincronización facturación VF (2026-03): en cierres `VF`, `sp_pv_cotizacion_cerrar` exige e invoca `dbo.sp_fact_sync_folio_vf` dentro de la misma transacción para upsert de `FAC_SVR_SHAP` y rebuild de `FACT_TICKET_SHP`.
- regla de elegibilidad facturación VF (2026-03): solo se sincronizan folios con `AUT='VF'` y `REQF=1`; cuando no cumple, la sincronización limpia cabecera/detalle en `FAC_SVR_SHAP`/`FACT_TICKET_SHP`.
- regla `Tipofact` en sincronización VF (2026-03): si el folio tiene al menos una forma `CREDITO` en `PV_CTR_FOL_FORM(_SVR)`, `FAC_SVR_SHAP.Tipofact='CREDITO'`; en otro caso se conserva `INDIVIDUAL`.
- política de fecha de finalización (2026-03): en `sp_pv_cotizacion_cerrar`, la fecha de proceso actual se aplica al cierre en `PV_CTR_FOL_FORM(_SVR).FCN`, `PV_CTR_FOL_ASVR.FCNM` y movimientos contables de `CREDITO/DEUDOR` (`DAT_CTR_DOC`/`DAT_CTRL_CTAS`).
- al cerrar `CP -> CA/VF`, el SP genera un nuevo `IDFOL` visible con `DAT_FOLIOS_CONSEC`, preserva `IDFOLINICIAL`, actualiza `ORIGEN_AUT` y religa `PV_TICKET_LOG`, `PV_CTR_ORDS` y `REF_DETALLE` al nuevo folio.
- el cambio a `ESTA='MB51PROCES'` queda en el flujo de salida de frontend (PATCH al regresar desde pago con estado pagado).
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

## Pago de Servicios PS (implementado 2026-03)

- Modulo backend:
- `src/modules/pagos-servicios/pagos-servicios.module.ts`
- `src/modules/pagos-servicios/pagos-servicios.controller.ts`
- `src/modules/pagos-servicios/pagos-servicios.service.ts`
- `src/modules/pagos-servicios/dto/*`
- Script SQL:
- `sql/sp_ps_module_create.sql` (catalogos `PV_DAT_PS` y `DAT_REF_GTO` + SPs `sp_ps_*`).
- Endpoints:
- `GET /ps/folios?suc&esta&search`
- `POST /ps/folios`
- `GET /ps/folios/:idFol`
- `POST /ps/folios/:idFol/ticket/service`
- `GET /ps/clientes/:client/adeudos`
- `GET /ps/clientes/:client/adeudos/:idFol/detalle`
- `POST /ps/folios/:idFol/ticket/reference/folio`
- `POST /ps/folios/:idFol/ticket/reference/gasto`
- `PUT /ps/folios/:idFol/ticket/pvta`
- `DELETE /ps/folios/:idFol/ticket/line`
- `POST /ps/folios/:idFol/procesar`
- `POST /ps/folios/:idFol/formas-pago`
- `DELETE /ps/folios/:idFol/formas-pago/:idF`
- `GET /ps/folios/:idFol/formas-pago/summary`
- `POST /ps/folios/:idFol/finalizar`
- `PATCH /pvctrfolasvr/:idfol` (usado por UI PS para salida/cambio de estado en `PV_CTR_FOL_ASVR`)
- Reglas clave:
- el ticket PS inserta servicio con `PVTA=NULL` y requiere captura posterior.
- `PUT /ps/folios/:idFol/ticket/pvta` valida `ORD` y tope de adeudo con la fuente `DAT_CTRL_CTAS` (misma consulta base de adeudos PS), aplicando saldo disponible por referencia en el ticket.
- `sp_ps_adeudos_cliente` resume adeudos desde `DAT_CTRL_CTAS` agrupando por `CLIENT, IDFOL` y `SUM(IMPT) <> 0` (fuente única para panel de adeudos PS).
- para `DG/DC`, `sp_ps_procesar` conserva `IMPT` negativo pero no inserta formas de pago automáticas.
- todas las mutaciones PS registran `AUDIT_LOG` en API (`MODULO='pago-servicios'`).
- trazabilidad UI (app): en `/ps/:idFol/pago`, el alta/eliminación de formas ocurre en appstate local; no hay inserción en BD hasta finalizar.
- trazabilidad UI (app): `POST /ps/folios/:idFol/finalizar` recibe lote de formas, inserta `PV_CTR_FOL_FORM` (`IMPP/IMPC/IMPD/AUT`) y registra líneas en `DAT_CTRL_CTAS` antes de actualizar `ESTA='PAGADO'`.
- política de fecha de finalización PS (2026-03): `sp_ps_pago_finalize` usa fecha de proceso actual para `PV_CTR_FOL_FORM.FCN`, `PV_CTR_FOL_ASVR.FCNM` y movimientos de `DAT_CTRL_CTAS` generados al cierre.
- trazabilidad API (2026-03): al insertar `DAT_CTRL_CTAS`, `CLSD` se toma de `DAT_CMOV.CMOV` con `RELACION=<UPC servicio>` y `TIPO='ABONO'`; sin mapeo, el cierre falla con error de negocio.
- trazabilidad UI (app): una forma distinta de `EFECTIVO` no puede exceder el restante por pagar (`total - pagado`) previo al cierre.
- trazabilidad UI (app): en PS detalle, `Procesar servicio` se ejecuta desde el AppBar.
- trazabilidad UI (app): en PS detalle, servicios `AD/AP/CR` requieren cliente válido (`CLIEN != 1`) antes de insertar línea.
- trazabilidad API (2026-03): `sp_ps_ticket_add_service` y servicio Nest rechazan `AD/AP/CR` cuando `CLIEN <= 1` (`Seleccione Cliente`).
- trazabilidad API/UI (2026-03): `GET /ps/clientes/:client/adeudos/:idFol/detalle` expone el detalle completo de `DAT_CTRL_CTAS` por folio para popup tabular de consulta en detalle PS.
- trazabilidad UI (app): en PS detalle, si ESTA IN ('PAGADO','TRANSMITIR') se bloquean componentes del body y solo queda disponible la navegación de salida.
- trazabilidad UI (app): en pago PS, AppBar usa flecha mientras `ESTA != PAGADO`; en `PAGADO` cambia a candado para salida a `TRANSMITIR`.
- trazabilidad UI (app, 2026-03): en impresión de ticket PS, la app agrega al final voucher `SOPORTE RECEPCION PAGO` por cada forma no `EFECTIVO`.
- trazabilidad UI (app, 2026-03): el voucher PS incluye espacio en blanco para firma y renglón `Firma cliente` después de `FCN`.
- trazabilidad UI (app, 2026-03): en PS, el voucher se genera en un segundo PDF; al cerrar la vista previa del ticket principal, la app solicita confirmación y luego abre la vista previa del voucher.
- trazabilidad UI (app, 2026-03): se agrega línea de recorte entre `RESUMEN DE ORDS` y `ORDS`; `GRACIAS POR SU CONFIANZA` se imprime después de `RESUMEN DE ORDS` y antes del recorte hacia `ORDS`.
- trazabilidad UI (app, 2026-03): el ticket PS quedó homologado al formato de cotizaciones con bloques `DETALLE`, `TOTALES`, `FORMAS`, `TRANSACCION`, `RESUMEN DE ORDS`, `ORDS` (barcode `CODE39` + tabla `JOB/ESF/CIL/EJE`) y vouchers por forma no `EFECTIVO`.
- trazabilidad UI (app): en panel PS, folios en `PAGADO` abren directo `/ps/:idFol/pago`.
- Validaciones núcleo:
- alta exige contraseña de supervisor `SUPERPV` (401 contraseña inválida, 403 usuario sin rol supervisor).
- creación devolución (2026-03): `sp_pvctrfolasvr_create` se ejecuta fuera de transacción TypeORM y la transacción local inicia después del `EXEC` para evitar desbalance `@@TRANCOUNT` (`Previous count = 1, current count = 0`).
- creación devolución (2026-03): si `sp_pvctrfolasvr_create` responde duplicado `PK_CTR_FOL`, API aplica fallback con lock transaccional (`sp_getapplock`) y generación incremental (`WHILE EXISTS`) para asegurar `IDFOL` único.
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
- trazabilidad UI (app, 2026-03): en `/punto-venta/devoluciones/:idfolDev/detalle`, la acción `Ir a pago` se movió al `AppBar` con icono de caja (`Icons.point_of_sale`) y ya no aparece en el bloque de acciones del body.
- trazabilidad UI (app, 2026-03): en el contexto visual de detalle devolución se ocultaron `AUT dev`, `AUT origen` y `Estado`; sin cambios de contrato API.
- Reglas de pago/finalización:
- preview calcula `subtotal/iva/total` con la misma lógica de IVA del cierre de cotización (`DAT_SUC.IVA_INTEGRADO`, `REQF`, `tipotran` derivado del folio origen).
- preview sugiere formas según forma original; en origen `CREDITO/DEUDOR` divide sugerencia entre crédito/deudor y efectivo usando saldo por `DAT_CTRL_CTAS`.
- trazabilidad UI (app): en pago de devolución, `RQFAC` se consume desde preview/contexto del origen y se mantiene en solo lectura (sin edición manual).
- trazabilidad UI (app, 2026-03): en `/punto-venta/devoluciones/:idfolDev/pago`, el card de contexto oculta `AUT dev`, `AUT origen`, `Tipo` y `Líneas seleccionadas`; sin cambios de API.
- trazabilidad UI (app): en pago de devolución no se permite agregar, editar ni eliminar formas desde frontend.
- trazabilidad UI (app, 2026-03-10): en pago devolución, frontend rehidrata siempre `formas` desde `preview.formasSugeridas` (folio origen) para devolver por mismo concepto en no-efectivo y preservar `aut/ref` para validación/aplicación backend.
- trazabilidad UI (app): cuando una devolución queda en `PAGADO`, app muestra candado para salida y al presionarlo ejecuta `PATCH /pvctrfolasvr/:idfol` con `ESTA='MB51PROCES'`.
- `GET /pv/devoluciones` filtra panel exclusivamente por `ESTA IN ('PENDIENTE','EDITANDO','PAGADO')` para ambas ramas (`OPV` y `OPVM`); `MB51PROCES` se conserva para salida operativa, no para listado de panel.
- trazabilidad UI (app): desde panel, folios de devolución en `PAGADO` abren directo en `/pago` (sin pasar por selección/detalle).
- trazabilidad UI (app, 2026-03): desde panel, si la devolución no está en `PAGADO` pero ya contiene selección previa (`linesSelected > 0` o alguna línea con `CTDD > 0` en `GET /pv/devoluciones/:idfolDev/detalle`), la navegación abre directo `/detalle`; sin selección previa, abre la vista de selección de artículos.
- trazabilidad API/UI (app): tras finalizar devolución, la impresión de ticket se ejecuta con botón explícito y flujo 58mm/80mm consumiendo `GET /pv/devoluciones/:idfolDev/print-preview`.
- trazabilidad UI (app, 2026-03): en ticket de devolución, la app imprime al final voucher `SOPORTE RECEPCION PAGO` por cada forma no `EFECTIVO`.
- trazabilidad UI (app, 2026-03): el voucher de devolución incluye espacio en blanco para firma y renglón `Firma cliente` después de `FCN`.
- trazabilidad UI (app, 2026-03): en devoluciones, el voucher se genera en un segundo PDF; al cerrar la vista previa del ticket principal, la app solicita confirmación y luego abre la vista previa del voucher.
- trazabilidad UI (app, 2026-03): se agrega línea de recorte entre `RESUMEN DE ORDS` y `ORDS`; `GRACIAS POR SU CONFIANZA` se imprime después de `RESUMEN DE ORDS` y antes del recorte hacia `ORDS`.
- trazabilidad UI (app, 2026-03): el ticket de devolución quedó homologado al formato de cotizaciones con bloques `DETALLE`, `TOTALES`, `FORMAS`, `TRANSACCION`, `RESUMEN DE ORDS`, `ORDS` (barcode `CODE39` + tabla `JOB/ESF/CIL/EJE`) y vouchers por forma no `EFECTIVO`.
- finalización transaccional:
- inserta control en `FACT_IDFOLDEV` (`IDFOLDEV`, `IDFOL_OR`, `NART`, `IMPTD`, `TIPOT='DF'` según columnas disponibles).
- aplica `CTDDF += CTDD` en líneas originales de `PV_TICKET_LOG`.
- genera ticket de devolución en `PV_TICKET_LOG` del folio devolución.
- reescribe formas en `PV_CTR_FOL_FORM_SVR` (fallback `PV_CTR_FOL_FORM`) con importes negativos y `AUT=idfolDev` para `CREDITO/DEUDOR`.
- reglas formas devolución (2026-03): en `CREDITO/DEUDOR`, `PV_CTR_FOL_FORM` persiste `IMPC=0` e `IMPD=0`; en `EFECTIVO`, `IMPC=IMPD`.
- en formas `CREDITO/DEUDOR`, registra abono en `DAT_CTR_DOC` (si existe) y `DAT_CTRL_CTAS` con `CTA='101001002'`, clase `601`, `RTXT='Abono por anulacion cliente ticket <folio origen>'` e `IDFOL=<folio origen>`; `NDOC` se usa cuando existe en esquema.
- compatibilidad NDOC devolución (2026-03): al generar consecutivo de `NDOC`, API solo consulta `NDOC` en `DAT_CTRL_CTAS`/`DAT_CTR_DOC` cuando la columna existe; en `DAT_CTRL_CTAS` el insert usa `NDOC` opcional según esquema para evitar `Invalid column name 'NDOC'`.
- política de fecha de finalización devolución (2026-03): al finalizar, API fija una sola fecha de proceso actual y la reutiliza en `FACT_IDFOLDEV` (`FCN/FCNR`), `PV_CTR_FOL_FORM(_SVR).FCN`, `PV_CTR_FOL_ASVR.FCNM`, `PV_TICKET_LOG.UPDATED_AT` y movimientos `DAT_CTR_DOC`/`DAT_CTRL_CTAS`.
- sincronización facturación devolución VF (2026-03-11): al finalizar una devolución con origen `VF`, la API ya no invoca `dbo.sp_fact_sync_folio_vf`; el flujo de devoluciones no escribe cabecera/detalle en `FAC_SVR_SHAP` ni `FACT_TICKET_SHP`.
- anula ORDs afectadas con `PV_CTR_ORDS.ESTATUS=4`.
- al finalizar pago de devolución, backend ejecuta `dbo.sp_mb51_transmitir_folio` para insertar renglones en `DAT_MB51` y ajustar `DAT_ART.STOCK` por resumen `ART+SUC`; `ESTA` permanece en `PAGADO`.
- deja folio devolución en `ESTA='PAGADO'` y `AUT='DF'/'APDF'`; el paso a `MB51PROCES` se realiza posteriormente vía `PATCH /pvctrfolasvr/:idfol` desde frontend.

## Punto de venta: alta de cotizacion desde panel (trazabilidad app)

- Flujo frontend actualizado: despues de confirmar alta en panel de cotizaciones, la app abre modal para buscar/seleccionar cliente de la SUC del usuario logueado.
- La app usa `GET /factclientshp` para listado y filtra por SUC en frontend.
- Tras `POST /pvctrfolasvr/auto`, la app asigna cliente al folio via `PATCH /pvctrfolasvr/:idfol` enviando `CLIEN`.
- Correccion backend (2026-02): `PV_CTR_FOL_ASVR.CLIEN` se mapea como `float` en entidad TypeORM (no `int`) para soportar IDs de cliente > `2,147,483,647` y evitar `EPARAM` en `PATCH /pvctrfolasvr/:idfol`.
- Compatibilidad facturación (2026-03): `FAC_SVR_SHAP.CLIEN` se ajusta a `FLOAT` para alinearlo con `PV_CTR_FOL_ASVR.CLIEN`; esto permite conservar IDs grandes de cliente (ej. `10460540001`) al sincronizar facturación.
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
- Script operativo MB51 (2026-03): `sql/mb51transmicion.sql` habilita `MB51PROCES`/`ANULADO` en la homologación de `ESTA`, preserva `TRANSMITIR` para PS, convierte estados legacy/no-PS a `MB51PROCES` y crea/actualiza `dbo.sp_mb51_transmitir_folio` (inserción lineal en `DAT_MB51` con resolución de conflicto de ID y ajuste de `DAT_ART.STOCK` por `ART+SUC`).
- Catalogo articulos:
- `sp_datart_massive_apply`, `sp_art_masiva_validate_batch`, `sp_art_masiva_commit_batch`.
- Punto de venta y clientes:
- `sp_factclientshp_create`, `sp_pvctrfolasvr_create`, `sp_pv_ctr_ords_create_from_quote_line`, `sp_pv_cotizacion_cerrar`.
- Facturación VF por evento:
- `sp_fact_sync_folio_vf`.
- Retiros parciales:
- `sql/sp_retiros_module_create.sql` (view `VW_PV_FORM_TIPOTRAN_DISTINCT`, FKs/índices y SPs `sp_ret_*`).
- Scripts de esquema PV:
- `sql/DAT_FORM_schema_alter.sql` agrega `IDFORM` identity como PK y `ESTADO` para activar/bloquear visibilidad de formas de pago.
- `sql/PV_CTR_ORDS_CLIEN_float.sql` ajusta `PV_CTR_ORDS.CLIEN` a `FLOAT` para soportar IDs grandes.
- `sql/FAC_SVR_SHAP_CLIEN_float.sql` alinea `FAC_SVR_SHAP.CLIEN` a `FLOAT` y aplica backfill desde `PV_CTR_FOL_ASVR`.
- `sql/2026-03-13_facturacion_aut_compat.sql` agrega columna `FAC_SVR_SHAP.AUT` si falta y hace backfill desde `TIPOVTA` para compatibilidad con consultas legacy de facturación.
- `sql/PV_DEV_DET_TMP_create.sql` crea/ajusta staging de líneas para devoluciones PV.
- `sql/sp_fact_sync_folio_vf_create.sql` crea/actualiza `dbo.sp_fact_sync_folio_vf` para sincronización idempotente de facturación en eventos VF.
- `sql/USUARIO_forzar_cambio_pass_alter.sql` agrega `FORZAR_CAMBIO_PASS` para controlar cambio obligatorio de contraseña en primer acceso.
- `sql/DAT_ART_idx_suc_bloq_detalle_cot_create.sql` crea índice `IX_DAT_ART_SUC_BLOQ_DETALLE_COT` para acelerar búsqueda de detalle cotización por `SUC` con filtro `BLOQ<>-1`.
- Estado de cajón OPV:
- `sql/sp_cajon_estado_resumen.sql` crea/actualiza `dbo.sp_cajon_estado_resumen` e índices de soporte para `PV_CTR_FOL_ASVR`, `PV_CTR_FOL_FORM`, `DAT_RET_CTR_SVR`, `DAT_RET_DET_SVR`.

## Estado de Cajón OPV (implementado 2026-03)

- Módulo NestJS:
  - `src/modules/cajon-estado/cajon-estado.module.ts`
  - `src/modules/cajon-estado/cajon-estado.controller.ts`
  - `src/modules/cajon-estado/cajon-estado.service.ts`
  - `src/modules/cajon-estado/dto/*`
  - `src/modules/cajon-estado/guards/cajon-estado-supervisor.guard.ts`
  - `src/modules/cajon-estado/cajon-estado-session.store.ts`
- Reglas:
  - `IMPT`: suma `PV_CTR_FOL_FORM.IMPD` por `IDFOL` relacionado, filtrando solo por `PV_CTR_FOL_ASVR.OPVM` y rango diario de `PV_CTR_FOL_ASVR.FCNM` (sin filtro por estatus).
  - `IMPR`: suma `DAT_RET_DET_SVR.IMPF` por forma, filtrando `DAT_RET_CTR_SVR.ESTA='FINALIZADO'` y rango diario de `FCNR`.
  - `IMPE`: `NULL` (pendiente Entrega a CG).
  - `DIFD`: `IMPT - IMPR - ISNULL(IMPE,0)`.
  - la autorización no usa vencimiento por tiempo en API; la app obliga reautorización al reingresar a la pantalla.
- Auditoría:
  - al autorizar: `ACTION='POST'`, `MODULO='cajon_estado'`, `ENTIDAD='autorizar'`.
  - al consultar resumen: `ACTION='GET'`, `MODULO='cajon_estado'`, `ENTIDAD='resumen'`.
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
- Trazabilidad UI (frontend): el filtro visual `!= 0` inicia desactivado por defecto en los tres niveles de la pantalla de resumen para mostrar todos los registros; el usuario puede activarlo manualmente (sin cambios de contrato API).

## Regla transversal: autorizacion por sucursal con USR_MOD_SUC

- Para cualquier modulo multi-sucursal, si existen filas activas en `USR_MOD_SUC` para `USUARIO + MODULO`, esas filas definen las sucursales permitidas para usuarios no-admin.
- Si el usuario tiene sucursales vinculadas en `USR_MOD_SUC`, debe poder consultar y procesar informacion en todas esas sucursales vinculadas (no solo `user.suc` del JWT).
- Admin (roleId `1`) mantiene bypass por rol.
- Compatibilidad legacy: cuando no existan filas activas en `USR_MOD_SUC` para ese modulo, se permite fallback a `user.suc`.
- Esta validacion debe ejecutarse en backend tanto en lectura como en escritura; el frontend solo refleja la seleccion permitida.

## Regla principal FACTURA / FACTURA_VIEW (obligatoria)

- Usar esta regla como base al crear endpoints, rutas y consultas de facturación.
- `FACTURA` (compat: `FACTURACION`, `PV_FACTURACION`, `FACT_IOE`) habilita operaciones de gestión (editar/emitir/cancelar/reversar).
- `FACTURA_VIEW` habilita operaciones de consulta.
- Admin (rol/nivel administrativo configurado por `ADMIN_ROLE_IDS`/`ADMIN_NIVELES`; incluye usuario `ADMIN`) tiene bypass total front/back para consultar/editar/eliminar en facturación; no requiere alta en enrolamientos ni permisos adicionales.
- Facturación no se autoriza por `USR_MOD_SUC`; no se debe exigir registro de admin en `USR_MOD_SUC`.
- En unificación de facturación (`/facturacion/unificaciones/*`), no restringir gestión por `user.suc` del JWT cuando el usuario ya cuenta con permisos de gestión de facturación.

## Caja General: autorizacion por sucursal

- En `caja-general`, la autorizacion no-admin debe resolverse por `USR_MOD_SUC` para modulos `DAT_FORM_ENTR_OPV`, `DAT_RES_ENTRE_CAJ` y `PV_ENTREGA_CG`.
- `CajaGeneralService.assertSucursalAccess` debe permitir operar cualquier `SUC` autorizada para esos modulos y rechazar sucursales fuera de esa interseccion.
- Si el usuario no tiene filas activas para esos modulos, aplica fallback legacy a `user.suc`.
- Exportacion Excel global (`GET /caja-general/global/excel`): la hoja `DETALLE TRANSACCIONES` debe incluir `REQF` proveniente de `PV_CTR_FOL_ASVR.REQF` en la consulta de detalle y conservar el valor original (`-1/0/1`), sin normalizarlo a booleano.
- Trazabilidad UI (ioe_app): los importes exportados en `RESUMEN DIA` y `DETALLE TRANSACCIONES` se escriben como numericos con formato moneda en Excel; no cambia contrato del endpoint.

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

