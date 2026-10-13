# CFDI Quadrum

`CfdiModule` implementa timbrado Quadrum separado de Facturify. El submódulo `correo/` agrega la primera versión de envío post-timbrado con Gmail API.

## Integración productiva de Quadrum

Plan de corrección y criterios de activación: [QUADRUM_PRODUCCION_PLAN.md](../../../docs/modules/cfdi/QUADRUM_PRODUCCION_PLAN.md). Estado por RFC, configuración y UAT: [QUADRUM_PRODUCCION_SEGUIMIENTO.md](../../../docs/modules/cfdi/QUADRUM_PRODUCCION_SEGUIMIENTO.md). La captura de endpoints en `.env` local no acredita su carga en el proceso productivo ni habilita los caminos fiscales bloqueados por código.

## Correo

- `EmisionService` encola después de persistir UUID/XML/estado. La falla de email no cambia el resultado fiscal.
- `CfdiCorreoWorker` procesa outbox y reconcilia CFDI nuevos; `DocumentosService` aporta XML original y PDF.
- `GoogleOAuthService` gestiona consentimiento/callback y cifra refresh token. `GmailProvider` envía MIME con ambos adjuntos. `ProveedorCorreo` desacopla la cola del transporte; Microsoft Graph no está implementado en v1.
- `CfdiCorreoController` ofrece configuración, conexión OAuth, prueba, historial y reintento. Rutas protegidas por `JwtAuthGuard` + `AdminOnlyGuard`; callback Google es público y requiere HTTPS.
- `FACT_CFDI_EMAIL_CONFIG`, `FACT_CFDI_EMAIL_OUTBOX` y `FACT_CFDI_EMAIL_OAUTH_STATE` se crearon mediante `sql/2026-10-10_cfdi_correo.sql` en `IOELOCAL` producción el 2026-10-10; automático permanece apagado.
- OAuth acepta nombres preferidos `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` y aliases existentes `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY` es secreto externo al repositorio y debe permanecer estable para descifrar refresh tokens y destinatarios. El refresh token se obtiene por OAuth y se guarda cifrado; no se captura manualmente en `.env`.
- `INCIERTO` requiere revisión manual. No reintentar automáticamente cuando no se pueda confirmar si Gmail aceptó el mensaje.

Plan, criterios y seguimiento: [`docs/modules/cfdi/FACTURA_QUADRUM_CORREO_PLAN.md`](../../../docs/modules/cfdi/FACTURA_QUADRUM_CORREO_PLAN.md) y [`FACTURA_QUADRUM_CORREO_SEGUIMIENTO.md`](../../../docs/modules/cfdi/FACTURA_QUADRUM_CORREO_SEGUIMIENTO.md).

Producción exige `QUADRUM_PRODUCCION_HABILITADA=true`, RFC explícitos en `QUADRUM_RFC_HABILITADOS` y flujos explícitos en `QUADRUM_FLUJOS_HABILITADOS`. Sin esas condiciones se permite diagnóstico, no operación fiscal. Datos de documento sujetos a acceso por sucursal; ninguna cuenta global reemplaza al RFC. Reservas inciertas y cancelaciones pendientes bloquean reemisión.
