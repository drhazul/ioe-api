# Core y seguridad (AGENTS API)

Navega a otros README/AGENTS solo cuando sea necesario.

Enlaces relacionados:
- AGENTS principal de la API: `AGENTS.md`
- README de este módulo: `docs/modules/core_seguridad/README.md`
- Otros AGENTS: `docs/modules/base_modulos/AGENTS.md`, `docs/modules/punto_venta/AGENTS.md`

## Conexiones y consultas (estado actual)
- Conexion DB: `type: mssql`, `autoLoadEntities: true`, `synchronize: false`, `logging: false`.
- variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `DB_SCHEMA`.
- `trustServerCertificate: true`, `encrypt: false`.
- Acceso a datos: repositorios/QueryBuilder TypeORM para CRUD/catalogos; SQL directo con `dataSource.query` para reportes y compatibilidad legacy.
- Transacciones: `QueryRunner` en inventarios, cargas masivas y operaciones compuestas; SPs para procesos críticos.

## Regla transversal: autorizacion por sucursal con USR_MOD_SUC
- Si existen filas activas en `USR_MOD_SUC` para `USUARIO+MODULO`, esas son las sucursales permitidas para no-admin.
- Admin (roleId `1`) mantiene bypass.
- Compat legacy: sin filas en `USR_MOD_SUC`, fallback a `user.suc`.
- Validar en backend en lectura y escritura; frontend solo refleja selección permitida.

## Regla principal FACTURA / FACTURA_VIEW (obligatoria)
- `FACTURA` (compat: `FACTURACION`, `PV_FACTURACION`, `FACT_IOE`) habilita gestión; `FACTURA_VIEW` habilita consulta.
- Admin (`ADMIN_ROLE_IDS`/`ADMIN_NIVELES`, usuario `ADMIN`) tiene bypass total sin depender de `USR_MOD_SUC`.
- Facturación base no usa `USR_MOD_SUC`; excepción: `REG_SINREQF` sí aplica alcance por sucursal.
- En unificación de facturación, no restringir por `user.suc` cuando ya hay permisos de gestión.

## Caja General: autorizacion por sucursal
- Autorización no-admin por `USR_MOD_SUC` para `DAT_FORM_ENTR_OPV`, `DAT_RES_ENTRE_CAJ`, `PV_ENTREGA_CG`; fallback a `user.suc` si no hay filas.
- Exportacion Excel global debe incluir `REQF` original y escribir importes como numericos con formato moneda.
- `assertSucursalAccess` debe rechazar sucursales fuera de la interseccion autorizada.

