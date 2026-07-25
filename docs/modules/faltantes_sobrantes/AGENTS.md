# AGENTS Faltantes y Sobrantes

- Usar conexion secundaria `FYS_DB_*`; nunca hardcodear credenciales.
- Toda consulta/accion audita en `AUDIT_LOG`.
- Admin tiene acceso total; usuario normal queda limitado por sucursal.
- Migrar consultas Access como SP/CTE idempotente; no persistir tablas temporales locales.
