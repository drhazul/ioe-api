# Facturify sandbox integration plan (IOE API)

## Estado actual (fase 1)
- Endpoint pendientes: `GET /facturacion/pendientes`
- Validación previa: `GET /facturacion/:idFol/validar`
- Emisión manual (placeholder): `POST /facturacion/:idFol/emitir`
- Cancelación manual (placeholder): `POST /facturacion/:idFol/cancelar`

## Variables requeridas
- `FACTURIFY_BASE_URL=https://api.facturify.com`
- `FACTURIFY_API_KEY=...`
- `FACTURIFY_API_SECRET=...`
- `CFDI_STORAGE_BASE_PATH=/mnt/respaldoCFDI` (montaje local del recurso `\\192.168.10.234\ArchivosUsuarios\respaldoCFDI`)

## Siguientes pasos
1. Integrar `POST /api/v1/auth` para token.
2. Construir payload CFDI desde FAC_SVR_SHAP + FACT_TICKET_SHP + FACT_CLIENT_SHP + DAT_SUC.
3. Emisión real y persistencia de UUID/response.
4. Cancelación real y sincronización de estatus.
5. Exponer XML/PDF para frontend.
