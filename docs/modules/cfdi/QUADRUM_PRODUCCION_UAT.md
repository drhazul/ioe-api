# UAT de factura Quadrum — seguimiento 2026-10-12/13

Estado actual de JICJ800630854: reintento expresamente solicitado el 2026-10-13 **timbrado correctamente**. UUID `899F7CC4-A545-5FFE-9BA2-3E4A62FDAB7B`, serie JICJ/01120, importe 139.20 MXN. XML y estado fiscal SQL verificados. PDF generado; revisión visual detecta recorte de sellos/cadena en margen derecho, pendiente de ajuste. Correo rechazado con GMAIL_HTTP_403 y consulta SAT independiente no completada. No declarar UAT funcional integral cerrada ni estado SAT vigente confirmado. El rechazo 702 del apartado siguiente es histórico.

## Intento inicial autorizado y resultado — 2026-10-12

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

## Reintento solicitado y ejecutado — 2026-10-13

Titular pidió repetir intento para JICJ800630854 con el mismo folio DF01-20261012-VF-0040. Esa solicitud constituye nueva autorización expresa para un intento con los datos ya revisados, no autorización de otros emisores/folios. No se informó ni presumió confirmación de solución del proveedor; la nueva instrucción autoriza comprobar resultado nuevamente y supersede prohibición de reenvío sin nueva autorización del corte anterior.

Preflight de las 10:04:37, America/Mexico_City: emisor coincide en folio/sucursal, sin UUID ni cancelación pendiente, ERROR / ERROR_EMISION del rechazo anterior y sin marca de incertidumbre. Simulación y sello verificados; mismo receptor/uso/régimen/CP, un concepto, subtotal 120.00, IVA trasladado 19.20 y total 139.20 MXN, PUE/01. Consulta de cuenta propia admitida. Preflight se repitió dentro de la ventana del intento antes de emitir.

| Verificación del reintento | Resultado |
|---|---|
| API ejecutada | Código 900b625, contenedor ioe; sin iniciar backend/worker adicionales |
| Emisión | Una llamada al flujo real con exclusión por documento; sin reintento automático |
| Fecha de timbrado PAC | 2026-10-13T10:05:42 |
| Serie / folio | JICJ / 01120; control mantiene REEMISION=1 |
| UUID | 899F7CC4-A545-5FFE-9BA2-3E4A62FDAB7B |
| XML | TimbreFiscalDigital 1.1, emisor/receptor/importes y UUID coinciden; sello CFD RSA-SHA256 verificado |
| SHA256 XML | c1793dedd96bcb07f60bf420ba26925555f48a01119708007a0e2c5c1cddbcda |
| FAC_SVR_SHAP | ESTATUS=FACTURADO, CFDI_STATUS=TIMBRADO, CFDI_PAC=QUADRUM; error anterior borrado por flujo normal |
| Control de folios | TIMBRADO, mismo UUID persistido |
| PDF | Generado y persistido, 36175 bytes; 1 página; UUID/RFC/importes comprobados. Visualmente sellos/cadena se recortan a derecha: no acreditar presentación completa |
| Correo automático | Outbox ID 1, ERROR_FINAL, 1 intento, GMAIL_HTTP_403; no enviado y sin reintento manual |
| Consulta SAT vía PAC | No completada, PacError; no atribuir causa ni declarar Vigente confirmado |

Postflight de las 10:07:28 verifica XML, firma, SQL y PDF. Evidencia privada nueva: `evidencia/20261013T160542_JICJ-01120/` y `evidencia/uat-DF01-20261012-VF-0040/reintento-1791907477283/` dentro del montaje existente. Archivos XML/PDF fiscales persistidos bajo `JICJ800630854/2026/10/`. Carpetas usan UTC; horas de acta usan America/Mexico_City. No copiar XML/PDF fiscal o datos privados de receptor al Git.

No hubo cancelación, cambio de emisor, rotación de credenciales ni modificación de entorno. JIFT fue evaluado después y recibió CFDI40147; consultar su acta propia. JIFJ continúa diferido y bloqueado.

Pendientes: revisar permisos/cuenta Gmail 403 sin tocar validez de CFDI, ajustar presentación de sellos/cadena del PDF, confirmar consulta SAT y aceptación funcional del titular. **Nunca volver a timbrar este folio mientras UUID permanezca vigente**; un fallo de PDF/correo no habilita reemisión. Este éxito acredita un documento de FACTURA para JICJ, no NC/REP/cancelación ni todos los emisores.
