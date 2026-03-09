# Pruebas manuales: `POST /pvctrords/create-from-quote-line`

Casos minimos de validacion:

1. Creacion normal
- `clien != 1`, `estado = PENDIENTE`, `ctd = 1` o `0.5`, `ordExistente` vacio.
- `tipo` en `TALLADO` o `BISELADO`, `fechaEntrega` opcional, `comad` opcional.
- Resultado esperado: `created = true`, `iord` con formato `SUC + serie1990 + consecutivo`, 1 header y 3 details (`OD`, `OI`, `ADD`).

2. Cliente no permitido
- `clien = 1`.
- Resultado esperado: HTTP 400 con `code = CLIENT_REQUIRED`.

3. Estado invalido
- `estado != PENDIENTE`.
- Resultado esperado: HTTP 400 con `code = INVALID_STATUS`.

4. Cantidad invalida
- `ctd = 2` (o cualquier valor distinto de `1` y `0.5`).
- Resultado esperado: HTTP 400 con `code = INVALID_QTY`.

5. ORD existente
- Enviar `ordExistente` con valor de `IORD` valido.
- Resultado esperado: `created = false`, `message = "El artículo ya tiene una ORD"`, con `header/details` de la ORD existente.

6. Concurrencia (dos requests simultaneos)
- Ejecutar dos requests en paralelo con mismo payload y `ordExistente` vacio.
- Resultado esperado: ambas respuestas exitosas con `iord` diferentes (sin duplicados).

7. Eliminacion de ORD desde popup
- Endpoint: `POST /pvctrords/delete-from-quote-line` con `iord` (y opcional `idfol`, `art`).
- Resultado esperado: `deleted = true`, se eliminan encabezado y detalles en una sola transaccion y `PV_TICKET_LOG.ORD` queda en `NULL`.

Ejemplo rapido en PowerShell 7 (ajustar URL/token/payload):

```powershell
$token = '<JWT>'
$url = 'http://localhost:3001/pvctrords/create-from-quote-line'
$body = @{
  idfol = 'DF01040220261210'
  art = 'ART-001'
  descArt = 'Articulo demo'
  ctd = 1
  clien = 2
  estado = 'PENDIENTE'
  tipo = 'TALLADO'
  fechaEntrega = '2026-02-20T00:00:00.000Z'
  comad = 'Observaciones del tallado'
  suc = 'DF01'
  opv = '5001'
} | ConvertTo-Json

1..2 | ForEach-Object -Parallel {
  Invoke-RestMethod -Uri $using:url -Method Post -ContentType 'application/json' -Body $using:body -Headers @{
    Authorization = "Bearer $using:token"
  }
}
```

