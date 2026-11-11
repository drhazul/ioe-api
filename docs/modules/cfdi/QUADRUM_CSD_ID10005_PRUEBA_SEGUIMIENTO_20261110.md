# Seguimiento: comunicación y timbrado de FACT_CSD ID 10005

ID: `IOE-QUADRUM-CSD10005-20261110`. Corte: 2026-11-10, America/Mexico_City.
[Plan de ejecución](QUADRUM_CSD_ID10005_PRUEBA_PLAN_20261110.md).

## Estado

**P3 completada como simulación local con folio plantilla de otro RFC. No se contactó Quadrum ni se intentó emitir. Sigue sin existir factura comercial propia de JIGE.**

| Fase | Estado | Criterio de cierre |
|---|---|---|
| P0: identificar CSD | COMPLETO, SELECT | ID `10005` pertenece a RFC `JIGE810809HI4`, registro activo y vigente según fechas almacenadas. No se imprimió secreto |
| P0: validar custodia y comunicación | DESCIFRADO LOCAL COMPLETO; SONDA PAC PENDIENTE | CSD/cuenta descifrables y sello validado en simulación; falta WSDL/TLS de `/timbrar` y `consulta` autenticada a UUID inexistente; sin consumo de timbre |
| P1: gate productivo RFC | PENDIENTE DEL TITULAR | RFC aún fuera de `QUADRUM_RFC_HABILITADOS`; validar variable efectiva tras su pase. `FACTURA` es único flujo activo |
| P2: localizar factura | PLANTILLA TEMPORAL ENCONTRADA; factura propia JIGE sigue pendiente | `DF04-20261110-VF-0034` pertenece a `JIFT6203071N7`; se usó sólo como copia efímera para simulación |
| P3: simular factura | COMPLETO, SELLO LOCAL VÁLIDO | Override `RfcEmisor=JIGE810809HI4` sólo en memoria; sin escritura SQL ni llamada Quadrum; no equivale a venta JIGE |
| P4: timbrar una vez | PENDIENTE DE CONFIRMACIÓN POR FOLIO | Aprobación explícita de datos y efecto fiscal/correo; `POST /cfdi/emitir/:idFol` una vez |
| P5: validar resultado | PENDIENTE | UUID/serie/reserva/XML/storage y correo consistentes; sin reenvíos ante incertidumbre |

## Evidencia del preflight

- Base y servidor confirmados: `IOELOCAL` / `dd7842d7ba7e`; lectura limitada por `ID=10005` y RFC. Consultas no incluyeron CER, KEY, contraseña cifrada, nombre de usuario PAC ni destinatario.
- `FACT_CSD.ID=10005`: RFC `JIGE810809HI4`, `ACTIVO=1`; vigencia 2026-11-06 a 2030-11-06. La simulación descifró llave y cuenta PAC sólo en memoria; el certificado firmó y validó. Ningún secreto se mostró. La aceptación de credenciales ante Quadrum sigue sin probarse.
- `FAC_SVR_SHAP`: cero registros para `RfcEmisor=JIGE810809HI4` al momento de consulta.
- Backend activo CT105: endpoint `/timbrar`, flag de producción `true`, RFC no incluido en lista, flujo `FACTURA`. Contenedores API/App saludables, imagen `ab1fdd2d…`, revisiones API `c91cb718` / App `fc48abd6`.
- Correo productivo: `AUTOMATICO=true`, cuenta y token cifrado presentes. Tras un timbrado la emisión puede dejar correo en cola; verificar el destinatario del folio futuro antes de aprobarlo.
- `GET /cfdi/estado` no es una sonda exclusiva: en producción itera los CSD activos y llama a consulta mediante cliente del endpoint `/cancelar`. No acredita por sí solo la autenticación contra `/timbrar`.
- Simulación el 2026-11-10 con `DF04-20261110-VF-0034`: folio del día, emisor original `JIFT6203071N7`, PENDIENTE, 2 conceptos, sin UUID ni reserva. La copia en memoria usó `JIGE810809HI4`; el certificado usado coincidió con `FACT_CSD.ID=10005` y RFC del XML coincidió con JIGE. Sello verificado por el motor.
- Resumen del CFDI simulado: subtotal 314.65, total 365.00 MXN, PUE/01. La prueba no valida PAC, cuenta Quadrum ni allowlist. No se expusieron XML, cadena, sello ni datos del receptor.
- Postflight de lectura confirmó que RFC, estado, UUID, `CFDI_PAC` y reserva del registro persistido no cambiaron.

## Registro de actividad

- 2026-11-10: SQL de solo lectura en CT105 confirmó identidad de base/servidor, datos no secretos de CSD ID 10005, ausencia de factura para el emisor, gate efectivo por RFC y configuración de correo. Se inspeccionó fuente para distinguir `probar`, `emitir`, consulta PAC y worker de correo.
- 2026-11-10: simulación aislada en runtime API: `EmisionService.probar` recibió una copia de `DF04-20261110-VF-0034` con RFC JIGE; repo efímero limitó lectura a ese IDFOL. CSD 10005 y sello coincidieron. Sin escritura SQL, SOAP/PAC ni correo; postflight comprobó valores originales intactos.
- Documentación Quadrum consultada: página oficial de WS Cancelación describe `consulta`; el plan exige verificar el WSDL productivo de timbrado desde CT105 antes de usar consulta ahí. HTTP 200 sin interpretar cuerpo no cuenta como autenticación aceptada.
- Sin cambios de base, código, variable, imagen, cuenta, correo, reserva o CFDI. Sin llamada SOAP.

## Próximos datos y decisiones

1. Ejecutar sonda de autenticación específica y sin timbre al endpoint de timbrado; guardar resultado sanitizado.
2. Titular habilita el RFC en configuración productiva y comprueba su vigencia en el proceso API.
3. Identificar factura comercial real con emisor JIGE antes de cualquier timbrado; el folio plantilla JIFT no es facturable bajo JIGE.
4. Para timbrado real: revisar simulación sobre IDFOL propio, receptor, total y destinatario de correo; exigir autorización explícita del caso concreto.
