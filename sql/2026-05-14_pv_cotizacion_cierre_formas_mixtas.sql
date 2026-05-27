/*
  2026-05-14
  Cotizaciones cierre mixto:
  - CREDITO y DEUDOR no se mezclan con otras formas.
  - Formas no EFECTIVO no pueden exceder pendiente acumulado en orden de captura.
  - Solo EFECTIVO puede exceder total para generar cambio.
*/

:r .\sp_pv_cotizacion_cerrar_create.sql
