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
