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
- Codigo front esperado para menu operativo: `DAT_JAA_TRAN`; reportes: `DAT_REP_TRAN`.
- Tablas oficiales: `TRAN_CTR_DOCPRE` y `TRAN_DET_ART`.
- Catalogos soporte: `MOV_TRAN`, `PRIO_TRAN`, `ESTATUS_TRAN`, `TRAN_EVID`, `TRAN_PAQ_ENV`, `TRAN_INCIDN`.
- `GET /transferencias/notificaciones` debe incluir `LIBERADA` para roles de sucursal solo con `SUC_SAL` y `TRANSITO` solo con `SUC_ENT`.
- `GET /transferencias` debe ocultar `TRANSITO` a la sucursal origen; en ese estatus solo se lista para `SUC_ENT`.
- `GET /transferencias` debe mostrar `BORRADOR` solo a `SUC_ENT`.
- La evidencia de surtido se guarda en `TRAN_EVID` desde `POST /transferencias/:doc/detalle/:idpd/evidencia`; validar estado `PREPARACION` y sucursal origen/surtidora.
- Antes de ejecutar `sp_trans_transito`, backend debe bloquear documentos con renglones sin evidencia en `TRAN_EVID`; aceptar solo data URL de imagen mayor a 500 bytes y maximo 500 KB.
- Movimientos oficiales `DAT_CMOV`: `121` salida origen, `122` faltante reintegracion, `123` entrada destino, `124` sobrante descuento origen.
- No usar tablas `TRAS_*` ni `DAT_ART_SVR`; el articulo y stock se resuelven con `DAT_ART`.
- `GET /transferencias/reportes` y `GET /transferencias/reportes/:doc` son solo para jefe de inventarios/admin; no aplican limites operativos por estatus, excluyen `INCIDENCIA` como filtro de cabecera y devuelven `hasIncidencia` cuando algun renglon tiene `ESTATUS_R=INCIDENCIA`.

## Reglas
- La contabilizacion y las transiciones criticas se mantienen en SPs idempotentes versionados en `sql/`.
- No inventar codigos de movimiento; consultar `DAT_CMOV`.
- Validar alcance por sucursal con `USR_MOD_SUC` para `DAT_JAA_TRAN`, con fallback a `SUC` del token cuando no existan asignaciones.
