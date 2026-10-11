# Plan: envío de CFDI por correo en FACTURA_QUADRUM

Fecha de preparación: 2026-10-10
Estado: implementación desplegada en producción; configuración OAuth, consentimiento, envío de prueba y UAT pendientes. Envío automático sigue apagado.
Alcance de este documento: diseño y compuertas operativas; el seguimiento registra avance verificable.

## Preparación OAuth Google

- Para el piloto inicial, el titular eligió su cuenta personal de Gmail actual. Esto permite probar el flujo; todavía no define proveedor ni cuenta de producción.
- Ya existe proyecto de Google Cloud y cliente OAuth web. URI registrada: `https://erp.ioebusiness.com.mx/api/auth/google/callback`. Titular confirma que `erp.ioebusiness.com.mx` será hostname público de producción; conservar esta URI, ya coincide con el callback de la API. TLS público enruta al build conjunto de `.234`; callback ya desplegado, GET sin state devuelve 400 esperado.
- La pantalla OAuth quedó en modo externo/pruebas y la cuenta actual fue añadida como usuaria de prueba, según las confirmaciones del titular.
- El flujo solicita `openid`, `email` y `https://www.googleapis.com/auth/gmail.send`. Google clasifica `gmail.send` como sensible; validar requisitos antes de publicar para uso continuo.
- La API ya tiene ruta de inicio y callback en código. El titular no necesita copiar ni generar el refresh token: al autorizar desde el panel, el callback lo intercambia y lo guarda cifrado en SQL. No hay evidencia de consentimiento ni token generados todavía.
- En modo externo/pruebas, la autorización y el refresh token de usuarios de prueba vencen a los siete días para este alcance. Este modo sirve para validar el flujo, no como configuración estable de envío automático.
- El secreto más reciente apareció completo en la lectura accesible del navegador durante la verificación. El titular reporta que lo deshabilitó/eliminó, creó otro y actualizó `.env`; ese cambio no se verificó en Cloud ni se leyó el nuevo valor. No incluir valores en este plan, tickets ni logs.
- La API acepta los nombres preferidos `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` y también los aliases ya usados por `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Los aliases no son inválidos ni requieren renombrarse.
- La clave local `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY` ya fue generada y guardada sin mostrar su valor. El backend desplegado debe recibir la misma clave como secreto estable antes de OAuth.
- Despliegue de producción: usar build conjunto front+back en `192.168.10.234`, bajo `/root/ioe_stack`; contenedor `ioe`, imagen `ioe-allinone:latest`, front `8085`, API `3001`. No desplegar integración en `.40` ni activar API standby.
- Ruta pública aplicada: `erp.ioebusiness.com.mx` conserva TLS en Nginx `.3`; upstream actual `.3` → `172.16.100.2:8085` (HAProxy ingress) → `.234:8085`; Nginx del contenedor conjunto sirve Flutter y proxya `/api/` a `127.0.0.1:3001`. Sin cambio DNS ni de URI OAuth. Respaldo del vhost: `/root/erp-proxy-backup-20261010/erp.ioebusiness.com.mx.conf.before-combined-prod`.
- Postflight de producción: Nginx `.3` activo; HTTPS `/` y `/api/health/db` responden 200 con TLS válido. Tras el release, API `/health`, front y DB health responden 200; callback sin state da 400 esperado.
- Preflight previo al release (superado): se preservó `/root/ioe_stack/deploy/ioe-api.env` y cambios locales del host; se publicó desde árbol limpio sin snapshot SQL ni secretos.
- El env privado de producción sigue intacto porque política de comandos rechazó transferir valores desde `.env`. Titular debe cargar por canal seguro `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_OAUTH_PUBLISHING_STATUS=TESTING` y `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY`; no copiar refresh token.

Fuentes oficiales: [flujo OAuth web y acceso offline](https://developers.google.com/identity/protocols/oauth2/web-server?hl=es-419), [alcances Gmail y clasificación de `gmail.send`](https://developers.google.com/workspace/gmail/api/auth/scopes), [modo externo de pruebas y vencimiento a siete días](https://support.google.com/cloud/answer/15549945?hl=es).

## Objetivo

Después de timbrar correctamente una factura de venta con Quadrum, enviar automáticamente al correo registrado del cliente el XML timbrado y su representación PDF. La falla del correo no debe revertir, cancelar ni cambiar el resultado fiscal del timbrado.

El servicio tendrá una cuenta emisora configurable desde un panel administrativo. La integración debe aceptar más de un proveedor y custodiar credenciales en el backend.

## Alcance inicial

- Solo facturas de venta emitidas por `POST /cfdi/emitir/:idFol` con `CFDI_PAC='QUADRUM'`.
- Un envío automático por UUID emitido, al `EMAILRECEPTOR` registrado para el cliente receptor.
- Adjuntar XML fiscal guardado por el timbrado y PDF generado por `DocumentosService`.
- Configuración administrativa del remitente, conexión de proveedor, prueba de envío y consulta/reintento de fallos.
- Mantener aislados Facturify y `src/modules/facturacion/`.

Fuera de alcance inicial: envío de notas de crédito, complementos de pago, comprobantes de Facturify, campañas, envío masivo, elección de destinatarios arbitrarios durante el timbrado y reenvíos históricos automáticos. Se pueden planear después por separado.

## Base técnica verificada en código

- `src/modules/cfdi/emision.service.ts` reserva folio, timbra, guarda XML, marca el CFDI y actualiza el control de serie. El retorno exitoso ocurre después de esas operaciones.
- `src/modules/cfdi/documentos.service.ts` lee el XML original y genera el PDF bajo demanda desde ese XML; también intenta guardarlo en disco. El correo debe adjuntar los bytes retornados por este servicio, no asumir que el PDF ya existe en disco.
- Preflight read-only de `IOELOCAL` producción confirmó `dbo.FACT_CLIENT_SHP.RfcReceptor/EmailReceptor`, collation case-insensitive y `MOD_FRONT` activo (`IDMOD_FRONT=20008`, `FACTURA_QUADRUM`). El lookup principal por `IDC` es único; si solo queda RFC, existen grupos con correos distintos. API ahora marca esa ambigüedad y omite envío para no escoger correo arbitrario.
- `FAC_SVR_SHAP` contiene `CFDI_UUID`, `CFDI_PAC`, `CFDI_STATUS`, `CFDI_XML_PATH` y `CFDI_PDF_PATH`. Postflight confirmó las tres tablas de correo y sus índices en `IOELOCAL`.
- El flujo actual de correo de Facturify vive en `src/modules/facturacion/` y llama al PAC Facturify. No es un transporte genérico para Quadrum y queda fuera de este cambio.
- `src/modules/cfdi/correo/` contiene outbox, worker, OAuth Google, adapter Gmail, endpoints administrativos y callback. El DDL de `sql/2026-10-10_cfdi_correo.sql` se aplicó transaccionalmente después de backup `COPY_ONLY` con checksum y `RESTORE VERIFYONLY WITH CHECKSUM`.
- `src/modules/cfdi/emision.service.ts` agrega el envío a la cola después de guardar el timbrado. Los fallos de correo no cambian el resultado fiscal; el worker reconcilia timbrados nuevos después de activar el automático.
- La app incluye panel en `/facturacion/correo`. UI y API restringen administración; confirmar que el rol administrador real esté incluido en `ADMIN_ROLE_IDS` o `ADMIN_NIVELES` antes de usarlo.
- El checkout local contiene una referencia a `FACTURA_QUADRUM` y un script SQL local para renombrar el código de `MOD_FRONT`. Ese script no se ejecutó; el código activo en la base real no está confirmado.

Preflight de esquema y datos, backup `COPY_ONLY` con `CHECKSUM`, `RESTORE VERIFYONLY WITH CHECKSUM`, DDL transaccional y postflight se completaron contra `IOELOCAL` producción el 2026-10-10. El postflight confirmó envío automático desactivado y outbox/estados OAuth vacíos. No hubo envío de correo, consentimiento OAuth, despliegue ni UAT. No se devolvieron ni mostraron direcciones individuales de clientes; no se imprimieron ni copiaron valores secretos.

## Recomendación de proveedor

**Decisión v1:** usar Gmail API con OAuth 2.0 para el piloto, porque la cuenta Google Cloud y el cliente web ya están preparados. El código separa el contrato de transporte para poder sumar Microsoft Graph después; esta fase no ofrece selector de proveedor y Gmail es el único adapter implementado. La cuenta personal sirve para validación controlada, no es decisión de producción.

| Opción | Configuración/autenticación | Evaluación para FACTURA_QUADRUM |
|---|---|---|
| Google Workspace / Gmail | Gmail API con OAuth 2.0; admite mensajes con adjuntos. SMTP también permite OAuth 2.0 XOAUTH2. | Buena primera opción si IOE administra Google Workspace. Gmail API evita pedir una contraseña de buzón en el panel. |
| Microsoft 365 / Outlook.com | Microsoft Graph `sendMail` con OAuth 2.0; SMTP de Outlook.com requiere Modern Auth/OAuth2. SMTP AUTH puede estar deshabilitado en Exchange Online. | Buena primera opción si IOE administra Microsoft 365. Preferir Graph; no diseñar sobre autenticación básica. |
| SMTP personalizado | Host, puerto, TLS, método de autenticación y cuenta dependen del proveedor. OAuth2/app password solo si ese servicio lo soporta y su administrador lo habilita. | Alternativa para Titan, relay transaccional u otro servidor. No existe una combinación universal de credenciales que funcione en todos los SMTP. |

La cuenta personal actual de Gmail se eligió para el piloto, no para producción continua. La decisión de producción sigue abierta: cuenta Google apta para verificación y operación, Microsoft 365/Graph o proveedor transaccional. No basta con cambiar `@gmail.com` por `@outlook.com`: Outlook requiere registro OAuth de Microsoft y permisos de Graph. La cola y el contrato de transporte se pueden reutilizar; cada proveedor necesita su adapter y configuración segura.

### Fuentes oficiales consultadas el 2026-10-10

- [Google Gmail API: enviar mensajes y adjuntar archivos](https://developers.google.com/workspace/gmail/api/guides/sending)
- [Google Gmail: SMTP y autorización OAuth2](https://developers.google.com/workspace/gmail/imap/imap-smtp)
- [Microsoft Outlook.com: parámetros SMTP y Modern Auth](https://support.microsoft.com/en-gb/outlook/pop-imap-and-smtp-settings-for-outlook-com)
- [Microsoft Graph: `sendMail`, permisos y adjuntos](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
- [Microsoft Exchange Online: retiro de autenticación básica](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-basic-authentication-exchange-online)
- [Microsoft Exchange Online: control de SMTP AUTH](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission)

## Diseño propuesto

### 1. Configuración del remitente

La v1 usa una cuenta emisora global para el módulo: el Gmail conectado por OAuth para todos los RFC emisores. La dirección visible en el panel es la cuenta Google conectada; no se permite declarar un `From` distinto sin autorización del proveedor. Cuenta por RFC queda fuera de alcance.

El panel administrativo debe permitir:

- Activar o pausar el envío automático.
- Ver la cuenta Google conectada y volver a autorizarla si cambia.
- Configurar el nombre visible del remitente. La dirección emisora corresponde a la cuenta Google conectada.
- Enviar un mensaje de prueba a una dirección ingresada para la prueba y mostrar resultado técnico seguro.
- Consultar los últimos envíos y reintentar un caso permitido.

La pantalla puede vivir dentro de FACTURA_QUADRUM, pero el backend debe aplicar autorización administrativa en cada ruta de configuración y reintento. Ocultar el botón en Flutter no es control de acceso.

OAuth refresh tokens, client secrets y claves SMTP deben guardarse solo del lado de la API, cifrados con una clave externa a la base o en gestor de secretos. No devolverlos en `GET`, no escribirlos en logs, no guardarlos en Flutter ni versionarlos. La dirección emisora debe usar un dominio validado con las medidas de autenticación de correo configuradas por su administrador (SPF, DKIM y DMARC).

### 2. Disparo posterior al timbrado

1. `EmisionService` termina únicamente después de recibir aceptación de Quadrum y persistir UUID/XML/estado.
2. Registrar un evento durable de envío con `IDFOL`, UUID, destinatario resuelto y estado. Intentar guardar el evento en la misma transacción que confirma el timbrado; si el diseño real de persistencia no permite atomicidad, agregar una reconciliación idempotente para detectar CFDI Quadrum exitosos sin evento.
3. Un worker toma el evento fuera de la solicitud HTTP, valida que el folio siga identificado como Quadrum y obtiene XML/PDF mediante `DocumentosService`.
4. Resolver el destinatario desde `FACT_CLIENT_SHP.EMAILRECEPTOR` asociado al RFC receptor. Capturar ese destinatario en el evento para conservar a quién se intentó enviar. No aceptar un `From` o destinatario arbitrario desde el cliente de Flutter en el envío automático inicial.
5. Enviar mensaje con asunto y cuerpo configurables/localizables. Adjuntar XML y PDF con nombres legibles que incluyan folio o UUID.
6. Registrar respuesta del proveedor, fecha, número de intento y estado. El HTTP de timbrado no debe esperar al envío ni fallar porque el proveedor de correo no respondió.

Si no hay correo registrado o el formato no es válido, dejar el CFDI timbrado y marcar el evento como omitido por destinatario. Mostrar el motivo en la interfaz y permitir corregir el correo registrado y solicitar reintento autorizado.

### 3. Outbox, idempotencia y recuperación

Outbox persistente en SQL Server quedó creado con el DDL aplicado en `IOELOCAL`; no usar solo una cola en RAM. Cualquier cambio posterior de esquema requiere preflight de solo lectura contra el destino exacto y autorización para ejecutar DDL.

Campos mínimos por definir: identificador, `IDFOL`, UUID, tipo de documento/evento, destinatario, estado, conteo de intentos, siguiente intento, marcas de tiempo, código/mensaje sanitizado y Message-ID devuelto por el proveedor. Índice único propuesto por UUID + tipo de documento + evento automático para no crear trabajos duplicados al reintentar HTTP o reiniciar API. Proteger acceso y retención del correo del cliente, que es dato personal.

Estados sugeridos: `PENDIENTE`, `PROCESANDO`, `ENVIADO` (proveedor aceptó), `REINTENTABLE`, `ERROR_FINAL`, `OMITIDO_SIN_DESTINATARIO` e `INCIERTO`. Aplicar reintentos acotados con espera creciente para fallas transitorias; corregir configuración/destinatario para errores permanentes. Un timeout tras aceptación puede dejar resultado incierto: no prometer entrega exactamente una vez; registrar el caso y requerir reconciliación antes de reenvío para reducir duplicados. `ENVIADO` significa aceptación del proveedor, no lectura ni llegada garantizada a bandeja de entrada.

### 4. Seguridad y límites

- Mantener `FACTURA_QUADRUM` como límite del disparo. No enviar una factura que tenga otro `CFDI_PAC`.
- No cambiar Facturify ni llamar su endpoint de email desde Quadrum.
- No mandar XML/PDF en logs, reportes de error ni respuestas de diagnóstico.
- Evitar exponer credenciales, refresh tokens, direcciones completas y contenido de documentos en la bitácora administrativa; mostrar correo parcialmente enmascarado donde sea suficiente.
- Probar con destinatario controlado y CFDI de sandbox/datos sintéticos. No gastar timbres SAT reales como prueba automatizada.
- Configurar límites de tamaño del mensaje/adjuntos según proveedor y rechazar/reportar un CFDI que exceda esos límites sin alterar el estado fiscal.

## Fases y compuertas

### F0 — Confirmar operación

- Registrar Gmail personal actual solo como proveedor de piloto; decidir proveedor/cuenta de producción después de conocer los requisitos de publicación y verificación OAuth.
- Confirmar remitente global o remitentes por RFC; recomendación inicial: global.
- Confirmar quién podrá administrar configuración/reintentos y cuánto tiempo conservar bitácora.
- Acordar publicación OAuth: pruebas temporales para desarrollo o producción con verificación de los alcances sensibles que Google exija.
- Revocar el secreto que pudo quedar expuesto y custodiar el secreto vigente en un almacén seguro. No pegar secretos o tokens en el chat.

**Salida:** piloto y destino de producción diferenciados; decisión OAuth y custodia de credenciales documentadas sin copiar valores.

### F1 — Preflight técnico de solo lectura

- Confirmar `MOD_FRONT.CODIGO` activo para el módulo Quadrum en la base destino; verificar si el renombrado local fue aprobado/aplicado. **Completado:** `FACTURA_QUADRUM`, ID 20008, activo.
- Confirmar `FACT_CLIENT_SHP.EMAILRECEPTOR`, relación con `RFCRECEPTOR`, registros duplicados y reglas de edición. **Completado en esquema:** columnas presentes; hay 88 grupos de RFC duplicados y 25 con correos distintos; fallback protegido para omitir envío ambiguo.
- Confirmar columnas/campos existentes para UUID, XML/PDF y límites de tamaño de almacenamiento. **Completado para campos SQL:** UUID y rutas XML/PDF presentes; validar archivos reales en despliegue.
- Revisar atomicidad actual entre `marcarTimbrado`, `actualizarEstadoSerie` y la futura creación del evento.
- Verificar el proveedor real y su método OAuth/API, correo remitente autorizado, egress de red, límites y registro DNS.

**Salida:** evidencia de esquema y flujo completada. Backup y DDL de correo aplicados con autorización explícita en `IOELOCAL`; proveedor real, egress y despliegue siguen pendientes.

### F2 — Diseño de persistencia y contrato

- Diseñar tabla/outbox, índices, estados, retención, rutas API y autorización. **Completado:** DDL idempotente aplicado; outbox y estados OAuth vacíos; configuración automática desactivada.
- Mantener reversa documentada para retirar solo tablas nuevas si se cancela la integración antes de guardar datos operativos.
- Revisión de seguridad de cifrado/rotación de tokens y secretos.

**Compuerta:** toda migración requiere autorización explícita con destino exacto, preflight fresco, respaldo/reversa y postflight.

### F3 — Backend y transporte

- Código preparado: contrato de proveedor, adapter Gmail, configuración, prueba de envío y worker durable.
- El código implementa inicio OAuth y callback HTTPS, `state` de un solo uso, `access_type=offline`, scopes `openid email gmail.send`, intercambio en backend y cifrado del refresh token. No iniciar consentimiento hasta que callback esté desplegado y accesible.
- Registrar el evento solo después de confirmar el timbrado Quadrum.
- Generar y adjuntar ambos archivos mediante `DocumentosService`.
- Exponer estado, historial y reintento autorizado con permisos de administrador.

### F4 — Panel Flutter

- Panel agregado en código dentro del módulo Quadrum: nombre remitente, conexión Gmail, prueba de envío e historial/reintentos.
- La API no expone credenciales y enmascara destinatarios; rutas protegidas por JWT y `AdminOnlyGuard`.
- Mostrar aviso legible cuando el CFDI se timbró pero el correo quedó pendiente, omitido o falló.

### F5 — Verificación técnica y piloto

- Falta validar proveedor real en entorno de prueba, XML/PDF correctos, OAuth vencido, destinatario inválido, falta de adjunto, rechazo, timeout, reinicio de worker y doble disparo.
- Verificar expiración de credenciales según el modo OAuth. No aceptar como listo para operación continua un refresh token emitido mientras el proyecto siga en modo externo/pruebas.
- Confirmar que ningún fallo de correo cambia UUID, timbrado o respuesta fiscal ya persistida.
- Pilotear con usuarios/destinatarios autorizados antes de activar envío general.

### F6 — Liberación y UAT

- Completado: commits API `63b11cf` y App `b9fca0b` publicados y desplegados; build conjunto exitoso; DDL ya aplicado en `IOELOCAL`.
- Postflight técnico completado: contenedor activo; API/front/DB health HTTP 200; callback HTTP 400 sin state. Falta cargar env, consentir OAuth, enviar prueba y completar UAT.
- UAT autenticado del titular/área de Facturación: comprobar destinatario real autorizado, XML, PDF, cuerpo del mensaje, reintentos y visualización de estado.

## Criterios de aceptación

1. Solo CFDI de venta timbrado correctamente por Quadrum genera envío automático.
2. Mensaje recibido en buzón de prueba contiene XML original del UUID y PDF correcto.
3. Falta de correo, error OAuth/SMTP, timeout o tamaño excedido no revierte timbrado; queda estado visible y acción controlada.
4. Repetir emisión, reiniciar API/worker o reejecutar el outbox no crea eventos duplicados para el mismo UUID.
5. Prueba de conexión envía solo al destinatario de prueba solicitado; configuración no expone credenciales.
6. API bloquea configuración y reintento a usuarios sin permiso aunque invoquen rutas directamente.
7. No se envían automáticamente notas, complementos, CFDI Facturify ni documentos históricos.
8. Bitácora permite relacionar `IDFOL`, UUID, destinatario enmascarado, proveedor, intentos y resultado sin guardar adjuntos ni secretos.
9. La autorización OAuth permanece válida bajo el modo aprobado para operación; el piloto de siete días no se presenta como credencial de producción.

## Estado del release 2026-10-10

El código está publicado y desplegado: API `63b11cf`, App `b9fca0b`; imagen activa `sha256:34bcc71984fbf6d4163fe7ab1c5aa0f31992308a0052c072351843e17e0b7fb9`. Health del API, front, base y HTTPS público pasó. La ruta callback existe. Se conservó rollback de imagen y se añadió `/root/ioe_stack/.dockerignore` para excluir `.git`, `.env` privados, backups, outputs y archivos de llave; se conserva `ioe_app/assets/.env` sin nombres secretos.

El env privado `/root/ioe_stack/deploy/ioe-api.env` no se modificó porque la política de comandos rechazó transferir credenciales locales. Intervención titular requerida: agregar las variables OAuth y clave de cifrado indicadas arriba por canal seguro, reiniciar el contenedor, autorizar Gmail desde el panel, enviar prueba XML/PDF y completar UAT. Estado OAuth previsto `TESTING`; `AUTOMATICO=0` permanece. Sin consentimiento ni correos enviados.

El build reportó avisos de WASM y 81 vulnerabilidades npm, incluidas 2 críticas; no se actualizaron dependencias automáticamente.
