# Plan independiente de corrección posterior al timbrado Quadrum

## Causa concreta del botón Reintentar — 2026-10-13

Diagnóstico sólo lectura posterior a activación del worker: outbox ID 1/2/3
permanece ERROR_FINAL con intentos 1/1/5 y fechas históricas; ninguna fecha de
envío. Consulta TypeORM productiva devuelve ID como string. INFORMATION_SCHEMA
confirma BIGINT. CfdiCorreoService.resumen devuelve fila.ID sin conversión;
Flutter cfdi_correo_page.dart convierte con (envio['id'] as num).toInt() en
onPressed antes de llamar _reintentar y fuera de su try/catch. ID textual causa
TypeError y aborta antes del POST. Por eso no se resetean intentos ni se encola.

Auditoría reciente de cfdi registra cinco POST /cfdi/correo/prueba y OAuth,
sin reintento exitoso. AuditInterceptor registra respuestas exitosas únicamente:
su ausencia aislada no acredita ausencia de petición; aquí converge con contrato
ID textual y cast frontend. Logs filtrados no muestran procesamiento de outbox
en contenedor activo. No hay evidencia de nuevo rechazo Gmail en este intento;
el 403 mostrado es histórico. Pruebas de texto aceptadas no acreditan adjuntos.

Plan de corrección autorizado para revisión, sin implementación en diagnóstico:
1. API: normalizar ID BIGINT de outbox a número entero positivo seguro en DTO
   público; declarar tipo real recibido del driver y rechazar overflow explícito.
2. Flutter: aceptar ID textual o numérico de forma controlada; llevar validación
   al try/catch del handler y mostrar error si ID inválido. Eliminar cast directo.
3. Pruebas: ID "3", ID 3, inválido, overflow y doble clic; demostrar POST de ID
   correcto y transición PENDIENTE. Mantener bloqueo ENVIADO/INCIERTO.
4. Publicar corrección API/App y reconstruir .234 conservando worker habilitado,
   claves, storage y entorno; comprobar contrato del listado autenticado.
5. Usuario reintenta una fila existente. Verificar auditoría de POST exitoso,
   intentos reiniciados, log de consumidor/etapa y ENVIADO/messageId. Si Gmail
   devuelve nuevo error, usar motivo seguro actual. Confirmar bandeja Enviados y
   recepción XML/PDF. No timbrar ni modificar manualmente outbox para ocultar bug.

Fecha: 2026-10-13. Diagnóstico base: 15:43 America/Mexico_City. Estado: corrección SAT-01 implementada localmente y validada; despliegue y consulta real SAT pendientes. Correo/PDF continúan en seguimiento independiente.

## Objetivo y separación de alcance

Resolver envío por Gmail, representación PDF y consulta de estado SAT de CFDI ya timbrados. La integración de FACTURA con Quadrum tiene una emisión productiva aceptada y persistida para cada uno de los tres RFC comerciales. Estos pendientes se siguen por separado y no autorizan volver a timbrar documentos con UUID.

Por decisión del titular, el rechazo CFDI40147 de DF04-20261012-VF-0004 pertenece a operación y mantenimiento de datos fiscales del cliente; queda fuera del resultado y de los bloqueadores de integración. Notas de crédito, REP y cancelación se revisarán conforme aparezcan casos comerciales. Sus pruebas futuras no condicionan el cierre del alcance FACTURA.

Plan principal: [QUADRUM_PRODUCCION_PLAN.md](QUADRUM_PRODUCCION_PLAN.md). Tablero de este expediente: [QUADRUM_POST_TIMBRADO_CORRECCION_SEGUIMIENTO.md](QUADRUM_POST_TIMBRADO_CORRECCION_SEGUIMIENTO.md). Diseño previo de correo: [FACTURA_QUADRUM_CORREO_PLAN.md](FACTURA_QUADRUM_CORREO_PLAN.md); sus estados del 10/10 son históricos frente al corte de este expediente.

## Entorno y evidencia vigente

- Producción: host 192.168.10.234, contenedor `ioe`, API `/srv/api`, SQL `192.168.10.234:1433 / IOELOCAL / dbo`.
- Código desplegado: API `900b6250f137b1e3e691bf773fdd165dc797be32`, App `9a72b96a6b4410bbcb6293a1294ae42f31ab2881`; imagen `sha256:d6ad51c0ec473c6e5b423118fedc74638e88f8c451fdf4d3e24756b42449812f`.
- XML/PDF persistidos en `/ArchivosUsuarios/respaldoCFDI`. En el contenedor productivo ambos archivos son legibles para los tres casos del tablero. Esta comprobación no ejecutó generación de PDF ni envío.
- Configuración SQL de correo: `AUTOMATICO=true`, cuenta Google y refresh token cifrado presentes. Presencia no demuestra autorización vigente ni scopes efectivos.
- Proceso productivo tiene `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` y `CFDI_EMAIL_TOKEN_ENCRYPTION_KEY`. Aliases alternativos ausentes; no se detectó conflicto entre nombres.
- Callback efectivo: `https://erp.ioebusiness.com.mx/api/auth/google/callback`. Variable `GOOGLE_OAUTH_PUBLISHING_STATUS=TESTING`; estado real de Google Cloud aún no contrastado. Cambiar esta variable no publica la aplicación en Google.
- No se inició un backend adicional ni se invocaron worker, OAuth, prueba de correo o reintentos durante este diagnóstico. El worker existente puede evolucionar su cola sin intervención del agente.

## MAIL — Problema, diagnóstico y posibles soluciones

### Problema observado

JICJ y JIFT registran `ERROR_FINAL / GMAIL_HTTP_403`, un intento cada uno y sin fecha de envío. JIFJ registra `REINTENTABLE / ERROR_PROCESAMIENTO`, cuatro intentos y sin fecha de envío en el corte. Son fallas distintas; no atribuir automáticamente el error genérico a Google.

### Diagnóstico comprobado en código

- `correo/gmail.provider.ts` envía desde backend a `gmail.googleapis.com/gmail/v1/users/me/messages/send`, con Bearer OAuth; no usa una API key ni envía desde JavaScript del navegador.
- Al recibir HTTP no exitoso descarta el JSON de error de Google y conserva solamente `GMAIL_HTTP_<status>`. Por eso todavía no se conoce `reason`, dominio ni detalle seguro del 403.
- `correo/google-oauth.service.ts` solicita `openid`, `email` y `gmail.send`; no acredita que el token guardado conserve ese permiso. El tipo de respuesta no conserva scopes para diagnóstico.
- `correo/cfdi-correo.service.ts` prepara XML/PDF antes del envío. Excepciones distintas de `ErrorEntregaCorreo` se convierten en `ERROR_PROCESAMIENTO`, sin distinguir preparación, lectura, MIME u otra etapa.
- `correo/cfdi-correo.worker.ts` corre cada minuto y reconcilia cada hora. No tiene un control explícito por entorno/host. Cualquier backend con esta implementación conectado a la misma base y configuración podría consumir trabajos.
- `correo/cfdi-correo.repositorio.ts` reclama una fila con locks SQL; eso evita reclamar simultáneamente esa fila, pero no determina qué host debe procesarla. La outbox no aporta procedencia del intento en los campos usados por este diagnóstico.

### Hipótesis sobre desarrollo y 192.168.10.234

El proceso productivo es capaz de procesar la cola; no está demostrado que todos los intentos históricos provinieran de él. Un backend de desarrollo conectado a IOELOCAL podría tomar una fila y fallar al leer rutas Linux inexistentes en Windows o al usar configuración OAuth/clave diferente. Los archivos legibles en producción reducen la hipótesis de archivo ausente allí, pero no prueban que `DocumentosService` complete la preparación ni descartan otro host.

No se observó listener local en puertos 3000/3001 durante esta revisión; no demuestra ausencia de consumidores anteriores, otros puertos u otros hosts. No usar esa observación como atribución histórica.

El registro de Google para OAuth puede afectar consentimiento y callback. La IP privada 192.168.10.234 no es por sí sola el origen público visto por Google; la salida puede atravesar NAT/proxy. Un bloqueo por IP/política debe demostrarse con el error y políticas efectivas, no inferirse del 403. Los orígenes JavaScript del navegador y redirect URIs no son una lista general de hosts autorizados para `messages.send` con Bearer.

### Secuencia propuesta

1. **MAIL-01 — Atribución:** inventariar procesos reales de producción y desarrollo, base destino, montaje, configuración OAuth efectiva y clave de cifrado compatible. Comparar igualdad/presencia por canal privado, sin exponer valores. Añadir identificador de intento, host/contenedor, PID, versión, entorno y etapa; nunca destinatarios completos, tokens, MIME ni XML.
2. **MAIL-02 — Diagnóstico seguro:** capturar campos permitidos del JSON Google (`code`, `status`, `errors[].reason`, `domain`, mensaje sanitizado y limitado). Separar fallos de XML, PDF, OAuth, MIME, HTTP y persistencia del resultado. Mantener `INCIERTO` cuando no se confirme aceptación; no degradarlo a reintento automático.
3. **MAIL-03 — Configuración Google:** con acceso al proyecto correcto, comprobar Gmail API habilitada, cliente OAuth de aplicación web, callback exacto, cuenta autorizada, consentimiento y permisos realmente concedidos. Validar `gmail.send`; corregir y reconsentir sólo si corresponde. No solicitar `gmail.modify` o acceso completo para resolver envío.
4. **MAIL-04 — Consumidor único:** proponer bandera de proceso `CFDI_EMAIL_WORKER_ENABLED`, todavía inexistente, para impedir consumo y reconciliación desde desarrollo conectado a producción y permitirlos sólo en el backend designado. No apagar `AUTOMATICO` en SQL como sustituto: esa configuración es compartida. Desarrollo debería usar base/cola y cliente OAuth separados cuando sea posible.
5. **MAIL-05 — Corrección según causa:** aplicar la rama de la tabla siguiente; renovar consentimiento o cambiar Cloud requiere intervención en la cuenta/proyecto correspondiente, por canal seguro.
6. **MAIL-06 — Validación:** después de autorización del destinatario y mensaje, ejecutar una prueba desde el backend productivo identificado. Confirmar identificador Gmail y recepción en buzón controlado. Posteriormente preparar reenvío individual de adjuntos existentes sólo para filas sin envío confirmado. No timbrar, no procesar toda la cola y no reiniciar backend sólo como prueba de lectura.

| Causa demostrada | Corrección propuesta |
|---|---|
| API no habilitada en el proyecto del cliente | Habilitar Gmail API en ese proyecto, con acceso/autorización correspondientes |
| Permiso de envío ausente | Reconectar cuenta con `gmail.send` y comprobar concesión efectiva |
| Callback no coincide | Registrar callback HTTPS exacto y alinear backend; localhost separado para desarrollo |
| Política de dominio impide aplicación | Solicitar habilitación específica al administrador; no eludir política |
| Cuota/rate limit indicado por `reason` | Limitar concurrencia y aplicar backoff según causa; no clasificar todos los 403 como permanentes |
| Backend de desarrollo consume cola productiva | Deshabilitar consumidor en ese proceso; aislar configuración, datos y almacenamiento |
| Preparación XML/PDF falla en host consumidor | Corregir resolución de folio/ruta/lectura o ejecución en host correcto antes de culpar a Google |
| Cliente/refresh token/clave incompatibles entre entornos | Alinear mediante configuración privada o separar entornos; conservar clave que protege datos existentes |

Google documenta que 403 requiere evaluar `reason`; puede indicar permisos, política o límites. [Tratamiento de errores Gmail](https://developers.google.com/workspace/gmail/api/guides/handle-errors).

El callback debe coincidir exactamente; producción utiliza HTTPS y un dominio, mientras localhost tiene excepciones de desarrollo. No reemplazar callback por IP privada. [OAuth para servidor web](https://developers.google.com/identity/protocols/oauth2/web-server).

`gmail.send` permite envío. Si Cloud confirma aplicación externa en Testing, sus refresh tokens con ese scope expiran a siete días; preparar publicación/verificación aplicable y autorización estable, sin atribuir el 403 actual a esa caducidad. [Scopes Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes), [vigencia OAuth](https://developers.google.com/identity/protocols/oauth2#expiration).

## PDF — Problema, diagnóstico y posible solución

**Problema:** inspecciones de las tres actas UAT detectaron sellos y cadena del timbre recortados en margen derecho. UUID e importes correctos; esto no invalida ni modifica XML timbrado.

**Diagnóstico:** representación se genera localmente con pdfmake desde XML original. `representacion-impresa.service.ts`, método `bloqueTimbre`, coloca cadenas largas sin espacios en columna `*` junto al QR de 95 puntos; estilo `sello` reduce tamaño, pero no aplica partición explícita. Comportamiento de ajuste/minWidth es hipótesis que debe reproducirse antes de corregir. `DocumentosService.pdf()` reutiliza un PDF existente, por lo que corregir generador no reemplaza por sí solo archivos anteriores.

**Solución propuesta:** reproducir con copias privadas de los tres XML; medir texto y ancho disponible; permitir salto visual controlado de cadenas largas, conservar contenido exacto al quitar los saltos visuales y ajustar columna/espaciado/paginación. No truncar, recalcular sellos ni alterar XML. Generar PDFs candidatos separados y validar todas las páginas mediante render e inspección visual, QR, UUID, importes y extracción de texto normalizada. Añadir un caso extenso y varias páginas.

Después de aprobar candidato y release, preparar lista exacta de PDFs existentes a sustituir con respaldo/reversa de representación; preservar XML y sus hashes. Evitar eliminación masiva o regeneración indiscriminada. Si se modifica `CFDI_PDF_PATH`, preparar preflight y actualización exacta autorizada.

## SAT — Problema, diagnóstico y posible solución

**Problema:** consulta de estado SAT vía Quadrum no completada en UAT; no se confirmó estado independiente `Vigente`. UUID/XML/SQL timbrados permanecen confirmados.

**Hallazgo:** WSDL productivo de cancelación obtenido por GET desde .234 respondió HTTP 200 el 13/10 a las 15:43. Define `obtiene_status_sat(usuario, contrasena, taxpayer_id, rtaxpayer_id, uuid, total)` y SOAPAction `obtiene_status_sat`. Fuente y compilado desplegado usan etiquetas `usario` y `password` en esa petición. Es una incompatibilidad concreta con contrato actual; explica una causa probable, pero no se comprobó todavía que corregirla resuelva todos los errores PAC.

**Corrección local aplicada:** `quadrum-cancelacion.client.ts` selecciona nombres por endpoint validado: producción `usuario/contrasena`, desarrollo `usario/password`. Nueva lectura de ambos WSDL confirma que los contratos difieren. Se conserva endpoint, namespace y cuenta del RFC. Despliegue pendiente. Se añadió prueba de contrato para ambos ambientes que compara nombres y orden conforme a WSDL y verifica escape de credenciales sin registrarlas. Validar normalización de RFC/UUID/total con XML original, SOAP Fault/error y respuestas vacías/desconocidas. No interpretar HTTP 200 como `Vigente`.

Tras build/release autorizado, realizar únicamente `obtiene_status_sat` de los tres UUID existentes, sin `cancelar`, `reintentar` ni timbrar. Registrar respuesta sanitizada, estado, cancelabilidad y fecha. Si persiste error, preparar Request/Response censurados para revisión con Quadrum; no enviarlos a soporte sin instrucción expresa. Un resultado `Cancelado` o no localizado requiere reportarlo, no fabricar `Vigente`.

## Comprobación de configuración Quadrum para flujos futuros

WSDLs oficiales recuperados por GET desde producción, ambos HTTP 200:

| Flujo | Contrato/configuración revisados | Estado |
|---|---|---|
| FACTURA | `/timbrar`; namespace `http://ws.cfdiquadrum.com.mx/timbrar`; SOAPAction `timbrar`; `xml,usuario,contrasena` | Alineado; tres casos productivos aceptados |
| Nota de crédito | Mismo servicio/operación `timbrar`, XML de egreso y cuenta/CSD de su RFC | Transporte configurado; uso real diferido |
| REP | Mismo servicio/operación `timbrar`, CFDI P con Pagos 2.0 y cuenta/CSD de su RFC | Transporte configurado; uso real diferido |
| Cancelación | `/cancelar`; namespace propio; `UUIDS,usuario,contrasena,rfc,cer,key,reintentar`; atributos UUID/Motivo/FolioSustitucion | Petición base alineada; uso real diferido |
| Estado SAT | `/cancelar`, `obtiene_status_sat`, seis campos con nombres por ambiente | SAT-01 corregido y probado localmente; despliegue/consulta real pendientes |

`QUADRUM_FLUJOS_HABILITADOS=FACTURA`: restricción del backend, no ausencia de botones. Flutter contiene acciones de nota/REP/cancelación con condiciones documentales; API rechaza operación productiva fuera de la lista con 403 antes del PAC. No se habilitaron otros flujos por esta revisión. Cuando el titular solicite su uso, incluir flujo exacto en la lista mediante cambio autorizado; configurar transporte no habilita operación fiscal.

Esta comparación verifica transporte y campos base; no sustituye validación fiscal del caso comercial ni demuestra cancelación real. No gastar timbres/cancelar para cerrar este documento.

Fuentes: [WSDL timbrado](https://ws.cfdiquadrum.com.mx/timbrar?wsdl), [WSDL cancelación](https://ws.cfdiquadrum.com.mx/cancelar?wsdl), [Wiki timbrado](https://wiki.cfdiquadrum.com.mx/es/home/webservices/ws_timbrado), [Wiki cancelación](https://wiki.cfdiquadrum.com.mx/home/webservices/ws_cancelacion). El extractor web no mostró contenido de la Wiki; comparación contractual se sustentó en WSDL obtenidos directamente del servidor, no en inferencias sobre sus páginas.

## Orden de ejecución y aceptación

1. Revalidar versiones, outbox, consumidores y archivos sólo lectura; actualizar seguimiento sin tratar el corte como estado permanente.
2. Implementar diagnóstico seguro y control de consumidor; corregir contrato SAT y reproducción/ajuste PDF en checkout aislado, conservando cambios locales ajenos.
3. Pruebas focalizadas offline, suite exigida por AGENTS y build; generar/inspeccionar PDFs privados candidatos. No arrancar aplicación conectada a producción como comprobación.
4. Presentar diff, configuración y plan exacto de release; intervención Google con acceso al proyecto correcto. No copiar `.env` ni trasladar tokens entre entornos.
5. Desplegar con autorización correspondiente; validar consulta SAT sólo lectura, sustitución acotada de PDF y prueba de envío al destinatario autorizado. No reactivar filas masivamente.
6. Cerrar por separado: correo con mensaje aceptado y recepción confirmada; PDF sin recortes y mismo XML/UUID; consulta SAT con respuesta interpretada y fecha. Ningún cierre auxiliar crea otro CFDI.

No hay autorización en esta solicitud para envíos, reintentos, cambios Cloud, SQL, credenciales, habilitación de flujos ni despliegue. Trabajo realizado: diagnóstico de lectura y documentación.

## Contexto para iniciar otro chat

> Continúa el plan `ioe-api/docs/modules/cfdi/QUADRUM_POST_TIMBRADO_CORRECCION_PLAN.md` y su seguimiento. Primero revalida sólo lectura producción 192.168.10.234, contenedor ioe, SQL IOELOCAL y versiones; preserva cambios locales. Diagnostica origen de consumidores de correo (desarrollo vs servidor), JSON seguro del 403 Google y etapas del error genérico JIFJ. Prepara corrección de PDF recortado y etiquetas SOAP de estado SAT conforme al WSDL actual. Los tres folios del tablero ya tienen UUID: nunca timbrarlos otra vez. VF0004 es incidencia de datos del cliente, fuera del resultado de integración. NC/REP/cancelación se revisan durante operación; no habilitarlos ni ejecutarlos para este expediente. Presenta cambios y validación offline; requiere alcance autorizado antes de envío, intervención Cloud, SQL, sustitución de archivos fiscales o despliegue. No mostrar secretos.
