# Instrucciones de agente para ioe-api

## Contexto del proyecto

- Backend API en NestJS (TypeScript) para el sistema IOE.
- Arquitectura modular por feature, con controllers, services, DTOs y entidades.
- Persistencia con TypeORM sobre MSSQL; entidades y columnas en mayusculas.
- Autenticacion JWT, RolesGuard global y AuditInterceptor global.
- Validacion global con ValidationPipe (whitelist + transform + forbid).

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

## Buenas practicas

- Controllers delgados; logica en services.
- DTOs con class-validator y transform.
- Manejo de errores con excepciones de Nest.
- No habilitar `synchronize` sin aprobacion.
