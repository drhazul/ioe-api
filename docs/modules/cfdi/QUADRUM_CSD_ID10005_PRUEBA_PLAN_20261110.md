# Plan de comunicación y timbrado: FACT_CSD ID 10005

Fecha: 2026-11-10, America/Mexico_City. ID: `IOE-QUADRUM-CSD10005-20261110`.
Estado: P3 simulación completada con una factura plantilla de otro RFC y override sólo en memoria. Consulta PAC, allowlist productiva, emisión y postflight siguen pendientes.
Seguimiento: [avance y puertas](QUADRUM_CSD_ID10005_PRUEBA_SEGUIMIENTO_20261110.md).

## Aclaración del identificador

`10005` identifica un registro de `dbo.FACT_CSD`, no una factura. El registro corresponde al RFC emisor `JIGE810809HI4`, está activo, tiene archivos CSD y cuenta Quadrum registrada; los metadatos muestran vigencia del 2026-11-06 al 2030-11-06. En la consulta de preflight no se expusieron certificados, claves, contraseña cifrada ni usuario PAC.

El timbrado se solicita por un `IDFOL` comercial de `dbo.FAC_SVR_SHAP`. Al corte, la consulta por `RfcEmisor='JIGE810809HI4'` devolvió **cero facturas**, así que aún no existe folio comercial que simular o timbrar. No usar `10005` en rutas de factura.

## Evidencia actual

Preflight de solo lectura desde el backend activo en CT105 (`172.16.100.40`), con `DB_NAME()` y `@@SERVERNAME` confirmando `IOELOCAL` / `dd7842d7ba7e`:

| Control | Resultado al 2026-11-10 |
|---|---|
| `FACT_CSD.ID=10005` | RFC `JIGE810809HI4`; activo; CSD y cuenta PAC descifrables en memoria y sello local validado; autenticación ante Quadrum todavía no probada |
| Facturas con ese emisor en `FAC_SVR_SHAP` | 0 filas |
| `QUADRUM_ENDPOINT` del proceso API | `https://ws.cfdiquadrum.com.mx/timbrar` |
| `QUADRUM_PRODUCCION_HABILITADA` | `true` |
| `JIGE810809HI4` dentro de `QUADRUM_RFC_HABILITADOS` | No |
| `QUADRUM_FLUJOS_HABILITADOS` | `FACTURA` |
| Correo automático de facturas | Activo; cuenta/token conectados. El timbrado exitoso puede encolar envío de XML/PDF al correo fiscal del cliente |
| Release en CT105 | API y App healthy, imagen `sha256:ab1fdd2dc92b4b8abffb969a080a26e39a9905eb841ed56f6d57488047a3a8d2`, API `c91cb718`, App `fc48abd6` |

El endpoint productivo y el flujo `FACTURA` ya están configurados, pero el gate por RFC impide emitir para `JIGE810809HI4`. La simulación probó descifrado local de la cuenta; no demuestra que Quadrum acepte esas credenciales.

## Secuencia propuesta

### P0 — Comunicación autenticada, sin timbre

1. Releer el registro activo por `RFC` en `FACT_CSD`; validar que CSD pertenece a `JIGE810809HI4`, que se puede descifrar contraseña de la llave, que certificado/llave concuerdan y que la contraseña PAC cifrada se puede descifrar. No mostrar valores secretos.
   Estado: COMPLETADO durante simulación; llave/cuenta descifradas en memoria y firma local validada. No equivale a autenticación PAC.
2. Desde el backend productivo, verificar TLS/WSDL de `QUADRUM_ENDPOINT` y realizar una operación SOAP `consulta` con UUID ficticio `00000000-0000-0000-0000-000000000000`, usando las credenciales de ese RFC y sin XML de factura. Respuesta clara de UUID inexistente puede confirmar transporte y autenticación; rechazo de usuario, SOAP Fault distinto o timeout deja la prueba fallida/inconclusa. HTTP 200 por sí solo no basta.
3. Usar `QuadrumClient.consultar()` dirigido al endpoint `/timbrar`; el probe debe limitarse a este RFC y guardar sólo estado, código y duración, nunca body SOAP con credenciales. No usar `GET /cfdi/estado` como prueba específica: en producción recorre todos los CSD activos y su diagnóstico actual consulta el servicio `/cancelar`, no el endpoint de timbrado.
4. El probe no crea CFDI ni reserva folio. La referencia oficial de Quadrum describe el método `consulta` para buscar por UUID; antes de ejecutarlo se confirmará el contrato productivo vigente del WSDL de timbrado desde CT105. [Documentación Quadrum: WS Cancelación](https://wiki.cfdiquadrum.com.mx/home/webservices/ws_cancelacion).

### P1 — Habilitación del RFC, a cargo del titular

Después de que P0 confirme cuenta y conexión, agregar `JIGE810809HI4` a `QUADRUM_RFC_HABILITADOS` en la configuración productiva. Mantener `QUADRUM_PRODUCCION_HABILITADA=true` y el flujo limitado a `FACTURA`. El titular hará su pase; verificar el entorno efectivo del nuevo proceso y ambas imágenes/health si el cambio implica despliegue. No habilitar NC, REP, cancelación u otros RFC como parte de esta prueba.

### P2 — Obtener documento comercial del emisor

Generar o identificar una factura real por el proceso comercial ordinario. Confirmar que su `FAC_SVR_SHAP.RfcEmisor` sea `JIGE810809HI4`; anotar el `IDFOL` exacto. La sucursal no cambia selección de CSD: el emisor del folio debe coincidir con `FACT_CSD.RFC`.

Preflight del `IDFOL`: cabecera y cliente fiscal, conceptos, receptor, C.P., régimen, UsoCFDI, método/forma, importes; sin UUID existente, marca de otro PAC, reserva activa ni estado incierto/persistencia pendiente. No corregir datos fiscales por conjetura.

Para probar el CSD antes de que exista venta propia de JIGE, se permite una plantilla temporal sólo para simulación: cargar folio de hoy de otro RFC y cambiar `RfcEmisor` en una copia en memoria. Esto no convierte la venta en factura de JIGE, no modifica el registro guardado y no habilita su timbrado.

Plantilla ejecutada el 2026-11-10: `DF04-20261110-VF-0034`, emisor persistido `JIFT6203071N7`, 2 conceptos, PENDIENTE, sin UUID ni reserva.

### P3 — Simulación local, sin contacto PAC — COMPLETADA con plantilla temporal

La ruta pública `POST /cfdi/probar/:idFol` siempre toma el RFC persistido y no admite override. Para esta excepción se invocó el método existente `EmisionService.probar` con un repositorio efímero que entregó una copia de la cabecera con `RfcEmisor=JIGE810809HI4`. El original quedó intacto. El CSD cargado por RFC coincidió con `FACT_CSD.ID=10005`; el emisor del XML simulado coincidió con JIGE y el motor validó el sello. Resultado: 2 conceptos, subtotal 314.65, total 365.00, PUE/01. Sin escritura SQL ni llamada a Quadrum. No publicar sello, cadena, XML ni datos del receptor.

Esta prueba confirma armado y sellado local con el CSD; no confirma autenticación de cuenta PAC, comunicación con Quadrum ni que RFC esté habilitado en el proceso productivo.

### P4 — Aprobación y un timbrado productivo

Con simulación aceptada, solicitar confirmación explícita sobre el `IDFOL` exacto, emisor, receptor, total e impacto del correo automático. El envío automático está activo: revisar destinatario fiscal vigente antes del intento; si el usuario no quiere correo, debe coordinarse su estado antes de timbrar.

Sólo después de esa confirmación ejecutar una vez `POST /cfdi/emitir/:idFol` con `{ "confirmar": true }`. Es emisión ante SAT y consume timbre. No reintentar automáticamente si hay timeout, resultado incierto o persistencia pendiente; reconciliar con evidencia y UUID primero.

### P5 — Postflight

Verificar de forma independiente: `CFDI_STATUS=TIMBRADO`, UUID único coincidente en cabecera y reserva, `CFDI_PAC=QUADRUM`, serie/folio de la reserva con RFC correcto, XML timbrado legible en almacenamiento persistente, evidencia de respuesta PAC y registro de correo sin duplicar envío. Confirmar que el XML conserva datos del receptor y certificado esperado. Registrar UUID en evidencia privada, no en documentación pública del cambio.

## Criterios para detener

- RFC no habilitado en el entorno efectivo; CSD/RFC discordantes, expirados, no descifrables o contraseña PAC rechazada.
- Sin `IDFOL` comercial con ese RFC emisor, o simulación fiscal discrepante.
- UUID existente, reserva aún activa, otro PAC, estado cancelación/persistencia incierto o identidad fiscal dudosa.
- No se puede confirmar destinatario de correo automático antes de emitir.
- Timeout o respuesta ambigua después del POST; detener reenvío y reconciliar.

## Cambios y límites

La simulación usó el runtime activo sólo como proceso de lectura/sellado; no modificó CSD, credenciales, allowlist, correo, SQL persistente, fuente, certificados ni infraestructura. No hubo llamada SOAP ni timbrado. El CSD pudo descifrarse y sellar en memoria, pero aceptación de cuenta por Quadrum y autorización efectiva del emisor siguen pendientes. El titular realizará cualquier pase de entorno. No usar el ID de CSD como folio comercial ni presentar la plantilla de otro RFC como venta real de JIGE.
