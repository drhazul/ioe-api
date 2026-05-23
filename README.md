# IOE API

Backend NestJS + MSSQL que abastece a `ioe_app` para autenticación, catálogos, inventarios, control de cuentas y punto de venta.

> Abre otros README/AGENTS solo si la tarea lo requiere; navega por el índice de módulos.

## Planteamiento funcional
- Contratos HTTP estables para la app IOE.
- Seguridad JWT con refresh y control por módulo/sucursal.
- Procesos críticos en stored procedures para inventarios y PV.
- Punto de venta / Pago de Servicios (2026-04): la salida operativa de folios pagados utiliza `ESTA='CERRADO_PS'` (manteniendo lectura compatible para históricos en `TRANSMITIR`).
- Punto de venta / Pago de Servicios (2026-05-22): `sp_ps_pago_finalize` corrige persistencia de comprobantes múltiples para guardar `IMPD` por forma (`IMPP-IMPC`) y se añade script de reparación puntual `sql/2026-05-22_ps_fix_comprobantes_duplicados_df01_20260520_vf_0061.sql`.
- Facturación / Cliente fiscal (2026-04-06): la edición de `FACT_CLIENT_SHP` conserva la `SUC` original del registro; no se reasigna por contexto del usuario durante `PATCH /factclientshp/:id`.
- Ordenes de trabajo / Asignar (2026-04-21): `GET /ordenes-trabajo/asignar/colaboradores` mantiene `suc` por query; el frontend ahora envía `DAT_LAB.SUC` del laboratorio asignado a la ORD. El catálogo `laboratorios` del panel expone además `labSuc` para distinguirla de la sucursal de acceso.
- Ordenes de trabajo / Consulta estado (2026-04-23): `GET /ordenes-trabajo` agrega `panelMode='estado'` para consulta solo lectura, la respuesta incluye `OPV` resuelto desde `USUARIO.NOMBRE`, `saveDetail` acepta `hrEnt` en formato `HH:MM`, y `ANULAR` queda permitido solo para `admin`/`JEF_TALLER` con trazabilidad en `AUDIT_LOG`.
- Ordenes de trabajo / Incidencia (2026-04-07): `regresar-incidencia` valida `ESTSEGU=8` con colaborador asignado y actualiza a `ESTSEGU=9`; `regresar-tienda` desde `9` deriva a `9.1/9.2` según `TIPOM`.
- Ordenes de trabajo / Cambio material y Merma (2026-04-08): se agrega flujo interno semaforizado por `selCtrlOrd` (`NULL/0/13/14/15/16`) vía `GET/POST /ordenes-trabajo/:iord/cambio-merma/*`, con staging `PV_ORD_CAMBIO_MERMA_TMP`, campo `PV_CTR_ORDS.CTD_C_M` (`1|0.5`) y cálculo homologado `subtotal/iva/total/diferencia`.
- Ordenes de trabajo / Cambio material y Merma (2026-04-09): se corrige cálculo económico para tomar tipo de cotización desde folio (`AUT/ORIGEN_AUT`) y factor fiscal desde `PV_CTR_FOL_ASVR.REQF` (fallback a `RQFAC` cuando exista), evitando depender de `PV_CTR_ORDS.RQFAC` nulo.
- Ordenes de trabajo / Cambio material y Merma (2026-04-19): se refuerza en contexto/API y SPs el uso de fiscalidad de folio (`REQF` con fallback `RQFAC`) para consistencia entre captura y creación de nueva ORD.
- Ordenes de trabajo / Cambio material y Merma (2026-04-19): el contexto de captura reporta si existe staging (`hasStagingRecord`) y la lógica de precio de nueva ORD se alinea al costo base de la ORD original.
- Ordenes de trabajo / Cambio material y Merma (2026-04-21): `POST /ordenes-trabajo/:iord/cambio-merma/solicitar-autorizacion` deja `selCtrlOrd=14`; `POST /ordenes-trabajo/:iord/cambio-merma/retrabajo` devuelve el caso a `15`; `POST /ordenes-trabajo/:iord/cambio-merma/autorizar` es el cierre final reservado para `admin`, `ANALISTA_INV` e `INVJEF`, creando la nueva ORD y anulando la original.
- Ordenes de trabajo / Cambio material y Merma (2026-04-22): la afectación final usa `DAT_CMOV` y `DAT_CAT_CTAS`: cambio material registra MB51 `204/205`, merma registra MB51 `456/455/457`, `DAT_MB51.CTOT` se calcula como `CTDA * DAT_ART.CTOP`, y la diferencia contable usa `CTA=101001001` con movimientos `801/802` y `NDOC` generado sobre el consecutivo configurado en `DAT_CMOV`.
- Ordenes de trabajo / Panel ORDs (2026-04-21): `ANALISTA_INV` e `INVJEF` atienden revisión de cambio/merma (`selCtrlOrd=14`) y la visibilidad efectiva se toma de `DAT_JAO_ORD_FLUJO_VIS`.
- Ordenes de trabajo / Garantía (2026-04-29): el módulo de entregadas/garantía vuelve a estar activo en Home, la transición de garantía cambia de `11 -> 9.3`, y se agrega `POST /ordenes-trabajo/:iord/aplicar-merma-cambio` para definir `TIPOM(1|2)` + `MOTR` y mover de `9.3` a `9.1/9.2` antes de continuar el flujo estándar de cambio/merma.
- Ordenes de trabajo / Recepción laboratorio externo (2026-05-01): `POST /ordenes-trabajo/recibir/validar|lote` permite a `ANALISTA_ORD/ANALISTA` recibir solo ORDs de laboratorio externo; la recepción de externo avanza `ESTSEGU 5 -> 10` (pendiente entrega cliente) y laboratorio interno conserva `5 -> 7`.
- Ordenes de trabajo / Envío y recepción laboratorio externo (2026-05-03): `POST /ordenes-trabajo/enviar/lote` mueve ORDs con `DAT_LAB.UBILAB='EXTERNO'` a `ESTSEGU=9` (pendiente recibir en analista), manteniendo `3 -> 5` para interno; `POST /ordenes-trabajo/recibir/validar|lote` para `ANALISTA_ORD/ANALISTA` valida flujo `9` en externo y aplica `9 -> 10`.
- Ordenes de trabajo / Matriz persistente de visibilidad (2026-05-03): la API obtiene estatus visibles por rol/panel desde `dbo.DAT_JAO_ORD_FLUJO_VIS` para módulo `DAT_JAO_ORD`; la excepción de analista en flujo `9` queda controlada con `SOLO_EXTERNO=1`.
- Datos Maestros / Visualización por ROLL en ORD (2026-05-03): se agrega CRUD `/ord-flujo-vis` y catálogo `/ord-flujo-vis/catalogos` (`ROL`, `DAT_EST_ORD`) para administrar reglas de `DAT_JAO_ORD_FLUJO_VIS`; `ORDEN` se calcula automáticamente desde `ESTA` (`ESTA*10`).
- Seguridad/maestros (2026-05-03): `ROL` agrega `IDDEPTO` con relación a `DEPARTAMENTO(IDDEPTO)`; `DAT_JAO_ORD_FLUJO_VIS.ROLE_CODE` queda relacionado por FK a `ROL.CODIGO`.
- Datos Maestros / Módulos Front unificado (2026-05-04): el frontend deja de exponer menú directo `/#/masterdata/datmodulos` y concentra operación en `/#/masterdata/access/mod-front`; backend conserva endpoints existentes (`/datmodulos` y `/access/mod-front`) sin cambio de contrato ni script SQL nuevo.
- Datos Maestros / Enrolamiento Front por usuario (2026-05-04): backend incorpora tabla `USR_GRUPMOD_FRONT` y gestión `/access/users/:id/enrolamientos-front`; Home prioriza asignaciones activas por usuario y usa rol (`ROL_GRUPMOD_FRONT`) solo cuando usuario no tiene filas activas.
- Datos Maestros / Enrolamiento Front por usuario (2026-05-04): `GET /access/users` agrega datos de `SUC`/`DEPARTAMENTO` y filtros opcionales `suc` e `idDepto` para filtrar el dropdown de usuarios en UI.
- Datos Maestros / Acceso por sucursal (2026-05-04): `GET /usr-mod-suc` soporta filtros opcionales `sucUsuario` y `depto` para filtrar por sucursal del usuario y por departamento en usuarios/módulos front.
- Datos Maestros / Acceso por sucursal (2026-05-06): el filtro `depto` de `GET /usr-mod-suc` aplica coincidencia por `departamento de usuario OR departamento de módulo front`.
- Ordenes de trabajo / Panel ORDs (2026-05-06): `ANALISTA_INV` e `INVJEF` pueden cargar catálogo de asignados del panel sin error de rol; el script `sql/2026-05-06_ord_flujo_vis_analista_inv_invjef_expand.sql` amplía visibilidad operativa en `DAT_JAO_ORD_FLUJO_VIS`.
- Ordenes de trabajo / Panel ORDs (2026-05-06): se corrige `dbo.sp_ordenes_trabajo_panel` con script `sql/2026-05-06_ordenes_trabajo_panel_analista_inv_selctrl14_fix.sql` para restaurar visibilidad de `ANALISTA_INV/INVJEF` y filtrar su cola por `selCtrlOrd=14`.
- Ordenes de trabajo / Panel ORDs acceso multi-sucursal analista (2026-05-22): `sp_ordenes_trabajo_panel` ya no restringe por `@HOME_SUC` cuando el usuario consulta una `@SUC` explícita permitida; se corrige caso `ANALISTA_ORD` con acceso `DF04/DF14` que solo veía históricos (script `sql/2026-05-22_ordenes_trabajo_panel_home_suc_scope_fix_df14.sql`).
- Ordenes de trabajo / ORDs derivadas cambio-merma (2026-05-22): las ORDs nuevas derivadas de cambio/merma ya no deben caer en remapeo de incidencia al recibir en tienda; `sp_ordenes_trabajo_cambio_material` y `sp_ordenes_trabajo_merma` clonan con `TIPOM=0`, y `sp_ordenes_trabajo_regresar_tienda_lote` envía a flujo `10` cuando detecta relación `REEORD` (script `sql/2026-05-22_ordenes_trabajo_derivadas_flujo_9_fix.sql`).
- Datos Maestros / Compatibilidad puestos con ROL (2026-05-05): endpoint legacy `/puestos` opera sobre `ROL` (`IDROL` como `IDPUESTO`) para mantener compatibilidad cuando la tabla `PUESTO` fue retirada; `USUARIO` continúa sin columna `IDPUESTO`.
- Registro de módulos PV (2026-05-05): `AppModule` vuelve a incluir en `imports` los módulos `PvDevoluciones`, `PagosServicios`, `Retiros`, `FormasPagoCambios`, `CajonEstado`, `CajaGeneral`, `Facturacion` y `CtrlCtas`, corrigiendo `404` de rutas no montadas.
- Datos Maestros / Configuración maestra (2026-05-05): se agrega endpoint `GET/PUT /masterdata/configuracion-maestra` para configuración corporativa y catálogos de `departamentos/cargos`.
- Cotizaciones / Cierre (2026-04-09): al cerrar cotización (`sp_pv_cotizacion_cerrar`) ahora también sincroniza `PV_CTR_ORDS.RQFAC` con `REQF/RQFAC` del folio transmitido; se agrega script correctivo para históricos transmitidos.
- Cotizaciones / Cierre mixto (2026-05-14): el cierre valida que `CREDITO`/`DEUDOR` no se combinen con otras formas y que cada forma no `EFECTIVO` no exceda el pendiente acumulado; solo `EFECTIVO` puede exceder para cambio.
- Punto de venta / Devoluciones regla simplificada (2026-05-22): la devolución parcial solo aplica cuando el ticket origen se pagó únicamente con `EFECTIVO`; si el ticket origen tiene forma mixta o forma no-efectivo, el cierre exige devolución total respetando cada forma de pago origen.
- Punto de venta / Gestión de promociones (actualizado 2026-05-13): módulo `promociones` con CRUD/configuración (`PROMO_CAB`, `PROMO_CONFIG`, reglas legacy), catálogos (`/promociones/catalogos/*`) y aplicación por folio/línea. Seguridad de gestión habilitada para `admin`, `JEFOPE/JEFOPER` y supervisor (`SUPERPV/SUPERVISOR/SUPERVP`) con alcance por sucursal desde `USR_MOD_SUC` para módulo `PV_PROMO_GES`. Script base: `sql/2026-05-09_promociones_descuentos_base.sql`.
- Notas de documentación viva: este README se modifica solo por cambios de arquitectura, módulos o rutas principales; los ajustes funcionales se registran en los README/AGENTS del módulo correspondiente.

## Arquitectura
- NestJS + TypeORM (`mssql`).
- Capas por módulo en `src/modules/*`.
- SPs y scripts en `sql/`.

## Estructura del proyecto
- `src/app.module.ts`: registro de módulos.
- `src/modules/*`: características por dominio (auth, masterdata, inventarios, PV, PS, devoluciones, órdenes de trabajo, reloj-checador).
- `sql/`: scripts de base de datos y SPs.
- `test/`: pruebas.

## Documentación por módulos
- Base de módulos: `docs/modules/base_modulos/README.md` (instrucciones: `docs/modules/base_modulos/AGENTS.md`)
- Core y seguridad: `docs/modules/core_seguridad/README.md` (instrucciones: `docs/modules/core_seguridad/AGENTS.md`)
- Punto de venta: `docs/modules/punto_venta/README.md` (instrucciones: `docs/modules/punto_venta/AGENTS.md`)
- Ordenes de trabajo: `docs/modules/ordenes_trabajo/README.md` (instrucciones: `docs/modules/ordenes_trabajo/AGENTS.md`)
- Reloj checador: `docs/modules/reloj_checador/README.md` (instrucciones: `docs/modules/reloj_checador/AGENTS.md`)

## Tecnologias
- NestJS, TypeORM (MSSQL), RxJS.

## Ejecucion
- `npm run start:dev`
- `npm run start:dev:safe` (libera `3001/8081` si los ocupa otra instancia de `ioe-api` y luego levanta `nest --watch`)
- `npm test`

## Pruebas obligatorias
- Ejecutar `npm test` antes de entregar cualquier cambio backend.
- Cuando se coordinen cambios con el frontend (`ioe_app`), correr también `flutter analyze` y `flutter test` en ese proyecto.

## Documentacion viva
- Mantén este índice y los README/AGENTS de módulo actualizados con cada cambio de contrato o proceso.

