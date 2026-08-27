# Inventarios API

## Recepción de mercancías DAT_REC (2026-08-11)

- Nuevo `RecepcionesModule` con ruta `/recepciones`, alcance por `DAT_REC`/`USR_MOD_SUC` y proyecciones financieras restringidas a administración de Inventarios.
- Reutiliza `REC_CAB_PED`, `REC_DET_PED`, `REC_CTRL_DOC_REC`, `REC_CTO_HIST`, movimiento `101`, `DAT_CTR_DOC`, `DAT_MB51`, `DAT_ART` y `AUDIT_LOG`.
- El flujo separa recepción física, solicitud, autorización/contabilización y rechazo. La autorización es transaccional, serializada e idempotente.
- Script: `sql/2026-08-11_recepcion_mercancias_dat_rec.sql`. Diseño y matrices: `docs/modules/inventarios/recepcion_mercancias_dat_rec.md`.
- `GET /recepciones` acepta filtros independientes `oc`, `proveedor`, `from/to` y restringe pedidos pendientes a `DF01/DF04/DF05/DF06`.
- `GET /recepciones/catalogos/proveedores` devuelve `DAT_PROVD` activo ordenado por ID numérico, igual que en Órdenes de compra; `GET /recepciones` acepta `prov` para filtrar por ID.
- `GET /recepciones/historial` acepta `oc`, `prov`, `from/to` y `suc`; la pantalla no expone filtro de estatus.
- `ENCARGADO DE SUCURSAL` (`IDROL=13008`) queda forzado a la sucursal asignada y no tiene acceso a `/recepciones/historial` ni `/recepciones/indicadores`.
- La creación por Encargado transiciona automáticamente de `RECEPCION_FISICA` a `VALIDADO`; desde ese momento deja de aparecer en su listado, pero permanece activo y visible para autorización o rechazo por Jefe/Analista de Inventarios. Script: `sql/2026-08-17_recepcion_validado_encargado.sql`.
- Borradores de captura: `GET/POST /recepciones/:nped/borrador`, tablas `REC_BORRADOR_REC/REC_BORRADOR_REC_DET` y SP `sp_rec_recepcion_borrador_guardar/eliminar`. Script: `sql/2026-08-11_recepcion_mercancias_borrador_sucursal.sql`.
- `GET /recepciones/:nped` devuelve totales calculados y la recepción activa (`docrecActivo`/`estatusRecepcion`) para que el detalle cargue los datos persistidos en lugar de una captura vacía. `GET /recepciones/documentos/:docrec` conserva los campos `DEP/SDEP/CLS/SCLS/SCLS2/SPH/CYL/ADIC` y la ruta jerárquica por renglón para la revisión administrativa filtrable y agrupada.
- El documento administrativo incluye además todos los renglones activos de la O.C.; cuando un artículo no fue capturado físicamente se proyecta con cantidad cero y puede mostrarse como faltante en la tabla `VALIDADO`.
- `PATCH /recepciones/documentos/:docrec/items/:idrec/cantidad-fisica` permite exclusivamente al Jefe de Inventarios ajustar un renglón `VALIDADO`; recalcula cantidad aceptada, importe, faltante/sobrante y auditoría mediante `sp_rec_recepcion_actualizar_cantidad`. Script: `sql/2026-08-17_recepcion_editar_cantidad_jefe.sql`.
- Los nuevos `DOCREC` se calculan contra `REC_CTRL_DOC_REC`, `DAT_CTR_DOC` y `DAT_MB51`; cada renglón usa `IDREC=REC-{DOCREC}-{fila}` para evitar colisiones con movimientos legacy. Script: `sql/2026-08-17_recepcion_identificadores_unicos.sql`. La recepción y la O.C. `450002277` usadas para verificar la corrección fueron eliminadas posteriormente, con reversión transaccional del stock, mediante los scripts `sql/2026-08-17_eliminar_recepcion_prueba_450002277.sql` y `sql/2026-08-17_eliminar_oc_prueba_450002277.sql`.
- El detalle de O.C. proyecta `DEPA/SUBD/CLAS/SCLA/SCLA2`, `SPH/CYL/ADIC` y una ruta jerárquica descriptiva obtenida de `JRQ_DEPA/JRQ_SUBD/JRQ_CLAS/JRQ_SCLA/JRQ_SCLA2`, sin crear tablas nuevas.
- Si el Encargado crea una recepción con `TIPO_RECEPCION=RECHAZO`, el servicio reutiliza `sp_rec_recepcion_fisica` y después `sp_rec_recepcion_rechazar`; el resultado queda `RECHAZADO`, no se lista nuevamente para la sucursal y sigue asociado como documento activo para Jefe/Analista.
- El cierre documental utiliza los campos existentes: `FOLIO_DOC` recibe uno o varios folios separados por ` | `, y `REC_GUIA_PED` conserva `GUIA` como texto libre y `PAQUETERIA`; no requiere migración de base de datos.
- Script `sql/2026-08-18_recepcion_jefe_edicion_devolucion.sql`: agrega edición documental y costo para el Jefe sobre `VALIDADO`; costo sincroniza `REC_DET_PED.CTO`, `REC_CTO_HIST.CTDVTA`, importes de recepción/O.C. y auditoría.
- `sp_rec_recepcion_devolver_sucursal` copia cabecera, guía y renglones a `REC_BORRADOR_REC*`, cambia la recepción a `DEVUELTO` y la O.C. a `PROCESADO` sin afectar stock ni MB51. El endpoint administrativo `rechazar` usa esta devolución; el rechazo de mercancía del Encargado continúa usando `sp_rec_recepcion_rechazar` durante la creación.

## Planeacion y sugeridos de compra (2026-07-10)

- El catálogo `/sugeridos/catalogos/estatus` conserva `PARCIAL`; la app lo oculta únicamente para Jefe y Analista de Inventarios en el filtro de Órdenes de compra.
- El catálogo agrega `RECHAZADO`; `sp_rec_recepcion_rechazar` sincroniza ese estado en `REC_CAB_PED`. El Jefe puede cancelar la O.C. o actualizar únicamente `CTDPED`; se rechazan costo, unidad, altas y bajas mientras permanezca rechazada. Script `sql/2026-08-21_recepcion_rechazo_sincroniza_oc.sql`.
- `POST /sugeridos/:nped/devolver-sucursal` devuelve una recepción `RECHAZADO` mediante motivo obligatorio. `sp_rec_recepcion_devolver_sucursal` la marca `DEVUELTO`, cambia la O.C. a `PROCESADO`, reconstruye el borrador y pone sus cantidades en cero para recaptura; script `sql/2026-08-21_recepcion_rechazada_devolver_sucursal.sql`.
- La transición a `VALIDADO` sincroniza recepción y O.C.; el estado se agrega a `ESTATUS_SUG`, aparece en el filtro de Órdenes de compra y permanece visible para la revisión administrativa de DAT_REC. Script `sql/2026-08-21_recepcion_validado_sincroniza_oc.sql`.
- El Jefe puede cancelar una O.C. `VALIDADO` mediante la acción existente de Órdenes de compra. El API descarta cualquier documento con cantidades recibidas, recepción contabilizada o movimientos y, cuando es seguro, marca `REC_CTRL_DOC_REC` como `CANCELADO` y `REC_CAB_PED` como `ANULADO` atómicamente; el filtro existente permite volver a consultarla.

- Nuevo modulo `SugeridosModule` registrado en `AppModule` con ruta base `/sugeridos` y codigo front `DAT_JAA_SUG`.
- `GET /sugeridos/calculo` ejecuta `sp_sugeridos_calcular`, reemplazando consultas Access encadenadas con CTEs sobre `DAT_ART`, `DAT_MB51` y clases de venta en `DAT_CMOV.RELACION='VTAS'`.
- `POST /sugeridos` ejecuta `sp_sugeridos_crear_oc` para crear cabecera/detalle en `REC_CAB_PED` y `REC_DET_PED`; el flujo operativo usa `ABIERTO -> PENDIENTE -> PROCESADO` y `ANULADO`.
- `GET /sugeridos` excluye cabeceras legacy huérfanas `ABIERTO` sin detalle activo y con `NART/IMPP` nulos, para no mostrar documentos vacíos ajenos al flujo del módulo.
- Catalogos: `/sugeridos/catalogos/sucursales`, `/sugeridos/catalogos/proveedores` y `/sugeridos/catalogos/estatus`.
- Script operativo: `sql/2026-07-10_sugeridos_compra_modulo_base.sql`.

## Merma (2026-06-12)

- `src/main.ts` configura body parser JSON/urlencoded a `1mb` para que `POST/PATCH /mermas/:docmer/detalle` acepte evidencia `EVI_M` dentro del limite funcional.
- El servicio conserva la validacion de data URL de imagen y maximo de 700000 caracteres para no guardar evidencias sobredimensionadas.
- Desde el ajuste `2026-07-23`, la contabilizacion registra `CTDA/CTOT` negativos en `DAT_MB51`, alineados con la salida aplicada al stock.

## Transferencias entre sucursales (2026-06-09)

- Nuevo modulo `TransferenciasModule` registrado en `AppModule`.
- Endpoints principales: `GET/POST/PATCH /transferencias`, detalle `POST/PATCH/DELETE /transferencias/:doc/detalle/:idpd`, acciones `enviar`, `liberar`, `rechazar`, `preparar`, `transito`, `recibir`, `contabilizar`.
- `GET /transferencias` soporta filtros separados `doc`, `usuario`, `from` y `to`; `GET /transferencias/notificaciones` devuelve documentos activos para seguimiento.
- Reportes `DAT_REP_TRAN`: `GET /transferencias/reportes` lista documentos de todos los estatus bajo filtro y `GET /transferencias/reportes/:doc` devuelve detalle de solo lectura; ambos son para jefe de inventarios/admin y exponen `hasIncidencia` por renglones con `ESTATUS_R=INCIDENCIA`.
- `GET /transferencias/catalogos/articulos` soporta filtros `searchBy`, `depa`, `subd`, `clas`, `scla`, `scla2`, `sph`, `cyl` y `adic`.
- `POST /transferencias/:doc/detalle/:idpd/evidencia` guarda evidencia fotografica en `TRAN_EVID`; solo aplica en `PREPARACION` y para la sucursal origen/surtidora.
- `POST /transferencias/:doc/transito` valida que todos los renglones activos tengan evidencia; la imagen recibida debe ser data URL de imagen, mayor a 500 bytes y maximo 500 KB.
- El catalogo de articulos consulta `DAT_ART`; para sucursal origen `DF02` usa el inventario almacenado como `DF01` en `DAT_ART`.
- Para rol `invjef`, el listado fuerza `estatus=PENDIENTE`, pero puede crear solicitudes desde el modulo operativo.
- Para roles `aux` y `enc_sucursal`, el listado se limita a `BORRADOR`, `PREPARACION`, `TRANSITO` y `REVISANDO`; notificaciones agrega `LIBERADA` solo para la sucursal origen/surtidora (`SUC_SAL`) como mercancia por surtir y `TRANSITO` solo para la sucursal solicitante (`SUC_ENT`).
- En listado general, documentos `TRANSITO` solo son visibles para la sucursal solicitante (`SUC_ENT`); la sucursal origen deja de verlos una vez enviados a transito.
- En listado general, documentos `BORRADOR` solo son visibles para la sucursal solicitante (`SUC_ENT`).
- Script operativo: `sql/2026-06-09_transferencias_modulo_base.sql`.
- El flujo oficial es `BORRADOR -> PENDIENTE -> LIBERADA -> PREPARACION -> TRANSITO -> REVISANDO/INCIDENCIA -> CONTABILIZADO`.
- La salida a transito registra `DAT_MB51` con movimiento `121`; la contabilizacion registra destino `123` y diferencias con `122/124`.
- Desde el ajuste `2026-07-23`, la salida `121` y el sobrante/descuento `124` registran `CTDA/CTOT` negativos en origen; el reintegro `122` y la entrada `123` continúan positivos.
- `sql/2026-07-23_mb51_movimientos_historicos_signo_fix.sql` corrige los movimientos históricos oficiales de salida que quedaron positivos, sin modificar nuevamente `DAT_ART.STOCK`.
