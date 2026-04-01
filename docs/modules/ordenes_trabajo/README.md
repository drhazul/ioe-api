# Ordenes de trabajo (API)

Navega a otros README/AGENTS solo cuando la tarea lo requiera.

Enlaces relacionados:
- README principal de la API: `README.md`
- AGENTS de este módulo: `docs/modules/ordenes_trabajo/AGENTS.md`
- Otros módulos: `docs/modules/base_modulos/README.md`, `docs/modules/punto_venta/README.md`, `docs/modules/core_seguridad/README.md`

## Ordenes de Trabajo (nuevo flujo 2026-03-22)

- Módulo NestJS:
  - `src/modules/ordenes-trabajo/ordenes-trabajo.module.ts`
  - `src/modules/ordenes-trabajo/ordenes-trabajo.controller.ts`
  - `src/modules/ordenes-trabajo/ordenes-trabajo.service.ts`
  - `src/modules/ordenes-trabajo/dto/*`
- Endpoints:
  - `GET /ordenes-trabajo` (panel con filtros server-side y paginación)
  - `GET /ordenes-trabajo/:iord`
  - `GET /ordenes-trabajo/:iord/detalle`
  - `POST /ordenes-trabajo/:iord/autorizar`
  - `POST /ordenes-trabajo/:iord/enviar`
  - `POST /ordenes-trabajo/:iord/recibir`
  - `POST /ordenes-trabajo/:iord/entregar`
  - `POST /ordenes-trabajo/:iord/garantia`
  - `POST /ordenes-trabajo/:iord/cambio-material`
  - `POST /ordenes-trabajo/:iord/merma`
  - `POST /ordenes-trabajo/enviar/validar`
- `POST /ordenes-trabajo/enviar/lote`
- `GET /ordenes-trabajo/asignar/colaboradores`
- `POST /ordenes-trabajo/asignar/validar`
- `POST /ordenes-trabajo/asignar/lote`
- `POST /ordenes-trabajo/trabajo-terminado/validar`
- `POST /ordenes-trabajo/trabajo-terminado/lote`
- `POST /ordenes-trabajo/regresar-incidencia/validar`
- `POST /ordenes-trabajo/regresar-incidencia/lote` (`tipom` requerido desde catálogo `DAT_ORD_TMOV`)
- `POST /ordenes-trabajo/regresar-tienda/validar`
- `POST /ordenes-trabajo/regresar-tienda/lote`
- `POST /ordenes-trabajo/asignar-laboratorio/lote`
  - `POST /ordenes-trabajo/recibir/validar`
  - `POST /ordenes-trabajo/recibir/lote`
  - `POST /ordenes-trabajo/entregar/validar`
  - `POST /ordenes-trabajo/entregar/lote`
  - `POST /ordenes-trabajo/scan/recibir`
- `POST /ordenes-trabajo/scan/entregar`
- SPs base (`sql/2026-03-22_ordenes_trabajo_module_create.sql`):
  - `sp_ordenes_trabajo_panel`, `sp_ordenes_trabajo_detalle`, `sp_ordenes_trabajo_set_estado`
  - `sp_ordenes_trabajo_autorizar|enviar|recibir|entregar|garantia`
- detalle ORD/roles (2026-03-30): `POST /ordenes-trabajo/:iord/detalle/guardar` acepta `tipo` (`TALLADO`/`BISELADO`) y actualiza `PV_CTR_ORDS.TIPO`; solo `admin`, `JEF_TALLER`, `ANALISTA_ORD` y `ANALISTA` pueden cambiarlo o recibir `IMPRIMIR_ETIQUETA` en acciones permitidas.
  - `sp_ordenes_trabajo_cambio_material`, `sp_ordenes_trabajo_merma`
  - `sp_ordenes_trabajo_scan_recibir`, `sp_ordenes_trabajo_scan_entregar`
  - helpers: `sp_ordenes_trabajo_clone_ord`, `sp_ordenes_trabajo_registrar_mb51`, `sp_ordenes_trabajo_registrar_ctrl_ctas_diff`
- Reglas clave:
  - `IORD` mantiene identidad de orden y `IDFOL` no se rompe.
  - cambio material crea nueva ORD, cancela original, copia `PV_CTR_ORDS_DET`, registra MB51 y diferencia contable cuando aplica.
  - merma registra trazabilidad de cantidad mermada/remanente y puede crear ORD derivada según payload.
  - selección/escaneo se resuelven en API y no dependen de flags legacy (`SEL`, `selCtrlOrd`, `selCtrOrdT`, `selEnt`).
  - `enviar/lote` exige que cada ORD del lote esté en `ESTSEGU=3 (NUEVA AUTORIZADA)` y, al confirmar, aplica transición masiva a `ESTSEGU=5 (ENTREGADA A MAQ O BISEL)` respetando alcance por sucursal.
  - `recibir/lote` exige `ESTSEGU=5 (ENTREGADA A MAQ O BISEL)` y aplica transición masiva a `ESTSEGU=7 (RECIBIDA A TALLER)`.
  - `entregar/lote` exige `ESTSEGU=10 (REGRESADO A TIENDA)` y aplica transición masiva a `ESTSEGU=11 (ENTREGADA A CLIENTE)`.
  - `regresar-incidencia/lote` valida `ESTSEGU=9`, exige un motivo válido de `DAT_ORD_TMOV.IDT` y persiste `PV_CTR_ORDS.TIPOM` antes de mover la ORD a flujo `9.1`.
  - el panel resuelve `ASIGNADO` como etiqueta legible de `PV_OPV` (`NOMB + APELM + APELP`) y mantiene `ASIGN_ID` como valor crudo para filtros/acciones.
  - recepción unificada: se elimina destino (`TALLER/ANALISTA`) y backend fija recepción operativa a `ESTSEGU=7`.
  - permisos de recepción (`RECIBIR` y `SCAN_RECIBIR`) solo para `ENC_MAQUILA/ENCARGADO_MAQUILA/ENC_BISEL/ENCARGADO_BISELADO` y `JEF_TALLER` (admin conserva acceso total).
  - trazabilidad UI (app): en modal de envío se elimina botón `Agregar ORD`; la captura manual agrega por `Enter` en el `TextField` `ORD`.
  - trazabilidad UI taller (app, 2026-03-24): botonera del panel se mueve al popup `Opciones de Trabajo`; `Configuracion de Vista` va al AppBar; etiqueta legacy `76mm x 51mm`; sin cambios de endpoints.
  - trazabilidad UI taller (app, 2026-03-24): AppBar usa botones con fondo blanco; paginación se alinea en franja de filtros; sin impacto en API/SP.
  - permisos visibles ORD (2026-03-24): `resolveAllowedActions` mantiene matriz de roles; `JEF_TALLER/TALLER` flujo completo + impresión, `ANALISTA_ORD/ANALISTA` limitado a `VER_DETALLE/AUTORIZAR/ENVIAR/ASIGNAR_LABORATORIO/SCAN_ENTREGAR/IMPRIMIR_ETIQUETA`, `ENC_MAQUILA/ENCARGADO_MAQUILA/ENC_BISEL/ENCARGADO_BISELADO` limitado a `VER_DETALLE/ASIGNAR/TRABAJO_TERMINADO/REGRESAR_INCIDENCIA/REGRESAR_TIENDA/SCAN_RECIBIR`.
  - trazabilidad UI/Home (app, 2026-03-24): `ioe_app` agrega accesos directos desde Home para `Enviar`, `Asignar`, `Regresar a tienda`, `Recibir` y `Entregar`; backend reutiliza `allowedActions` de `GET /ordenes-trabajo`.
  - compatibilidad catálogo estados (2026-03): `DAT_EST_ORD.ESTA` se maneja como `FLOAT` (script `sql/2026-03-22_dat_est_ord_esta_float.sql`) para soportar estados intermedios (p. ej. `9.1`).

