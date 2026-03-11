# IOE API

Backend del sistema IOE, construido con NestJS + TypeORM sobre MSSQL.
Expone autenticacion JWT, administracion de accesos, maestros, inventarios,
control de cuentas y punto de venta.

## Planteamiento funcional

- Proveer una API central para frontend `ioe_app`.
- Mantener reglas de autorizacion por rol y por sucursal en backend.
- Operar procesos de negocio con consultas SQL y stored procedures donde aplica.
- Auditar operaciones de escritura para trazabilidad.

## Arquitectura

- Arquitectura modular por feature en `src/modules`.
- Patron: `controller -> service -> dto/entity`.
- Validacion global `ValidationPipe` (`whitelist`, `transform`, `forbidNonWhitelisted`).
- Seguridad global:
- `RolesGuard` (`APP_GUARD`).
- `AuditInterceptor` (`APP_INTERCEPTOR`).
- Swagger habilitado en `/docs`.

## Estructura del proyecto

- `src/main.ts`: bootstrap, CORS, Swagger, pipes globales.
- `src/app.module.ts`: registro de modulos.
- `src/config/database.module.ts`: TypeORM + MSSQL.
- `src/config/env.validation.ts`: validacion de variables de entorno con Joi.
- `src/common/`: guards, decorators, interceptors comunes.
- `src/modules/`: modulos de dominio.
- `test/`: pruebas e2e.
- `dist/`: build output (no editar).

## Conexion a base de datos

- Driver: `mssql` via TypeORM.
- Config relevante (`database.module.ts`):
- `autoLoadEntities: true`
- `synchronize: false`
- `logging: false`
- `trustServerCertificate: true`
- `encrypt: false`
- Pool:
- `max: 20`
- `acquireTimeoutMillis: 60000`
- `requestTimeout: 120000`

## Variables de entorno

Requeridas:

- `DB_HOST`
- `DB_USER`
- `DB_PASS`
- `DB_NAME`
- `JWT_SECRET`

Opcionales:

- `PORT` (default `3001`)
- `DB_PORT` (default `1433`)
- `DB_SCHEMA` (default `dbo`)
- `JWT_EXPIRES_IN` (default `15m`)
- `REFRESH_EXPIRES_DAYS` (default `30`)
- `CORS_ORIGINS`
- `ADMIN_ROLE_IDS`, `ADMIN_ROLE_ID`, `ADMIN_NIVELES`, `ADMIN_NIVEL`
- `PV_DEV_ORD_BLOCK_THRESHOLD` (default `5`, regla bloqueante ORD en devoluciones PV)

## Modulos y endpoints principales

- Salud:
- `/health`, `/health/db`
- Seguridad:
- `/auth/login`, `/auth/refresh`, `/auth/change-password`, `/auth/logout-all`
- `/me/profile`, `/me/front-menu`, `/me/datmodulos`, `/me/backend-perms`
- Maestros:
- `/roles`, `/deptos`, `/puestos`, `/users`, `/dat-suc`, `/datmodulos`
- Validacion relevante: `/users` exige `USERNAME` con minimo 3 caracteres.
- Alta usuarios (2026-03): si `PASSWORD` no se envía, backend genera una contraseña temporal aleatoria de 6 dígitos y marca `FORZAR_CAMBIO_PASS=1` para primer acceso.
- Primer acceso (2026-03): login emite claim JWT `mustChangePassword` y el endpoint autenticado `POST /auth/change-password` permite actualizar contraseña y limpiar `FORZAR_CAMBIO_PASS=0`.
- Accesos:
- `/access/modulos`, `/access/grupos-modulo`, `/access/roles/:id/permisos-backend`
- `/access/mod-front`, `/access/grupos-front`, `/access/roles/:id/enrolamientos-front`
- `/usr-mod-suc`
- Catalogos:
- `/datart`, `/datcatreg`, `/datcatuso`, `/dat-almacen`, `/dat-cmov`
- Trazabilidad frontend (2026-03): `ioe_app` incorporó impresión de etiquetas en catálogo `DAT_ART` con selección local por renglón/filtrados y vista previa de impresión (PDF `76mm x 56mm`, una etiqueta por artículo), sin endpoints nuevos en API.
- Regla EAN13 aplicada en app: de `UPC` se toman los 12 dígitos derechos (si excede) y se calcula dígito verificador para render de código de barras.
- `/dat-form` (CRUD de catalogo de formas de pago sobre `DAT_FORM`)
- Inventarios:
- `/conteos/*`, `/capturas/*`, `/datcontctrl`, `/datdetsvr`, `/datmb51`, `/dat-mb51/search`, `/dat-mb52/resumen`
- Control de cuentas:
- `/cat-ctas/*`, `/ctrl-ctas/config`, `/ctrl-ctas/catalog/*`, `/ctrl-ctas/consulta/*`
- Compatibilidad histórica (2026-03): en `POST /ctrl-ctas/consulta/*`, API ejecuta SQL directo para estos reportes, normaliza rango `FCND` (completa faltantes con `1900-01-01` y `2100-12-31`) e incluye filas legacy con `SUC` nulo/vacío cuando hay filtro por sucursal.
- Nota de integracion UI: la condicion para habilitar exportacion Excel en `Resumen por Deudor` (CTA unica o CLIENT seleccionado) se resuelve en frontend y no requiere cambios de API.
- Nota de integracion UI: cuando hay CTA unica y no hay CLIENT seleccionado, frontend exporta `resumen-transaccion` y `detalle` para todos los CLIENT de esa consulta (consulta `detalle` por cliente en bloques de `idfols`), sin cambios de contrato.
- Nota de integracion UI: el progreso de exportacion se maneja en un modal del frontend; no requiere cambios en API.
- Nota de integracion UI: el filtro `!= 0` inicia desactivado por defecto en la pantalla de resumen para mostrar todos los registros (comportamiento solo frontend; el usuario puede activarlo manualmente).
- Punto de venta:
- `/factclientshp`, `/pvctrfolasvr`, `/pvctrfolform`, `/pvctrords`, `/pvctrordsdet`, `/pvticketlog`, `/refdetalle`
- Nota integración UI clientes (2026-03): en alta desde `ioe_app`, el modal puede enviar defaults `RFCEMISOR='SELECCIONAR'`, `USOCFDI='SELECCIONAR'`, `REGIMENFISCALRECEPTOR=0` (sentinela numérico) y `EMAILRECEPTOR='COLOCAR'`; el backend mantiene validación actual (no vacío/numérica) sin cambio de endpoint.
- `GET /pvctrfolasvr` (optimizacion 2026-03) acepta `suc`, `opv`, `search` para listar cotizaciones de panel con filtro backend por `ESTA IN ('PENDIENTE','EDITANDO','PAGADO')` y busqueda por `IDFOL`/`IDFOLINICIAL`/cliente.
- compatibilidad (2026-03): el query DTO del listado de cotizaciones acepta `_` opcional como cache-buster legacy para no rechazar clientes antiguos con `400`.
- `GET /pvctrfolasvr` (2026-03): la respuesta del listado incluye `RazonSocialReceptor` (join con `FACT_CLIENT_SHP`) para soporte de grilla en frontend.
- `GET /pvctrfolasvr/:idfol` (2026-03): devuelve vista de lectura con `RazonSocialReceptor` y resuelve por `IDFOL` actual o `IDFOLINICIAL` para compatibilidad cuando el folio visible cambia de `CP` a `CA/VF`.
- trazabilidad UI cotizaciones (2026-03-10): cuando `search` se interpreta como OPV, frontend habilita búsqueda cruzada de otros OPV solo para folios con `AUT='CP'` y `ESTA='PENDIENTE'`.
- trazabilidad UI paneles (2026-03-10): cotizaciones/devoluciones/PS usan anulación lógica con `PATCH /pvctrfolasvr/:idfol` (`ESTA='ANULADO'`) en lugar de eliminación física, habilitado solo para estado `PENDIENTE`.
- `/pv/devoluciones/*` (flujo de devoluciones de cotizaciones/ventas/apartados)
- `/ps/*` (modulo Pago de Servicios: panel, ticket, referencias, pago/finalizacion y terminar)
- `/retiros/*` (flujo de retiros parciales de caja)
- `/catalogos/formas-retiro` (formas de pago para retiros desde `VW_PV_FORM_TIPOTRAN_DISTINCT`)
- `/cajon-estado/*` (autorización supervisor + resumen diario de estado de cajón OPV)
- `/pv/refdetalle` (flujo PV de creacion/asignacion/eliminacion de referencias por folio)
- `/pvticketlog/:id/precio` (edicion de `PVTA` con control de autorizacion `SUPERPV`)
- `/dat-form` (GET lista, POST crea; por defecto lista solo activas, opcional `includeInactive=true`)
- `/dat-form/:idform` (GET detalle, PATCH actualiza, DELETE elimina)
- `/dat-form/:idform/estado` (PATCH para activar/inactivar forma de pago)
- Clasificadores:
- `/jrqdepa`, `/jrqsubd`, `/jrqclas`, `/jrqscla`, `/jrqscla2`, `/jrqguia`

## Pago de Servicios PS (nuevo flujo 2026-03)

- Modulo NestJS:
- `src/modules/pagos-servicios/pagos-servicios.module.ts`
- `src/modules/pagos-servicios/pagos-servicios.controller.ts`
- `src/modules/pagos-servicios/pagos-servicios.service.ts`
- `src/modules/pagos-servicios/dto/*`
- Script SQL:
- `sql/sp_ps_module_create.sql` (crea/siembra `PV_DAT_PS`, `DAT_REF_GTO` y SPs `sp_ps_*`).
- Endpoints:
- `GET /ps/folios?suc&esta&search`
- `POST /ps/folios`
- `GET /ps/folios/:idFol`
- `PUT /ps/folios/:idFol/cliente`
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
- `PATCH /pvctrfolasvr/:idfol` (consumido por UI PS para cambio de estado/salida del folio)
- Reglas de negocio relevantes:
- el ticket PS se inserta con `PVTA` nulo y su captura se realiza después de asignar referencia.
- el cliente del folio PS se cambia por `PUT /ps/folios/:idFol/cliente` y se bloquea cuando el ticket (`PV_TICKET_LOG`) ya tiene líneas.
- edición de PVTA valida referencia (`ORD`) y límite de adeudo usando la misma fuente de adeudos de cliente (`DAT_CTRL_CTAS` + relación de `DAT_CAT_CTAS`), considerando el saldo disponible de la referencia en el ticket.
- `sp_ps_adeudos_cliente` resume adeudos de `DAT_CTRL_CTAS` agrupados por `CLIENT, IDFOL` con filtro `SUM(IMPT) <> 0` (alineado al query operativo de Access).
- al procesar tipo `DG/DC`, el folio guarda `IMPT` negativo pero no inserta formas de pago automáticas.
- todas las mutaciones del módulo registran `AUDIT_LOG` (`MODULO='pago-servicios'`).
- trazabilidad UI (app, 2026-03): en `/ps/:idFol/pago` el alta/eliminación de formas se mantiene en appstate local; no hay inserción DB hasta `POST /ps/folios/:idFol/finalizar`.
- trazabilidad UI (app, 2026-03): el modal PS de formas excluye `CREDITO` y `DEUDOR`; para formas no `EFECTIVO`, el valor `aut` se asigna reutilizando `ref_detalle_page.dart` de cotizaciones y queda en campo de solo lectura.
- trazabilidad UI (app, 2026-03): una forma distinta de `EFECTIVO` no puede superar el restante por pagar (`total - pagado`) antes de finalizar.
- trazabilidad UI (app, 2026-03): en detalle PS, `Procesar servicio` se movió al AppBar.
- trazabilidad UI (app, 2026-03): en detalle PS, servicios AD/AP/CR requieren cliente seleccionado (CLIEN != 1) y, si ESTA IN ('PAGADO','TRANSMITIR'), el body queda bloqueado y solo queda disponible la navegación de salida.
- trazabilidad API (2026-03): `sp_ps_ticket_add_service` y capa Nest validan `AD/AP/CR` con cliente (`CLIEN > 1`) y devuelven `Seleccione Cliente` si no se cumple.
- trazabilidad API/UI (2026-03): `GET /ps/clientes/:client/adeudos/:idFol/detalle` devuelve todos los registros `DAT_CTRL_CTAS` del folio para mostrarlos en popup tabular desde detalle PS.
- trazabilidad UI (app, 2026-03): en pago PS, AppBar usa flecha mientras `ESTA != PAGADO`; en `PAGADO` cambia a candado para salida a `TRANSMITIR`. En panel PS, filas `PAGADO` navegan directo a `/ps/:idFol/pago`.
- trazabilidad UI (app, 2026-03): en impresión de ticket PS, si existen formas no `EFECTIVO`, la app agrega al final voucher `SOPORTE RECEPCION PAGO` por cada forma no efectivo usando datos de `FORMAS_JSON`, totales y contexto del folio.
- trazabilidad UI (app, 2026-03): el voucher PS incluye espacio en blanco para firma y renglón `Firma cliente` después de `FCN`.
- trazabilidad UI (app, 2026-03): en PS, el voucher se imprime en un segundo PDF; al cerrar la vista previa del ticket principal, la app solicita confirmación y luego abre la vista previa del voucher.
- trazabilidad UI (app, 2026-03): se agrega línea de recorte entre `RESUMEN DE ORDS` y `ORDS`; `GRACIAS POR SU CONFIANZA` se imprime después de `RESUMEN DE ORDS` y antes del recorte hacia `ORDS`.
- trazabilidad UI (app, 2026-03): el ticket PS se homologó al formato de cotizaciones con bloques `DETALLE`, `TOTALES`, `FORMAS`, `TRANSACCION`, `RESUMEN DE ORDS`, `ORDS` (barcode `CODE39` + tabla `JOB/ESF/CIL/EJE`) y vouchers por forma no `EFECTIVO`.
- `sp_ps_pago_finalize`: toma lote JSON de formas, inserta `PV_CTR_FOL_FORM` (`IMPP/IMPC/IMPD/AUT`), registra movimientos por línea en `DAT_CTRL_CTAS` y actualiza `PV_CTR_FOL_ASVR.ESTA='PAGADO'`.
- política de fecha de finalización PS (2026-03): el cierre usa una fecha de proceso actual para `PV_CTR_FOL_FORM.FCN`, `PV_CTR_FOL_ASVR.FCNM` y fechas de movimientos en `DAT_CTRL_CTAS`.
- `sp_ps_pago_finalize`: `DAT_CTRL_CTAS.CLSD` se resuelve con `DAT_CMOV.CMOV` filtrando `RELACION=<UPC servicio>` y `TIPO='ABONO'` (si no existe mapeo, devuelve error y revierte transacción).
- el script PS crea/siembra `PV_TIPO_ESTA` (incluye `RELACION` para AD/AP/CR/DC/DG) para evitar error `Invalid object name 'dbo.PV_TIPO_ESTA'.`
- `sp_ps_adeudos_cliente` usa `@CLIENT BIGINT` y compara `TRY_CONVERT(BIGINT, CLIENT)` para IDs grandes de cliente.
- `sp_ps_adeudos_cliente` prioriza `DAT_CTRL_CTAS` agregando por `SUC/CLIENT/CTA/IDFOL` (alineado al query histórico de Access); `adeudosRes` se deriva de ese conjunto con `ADEUDO < 0`.
- Referencia de error corregido (2026-03-03): `POST /ps/folios/:idFol/ticket/reference/folio` devolvía `400` con `No existe DAT_CTRL_CTAS_RES para validar referencia de folio`; `sp_ps_ticket_set_reference_folio` se depuró para tomar/validar la referencia desde `DAT_CTRL_CTAS` del cliente seleccionado.
- Regla vigente (2026-03-03): `POST /ps/folios/:idFol/ticket/reference/folio` bloquea referencias duplicadas en el mismo ticket (`La referencia ya fue asignada a otra linea del ticket`).
- Corrección de cálculo (2026-03-03): `sp_ps_ticket_set_reference_folio` y `sp_ps_ticket_update_pvta` consolidan adeudo por `IDFOL/NDOC + RELACION` antes de validar; con esto se evita falso `400 La referencia seleccionada no tiene adeudo pendiente` cuando existen cargos y abonos mezclados en `DAT_CTRL_CTAS`.
- Regla AD/AP/CR (2026-03-03): en `sp_ps_ticket_update_pvta`, para servicios de adeudo (`AD`,`AP`,`CR`) el `PVTA` por línea no puede exceder la deuda del folio referenciado y además se valida saldo acumulado por `ORD` considerando las tres claves (`AD/AP/CR`) del mismo ticket.
- Referencia de integración (2026-03-03): el cierre PS dejó de depender de `PV_CTR_FOL_FORMTMP`; el flujo definitivo persiste en `PV_CTR_FOL_FORM` al finalizar.
- Tabla ticket oficial PS: `PV_TICKET_LOG` (no `PV_TICKET_LOG_SVR`).
- Referencia de error corregido (2026-03-03): `GET /ps/folios/:idFol` devolvía `400` con `Invalid object name 'dbo.PV_TICKET_LOG_SVR'.`; se normalizó SQL/SPs/auditoría para usar `dbo.PV_TICKET_LOG`.

## Retiros parciales (nuevo flujo 2026-03)

- Modulo NestJS:
- `src/modules/retiros/retiros.module.ts`
- `src/modules/retiros/retiros.controller.ts`
- `src/modules/retiros/retiros-catalogos.controller.ts`
- `src/modules/retiros/retiros.service.ts`
- `src/modules/retiros/dto/*`
- Script SQL:
- `sql/sp_retiros_module_create.sql`
- Entidades/tablas de negocio:
- `DAT_RET_CTR_SVR` (cabecera: `IDRET`, `TER`, `OPV`, `FCNR`, `IMPR`, `ESTA`)
- `DAT_RET_DET_SVR` (detalle de formas: `ID`, `IDRET`, `FORMA`, `IMPF`)
- `DAT_RET_DET_EFEC_SVR` (denominaciones efectivo: `ID`, `IDFOR`, `DENO`, `CTDA`, `TOTAL`)
- View de formas:
- `VW_PV_FORM_TIPOTRAN_DISTINCT` (deduplica `PV_FORM_TIPOTRAN` usando `MIN(BLOQ)` por `FORM+TIPOTRAN`)
- Endpoints:
- `POST /retiros` (crea retiro con `ESTA='ABIERTO'`, `OPV`/`TER` de sesión)
- `GET /retiros/today` (lista retiros del día por `OPV`)
- `GET /retiros/:idret` (cabecera + detalles + efectivo consolidado)
- `POST /retiros/:idret/detalles` (agrega forma; `EFECTIVO` inicializa denominaciones)
- `PUT /retiros/detalles/:idfor/efectivo` (actualiza denominaciones single o batch)
- `DELETE /retiros/detalles/:idfor` (elimina detalle; efectivo asociado por cascade)
- `POST /retiros/:idret/finalize` (valida detalles/importe y fija `ESTA='FINALIZADO'`)
- `POST /retiros/:idret/cancel` (cancelación lógica solo en estado `ABIERTO`)
- `GET /catalogos/formas-retiro` (catálogo de formas para UI)
- Reglas de negocio:
- solo puede existir 1 retiro `ABIERTO` por día para la combinación `OPV+TER`.
- formas no `EFECTIVO` exigen `IMPF > 0`.
- en `EFECTIVO`, `IMPF` se recalcula como `SUM(TOTAL)` de denominaciones.
- no se permite finalizar sin detalles ni con total `<= 0`.
- auditoría explícita de mutaciones (`POST/PUT/DELETE`) en `AUDIT_LOG` con `MODULO='retiros'`.

## Estado de Cajón OPV (nuevo flujo 2026-03)

- Módulo NestJS:
  - `src/modules/cajon-estado/cajon-estado.module.ts`
  - `src/modules/cajon-estado/cajon-estado.controller.ts`
  - `src/modules/cajon-estado/cajon-estado.service.ts`
  - `src/modules/cajon-estado/cajon-estado-session.store.ts`
  - `src/modules/cajon-estado/guards/cajon-estado-supervisor.guard.ts`
- Endpoints:
  - `POST /cajon-estado/autorizar`
  - `GET /cajon-estado/resumen?fecha=YYYY-MM-DD`
- Reglas de negocio:
  - `IMPT` suma `PV_CTR_FOL_FORM.IMPD` por forma con `JOIN` a `PV_CTR_FOL_ASVR`, filtrando `OPVM` del usuario y rango diario de `FCNM` (`>= fecha` y `< fecha+1`), sin filtro de estatus.
  - `IMPR` suma `DAT_RET_DET_SVR.IMPF` por forma con cabecera `DAT_RET_CTR_SVR.ESTA='FINALIZADO'` y rango diario de `FCNR`.
  - `IMPE` se devuelve `NULL`.
  - `DIFD = IMPT - IMPR`.
  - la autorización de supervisor no usa vencimiento por tiempo en API; la app exige reautorización al reingresar a la pantalla.
- SQL:
  - `sql/sp_cajon_estado_resumen.sql` crea/actualiza `dbo.sp_cajon_estado_resumen` e índices de soporte.

## Alta de cotizacion desde panel (integracion app)

- Flujo frontend: confirmacion de alta y luego modal de busqueda/seleccion de cliente por sucursal del usuario.
- Endpoints usados por la app:
- `GET /factclientshp` (listado de clientes; app filtra por SUC).
- `POST /pvctrfolasvr/auto` (creacion de folio).
- `PATCH /pvctrfolasvr/:idfol` (asignacion de `CLIEN` al folio creado).
- Correccion backend (2026-02): `PV_CTR_FOL_ASVR.CLIEN` se mapea como `float` en TypeORM para evitar `500 EPARAM` cuando el cliente excede el rango `int32`.
- Compatibilidad facturación (2026-03): `FAC_SVR_SHAP.CLIEN` se ajusta a `FLOAT` para alinearlo con `PV_CTR_FOL_ASVR.CLIEN` y permitir IDs grandes (ej. `10460540001`) sin truncamiento/overflow.
- No hay cambios de contrato API en este ajuste.

## Edicion de precio PV en detalle de cotizacion

- Endpoint:
- `PATCH /pvticketlog/:id/precio`
- `POST /pvticketlog/precio/authorize`
- Payload:
- `PVTA` (requerido), `AUTH_PASSWORD` (requerido solo si solicitante no es `SUPERPV`).
- Reglas:
- usuario con rol `SUPERPV` puede autorizar su propio cambio de precio.
- usuario sin rol `SUPERPV` debe proveer contraseña valida de un usuario activo `SUPERPV`.
- Compatibilidad frontend (2026-03): el cliente puede intentar `PATCH /pvticketlog/:id/precio` sin `AUTH_PASSWORD`; si el solicitante no es `SUPERPV`, backend responde `403` para solicitar autorización y reintentar con `AUTH_PASSWORD`.
- Si la contraseña no coincide con un `SUPERPV` activo, backend rechaza la autorización y no se aplica el cambio de precio.
- Seguridad:
- `PATCH /pvticketlog/:id` no acepta cambios de `PVTA`; cualquier cambio de precio debe pasar por `PATCH /pvticketlog/:id/precio`.
- Actualizaciones:
- `PV_TICKET_LOG.PVTA` = nuevo precio
- `PV_TICKET_LOG.PVTAT` = `CTD * PVTA` recalculado
- `PV_TICKET_LOG.updated_at` = fecha actual
- Auditoria:
- inserta registro especifico en `AUDIT_LOG` con `ACTION='PVTA_OVERRIDE'`, entidad `PV_TICKET_LOG`, id renglón y metadata de antes/despues + autorizador.
- `AUDIT_LOG.IDUSUARIO` se guarda con el `IDUSUARIO` del `SUPERPV` que validó la contraseña (o el propio supervisor cuando aplica autorización directa).

## Cierre de cotizacion PV (nuevo flujo)

- Endpoint principal:
- `POST /pv/cotizaciones/:idfol/cierre`
- Endpoints auxiliares:
- `GET /pv/cotizaciones/:idfol/cierre/context`
- `POST /pv/cotizaciones/:idfol/cierre/preview`
- `GET /pv/cotizaciones/:idfol/cierre/print-preview`
- `GET /pv/refdetalle?idfol=:idfol&tipo=:tipo`
- `POST /pv/refdetalle/crear`
- `POST /pv/refdetalle/asignar`
- `DELETE /pv/refdetalle/:idref`
- Integracion frontend (`ioe_app`):
- flujo de pago reorganizado en `lib/features/modulos/punto_venta/cotizaciones/pago/*`.
- se retiro la visualizacion del bloque "Contexto del folio" en la pantalla de pago (sin cambios en API).
- trazabilidad UI: en cierre `CA`, el selector de formas en app permite `EFECTIVO` o `CREDITO`.
- trazabilidad UI: el campo `aut` (Autorizacion / referencia) y boton `Generar/Asignar referencia` se muestran en app para `TARJETA`, `CHEQUE`, `TRANSFERENCIA` y `DEPOSITO 3RO`.
- trazabilidad UI: la referencia se crea/asigna en `REF_DETALLE` y se retorna `IDREF` al formulario de pago.
- trazabilidad UI tecnica: app corrigio id temporal de formas para Flutter Web usando `nextInt(0x100000000)`; no cambia API.
- trazabilidad UI: app bloquea cambio de `tipotran` (`CA`/`VF`) cuando ya hay formas capturadas; no cambia endpoints ni payload.
- trazabilidad UI: `RQFAC` fue movido al AppBar y los totales de cotizacion/formas se presentan en un solo card en app; no cambia API.
- trazabilidad UI: app oculto `IVA integrado sucursal` en el resumen y recalcula preview al reingresar a pago; no cambia endpoints ni payload.
- trazabilidad UI: app guarda `RQFAC` en `PV_CTR_FOL_ASVR.REQF` al cambiar switch mediante `PATCH /pvctrfolasvr/:idfol`; no agrega endpoint nuevo.
- trazabilidad API/UI: al finalizar cierre, app permanece en pantalla de pago y habilita boton `Imprimir ticket`; al presionarlo consulta `GET /pv/cotizaciones/:idfol/cierre/print-preview` para abrir vista previa PDF.
- trazabilidad UI (app, 2026-03): en ticket de cotización, si hay formas no `EFECTIVO`, la impresión agrega voucher `SOPORTE RECEPCION PAGO` por cada forma no efectivo.
- trazabilidad UI (app, 2026-03): el voucher de cotización incluye espacio en blanco para firma y renglón `Firma cliente` después de `FCN`.
- trazabilidad UI (app, 2026-03): en cotizaciones, la app imprime vouchers en un segundo PDF; al cerrar la vista previa del ticket principal solicita confirmación y luego abre la vista previa del voucher (sin cambios de endpoints/payload).
- trazabilidad UI (app, 2026-03): se agrega línea de recorte entre `RESUMEN DE ORDS` y `ORDS`; `GRACIAS POR SU CONFIANZA` se imprime después de `RESUMEN DE ORDS` y antes del recorte hacia `ORDS`.
- trazabilidad UI: app realiza prevalidacion de referencias no usadas (`GET /pv/refdetalle`) antes de cerrar; backend sigue validando de forma autoritativa.
- trazabilidad UI: si esa prevalidacion detecta referencias sin usar, app redirige a `.../cotizaciones/:idfol/ref-detalle` con la referencia detectada para gestionarla antes de reintentar cierre.
- trazabilidad UI tecnica: app migro seleccion con `RadioGroup` (cliente/referencias) para resolver deprecaciones Flutter 3.32; sin cambios de endpoints/payload.
- trazabilidad UI: cuando `tipotran=CA`, app fuerza `rqfac=false` y persiste `REQF=0` en `PV_CTR_FOL_ASVR` previo al preview; sin cambios de contrato API.
- trazabilidad API/UI: al finalizar cierre, backend persiste `PV_CTR_FOL_ASVR.ESTA='PAGADO'` y app mantiene la pantalla de pago para impresion/confirmacion de salida.
- trazabilidad UI: en estado `PAGADO`, app cambia el boton regresar a icono candado y al presionarlo ejecuta `PATCH /pvctrfolasvr/:idfol` para mover el folio a `ESTA='TRANSMITIR'` y volver al panel.
- trazabilidad UI: desde panel, filas en `ESTA='PAGADO'` abren directo la vista de pago para completar salida/transmision.
- trazabilidad UI: el panel incluye estados `PENDIENTE`, `EDITANDO` y `PAGADO` con filtro por `ESTA` (sin depender de `AUT`); `TRANSMITIR` sigue existiendo en la salida operativa, pero ya no aparece en el listado.
- trazabilidad UI: en `DetalleCotPage` se ocultan en AppBar los campos `IDFOLINICIAL`, `AUT`, `ESTA` y `ORIGEN_AUT`; la API mantiene los mismos datos y contrato.
- Body de cierre:
- `{ suc, tipotran: 'CA'|'VF', rqfac, idopv, formas:[{ form, impp, aut? }] }`
- Procesamiento transaccional:
- `POST /pv/cotizaciones/:idfol/cierre` ejecuta el SP `dbo.sp_pv_cotizacion_cerrar`.
- `dbo.sp_pv_next_visible_folio` reserva consecutivos en `DAT_FOLIOS_CONSEC` y normaliza la nomenclatura visible `SUC-YYYYMMDD-CP|CA|VF-####`.
- `dbo.sp_pvctrfolasvr_create` genera el folio inicial `CP` con esa nomenclatura y fija `IDFOLINICIAL = IDFOL`.
- Script fuente obligatorio: `sql/sp_pv_cotizacion_cerrar_create.sql`.
- Script de esquema de formas de pago: `sql/DAT_FORM_schema_alter.sql` (`IDFORM` identity PK + `ESTADO` activo/inactivo).
- Si el SP no existe en la BD, el endpoint responde `409` indicando instalar ese script.
- El service no abre una transaccion TypeORM alrededor del SP para evitar abortos `EABORT` por doble transaccion; la atomicidad queda en el SP.
- Los errores SQL de validacion del SP se retornan como `400/409` con mensaje legible (no `500` generico).
- Tablas y campos que actualiza:
- `PV_CTR_FOL_ASVR`: `ESTA='PAGADO'` al finalizar cierre (`TRANSMITIR` se aplica despues en `PATCH` desde frontend al salir), `IMPT=TOTAL`, `AUT='CA'|'VF'` (y `REQF`/campo equivalente si existe).
- en `CP -> CA/VF`, `sp_pv_cotizacion_cerrar` genera nuevo `IDFOL` visible, conserva `IDFOLINICIAL` y religa `PV_TICKET_LOG`, `PV_CTR_ORDS` y `REF_DETALLE` al folio final dentro de la misma transacción.
- `PV_CTR_FOL_FORM_SVR` (fallback `PV_CTR_FOL_FORM`): insercion transaccional de formas definitivas (`IDF`, `IDFOL`, `FORM`, `IMPP`, `AUT`, ...). En `CREDITO/DEUDOR` guarda `AUT=IDFOL`. En cualquier forma, `IMPD` persiste el total final de la cotizacion (costo total de articulos segun reglas de cierre).
- sincronización facturación VF (2026-03): en cierre `tipotran='VF'`, `sp_pv_cotizacion_cerrar` exige e invoca `dbo.sp_fact_sync_folio_vf` dentro de la misma transacción para upsert de cabecera `FAC_SVR_SHAP` y rebuild de detalle `FACT_TICKET_SHP` del folio final.
- regla `Tipofact` en sincronización VF (2026-03): si el folio tiene alguna forma `CREDITO` en `PV_CTR_FOL_FORM(_SVR)`, se persiste `FAC_SVR_SHAP.Tipofact='CREDITO'`; en caso contrario queda `INDIVIDUAL`.
- política de fecha de finalización cotización (2026-03): `sp_pv_cotizacion_cerrar` aplica fecha de proceso actual al insertar formas (`FCN`), al actualizar cabecera (`FCNM`) y al generar movimientos contables por `CREDITO/DEUDOR` (`DAT_CTR_DOC`/`DAT_CTRL_CTAS`).
- `PV_CTR_ORDS`: actualizacion de `ESTATUS=2` para las ordenes del `IDFOL` al cerrar.
- Tablas para calculo/validacion:
- `PV_TICKET_LOG` (`SUM(CTD * PVTA)`), `DAT_SUC` (`IVA_INTEGRADO`), `FACT_CLIENT_SHP` y `DAT_CTRL_CTAS` (credito).
- `REF_DETALLE` para validar referencias (`IDREF`, `IDFOL`, `TIPO`, `ESTATUS`, `RfcEmisor`, `IMPT`).
- `DAT_CTRL_CTAS` en `CREDITO/DEUDOR`: inserta cargo con `CMOV=602`, `CTA='101001002'`, `CLIENT`, `IDFOL`, `NDOC`, `IMPT` negativo.
- Compatibilidad de esquema en `DAT_CTRL_CTAS`: si no existe `CMOV` usa `CLSD`; ademas llena `FCND` y `RTXT` cuando esas columnas existen.
- Validacion de credito: disponible = `FACT_CLIENT_SHP.L_CRED - MAX(-SUM(DAT_CTRL_CTAS.IMPT), 0)` (misma `CTA` y `CLIENT`; cargos negativos consumen crédito y abonos positivos lo liberan).
- `NDOC` se genera concurrente en transaccion (sin `DCount`) con base `N6000001+`.
- compatibilidad SQL: para obtener maximo `NDOC` en cierre se valida existencia de columna con `COL_LENGTH` + SQL dinamico, evitando errores `Invalid column name 'NDOC'` en variantes de esquema.
- El cierre exige `REF_DETALLE.ESTATUS='PROCESADO'` en formas no efectivo con referencia y rechaza referencias sobrantes sin usar.
- El cierre rechaza pagos que excedan el total (`sum(formas.impp) > total`) excepto cuando hay `EFECTIVO`, donde se permite excedente para cambio.
- La operacion es transaccional con rollback completo; no permite cierres parciales.
- Preview de impresion (`GET /pv/cotizaciones/:idfol/cierre/print-preview`):
- arma un payload de 5 bloques para PDF: cabecera (`DAT_SUC`), detalle ticket (`PV_TICKET_LOG`), totales/formas/cambio (`PV_CTR_FOL_FORM_SVR` fallback `PV_CTR_FOL_FORM`), pie transaccional (`PV_CTR_FOL_ASVR` + `PV_OPV` + `FACT_CLIENT_SHP`) y ORDs con detalle (`PV_CTR_ORDS` + `PV_CTR_ORDS_DET`) por `IDFOL`.
- trazabilidad UI de impresion: la app renderiza tickets 58/80 sin encabezado repetitivo (`COTIZACION FINALIZADA`) ni `IDFOL` superior.
- trazabilidad UI de impresion: la app aplica margen izquierdo fijo de `2mm` en ambos anchos de ticket.
- trazabilidad UI de impresion: cuando el cierre es `CA`, la app omite subtotal/IVA/total final/pagos/faltante/cambio y oculta `FORMAS`; mantiene TRANSACCION y ORDs.
- trazabilidad UI de impresion: en bloque ORDs, la app imprime `ORD` y `UPC`, agrega descripcion + `TIPO`, codigo de barras `CODE39` por ORD y una tabla con bordes (`JOB/ESF/CIL/EJE`) desde `PV_CTR_ORDS_DET`; omite `EST` y `ART` en cabecera ORD.
- trazabilidad UI de impresion: en la tabla ORD las celdas vacias se muestran sin guiones.
- trazabilidad UI de impresion: se imprime un bloque `RESUMEN DE ORDS` entre `TRANSACCION` y `ORDS` con `ORD`, descripcion y `UPC`.
- trazabilidad UI de impresion: en `DETALLE` se agrega `UPC` por producto y alternancia de fondo gris/blanco por renglon.
- trazabilidad UI de impresion: al iniciar cada bloque `ORD` se imprime linea de recorte con icono para separacion por orden.
- trazabilidad UI de impresion: frontend calcula altura dinamica del ticket segun contenido para minimizar hojas vacias y mantener multihoja solo cuando es necesario.
- trazabilidad UI de impresion: frontend renderiza `MultiPage` con margen izquierdo explicito de `2mm` para 58/80, evitando contenido pegado al borde.
- trazabilidad UI de impresion: se recalibra la altura dinamica en 80mm con estimacion mas conservadora (lineas/tablas/buffer por ORDs) para evitar hoja extra; en 58mm no se altera la logica actual.

## Devoluciones PV (nuevo flujo)

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
- Reglas de negocio:
- creación con autorización de supervisor `SUPERPV` por contraseña (`401` inválida, `403` no supervisor).
- creación devolución (2026-03): `sp_pvctrfolasvr_create` se ejecuta fuera de transacción TypeORM y la transacción local inicia después del `EXEC` para evitar desbalance `@@TRANCOUNT` (`Previous count = 1, current count = 0`).
- creación devolución (2026-03): si `sp_pvctrfolasvr_create` falla por duplicado `PK_CTR_FOL`, API ejecuta fallback con `sp_getapplock` y secuencia incremental (`WHILE EXISTS`) para insertar un folio único.
- folio origen permitido solo para `AUT in ('VF','CA','APF')`.
- bloqueo por facturación usando `FAC_SVR_SHAP`: si `ESTATUS='FACTURADO'`, responde `409`.
- bloqueo ORD configurable: `ESTSEGU >= PV_DEV_ORD_BLOCK_THRESHOLD` (default `5`).
- en detalle solo se edita `CTDD`; para líneas con ORD no bloqueante se exige devolución completa (`CTDD == CTD`).
- `devolver-todo` aplica `CTDD=DIFD` y omite (null) líneas bloqueadas por ORD.
- `detalle/preparar` valida selección e inserta en `PV_TICKET_LOG` del folio devolución solo artículos con `CTDD>0`.
- trazabilidad UI (app, 2026-03): en `/punto-venta/devoluciones/:idfolDev/detalle`, `Ir a pago` se movió al `AppBar` con icono de caja (`Icons.point_of_sale`) y dejó de mostrarse en los botones del body.
- trazabilidad UI (app, 2026-03): en la tarjeta de contexto de detalle devolución se ocultaron `AUT dev`, `AUT origen` y `Estado` (sin cambios de API).
- preview reutiliza reglas de IVA del cierre (`DAT_SUC.IVA_INTEGRADO`, `REQF`, tipotran del origen) y sugiere formas.
- trazabilidad UI (app): en pago de devolución `RQFAC` se muestra como dato derivado del origen (solo lectura en frontend, sin override manual).
- trazabilidad UI (app, 2026-03): en `/punto-venta/devoluciones/:idfolDev/pago`, la tarjeta de contexto oculta `AUT dev`, `AUT origen`, `Tipo` y `Líneas seleccionadas` (sin cambios de API).
- trazabilidad UI (app): en pago de devolución no se permite agregar, editar ni eliminar formas en la pantalla.
- trazabilidad UI (app, 2026-03-10): en pago devolución, frontend rehidrata siempre `formas` desde `preview.formasSugeridas` (origen) para devolver por mismo concepto en no-efectivo y preservar `aut/ref` para el cierre backend.
- trazabilidad UI (app): cuando la devolución queda en `PAGADO`, app muestra candado de salida y al presionarlo manda `PATCH /pvctrfolasvr/:idfol` con `ESTA='TRANSMITIR'`.
- `GET /pv/devoluciones` devuelve solo folios en `ESTA IN ('PENDIENTE','EDITANDO','PAGADO')` para filtros por `OPV` y por `OPVM`; `TRANSMITIR` se conserva para la salida operativa, no para el panel.
- trazabilidad UI (app): desde panel, devoluciones en `PAGADO` abren directo la vista de pago.
- trazabilidad UI (app, 2026-03): desde panel, devoluciones no `PAGADO` con selección previa (`linesSelected > 0` o alguna línea con `CTDD > 0` detectada en `GET /pv/devoluciones/:idfolDev/detalle`) abren directo la vista `/detalle`; sin selección previa, abren la vista de selección de artículos.
- trazabilidad API/UI (app): la impresión de devolución se dispara con botón explícito y selector 58mm/80mm, consumiendo `GET /pv/devoluciones/:idfolDev/print-preview`.
- trazabilidad UI (app, 2026-03): en ticket de devolución, si hay formas no `EFECTIVO`, la impresión agrega voucher `SOPORTE RECEPCION PAGO` por cada forma no efectivo.
- trazabilidad UI (app, 2026-03): el voucher de devolución incluye espacio en blanco para firma y renglón `Firma cliente` después de `FCN`.
- trazabilidad UI (app, 2026-03): en devoluciones, el voucher se imprime en un segundo PDF; al cerrar la vista previa del ticket principal, la app solicita confirmación y luego abre la vista previa del voucher.
- trazabilidad UI (app, 2026-03): se agrega línea de recorte entre `RESUMEN DE ORDS` y `ORDS`; `GRACIAS POR SU CONFIANZA` se imprime después de `RESUMEN DE ORDS` y antes del recorte hacia `ORDS`.
- trazabilidad UI (app, 2026-03): el ticket de devolución se homologó al formato de cotizaciones con bloques `DETALLE`, `TOTALES`, `FORMAS`, `TRANSACCION`, `RESUMEN DE ORDS`, `ORDS` (barcode `CODE39` + tabla `JOB/ESF/CIL/EJE`) y vouchers por forma no `EFECTIVO`.
- finalización transaccional:
- registra `FACT_IDFOLDEV` (`IDFOLDEV`, `IDFOL_OR`, `NART`, `IMPTD`, `TIPOT='DF'` según columnas disponibles).
- actualiza líneas originales (`PV_TICKET_LOG.CTDDF += CTDD`).
- genera ticket devolución en `PV_TICKET_LOG` del folio devolución.
- guarda formas de pago en `PV_CTR_FOL_FORM_SVR` (fallback `PV_CTR_FOL_FORM`) con importes negativos.
- reglas formas devolución (2026-03): en `CREDITO/DEUDOR`, `PV_CTR_FOL_FORM` guarda `IMPC=0` e `IMPD=0`; en `EFECTIVO`, `IMPC=IMPD`.
- en `CREDITO/DEUDOR`, registra abono en `DAT_CTR_DOC` (si existe) y `DAT_CTRL_CTAS` con `CTA='101001002'`, clase `601`, `RTXT='Abono por anulacion cliente ticket <folio origen>'` e `IDFOL=<folio origen>`; `NDOC` se usa cuando existe en el esquema.
- compatibilidad NDOC devolución (2026-03): al calcular consecutivo `NDOC`, API consulta `NDOC` solo cuando existe en `DAT_CTRL_CTAS`/`DAT_CTR_DOC`; en `DAT_CTRL_CTAS` el insert usa `NDOC` opcional según columnas disponibles para evitar `Invalid column name 'NDOC'`.
- política de fecha de finalización devolución (2026-03): API reutiliza una fecha actual única del cierre para `FACT_IDFOLDEV` (`FCN/FCNR`), `PV_CTR_FOL_FORM(_SVR).FCN`, `PV_CTR_FOL_ASVR.FCNM`, `PV_TICKET_LOG.UPDATED_AT` y movimientos contables asociados.
- marca ORDs afectadas como anuladas (`PV_CTR_ORDS.ESTATUS=4`).
- devolución origen VF (2026-03): al finalizar pago de devolución y aplicar `CTDDF`, la API ejecuta `dbo.sp_fact_sync_folio_vf` sobre el folio origen (`IDFOLORIG`) para reflejar devoluciones parciales/totales en `FAC_SVR_SHAP` y `FACT_TICKET_SHP`.
- folio devolución termina en `ESTA='PAGADO'` y `AUT='DF'/'APDF'`; el envío a `TRANSMITIR` se realiza después mediante `PATCH /pvctrfolasvr/:idfol`.
- SQL soporte:
- `sql/PV_DEV_DET_TMP_create.sql` crea/ajusta la tabla staging `PV_DEV_DET_TMP`.
- `sql/sp_fact_sync_folio_vf_create.sql` crea/actualiza `dbo.sp_fact_sync_folio_vf` para sincronización idempotente de facturación por evento VF.

## Reloj Checador (Asistencia)

- Modulo backend:
- `src/modules/reloj-checador/reloj-checador.module.ts`
- `src/modules/reloj-checador/reloj-checador.controller.ts`
- `src/modules/reloj-checador/reloj-checador.service.ts`
- `src/modules/reloj-checador/dto/*`
- Endpoints:
- `GET /reloj-checador/context`
- `POST /reloj-checador/timelog`
- `GET /reloj-checador/timelogs`
- `PUT /reloj-checador/timelog/:id`
- `POST /reloj-checador/incidencias`
- `PUT /reloj-checador/incidencias/:id/status`
- `GET /reloj-checador/incidencias`
- `POST /reloj-checador/documentos`
- `GET /reloj-checador/documentos`
- `GET /reloj-checador/documentos/:id/download`
- `POST /reloj-checador/overrides`
- `GET /reloj-checador/overrides`
- `PUT /reloj-checador/overrides/:id/revoke`
- `GET /reloj-checador/policy`
- `POST /reloj-checador/policy`
- SQL versionado:
- `sql/reloj_checador/001_ATT_POLICY_create.sql`
- `sql/reloj_checador/002_ATT_TIME_LOG_create.sql`
- `sql/reloj_checador/003_ATT_BIOMETRIC_TEMPLATE_create.sql`
- `sql/reloj_checador/004_ATT_INCIDENCIA_create.sql`
- `sql/reloj_checador/005_ATT_DOCUMENTO_create.sql`
- `sql/reloj_checador/006_ATT_OVERRIDE_create.sql`
- `sql/reloj_checador/007_ATT_ALERTA_create.sql`
- `sql/reloj_checador/101_sp_att_policy_upsert.sql` .. `115_sp_att_override_list.sql`
- Comportamiento clave:
- `sp_att_timelog_create` valida secuencia ENTRADA/SALIDA_COMER/REGRESO_COMER/SALIDA, geocerca, ventanas y liveness.
- cuando corresponde, valida override vigente en `ATT_OVERRIDE`.
- inserta marcaje bloqueado (`ATT_TIME_LOG.LOCKED=1`) y genera alertas de overtime en `ATT_ALERTA`.
- Seguridad/alcance:
- employee: solo marcajes y consultas propias.
- manager/supervisor: consulta por SUC/DEPTO, aprobacion de incidencias y gestion de overrides.
- admin/rrhh: gestion completa, incluyendo correccion admin de timelog.
- Auditoria:
- todas las operaciones criticas escriben en `AUDIT_LOG` (`MODULO='reloj_checador'`) con metadata JSON (url, method, body, before/after, reason segun aplique).

## Modelo de datos (tablas y campos clave)

### Seguridad y acceso

- `USUARIO`: `IDUSUARIO`, `USERNAME`, `PASSWORD_HASH`, `NOMBRE`, `APELLIDOS`, `IDROL`, `IDDEPTO`, `IDPUESTO`, `SUC`, `ESTATUS`, `FORZAR_CAMBIO_PASS`.
- `ROL`: `IDROL`, `CODIGO`, `NOMBRE`, `DESCRIPCION`, `ACTIVO`.
- `USUARIO_TOKEN`: `IDTOKEN`, `IDUSUARIO`, `JTI`, `REFRESH_TOKEN_HASH`, `ISSUED_AT`, `EXPIRES_AT`, `REVOKED_AT`.
- `USR_MOD_SUC`: `MODULO`, `USUARIO`, `SUC`, `ACTIVO`, `FCNR`.
- `MODULO`, `GRUP_MODULO`, `GRUPMOD_MODULO`, `ROL_GRUP_MODULO_PERM`.
- `MOD_FRONT`, `GRUPMOD_FRONT`, `GRUPMOD_FRONT_MOD`, `ROL_GRUPMOD_FRONT`.
- `AUDIT_LOG`: `IDLOG`, `IDUSUARIO`, `ACTION`, `MODULO`, `ENTIDAD`, `ENTIDAD_ID`, `SUC`, `METADATA_JSON`, `IP`.

### Maestros y catalogos

- `DEPARTAMENTO`: `IDDEPTO`, `NOMBRE`, `ACTIVO`.
- `PUESTO`: `IDPUESTO`, `IDDEPTO`, `NOMBRE`, `ACTIVO`.
- `DAT_SUC`: `SUC`, `DESC`, `ENCAR`, `ZONA`, `RFC`, `DIRECCION`.
- `DAT_ART`: `SUC`, `ART`, `UPC`, `DES`, `TIPO`, `PVTA`, `CTOP`, `DEPA`, `SUBD`, `CLAS`, `SCLA`, `SCLA2`, `MODELO`, etc.
- `DAT_CAT_REG`: `C_REGIMENFISCAL`, `DESCRIPCION`.
- `DAT_CAT_USO`: `USOCFDI`, `DESCRIPCION`.
- `DAT_ALMACEN`: `ALMACEN`, `DESCRIPCION`, `ACTIVO`.
- `DAT_CMOV`: catalogo de clases de movimiento (columnas detectadas dinamicamente).

### Inventarios

- `DAT_CONT_CTRL`: `TOKENREG`, `CONT`, `SUC`, `ESTA`, `TIPOCONT`, `TOTAL_ITEMS`, `FILE_NAME`, `LAST_ERROR`, `FCNC`.
- `DAT_CONT_CAPTURA`: `ID`, `SUC`, `CONT`, `ART`, `UPC`, `ALMACEN`, `CANT`, `TIPO_MOV`, `IDUSUARIO`, `CAPTURA_UUID`.
- `DAT_DET_SVR`: `ID`, `SUC`, `CONT`, `ART`, `UPC`, `[001]`, `[002]`, `M001`, `T001`, `TOTAL`, `DIF_*`, `EXT`.
- `DAT_MB51`: `IDPD`, `CLSM`, `DOCP`, `ART`, `CTDA`, `CTOT`, `FCND`, `FCNC`, `TXT`, `ALMACEN`, `SUC`.

### Control de cuentas y PV

- `DAT_CAT_CTAS`: `CTA`, `DCTA`, `RELACION`, `SUC`.
- `FACT_CLIENT_SHP`: `IDC`, `CLIEN_UNI`, `RazonSocialReceptor`, `RfcReceptor`, `UsoCfdi`, `SUC`.
- `PV_CTR_FOL_ASVR`: `IDFOL`, `CLIEN`, `SUC`, `OPV`, `ESTA`, `IMPT`.
- `PV_CTR_FOL_FORM`: `IDF`, `IDFOL`, `FORM`, `IMPA`, `IMPP`, `IMPC`, `IMPD`.
- `PV_CTR_ORDS`: `IORD`, `IDFOL`, `ART`, `CTD`, `SUC`, `ESTATUS`.
- `PV_CTR_ORDS_DET`: `IORDP`, `IORD`, `ART`, `JOB`, `ESF`, `CIL`, `EJE`.
- `PV_TICKET_LOG`: `ID`, `IDFOL`, `UPC`, `ART`, `CTD`, `PVTA`, `CTDD`, `CTDDF`.
- `REF_DETALLE`: `IDREF`, `SUC`, `FCNR`, `FCND`, `OPV`, `IDFOL`, `IDC`, `TIPO`, `IMPT`.

## Consultas y stored procedures clave

- Inventarios:
- `sp_cont_upload_clear`
- `sp_cont_build_det_svr`
- `sp_cont_sync_captura_art`
- `sp_cont_apply_adjustment`
- MB51/MB52:
- `sp_dat_mb51_search`
- `sp_dat_mb52_resumen`
- Script operativo MB51 (2026-03): `sql/mb51transmicion.sql` normaliza estados legacy de transmisión (`MB51PROCES`/`TRANSMICION`/`TRANSMISION`) a `TRANSMITIR` en `PV_CTR_FOL_ASVR` para evitar conflicto con `CK_PV_CTR_FOL_ASVR_ESTA_HOMOLOGADO`.
- Articulos (masivos):
- `sp_datart_massive_apply`
- `sp_art_masiva_validate_batch`
- `sp_art_masiva_commit_batch`
- Control de cuentas:
- `sp_ctrlctas_resumen_cliente`
- `sp_ctrlctas_resumen_transaccion`
- `sp_ctrlctas_detalle_transaccion`
- Punto de venta/clientes:
- `sp_factclientshp_create`
- `sp_pvctrfolasvr_create`
- `sp_pv_ctr_ords_create_from_quote_line`
- `sp_pv_cotizacion_cerrar`
- Scripts de esquema:
- `DAT_FORM_schema_alter.sql` (estructura y control de estado para formas de pago)
- `PV_CTR_ORDS_CLIEN_float.sql` (ajuste de CLIEN a FLOAT para IDs grandes)
- `FAC_SVR_SHAP_CLIEN_float.sql` (alinea `FAC_SVR_SHAP.CLIEN` a `FLOAT` y backfill desde `PV_CTR_FOL_ASVR`)
- `PV_DEV_DET_TMP_create.sql` (staging de detalle para devoluciones PV)
- `USUARIO_forzar_cambio_pass_alter.sql` (agrega bandera `FORZAR_CAMBIO_PASS` para flujo de primer acceso)

## Reglas de autorizacion por sucursal (criticas)

- Inventarios (`DAT_JAA_ALM`): validar `USR_MOD_SUC` para usuarios no-admin.
- Control de cuentas/catalogo cuentas: validar `USR_MOD_SUC` para
  `DAT_CONS_CTAS`, `DAT_CTRL_CTAS`, `DAT_CTRL_CUENTAS`.
- `admin` (roleId `1`) mantiene bypass por rol.
- Frontend no es control de seguridad: validacion efectiva se hace en API.

## Ejecucion

```bash
npm install
npm run start:dev
```

Produccion:

```bash
npm run build
npm run start:prod
```

Nota de watch/dev:

- `nest-cli.json` mantiene `compilerOptions.deleteOutDir=false` para evitar errores intermitentes `Cannot find module ...\\dist\\main` durante compilacion incremental.

Swagger:

- `http://localhost:3001/docs` (si `PORT` no cambia)

## Scripts utiles

- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run test:cov`

## Documentacion viva obligatoria

- Cada implementacion nueva que modifique modulos, endpoints, tablas, campos,
  stored procedures o consultas SQL debe actualizar en el mismo trabajo:
- `C:\Users\PCDESARROLLO\Proyectos\ioe_app\AGENTS.md`
- `C:\Users\PCDESARROLLO\Proyectos\ioe_app\README.md`
- `C:\Users\PCDESARROLLO\Proyectos\ioe-api\AGENTS.md`
- `C:\Users\PCDESARROLLO\Proyectos\ioe-api\README.md`
- Esta actualizacion es obligatoria para retroalimentacion y trazabilidad cruzada app/api.
