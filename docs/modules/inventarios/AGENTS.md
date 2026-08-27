# Instrucciones de agente para Inventarios API

## Alcance
- Modulos backend de inventario operativo: `datart`, `datmb51`, `datmb52`, `dat-cmov`, `mermas`, `transferencias` y `sugeridos`.
- Persistencia MSSQL con tablas legacy `DAT_ART`, `DAT_MB51`, `DAT_MB51S`, `DAT_CMOV` y tablas de proceso especificas.

## Recepción de mercancías
- Módulo API: `src/modules/recepciones`; ruta base `/recepciones`; código front `DAT_REC`.
- Reutilizar `REC_CAB_PED/REC_DET_PED` y `REC_CTRL_DOC_REC/REC_CTO_HIST`; no crear cabeceras o detalles paralelos.
- La recepción física no afecta inventario. Solo `sp_rec_recepcion_autorizar` registra `DAT_CTR_DOC`, movimiento `DAT_MB51` 101 en almacén 002 y actualiza `DAT_ART.STOCK`.
- Los DTO de sucursal omiten costos y tipo/folio documental; la restricción se aplica en backend.
- Mantener idempotencia, `sp_getapplock`, transacción y auditoría `AUDIT_LOG` en acciones críticas.
- El listado pendiente acepta O.C. y proveedor como filtros separados y queda limitado a `DF01/DF04/DF05/DF06`.
- El selector de proveedor usa `/recepciones/catalogos/proveedores`, ordenado por ID numérico igual que en Órdenes de compra, y filtra por `prov`.
- Histórico filtra en servidor por O.C., proveedor, fecha y sucursal; no debe exponer filtro de estatus en la UI.
- `ENCARGADO DE SUCURSAL` (`IDROL=13008`) solo puede consultar su `USUARIO.SUC`; debe rechazarse su acceso directo a Histórico e Indicadores.
- Las recepciones del Encargado terminan automáticamente en `VALIDADO`; excluirlas de su listado, mantenerlas activas para Jefe/Analista y permitir autorización/rechazo exclusivamente a Inventarios.
- La captura del Encargado se persiste como borrador por NPED mediante los SP de borrador; al crear la recepción física se elimina el borrador obsoleto.
- El detalle de una O.C. debe proyectar totales y la recepción activa; una recepción `VALIDADO` sincroniza también la cabecera de la O.C. a `VALIDADO` hasta la autorización o contabilización.
- Solo `JEFE DE INVENTARIOS` (`IDROL=2`) puede ejecutar el ajuste de Cantidad física en un documento `VALIDADO`; el SP debe actualizar histórico, importe, incidencias y auditoría sin afectar stock antes de contabilizar.
- `DOCREC` debe ser único también frente a `DAT_CTR_DOC.DOC` y `DAT_MB51.DOCP`; `REC_CTO_HIST.IDREC` usa el formato `REC-{DOCREC}-{fila}` y es la clave idempotente de `DAT_MB51.IDPD`.
- `GET /recepciones/:nped` debe exponer campos de jerarquía y la ruta descriptiva completa usando los catálogos JRQ existentes; no duplicar esos catálogos ni persistir resúmenes derivados.
- `GET /recepciones/documentos/:docrec` también debe proyectar `DEP/SDEP/CLS/SCLS/SCLS2/SPH/CYL/ADIC` y la ruta descriptiva completa por renglón para que la revisión `VALIDADO` del Jefe pueda filtrar y agrupar sin otra fuente de datos.
- El detalle de `GET /recepciones/documentos/:docrec` debe combinar `REC_DET_PED` activo con `REC_CTO_HIST`, conservando artículos de la O.C. sin renglón histórico como cantidad física cero para que los faltantes no desaparezcan de `VALIDADO` ni del registro `CONTABILIZADO`. Los renglones en cero no generan movimientos.
- Una creación del Encargado con tipo `RECHAZO` debe ejecutar el SP de rechazo existente, exigir observaciones como motivo desde la UI, quedar activa para consulta administrativa y excluirse del listado operativo del Encargado.
- Conservar el contrato documental existente: `FOLIO_DOC` máximo 100 caracteres, `GUIA` libre máximo 100 y `PAQUETERIA` máximo 120; los folios adicionales se serializan con ` | ` y no justifican crear otra tabla.
- Edición documental y costo en `VALIDADO` son exclusivas del Jefe (`IDROL=2`) y deben ejecutarse mediante los SP versionados con bloqueo, transacción y auditoría.
- Diferenciar rechazo físico del Encargado (`RECHAZADO`) de devolución administrativa (`DEVUELTO`): esta última reconstruye `REC_BORRADOR_REC*`, devuelve la O.C. a `PROCESADO` y no genera ni revierte inventario.

## Planeacion y sugeridos de compra
- El API conserva `PARCIAL` en `ESTATUS_SUG`; su ocultamiento en el filtro de Órdenes de compra aplica solo en Flutter para Jefe (`IDROL=2`) y Analista (`IDROL=9005`).
- `ESTATUS_SUG` incluye `RECHAZADO`. Al rechazar una recepción, el SP sincroniza la cabecera de O.C.; `PATCH /sugeridos/:nped/detalle/:idped` acepta exclusivamente `ctdped` para ese estado y solo para el Jefe. Cancelar desde `RECHAZADO` conserva las validaciones de recepción/cantidades existentes.
- Para retornar un rechazo, el Jefe usa `POST /sugeridos/:nped/devolver-sucursal` con `obs` obligatorio. El SP admite `RECHAZADO`, verifica ausencia de MB51, pasa la recepción a `DEVUELTO`, la O.C. a `PROCESADO` y reinicia cantidades/estatus del borrador.
- `sp_rec_recepcion_solicitar` debe sincronizar `REC_CTRL_DOC_REC.ESTATUS_REC` y `REC_CAB_PED.ESTATUS` a `VALIDADO`. Jefe/Analista incluyen ese estado en la cola DAT_REC; Encargado no lo lista.
- `ESTATUS_SUG` incluye `VALIDADO` para que el módulo de Órdenes de compra del Jefe pueda filtrar las recepciones pendientes de contabilización.
- La cancelación de una O.C. `VALIDADO` es exclusiva del Jefe. Debe bloquearse si existe `CTDREC`, recepción `CONTABILIZADO` o cualquier `DAT_MB51` ligado al `DOCREC`; sin bloqueos, actualizar recepción a `CANCELADO` y cabecera a `ANULADO` dentro de la misma transacción.
- La cancelación de una O.C. `PROCESADO/RECHAZADO` por el Jefe debe ignorar recepciones históricas `RECHAZADO/CANCELADO/DEVUELTO` como bloqueadores. Si no hay cantidades recibidas ni recepción activa, eliminar el borrador reconstruido y cambiar la cabecera a `ANULADO` en una transacción.
- Modulo API: `src/modules/sugeridos`.
- Ruta base: `/sugeridos`.
- Codigo front esperado: `DAT_JAA_SUG`.
- Tablas oficiales para O.C.: `REC_CAB_PED` y `REC_DET_PED`; no crear tablas duplicadas de pedidos.
- El listado de O.C. debe excluir cabeceras legacy huérfanas `ABIERTO` sin detalle activo y con `NART/IMPP` nulos; las órdenes creadas por el módulo deben inicializar esos totales en cero cuando no tengan artículos.
- El calculo debe usar `DAT_ART`, stock acumulado desde `DAT_MB51` y ventas por movimientos relacionados como `VTAS` en `DAT_CMOV`, sin tablas temporales persistentes.
- Validar alcance por sucursal con `USR_MOD_SUC` para `DAT_JAA_SUG`, con fallback a `SUC` del token cuando no existan asignaciones.

## Merma
- Modulo API: `src/modules/mermas`.
- Ruta base: `/mermas`.
- La evidencia `EVI_M` se recibe como data URL de imagen en JSON; `src/main.ts` mantiene body parser JSON/urlencoded en `1mb`, alineado al limite validado de 700000 caracteres.
- Al contabilizar, `sp_merma_contabilizar` debe guardar `DAT_MB51.CTDA` y `CTOT` negativos porque es una salida de inventario.

## Transferencias entre sucursales
- Modulo API: `src/modules/transferencias`.
- Ruta base: `/transferencias`.
- Codigo front esperado para menu operativo: `DAT_JAA_TRAN`; reportes: `DAT_REP_TRAN`.
- Tablas oficiales: `TRAN_CTR_DOCPRE` y `TRAN_DET_ART`.
- Catalogos soporte: `MOV_TRAN`, `PRIO_TRAN`, `ESTATUS_TRAN`, `TRAN_EVID`, `TRAN_PAQ_ENV`, `TRAN_INCIDN`.
- `GET /transferencias/notificaciones` debe incluir `LIBERADA` para roles de sucursal solo con `SUC_SAL` y `TRANSITO` solo con `SUC_ENT`.
- `GET /transferencias` debe ocultar `TRANSITO` a la sucursal origen; en ese estatus solo se lista para `SUC_ENT`.
- `GET /transferencias` debe mostrar `BORRADOR` solo a `SUC_ENT`.
- La evidencia de surtido se guarda en `TRAN_EVID` desde `POST /transferencias/:doc/detalle/:idpd/evidencia`; validar estado `PREPARACION` y sucursal origen/surtidora.
- Antes de ejecutar `sp_trans_transito`, backend debe bloquear documentos con renglones sin evidencia en `TRAN_EVID`; aceptar solo data URL de imagen mayor a 500 bytes y maximo 500 KB.
- Movimientos oficiales `DAT_CMOV`: `121` salida origen, `122` faltante reintegracion, `123` entrada destino, `124` sobrante descuento origen.
- Los movimientos `121` y `124` deben guardar `DAT_MB51.CTDA` y `CTOT` negativos en la sucursal origen; `122` permanece positivo como reintegración en origen y `123` positivo como entrada en destino.
- No usar tablas `TRAS_*` ni `DAT_ART_SVR`; el articulo y stock se resuelven con `DAT_ART`.
- `GET /transferencias/reportes` y `GET /transferencias/reportes/:doc` son solo para jefe de inventarios/admin; no aplican limites operativos por estatus, excluyen `INCIDENCIA` como filtro de cabecera y devuelven `hasIncidencia` cuando algun renglon tiene `ESTATUS_R=INCIDENCIA`.

## Reglas
- La contabilizacion y las transiciones criticas se mantienen en SPs idempotentes versionados en `sql/`.
- No inventar codigos de movimiento; consultar `DAT_CMOV`.
- Validar alcance por sucursal con `USR_MOD_SUC` para `DAT_JAA_TRAN`, con fallback a `SUC` del token cuando no existan asignaciones.
