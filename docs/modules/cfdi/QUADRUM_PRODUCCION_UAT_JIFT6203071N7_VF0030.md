# UAT Quadrum — JIFT6203071N7 / DF04-20261012-VF-0030

Fecha: 2026-10-13, America/Mexico_City. **Timbrado y persistencia fiscal comprobados**. Cierre funcional pendiente de PDF, correo, consulta SAT y aceptación del titular.

## Alcance autorizado y preflight

Titular solicitó un intento para el mismo RFC con el nuevo folio exacto DF04-20261012-VF-0030. Autorización limitada a ese documento y una emisión; no modifica datos ni autoriza reenviar VF-0004. Preflight y simulación presentados antes de ejecutar, sin iniciar otro backend/worker, usando API productiva compilada 900b625.

| Comprobación | Resultado |
|---|---|
| Destino | IOELOCAL / 192.168.10.234:1433 |
| Identidad | JIFT6203071N7 coincide en folio y sucursal |
| Estado inicial | PENDIENTE, sin UUID, PAC, reserva, cancelación ni incertidumbre |
| Simulación | Correcta, sin SQL/PAC durante sellado |
| Sello | RSA-SHA256 verificado con certificado público |
| Cuenta PAC | Consulta individual admitida; sin fallback global |
| Conceptos | 10 |
| Subtotal / impuestos / total | 948.30 / 151.70 / 1100.00 MXN |
| Método / forma / uso | PUE / 28 / G01 |
| Receptor | Identidad y datos del registro fiscal actual; detalle en preflight privado, C.P. enviado 94300 |

Preflight de las 10:37:49. Inmediatamente antes de emitir se compararon nuevamente RFC, receptor completo, importes, conceptos, método/forma/uso, régimen, C.P. y estado; sin cambios. Marcador privado evita reutilizar autorización de esa ejecución.

## Resultado y postflight

| Verificación | Resultado |
|---|---|
| Intentos en esta solicitud | 1; sin reintento automático |
| Fecha de timbrado PAC | 2026-10-13T10:38:57 |
| Serie / folio | JIFT / 02224 |
| UUID | CD32676E-C226-505C-B452-27B53DFBC07C |
| Timbre | TimbreFiscalDigital 1.1; UUID, emisor/receptor, conceptos e importes coinciden |
| Sello CFD | Verificado con certificado público y cadena de evidencia; coincide con SelloCFD del timbre |
| SHA256 XML | 1ba35986d1da6675c90f402421443de5ec963a7537b5d559db16cd3a83aec9b6 |
| FAC_SVR_SHAP | ESTATUS=FACTURADO, CFDI_STATUS=TIMBRADO, CFDI_PAC=QUADRUM; UUID y rutas XML/PDF registrados |
| Control de folios | TIMBRADO, REEMISION=1, mismo UUID |
| XML / PDF | Persistidos en montaje existente; PDF 38141 bytes, 1 página |
| Revisión PDF | UUID/RFC/importes y conceptos visibles; sellos/cadena se recortan a derecha, pendiente ajuste de presentación |
| Correo | Outbox ID 2, ERROR_FINAL, un intento GMAIL_HTTP_403, no enviado; sin reintento manual |
| Consulta SAT vía PAC | No completada, PacError; no afirmar Vigente confirmado de forma independiente |

Postflight de las 10:40:13. Datos y firma del XML confirmados; PDF renderizado e inspeccionado, sin modificar el archivo fiscal. No se alteraron código, despliegue, entorno, cuentas o datos fiscales por herramientas del agente.

## Evidencia privada y límites

En `/ArchivosUsuarios/respaldoCFDI/`:

- XML/PDF: `JIFT6203071N7/2026/10/JIFT-02224_CD32676E-C226-505C-B452-27B53DFBC07C.*`.
- Acuse y XML enviado: `evidencia/20261013T163857_JIFT-02224/`.
- Simulación, preflight, autorización, resultado y postflight: `evidencia/uat-DF04-20261012-VF-0030/intento-1791909469787/`.

Archivos fiscales y datos privados de cliente no se copian a Git ni Obsidian. Fechas del acta usan America/Mexico_City; directorios de evidencia usan UTC.

Este caso acredita una factura de JIFT; VF-0004 permanece sin UUID por CFDI40147 y no fue modificado ni reenviado. No extrapolar C.P., RFC, uso o régimen entre clientes para corregirlo. JICJ conserva su UUID y JIFJ sigue bloqueado/diferido; NC/REP/cancelación fuera de activación.

Pendientes: presentación completa de PDF, revisión de Gmail 403 y consulta SAT/aceptación funcional. Un fallo de entrega o presentación no invalida resultado fiscal ni autoriza emitir otra factura de este documento. **No reenviar VF-0030 mientras UUID esté vigente**.
