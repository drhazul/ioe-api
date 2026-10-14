# Seguimiento independiente de correo PDF y consulta SAT Quadrum

## Activación autorizada del worker — 2026-10-13

Titular autoriza activar consumo y solicita aviso para reintento. Preflight:
outbox 1,2,3 en ERROR_FINAL/GMAIL_HTTP_403, sin ENVIADO_EN; ningún trabajo
PENDIENTE/REINTENTABLE observado. Se establece CFDI_EMAIL_WORKER_ENABLED=true
en archivos privados original y release de .234, permisos 0600; contenedor
recreado con misma imagen y storage RW. No se reencoló ninguna fila desde agente.
Usuario puede solicitar reintento individual desde panel; cron cada minuto.
Confirmar ENVIADO/messageId y recepción adjuntos antes de cerrar UAT.

## Release completo API/App — 2026-10-13

Titular autorizó commits de todos los cambios actuales y despliegue de ambos
repositorios en .234. Commits publicados: API 76fa500bbbc75a91286e21aecd698fe991f97a1e,
App 4020c72a2314358f153bac0cbe56dbae9c9f1dbf. Árboles comparados sin diferencia
contra snapshot local completo. Historial anterior preservado en cada repo
en archive/local-before-full-release-20261013 para evitar republicar XML fiscales
que existen en commits locales antiguos. Ambos working trees limpios.

Flutter analyze limpio, Flutter test 18 PASS; CFDI 21 suites/214 pruebas PASS
y build API PASS. Build conjunto remoto Flutter/Nest PASS. Runtime final conserva
base productiva anterior y actualiza API/App; imagen
sha256:50db6723e0fc67da2e3ff835f3ab78ad4b346c6acc4b53ff6758186ad5b523a1,
contenedor ioe dad42b9d75ca, puertos 8085/3001, unless-stopped,
montaje RW /ArchivosUsuarios/respaldoCFDI. Rollback detenido preservado:
ioe-rollback-20261013-mail; imagen ioe-allinone:rollback-20261013-mail.

Entorno original intacto; entorno efectivo previo preservado sólo en archivo
privado .234 /root/ioe_stack/deploy/ioe-api.env.release-20261013, modo 0600.
CFDI_EMAIL_WORKER_ENABLED=false durante postflight: SQL AUTOMATICO no cambia.
Recreaciones futuras deben mantener storage y seleccionar explícitamente estado
del worker. No activar true antes de revisar toda cola elegible y alcance de envío.

Postflight API health y DB ok, front local/público HTTP 200, DB público HTTP 200,
TLS verificado. Esto no confirma Gmail ni recepción. Sin timbrado, reintento,
consulta SAT real o envío invocado durante release. Pendientes: detalle 403 real,
validación OAuth y prueba autorizada de XML/PDF existentes con fila/destinatario
confirmados; worker se mantiene pausado hasta esa preparación.

## Preparación de reintento con documentos existentes — 2026-10-13

Código local validado: 21 suites / 214 pruebas PASS y npm run build PASS.
Las 18 pruebas de correo cubren aislamiento worker, MIME con ambos buffers,
403/permisos, límites, resultado incierto, estados no reintentables, UUID
discordante, reencolado individual y fallo PDF sin envío. Fetch, repositorios
y documentos simulados; ninguna operación fiscal o envío real.

Logs de intentos incorporan identificador aleatorio, outbox ID, host, PID,
contador, etapa y estado/código; no incluyen destinatarios ni documentos.
MAIL-01 todavía requiere contrastar estos logs con versiones del despliegue.

Antes de prueba real:
1. Publicar y desplegar cambios backend; provisionar worker true sólo en
   consumidor designado .234, false en otros procesos. Activar el worker
   consume todos los trabajos elegibles, no sólo el reencolado manual:
   inventariar cola y acordar alcance antes de activarlo.
2. Releer fila elegida: sin envío confirmado, estado reintentable permitido,
   UUID igual a cabecera Quadrum TIMBRADO, destinatario correcto/no ambiguo.
3. Verificar rutas XML/PDF y lectura desde contenedor consumidor. PDF existente
   se reutiliza; si falta, DocumentosService intenta generarlo desde XML.
4. Verificar cuenta OAuth vigente y Gmail API/permisos. Ante 403, obtener motivo
   seguro con versión nueva y corregir causa; no repetir intentos a ciegas.
5. Confirmar destinatario registrado y autorización del correo real con
   adjuntos. Panel Correo / Reintentar usa POST /cfdi/correo/envios/:id/reintentar
   y sólo encola; el worker envía luego. Prueba de correo envía texto sin adjuntos.
6. Comprobar messageId/ENVIADO y recepción con ambos adjuntos. Estado INCIERTO
   exige revisión manual de aceptación; no habilitar reintento automático.

XML/UUID permanecen intactos. Recortes del PDF siguen pendientes del frente
PDF: enviar PDF existente no corrige su representación. Sin release ni prueba
de envío ejecutados en esta preparación.

Fecha de creación: 2026-10-13. Corte de lectura: 15:43 America/Mexico_City. Estado: SAT-01 corregido localmente y validado con pruebas/build; despliegue y consulta real pendientes. Correo y PDF mantienen pendientes independientes.

Plan: [QUADRUM_POST_TIMBRADO_CORRECCION_PLAN.md](QUADRUM_POST_TIMBRADO_CORRECCION_PLAN.md). Integración principal: [QUADRUM_PRODUCCION_SEGUIMIENTO.md](QUADRUM_PRODUCCION_SEGUIMIENTO.md).

## Casos existentes

| RFC | Folio comercial | UUID timbrado | Correo al corte |
|---|---|---|---|
| JICJ800630854 | DF01-20261012-VF-0040 | 899F7CC4-A545-5FFE-9BA2-3E4A62FDAB7B | Outbox 1; ERROR_FINAL; 1 intento; GMAIL_HTTP_403; sin envío registrado |
| JIFT6203071N7 | DF04-20261012-VF-0030 | CD32676E-C226-505C-B452-27B53DFBC07C | Outbox 2; ERROR_FINAL; 1 intento; GMAIL_HTTP_403; sin envío registrado |
| JIFJ4704238T5 | DF05-20261013-VF-0008 | 3C10A6D3-5BF0-57CE-9BCB-CF6BB2EBE494 | Outbox 3; REINTENTABLE; 4 intentos; ERROR_PROCESAMIENTO; sin envío registrado |

Los tres CFDI están TIMBRADO/FACTURADO según lectura de las 15:32. XML/PDF legibles en contenedor productivo a las 15:43. PDF tiene recorte previamente registrado en actas. Consulta SAT independiente no completada. Worker existente puede modificar estado/intentos; releer antes de actuar. No reenviar al PAC por problemas auxiliares.

## Tablero

| ID | Actividad | Estado | Evidencia o criterio de cierre |
|---|---|---|---|
| AUX-00 | Separar alcance del plan principal | Documentado | VF0004 fuera de bloqueadores; NC/REP/cancelación bajo validación operativa futura |
| MAIL-01 | Atribuir host/proceso de cada intento | Pendiente | Identificar consumidor y etapa; no inferir desde 403; outbox actual no aporta procedencia histórica |
| MAIL-02 | Conservar error seguro de Google y distinguir etapas | Implementado localmente | Allowlist de motivos, etapas XML/PDF/ENVIO y pruebas simuladas; detalle real pendiente de release |
| MAIL-03 | Auditar configuración efectiva y Google Cloud | Parcial | Variables presentes, callback HTTPS y TESTING en proceso; falta verificar proyecto/API/scopes/consentimiento en Cloud |
| MAIL-04 | Impedir consumo productivo desde desarrollo | Implementado localmente | CFDI_EMAIL_WORKER_ENABLED=false por defecto; true sólo en consumidor designado. Configuración productiva pendiente |
| MAIL-05 | Aplicar solución según causa demostrada | Pendiente | Error detallado/origen y revisión Cloud deben determinar rama |
| MAIL-06 | Prueba de correo y reenvíos acotados | Pendiente de caso autorizado | Destinatario y mensaje concretos; messageId y recepción; preservar UUID/XML y estados inciertos |
| PDF-01 | Reproducir y corregir ajuste del bloque timbre | Diagnóstico parcial | Tres actas muestran recorte; candidata causa columna/cadenas largas; validar render de todas las páginas |
| PDF-02 | Sustituir PDFs anteriores de forma acotada | Pendiente | Candidatos aprobados, lista exacta y reversa; XML/hash/UUID intactos |
| SAT-01 | Corregir nombres de credenciales SOAP | Completo local; despliegue pendiente | Producción usuario/contrasena; desarrollo usario/password, según WSDL de cada ambiente. Pruebas de contrato PASS |
| SAT-02 | Consultar tres UUID existentes | Pendiente | Después de corrección validada/release autorizado; consulta solamente y respuesta interpretada con fecha |
| AUX-01 | Build, release y aceptación independiente | Pendiente | Diff acotado, tests y evidencias de cierre por frente; ninguna emisión nueva |

## Configuración y límites

- API código 900b625 / App 9a72b96; imagen d6ad51c0ec473c6e5b423118fedc74638e88f8c451fdf4d3e24756b42449812f.
- SQL IOELOCAL en 192.168.10.234:1433; archivos persistentes en /ArchivosUsuarios/respaldoCFDI.
- Correo automático activo; cuenta/token cifrado presentes. No se leyó su valor ni se provocó envío.
- Callback efectivo https://erp.ioebusiness.com.mx/api/auth/google/callback; publicación declarada TESTING, estado Cloud por verificar.
- Timbrado y cancelación: endpoints oficiales HTTPS y WSDL HTTP 200 desde .234. SOAPAction y campos base revisados; diferencia SAT registrada arriba.
- Lista de flujos efectiva FACTURA. NC/REP/cancelación tienen restricción de API 403; configuración de transporte compartida/revisada y validación real futura. Ningún cambio de habilitación realizado.
- DF04-20261012-VF-0004/CFDI40147 no cuenta como fallo ni pendiente de integración en este tablero.
- Diagnóstico no identifica IP pública de salida ni prueba bloqueo Google por origen. No modificar políticas de IP sin evidencia.
- Preservar secretos, datos comerciales, reservas y XML; no iniciar backend alterno conectado a producción ni llamar worker durante preflight.

## Registro

| Fecha | Actividad | Resultado |
|---|---|---|
| 2026-10-13 15:43 | SELECT de outbox/configuración y comprobación de lectura de archivos desde proceso auxiliar sin worker | Tres correos sin envío; estados del tablero. Cuenta/token presentes; archivos legibles. Sin escrituras SQL ni llamadas de correo |
| 2026-10-13 | Lectura de código y WSDL oficiales GET desde .234 | Contratos base de timbrar/cancelar alineados; incompatibilidad de dos nombres en obtiene_status_sat confirmada también en compilado |
| 2026-10-13 | Revisión de documentación oficial Google | Plan incorpora OAuth/callback/scopes, evaluación reason del 403 y condición Testing; estado Cloud no verificado |
| 2026-10-13 | Creación de plan/seguimiento y reclasificación documental | Sin implementación, envío, reintento, timbrado, cancelación, intervención Google, cambio env/SQL o despliegue |

Actualizar cada fila con fecha, host/versión, diagnóstico confirmado, cambio acotado, prueba y aceptación. Enlace a evidencia privada, sin copiar XML, PDF, correos, tokens o contraseñas al repositorio.


## Verificación documental de entrega — 2026-10-13

Suite existente exigida por AGENTS ejecutada en checkout aislado: `npx --no-install jest src/modules/cfdi --runInBand`, 17 suites y 193 pruebas PASS; PAC/fuentes de datos simulados por las pruebas. Esto verifica regresión existente, no implementa ni valida aún las correcciones propuestas. Sin build/release ni operaciones fiscales reales. Enlaces Markdown locales y diff documental revisados; cambios funcionales permanecen pendientes.


## Corrección local de consulta SAT — 2026-10-13

Titular solicita aplicar corrección de etiquetas SOAP. GET de WSDL de producción y desarrollo HTTP 200 confirma contratos distintos: ws exige usuario/contrasena; devws exige usario/password. Fuente selecciona nombres por ambiente en obtiene_status_sat, preservando cuenta propia, escape, orden, namespace, endpoint y SOAPAction. Nueva suite de contrato prueba ambos ambientes y rechaza error PAC dentro de HTTP 200.

Validación en checkout aislado: 18 suites / 196 pruebas PASS; `npm run build` PASS. Sólo fetch y datos simulados en pruebas; no se llamó consulta SAT con cuentas/documentos reales, ni timbrado, cancelación, correo o worker. Cambio local reflejado en repositorio principal sin sustituir otros cambios. Sin commit, publicación ni despliegue; proceso productivo anterior mantiene contrato previo hasta release. SAT-02 permanece pendiente y no se declara Vigente confirmado.
# Implementación inicial de correo — 2026-10-13

Cambios locales: control explícito CFDI_EMAIL_WORKER_ENABLED (default false)
para ambos cron; motivos Gmail permitidos sin mensajes crudos; clasificación
reintentable para rateLimitExceeded/userRateLimitExceeded; errores genéricos
separados por XML/PDF/ENVIO. Fallos desconocidos ENVIO quedan INCIERTO.

Validación: suite CFDI existente 18 suites/196 pruebas PASS; cuatro pruebas
nuevas de aislamiento worker PASS; npm run build PASS. Todo con servicios
simulados, sin arrancar backend, invocar Gmail ni cambiar producción.

Pendientes: atribución runtime MAIL-01, detalle seguro del 403 real, pruebas
focalizadas adicionales del proveedor/etapas, revisión y release. La bandera
debe configurarse true exclusivamente en el consumidor designado antes de
desplegar; no se editaron secretos ni AUTOMATICO. Cloud/consentimiento y
recepción con adjuntos permanecen sin validar. Esta entrega no cierra MAIL.

