# Plan de corrección de cancelación Quadrum para cualquier RFC emisor configurado

Fecha: 2026-10-29, America/Mexico_City. ID_CAMBIO: `IOE-QUADRUM-CAN-20261029`. Estado: corrección de bloqueo integrada localmente, 23 suites/265 pruebas y build API aprobados. Despliegue, UAT y controles adicionales del plan con seguimiento propio. El titular descartó notas para soporte técnico porque la causa es interna.

## Resultado del diagnóstico

El mensaje de la captura **«Operación Quadrum CANCELACION no habilitada en producción para ese RFC.»** es una excepción interna de IOE, HTTP 403. No es una respuesta de Quadrum ni de Odoo.

`CancelacionService.cancelarExclusivo()` resuelve el emisor del documento y llama a `assertOperacionQuadrum(config, rfcEmisor, 'CANCELACION')` antes de obtener la cuenta, consultar `obtiene_status_sat` o invocar `cancelar`. El guard exige simultáneamente bandera global verdadera, RFC incluido y flujo incluido. El mensaje no distingue cuál de las tres condiciones falla.

En backend productivo activo, la bandera global está verdadera y los tres RFC comerciales están en la lista, pero el único flujo habilitado es `FACTURA`. Por tanto, para esos tres RFC la causa concreta es ausencia de `CANCELACION` en la lista de flujos. Un RFC fuera de la lista también queda bloqueado, aunque se añada el flujo.

Se reprodujo la excepción con el guard compilado y el entorno heredado del contenedor activo: **tres resultados HTTP 403 con el mismo texto**, sin instanciar el servicio de cancelación ni contactar al PAC. Esto prueba el bloqueo actual; no equivale a disponer de la traza HTTP histórica de la captura.

## Evidencia vigente y entorno

Corte principal: 2026-10-29 09:23:54 America/Mexico_City, `2026-10-29T15:23:54.414Z`.

| Elemento | Estado comprobado |
|---|---|
| Host activo | CT105 `172.16.100.40`, hostname `ioevps` |
| Backend | `erp-api-tysuzjl0xcdbhfje49pbcqyg`, running |
| Frontend | `standby-front-tysuzjl0xcdbhfje49pbcqyg`, publicado en `.40:18085` |
| Imagen API | `sha256:9a4e0a3955a983fcd64536e6760284c3956aa4ce9a7697e0b9ae623464223c94` |
| Revisión API etiquetada | `e68699fc7687e5700fed954dca2e0cef5fda6eb6` |
| Revisión App etiquetada | `bf4acd085decbe1e086c52ac2b2c335ba91491dc` |
| `QUADRUM_ENDPOINT` | `https://ws.cfdiquadrum.com.mx/timbrar` |
| `QUADRUM_CANCELAR_ENDPOINT` | `https://ws.cfdiquadrum.com.mx/cancelar` |
| `QUADRUM_PRODUCCION_HABILITADA` | `true` |
| `QUADRUM_RFC_HABILITADOS` | `JICJ800630854,JIFT6203071N7,JIFJ4704238T5` |
| `QUADRUM_FLUJOS_HABILITADOS` | `FACTURA` |
| Resultado del guard CANCELACION | 403 para los tres RFC listados |
| Contenedor histórico `.234 / ioe` | Detenido; no usarlo como fuente de producción actual ni arrancarlo para esta revisión |

SHA256 del compilado `cancelacion.service.js`: `b649d141386972fe4fb637a7006b1000c5ffa17f91bc278cfe9b06488026ab5e`. SHA256 `quadrum-config.js`: `f07cd0a51c3f3aff2bf23f3e8e803824c7a8c582e17dbf632810d1c53a22841e`. Comparar nuevamente antes de implementar o desplegar; no reutilizar estos datos como inventario permanente.

El inventario inicial local identifica cambios ajenos en créditos, entidades fiscales, lealtad e integración Odoo en ambos repositorios. Preservarlos. No confundir fuente `WORKTREE` con versión productiva ni promover módulos/SQL de desarrollo al resolver cancelación.

## Alcance de la corrección

Objetivo solicitado: permitir que cualquier **RFC emisor verificable del documento, con su CSD y cuenta PAC propios**, pueda tramitar cancelación sin pertenecer a una lista manual de emisores o flujos.

1. Integrado localmente: `assertCancelacionQuadrum` valida destino y RFC sin depender de `QUADRUM_RFC_HABILITADOS`, `QUADRUM_FLUJOS_HABILITADOS` ni de la bandera global de emisión. `CancelacionService` usa esta validación específica; `assertOperacionQuadrum` delega cuando recibe CANCELACION y conserva la política actual para FACTURA, NOTA_CREDITO y COMPLEMENTO_PAGO.
2. No usar `*`, añadir todos los RFC a una lista ni limitarse a `FACTURA,CANCELACION`: esa solución seguiría bloqueando emisores futuros y no cumpliría solicitud.
3. Validar endpoint oficial HTTPS y ambiente concordante, documento/UUID existente y perteneciente a Quadrum, RFC registrado válido y coincidencia del CSD con ese RFC. Obtener siempre cuenta individual; sin fallback a credenciales de otra razón social o cuenta global productiva. RFC sin datos propios recibe diagnóstico de configuración concreto, no falso rechazo del PAC.
4. Conservar JWT, permisos específicos existentes y excepción ya autorizada de ausencia de límite por sucursal. No volver a imponer SUC como condición para cancelar.
5. Conservar `confirmar=true`, motivo y sustitución cuando corresponda, control de concurrencia del documento y prevención de solicitudes duplicadas. Mantener restricciones reales comunicadas por SAT/PAC: «No cancelable», solicitud en proceso o CFDI ya cancelado no se resuelven quitando validaciones.
6. Resolver emisor, receptor y total con datos del CFDI original persistido, contrastando los enviados por UI; no seleccionar el registro por importe. La captura muestra 999.98 y motivo 03, pero no identifica RFC/UUID/IDFOL. Esos datos por sí solos no autorizan ni permiten elegir documento para una prueba real.

No se requiere una variable de activación por RFC nueva ni habilitar NC/REP para resolver esta incidencia. La implementación debe eliminar el bloqueo administrativo específico de cancelación sin convertir ausencia de datos/credenciales en permiso para enviar una solicitud incompleta.

## Contrato Quadrum verificado

GET público desde CT105 al [WSDL productivo](https://ws.cfdiquadrum.com.mx/cancelar?wsdl): HTTP 200, namespace `http://ws.cfdiquadrum.com.mx/cancelar`. SHA256 de la descarga: `6d20630cd465f2f860d4a95a8d11d9a0a0c10d44325b446c5b1c8ce3157bb68e`. No se enviaron credenciales ni POST SOAP.

- `obtiene_status_sat`: `usuario, contrasena, taxpayer_id, rtaxpayer_id, uuid, total`; SOAPAction `obtiene_status_sat`.
- `cancelar`: `UUIDS, usuario, contrasena, rfc, cer, key, reintentar`; SOAPAction `cancelar`. Tipo UUID con atributos `UUID`, `FolioSustitucion`, `Motivo`.
- `acuse`: `usuario, contrasena, rfc, uuid, tipo`; SOAPAction `acuse`.

Nombres/orden verificados con WSDL y pruebas contractuales; desarrollo usa `usario/password` en consulta de estado y no debe recibir indiscriminadamente los nombres productivos. El GET confirma contrato y disponibilidad de WSDL, no acceso a cancelación de una cuenta ni aceptación fiscal. La revisión posterior recuperó además la [Wiki oficial de cancelación](https://wiki.cfdiquadrum.com.mx/home/webservices/ws_cancelacion) y los [ejemplos oficiales Python](https://wiki.cfdiquadrum.com.mx/home/ejemplos_python/cancelar).

### Refuerzo solicitado por el titular durante implementación

- Ambos WSDL se releyeron por GET sin credenciales. Demo: SHA256 `f9f1d5a2b537a656a99924a1c59a2cc7cb031c017bfd43896cda1248760ba07b`; producción conserva hash registrado arriba. `soap:address` confirma endpoint de POST sin `.wsdl`. En producción total es `xs:string`; demo usa `xs:float`, con representación decimal compatible.
- `cancelar` requiere `UUIDS` con elemento UUID y atributos de identidad/motivo; ambos ambientes comparten sus nombres de credenciales. CSD/llave se codifican en base64 y el reintento permanece false. Pruebas comparan sobre, campos ordenados y cuenta del emisor sin usar secretos reales.
- La guía distingue solicitud recibida (201) de previamente cancelado (202); ambas se conservan como códigos procesables, pero sólo estado SAT confirmado habilita refacturación. Pruebas verifican que cliente no inventa un estado final y códigos de rechazo no se consideran éxito sólo por HTTP 200.
- Motivo 01 requiere sustitución; pruebas verifican atributo y ausencia para los demás motivos. Reglas de motivo y tratamiento de errores mantienen sus pruebas propias. No se copiaron ejemplos que registran secretos ni se deshabilitó TLS.

## Controles que deben validarse al quitar el bloqueo

Lectura del código actual detecta puntos a cubrir antes de declarar operación lista:

- `CancelarCfdiDto` y controlador exigen confirmación, motivo válido, UUID/RFC/total. Identidad y total deben coincidir con documento original, no sólo tener formato correcto.
- `CancelacionService.estatus()` está comentado como sólo lectura, pero puede ejecutar `sincronizarFolio()` y escribir SQL cuando SAT devuelve Cancelado. Para diagnóstico estrictamente de lectura utilizar cliente de consulta directamente con identidad resuelta, no esa ruta sin evaluar sus efectos.
- Una respuesta de estado vacía/desconocida no debe habilitar cancelación por defecto. Actualmente `cancelable` se calcula negando «No cancelable», y la operación sólo busca ciertos textos; agregar casos explícitos de respuesta incompleta/error antes de enviar.
- Tras `cliente.cancelar`, no presentar solicitud como aceptada sólo porque hubo respuesta HTTP o porque `solicitada=true`. Evaluar `acuse.exitoso` y códigos por UUID; diferenciar enviado, rechazado, en aceptación y cancelado confirmado. El código actual devuelve `solicitada=true` incluso si `acuse.exitoso=false`; esto requiere representación inequívoca del resultado, sin fabricar éxito.
- Timeout/error de transporte después de enviar puede ser incierto. Conservar evidencia segura, no repetir automáticamente ni liberar documento como refacturable. Sólo marcar CANCELADO/refacturable con confirmación fiscal, no con simple recepción de la solicitud.
- Evidencia actual se guarda después de recibir acuse. Preparar registro de etapa previo a red y captura sanitizada de errores para poder demostrar si hubo solicitud; comprobar almacenamiento persistente antes de la operación, sin que fallo de guardado produzca reenvío ciego.

Son controles del mismo flujo y criterios de validación; no se han reproducido como incidentes reales en este trabajo.

## Fases y entregables

| ID | Trabajo | Salida y aceptación |
|---|---|---|
| QCAN-01 | Preflight actualizado, lectura | Backend/front activos, entorno público y versiones; localizar UUID/IDFOL/RFC exactos cuando se aporte caso. Sin arrancar backend alterno ni consultar estados por ruta que escriba SQL |
| QCAN-02 | Retirar habilitación administrativa de cancelación | Cambio específico en `quadrum-config.ts`/`cancelacion.service.ts`; cualquier emisor documental válido con cuenta propia alcanza preconsulta aunque no figure en listas; otros flujos conservan reglas |
| QCAN-03 | Validación de resultado y diagnóstico | Separar origen IOE, consulta PAC, cancelación PAC, persistencia y estado fiscal; responder claro en UI; cubrir estado desconocido, rechazo por UUID e incertidumbre |
| QCAN-04 | Pruebas sin efectos reales | Contratos SOAP, múltiples RFC incluyendo emisor ficticio válido fuera de listas, bandera global de emisión apagada y flujo FACTURA únicamente; mock PAC acepta el alcance esperado sin gastar timbres/cancelar |
| QCAN-05 | Preparación de release conjunto | Build API, pruebas del módulo y verificaciones completas aplicables; Flutter analyze/test y hot reload si cambia Dart. Commits de back/front y conservación de cambios; inventario SQL explícito |
| QCAN-06 | Despliegue autorizado y postflight | Fijar destino CT105/servicios actuales; back/front juntos, montaje y secretos preservados, reversa disponible. Reproducir guard sin PAC, health, JWT y hashes web. Ninguna cancelación automática por desplegar |
| QCAN-07 | UAT fiscal de caso necesario | RFC/UUID/folio/motivo/sustitución exactos, resultado de preconsulta presentado y autorización concreta para una cancelación. Acuse/estado/SQL/evidencia coincidentes; sin reenvío automático ante rechazo o incertidumbre |

### Casos mínimos de prueba

1. Los tres RFC comerciales y un RFC ficticio válido fuera de listas, con dependencias simuladas y propias, superan habilitación de cancelación; no obtienen credenciales ajenas.
2. Mismos casos con `QUADRUM_FLUJOS_HABILITADOS=FACTURA`, lista de RFC vacía y bandera de emisión false: cancelación no se bloquea por esas variables; FACTURA/NC/REP siguen sujetos a su política.
3. RFC inválido, UUID sin documento, documento de otro PAC, CSD de otro RFC, cuenta incompleta y endpoint ajeno: fallan antes de enviar y se identifican como errores IOE.
4. Motivo 01 exige sustitución válida; motivos restantes respetan contrato. `confirmar=false`, total/receptor distintos del XML original o estado desconocido: no enviar.
5. SAT No cancelable, ya Cancelado o En proceso: no duplicar solicitud; UI explica motivo.
6. Un rechazo dentro de HTTP 200, SOAP Fault o código por UUID no aceptado no se muestra como cancelación exitosa. Timeout conserva estado incierto y no reenvía.
7. Aceptación con receptor pendiente mantiene estado pendiente; sólo Cancelado confirmado habilita refacturación. Fallo de disco/SQL posterior no autoriza otra llamada.
8. UI refresca estado cuando corresponde y muestra origen del error. No se modifica Facturify ni se eliminan restricciones de otros módulos.

## Inventario de archivos y SQL

Backend previsto: `src/modules/cfdi/quadrum-config.ts`, `cancelacion.service.ts`, pruebas respectivas y, para evidencia segura, `quadrum-cancelacion.client.ts` con pruebas de contrato. Frontend condicional: `ioe_app/lib/features/modulos/facturacion/Pruebas_api/quadrum_folio_acciones.dart` y clientes de API, únicamente para mostrar fases/resultados sin falso éxito. README/AGENTS y seguimientos deben reflejar excepción específica nueva.

SQL previsto para la corrección de bloqueo: **NINGUNO** en tablas, columnas, defaults, PK/FK/CHECK/UNIQUE, índices, vistas, funciones, SP, triggers, jobs, sinónimos, permisos, migración o backfill. Operación fiscal futura utilizará escrituras existentes de estado, dentro del caso autorizado. Si implementación propone objetos nuevos, actualizar inventario y preparar preflight/respaldo/aprobación aparte antes de ejecutarlos.

## Reversa y límites de autorización

Restaurar imagen/configuración previas si el release falla, conservando datos y evidencia de operaciones en curso. Nunca restaurar SQL, eliminar UUID o alterar XML para deshacer una cancelación. Revertir código puede restaurar bloqueo interno, pero no revierte estado SAT.

La entrega inicial fue diagnóstico/documentación. Posteriormente el titular solicitó iniciar integración y descartar notas de soporte: se implementó retirada del bloqueo en fuente local y sus pruebas. No se cambiaron flags productivos, credenciales, datos, imágenes o infraestructura; no se ejecutó consulta PAC autenticada, timbrado ni cancelación. La implementación local, el despliegue y una cancelación de UAT deben diferenciarse en seguimiento. La imagen mostrada no identifica documento exacto para ejecutar operación fiscal. Los controles adicionales del apartado de validación se siguen separadamente del bloqueo corregido; no se presentan como implementados sólo por este cambio.

Seguimiento: [QUADRUM_CANCELACION_SEGUIMIENTO_20261029.md](QUADRUM_CANCELACION_SEGUIMIENTO_20261029.md). Notas para soporte técnico retiradas por instrucción del titular; no forman parte del alcance vigente.
