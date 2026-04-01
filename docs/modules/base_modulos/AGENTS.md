# Base de módulos (AGENTS API)

Navega a otros README/AGENTS solo cuando sea necesario.

Enlaces relacionados:
- AGENTS principal de la API: `AGENTS.md`
- README de este módulo: `docs/modules/base_modulos/README.md`
- Otros AGENTS: `docs/modules/core_seguridad/AGENTS.md`, `docs/modules/punto_venta/AGENTS.md`, `docs/modules/ordenes_trabajo/AGENTS.md`, `docs/modules/reloj_checador/AGENTS.md`

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
- Edición (2026-04): `PATCH /datart/:suc/:art/:upc` permite actualizar `UPC`; la API rechaza con `409` cuando el `UPC` ya está asignado a otro `ART` de la misma sucursal.
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
- compat admin `factclientshp` (2026-03-21): `FactClientShpService.isAdmin` se alinea con reglas transversales (`username='ADMIN'` y/o `ADMIN_ROLE_IDS`/`ADMIN_NIVELES`) para no forzar `user.suc` cuando admin opera multi-sucursal en cotizaciones/PS.
- Integración UI clientes PV (2026-03): la app puede enviar defaults de alta `RFCEMISOR='SELECCIONAR'`, `USOCFDI='SELECCIONAR'`, `REGIMENFISCALRECEPTOR=0` (sentinela numérico de selección) y `EMAILRECEPTOR='COLOCAR'`; el backend mantiene aceptación con validación de no-vacío/numérica vigente.
- `pvctrfolasvr`: `PV_CTR_FOL_ASVR` (`IDFOL`, `CLIEN`, `SUC`, `OPV`, `ESTA`, `IMPT`, ...).
- `facturacion`: endpoints `/facturacion/*` para pendientes/validación/emisión/seguimiento/cancelación sobre `FAC_SVR_SHAP` + `FACT_TICKET_SHP`.
- compatibilidad facturación legacy (2026-03-13): `FacturacionService` detecta columnas disponibles de `FAC_SVR_SHAP` y resuelve `AUT` con fallback `TIPOVTA` (o `NULL`), además de fallback en `REQF/RQFAC`, `FormaPagoSAT` y `Exportacion` para evitar `500 Invalid column name 'AUT'`.
- facturación pendientes paginada (2026-03-13): `GET /facturacion/pendientes` ahora acepta `page`, `pageSize`, `suc`, `estatus`, `razonSocialReceptor`, `rfcReceptor`, `clien`, `idFol`, `tipoFact`.
- facturación pendientes paginada (2026-03-13): el filtrado se aplica server-side sobre todo el universo (`ESTATUS IN ('PENDIENTE','CANCELACION PENDIENTE')`) y ordena por `FCN DESC`.
- facturación pendientes paginada (2026-03-13): la respuesta incluye `data`, `total`, `page`, `pageSize`, `totalPages`, `hasPrevPage`, `hasNextPage`.
- facturación paginación (2026-03-31): el pageSize por defecto de pendientes se ajusta a 100 (manteniendo tope 200) para reducir paginación.
- validación masiva por IDFOL (2026-04-01): `POST /facturacion/pendientes/validar-idfols` acepta `idFols` (máx. 500), normaliza duplicados/blancos y responde `validos` (solo ESTATUS `PENDIENTE`, respetando sucursal forzada en modo consulta) y `rechazados`; script `sql/2026-04-01_facturacion_validar_idfols.sql` crea el SP opcional.
- facturación pendientes base SQL (2026-03-13): la consulta de listado parte de `SELECT FAC_SVR_SHAP.* FROM FAC_SVR_SHAP WHERE ESTATUS IN ('PENDIENTE','CANCELACION PENDIENTE') ORDER BY FCN DESC`; los filtros opcionales se agregan encima de esa base.
- facturación pendientes formato IMPT (2026-03-15): el backend redondea `IMPT` a 2 decimales en la respuesta de `GET /facturacion/pendientes` para evitar variaciones por precisión.
- validación facturación detalle (2026-03-14): `GET /facturacion/:idFol/validar` incorpora `detalleArticulos` (fuente `FACT_TICKET_SHP`) con columnas `IDFOL`, `UPC`, `Descripcion`, `ClaveProdServ`, `Unidad`, `Cantidad`, `ValorUnitario`, `PVTAT`, `Impuesto`, `Total`, además de `totalesDetalle` para UI.
- validación facturación redondeo (2026-03-14): en `GET /facturacion/:idFol/validar`, la conciliación de importes usa redondeo fijo a 2 decimales para `totales.cabecera`, `totales.detalle` y `totales.diferencia`, evitando ruido por precisiones mayores.
- prevención CFDI40108 en pendientes (2026-03-23): `emitir` normaliza `factura.subtotal` al redondeo SAT de 2 decimales antes de timbrar; `validar` expone `subtotalSatCuadra/requiereAjusteSubtotalSat` para que frontend muestre trazabilidad del ajuste.
- nomenclatura CFDI Facturify (2026-03-27): el control SQL de serie/folio usa `SERIE=primeras 4 letras de RFCEMISOR` y `FOLIO` entero consecutivo global por serie (sin reset diario); la visual interna queda `JIFT-00001`, pero `toFacturifyPayload` envía `factura.folio` como entero puro para compatibilidad con Facturify.
- facturación filtro por error (2026-03-27): `GET /facturacion/pendientes` acepta `estatus='CON ERROR'` y resuelve registros por `CFDI_STATUS='ERROR'`, `CFDI_CANCEL_STATUS='ERROR'` o `CFDI_ERROR_MSG` informado.
- uso CFDI en timbrado (2026-03-23): `toFacturifyPayload` incluye `receptor.uso_cfdi` exclusivamente desde `FAC_SVR_SHAP.UsoCfdi` para evitar default implícito `G03`.
- sincronización uso CFDI en cierre VF (2026-03-23): `sp_fact_sync_folio_vf` obtiene `UsoCfdi` del cliente seleccionado del folio (`IDC=CLIEN`, con preferencia por `SUC` del folio) antes de insertar/actualizar cabecera `FAC_SVR_SHAP`.
- almacenamiento CFDI con alternancia (2026-03-15): `FacturacionService.saveCfdiArtifacts` intenta guardado en rutas candidatas (`CFDI_STORAGE_BASE_PATH`, `CFDI_STORAGE_BASE_PATH_ALT`, `CFDI_STORAGE_BASE_PATH_DEV/PROD`, `CFDI_STORAGE_BASE_PATHS` y defaults por SO); ante error en una ruta, prueba la siguiente.
- conciliación facturación en origen VF (2026-03-15): `sp_fact_sync_folio_vf` recalcula al final `FAC_SVR_SHAP.IMPT` desde `FACT_TICKET_SHP` con suma por renglón `ROUND(PVTAT + ROUND(PVTAT*0.16,2),2)` para evitar descuadres de centavos entre cabecera y detalle.
- saneamiento histórico facturación (2026-03-15): `sql/2026-03-15_facturacion_reconcile_impt_from_detail.sql` corrige folios existentes (`PENDIENTE`/`CANCELACION PENDIENTE`) ajustando `FAC_SVR_SHAP.IMPT` con base en su detalle.
- trazabilidad UI facturación (2026-03-15): mejoras visuales de grilla en `ioe_app` (scroll horizontal visible, alineación de encabezados/valores y formato `IMPT` a 2 decimales) no requieren cambios backend.
- trazabilidad UI facturación tipografía (2026-03-15): `ioe_app` incorpora modal de configuración visual para ajustar escala global y fuentes por componente (AppBar, títulos, labels, body, botones y tabla), sin impacto de contrato API.
- trazabilidad UI facturación columnas (2026-03-15): `ioe_app` habilita ajuste persistente de ancho por columna/separación entre campos (`SharedPreferences`) y separadores arrastrables en encabezado de grilla, sin cambios backend.
- facturación pendientes seguridad funcional (2026-03-13): el endpoint no fuerza `SUC` por token; la sucursal se controla mediante el filtro explícito `suc` cuando el usuario la captura.
- unificación facturación sucursal JWT (2026-03-16): `POST /facturacion/unificaciones/preview` y `POST /facturacion/unificaciones` no deben forzar `@SUC` desde `user.suc` para usuarios con permiso de gestión (`FACTURA`/compat), evitando bloqueos falsos por "folios fuera de la sucursal autorizada".
- REQF sin facturar (2026-03-16): `GET /facturacion/reqf/folios` exige módulo `REG_SINREQF` (o gestión `FACTURA`/compat) y aplica alcance de sucursales para no-admin mediante `USR_MOD_SUC` (`MODULO IN ('REG_SINREQF','FACTURA','FACTURACION','PV_FACTURACION','FACT_IOE')`), con fallback legado a `user.suc`.
- `GET /pvctrfolasvr` (optimizacion 2026-03): soporta query params `suc`, `opv`, `search` para panel de cotizaciones, con filtro SQL por `ESTA IN ('PENDIENTE','EDITANDO','PAGADO')` y busqueda por `IDFOL`/`IDFOLINICIAL`/cliente.
- Compatibilidad query cotizaciones (2026-03): `ListPvCtrFolAsvrQueryDto` tolera parametro opcional `_` para clientes legacy que usen cache-buster, evitando `400 property _ should not exist`.
- `GET /pvctrfolasvr` (2026-03): incluye `RazonSocialReceptor` en la respuesta (join a `FACT_CLIENT_SHP`) para visualizacion de panel en app.
- `GET /pvctrfolasvr/:idfol` (2026-03): retorna vista de lectura con `RazonSocialReceptor` (join a `FACT_CLIENT_SHP`) y resuelve por `IDFOL` actual o `IDFOLINICIAL` para compatibilidad cuando el folio visible cambia de `CP` a `CA/VF`.
- Trazabilidad UI cotizaciones (2026-03-10): búsqueda por OPV desde `search` permite búsqueda cruzada entre OPV solo para folios con `AUT='CP'` y `ESTA='PENDIENTE'`.
- Trazabilidad UI paneles (2026-03-10): cotizaciones/devoluciones/PS ejecutan anulación lógica vía `PATCH /pvctrfolasvr/:idfol` con `ESTA='ANULADO'` (sin `DELETE` físico), habilitada solo para filas en `PENDIENTE`.
- Paneles PV (2026-03-21): los listados de cotizaciones/devoluciones/PS excluyen `ESTA='ANULADO'`; solo muestran `PENDIENTE`, `EDITANDO` y `PAGADO`.
- Paneles PV (2026-03-30): `GET /pvctrfolasvr`, `GET /pv/devoluciones` y `GET /ps` (panel/consulta) admiten los parámetros `suc` y `opv`, por lo que el cliente admin puede pedir combinaciones autorizadas de sucursal + OPV/Supervisor sin cambiar contratos ni añadir endpoints.
- `pvctrfolform`: `PV_CTR_FOL_FORM` (`IDF`, `IDFOL`, `FORM`, `IMPA`, `IMPP`, `IMPC`, `IMPD`, ...).
- `pvctrords`: `PV_CTR_ORDS` (`IORD`, `IDFOL`, `ART`, `CTD`, `SUC`, `ESTATUS`, ...).
- `pvctrordsdet`: `PV_CTR_ORDS_DET` (`IORDP`, `IORD`, `ART`, `JOB`, `ESF`, `CIL`, `EJE`).
- `ordenes-trabajo`: flujo operativo unificado de ORDs sobre `PV_CTR_ORDS` + `PV_CTR_ORDS_DET`, con panel server-side, detalle, autorizaciones, envío/recepción, entrega, garantías, cambio de material, merma, escaneo y catálogo de incidencia `DAT_ORD_TMOV`.
- `ordenes-trabajo` detalle/roles (2026-03-30): `saveDetail` ya puede persistir `PV_CTR_ORDS.TIPO` con valores `TALLADO`/`BISELADO`; el permiso fino para cambiar `TIPO` e imprimir etiqueta queda restringido a `admin`, `JEF_TALLER`, `ANALISTA_ORD` y `ANALISTA`.
- `pvticketlog`: `PV_TICKET_LOG` (`ID`, `IDFOL`, `ART`, `UPC`, `CTD`, `PVTA`, `CTDD`, `CTDDF`, `UPDATED_AT`).
- `pv-devoluciones`: flujo transaccional de devoluciones PV sobre `PV_CTR_FOL_ASVR`, `PV_TICKET_LOG`, `PV_CTR_FOL_FORM(_SVR)`, `PV_CTR_ORDS`, `FAC_SVR_SHAP`, `FACT_IDFOLDEV`, `DAT_CTRL_CTAS`.
- `pagos-servicios`: flujo PS sobre `PV_CTR_FOL_ASVR`, `PV_TICKET_LOG`, `PV_CTR_FOL_FORM`, `DAT_CTRL_CTAS`, `PV_DAT_PS`, `DAT_REF_GTO`.
- PS cliente: endpoint `PUT /ps/folios/:idFol/cliente` actualiza `PV_CTR_FOL_ASVR.CLIEN`; regla bloqueante cuando ya existen líneas en `PV_TICKET_LOG`.
- Script PS crea/siembra `PV_TIPO_ESTA` con `RELACION` (AD/AP/CR/DC/DG -> PAD/PAP/PCR/PDC/PDG) para normalizar `AUT` al agregar primer servicio.
- Adeudos PS soporta clientes grandes: `sp_ps_adeudos_cliente(@CLIENT BIGINT)` con filtros `TRY_CONVERT(BIGINT, CLIENT)`.
- Adeudos PS fuente primaria (2026-03): `sp_ps_adeudos_cliente` consulta `DAT_CTRL_CTAS` agrupando por `SUC/CLIENT/CTA/IDFOL`; `ADEUDOS_RES_JSON` se forma desde ese agregado con `ADEUDO < 0`.
- Referencia folio PS (2026-03): `sp_ps_ticket_set_reference_folio` quedó depurado para no depender de `DAT_CTRL_CTAS_RES`; valida/toma el folio de referencia directamente desde `DAT_CTRL_CTAS` del cliente activo del folio PS.
- Referencia folio PS (2026-03-21): la primera referencia ligada en el ticket define `ORIGEN_AUT` (`CA`/`VF`); si todavía no hay referencias (`ORD`) se permite adoptar el origen del primer vínculo. Cuando ya existen referencias ligadas, se conserva el origen y se rechaza mezcla `CA`/`VF`.
- Cálculo adeudo PS (2026-03-30): `sp_ps_ticket_set_reference_folio` y `sp_ps_ticket_update_pvta` consolidan `DAT_CTRL_CTAS` por `IDFOL/NDOC + RELACION`, sumando todas las filas del mismo concepto antes de validar el importe; así se evita que diferencias de taller que aparecen en varias filas del mismo concepto queden bloqueadas por el tope previo de PVTA. Cuando la relación es `CA` y el pago se aplica con alguna forma que no es `EFECTIVO`, el cierre genera el folio visible final como `VF` para reflejar la forma de pago; el comportamiento de los orígenes `VF` ya existentes se respeta.
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
