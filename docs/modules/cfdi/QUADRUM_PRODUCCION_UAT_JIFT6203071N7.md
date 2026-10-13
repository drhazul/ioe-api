# UAT Quadrum — JIFT6203071N7 / DF04-20261012-VF-0004

Actualizado: 2026-10-13, America/Mexico_City. Resultado actual: **no aprobada**, reintento solicitado rechazado con CFDI40147 sobre DomicilioFiscalReceptor. Sin UUID, XML/PDF timbrados ni correo. El 702 del primer intento queda como antecedente histórico. Una nueva emisión en esta solicitud, sin reintento automático.

El emisor JIFT6203071N7 posteriormente timbró otro folio por solicitud del titular: [DF04-20261012-VF-0030](QUADRUM_PRODUCCION_UAT_JIFT6203071N7_VF0030.md), UUID CD32676E-C226-505C-B452-27B53DFBC07C. Esto no corrige ni autoriza reenviar VF-0004, que conserva rechazo de datos de su propio receptor.

## Alcance y preflight del primer intento — 2026-10-12

Titular solicitó mismo proceso de UAT para este emisor/folio y autorizó expresamente un timbrado después de revisar simulación, receptor e importes. Ejecución con clases compiladas de API 900b625 dentro del contenedor productivo `ioe`, imagen `sha256:d6ad51c0ec473c6e5b423118fedc74638e88f8c451fdf4d3e24756b42449812f`. No se inició otro backend ni worker.

| Comprobación | Resultado |
|---|---|
| Destino | IOELOCAL / 192.168.10.234:1433 |
| RFC del folio y sucursal | Ambos JIFT6203071N7 |
| Estado previo | Sin UUID, PAC, reserva ni cancelación pendiente; sin marca de incertidumbre |
| Configuración | Producción habilitada, RFC en lista explícita y sólo flujo FACTURA |
| Certificado usado | 00001000000708497812, CSD del RFC seleccionado |
| Simulación | Correcta; sin escritura SQL ni llamada PAC durante sellado |
| Firma | Sello RSA-SHA256 verificado con certificado público y cadena original |
| Subtotal / impuestos / total | 56.03 / 8.97 / 65.00 MXN |
| Conceptos / pago / uso | 2 / PUE / 03 / S01 |
| Receptor | Identidad y datos fiscales revisados y aprobados; detalle en evidencia privada |
| Consulta autenticada | Cuenta admitida, UUID ficticio inexistente; no prueba permiso de timbrado |
| Autorización | Titular confirmó un timbrado después de revisar datos y posible correo automático |

La simulación se registró a las 21:22:46. El preflight se repitió inmediatamente antes de emitir, comprobando mismos RFC, receptor, importes, moneda, uso, régimen/CP y estado sin UUID/reserva.

## Primer intento autorizado y postflight — 2026-10-12

| Dato | Resultado |
|---|---|
| Fecha registrada por PAC | 2026-10-12T21:24:35 |
| Operación | Una ejecución de flujo de emisión con exclusión por documento y reserva de serie |
| Serie / folio / reemisión | JIFT / 02223 / 1 |
| Código | 702 |
| Mensaje | `Sorry there was an error when validating the reseller and user` |
| IdIncidencia | 749527dc-03bb-488b-a523-2394bfad8e0a |
| WorkProcessId | 5FA2F5C7-1D68-5E64-A2A1-F8CB912DEE6A |
| UUID | Vacío en acuse; ninguno confirmado |
| FAC_SVR_SHAP | CFDI_STATUS=ERROR, CFDI_PAC=QUADRUM; UUID, XML_PATH y PDF_PATH nulos |
| Estado comercial | ESTATUS=PENDIENTE; no se marcó FACTURADO |
| FACT_CFDI_FOLIOS_DIARIOS | ERROR_EMISION, sin UUID |
| XML / PDF de CFDI timbrado | Ninguno disponible; no generar representación fiscal de documento rechazado |
| Correo | Ningún trabajo en outbox para este folio; no llegó a etapa posterior al timbrado |
| Reintentos / cancelaciones | Cero |

Postflight de las 21:25:24 mediante SELECT confirmó esos estados. Rechazo clasificado como conocido, sin marcar resultado incierto. No se borraron registros ni se cambió configuración, credenciales o emisor.

## Evidencia privada

En el montaje `/ArchivosUsuarios/respaldoCFDI/evidencia/`:

- `uat-DF04-20261012-VF-0004/simulacion-1791861766479/`: XML simulado y resumen; hash XML `4889e018ead6fccdccd034552e434afcda186317899512c97812e0c6fe33de63`.
- `uat-DF04-20261012-VF-0004/preflight-emision-autorizada.json`: datos aprobados y alcance de autorización.
- `uat-DF04-20261012-VF-0004/resultado-emision.json` y `postflight.json`: rechazo y comprobación posterior.
- `20261013T032435_JIFT-02223/`: `enviado.xml`, `cadena.txt` y `acuse.json`.

Estos archivos permanecen privados; no copiar XML completo, contraseñas ni material de llave al repositorio. El prefijo de carpeta usa UTC; fechas de esta acta y fecha de PAC corresponden a America/Mexico_City.

## Pendientes y límites

El mismo 702 ya ocurrió con JICJ800630854; ambos admiten consulta y rechazan timbrado. Esto evidencia alcance de rechazo en dos cuentas, pero no determina causa común ni demuestra contraseña inválida, saldo insuficiente, contrato o XML defectuoso. Quadrum debe revisar validación de distribuidor/usuario y confirmar solución por cuenta y ambiente.

Expediente conjunto: [QUADRUM_SOPORTE_702.md](QUADRUM_SOPORTE_702.md). Después de solución: nuevo preflight, consulta y simulación; autorización nueva antes de reenviar. Mantener ERROR_EMISION y evidencia; no liberar, borrar ni reasignar registros manualmente, no restaurar SQL ni usar Facturify como respaldo automático.

JIFJ4704238T5 sigue en espera y bloqueado, sin volver a probar su cuenta. NC, REP y cancelación no fueron activados ni ejecutados. La aceptación fiscal permanece pendiente para ambos RFC configurados; consulta admitida no sustituye una factura timbrada y aceptada.

## Reintento expreso — 2026-10-13

Titular solicitó repetir intento para JIFT6203071N7 con el mismo folio DF04-20261012-VF-0004. La instrucción aporta nueva autorización para un intento si conserva datos revisados y no hay UUID ni incertidumbre; no autoriza cambiar datos fiscales ni otros documentos. No se informó ni presumió solución confirmada de proveedor.

Preflight de las 10:28:43: RFC coincidente folio/sucursal; sin UUID, cancelación ni marca incierta; ERROR / ERROR_EMISION previo conocido. Simulación y sello verificados; mismos dos conceptos, subtotal 56.03, impuestos 8.97 y total 65.00 MXN, PUE/03, uso S01 y datos del receptor aprobados. Consulta de cuenta admitida. Se releyeron datos antes de emitir dentro de ventana del preflight; un marcador privado impide reutilizar autorización de esa ejecución.

| Resultado del nuevo intento | Evidencia |
|---|---|
| Fecha PAC | 2026-10-13T10:29:40 |
| Emisor / folio comercial | JIFT6203071N7 / DF04-20261012-VF-0004 |
| Serie / folio / reemisión | JIFT / 02223 / 1 |
| Código actual | CFDI40147 |
| Mensaje PAC | El campo DomicilioFiscalReceptor del receptor, debe encontrarse en la lista de RFC inscritos no cancelados en el SAT. |
| C.P. receptor enviado | 94330; identidad completa del receptor en preflight privado |
| IdIncidencia | 866e5ec2-9046-455b-bc0d-35254c2f233c |
| WorkProcessId | E0C3D14F-FF81-5EEC-8703-89076F913198 |
| UUID | Ninguno confirmado |
| FAC_SVR_SHAP | ESTATUS=PENDIENTE, CFDI_STATUS=ERROR, PAC=QUADRUM; UUID/XML_PATH/PDF_PATH nulos |
| Control de folios | ERROR_EMISION, sin UUID |
| Correo / PDF de CFDI | Sin outbox ni PDF/ XML timbrados |
| Cambios de datos / reintentos automáticos | Ninguno |

Postflight de las 10:30:25 mediante SELECT confirma esos estados. Evidencia privada: `evidencia/20261013T162940_JIFT-02223/` (XML enviado, cadena y acuse) y `evidencia/uat-DF04-20261012-VF-0004/reintento-1791908923675/` (simulación, preflight, autorización, resultado y postflight) dentro del montaje existente. No sobrescribir evidencia del 12/10.

En este ensayo ya no se recibió 702: el rechazo se desplazó a validación fiscal del receptor. Esto no determina por sí solo causa del anterior 702 ni acredita timbrado de una factura válida. No adivinar otro C.P., cambiar RFC, régimen o uso para evitar validación.

Siguiente acción: contrastar C.P. fiscal y datos del receptor con información que tenga registrada ante SAT. El mapper obtiene DomicilioFiscalReceptor del registro de cliente fiscal (CODIGOPOSTALRECEPTOR / CODIGOPOSTAL / CP), no del C.P. de expedición del emisor. [Referencia oficial SAT sobre datos del receptor](https://www.sat.gob.mx/minisitio/Factura/documentos/Infografia_FacturaElectronica_Datos_Receptor.pdf). Corrección de datos requiere valor verificado, preflight exacto y autorización propia; después nueva simulación y autorización concreta antes de emitir otra vez.

Sin cambios de código, entorno, cuentas PAC ni datos fiscales por herramientas del agente. JICJ ya tiene UUID timbrado y no fue reenviado; JIFJ sigue diferido y bloqueado.
