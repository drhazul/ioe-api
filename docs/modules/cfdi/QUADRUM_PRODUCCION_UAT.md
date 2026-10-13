# UAT de factura Quadrum — 2026-10-12

## Alcance autorizado y resultado

Titular eligió `DF01-20261012-VF-0040` de `JICJ800630854`. Tras simulación confirmó timbrado único en producción. Operación ejecutada con clases compiladas del release fiscal 5042fbf dentro del contenedor productivo, sin iniciar otro backend ni worker.

| Dato validado | Resultado |
|---|---|
| Base / servidor | IOELOCAL / 192.168.10.234:1433 |
| Emisor del folio y de sucursal | Ambos JICJ800630854 |
| Estado previo | Sin UUID, sin PAC previo, sin reserva ni cancelación pendiente |
| Simulación | Sellado local correcto; ningún contacto PAC durante simulación ni reserva SQL |
| Cuenta PAC | Consulta autenticada admitida; esto no prueba autorización de timbrado |
| Datos revisados por titular | Subtotal 120.00, total 139.20 MXN; 1 concepto; PUE / 01; uso G01 |
| Emisión autorizada | Una llamada al flujo de emisión; sin reintento automático |
| Respuesta PAC | Código 702: `Sorry there was an error when validating the reseller and user` |
| UUID / XML timbrado | Ninguno confirmado; no se generó PDF de CFDI aceptado |
| Postflight SQL | FAC_SVR_SHAP: ERROR, PAC QUADRUM, UUID y XML_PATH nulos |
| Control de serie | JICJ / 01120, REEMISION 1, ERROR_EMISION, sin UUID |
| Correo | Sin trabajo de outbox para este folio; no llegó a etapa posterior al timbrado |

## Evidencia privada

Dentro del montaje existente `/ArchivosUsuarios/respaldoCFDI/evidencia/`:

- `uat-DF01-20261012-VF-0040/simulacion-1791859387152/`: XML simulado y resumen seguro.
- `uat-DF01-20261012-VF-0040/preflight-emision-autorizada.json`: alcance del documento y autorización.
- `20261013T024518_JICJ-01120/`: XML enviado, cadena y acuse de rechazo.

El acuse contiene identificadores de incidencia y proceso para soporte. Compartirlo por canal privado seguro; no incluir cuenta PAC, contraseñas ni llave CSD. No copiar XML completo al expediente público.

## Acción pendiente

Quadrum debe confirmar causa y resolver validación de distribuidor/usuario para la cuenta productiva de JICJ800630854. El mensaje 702 no demuestra por sí solo contraseña incorrecta, falta de saldo, contrato específico ni problema de XML; no atribuir causa no confirmada.

Después de solución: releer estado fiscal y reserva, validar cuenta, repetir simulación con datos actuales y solicitar autorización nueva del documento antes de otro intento. No liberar ni borrar registros adicionales, no restaurar SQL y no usar Facturify como respaldo automático.

UAT **no aprobada**. JIFT6203071N7 fue evaluado después en DF04-20261012-VF-0004 y también recibió 702; acta propia: [QUADRUM_PRODUCCION_UAT_JIFT6203071N7.md](QUADRUM_PRODUCCION_UAT_JIFT6203071N7.md). JIFJ4704238T5 queda en espera y bloqueado por decisión del titular. NC, REP y cancelación permanecen fuera de activación. Ninguna consulta admitida ni build verde cierra aceptación fiscal.
