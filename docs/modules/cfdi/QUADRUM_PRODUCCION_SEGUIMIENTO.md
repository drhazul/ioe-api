# Seguimiento de corrección Quadrum para producción

Actualizado: 2026-10-13 (America/Mexico_City).
Estado general: integración fiscal FACTURA validada con un documento timbrado/persistido por cada uno de los tres RFC comerciales. Casos: DF01-20261012-VF-0040, DF04-20261012-VF-0030 y DF05-20261013-VF-0008. Por decisión del titular, VF0004/CFDI40147 es incidencia operativa de cliente y queda fuera del resultado de integración. NC/REP/cancelación se revisarán durante operación; restricción actual es de API, no ausencia de UI. Correo, PDF y consulta SAT pasan al [plan independiente](QUADRUM_POST_TIMBRADO_CORRECCION_PLAN.md) y su [seguimiento](QUADRUM_POST_TIMBRADO_CORRECCION_SEGUIMIENTO.md). No se declara UAT de flujos no ejecutados.
Plan: [QUADRUM_PRODUCCION_PLAN.md](QUADRUM_PRODUCCION_PLAN.md).

## Regla de evidencia

Registrar cada actividad con fecha, entorno, versión, resultado y evidencia segura. Separar reporte del titular, archivo local, proceso desplegado, consulta autenticada y emisión fiscal real. No guardar contraseñas, tokens, llaves, `.env` completos ni SOAP sin censura. Estados válidos: pendiente, parcial, bloqueado, completo; un estado completo debe cumplir su criterio, no sólo una parte.

## Avance y pendientes

| ID | Actividad | Estado | Dependencia / criterio de cierre |
|---|---|---|---|
| QPROD-00 | Plan y seguimiento | Completo | Archivos creados y enlazados; alcance documental actual explícito |
| QPROD-01 | Preflight actualizado de fuente y servidor | Completo | Tres emisores con cuenta/CSD propios y caso FACTURA aceptado; rechazo anterior de JIFJ es histórico |
| QPROD-02 | Separar pruebas y operación productiva | Completo desplegado | Rutas de prueba bloqueadas; documento real requiere flag, RFC y flujo explícitos |
| QPROD-03 | Cuenta/CSD estrictos por RFC | Completo técnico para tres RFC habilitados | Sin fallback productivo ni caché antigua; cada RFC tiene un caso timbrado. JIFJ ahora admitido por consulta y emisión |
| QPROD-04 | Diagnóstico por RFC y parser de errores | Completo desplegado | Interpreta error con HTTP 200; consulta admitida no acredita autorización del timbrado |
| QPROD-05 | Persistencia y recuperación fiscal | Técnico completo; recuperación fiscal pendiente de UAT | Evidencia persistente escribible y legado preservado; reservas no se liberan automáticamente |
| QPROD-06 | Pruebas y build de corrección | Completo técnico | Release aislado de edición: build API PASS, 53 suites / 260 pruebas PASS; 2 widgets PASS; CSD analyze sin incidencias |
| QPROD-07 | Release, entorno efectivo y postflight | Completo técnico | API 900b625 / App 9a72b96 desplegadas; edición y guard JWT verificados, entorno sin cambios; gate parcial FACTURA efectivo |
| QPROD-08 | UAT fiscal FACTURA por RFC | Completo para tres documentos | DF01-VF0040, DF04-VF0030 y DF05-VF0008 timbrados/persistidos. VF0004 excluido como incidencia de cliente; auxiliares y flujos futuros con seguimiento separado |

## Configuración local frente a servidor — corte histórico anterior al despliegue

| Elemento | Verificación local en esta solicitud | Último corte del servidor: diagnóstico previo 2026-10-12 | Pendiente |
|---|---|---|---|
| `QUADRUM_ENDPOINT` | Presente una vez; URL productiva canónica `/timbrar` | Ausente; cliente efectivo usaba `devws` | Verificar archivo privado y entorno efectivo tras despliegue |
| `QUADRUM_CANCELAR_ENDPOINT` | Presente una vez; URL productiva canónica `/cancelar` | Ausente; cliente efectivo usaba `devws` | Igual; ambos servicios deben corresponder al mismo ambiente |
| `CSD_CIFRADO_LLAVE` | Presente, valor no mostrado | Presente; registros activos descifrables | Conservar clave compatible y revalidar |
| Cuenta global PAC | Configuración detectada; sin validar valores | Ausente en proceso anterior | No admitir como respaldo productivo de otro RFC |
| `CFDI_STORAGE_BASE_PATH` | No evaluado en esta solicitud | `/ArchivosUsuarios/respaldoCFDI` con bind mount | Confirmar permisos y recuperación de XML |
| `CFDI_EVIDENCIA_DIR` | No evaluado en esta solicitud | Ausente; directorio interno sin bind observado | Provisionar almacenamiento persistente autorizado |
| Código productivo | Bloqueo explícito en fuente | Bloqueo confirmado en compilado desplegado | Corregir y desplegar, manteniendo protegidas pruebas |

El titular reportó incorporación de variables y se verificaron sus dos endpoints en `ioe-api/.env`. Esto cierra captura local únicamente. Ese apartado registra el corte de creación documental. La ejecución posterior y postflight al final de este archivo superseden sus pendientes de carga de endpoints y despliegue.

## Matriz por RFC

Fuente del último diagnóstico: consultas desde contenedor `ioe`, datos `IOELOCAL.dbo.FACT_CSD`. Todos los emisores comerciales usan esa misma base; no se evaluó ni implementó una base separada por RFC.

| RFC | CSD/RFC/descifrado del último diagnóstico | Consulta productiva sin emisión | Estado de preparación |
|---|---|---|---|
| `JICJ800630854` | Válidos; vence 2029-10-18 | Consulta admitida; reintento de DF01-20261012-VF-0040 timbrado el 13/10 | XML/UUID/SQL verificados; cierre funcional de PDF/correo/SAT pendiente |
| `JIFT6203071N7` | Válidos; vence 2028-07-08 | Consulta admitida; DF04-VF0030 timbrado | XML/UUID/SQL verificados; VF0004 es incidencia de cliente fuera de evaluación de integración |
| `JIFJ4704238T5` | Válidos; vence 2028-03-08 | Consulta admitida y DF05-VF0008 timbrado el 13/10 | Habilitado FACTURA por titular; XML/UUID/SQL verificados; cierre funcional pendiente |
| `XIQB891116QE4` | CSD de pruebas; vence 2027-05-15 | No se envió consulta con cuenta propia: no existe | Excluir de activación productiva |

Control negativo del diagnóstico: cuenta ficticia recibió rechazo explícito en consulta del servicio de cancelación productivo. En demo, rechazo apareció dentro de `consultaResult` con HTTP 200. No tomar estos indicadores de transporte como autenticación.

Hay un caso FACTURA productivo aceptado y persistido por cada RFC comercial, con acta propia. Ese resultado acredita los tres documentos concretos; no extrapolar a otros flujos o a toda operación futura. Los estados de rechazo en cortes anteriores son históricos.

## Riesgos detectados en preflight inicial — historial

| Riesgo | Evidencia / impacto | Acción requerida |
|---|---|---|
| Cambio de URL insuficiente | Funciones compartidas rechazan producción | QPROD-02; separar operación real y rutas de prueba |
| Credenciales rechazadas | JIFJ4704238T5 recibe rechazo PAC | Revisar cuenta/habilitación con Quadrum; actualizar sólo mediante flujo seguro autorizado |
| Fallback de cuenta o CSD | Código actual permite respaldo global ante ausencia/errores | QPROD-03; falla cerrada en producción |
| Falso positivo de diagnóstico | HTTP 200/consultaResult también contienen errores | QPROD-04; clasificación explícita por RFC |
| Caché antigua | Guardar mediante servicio limpia caché local; SQL directo no lo hace | Definir invalidación coherente y procedimiento de renovación |
| Evidencia no persistente | Directorio interno del contenedor fuera del montaje observado | QPROD-05; montaje y prueba de permisos/recuperación |
| Éxito PAC con falla disco/SQL | Etapas de persistencia posteriores a llamada PAC | Probar recuperación y evitar reemisión; hallazgo estático, no incidente reproducido |
| Resultado incierto sin UUID conocido | No permite resolver sólo consultando UUID | Definir reconciliación con evidencia/serie/folio/PAC, sin envío ciego |
| Cancelación pendiente y reemisión | Lógica actual considera estado de cancelación no vacío | Revisar confirmación fiscal antes de reemitir; no aceptar sólo solicitud pendiente |
| Árbol de trabajo con cambios ajenos | API ya tiene modificaciones y archivos nuevos anteriores | Preparar diff/release acotado y preservar trabajo existente |

## Registro de trabajo

| Fecha | Trabajo y evidencia | Límite / resultado |
|---|---|---|
| 2026-10-12, diagnóstico anterior | Lectura de fuente, código compilado y entorno del proceso, SELECT de CSD/folios/índices, WSDL y consultas SOAP con UUID ficticio | Sin modificación SQL, timbrado, cancelación, reinicio ni despliegue; accesos por RFC según matriz |
| 2026-10-12, diagnóstico anterior | Cinco suites locales, 67 pruebas aprobadas | Línea base técnica; no build de corrección ni UAT productiva |
| 2026-10-12, solicitud documental | Titular reporta variables agregadas; se confirma presencia única y URLs canónicas productivas en `ioe-api/.env` | Sólo configuración local verificada; valores secretos no expuestos |
| 2026-10-12, solicitud documental | Creación de plan/seguimiento y enlace en README del módulo | Sin cambios funcionales, secretos, SQL, commit, push ni operación fiscal |

## Próxima ejecución

1. Conservar configuración fiscal FACTURA validada y actas de los tres RFC. UAT administrativa de guardado desde UI se realiza cuando corresponda, sin modificar secretos para demostrar una ruta.
2. Continuar correo, PDF y consulta SAT exclusivamente en el plan independiente y su tablero; no volver a timbrar documentos con UUID.
3. Tratar VF0004/CFDI40147 dentro de operación de datos fiscales del cliente; no incorporarlo como bloqueo ni pendiente de cierre de integración.
4. Revisar NC/REP/cancelación conforme surjan casos. Transporte y campos base contrastados con WSDL; su activación requiere incluir flujo exacto en lista de API. Consulta SAT presenta desajuste de dos etiquetas, documentado en expediente independiente.
5. Conservar cambios locales, credenciales, emisores históricos y reservas; esta reclasificación documental no cambia entorno ni datos.

## Registro de UAT fiscal y casos operativos

| RFC | Flujo | Documento autorizado | UUID / evidencia privada | Resultado / aceptación |
|---|---|---|---|---|
| `JICJ800630854` | Factura | DF01-20261012-VF-0040; reintento solicitado expresamente 13/10 | 899F7CC4-A545-5FFE-9BA2-3E4A62FDAB7B; evidencia privada 20261013T160542_JICJ-01120 | TIMBRADO / FACTURADO; PDF/correo/SAT y aceptación pendientes |
| `JIFT6203071N7` | Factura | DF04-20261012-VF-0030, solicitado expresamente 13/10 | CD32676E-C226-505C-B452-27B53DFBC07C; evidencia privada 20261013T163857_JIFT-02224 | TIMBRADO / FACTURADO; PDF/correo/SAT y aceptación pendientes |
| `JIFT6203071N7` | Incidencia operativa de cliente, fuera de integración | DF04-20261012-VF-0004; no reenviado con esta solicitud | Sin UUID; evidencia privada 20261013T162940_JIFT-02223 | CFDI40147; conservar historial, no afecta resultado de integración |
| `JIFJ4704238T5` | Factura | DF05-20261013-VF-0008, desbloqueo/intento solicitados 13/10 | 3C10A6D3-5BF0-57CE-9BCB-CF6BB2EBE494; evidencia privada 20261013T211451_JIFJ-03120 | TIMBRADO / FACTURADO; PDF/correo/SAT y aceptación pendientes |
| RFC autorizado por caso | NC / REP / cancelación, según alcance final | Pendiente | Pendiente | No asumir cobertura por pruebas de factura |

No capturar contraseñas ni material privado en esta tabla. La reversa de código no elimina CFDI; cualquier recuperación o cancelación fiscal sigue el plan y autorización correspondiente.


## Ejecución autorizada el 2026-10-12

Titular autorizó iniciar integración y pase a producción. Release preparado en checkout aislado `codex/quadrum-produccion-20261012` sobre `origin/master`; cambios ajenos de master local y App conservados. La validación se ejecutó en ese árbol canónico. Se detectaron dos archivos locales de correo con errores previos de compilación frente a la versión canónica. Se alinearon únicamente importación de tipo y literal CSP con correcciones ya publicadas; build local posterior PASS, preservando otras modificaciones. El release se validó independientemente desde origin/master.

Implementación incluye cuenta individual estricta, diagnóstico por RFC, protección de rutas sintéticas, habilitación por RFC/flujo, control de sucursal (admin total; resto asignación explícita o SUC legacy), censura de auditoría y exclusión mediante applock. Factura, NC y REP conservan reserva ante incertidumbre o fallo posterior al PAC. Solicitud de cancelación pendiente no habilita reemisión.

Preflight productivo nuevo: permiso EXECUTE de sp_getapplock confirmado; 7 reservas RESERVADO y 2 CANCELACION_PENDIENTE históricas, no liberadas. Se detectaron 517 discrepancias históricas RFC folio/sucursal; triage de datos queda separado, sin UPDATE automático. Las dos cuentas válidas y la rechazada conservaron resultados del diagnóstico. XML storage escribible. Configuración de correo `AUTOMATICO=true` observada en este preflight: preservar, no asumir el estado apagado de expedientes anteriores.

Variables nuevas: `QUADRUM_PRODUCCION_HABILITADA` (defecto false), `QUADRUM_RFC_HABILITADOS` y `QUADRUM_FLUJOS_HABILITADOS` (listas explícitas). Se solicitó decisión al titular entre mantener apagado hasta validar todos los RFC o activar sólo los dos admitidos. Mientras no responda, desplegar código/endpoints con emisión deshabilitada; no inferir autorización parcial.

Build API y suite completa pasaron: 52 suites, 254 pruebas. Pruebas locales mockean PAC y datos; no se emitieron CFDI ni cancelaciones reales. UAT permanece pendiente por documento/RFC/flujo. Imagen de pase conservará frontend desplegado y reemplazará únicamente API.


## Postflight de despliegue 2026-10-12

- Commit API de código: `5042fbfec28ea594bcf40e8dab470987702c0920`, publicado en `origin/master` y sincronizado en servidor por fast-forward. Actualizaciones documentales posteriores no implican otro build de código.
- Imagen activa: `sha256:264c6d3626e14b38a72000891b5e35c3ece1f5cf3030b147f6edb2b6754cb8f8`, tag `ioe-allinone:quadrum-prod-20261012` y alias `ioe-allinone:latest`. Contenedor `ioe`, restart `unless-stopped`, puertos 8085/3001 y bind existente conservados.
- Frontend/Nginx tomados de la imagen anterior; App sin cambios de código en este pase. Imagen anterior `sha256:34bcc71984fbf6d4163fe7ab1c5aa0f31992308a0052c072351843e17e0b7fb9`, tag `ioe-allinone:before-quadrum-prod-20261012`; contenedor detenido `ioe-before-quadrum-20261012` conservado para reversa.
- Proceso API cargó endpoints `https://ws.cfdiquadrum.com.mx/timbrar` y `/cancelar`, timeout 60000 y evidencia `/ArchivosUsuarios/respaldoCFDI/evidencia`. Montaje persistente comprobado mediante escritura/lectura de archivo de verificación y retiro de ese único archivo.
- Evidencia anterior preservada en `/ArchivosUsuarios/respaldoCFDI/evidencia/legacy-20261012`. No se copiaron secretos ni certificados privados al release. Archivo privado de entorno sigue en modo `0600`; líneas ajenas a las siete variables públicas de Quadrum permanecieron intactas, incluida clave CSD/OAuth.
- API `/health` y `/health/db`: HTTP 200; web 8085: HTTP 200; HTTPS público `/api/health/db`: HTTP 200. `/cfdi/estado` sin JWT: HTTP 401.
- Diagnóstico ejecutado con clases compiladas del nuevo release y datos reales sólo en lectura: JICJ800630854 y JIFT6203071N7 admitidos por consulta; JIFJ4704238T5 rechazado; XIQB891116QE4 bloqueado como CSD de pruebas. No se emitió ni canceló ningún CFDI.
- Rutas sintéticas rechazadas antes de PAC. Emisión rechazada por gate explícito: `QUADRUM_PRODUCCION_HABILITADA=false`, listas de RFC y flujos vacías. Pendiente respuesta del titular a la decisión de activación parcial; no presumirla.
- Correo `AUTOMATICO=true` preservado. No se llamó envío de prueba ni se habilitó/reconfiguró correo en este pase.
- Reservas anteriores y discrepancias RFC sin modificar. De 517 discrepancias, 483 son folios comerciales JIFJ4704238T5 contra sucursales hoy asociadas a otros dos RFC, 14 tienen SELECCIONAR y 20 corresponden al RFC de pruebas. Los 483 comerciales carecen de UUID; requieren revisión de identidad antes de emisión, no reasignación automática.

### Reversa técnica disponible

Ventana: sin nuevas emisiones de este pase. Si hace falta reversa, detener y renombrar el contenedor nuevo conservando sus datos, devolver nombre `ioe` al contenedor anterior y arrancarlo con su entorno original; restaurar alias de imagen anterior. El release dejó sólo los valores públicos anteriores de las siete variables modificadas en `/root/ioe_stack/releases/quadrum-5042fbfec28ea594bcf40e8dab470987702c0920/previous-quadrum-public-settings.json`; restaurar exclusivamente esas variables mediante procedimiento privado, sin copiar ni reemplazar otros secretos. Revalidar health y destino SQL. Ninguna reversa de software elimina CFDI ante SAT.

Frontend verificado por hash agregado de todos sus archivos: anterior y nuevo coinciden (`e3573186d272deeba41b18e02b21c017a20917e980947cc09c890d9687b8f5e6`).


## Activación parcial autorizada y aplicada el 2026-10-12

El titular respondió: “Activar sólo JICJ800630854 y JIFT6203071N7; bloquear JIFJ4704238T5”. Esta autorización supersede la espera de respuesta y el gate global apagado registrados en los cortes anteriores. Se habilita únicamente el flujo FACTURA; NC, REP y cancelación conservan bloqueo hasta validar sus casos y alcance.

Preflight nuevo antes de activar: ambos RFC autorizados volvieron a pasar consulta autenticada usando sus registros de FACT_CSD; JIFJ4704238T5 continuó con rechazo explícito. Destino confirmado IOELOCAL en 192.168.10.234. No se actualizaron cuentas ni registros fiscales.

| Variable efectiva del proceso productivo | Valor aplicado |
|---|---|
| QUADRUM_PRODUCCION_HABILITADA | true |
| QUADRUM_RFC_HABILITADOS | JICJ800630854,JIFT6203071N7 |
| QUADRUM_FLUJOS_HABILITADOS | FACTURA |

Sólo esas tres variables públicas cambiaron en el archivo privado de entorno. Se recreó contenedor con la misma imagen de código `5042fbf`, mismos puertos, bind persistente y restart unless-stopped. Credenciales, clave CSD, OAuth, endpoints y configuración de correo se conservaron. Env sigue modo 0600. No hubo rebuild ni cambios de código para activar.

Postflight ejecutado desde clases compiladas y entorno del nuevo proceso:

- `validarEmision` admite ambos RFC habilitados tras comprobar CSD/cuenta y consulta PAC; no reserva serie, no emite XML ni timbra.
- Gate devuelve 403 para FACTURA de JIFJ4704238T5 y XIQB891116QE4, y para NOTA_CREDITO, COMPLEMENTO_PAGO y CANCELACION incluso con RFC habilitado.
- Rutas sintéticas de prueba siguen bloqueadas antes de contactar PAC.
- API health, DB health, web y HTTPS público DB health: HTTP 200. Imagen `sha256:264c6d3626e14b38a72000891b5e35c3ece1f5cf3030b147f6edb2b6754cb8f8`, running/unless-stopped.
- Correo AUTOMATICO=true preservado. No se ejecutó prueba de correo ni operación fiscal real.

Reversa de esta activación: contenedor detenido `ioe-before-activation-20261012` conserva configuración previa con emisión apagada. Valores públicos previos de las tres variables quedaron en `before-partial-activation-public-settings.json`, dentro del directorio privado de release previamente registrado. Reversa no requiere restaurar SQL ni rotar secretos. Mantener además reversa de versión anterior del pase técnico.

QPROD-08 sigue pendiente: elegir documento real necesario para negocio, autorizar su RFC/folio exactos, simular y validar primera factura productiva. Activación de gate y consultas autenticadas no acreditan emisión fiscal real, saldo/contrato ni aceptación funcional. Cuenta JIFJ4704238T5 sigue pendiente de corrección; datos discrepantes históricos no se reasignan automáticamente.

## Continuación del plan: edición desplegada y UAT rechazada

El titular decidió mantener JIFJ4704238T5 en espera hasta verificar y confirmar credenciales. Revalidación anterior del mismo día, tras edición informada: un CSD activo, usuario/contraseña presentes y descifrables, consulta productiva HTTP 200 con `Usuario o Contrasena Invalida`. No se volvió a contactar esa cuenta durante continuación; se comprobó su bloqueo por configuración.

Titular eligió DF01-20261012-VF-0040 de JICJ800630854. Simulación verificó emisor coincidente en folio/sucursal, ausencia de UUID y reservas, un concepto, subtotal 120.00 y total 139.20 MXN, PUE/01. El titular autorizó explícitamente un timbrado después de revisar receptor y datos. Una emisión ejecutada: PAC devuelve 702 `Sorry there was an error when validating the reseller and user`. Postflight confirma ERROR, UUID/XML_PATH nulos, control de serie JICJ/01120 en ERROR_EMISION y ningún trabajo de correo. No hubo reenvío, PDF fiscal ni cancelación. Acta: [QUADRUM_PRODUCCION_UAT.md](QUADRUM_PRODUCCION_UAT.md); expediente para proveedor: [QUADRUM_SOPORTE_702.md](QUADRUM_SOPORTE_702.md).

Release acotado de edición:

- API de código `900b6250f137b1e3e691bf773fdd165dc797be32`; App `9a72b96a6b4410bbcb6293a1294ae42f31ab2881`. Publicados en origin/master, sincronizados por fast-forward en servidor. Los repositorios principales locales y sus cambios ajenos se conservaron.
- Imagen `sha256:d6ad51c0ec473c6e5b423118fedc74638e88f8c451fdf4d3e24756b42449812f`, tag `ioe-allinone:quadrum-cuenta-20261012` y alias latest. Etiquetas incluyen ambos commits.
- Web compilada con Flutter 3.47.2 / Dart 3.13.2, dependencias bloqueadas sin cambios de pubspec/lock. Contexto generado desde fuentes revisadas; configuración web pública `/api`, sin copiar .env privados. SHA256 de main.dart.js servido coincide: `085ea2895b8820e50c7a294e6ded89d25d8de55ab3e20a59a148a24fcfe7de17`.
- Build API y 53 suites / 260 pruebas PASS en release aislado; dos widgets PASS y analyze CSD sin incidencias. Análisis amplio conserva nueve avisos previos de correo; no impiden build JS. Hot reload local correcto y sin errores de runtime.
- Ruta PATCH documentada en API efectiva, guard administrativo comprobado en imagen y petición sin JWT HTTP 401. Se verificó artefacto web con texto de edición; no se invocó guardado real para probar despliegue ni se modificaron credenciales por herramientas del agente.
- Health API/DB/web/HTTPS público HTTP 200. Contenedor running/unless-stopped, puertos 8085/3001 y bind persistente anteriores conservados; hash privado del archivo de entorno idéntico antes/después. Nginx/Supervisor se conservan de imagen anterior.
- Postflight de 2026-10-12 20:56 America/Mexico_City: ambas cuentas habilitadas admitidas sólo por consulta; gate bloquea JIFJ4704238T5, RFC de pruebas y NC/REP/cancelación. Correo AUTOMATICO=true preservado; sin nuevos CFDI en postflight.
- Reversa de software: imagen `ioe-allinone:before-quadrum-cuenta-20261012` y contenedor detenido `ioe-before-quadrum-cuenta-20261012`. Metadatos seguros en `/root/ioe_stack/releases/quadrum-cuenta-900b625/previous-runtime.json`. Detener/renombrar el contenedor nuevo y devolver nombre ioe al anterior antes de arrancarlo; restaurar alias de imagen y comprobar health. No restaurar SQL ni borrar reserva/evidencia del intento fiscal.

UAT no aprobada; configuración de habilitación parcial se conserva por autorización previa. Resolver 702 con proveedor y nueva autorización concreta antes de reintentar. JIFT6203071N7 requiere su propio documento autorizado. JIFJ4704238T5 permanece diferido, sin condicionar correcciones técnicas de otros emisores.


## UAT del segundo emisor — JIFT6203071N7

Titular solicitó UAT de DF04-20261012-VF-0004. El 2026-10-12 a las 21:22:46, preflight de sólo lectura y simulación verificaron emisor coincidente folio/sucursal, ausencia de UUID/reserva/cancelación, 2 conceptos, subtotal 56.03, impuestos 8.97 y total 65.00 MXN, PUE/03 y uso S01. Sello RSA-SHA256 verificado con certificado; consulta PAC admitida. Después de revisión, titular autorizó explícitamente un timbrado y posible correo automático posterior.

Preflight fresco conservó datos aprobados. Una emisión ejecutada con API 900b625; PAC respondió 702 a las 21:24:35, sin UUID. Postflight 21:25:24: CFDI_STATUS ERROR, PAC QUADRUM, UUID/XML_PATH/PDF_PATH nulos, estado comercial PENDIENTE; control de serie JIFT/02223, reemisión 1, ERROR_EMISION. Sin outbox de correo ni reintentos. No hubo PDF de CFDI aceptado, cancelación, rotación de credenciales ni cambio de configuración.

Acta: [QUADRUM_PRODUCCION_UAT_JIFT6203071N7.md](QUADRUM_PRODUCCION_UAT_JIFT6203071N7.md). Se amplió [QUADRUM_SOPORTE_702.md](QUADRUM_SOPORTE_702.md) con identificadores del segundo proceso, sin envío a terceros. UAT no aprobada para ninguno de los dos emisores configurados; mismo rechazo no determina causa común. Resolver con Quadrum y solicitar nueva autorización tras nueva simulación antes de reenviar. JIFJ4704238T5 sigue diferido y bloqueado; no se consultó su cuenta en esta UAT.


## Reintento expreso de JICJ800630854 — 2026-10-13

Titular solicitó repetir intento de DF01-20261012-VF-0040; nueva autorización para ese mismo documento. Preflight y simulación fresca a las 10:04:37 confirmaron mismos datos aprobados, sello válido y ERROR_EMISION conocido sin UUID/incertidumbre. No se presumió confirmación de solución del proveedor. Una emisión ejecutada a las 10:05:42: aceptada, serie JICJ/01120, UUID 899F7CC4-A545-5FFE-9BA2-3E4A62FDAB7B. Control REEMISION=1, TIMBRADO; FAC_SVR_SHAP FACTURADO/TIMBRADO, error anterior limpio por flujo normal.

XML persistido, emisor/receptor/total y sello CFD verificados. PDF generado y registrado (1 página, 36175 bytes); importes/UUID correctos, pero inspección visual detecta recorte de sellos/cadena a derecha. Correo automático outbox ID 1 ERROR_FINAL, un intento GMAIL_HTTP_403, sin enviado; no hubo reintento manual. Consulta SAT vía PAC no completada: no declarar Vigente confirmado. Detalles y evidencia en [QUADRUM_PRODUCCION_UAT.md](QUADRUM_PRODUCCION_UAT.md).

Este corte supersede bloqueo fiscal de JICJ por 702 en apartados anteriores; otros emisores no se vuelven a probar ni se habilitan por este éxito. JIFT mantiene último ensayo 702 y JIFJ sigue diferido/bloqueado. Sin cambios de código, despliegue, credenciales ni entorno. Pendientes de representación PDF, correo, consulta SAT y aceptación no autorizan otra emisión de este documento.


## Nuevo intento expreso de JIFT6203071N7 — 2026-10-13

Titular pidió repetir intento para DF04-20261012-VF-0004. Preflight de las 10:28:43 y simulación verificaron mismos datos aprobados, sello válido, sin UUID ni incertidumbre; ERROR_EMISION previo conocido y consulta PAC admitida. Un intento nuevo a las 10:29:40 fue rechazado con CFDI40147 sobre DomicilioFiscalReceptor; no apareció 702. C.P. enviado 94330. No se modificó registro de cliente, RFC, régimen, uso, cuenta PAC ni configuración.

Postflight 10:30:25: ESTATUS PENDIENTE, CFDI_STATUS ERROR, PAC QUADRUM, UUID/XML_PATH/PDF_PATH nulos; JIFT/02223, REEMISION 1, ERROR_EMISION. Sin outbox de correo ni reintento automático. Evidencia preservada, identificadores y acta en [QUADRUM_PRODUCCION_UAT_JIFT6203071N7.md](QUADRUM_PRODUCCION_UAT_JIFT6203071N7.md).

702 queda histórico para este RFC. Revisar C.P. fiscal y datos de receptor registrados ante SAT; no inferir ni cambiar valores sin confirmación y autorización exacta. Nueva simulación y autorización antes de otra emisión. JICJ timbrado no se volvió a emitir; JIFJ sigue bloqueado y diferido. Este corte supersede rechazo 702 vigente de JIFT indicado en secciones anteriores.


## Nuevo documento JIFT timbrado — DF04-20261012-VF-0030

Titular solicitó un intento para RFC JIFT6203071N7 con nuevo folio exacto VF0030. Preflight de las 10:37:49 confirmó PENDIENTE, identidad folio/sucursal coincidente y sin UUID/reserva/cancelación/incertidumbre. Simulación y sello válidos; consulta de cuenta propia admitida. Se presentaron receptor/datos e importes (10 conceptos, subtotal 948.30, impuestos 151.70 y total 1100.00 MXN; PUE/28, G01); se releyeron sin cambios antes de una emisión conforme a instrucción expresa.

PAC aceptó a las 10:38:57, JIFT/02224, UUID CD32676E-C226-505C-B452-27B53DFBC07C. Postflight 10:40:13: SQL FACTURADO/TIMBRADO, control TIMBRADO REEMISION 1 con mismo UUID; XML y sello CFD verificados. PDF persistido (38141 bytes, 1 página), con UUID/importes correctos pero recorte de sellos/cadena pendiente. Outbox ID 2 ERROR_FINAL, un intento GMAIL_HTTP_403, sin envío ni reintento manual. Consulta SAT vía PAC no completada; no declarar Vigente confirmado.

Acta: [QUADRUM_PRODUCCION_UAT_JIFT6203071N7_VF0030.md](QUADRUM_PRODUCCION_UAT_JIFT6203071N7_VF0030.md). Un timbrado, sin reintento automático. No se cambiaron cuentas, cliente, código, entorno ni despliegue. VF0004 sigue con CFDI40147 y no fue modificado/reenviado; JICJ conserva UUID y JIFJ continúa bloqueado/diferido. Este caso acredita una factura del segundo RFC, sin cerrar representación/entrega ni todos los flujos. No reenviar documentos con UUID por fallos de correo/PDF.


## JIFJ habilitado y VF0008 timbrado — 2026-10-13

Titular solicitó quitar bloqueo y prueba/timbrado de DF05-20261013-VF-0008. Consulta de cuenta propia admitida, simulación/sello y preflight de identidad/estado aprobados; datos presentados y conservados antes de emitir. Nueva autorización supersede espera/bloqueo de cortes anteriores. Sólo QUADRUM_RFC_HABILITADOS cambia a JICJ800630854,JIFT6203071N7,JIFJ4704238T5, manteniendo flag true y únicamente FACTURA.

Contenedor recreado con misma imagen/API/App, bind, puertos y restart. Hash del resto de líneas de entorno preservado y modo 0600; no se rotan secretos ni se copia env. Health API/DB/web/HTTPS público 200. Guard compilado conserva rechazo de NC/REP/cancelación y RFC de pruebas. Reversa de habilitación: contenedor ioe-before-jifj-activation-20261013-1512 y snapshot sólo de parámetros públicos en /root/ioe_stack/releases/jifj-activation-20261013-1512/. No restaurar SQL/XML tras emisión.

Una emisión aceptada a las 15:14:52: JIFJ/03120, UUID 3C10A6D3-5BF0-57CE-9BCB-CF6BB2EBE494. Postflight 15:15:54 verifica XML, sello CFD, emisor/receptor/importes, SQL FACTURADO/TIMBRADO y control TIMBRADO REEMISION 1. PDF persistido, 1 página, 36112 bytes, datos/UUID correctos; recorte de sellos/cadena pendiente. Correo outbox ID 3 inicialmente REINTENTABLE/ERROR_PROCESAMIENTO, sin enviado; último corte 15:18:36 tenía dos intentos del worker existente, sin reintento manual. Consulta SAT no completada. Acta: [QUADRUM_PRODUCCION_UAT_JIFJ4704238T5.md](QUADRUM_PRODUCCION_UAT_JIFJ4704238T5.md).

Tres RFC habilitados con un caso FACTURA timbrado por emisor; cierre funcional y otros flujos pendientes. No reenviar folios con UUID por errores de entrega/PDF. Otros documentos y datos históricos no se corrigen automáticamente. Este corte supersede listas de dos RFC y JIFJ bloqueado de secciones históricas.


Último corte de correo 2026-10-13 15:23:54 America/Mexico_City: outbox ID 3 sigue REINTENTABLE, 3 intentos automáticos, ERROR_PROCESAMIENTO, ENVIADO_EN nulo. No se hizo reintento manual; estado puede evolucionar por worker existente. Timbrado permanece confirmado con UUID, sin otra emisión.


## Separación de alcance solicitada — 2026-10-13

Integración fiscal FACTURA verificada con tres casos productivos aceptados. VF0004/CFDI40147 se excluye como problema de integración por ser dato operativo de cliente. NC/REP/cancelación pasan a validación durante operación; restricción de API actual se conserva y no significa ausencia de UI. Correo/PDF/SAT se trasladan al [expediente independiente](QUADRUM_POST_TIMBRADO_CORRECCION_PLAN.md), con [tablero propio](QUADRUM_POST_TIMBRADO_CORRECCION_SEGUIMIENTO.md). Lectura 15:43: correo JICJ/JIFT ERROR_FINAL/GMAIL_HTTP_403; JIFJ REINTENTABLE/ERROR_PROCESAMIENTO, cuatro intentos; ningún envío registrado. Consulta SAT usa dos nombres incompatibles con WSDL vigente, cambio pendiente. Sin intervención Google ni cambios funcionales/productivos. Los cortes anteriores son historial y no deben reintroducir los bloqueadores excluidos por el titular.


## Identidad fiscal sin restricción por sucursal — 2026-10-14

El titular autoriza excepción específica de FACTURA_QUADRUM: sucursal no limita operación ni determina la identidad del emisor. Guard de documentos conserva autenticación, existencia y RFC emisor válido, pero deja de consultar USR_MOD_SUC o comparar SUC del usuario. Simulación/emisión exigen RfcEmisor en cabecera, sin inferirlo de DAT_SUC ni comparar con RFC actual de sucursal. CSD y cuenta propios, habilitación RFC/flujo, restricciones de pruebas y protección contra duplicidad/incertidumbre continúan. Permisos administrativos de CSD/correo y reglas de otros módulos sin cambios. Los criterios anteriores de bloqueo fiscal por sucursal quedan supersedidos sólo para este módulo. Acta de diagnóstico/intento: docs/modules/cfdi/QUADRUM_DF06_VF0007_20261014.md.


## DF06 sin límite de sucursal y timbrado aceptado — 2026-10-14

Titular autoriza retirar restricción de sucursal en Quadrum. API valida identidad RFC del documento, sin comparar SUC del usuario ni RFC actual de DAT_SUC; cuenta/CSD y gates productivos conservados. API bca75ff desplegada sin cambiar frontend/env. Un intento de DF06-20261001-VF-0007 aceptado 15:13:05, JIFJ/03032, UUID 018F1D8B-4CAD-5DE5-A0EE-B28C2D1717E9, total 405.03. XML/sello/SQL/control verificados; CFDI40147 histórico no se reprodujo con C.P. 08830 sin modificar cliente. Correo/PDF bajo proceso automático independiente. [Acta](QUADRUM_DF06_VF0007_20261014.md).
