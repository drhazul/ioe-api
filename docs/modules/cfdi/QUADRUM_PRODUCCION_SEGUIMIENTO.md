# Seguimiento de corrección Quadrum para producción

Actualizado: 2026-10-12 (America/Mexico_City).
Estado general: corrección implementada y validada; despliegue técnico en preparación, activación y UAT fiscal pendientes. No activar producción por la sola captura de variables.
Plan: [QUADRUM_PRODUCCION_PLAN.md](QUADRUM_PRODUCCION_PLAN.md).

## Regla de evidencia

Registrar cada actividad con fecha, entorno, versión, resultado y evidencia segura. Separar reporte del titular, archivo local, proceso desplegado, consulta autenticada y emisión fiscal real. No guardar contraseñas, tokens, llaves, `.env` completos ni SOAP sin censura. Estados válidos: pendiente, parcial, bloqueado, completo; un estado completo debe cumplir su criterio, no sólo una parte.

## Avance y pendientes

| ID | Actividad | Estado | Dependencia / criterio de cierre |
|---|---|---|---|
| QPROD-00 | Plan y seguimiento | Completo | Archivos creados y enlazados; alcance documental actual explícito |
| QPROD-01 | Preflight actualizado de fuente y servidor | Completo | Revalidación de servidor y cuentas el 2026-10-12; cuenta JIFJ4704238T5 sigue rechazada |
| QPROD-02 | Separar pruebas y operación productiva | Completo local | Rutas de prueba bloqueadas; documento real requiere flag, RFC y flujo explícitos |
| QPROD-03 | Cuenta/CSD estrictos por RFC | Código completo; cuenta bloqueada | Sin fallback productivo y sin caché antigua; JIFJ4704238T5 requiere corrección del titular/proveedor |
| QPROD-04 | Diagnóstico por RFC y parser de errores | Completo local | Interpreta error con HTTP 200; distingue rechazo de UUID ficticio inexistente |
| QPROD-05 | Persistencia y recuperación fiscal | Código completo; montaje pendiente de pase | Reservas inciertas, recuperación y exclusión por documento comprobadas con fallos simulados |
| QPROD-06 | Pruebas y build de corrección | Completo | Checkout limpio sobre origin/master: build PASS, 52 suites / 254 pruebas PASS |
| QPROD-07 | Release, entorno efectivo y postflight | Pendiente | Diff y versión preparados, despliegue autorizado y entorno productivo revalidado |
| QPROD-08 | UAT por RFC y flujo; aceptación | Pendiente | Operaciones/documentos exactos autorizados, evidencia fiscal y aceptación del titular |

## Configuración local frente a servidor

| Elemento | Verificación local en esta solicitud | Último corte del servidor: diagnóstico previo 2026-10-12 | Pendiente |
|---|---|---|---|
| `QUADRUM_ENDPOINT` | Presente una vez; URL productiva canónica `/timbrar` | Ausente; cliente efectivo usaba `devws` | Verificar archivo privado y entorno efectivo tras despliegue |
| `QUADRUM_CANCELAR_ENDPOINT` | Presente una vez; URL productiva canónica `/cancelar` | Ausente; cliente efectivo usaba `devws` | Igual; ambos servicios deben corresponder al mismo ambiente |
| `CSD_CIFRADO_LLAVE` | Presente, valor no mostrado | Presente; registros activos descifrables | Conservar clave compatible y revalidar |
| Cuenta global PAC | Configuración detectada; sin validar valores | Ausente en proceso anterior | No admitir como respaldo productivo de otro RFC |
| `CFDI_STORAGE_BASE_PATH` | No evaluado en esta solicitud | `/ArchivosUsuarios/respaldoCFDI` con bind mount | Confirmar permisos y recuperación de XML |
| `CFDI_EVIDENCIA_DIR` | No evaluado en esta solicitud | Ausente; directorio interno sin bind observado | Provisionar almacenamiento persistente autorizado |
| Código productivo | Bloqueo explícito en fuente | Bloqueo confirmado en compilado desplegado | Corregir y desplegar, manteniendo protegidas pruebas |

El titular reportó incorporación de variables y se verificaron sus dos endpoints en `ioe-api/.env`. Esto cierra captura local únicamente. El servidor no se volvió a inspeccionar al elaborar estos documentos; no se afirma que su estado siga igual ni que haya recibido la actualización.

## Matriz por RFC

Fuente del último diagnóstico: consultas desde contenedor `ioe`, datos `IOELOCAL.dbo.FACT_CSD`. Todos los emisores comerciales usan esa misma base; no se evaluó ni implementó una base separada por RFC.

| RFC | CSD/RFC/descifrado del último diagnóstico | Consulta productiva sin emisión | Estado de preparación |
|---|---|---|---|
| `JICJ800630854` | Válidos; vence 2029-10-18 | Servicio cancelación: `UUID does not exist`; timbrado: `Could not get invoice` | Acceso de consulta admitido; revalidación y UAT pendientes |
| `JIFT6203071N7` | Válidos; vence 2028-07-08 | Misma respuesta para UUID ficticio | Acceso de consulta admitido; revalidación y UAT pendientes |
| `JIFJ4704238T5` | Válidos; vence 2028-03-08 | Servicio cancelación: `Usuario o Contrasena Invalida`; timbrado: Fault interno HTTP 500 | Bloqueado por cuenta productiva; corrección/revalidación pendientes |
| `XIQB891116QE4` | CSD de pruebas; vence 2027-05-15 | No se envió consulta con cuenta propia: no existe | Excluir de activación productiva |

Control negativo del diagnóstico: cuenta ficticia recibió rechazo explícito en consulta del servicio de cancelación productivo. En demo, rechazo apareció dentro de `consultaResult` con HTTP 200. No tomar estos indicadores de transporte como autenticación.

No hay UAT de producción acreditada para los tres RFC comerciales en este expediente. El titular informa que desarrollo ya pasó; conservar ese antecedente sin trasladarlo a aceptación productiva. Confirmar saldo/contrato y autorización de timbrado de cada RFC antes de emitir.

## Riesgos abiertos

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

1. Ejecutar QPROD-01 con datos/entorno frescos y confirmar alcance de implementación.
2. Corregir QPROD-02/03/04 y preparar solución de QPROD-05; resolver cuenta JIFJ4704238T5 por canal seguro.
3. Completar QPROD-06 y preparar diff/versiones; presentar evidencia para despliegue autorizado.
4. Completar QPROD-07 y consultas por RFC desde servidor; autorizar UAT por documento y RFC.
5. Cerrar QPROD-08 sólo para los flujos efectivamente aceptados; documentar restricciones restantes.

## Registro de UAT pendiente

| RFC | Flujo | Documento autorizado | UUID / evidencia privada | Resultado / aceptación |
|---|---|---|---|---|
| `JICJ800630854` | Factura | Pendiente | Pendiente | Pendiente |
| `JIFT6203071N7` | Factura | Pendiente | Pendiente | Pendiente |
| `JIFJ4704238T5` | Factura | Pendiente | Pendiente | Bloqueado por cuenta hasta revalidación |
| RFC autorizado por caso | NC / REP / cancelación, según alcance final | Pendiente | Pendiente | No asumir cobertura por pruebas de factura |

No capturar contraseñas ni material privado en esta tabla. La reversa de código no elimina CFDI; cualquier recuperación o cancelación fiscal sigue el plan y autorización correspondiente.


## Ejecución autorizada el 2026-10-12

Titular autorizó iniciar integración y pase a producción. Release preparado en checkout aislado `codex/quadrum-produccion-20261012` sobre `origin/master`; cambios ajenos de master local y App conservados. La validación se ejecutó en ese árbol canónico. El árbol local tiene errores previos en archivos de correo distintos de la versión canónica; no se copian al release.

Implementación incluye cuenta individual estricta, diagnóstico por RFC, protección de rutas sintéticas, habilitación por RFC/flujo, control de sucursal (admin total; resto asignación explícita o SUC legacy), censura de auditoría y exclusión mediante applock. Factura, NC y REP conservan reserva ante incertidumbre o fallo posterior al PAC. Solicitud de cancelación pendiente no habilita reemisión.

Preflight productivo nuevo: permiso EXECUTE de sp_getapplock confirmado; 7 reservas RESERVADO y 2 CANCELACION_PENDIENTE históricas, no liberadas. Se detectaron 517 discrepancias históricas RFC folio/sucursal; triage de datos queda separado, sin UPDATE automático. Las dos cuentas válidas y la rechazada conservaron resultados del diagnóstico. XML storage escribible. Configuración de correo `AUTOMATICO=true` observada en este preflight: preservar, no asumir el estado apagado de expedientes anteriores.

Variables nuevas: `QUADRUM_PRODUCCION_HABILITADA` (defecto false), `QUADRUM_RFC_HABILITADOS` y `QUADRUM_FLUJOS_HABILITADOS` (listas explícitas). Se solicitó decisión al titular entre mantener apagado hasta validar todos los RFC o activar sólo los dos admitidos. Mientras no responda, desplegar código/endpoints con emisión deshabilitada; no inferir autorización parcial.

Build API y suite completa pasaron: 52 suites, 254 pruebas. Pruebas locales mockean PAC y datos; no se emitieron CFDI ni cancelaciones reales. UAT permanece pendiente por documento/RFC/flujo. Imagen de pase conservará frontend desplegado y reemplazará únicamente API.
