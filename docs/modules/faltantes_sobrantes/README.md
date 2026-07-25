# Faltantes y Sobrantes

Endpoints JWT:

- `GET /faltantes-sobrantes/reportes/catalogos`
- `GET /faltantes-sobrantes/reportes/ajustes?suc=7&qna=202652`

BD FYS usa conexion secundaria `FYS_DB_HOST`, `FYS_DB_PORT`, `FYS_DB_USER`, `FYS_DB_PASS`, `FYS_DB_NAME`, `FYS_DB_ENCRYPT` y `FYS_DB_TRUST_CERT`.

SP: `dbo.FYS_REPORTE_AJUSTES_WEB`, definido en `sql/2026-07-10_fys_reporte_ajustes_web.sql`. Replica cadena Access `FYS_REPORTE_CIERRE_QNA_RESUMEN -> FYS_REPORTE_CIERRE_QNA_CONSU -> FYS_XDIA/FYS_OPV` usando tablas server `FYS_XDIA_SVR3` y `FYS_OPV_SVR1`.
