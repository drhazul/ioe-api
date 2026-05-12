# Instrucciones de agente para ioe-api

> Abre otros README/AGENTS solo cuando la tarea lo requiera; usa el índice de módulos.

## Contexto del proyecto
- Backend NestJS (TypeScript) modular por feature (`controller -> service -> dto/entity`).
- Persistencia con TypeORM sobre MSSQL (schema `dbo`), entidades/columnas en mayúsculas.
- Seguridad: JWT, `RolesGuard` global, `AuditInterceptor` global, `ValidationPipe` (`whitelist + transform + forbid`).
- Alcance de cambios: este AGENTS principal solo se actualiza cuando hay alteraciones de arquitectura, rutas base o incorporación/eliminación de módulos; las variaciones funcionales se documentan en los AGENTS/README del módulo afectado.

## Arquitectura y estructura real
- `src/main.ts`: bootstrap, CORS (`CORS_ORIGINS`), Swagger en `/docs`.
- `src/app.module.ts`: registro de módulos de dominio.
- `src/config/database.module.ts`: conexión MSSQL con `TypeOrmModule.forRootAsync`.
- `src/common/`: guards, decorators e interceptors compartidos.
- `src/modules/`: módulos funcionales por dominio.
- `datart` (2026-04): `PATCH /datart/:suc/:art/:upc` permite editar `UPC` y rechaza duplicados de `UPC` asignados a otro `ART` dentro de la misma sucursal.
- Punto de venta / Pago de Servicios (2026-04): la salida operativa de folios pagados usa `ESTA='CERRADO_PS'` (compatibilidad de lectura para históricos en `TRANSMITIR`).
- Facturación / Cliente fiscal (2026-04-06): en `PATCH /factclientshp/:id` la `SUC` del cliente se mantiene inmutable durante updates; no se sobreescribe por `user.suc` ni por payload de edición fiscal.
- Ordenes de trabajo / Asignar (2026-04-21): `GET /ordenes-trabajo/asignar/colaboradores` mantiene contrato con `suc` por query; la UI debe enviar `DAT_LAB.SUC` del laboratorio asignado a la ORD. El payload `laboratorios` agrega `labSuc` para esa resolución sin alterar `suc` de acceso.
- Ordenes de trabajo / Consulta estado (2026-04-23): `GET /ordenes-trabajo` soporta `panelMode='estado'`; la API resuelve `OPV` con `USUARIO.NOMBRE`, restringe `ANULAR` a `admin`/`JEF_TALLER`, persiste `HR_ENT` (`HH:MM`) en `saveDetail` y mantiene `AUDIT_LOG` para anulaciones exitosas.
- Ordenes de trabajo / Incidencia (2026-04-07): `POST /ordenes-trabajo/regresar-incidencia/lote` valida `ESTSEGU=8` con colaborador asignado y actualiza a flujo `9`; `regresar-tienda` resuelve `9.1/9.2` según `TIPOM`.
- Ordenes de trabajo / Cambio material y Merma (2026-04-08): se agrega `GET/POST /ordenes-trabajo/:iord/cambio-merma/context|preparar|solicitar-autorizacion|crear`, control por `selCtrlOrd` (`NULL/0/13/14/15/16`), staging `PV_ORD_CAMBIO_MERMA_TMP`, `CTD_C_M` (`1|0.5`) y SPs actualizados para diferencia económica sobre fracción afectada.
- Ordenes de trabajo / Cambio material y Merma (2026-04-09): el cálculo `subtotal/iva/total/diferencia` usa `AUT/ORIGEN_AUT` + `REQF` de `PV_CTR_FOL_ASVR` (con compatibilidad `RQFAC`) y `DAT_SUC.IVA_INTEGRADO`, para no depender de `PV_CTR_ORDS.RQFAC` cuando viene `NULL`.
- Ordenes de trabajo / Cambio material y Merma (2026-04-19): contexto/API y SPs priorizan fiscalidad del folio (`REQF` con fallback `RQFAC`) para mantener cálculo económico consistente al crear la ORD derivada.
- Ordenes de trabajo / Cambio material y Merma (2026-04-19): contexto expone `hasStagingRecord` para ocultar captura hasta crear staging, y la nueva ORD conserva costo base de la ORD original (sin diferencia de precio por artículo nuevo).
- Ordenes de trabajo / Cambio material y Merma (2026-04-21): `solicitar-autorizacion` fija `selCtrlOrd=14`; `POST /ordenes-trabajo/:iord/cambio-merma/retrabajo` devuelve a `15`; `POST /ordenes-trabajo/:iord/cambio-merma/autorizar` es el cierre final exclusivo para `admin`, `ANALISTA_INV` e `INVJEF`, creando la nueva ORD y anulando la original.
- Ordenes de trabajo / Cambio material y Merma (2026-04-22): la afectación de inventario/contable del cierre final se alinea a `DAT_CMOV`/`DAT_CAT_CTAS`; MB51 usa clases `204/205` (cambio) y `456/455/457` (merma), `CTOT = CTDA * DAT_ART.CTOP`, y `DAT_CTRL_CTAS` usa `CTA=101001001` con movimientos `801/802` y `NDOC` consecutivo derivado de `DAT_CMOV`. Para cambio/merma, MB51 concentra todos los renglones bajo `DOCP = IDFOL` original.
- Ordenes de trabajo / Panel ORDs (2026-04-21): los roles `ANALISTA_INV` e `INVJEF` atienden revisión de cambio/merma (`selCtrlOrd=14`) y la visibilidad operativa se controla por matriz `DAT_JAO_ORD_FLUJO_VIS`.
- Ordenes de trabajo / Garantía (2026-04-29): `garantia` cambia transición a `11 -> 9.3`; el panel `entregadas` queda solo para `admin`/`JEF_TALLER` con acción visible `VER_DETALLE`; se agrega `POST /ordenes-trabajo/:iord/aplicar-merma-cambio` para capturar `TIPOM(1|2)` + `MOTR` y enrutar `9.3 -> 9.1|9.2` reutilizando el flujo de cambio/merma existente.
- Ordenes de trabajo / Recepción laboratorio externo (2026-05-01): `POST /ordenes-trabajo/recibir/validar|lote` habilita recepción para `ANALISTA_ORD/ANALISTA` solo cuando la ORD pertenece a laboratorio externo; al recibir, la transición queda `5 -> 10` para externo y `5 -> 7` para laboratorio interno (sin asignación/trabajo terminado en externo).
- Ordenes de trabajo / Envío y recepción laboratorio externo (2026-05-03): `POST /ordenes-trabajo/enviar/lote` ahora enruta ORDs con `DAT_LAB.UBILAB='EXTERNO'` a `ESTSEGU=9` (pendiente recibir en analista), manteniendo `3 -> 5` para laboratorio interno; `POST /ordenes-trabajo/recibir/validar|lote` para `ANALISTA_ORD/ANALISTA` valida flujo `9` en externo y aplica `9 -> 10` (interno mantiene `5 -> 7`).
- Ordenes de trabajo / Matriz persistente de visibilidad (2026-05-03): la visibilidad de flujos por rol/panel se toma desde `dbo.DAT_JAO_ORD_FLUJO_VIS` (`MODULO='DAT_JAO_ORD'`), con soporte de excepción `SOLO_EXTERNO=1` para mostrar flujo `9` solo cuando laboratorio (`DAT_LAB.UBILAB`) es externo.
- Ordenes de trabajo / Matriz persistente de visibilidad (2026-05-04): cuando un usuario opera con rol equivalente (ej. `ANALISTA` -> alias `ANALISTA_ORD`), la API combina reglas por flujo entre rol principal+alias con prioridad al rol exacto; esto evita perder visibilidad de `ESTSEGU=9` externo cuando existe configuración parcial y `SOLO_EXTERNO=1`.
- Datos Maestros / Visualización por ROLL en ORD (2026-05-03): CRUD `GET/POST/PATCH/DELETE /ord-flujo-vis` + `GET /ord-flujo-vis/catalogos` (fuentes `ROL`, `DAT_EST_ORD`) para administrar `dbo.DAT_JAO_ORD_FLUJO_VIS`; `ORDEN` se calcula automático en backend con base en `ESTA`.
- Seguridad/maestros (2026-05-03): tabla `ROL` incorpora `IDDEPTO` (FK a `DEPARTAMENTO.IDDEPTO`) y `DAT_JAO_ORD_FLUJO_VIS.ROLE_CODE` se relaciona por FK con `ROL.CODIGO`.
- Datos Maestros / Módulos Front unificado (2026-05-04): se mantiene un único CRUD funcional sobre `MOD_FRONT` vía `/datmodulos`; frontend mueve acceso operativo a `/#/masterdata/access/mod-front` y no requiere cambios de contrato API ni SP adicional.
- Datos Maestros / Enrolamiento Front por usuario (2026-05-04): se agrega `USR_GRUPMOD_FRONT` y endpoints `/access/users/:id/enrolamientos-front`; política de menú Home: primero asignaciones activas por usuario (`USR_GRUPMOD_FRONT`), si no existen se usa rol (`ROL_GRUPMOD_FRONT`).
- Datos Maestros / Enrolamiento Front por usuario (2026-05-04): `GET /access/users` devuelve `SUC/SUC_DESC` y `IDDEPTO/DEPTO_NOMBRE`, con filtros opcionales `suc` e `idDepto` para selector de usuarios en frontend.
- Datos Maestros / Acceso por sucursal (2026-05-04): `GET /usr-mod-suc` agrega filtros opcionales `sucUsuario` (contra `USUARIO.SUC`) y `depto` para soportar filtros dropdown del CRUD/popup en frontend.
- Datos Maestros / Acceso por sucursal (2026-05-06): el filtro `depto` en `GET /usr-mod-suc` aplica coincidencia por `DEPARTAMENTO de USUARIO OR DEPTO de MOD_FRONT` (ya no intersección estricta).
- Ordenes de trabajo / Panel ORDs (2026-05-06): `listarColaboradoresAsignar` permite a `ANALISTA_INV` e `INVJEF` consultar catálogo de asignados; se agrega script `sql/2026-05-06_ord_flujo_vis_analista_inv_invjef_expand.sql` para ampliar visibilidad operativa configurada en `DAT_JAO_ORD_FLUJO_VIS`.
- Ordenes de trabajo / Panel ORDs (2026-05-06): se corrige `dbo.sp_ordenes_trabajo_panel` con script `sql/2026-05-06_ordenes_trabajo_panel_analista_inv_selctrl14_fix.sql` para reponer visibilidad de `ANALISTA_INV/INVJEF` y aplicar criterio `selCtrlOrd=14` en la cola de revisión de cambio/merma.
- Datos Maestros / Compatibilidad puestos con ROL (2026-05-05): `/puestos` deja de depender de la tabla `PUESTO` y usa `ROL` como fuente compatible (`IDROL -> IDPUESTO`) para operación legacy en bases donde `PUESTO` ya no existe; `/users` mantiene contrato actual sin `IDPUESTO`.
- AppModule / registro de módulos PV (2026-05-05): se restituye el registro en `imports` para `PvDevoluciones`, `PagosServicios`, `Retiros`, `FormasPagoCambios`, `CajonEstado`, `CajaGeneral`, `Facturacion` y `CtrlCtas` para evitar `404` por módulos no montados.
- Datos Maestros / Configuración maestra (2026-05-05): se habilita `GET/PUT /masterdata/configuracion-maestra` para alinear contrato con frontend en el submódulo de datos maestros.
- Seguridad / Excel uploads confiables (2026-05-04): `alta-masiva`, `datart` y `conteos` validan fuente de archivo antes de parsear (`extensión`, `MIME`, `firma binaria`, tamaño máximo y límites de hojas/renglones/columnas vía `src/common/security/trusted-excel-upload.ts`); parseo tabular crítico migra a `header:1` para evitar mapear encabezados no confiables a objetos JS.
- Cotizaciones / Cierre (2026-04-09): `sp_pv_cotizacion_cerrar` sincroniza `PV_CTR_ORDS.RQFAC` al mover ORDs a `ESTATUS=2`; script `sql/2026-04-09_pv_cotizacion_cerrar_sync_rqfac_ords.sql` corrige transmitidos históricos.
- Colaboradores / Alta (2026-04-29): `POST /colaboradores` adopta contrato con `horario_id` (sin `turno_id`) y ejecuta `upsert` por `id_empleado`; responde `201` en creación y `200` en actualización, con mensaje claro en fallos SQL Server.
- Punto de venta / Gestión de promociones (2026-05-09): se incorpora módulo backend `promociones` en `AppModule` con endpoints CRUD de cabecera (`PROMO_CAB`), criterios (`PROMO_REGLA_CRITERIO`), beneficios (`PROMO_REGLA_BENEFICIO`) y ejecución por folio (`/promociones/evaluar/:idfol`, `/promociones/aplicar/:idfol`, `/promociones/aplicadas/:idfol`). La administración queda restringida a `admin` y rol `JEFOPE`; operación requiere script `sql/2026-05-09_promociones_descuentos_base.sql`.

## Documentación por módulos
- Base de módulos: `docs/modules/base_modulos/AGENTS.md` (README: `docs/modules/base_modulos/README.md`)
- Core y seguridad: `docs/modules/core_seguridad/AGENTS.md` (README: `docs/modules/core_seguridad/README.md`)
- Punto de venta: `docs/modules/punto_venta/AGENTS.md` (README: `docs/modules/punto_venta/README.md`)
- Ordenes de trabajo: `docs/modules/ordenes_trabajo/AGENTS.md` (README: `docs/modules/ordenes_trabajo/README.md`)
- Reloj checador: `docs/modules/reloj_checador/AGENTS.md` (README: `docs/modules/reloj_checador/README.md`)

## Conexiones y consultas (resumen)
- DB MSSQL, `autoLoadEntities=true`, `synchronize=false`, `logging=false`, `trustServerCertificate=true`, `encrypt=false`.
- Variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_SCHEMA`.
- Acceso a datos: repos/QueryBuilder para CRUD/catalogos; SQL directo (`dataSource.query`) para reportes/legacy; transacciones con `QueryRunner` en procesos críticos; SPs para flujos de negocio.

## Reglas estrictas
- No modificar lógica de negocio sin confirmación.
- No cambiar versiones de dependencias ni agregar nuevas sin permiso.
- No eliminar endpoints, entidades ni DTOs sin confirmación explícita.
- No editar `dist/` ni `node_modules/`; no exponer secretos.
- Evitar comandos destructivos.

## Pruebas
- Ejecutar `npm test` antes de entregar.
- Cuando el cambio involucre al frontend `ioe_app`, coordinar y correr también `flutter analyze` y `flutter test`.
- Arranque dev recomendado en Windows: `npm run start:dev:safe` para liberar `3001/8081` cuando otra instancia previa de `ioe-api` quedó activa y evitar `EADDRINUSE`.

## Refactors
- Incrementales y de bajo riesgo.
- No romper contratos HTTP ni modelos de BD.
- Mantener rutas, nombres de propiedades y DTOs existentes; actualizar tests/Swagger si aplica.

## Cambios estructurales
- Mover carpetas o renombrar módulos requiere aprobación previa.
- Seguir patrón controller -> service -> entity/dto.
- Registrar nuevos módulos en `src/app.module.ts`.

## Cambios de dependencias
- Requieren aprobación y justificación técnica.

## Logica critica
- Autenticación, roles, auditoría y configuración de BD.

## Documentacion viva obligatoria
- Cada cambio funcional debe actualizar README/AGENTS principal y los README/AGENTS del módulo afectado (app y API) en el mismo trabajo.

