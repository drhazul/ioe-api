# Expediente para soporte Quadrum — rechazo 702

Estado: preparado para que el titular lo comparta por su canal de soporte. No se ha enviado a terceros desde herramientas del agente.

## Hechos y solicitud

En producción, cuenta asociada al emisor JICJ800630854 admite consulta con UUID ficticio, pero rechaza timbrado real autorizado de un documento. Solicitamos revisar vinculación y habilitación de distribuidor/usuario para Web Services productivos. Confirmar causa exacta de 702 y acción requerida; no asumir contraseña incorrecta, saldo insuficiente ni fallo XML sin validación del proveedor.

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

## Evidencia y restricciones

Acuse privado: `/ArchivosUsuarios/respaldoCFDI/evidencia/20261013T024518_JICJ-01120/acuse.json`. XML enviado en la misma carpeta. Compartir sólo evidencia que solicite soporte mediante canal privado seguro; usuario de cuenta puede aportarlo titular por ese canal, nunca contraseña ni llave CSD.

IOE quedó en ERROR / ERROR_EMISION, sin UUID ni XML timbrado; no se volvió a enviar. Retomar sólo después de solución, preflight y simulación nuevos y autorización concreta de reintento. Este caso es distinto del rechazo de credenciales de JIFJ4704238T5, que continúa diferido por titular.
