# Seguimiento: envío de CFDI por correo en FACTURA_QUADRUM

Actualizado: 2026-10-10
Estado: API/App publicado y desplegado en producción; variables OAuth/clave cargadas en backend y contenedor reiniciado. Postflight API/front/DB HTTP 200, TLS válido y callback sin parámetros HTTP 400 esperado. Falta consentir Gmail, enviar prueba y completar UAT. Envío automático sigue desactivado.
Plan: [FACTURA_QUADRUM_CORREO_PLAN.md](FACTURA_QUADRUM_CORREO_PLAN.md)

## Avance comprobable

- API: OAuth de Google, callback, adapter Gmail API, configuración admin, envío de prueba, outbox SQL, worker, reconciliación y reintentos preparados en `src/modules/cfdi/correo/`.
- Emisión: tras persistir timbrado Quadrum intenta registrar outbox; falla de correo no altera la respuesta fiscal.
- Adjuntos: worker obtiene XML original y PDF desde `DocumentosService`; destinatario se cifra antes de guardarlo y se muestra enmascarado.
- App: panel `/facturacion/correo`, enlazado desde FACTURA_QUADRUM; conexión, configuración, test mail e historial/reintentos.
- Contrato de transporte deja sumar otro adapter. Gmail API es el único proveedor implementado en esta fase; Outlook/Graph no está configurado.
- SQL: preflight read-only confirmó `IOELOCAL` ONLINE en `192.168.10.234:1433`, `MOD_FRONT` activo (`IDMOD_FRONT=20008`) y campos CFDI existentes. `FACT_CLIENT_SHP` tiene 2,083 filas y `EmailReceptor` no vacío; 88 grupos RFC duplicados, 25 con distintos correos. Backup completo `COPY_ONLY` con `CHECKSUM` y `RESTORE VERIFYONLY WITH CHECKSUM` pasaron. DDL idempotente aplicado desde `sql/2026-10-10_cfdi_correo.sql`; postflight confirmó tablas e índices, automático apagado y cero filas en outbox/estado OAuth.
- Seguridad de destinatario: lookup por `IDC` no presenta duplicados; lookup por cliente/sucursal más reciente no tiene correos conflictivos en la fecha máxima. Fallback solo por RFC puede ser ambiguo; API ahora registra el envío como omitido y bloquea reintento cuando encuentra varios correos para ese RFC.
- OAuth/env: el titular reporta que deshabilitó/eliminó el secreto expuesto, creó otro y actualizó el `.env` local. Se confirmó presencia no vacía de `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` y `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY`; no se leyeron ni validaron valores OAuth con Google. Los nombres Google actuales no son inválidos: código acepta esos aliases y prioriza `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` si existen. La clave de cifrado se generó localmente y no se mostró. `GOOGLE_OAUTH_PUBLISHING_STATUS` no está en `.env`; API usa `TESTING` por defecto.
- DDL aplicado: crea tres tablas de correo y sus índices dentro de una transacción, más configuración inicial con automático deshabilitado. No cambia tablas fiscales existentes. Postflight confirmó `AUTOMATICO=0`, cuenta/token sin configurar y outbox/estado OAuth vacíos. Reversa antes de uso: retirar solo tablas nuevas; después de guardar tokens/envíos, desactivar el automático y conservar esos datos.
- Backup previo al DDL: `/var/opt/mssql/data/IOELOCAL_cfdi_correo_preddl_20261010_8f0bcf7d-879a-486a-89f6-1196fb1b9527.bak`, 8.56 GB, `COPY_ONLY`, checksum; `RESTORE VERIFYONLY WITH CHECKSUM` pasó el 2026-10-10. No se restauró la base.
- Google Cloud: existe cliente web, callback registrado y cuenta actual agregada como tester según confirmaciones previas. No se cambió Cloud en este avance y no existe evidencia de consentimiento/refresh token.
- Callback registrado y seleccionado para producción: `https://erp.ioebusiness.com.mx/api/auth/google/callback`. Tras deploy, GET sin `code/state` devuelve 400 esperado, no 404; no se inició consentimiento.
- Producción usa build conjunto en `192.168.10.234`, `/root/ioe_stack`, contenedor `ioe`, imagen `ioe-allinone:latest`, puertos `8085` (front+proxy API) y `3001` (API interna/publicada). API commit `63b11cf`; App commit `b9fca0b`; imagen `sha256:34bcc71984fbf6d4163fe7ab1c5aa0f31992308a0052c072351843e17e0b7fb9`.
- Titular confirma `erp.ioebusiness.com.mx` como host público de producción. Corte aplicado: `.3` TLS → `172.16.100.2:8085` (HAProxy) → `.234:8085` (contenedor conjunto) → `/api/` a `127.0.0.1:3001`. No requiere DNS nuevo ni activar API standby. `.40` conserva preview privado.
- Postflight: contenedor corre con `unless-stopped`; API `/health`, front `:8085/`, HTTPS `erp.ioebusiness.com.mx/` y `/api/health/db` responden 200; TLS válido. Callback sin estado devuelve 400 esperado. Se conserva imagen anterior con tag de rollback.
- Preflight de release read-only (estado previo, superado por actualización final): `/root/ioe_stack/deploy/ioe-api.env` tiene modo `600`; no aparecen nombres `GOOGLE_*` ni `CFDI_EMAIL_*`. Producción sigue en API `d9bca1b` y App `68d872b`; las ramas `origin/master` no incluyen aún `CfdiModule` ni la pantalla Quadrum requerida. Repos locales llevan siete commits adelantados; API además va uno detrás. El historial API pendiente incluye evidencia CFDI retirada después del árbol final; App incluye cambios de transferencias; árbol App además tiene cambios de login/imagen sin commit. No publicar `master` local tal cual. Checkout `.234` también tiene cambios locales/backups; preservar. No se hizo pull, push, commit, build ni reinicio.
- Fase previa al release: no se editaron `.env` ni archivos de secretos. No se ejecutaron pruebas, análisis, builds, despliegues ni UAT. Sí se ejecutó DDL autorizado en `IOELOCAL`.

## Tablero

| ID | Actividad | Estado | Criterio de cierre |
|---|---|---|---|
| QMAIL-00 | Diseño y alcance v1 | Completo | Gmail API piloto; una cuenta global; solo facturas Quadrum. |
| QMAIL-01 | Preparar OAuth en Cloud | Preparado para piloto | Cliente web, callback HTTPS productivo y cuenta tester configurados; app sigue en `TESTING`. Falta consentimiento Gmail y resolver publicación para operación continua. |
| QMAIL-02 | API y outbox | API desplegada; env cargado | Falta consentimiento OAuth, validar conexión autenticada y ejecutar prueba controlada de XML/PDF. |
| QMAIL-03 | Panel Flutter | App desplegada | Confirmar rol admin permitido por `ADMIN_ROLE_IDS` o `ADMIN_NIVELES`; hacer UAT. |
| QMAIL-04 | Preflight de datos y DDL | Completo | Backup verificado, DDL aplicado en `IOELOCAL`, postflight PASS; envío automático permanece apagado. |
| QMAIL-05 | Release conjunto y habilitar callback | Completo | Commits publicados en `master`; API `63b11cf`, App `b9fca0b`; build conjunto desplegado en `.234`; health HTTP 200 y callback responde 400 sin state. No activar API de `.40`. |
| QMAIL-06 | Consentimiento Google | Pendiente | Admin conecta cuenta desde panel; callback guarda refresh token cifrado. No copiar token a `.env` ni al chat. |
| QMAIL-07 | Prueba controlada y UAT | Pendiente | Gmail acepta mensaje a buzón controlado; confirmar XML y PDF adjuntos y revisar historial. |
| QMAIL-08 | Operación continua | Pendiente | Resolver modo de publicación OAuth: en modo externo/pruebas el refresh token expira a los 7 días para `gmail.send`; aprobar publicación/verificación para producción. |

## Variables que API requiere

Configurar en el almacén de secretos del backend, nunca en Flutter, Git o estos documentos:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET` (secreto reemplazado según reporte del titular; no compartir)
- `GOOGLE_OAUTH_REDIRECT_URI` = callback registrado de HTTPS
- `GOOGLE_OAUTH_PUBLISHING_STATUS` = estado real de la pantalla OAuth (`TESTING` o `PRODUCTION`)
- `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY` = clave aleatoria de 32+ caracteres, ya presente localmente; instalar la misma en secretos del backend y conservarla estable porque perderla impide descifrar tokens/destinatarios.

Compatibilidad: el código también acepta `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI`. No hace falta renombrar las claves que ya existen en `.env`; usa los nombres preferidos al configurar un entorno nuevo. `GOOGLE_REFRESH_TOKEN` no se carga manualmente: backend lo obtiene tras consentimiento y persiste cifrado en la tabla de configuración; panel nunca lo muestra.

## Bloqueos y siguiente secuencia

1. Rotación reportada como completada por el titular; conservar credencial solo en `.env` local y almacén de secretos del backend desplegado. No pegar ningún secreto ni token en chat.
2. Completo: titular agregó por SSH/nano en `/root/ioe_stack/deploy/ioe-api.env` las cinco variables requeridas. Preflight confirmó presencia no vacía por nombre y permisos `0600 root:root`; ningún valor secreto se leyó ni copió. No copiar `GOOGLE_REFRESH_TOKEN`.
3. Completo: contenedor `ioe` reiniciado para cargar env. Postflight API/front/health DB públicos HTTP 200, TLS válido, callback sin parámetros HTTP 400 esperado. Mantener callback actual y no activar API standby en `.40`.
4. Desde el panel, admin inicia conexión y autoriza Gmail. Google devuelve el código al callback; backend obtiene y cifra refresh token automáticamente.
5. Enviar prueba al buzón controlado, validar XML/PDF, estado y logs. Mantener automático desactivado hasta aceptar UAT.
6. Resolver publicación/verificación OAuth para uso continuo. Las autorizaciones de prueba no sirven como operación estable.

## Registro

| Fecha | Cambio | Límite |
|---|---|---|
| 2026-10-10 | Se preparó backend OAuth/Gmail, outbox, worker, callback, integración post-timbrado, panel y DDL. Se añadió protección contra reenvío automático cuando el resultado de Gmail o su persistencia es incierto. | Inspección estática solamente. Sin pruebas/build por instrucción de ejecución, sin preflight SQL, Cloud, secretos, despliegue o UAT. |
| 2026-10-10 | Se actualizó plan y seguimiento para reflejar Gmail personal como piloto y separar v1 del proveedor futuro. | OAuth Cloud permanece en pruebas; callback standby aún inactivo. |
| 2026-10-10 | Preflight read-only de producción confirmó esquema, módulo activo, columnas CFDI y duplicados de RFC con destinatarios conflictivos; API falla cerrada para envío por RFC ambiguo. | Sin DDL, backup, pruebas/build, consentimiento OAuth, despliegue ni UAT. |
| 2026-10-10 | Backup `COPY_ONLY` con `CHECKSUM` completado y `RESTORE VERIFYONLY WITH CHECKSUM` aprobado; DDL de correo aplicado transaccionalmente en `IOELOCAL`. Postflight PASS: tres tablas, índices, automático apagado, sin token/cuenta ni filas operativas. | Sin pruebas/build, envío, consentimiento OAuth, despliegue ni UAT. |
| 2026-10-10 | OAuth actualizado para aceptar nombres `GOOGLE_OAUTH_*` y aliases `GOOGLE_*` existentes; actualizado estado del secreto tras aparecer completo en lectura accesible del navegador. | No se modificó `.env`; no se ejecutaron pruebas/build. Rotar secreto y configurar clave de cifrado antes del consentimiento OAuth. |
| 2026-10-10 | Titular reporta que deshabilitó/eliminó el secreto expuesto, generó reemplazo y actualizó `.env`. Se verificó solo presencia de variables por nombre; no se leyó ni validó el valor. | Falta `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY`, configuración segura del backend desplegado, consentimiento, pruebas y UAT. |
| 2026-10-10 | Se generó `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY` aleatoria de 32 bytes en el `.env` local ignorado por Git; se verificó solo su presencia. | No se mostró el valor. Falta provisionar esta misma clave y credenciales en backend desplegado; sin OAuth, envío, pruebas ni UAT. |
| 2026-10-10 | Revisión inicial observó que el preview Coolify solo sirve front y deja `/api/` en 503. | No activar API standby. Luego titular indicó usar build conjunto productivo en `.234`. |
| 2026-10-10 | Titular confirma `erp.ioebusiness.com.mx` como host de producción y build conjunto front+back en `.234`. Se cambió upstream Nginx `.3` al HAProxy `.2:8085`, con respaldo; `/` y `/api/health/db` HTTPS responden 200. | Callback respondía 404 antes del deploy; la actualización final registra callback activo. No se cambió Cloud ni DNS. |
| 2026-10-10 | Preflight de release read-only confirma que `.234` aún corre API `d9bca1b`/App `68d872b` sin módulo/pantalla Quadrum; archivo privado de entorno no tiene nombres OAuth/email. | Ramas locales llevan commits pendientes; historial API contiene evidencia CFDI ya retirada del árbol, App incluye transferencias y hay cambios locales/server por preservar. No publicar `master` local tal cual. Sin commit, push, build, pull ni reinicio; falta preparar release limpio y autorización explícita. |

## Actualización de release 2026-10-10

API `63b11cf` y App `b9fca0b` quedaron en `origin/master` y `.234` sincronizó ambos con fast-forward. Build conjunto terminó correctamente; el primer build detectó error de import/type y literal inválido, corregidos en `63b11cf`. Imagen activa `sha256:34bcc71984fbf6d4163fe7ab1c5aa0f31992308a0052c072351843e17e0b7fb9`.

Postflight: contenedor `ioe` en ejecución con `unless-stopped`; API health, front `:8085`, HTTPS público y health de DB devuelven HTTP 200; TLS verifica correctamente. Callback sin `code/state` responde 400 esperado. No hubo consentimiento OAuth, envío ni UAT. `AUTOMATICO=0` sigue vigente.

El env privado `/root/ioe_stack/deploy/ioe-api.env` no se modificó. Un intento automatizado de transferir credenciales desde `.env` fue rechazado por política de comandos; no se intentó eludirlo. Titular debe agregar por canal seguro `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_OAUTH_PUBLISHING_STATUS=TESTING` y `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY`, con archivo modo `0600`. No copiar `GOOGLE_REFRESH_TOKEN`; backend lo generará y cifrará tras consentimiento.

Build registró avisos de WASM y `npm ci` reportó 81 vulnerabilidades (2 críticas); no se aplicó actualización automática de dependencias.

## Provisionamiento OAuth y reinicio 2026-10-10

- Titular confirmó edición manual de `/root/ioe_stack/deploy/ioe-api.env`. Preflight verificó presencia no vacía solo por nombre para `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_OAUTH_PUBLISHING_STATUS` y `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY`; archivo `0600 root:root`. No se leyeron ni copiaron valores.
- Contenedor `ioe` recreado con `ioe-allinone:latest`, política `unless-stopped`, puertos 8085/3001.
- Postflight: API health HTTP 200, front HTTP 200, DB health pública HTTP 200 con TLS válido, callback OAuth sin parámetros HTTP 400 esperado. Las cinco variables aparecen dentro del contenedor por nombre.
- OAuth aún sin consentimiento; no se envió correo. `AUTOMATICO=0` se mantiene hasta prueba controlada y UAT de adjuntos XML/PDF.
