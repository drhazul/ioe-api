# Seguimiento: envío de CFDI por correo en FACTURA_QUADRUM

Actualizado: 2026-10-10
Estado: API/App preparados y DDL aplicado en IOELOCAL producción; titular reporta secreto OAuth rotado y guardado en `.env`. Clave de cifrado generada en `.env` local. Integración no operativa: falta provisionar secretos en backend desplegado, desplegar, consentir OAuth y completar UAT.
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
- Callback registrado y seleccionado para producción: `https://erp.ioebusiness.com.mx/api/auth/google/callback`; no requiere cambio en Google Cloud mientras se conserve hostname/ruta. El callback aún no existe en la imagen productiva vigente.
- Producción usa build conjunto en `192.168.10.234`, `/root/ioe_stack`, contenedor `ioe`, imagen `ioe-allinone:latest`, puertos `8085` (front+proxy API) y `3001` (API interna/publicada). SSH read-only confirmó contenedor arriba; no se hizo pull, build, reinicio ni cambio remoto.
- Titular confirma `erp.ioebusiness.com.mx` como host público de producción. Corte aplicado: `.3` TLS → `172.16.100.2:8085` (HAProxy) → `.234:8085` (contenedor conjunto) → `/api/` a `127.0.0.1:3001`. No requiere DNS nuevo ni activar API standby. `.40` conserva preview privado.
- Preflight read-only: `.3` a `.234:8085` directo termina en timeout; `.3` a `.2:8085` raíz responde 200; `.2` a `.234:8085/api/health/db` responde 200. Tras el corte, HTTPS `/` y `/api/health/db` dan 200 con TLS válido. Callback del build vigente responde 404, pues aún no incluye integración. Se respaldó vhost en `/root/erp-proxy-backup-20261010/erp.ioebusiness.com.mx.conf.before-combined-prod`; `nginx -t` pasó y reload dejó Nginx activo.
- Preflight de release read-only: `/root/ioe_stack/deploy/ioe-api.env` tiene modo `600`; no aparecen nombres `GOOGLE_*` ni `CFDI_EMAIL_*`. Producción sigue en API `d9bca1b` y App `68d872b`; las ramas `origin/master` no incluyen aún `CfdiModule` ni la pantalla Quadrum requerida. Repos locales llevan siete commits adelantados; API además va uno detrás. El historial API pendiente incluye evidencia CFDI retirada después del árbol final; App incluye cambios de transferencias; árbol App además tiene cambios de login/imagen sin commit. No publicar `master` local tal cual. Checkout `.234` también tiene cambios locales/backups; preservar. No se hizo pull, push, commit, build ni reinicio.
- No se editaron `.env` ni archivos de secretos. No se ejecutaron pruebas, análisis, builds, despliegues ni UAT. Sí se ejecutó DDL autorizado en `IOELOCAL`.

## Tablero

| ID | Actividad | Estado | Criterio de cierre |
|---|---|---|---|
| QMAIL-00 | Diseño y alcance v1 | Completo | Gmail API piloto; una cuenta global; solo facturas Quadrum. |
| QMAIL-01 | Preparar OAuth en Cloud | Parcial | Cliente y callback de pruebas existen; rotación reportada por el titular. Falta callback HTTPS productivo, registrarlo en Google y provisionar credenciales + clave en backend; valor del secreto no validado. |
| QMAIL-02 | API y outbox | Código y DDL preparados/aplicados | Falta configurar secretos del backend, desplegar API y validar callback/OAuth. |
| QMAIL-03 | Panel Flutter | Código preparado | Publicar App; confirmar rol admin permitido por `ADMIN_ROLE_IDS` o `ADMIN_NIVELES`. |
| QMAIL-04 | Preflight de datos y DDL | Completo | Backup verificado, DDL aplicado en `IOELOCAL`, postflight PASS; envío automático permanece apagado. |
| QMAIL-05 | Release conjunto y habilitar callback | Pendiente | Preparar árbol/branch limpio desde `origin/master` con dependencias Quadrum+correo; excluir evidencia CFDI histórica, transferencias y cambios de login; reconciliar divergencia. Provisionar secretos privados y construir/desplegar front+back en `.234`. El upstream público ya llega a `.234`; callback Cloud coincide. No activar API de `.40`. |
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
2. Clave generada y guardada en `.env` local; provisionar la misma como secreto estable del backend desplegado. DDL y backup de `IOELOCAL` ya están completados.
3. Preparar release limpio desde `origin/master` con código fuente Quadrum+correo requerido; no publicar la historia local que conserva evidencia CFDI ni transferencias/cambios de login. Reconciliar divergencia. Provisionar variables OAuth y clave en archivo privado `.234`; release requiere autorización explícita. El vhost HTTPS ya enruta `erp.ioebusiness.com.mx` a `.234` por `.2`; mantener callback actual y no activar API standby en `.40`.
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
| 2026-10-10 | Titular confirma `erp.ioebusiness.com.mx` como host de producción y build conjunto front+back en `.234`. Se cambió upstream Nginx `.3` al HAProxy `.2:8085`, con respaldo; `/` y `/api/health/db` HTTPS responden 200. | Callback del build actual responde 404. Falta provisionar secretos privados y publicar integración; no se cambió Cloud ni DNS. |
| 2026-10-10 | Preflight de release read-only confirma que `.234` aún corre API `d9bca1b`/App `68d872b` sin módulo/pantalla Quadrum; archivo privado de entorno no tiene nombres OAuth/email. | Ramas locales llevan commits pendientes; historial API contiene evidencia CFDI ya retirada del árbol, App incluye transferencias y hay cambios locales/server por preservar. No publicar `master` local tal cual. Sin commit, push, build, pull ni reinicio; falta preparar release limpio y autorización explícita. |
