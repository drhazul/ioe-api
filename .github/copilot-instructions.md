# IOE API (NestJS + MSSQL)

## Architecture & data flow
- Bootstrap + global behavior in [src/main.ts](src/main.ts): global `ValidationPipe`, CORS allowlist (env `CORS_ORIGINS` or localhost), Swagger at `/docs`.
- Module graph is centralized in [src/app.module.ts](src/app.module.ts); it wires feature modules and sets global `RolesGuard` + `AuditInterceptor`.
- Database uses TypeORM MSSQL via [src/config/database.module.ts](src/config/database.module.ts). Required env keys are validated in [src/config/env.validation.ts](src/config/env.validation.ts).

## Auth & access control
- JWT + refresh tokens in [src/modules/auth/auth.service.ts](src/modules/auth/auth.service.ts): payload includes `roleId`, `nivel`, `suc`; refresh tokens stored in `UsuarioTokenEntity` and rotated on refresh.
- Request auth uses `JwtAuthGuard` and role checks via `@Roles()` in [src/common/decorators/roles.decorator.ts](src/common/decorators/roles.decorator.ts) and [src/common/guards/roles.guard.ts](src/common/guards/roles.guard.ts). `AdminOnlyGuard` enforces `roleId === 1`.

## Auditing & side-effects
- Mutating requests (POST/PATCH/PUT/DELETE) are logged in [src/common/interceptors/audit.interceptor.ts](src/common/interceptors/audit.interceptor.ts); it redacts password/token fields and derives `MODULO`/`ENTIDAD` from the URL.

## Module conventions
- Feature modules follow controller/service/dto/entities under [src/modules](src/modules). Example: [src/modules/admin/admin.controller.ts](src/modules/admin/admin.controller.ts) + [src/modules/admin/admin.service.ts](src/modules/admin/admin.service.ts).
- Many endpoints use `@ApiTags` and `@ApiBearerAuth` to show up in Swagger; check `Auth`, `Admin`, `Access` modules for patterns.

## Useful local assets
- [access.http](access.http) contains sample HTTP calls for Access/Admin flows. Update `@baseUrl` to match the server port (default is 3001 per [src/main.ts](src/main.ts)).
