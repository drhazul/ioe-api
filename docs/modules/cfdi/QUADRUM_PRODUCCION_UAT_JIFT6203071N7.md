# UAT Quadrum — JIFT6203071N7 / DF04-20261012-VF-0004

Fecha: 2026-10-12, America/Mexico_City. Resultado: **no aprobada**, rechazo PAC 702. Se realizó una emisión autorizada, sin reintento automático.

## Alcance y preflight

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

## Intento autorizado y postflight

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
