# Ordenes de trabajo (AGENTS API)

Navega a otros README/AGENTS solo cuando sea necesario.

Enlaces relacionados:
- AGENTS principal de la API: `AGENTS.md`
- README de este módulo: `docs/modules/ordenes_trabajo/README.md`
- Otros AGENTS: `docs/modules/base_modulos/AGENTS.md`, `docs/modules/punto_venta/AGENTS.md`, `docs/modules/core_seguridad/AGENTS.md`

## Ordenes de Trabajo (implementado 2026-03-22)
- Módulo NestJS:
- `src/modules/ordenes-trabajo/ordenes-trabajo.module.ts`
- `src/modules/ordenes-trabajo/ordenes-trabajo.controller.ts`
- `src/modules/ordenes-trabajo/ordenes-trabajo.service.ts`
- `src/modules/ordenes-trabajo/dto/*`
- Endpoints:
- `GET /ordenes-trabajo`
- `GET /ordenes-trabajo/:iord`
- `GET /ordenes-trabajo/:iord/detalle`
- `POST /ordenes-trabajo/:iord/autorizar|enviar|recibir|entregar|garantia|cambio-material|merma`
- `POST /ordenes-trabajo/enviar/validar` (valida ORD por `IORD/IDFOL` para flujo de envío, exige `ESTSEGU=3`)
- `POST /ordenes-trabajo/enviar/lote` (cambio masivo a `ESTSEGU=5` para ORDs relacionadas/seleccionadas)
- `GET /ordenes-trabajo/asignar/colaboradores` (catálogo `PV_OPV` por `SUC`, `NIVEL=41`)
- `POST /ordenes-trabajo/asignar/validar` (valida ORD en `ESTSEGU=7`)
- `POST /ordenes-trabajo/asignar/lote` (cambio masivo `7 -> 8`, actualiza `ASIGN` y `FCNAS` cuando existe)
- `POST /ordenes-trabajo/trabajo-terminado/validar` (valida ORD en `ESTSEGU=8`)
- `POST /ordenes-trabajo/trabajo-terminado/lote` (cambio masivo `8 -> 9`)
- `POST /ordenes-trabajo/regresar-incidencia/validar` (valida ORD en `ESTSEGU=9`)
- `POST /ordenes-trabajo/regresar-incidencia/lote` (cambio masivo `9 -> 9.1`, requiere `tipom` y persiste `PV_CTR_ORDS.TIPOM` desde `DAT_ORD_TMOV`)
- `POST /ordenes-trabajo/regresar-tienda/validar` (valida ORD en `ESTSEGU=9`)
- `POST /ordenes-trabajo/regresar-tienda/lote` (cambio masivo `9 -> 10`)
- `POST /ordenes-trabajo/asignar-laboratorio/lote` (asignación masiva de `LABOR` por lote)
- `POST /ordenes-trabajo/recibir/validar` (valida ORD por `IORD/IDFOL`, exige `ESTSEGU=5`)
- `POST /ordenes-trabajo/recibir/lote` (cambio masivo `ESTSEGU=5 -> 7`)
- `POST /ordenes-trabajo/entregar/validar` (valida ORD por `IORD/IDFOL`, exige `ESTSEGU=10`)
- `POST /ordenes-trabajo/entregar/lote` (cambio masivo `ESTSEGU=10 -> 11`)
- `POST /ordenes-trabajo/scan/recibir`
- `POST /ordenes-trabajo/scan/entregar`
- Reglas:
- respeta `IORD` como identidad y conserva `IDFOL` en ORDs derivadas.
- cambio material crea ORD nueva, cancela la original, replica `PV_CTR_ORDS_DET`, registra movimientos MB51 y diferencia contable cuando hay variación de costo.
- merma registra cantidad mermada/remanente y puede crear ORD derivada con trazabilidad (`REEORD/REOORD`, `TIPOM/TPOM`, `MOTR`, `DOCDIF/DOCIF` según esquema disponible).
- selección de renglones y escaneo se resuelven en frontend/appstate y en endpoints dedicados, sin depender de flags legacy persistidos.
- `enviar/lote` valida acceso por sucursal (`USR_MOD_SUC`), exige `ESTSEGU=3` en todas las ORDs del lote y aplica transición a `ESTSEGU=5`.
- `recibir/lote` valida acceso por sucursal, exige `ESTSEGU=5` y aplica transición a `ESTSEGU=7`.
- `entregar/lote` valida acceso por sucursal, exige `ESTSEGU=10` y aplica transición a `ESTSEGU=11`.
- `regresar-incidencia/lote` valida `ESTSEGU=9`, exige motivo `DAT_ORD_TMOV.IDT` y actualiza `TIPOM`; el panel entrega `ASIGNADO` como label de `PV_OPV` (`NOMB + APELM + APELP`).
- recepción unificada sin destino (`TALLER/ANALISTA`): backend fija recepción operativa a `ESTSEGU=7`.
- permisos de recepción (`RECIBIR` y `SCAN_RECIBIR`) restringidos a `ENC_MAQUILA/ENCARGADO_MAQUILA/ENC_BISEL/ENCARGADO_BISELADO` y `JEF_TALLER`; admin conserva acceso total.
- trazabilidad UI (app): en modal de envío se retira botón `Agregar ORD`; la captura manual agrega por `Enter` en el campo `ORD` (sin cambios de contrato API).
- trazabilidad UI taller (app, 2026-03-24): `ioe_app` mueve la botonera principal del panel a `Opciones de Trabajo`, sube `Configuracion de Vista` al AppBar y ajusta la etiqueta legado a `76mm x 51mm`; el backend mantiene el mismo contrato `/ordenes-trabajo/*` y no requiere SP nuevo ni ejecución SQL adicional.
- trazabilidad UI taller (app, 2026-03-24): los botones del AppBar pasan a fondo blanco y la paginación se integra al renglón de filtros, retirando el label de selección dentro del card; no cambia contrato, consulta ni stored procedure.
- matriz permisos ORDs (2026-03-24): `resolveAllowedActions` y `assertActionPermission` se alinean con la tabla operativa solicitada; `JEF_TALLER/TALLER` conserva flujo completo e impresión, `ANALISTA_ORD/ANALISTA` limita el panel a `VER_DETALLE/AUTORIZAR/ENVIAR/ASIGNAR_LABORATORIO/SCAN_ENTREGAR/IMPRIMIR_ETIQUETA` y `ENC_MAQUILA/ENCARGADO_MAQUILA/ENC_BISEL/ENCARGADO_BISELADO` a `VER_DETALLE/ASIGNAR/TRABAJO_TERMINADO/REGRESAR_INCIDENCIA/REGRESAR_TIENDA/SCAN_RECIBIR`.
- compat ORD panel/detalle (2026-03-30): `sp_ordenes_trabajo_panel` ahora filtra `@CLIENT` contra `CLIEN` y `NCLIENTE`; `sp_ordenes_trabajo_detalle` devuelve `PV_CTR_ORDS_DET` en secuencia `OD`, `OI`, `ADD`, y el service refuerza ese orden en la respuesta JSON.
- trazabilidad UI/Home (app, 2026-03-24): `ioe_app` agrega accesos rápidos en Home para `Enviar`, `Asignar`, `Regresar a tienda`, `Recibir` y `Entregar`; visibilidad se resuelve consumiendo `allowedActions` del panel ORDs.
- trazabilidad UI/Home (app, 2026-03-24): los accesos Home abren páginas standalone (no el panel) replicando la mecánica de validación/captura de los popups del panel; backend reutiliza los mismos endpoints.
- trazabilidad UI/Home (app, 2026-03-24): `Entregar` directa captura firma digital y usa `POST /ordenes-trabajo/:iord/entregar` por cada ORD; sin cambios backend/SQL.
- trazabilidad API/UI ORDs (2026-03-30): `OrdenesTrabajoService.getDetail` reordena `details` en memoria como defensa extra aunque SQL ya venga ordenado.
- trazabilidad API/UI ORDs (2026-04-05): para `GET /ordenes-trabajo/asignar/colaboradores`, el contrato se mantiene (`suc` por query); la corrección de sucursal para admin se implementa en frontend enviando la sucursal seleccionada del panel, sin cambios de SP.
- fix incidencia ORDs (2026-04-05): `sp_ordenes_trabajo_regresar_incidencia_lote` restituye parámetro `@TIPOM` (motivo `DAT_ORD_TMOV`) y persiste `PV_CTR_ORDS.TIPOM` en transición `9 -> 9.1`; corrige error SQL de argumentos al ejecutar `POST /ordenes-trabajo/regresar-incidencia/lote`.
- catálogo estados ORD (2026-03): `DAT_EST_ORD.ESTA` se maneja como `FLOAT`; script `sql/2026-03-22_dat_est_ord_esta_float.sql`.

