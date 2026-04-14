# Punto de venta (AGENTS API)

Navega a otros README/AGENTS solo cuando sea necesario.

Enlaces relacionados:
- AGENTS principal de la API: `AGENTS.md`
- README de este módulo: `docs/modules/punto_venta/README.md`
- Otros AGENTS: `docs/modules/base_modulos/AGENTS.md`, `docs/modules/core_seguridad/AGENTS.md`, `docs/modules/ordenes_trabajo/AGENTS.md`

## Facturación: edición fiscal de cliente (2026-04-06)
- `PATCH /factclientshp/:id` no debe cambiar `SUC` en updates de datos fiscales.
- El backend ignora reasignación de sucursal en update (sin trigger de reversa, para permitir cambios manuales controlados en BD).

## Punto de venta: cierre transaccional de cotizacion (implementado)
- Controller/Service:
- `src/modules/pvctrfolasvr/pv-cotizaciones-cierre.controller.ts`
- `src/modules/pvctrfolasvr/pv-cotizaciones-cierre.service.ts`
- `src/modules/refdetalle/pv-refdetalle.controller.ts`
- `src/modules/refdetalle/refdetalle.service.ts`
- Endpoints:
- `GET /pv/cotizaciones/:idfol/cierre/context`
- `POST /pv/cotizaciones/:idfol/cierre/preview`
- `GET /pv/cotizaciones/:idfol/cierre/print-preview`
- `POST /pv/cotizaciones/:idfol/cierre`
- `GET /dat-form` (lista de formas; `?includeInactive=true` opcional para incluir inactivas)
- `GET /dat-form/:idform`
- `POST /dat-form`
- `PATCH /dat-form/:idform`
- `PATCH /dat-form/:idform/estado`
- `DELETE /dat-form/:idform`
- `GET /pv/refdetalle?idfol=:idfol&tipo=:tipo`
- `POST /pv/refdetalle/crear`
- `POST /pv/refdetalle/asignar`
- `DELETE /pv/refdetalle/:idref`
- Reglas e integracion UI:
- app mueve UI a `lib/features/modulos/punto_venta/cotizaciones/pago/*` y oculta tarjeta de contexto.
- `CA` lista `EFECTIVO`/`CREDITO`; `aut`+`Generar/Asignar referencia` solo para `TARJETA/CHEQUE/TRANSFERENCIA/DEPOSITO 3RO`.
- referencias se crean/asignan en `REF_DETALLE` y regresan `IDREF` al pago.
- app bloquea cambio de `tipotran` cuando ya hay formas; `RQFAC` en AppBar; totales en card único; oculta `IVA integrado sucursal`; recalcula preview al reingresar.
- app persiste `RQFAC` con `PATCH /pvctrfolasvr/:idfol`; habilita `Imprimir ticket` consumiendo `GET /pv/cotizaciones/:idfol/cierre/print-preview`.
- vouchers para formas no `EFECTIVO` en PDF (segundo PDF, línea de recorte, `GRACIAS POR SU CONFIANZA`).
- prevalidacion de referencias sin usar en frontend con `GET /pv/refdetalle`; backend mantiene validacion.
- cierre `CA` fuerza `rqfac=false` y `REQF=0` antes de preview.
- en `PAGADO`, app usa `PATCH /pvctrfolasvr/:idfol` para pasar a `MB51PROCES`.
- Panel lista `PENDIENTE/EDITANDO/PAGADO`; `MB51PROCES` se usa solo en salida.
- Panel seguridad (2026-04-01): para usuarios no admin, las consultas cruzadas por OPV (4 dígitos) aceptan `opv` distinto al usuario y devuelven solo folios de la misma `SUC` con `AUT='CP'` y `ESTA='PENDIENTE'`, comparando `OPV/OPVM` sin responder 403.
- SP y transaccion:
- `POST /pv/cotizaciones/:idfol/cierre` ejecuta `dbo.sp_pv_cotizacion_cerrar`; si falta, responder `409` e instalar `sql/sp_pv_cotizacion_cerrar_create.sql`.
- `sp_pv_next_visible_folio` reserva folio visible `CP/CA/VF` (`SUC-YYYYMMDD-TIPO-####`).
- `sp_pvctrfolasvr_create` crea folio inicial `CP` y fija `IDFOLINICIAL`.
- service no envuelve en transaccion TypeORM para evitar `EABORT`; atomicidad en SP.
- errores de validacion SQL retornan `400/409` (mensaje negocio).
- inserta formas en `PV_CTR_FOL_FORM_SVR` (fallback `PV_CTR_FOL_FORM`); `CREDITO/DEUDOR` guarda `AUT=IDFOL` y `IMPP>0`; `IMPD` = `IMPP-IMPC` (en no-efectivo coincide con `IMPP`).
- `CREDITO` no se mezcla con otras formas; valida saldo neto `DAT_CTRL_CTAS` (`CTA='101001002'`) y registra cargo (`CMOV=602`, `CTA='101001002'`, `CLIENT`, `IDFOL`, `NDOC`, `IMPT` negativo).
- compatibilidad columnas: usa `CMOV` o `CLSD`; llena `FCND/RTXT` si existen.
- genera `NDOC` en transacción (lock + max), base `N6000001+`, usando `COL_LENGTH` para evitar errores cuando la columna falta.
- valida suma de formas (`sum(impp)` <= total salvo efectivo con cambio) y referencias `REF_DETALLE.ESTATUS='PROCESADO'` usadas.
- actualiza `PV_CTR_FOL_ASVR` (`ESTA='PAGADO'`, `IMPT`, `AUT='CA'|'VF'`), `PV_CTR_ORDS.ESTATUS=2`, sincroniza `PV_CTR_ORDS.RQFAC` con `REQF/RQFAC` del folio y ejecuta `dbo.sp_mb51_transmitir_folio` para stock MB51.
- compatibilidad de homologación MB51 (2026-04): si existe trigger legacy que transforma `MB51PROCES` a `TRANSMITIR`, aplicar `sql/2026-04-03_mb51proceso_homologacion.sql` para conservar `MB51PROCES` en salida operativa.
- sincronización VF: `sp_fact_sync_folio_vf` en transacción cuando `tipotran='VF'` y `REQF=1`; si no cumple, limpia cabecera/detalle en `FAC_SVR_SHAP/FACT_TICKET_SHP`.
- `Tipofact='CREDITO'` si alguna forma `CREDITO`; de lo contrario `INDIVIDUAL`.
- fecha de proceso actual para `PV_CTR_FOL_FORM(_SVR).FCN`, `PV_CTR_FOL_ASVR.FCNM`, cargos `DAT_CTRL_CTAS`.
- Reimpresión: payload `print-preview` incluye cabecera (`DAT_SUC`), ticket (`PV_TICKET_LOG`), formas (`PV_CTR_FOL_FORM`), pie (`PV_CTR_FOL_ASVR` + `PV_OPV` + `FACT_CLIENT_SHP`) y ORDs (`PV_CTR_ORDS` + `PV_CTR_ORDS_DET`).

## Punto de venta: devoluciones de cotizacion/venta/apartado (implementado 2026-02)
- Modulo NestJS:
- `src/modules/pv-devoluciones/pv-devoluciones.module.ts`
- `src/modules/pv-devoluciones/pv-devoluciones.controller.ts`
- `src/modules/pv-devoluciones/pv-devoluciones.service.ts`
- `src/modules/pv-devoluciones/dto/*`
- Endpoints:
- `GET /pv/devoluciones`
- `POST /pv/devoluciones/crear`
- `GET /pv/devoluciones/:idfolDev/detalle`
- `POST /pv/devoluciones/:idfolDev/devolver-todo`
- `PATCH /pv/devoluciones/:idfolDev/lineas/:lineId`
- `POST /pv/devoluciones/:idfolDev/detalle/preparar`
- `POST /pv/devoluciones/:idfolDev/pago/preview`
- `POST /pv/devoluciones/:idfolDev/pago/finalizar`
- `GET /pv/devoluciones/:idfolDev/print-preview`

## Pago de Servicios PS (implementado 2026-03)
- Modulo backend:
- `src/modules/pagos-servicios/pagos-servicios.module.ts`
- `src/modules/pagos-servicios/pagos-servicios.controller.ts`
- `src/modules/pagos-servicios/pagos-servicios.service.ts`
- `src/modules/pagos-servicios/dto/*`
- Script SQL:
- `sql/sp_ps_module_create.sql` (catalogos `PV_DAT_PS` y `DAT_REF_GTO` + SPs `sp_ps_*`).
- `sql/2026-04-03_ps_cerrado_ps_estado.sql` (agrega `CERRADO_PS` a homologación/check y migra cierres PS legacy en `TRANSMITIR`).
- Endpoints:
- `GET /ps/folios?suc&esta&search`
- `POST /ps/folios`
- `GET /ps/folios/:idFol`
- `POST /ps/folios/:idFol/ticket/service`
- `GET /ps/clientes/:client/adeudos`
- `GET /ps/clientes/:client/adeudos/:idFol/detalle`
- `POST /ps/folios/:idFol/ticket/reference/folio`
- `POST /ps/folios/:idFol/ticket/reference/gasto`
- `PUT /ps/folios/:idFol/ticket/pvta`
- `DELETE /ps/folios/:idFol/ticket/line`
- `POST /ps/folios/:idFol/procesar`
- `POST /ps/folios/:idFol/formas-pago`
- `DELETE /ps/folios/:idFol/formas-pago/:idF`
- `GET /ps/folios/:idFol/formas-pago/summary`
- `POST /ps/folios/:idFol/finalizar`
- `PATCH /pvctrfolasvr/:idfol` (usado por UI PS para salida/cambio de estado en `PV_CTR_FOL_ASVR`)
- Reglas clave:
- ticket inserta servicio con `PVTA=NULL`; `PUT /ticket/pvta` valida referencia/adeudo con fuente `DAT_CTRL_CTAS`.
- `sp_ps_adeudos_cliente` agrupa adeudos por `CLIENT/IDFOL` (`SUM(IMPT) <> 0`).
- `DG/DC` conserva `IMPT` negativo sin formas automáticas.
- mutaciones registran `AUDIT_LOG` (`MODULO='pago-servicios'`).
- cierre final usa `sp_ps_pago_finalize` (inserta `PV_CTR_FOL_FORM`, genera `DAT_CTRL_CTAS`, actualiza `ESTA='PAGADO'`).
- fecha de cierre se toma del sistema para `PV_CTR_FOL_FORM.FCN`, `PV_CTR_FOL_ASVR.FCNM` y movimientos `DAT_CTRL_CTAS`.
- `CLSD` se resuelve con `DAT_CMOV.CMOV` (`RELACION=<UPC servicio>`, `TIPO='ABONO'`); sin mapeo se rechaza.
- app mantiene formas en local hasta finalizar; botonería `Finalizar`/`Imprimir` en ancho completo.
- formas no `EFECTIVO` requieren referencia/aut y no pueden exceder faltante; candado al quedar `PAGADO` lleva a `CERRADO_PS` vía `PATCH /pvctrfolasvr/:idfol`.
- compatibilidad PS (2026-04): backend/UI aceptan `TRANSMITIR` como estado cerrado legacy para folios históricos, pero el cierre operativo vigente de PS usa `CERRADO_PS`.
- impresión PS: vouchers por forma no `EFECTIVO`, segundo PDF, línea de recorte `RESUMEN DE ORDS` / `ORDS`.
- Panel PS: folios `PAGADO` abren directo pago.
- Validaciones núcleo (clave para devoluciones también): alta exige supervisor `SUPERPV` (401/403), creación fallback con `sp_getapplock` ante `PK_CTR_FOL`, bloqueo facturación `ESTATUS='FACTURADO'`, bloqueo ORD configurable `PV_DEV_ORD_BLOCK_THRESHOLD`, staging `PV_DEV_DET_TMP`, preparación inserta solo `CTDD>0`, previsualización usa IVA/REQF de origen, pago reutiliza formas origen y exige misma forma para no `CREDITO/DEUDOR`, sincroniza facturación con `sp_fact_sync_folio_vf`, limpia cabeceras DVF residuales y ejecuta `sp_mb51_transmitir_folio` al finalizar.

## Punto de venta: alta de cotizacion desde panel (trazabilidad app)
- Flujo frontend: confirmacion de alta -> modal de cliente filtrado por SUC.
- `GET /factclientshp?suc=<SUC>` lista clientes por la sucursal activa del panel; para admin multi-sucursal no debe limitar por `user.suc` (usa reglas `isAdmin` `ADMIN_ROLE_IDS/ADMIN_NIVELES`).
- `POST /pvctrfolasvr/auto` crea folio `CP`; para admin permite recibir `SUC/OPV` explícitos del panel y para no-admin valida que no puedan operar fuera de su contexto JWT.
- `PATCH /pvctrfolasvr/:idfol` asigna `CLIEN`.
- `PV_CTR_FOL_ASVR.CLIEN` y `FAC_SVR_SHAP.CLIEN` se mapearon a `FLOAT` para soportar IDs grandes (> int32) y evitar `EPARAM`.
- Contrato API compatible hacia atrás: `POST /pvctrfolasvr/auto` mantiene payload previo y agrega `SUC/OPV` opcionales.

## Estado de Cajón OPV (implementado 2026-03)
- Módulo NestJS:
  - `src/modules/cajon-estado/cajon-estado.module.ts`
  - `src/modules/cajon-estado/cajon-estado.controller.ts`
  - `src/modules/cajon-estado/cajon-estado.service.ts`
  - `src/modules/cajon-estado/dto/*`
  - `src/modules/cajon-estado/guards/cajon-estado-supervisor.guard.ts`
  - `src/modules/cajon-estado/cajon-estado-session.store.ts`
- Reglas:
  - `IMPT`: suma `PV_CTR_FOL_FORM.IMPD` por `IDFOL` relacionado, filtrando solo por `PV_CTR_FOL_ASVR.OPVM` y rango diario de `PV_CTR_FOL_ASVR.FCNM`.
  - `IMPR`: suma `DAT_RET_DET_SVR.IMPF` por forma, filtrando `DAT_RET_CTR_SVR.ESTA='FINALIZADO'` y rango diario de `FCNR`.
  - `IMPE`: `NULL` (pendiente Entrega a CG).
  - `DIFD`: `IMPT - IMPR - ISNULL(IMPE,0)`.
  - la autorización no expira por tiempo en API; app obliga reautorización al reingresar.
- Auditoría:
  - `POST /cajon-estado/autorizar` registra `ACTION='POST'`, `MODULO='cajon_estado'`, `ENTIDAD='autorizar'`.
  - `GET /cajon-estado/resumen` registra `ACTION='GET'`, `MODULO='cajon_estado'`, `ENTIDAD='resumen'`.

