# Instrucciones de agente para Inventarios API

## Alcance
- Modulos backend de inventario operativo: `datart`, `datmb51`, `datmb52`, `dat-cmov`, `mermas` y `transferencias`.
- Persistencia MSSQL con tablas legacy `DAT_ART`, `DAT_MB51`, `DAT_MB51S`, `DAT_CMOV` y tablas de proceso especificas.

## Merma
- Modulo API: `src/modules/mermas`.
- Ruta base: `/mermas`.
- La evidencia `EVI_M` se recibe como data URL de imagen en JSON; `src/main.ts` mantiene body parser JSON/urlencoded en `1mb`, alineado al limite validado de 700000 caracteres.

## Transferencias entre sucursales
- Modulo API: `src/modules/transferencias`.
- Ruta base: `/transferencias`.
- Codigo front esperado para menu: `DAT_JAA_TRAN`.
- Tablas oficiales: `TRAN_CTR_DOCPRE` y `TRAN_DET_ART`.
- Catalogos soporte: `MOV_TRAN`, `PRIO_TRAN`, `ESTATUS_TRAN`, `TRAN_EVID`, `TRAN_PAQ_ENV`, `TRAN_INCIDN`.
- Movimientos oficiales `DAT_CMOV`: `121` salida origen, `122` faltante reintegracion, `123` entrada destino, `124` sobrante descuento origen.
- No usar tablas `TRAS_*` ni `DAT_ART_SVR`; el articulo y stock se resuelven con `DAT_ART`.

## Reglas
- La contabilizacion y las transiciones criticas se mantienen en SPs idempotentes versionados en `sql/`.
- No inventar codigos de movimiento; consultar `DAT_CMOV`.
- Validar alcance por sucursal con `USR_MOD_SUC` para `DAT_JAA_TRAN`, con fallback a `SUC` del token cuando no existan asignaciones.
