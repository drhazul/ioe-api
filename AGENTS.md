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
- Ordenes de trabajo / Panel ORDs (2026-04-21): los roles `ANALISTA_INV` e `INVJEF` consumen una cola dedicada de revisión (`selCtrlOrd=14`) sin modificar la visibilidad operativa del resto de perfiles.
- Ordenes de trabajo / Garantía (2026-04-29): `garantia` cambia transición a `11 -> 9.3`; el panel `entregadas` queda solo para `admin`/`JEF_TALLER` con acción visible `VER_DETALLE`; se agrega `POST /ordenes-trabajo/:iord/aplicar-merma-cambio` para capturar `TIPOM(1|2)` + `MOTR` y enrutar `9.3 -> 9.1|9.2` reutilizando el flujo de cambio/merma existente.
- Cotizaciones / Cierre (2026-04-09): `sp_pv_cotizacion_cerrar` sincroniza `PV_CTR_ORDS.RQFAC` al mover ORDs a `ESTATUS=2`; script `sql/2026-04-09_pv_cotizacion_cerrar_sync_rqfac_ords.sql` corrige transmitidos históricos.

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

