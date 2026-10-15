# Plan de corrección de timestamps de evento — IOELOCAL

Corte de inventario de solo lectura: `2026-10-15T21:03:08.2466736Z` (`15:03:08` hora México). Preflight `VALIDAR`: `2026-10-15T21:03:11.063Z`. Destino: `IOELOCAL` en `dd7842d7ba7e`.

## Regla acordada

Corregir UTC→México solo en timestamps de evento cuyo valor venga del reloj del sistema al crear o insertar el registro. No inferirlo por tipo `date/datetime` ni por nombre del campo. Excluir fechas de negocio que pueden quedar legítimamente futuras: entrega/promesa de ORD, vigencias, vencimientos y expiraciones.

El DML generado acota filas cuyo valor naive cae en la ventana `hora México < valor <= corte UTC`. Es remediación de valores que todavía se ven futuros al corte; no normaliza histórico completo. Para histórico anterior se requiere conocer fecha de cambio de reloj/origen por tabla y otra whitelist.

## Error de preparación de devolución (HTTP 409)

- Captura apunta a `POST /pv-devoluciones/:idfolDev/detalle/preparar`, implementado en `src/modules/pv-devoluciones/pv-devoluciones.controller.ts`; el servicio captura etapa, estado y mensaje en `PV_DEV_PREPARE_ERROR`.
- Consulta read-only a auditoría viva encontró **0** eventos `PV_DEV_PREPARE_ERROR`. Sí hay eventos recientes de `PV_DEV_CREATE` y `PV_DEV_FINALIZE`, por lo que el registro de fallos no acredita la solicitud de la captura.
- Runtime inspeccionado: imagen conjunta `ioe-allinone:production-17feeb19a776-5163f2fbbfc6`; API y front `healthy`; `/` y `/api/health/db` responden `200`. El contenedor API actual se creó `2026-10-15 19:44:48 UTC`; búsqueda de mensajes del error en sus logs devuelve **0**. La captura de las 12:38 hora México es aprox. `18:38 UTC`; el contenedor anterior ya no existe, así que no se recuperó ese log histórico.
- El código puede emitir 409 al faltar una línea seleccionada con `CTDD > 0`, por conflictos de validación/estado, o por offset operativo distinto de `-360`. Falta el cuerpo JSON de respuesta o el log asociado a la solicitud para discriminar.
- `PV_DEV_DET_TMP.FCNR` sí tiene timestamps recientes UTC escritos con `GETDATE()` y 10 celdas dentro de la ventana UTC/México al preflight. El flujo de preparación ordena staging por `FCNR`, pero no usa ese campo para validar `CTDD`; no hay evidencia que conecte esa anomalía con el 409. Causa del 409 sigue **sin confirmar**.

## Inventario y preflight

- Inventario amplio: **69 columnas / 42 tablas**, suma de **42,347 celdas** que superan reloj México; una fila puede sumar en varias columnas. Incluye valores futuros válidos y pendientes de trazar.
- **5 columnas** tienen valores posteriores también a UTC: `FACT_CSD.VIGENCIA_HASTA` (4), `PROMO_CAB.FCN_TER` (3), `PV_CTR_ORDS.FCNM` (75), `PV_OPV.FCNR` (1), `USUARIO_TOKEN.EXPIRES_AT` (24,153). Solo `PV_OPV.FCNR` queda como anomalía sin fecha fuente; no se reemplaza por “ahora”.
- Whitelist estática del script: **37 columnas / 27 tablas**. `VALIDAR` encontró **7,715 celdas con llave única** y **1 celda bloqueada** (`DAT_CONT_CTRL.FCNR`, sin PK/índice único no nullable). Hash del plan: `8FEBBD1DCDA796038CA9E9A5C1F73FE276E3ACA4AE04DD5F1D8AB8D769F57211`.
- El conteo amplio no equivale al alcance DML. Inventario detallado, defaults, llaves y escritores: [INVENTARIO_FECHAS_FUTURAS_IOELOCAL_20261015.md](INVENTARIO_FECHAS_FUTURAS_IOELOCAL_20261015.md).

## Coolify y sincronización Git

- Imagen activa verificada en ambos contenedores: `ioe-allinone:production-17feeb19a776-5163f2fbbfc6`, digest `sha256:a69914372cf624a04824a45516051929026ef9a648666767450d78f4e7d735f4`. Labels confirman API `17feeb19a776704adcdf457fa8ce5831730651c3` y App `5163f2fbbfc64d8f5c556bde825bda21bfeccf0d`; ambos `healthy`.
- API local `master` estaba 6 commits delante de `origin/master`; App, 1. El API local `a534075` solo registra documentación posterior al código ya incluido en la imagen; el fix temporal `2dd2e0f` y el manejo UI `5163f2f` ya están desplegados.
- VS Code **Sync Changes** publica commits locales a `origin`; no cambia por sí solo el `IOE_IMAGE` que ejecuta Compose. El flujo productivo versionado construye y activa una etiqueta de imagen conjunta de forma explícita. Los nuevos scripts SQL no se ejecutan al sincronizar ni al reconstruir imagen.

## Artefactos integrados

- `sql/2026-10-15_inventario_fechas_futuras_readonly.sql`: catálogo de columnas temporales y conteo de valores futuros; solo lectura, usa `NOLOCK`.
- `sql/2026-10-15_reparar_timestamps_evento_utc_mexico_guarded.sql`: whitelist estática; confirma defaults vivos; exige tablas/columnas y tipos esperados; modo predeterminado `VALIDAR`. El hash cubre whitelist, llaves y valores exactos de cada fila, además de corte/ventana. `APLICAR` exige corte, conteo/hash aprobados, reconocimiento de fila bloqueada, transacción serializable, bloqueo de aplicación y ledger reversible.
- `sql/2026-10-15_revertir_timestamps_evento_utc_mexico.sql`: reversa por `batch_id`; valida que cada llave exista una sola vez y que el valor actual siga igual al aplicado antes de restaurar el anterior.

## Secuencia propuesta

1. Obtener JSON/correlation ID de la solicitud fallida y revisar log de Coolify/API en esa hora; reparar primero la condición que realmente origina el 409.
2. Resolver por campo el contrato de nuevos eventos: almacenamiento local México para columnas legacy, o UTC canónico con conversión explícita en consumidores. No mezclar ambos contratos.
3. Revisar la whitelist y preflight recién generado. Excluir fechas programadas/prometidas, auditoría y valores sin origen autoritativo.
4. Para DML, guardar backup de reversa fuera del repo; repetir `VALIDAR` en ventana acordada; cotejar corte, hash, conteo y fila bloqueada; probar restauración en copia controlada.
5. Aplicar solo tras autorización explícita de base/destino y lote exactos; comparar postflight; ejecutar UAT autenticada de preparar/editar/finalizar devolución.
6. Desplegar cambios de API y App juntos si la prevención requiere código; preservar y revisar todo cambio local/remoto actual.

## Estado y límites

- Se ejecutaron únicamente consultas read-only de inventario, auditoría y `VALIDAR`; `@Aplicar=0`.
- La reconstrucción coordinada API/App ya está activa en Coolify y fue verificada en runtime. No se hizo otro despliegue durante esta corrección de datos.
- No se actualizaron filas, no se creó ledger, no se generó backup ni se hizo UAT del flujo de devolución.
- El script de reversa está generado para revisión; no se ejecutó contra un lote real.
- Conteos usan `NOLOCK`, cambian con escrituras concurrentes y no autorizan DML. El hash/corte del preflight ya es evidencia temporal; debe regenerarse antes de migrar.
