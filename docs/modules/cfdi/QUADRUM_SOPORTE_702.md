# Expediente para soporte Quadrum — rechazo 702

Estado: preparado para que el titular lo comparta por su canal de soporte. No se ha enviado a terceros desde herramientas del agente.

Actualización 2026-10-13: nuevo intento de JICJ800630854 solicitado por titular fue **aceptado**, UUID `899F7CC4-A545-5FFE-9BA2-3E4A62FDAB7B`, serie JICJ/01120. El 702 de ese RFC es histórico; no se confirmó su causa ni se alteraron credenciales/entorno por herramientas del agente. JIFT6203071N7 no se volvió a probar y conserva último resultado 702. Los identificadores siguientes se mantienen para investigar incidente anterior, no como prueba de rechazo vigente de JICJ. Acta actualizada: [QUADRUM_PRODUCCION_UAT.md](QUADRUM_PRODUCCION_UAT.md).

Actualización posterior del mismo día, 10:29:40: reintento expresamente solicitado de JIFT6203071N7 devuelve **CFDI40147** sobre DomicilioFiscalReceptor, sin UUID. 702 tampoco apareció en ese ensayo y queda histórico para ambos RFC; no se atribuye causa o solución del rechazo anterior. Acta vigente: [QUADRUM_PRODUCCION_UAT_JIFT6203071N7.md](QUADRUM_PRODUCCION_UAT_JIFT6203071N7.md). Este resultado supersede afirmación de JIFT sin nuevo intento del corte previo.

Actualización 10:38:57: JIFT6203071N7 timbró correctamente **otro documento**, DF04-20261012-VF-0030, UUID CD32676E-C226-505C-B452-27B53DFBC07C, JIFT/02224. Acta: [QUADRUM_PRODUCCION_UAT_JIFT6203071N7_VF0030.md](QUADRUM_PRODUCCION_UAT_JIFT6203071N7_VF0030.md). Ambos emisores configurados acreditan timbrado de un documento; 702 se conserva como incidente histórico, sin atribuir causa. El caso VF0004 sigue rechazado por su receptor y no se modificó.

## Hechos y solicitud

En producción, las cuentas asociadas a JICJ800630854 y JIFT6203071N7 admiten consulta con UUID ficticio, pero rechazan timbrado real autorizado de sus documentos con 702. Solicitamos revisar vinculación y habilitación de distribuidor/usuario para Web Services productivos por cuenta/emisor. Confirmar causa exacta y acción requerida; no asumir contraseña incorrecta, saldo insuficiente ni fallo XML sin validación del proveedor.

| Dato para rastreo | Valor |
|---|---|
| Ambiente | Producción |
| Método / endpoint | timbrar / https://ws.cfdiquadrum.com.mx/timbrar |
| Fecha del PAC | 2026-10-12T20:45:19 |
| RFC emisor | JICJ800630854 |
| Folio comercial IOE | DF01-20261012-VF-0040 |
| Serie / folio enviados | JICJ / 01120 |
| Código | 702 |
| Mensaje | Sorry there was an error when validating the reseller and user |
| IdIncidencia | 4cfdb33f-4e80-41da-8637-b7e12af25297 |
| WorkProcessId | 516AFA78-411E-5430-A5DE-BC6475260EDC |
| UUID | Vacío en acuse; no confirmado |

Pedir confirmación de que la cuenta seleccionada está vinculada al distribuidor correcto, activa para timbrado en WS de producción y autorizada para este emisor. Verificar requisitos contractuales o de saldo únicamente si el proveedor identifica esa causa.

## Segundo caso: JIFT6203071N7

| Dato para rastreo | Valor |
|---|---|
| Fecha del PAC | 2026-10-12T21:24:35 |
| RFC emisor | JIFT6203071N7 |
| Folio comercial IOE | DF04-20261012-VF-0004 |
| Serie / folio enviados | JIFT / 02223 |
| Código / mensaje | 702 / Sorry there was an error when validating the reseller and user |
| IdIncidencia | 749527dc-03bb-488b-a523-2394bfad8e0a |
| WorkProcessId | 5FA2F5C7-1D68-5E64-A2A1-F8CB912DEE6A |
| UUID | Vacío en acuse; no confirmado |

Acta: [QUADRUM_PRODUCCION_UAT_JIFT6203071N7.md](QUADRUM_PRODUCCION_UAT_JIFT6203071N7.md). Acuse privado: `/ArchivosUsuarios/respaldoCFDI/evidencia/20261013T032435_JIFT-02223/acuse.json`. Un intento autorizado tras simulación y sello verificado; sin reintento ni correo encolado. Estado ERROR / ERROR_EMISION. No asumir que rechazo compartido confirma misma causa hasta que Quadrum revise ambos identificadores de proceso.

## Evidencia y restricciones

Acuse privado: `/ArchivosUsuarios/respaldoCFDI/evidencia/20261013T024518_JICJ-01120/acuse.json`. XML enviado en la misma carpeta. Compartir sólo evidencia que solicite soporte mediante canal privado seguro; usuario de cuenta puede aportarlo titular por ese canal, nunca contraseña ni llave CSD.

IOE quedó en ERROR / ERROR_EMISION, sin UUID ni XML timbrado; no se volvió a enviar. Retomar sólo después de solución, preflight y simulación nuevos y autorización concreta de reintento. Este caso es distinto del rechazo de credenciales de JIFJ4704238T5, que continúa diferido por titular.
