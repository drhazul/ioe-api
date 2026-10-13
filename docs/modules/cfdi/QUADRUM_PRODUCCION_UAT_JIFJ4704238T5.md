# UAT Quadrum — JIFJ4704238T5 / DF05-20261013-VF-0008

Fecha: 2026-10-13, America/Mexico_City. **RFC habilitado para FACTURA y documento timbrado/persistido**. Representación PDF, correo, consulta SAT y aceptación funcional siguen pendientes.

## Autorización y preflight

Titular solicita retirar bloqueo del RFC y prueba/timbrado del folio exacto DF05-20261013-VF-0008. Esta instrucción supersede mantener JIFJ en espera de cortes anteriores, limitada a habilitar FACTURA y un intento del documento, sin cambiar cliente, cuentas, otros flujos ni certificados de pruebas.

Preflight de las 15:12:12 con API compilada 900b625: identidad del emisor coincide en folio/sucursal, estado PENDIENTE y sin UUID, reserva, cancelación o incertidumbre. Simulación sin SQL/PAC durante sellado, sello RSA-SHA256 verificado y cuenta propia admitida por consulta. El rechazo anterior de usuario/contraseña no se reprodujo en este corte; no se atribuye su causa ni se presume quién lo resolvió.

| Datos simulados y conservados antes de emitir | Resultado |
|---|---|
| Emisor | JIFJ4704238T5 |
| Documento | DF05-20261013-VF-0008 |
| Conceptos | 2 |
| Subtotal / impuestos / total | 527.59 / 84.42 / 612.01 MXN |
| Método / forma / uso | PUE / 01 / G01 |
| Receptor | Datos del registro fiscal actual, presentados al titular; detalle en preflight privado, C.P. enviado 72000 |

## Habilitación aplicada

Una variable pública del entorno privado cambió: `QUADRUM_RFC_HABILITADOS` pasa de `JICJ800630854,JIFT6203071N7` a `JICJ800630854,JIFT6203071N7,JIFJ4704238T5`. `QUADRUM_PRODUCCION_HABILITADA=true` y `QUADRUM_FLUJOS_HABILITADOS=FACTURA` se conservan. NC, REP, cancelación y XIQB891116QE4 siguen bloqueados; guard comprobado con clases compiladas antes de emitir.

Contenedor recreado con misma imagen `sha256:d6ad51c0ec473c6e5b423118fedc74638e88f8c451fdf4d3e24756b42449812f`, mismas etiquetas API 900b625 / App 9a72b96, puertos 8085/3001, restart unless-stopped y bind de CFDI. No hubo rebuild ni despliegue de código. Hash de todas las líneas del entorno fuera de la lista RFC coincide antes/después; modo 0600 y secretos se preservan. Health API/DB/web y HTTPS público HTTP 200.

Reversa de habilitación disponible: contenedor detenido `ioe-before-jifj-activation-20261013-1512`; snapshot sólo de parámetros públicos en `/root/ioe_stack/releases/jifj-activation-20261013-1512/activation-public-settings.json`. Para revertir, detener/renombrar actual, restaurar nombre ioe al anterior y arrancarlo; devolver exclusivamente lista RFC anterior en entorno privado y comprobar health. Reversa de software no revierte CFDI ni autoriza borrar SQL/UUID/XML después de esta emisión.

## Timbrado y postflight

| Verificación | Resultado |
|---|---|
| Emisiones en esta solicitud | 1; sin reintento automático de timbrado |
| Fecha timbrado PAC | 2026-10-13T15:14:52 |
| Serie / folio | JIFJ / 03120 |
| UUID | 3C10A6D3-5BF0-57CE-9BCB-CF6BB2EBE494 |
| Timbre | TimbreFiscalDigital 1.1; UUID, emisor/receptor, conceptos e importes coinciden |
| Sello CFD | Verificado con certificado público y cadena de evidencia; coincide con SelloCFD del timbre |
| SHA256 XML | b67a60ffa7d7d50892845539d9ca24f43bb55a61b1dc2c8d7d6544af23467b91 |
| FAC_SVR_SHAP | FACTURADO / TIMBRADO, PAC QUADRUM, mismo UUID y rutas XML/PDF persistidas |
| Control de folios | TIMBRADO, REEMISION=1, mismo UUID |
| PDF | Generado y registrado, 36112 bytes, 1 página; datos/UUID coinciden. Inspección visual detecta recorte de sellos/cadena a derecha |
| Consulta SAT vía PAC | No completada, PacError; no declarar Vigente confirmado independientemente |

Postflight fiscal de las 15:15:54 confirmado. Correo automático: primera observación outbox ID 3, REINTENTABLE, un intento ERROR_PROCESAMIENTO; revisión 15:18:36 conserva REINTENTABLE con dos intentos automáticos, mensaje genérico de preparación/envío y ENVIADO_EN nulo. No se hizo reintento manual ni se atribuye causa Gmail 403 sin respuesta específica. Esta cola puede evolucionar por worker existente; no alterar timbrado por su estado.

## Evidencia y pendientes

Dentro del montaje `/ArchivosUsuarios/respaldoCFDI/`:

- XML/PDF: `JIFJ4704238T5/2026/10/JIFJ-03120_3C10A6D3-5BF0-57CE-9BCB-CF6BB2EBE494.*`.
- XML enviado, cadena y acuse: `evidencia/20261013T211451_JIFJ-03120/`.
- Simulación, preflight, autorización y postflight: `evidencia/uat-DF05-20261013-VF-0008/intento-1791925932637/`.

Directorios de evidencia usan UTC; horas del acta America/Mexico_City. Archivos fiscales y datos privados de receptor quedan fuera de Git/Obsidian. No se rotaron cuentas/credenciales por herramientas del agente.

Los tres RFC comerciales habilitados acreditan una FACTURA timbrada por documento; eso no cierra todos los flujos ni aceptación funcional. Pendientes: PDF sin recortes, entrega de correo, consulta SAT y validación del titular. No emitir de nuevo este folio por fallos de correo/PDF. Otros folios no se alteraron; VF0004 conserva error de receptor y ninguna corrección automática de datos o emisores históricos fue realizada.


Último corte de correo 2026-10-13 15:23:54 America/Mexico_City: outbox ID 3 sigue REINTENTABLE, 3 intentos automáticos, ERROR_PROCESAMIENTO, ENVIADO_EN nulo. No se hizo reintento manual; estado puede evolucionar por worker existente. Timbrado permanece confirmado con UUID, sin otra emisión.
