# Core y seguridad (API)

Navega a otros README/AGENTS solo cuando la tarea lo requiera.

Enlaces relacionados:
- README principal de la API: `README.md`
- AGENTS de este módulo: `docs/modules/core_seguridad/AGENTS.md`
- Otros módulos: `docs/modules/base_modulos/README.md`, `docs/modules/punto_venta/README.md`

## Conexion a base de datos
- Driver: `mssql` via TypeORM.
- Config relevante (`database.module.ts`):
- `autoLoadEntities: true`
- `synchronize: false`
- `logging: false`
- `trustServerCertificate: true`
- `encrypt: false`
- Pool:
- `max: 20`
- `acquireTimeoutMillis: 60000`
- `requestTimeout: 120000`

## Variables de entorno
Requeridas:
- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`
- `JWT_SECRET`
Opcionales:
- `PORT` (default `3000`)
- `DB_PORT` (default `1433`)
- `DB_SCHEMA` (default `dbo`)
- `JWT_EXPIRES_IN` (default `15m`)
- `REFRESH_EXPIRES_DAYS` (default `30`)
- `CORS_ORIGINS`
- `ADMIN_ROLE_IDS`, `ADMIN_ROLE_ID`, `ADMIN_NIVELES`, `ADMIN_NIVEL`
- `PV_DEV_ORD_BLOCK_THRESHOLD` (default `5`)
- `CFDI_STORAGE_BASE_PATH`, `CFDI_STORAGE_BASE_PATH_ALT`, `CFDI_STORAGE_BASE_PATH_DEV`, `CFDI_STORAGE_BASE_PATH_PROD`, `CFDI_STORAGE_BASE_PATHS`

## Reglas de autorizacion por sucursal (criticas)
- Inventarios (`DAT_JAA_ALM`): validar `USR_MOD_SUC` para usuarios no-admin.
- Control de cuentas/catalogo cuentas: validar `USR_MOD_SUC` para `DAT_CONS_CTAS`, `DAT_CTRL_CTAS`, `DAT_CTRL_CUENTAS`.
- Caja general: validar `USR_MOD_SUC` para `DAT_FORM_ENTR_OPV`, `DAT_RES_ENTRE_CAJ`, `PV_ENTREGA_CG`.
- Regla transversal: si un usuario no-admin tiene filas activas en `USR_MOD_SUC` para el modulo consultado, esas sucursales son las autorizadas; si no hay filas, fallback a `user.suc`.
- Acceso por sucursal (2026-05-06): `GET /usr-mod-suc` interpreta `depto` como coincidencia por `departamento de usuario OR departamento de módulo front`.
- Exportacion Excel caja general: incluye `REQF` original (`-1/0/1`) y exporta importes como numericos con formato moneda.
- Admin (roleId `1`) mantiene bypass.

## Regla principal FACTURA / FACTURA_VIEW (endpoints, rutas y consultas)
- `FACTURA` (compat: `FACTURACION`, `PV_FACTURACION`, `FACT_IOE`) habilita gestión (emitir/reenviar/cancelar/unificar).
- `FACTURA_VIEW` habilita consulta.
- Admin (`ADMIN_ROLE_IDS`/`ADMIN_NIVELES`, usuario `ADMIN`) tiene bypass total sin requerir `USR_MOD_SUC` ni enrolamiento extra.
- Facturación base no usa `USR_MOD_SUC`; excepción: `REG_SINREQF` sí aplica alcance por sucursal para no-admin.
- En unificación (`/facturacion/unificaciones/*`), no restringir por `user.suc` cuando el usuario ya tiene permisos de gestión.

