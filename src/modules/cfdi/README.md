# CFDI Quadrum

`CfdiModule` implementa timbrado Quadrum separado de Facturify. El submódulo `correo/` agrega la primera versión de envío post-timbrado con Gmail API.

## Integración productiva de Quadrum

Plan de corrección y criterios de activación: [QUADRUM_PRODUCCION_PLAN.md](../../../docs/modules/cfdi/QUADRUM_PRODUCCION_PLAN.md). Estado por RFC, configuración y UAT: [QUADRUM_PRODUCCION_SEGUIMIENTO.md](../../../docs/modules/cfdi/QUADRUM_PRODUCCION_SEGUIMIENTO.md). La captura de endpoints en `.env` local no acredita su carga en el proceso productivo ni habilita los caminos fiscales bloqueados por código.

Acta JICJ: [QUADRUM_PRODUCCION_UAT.md](../../../docs/modules/cfdi/QUADRUM_PRODUCCION_UAT.md); JIFT: [caso VF0030](../../../docs/modules/cfdi/QUADRUM_PRODUCCION_UAT_JIFT6203071N7_VF0030.md); JIFJ: [caso VF0008](../../../docs/modules/cfdi/QUADRUM_PRODUCCION_UAT_JIFJ4704238T5.md). Los tres RFC comerciales tienen un caso FACTURA timbrado y persistido. VF0004/CFDI40147 es incidencia operativa de datos del cliente fuera del resultado de integración. NC/REP/cancelación se validarán conforme aparezcan casos; hoy la lista productiva de API admite sólo FACTURA aunque existan acciones en UI. Transporte/contratos base contrastados con WSDL. Correo, PDF y consulta SAT tienen [plan independiente](../../../docs/modules/cfdi/QUADRUM_POST_TIMBRADO_CORRECCION_PLAN.md) y [seguimiento](../../../docs/modules/cfdi/QUADRUM_POST_TIMBRADO_CORRECCION_SEGUIMIENTO.md), incluido desajuste de credenciales SOAP de obtiene_status_sat. Certificado de pruebas excluido de producción. Rechazos anteriores se conservan como historial.

## Edición independiente de cuenta PAC

`PATCH /cfdi/csd/:rfc/quadrum` exige JWT y `AdminOnlyGuard`. Recibe `quadrumUsuario` y `quadrumPassword` opcional. Cambiar usuario o configurar cuenta sin contraseña guardada exige contraseña nueva. Omitirla con el mismo usuario conserva cifrado. No devuelve contraseña ni requiere recargar CER/KEY.

Sólo actualiza las dos columnas PAC del CSD activo, con comprobación de certificado/usuario anteriores para detectar cambios concurrentes; cifra contraseña con clave existente e invalida caché. No cambia emisor, certificados, vigencia ni lista de RFC habilitados. No envía consulta ni consume timbre al guardar.

Release acotado API/App: `deploy/quadrum/Dockerfile.cuenta` recibe API exportada de Git y web compilada por separado. Mantiene Nginx/Supervisor del runtime actual y datos/entorno externos. El build web usa exclusivamente configuración pública `/api`, sin copiar archivos privados del servidor ni modificar assets/.env de los repositorios originales.

## Correo

- `EmisionService` encola después de persistir UUID/XML/estado. La falla de email no cambia el resultado fiscal.
- `CfdiCorreoWorker` procesa outbox y reconcilia CFDI nuevos; `DocumentosService` aporta XML original y PDF.
- `GoogleOAuthService` gestiona consentimiento/callback y cifra refresh token. `GmailProvider` envía MIME con ambos adjuntos. `ProveedorCorreo` desacopla la cola del transporte; Microsoft Graph no está implementado en v1.
- `CfdiCorreoController` ofrece configuración, conexión OAuth, prueba, historial y reintento. Rutas protegidas por `JwtAuthGuard` + `CfdiCorreoAccessGuard`, que admite administración o `IDROL=8002` (`facturacion - FACTURACION DE TIENDAS`); callback Google es público y requiere HTTPS.
- `FACT_CFDI_EMAIL_CONFIG`, `FACT_CFDI_EMAIL_OUTBOX` y `FACT_CFDI_EMAIL_OAUTH_STATE` se crearon mediante `sql/2026-10-10_cfdi_correo.sql` en `IOELOCAL` producción el 2026-10-10. Corte vigente del 2026-10-13: automático activo, cuenta/token cifrado presentes, envíos sin éxito; estado inicial apagado es histórico. Consultar seguimiento independiente antes de actuar.
- OAuth acepta nombres preferidos `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` y aliases existentes `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY` es secreto externo al repositorio y debe permanecer estable para descifrar refresh tokens y destinatarios. El refresh token se obtiene por OAuth y se guarda cifrado; no se captura manualmente en `.env`.
- `INCIERTO` requiere revisión manual. No reintentar automáticamente cuando no se pueda confirmar si Gmail aceptó el mensaje.

Plan, criterios y seguimiento: [`docs/modules/cfdi/FACTURA_QUADRUM_CORREO_PLAN.md`](../../../docs/modules/cfdi/FACTURA_QUADRUM_CORREO_PLAN.md) y [`FACTURA_QUADRUM_CORREO_SEGUIMIENTO.md`](../../../docs/modules/cfdi/FACTURA_QUADRUM_CORREO_SEGUIMIENTO.md).

Producción exige `QUADRUM_PRODUCCION_HABILITADA=true`, RFC explícitos en `QUADRUM_RFC_HABILITADOS` y flujos explícitos en `QUADRUM_FLUJOS_HABILITADOS`. Sin esas condiciones se permite diagnóstico, no operación fiscal. Datos de documento sujetos a acceso por sucursal; ninguna cuenta global reemplaza al RFC. Reservas inciertas y cancelaciones pendientes bloquean reemisión.


## Consulta SAT y contratos por ambiente (2026-10-13)

`obtiene_status_sat` usa usuario/contrasena en producción y usario/password en desarrollo, según sus WSDL oficiales. Corrección local validada por pruebas de contrato y build; despliegue y consulta real pendientes. Endpoint, cuenta por RFC, namespace y SOAPAction sin cambios. Seguir SAT-01/SAT-02 en expediente independiente; no interpretar este ajuste como confirmación de Vigente.
# Control del consumidor de correo — 2026-10-13

`CFDI_EMAIL_WORKER_ENABLED` admite `true` o `false`; por defecto `false`.
Sólo el backend designado para consumir la outbox debe configurar `true`.
Desarrollo conectado a IOELOCAL debe conservar `false`. Esta bandera controla
los cron de consumo y reconciliación; no cambia AUTOMATICO en SQL ni impide
registrar eventos después del timbrado. Antes de desplegar esta versión en
producción, provisionar explícitamente la bandera en el consumidor designado.

Gmail conserva únicamente motivos de error de una lista permitida; no guarda
mensajes crudos de Google. Límites por usuario/tasa son reintentables; respuestas
5xx, timeout y fallos desconocidos durante envío conservan resultado INCIERTO.
Preparación XML/PDF identifica la etapa sin copiar excepciones sensibles.



## Identidad fiscal sin restricción por sucursal — 2026-10-14

El titular autoriza excepción específica de FACTURA_QUADRUM: sucursal no limita operación ni determina la identidad del emisor. Guard de documentos conserva autenticación, existencia y RFC emisor válido, pero deja de consultar USR_MOD_SUC o comparar SUC del usuario. Simulación/emisión exigen RfcEmisor en cabecera, sin inferirlo de DAT_SUC ni comparar con RFC actual de sucursal. CSD y cuenta propios, habilitación RFC/flujo, restricciones de pruebas y protección contra duplicidad/incertidumbre continúan. Permisos administrativos de CSD/correo y reglas de otros módulos sin cambios. Los criterios anteriores de bloqueo fiscal por sucursal quedan supersedidos sólo para este módulo. Acta de diagnóstico/intento: docs/modules/cfdi/QUADRUM_DF06_VF0007_20261014.md.
