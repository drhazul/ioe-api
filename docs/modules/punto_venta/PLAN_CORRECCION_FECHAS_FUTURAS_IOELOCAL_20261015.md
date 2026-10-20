# Plan de corrección de timestamps de evento — IOELOCAL

Inventario amplio inicial: `2026-10-15T23:11:09.0149211Z` (`17:11:09` hora México). `VALIDAR` renovado en solo lectura: `2026-10-15T23:30:07.5491579Z` (`17:30:07.5491579` hora México). Destino: `.40` (`172.16.100.40:1434`), `IOELOCAL` en `dd7842d7ba7e`, `ONLINE` y `FULL`. `.234` es espejo en `RESTORING`; queda fuera de esta corrección.

**Estado:** lote dinámico de datos y prevención SQL focalizada aplicados en `.40`. La causa técnica del HTTP 409 quedó identificada en el código histórico; falta UAT autenticada posterior al fix.

## Regla acordada

Corregir UTC→México solo en timestamps de evento cuyo valor venga del reloj del sistema al crear o insertar el registro. No inferirlo por tipo `date/datetime` ni por nombre del campo. Excluir fechas de negocio que pueden quedar legítimamente futuras: entrega/promesa de ORD, vigencias, vencimientos y expiraciones.

El DML generado acota filas cuyo valor naive cae en la ventana `hora México < valor <= corte UTC`. Es remediación de valores que todavía se ven futuros al corte; no normaliza histórico completo. Para histórico anterior se requiere conocer fecha de cambio de reloj/origen por tabla y otra whitelist.

## Filtro por origen y edición de usuario

Aplicar solo a campos cuya fecha se asigne desde el reloj del sistema y que no se acepte como dato editable del usuario. Revisión de DTO/servicios encontró seis exclusiones en la whitelist anterior:

- `DAT_MB51.FCNC`: API acepta `dto.FCNC` en alta y actualización.
- `PV_CTR_FOL_ASVR.FCNM`: API acepta `dto.FCNM` en alta y actualización.
- `PV_CTR_ORDS.FCNRT`, `FCNAS`, `FCNTD` y `FCNMOD`: API acepta esos campos en `UpdatePvCtrOrdsDto`.

Aunque algunos procedimientos también les asignen `GETDATE()`, no entran al DML porque los clientes pueden enviar valores explícitos. La whitelist del script quedó reducida a **31 campos en 25 tablas**. `PV_CTR_ORDS.FCN_AUT_CYM` queda candidato: el servicio asigna `GETDATE()` durante autorización y no expone ese campo en el DTO. La clasificación sigue sujeta al contrato UTC/local por campo y al preflight fresco.

## Error de preparación de devolución (HTTP 409)

- Captura apunta a `POST /pv-devoluciones/:idfolDev/detalle/preparar`, implementado en `src/modules/pv-devoluciones/pv-devoluciones.controller.ts`; el servicio captura etapa, estado y mensaje en `PV_DEV_PREPARE_ERROR`.
- Consulta read-only a auditoría viva encontró **0** eventos `PV_DEV_PREPARE_ERROR`. Sí hay eventos recientes de `PV_DEV_CREATE` y `PV_DEV_FINALIZE`, por lo que el registro de fallos no acredita la solicitud de la captura.
- Runtime inspeccionado: imagen conjunta `ioe-allinone:production-17feeb19a776-5163f2fbbfc6`; API y front `healthy`; `/` y `/api/health/db` responden `200`. El contenedor API actual se creó `2026-10-15 19:44:48 UTC`; búsqueda de mensajes del error en sus logs devuelve **0**. La captura de las 12:38 hora México es aprox. `18:38 UTC`; el contenedor anterior ya no existe, así que no se recuperó ese log histórico.
- El SHA que operaba antes del corte (`85fa560`) leía `GETDATE()`/`SYSDATETIMEOFFSET()` y lanzaba 409 si el offset no era `-360`. El reloj SQL vivo en `.40` reportó UTC (`+00:00`); auditoría confirmó líneas seleccionadas válidas. Esto identifica la causa técnica del bloqueo de zona horaria.
- La captura de 12:38 hora México del 2026-10-15 precede a la imagen activa posterior (`17feeb19a776-5163f2fbbfc6`, API `17feeb19a776704adcdf457fa8ce5831730651c3`), cuyo helper `2dd2e0f` deriva hora México desde UTC y comprueba `-360`. El API/front actuales están `healthy`; `/` y `/api/health/db` responden `200`.
- No existe evento/log/correlation ID del 409 original; no puede enlazarse una línea de auditoría con la captura. La causa por código y entorno sí está identificada; UAT autenticada sigue pendiente.
- `PV_DEV_DET_TMP.FCNR` sí tiene timestamps recientes UTC escritos con `GETDATE()` y 10 celdas dentro de la ventana UTC/México al preflight. El flujo de preparación ordena staging por `FCNR`, pero no usa ese campo para validar `CTDD`; no hay evidencia que conecte esa anomalía con el 409. Causa del 409 sigue **sin confirmar**.

## Inventario y preflight vigente en `.40`

- Inventario amplio a `2026-10-15T23:11:09.0149211Z`: **69 columnas / 42 tablas**, **40,751** celdas posteriores a hora México y **24,459** posteriores a UTC. Es conteo exploratorio con `NOLOCK`; incluye fechas futuras válidas y no define DML.
- Valores posteriores a UTC: `FACT_CSD.VIGENCIA_HASTA` (4), `PROMO_CAB.FCN_TER` (3), `PV_CTR_ORDS.FCNM` (92), `PV_OPV.FCNR` (1), `USUARIO_TOKEN.EXPIRES_AT` (24,359). Fechas de vigencia/promoción/token y `PV_OPV.FCNR` quedan excluidas; `PV_CTR_ORDS.FCNM` se conserva por ser fecha operativa de ORD.
- Whitelist estática ya filtrada: **31 campos / 25 tablas**, excluye las seis columnas que el API acepta desde DTO.
- `VALIDAR` exacto previo a la corrección: **28 campos activos / 22 tablas**, **5,324 celdas con llave**, **0 bloqueadas**, corte UTC `2026-10-15T23:30:07.5491579Z`, hash `3AB920E319390C93A46AF41331F6B220B517DADB67F648F462F1AD2A3ED550B2`.
- Dos lotes exactos anteriores (5,334/hash `B515D2DB...53D0E` y 5,325/hash `06E61570...786C4E`) abortaron dentro del guard con `ROLLBACK`; esos intentos no ejecutaron DML. Después el titular autorizó alcance dinámico acotado a la misma whitelist y regla UTC→México, con corte al inicio de transacción, ledger reversible y reporte final.
- APLICAR dinámico confirmado: batch `01B98172-A8AB-4897-9270-8FF063686682`; **5,094 celdas / 28 campos / 22 tablas**, **0 bloqueadas**. Corte UTC `2026-10-15T23:52:00.7518211`, México `2026-10-15T17:52:00.7518211-06:00`. Ledger `dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER`: 5,094 filas recuperables, 0 revertidas.
- Postflight con ese corte: 0 elegibles con llave, 0 bloqueadas; hash `8879D4F43C6364557039D6B69109547ED45D537C3A78BC972547224F029C4501`. Hash del plan aplicado reconstruido en lectura desde ledger y whitelist: `74E2EDE1A93C1C630FA7A59E2D94C9786BE59776B6458551E00A2991CE70548E`.
- Consulta confirmó `IOELOCAL` en `.40` como `ONLINE`, `FULL`, `MULTI_USER`, escritura habilitada. Consultas ejecutadas fueron de lectura y temporales. `.234` no se usó para el preflight ni recibió cambios.
- El corte y hash son temporales; recalcular `VALIDAR` antes de aplicar si hubo cambios de filas/whitelist. Inventario por campo y targets: [INVENTARIO_FECHAS_FUTURAS_IOELOCAL_20261015.md](INVENTARIO_FECHAS_FUTURAS_IOELOCAL_20261015.md).

## Coolify y sincronización Git

- Imagen activa verificada en ambos contenedores: `ioe-allinone:production-17feeb19a776-5163f2fbbfc6`, digest `sha256:a69914372cf624a04824a45516051929026ef9a648666767450d78f4e7d735f4`. Labels confirman API `17feeb19a776704adcdf457fa8ce5831730651c3` y App `5163f2fbbfc64d8f5c556bde825bda21bfeccf0d`; ambos `healthy`.
- API local `master` estaba 6 commits delante de `origin/master`; App, 1. El API local `a534075` solo registra documentación posterior al código ya incluido en la imagen; el fix temporal `2dd2e0f` y el manejo UI `5163f2f` ya están desplegados.
- VS Code **Sync Changes** publica commits locales a `origin`; no cambia por sí solo el `IOE_IMAGE` que ejecuta Compose. El flujo productivo versionado construye y activa una etiqueta de imagen conjunta de forma explícita. Los nuevos scripts SQL no se ejecutan al sincronizar ni al reconstruir imagen.

## Artefactos integrados

- `sql/2026-10-15_inventario_fechas_futuras_readonly.sql`: catálogo de columnas temporales y conteo de valores futuros; solo lectura, usa `NOLOCK`.
- `sql/2026-10-15_reparar_timestamps_evento_utc_mexico_guarded.sql`: whitelist estática; confirma defaults vivos; exige tablas/columnas y tipos esperados; modo predeterminado `VALIDAR`. Tiene dos rutas apagadas por defecto: lote exacto con corte/conteo/hash y modo dinámico, habilitable solo con autorización separada, misma whitelist fija, corte dentro de transacción, bloqueo de aplicación, transacción serializable, rechazo de filas sin llave y ledger reversible.
- `sql/2026-10-15_revertir_timestamps_evento_utc_mexico.sql`: reversa por `batch_id`; valida que cada llave exista una sola vez y que el valor actual siga igual al aplicado antes de restaurar el anterior.

## Aplicación ejecutada y trabajo pendiente

1. DML de timestamps ya aplicado solo a `.40`, bajo whitelist fija y la regla UTC→México autorizada. `.234` espejo no se tocó.
2. Si se decide revertir este lote, usar script de reversa con batch `01B98172-A8AB-4897-9270-8FF063686682`; no ejecutar otra migración con snapshots/hash anteriores.
3. UAT autenticada: preparar/editar/finalizar una devolución válida y conservar respuesta, correlation ID y logs asociados. Confirmar offset `-360`; no finalizar pago como parte de la validación.
4. Integrar todos los cambios fuente pendientes de API/App, reconstruir imagen conjunta y validar ambos SHAs, health y web. No afirmar activación de los escritores nuevos sin confirmar la imagen en Coolify.
5. La prevención SQL focalizada quedó aplicada en `.40` el 2026-10-16. La migración separada de Caja General/Retiros `sql/2026-10-16_retiros_caja_fecha_mexico.sql` sigue sin ejecutar; Git Sync y build no ejecutan SQL.

## Verificación del reloj — 2026-10-16

- Equipo Windows: `2026-10-16T08:46:22-06:00`; UTC `2026-10-16T14:46:22Z`; zona `Central Standard Time (Mexico)`.
- SQL `.40:1434/IOELOCAL`: `GETDATE()`/`SYSDATETIMEOFFSET()` reflejan reloj UTC, offset `+00:00`. La expresión `SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)'` devuelve hora México cerca de `08:45` con offset `-360`, igual al esperado por la validación del API.
- Estado vigente actualizado después de este snapshot: el fix API quedó integrado en `074ee21` y el remoto actual es `19ac67b`; ver «Prevención SQL aplicada en .40 — 2026-10-16» abajo para estado de SQL y runtime.
- Docker Desktop local no conectó al daemon; el runtime se inspeccionó por SSH en `.40`. La imagen activa sigue siendo `production-17feeb19a776-5163f2fbbfc6`; el código más reciente corrige dos escritores directos de fecha y aún no está activado.
- Primer build remoto de la imagen más reciente se detuvo antes de cargar candidato: la compilación temporal WASM alcanzó el límite cgroup `2 GiB` y dejó los compiladores esperando. Se agregó `--no-wasm-dry-run` al build JavaScript-only; reintento/corte y UAT siguen pendientes.

## Estado y límites

- El wrapper local falló al consultar el ledger después de recibir la respuesta de aplicación; no capturó el resultset final. No se repitió DML. Consulta independiente confirmó el ledger/batch; postflight read-only confirmó cero elegibles. Hash del plan se reconstruyó desde ledger y whitelist y quedó explícitamente identificado como reconstruido.
- El ledger conserva los valores anteriores; no se generó backup separado fuera de la base. El script de reversa no se ha ejecutado sobre este batch.
- `.234` no se consultó ni recibió escrituras. DML dirigido solo a `172.16.100.40:1434/IOELOCAL`.
- La causa técnica del 409 original es el guard de zona horaria de `85fa560` ante SQL UTC (`+00:00`); el fix `2dd2e0f` está en la imagen activa posterior. Falta correlation ID/log histórico, así que no hay enlace directo a la solicitud original.
- UAT de preparar/editar/finalizar sigue pendiente. Aún no se ha desplegado el candidato más reciente; la imagen activa y health fueron verificados remotamente.
- El modo predeterminado del script sigue `VALIDAR`; otros lotes requieren nueva autorización, corte/hash o autorización dinámica nueva, revisión de whitelist y ledger/postflight.

## Prevención SQL aplicada en `.40` — 2026-10-16

- Destino confirmado: `172.16.100.40:1434/IOELOCAL`, SQL Server `dd7842d7ba7e`, DB `ONLINE/READ_WRITE`; reloj del host SQL en UTC. La conversión `Central Standard Time (Mexico)` devolvió offset `-360` minutos.
- En una transacción se alteraron 11 SP: `sp_pvctrfolasvr_create`, `sp_pv_next_visible_folio`, `sp_pv_cotizacion_cerrar`, `sp_mb51_transmitir_folio`, `sp_fact_sync_folio_vf`, `sp_fact_cfdi_serie_reserve`, `sp_fact_cfdi_serie_update_status`, `sp_fact_cfdi_nc_reserve`, `sp_fact_cfdi_rel_reserve`, `sp_fact_unificacion_create` y `sp_fact_unificacion_reverse`.
- Se actualizaron defaults de `DAT_FOLIOS_CONSEC.FCNM`, `PV_DEV_DET_TMP.FCNR` y `FACT_CFDI_FOLIOS_DIARIOS.FCNC/FCNM` a UTC convertido a México. Solo afectan nuevas escrituras por default; no se actualizaron filas.
- Postflight dentro/fuera de transacción confirmó las 11 definiciones y los 4 defaults esperados; los SP corregidos no conservan `GETDATE()` para esos timestamps de sistema. `dataMigrated=false`; folio histórico no tocado y `.234` fuera.
- Se respaldaron definiciones/defaults y rollback verificable fuera de Git antes de aplicar. SHA-256 del plan SQL ejecutado: `21D2F1352582D127C27B6A4A4DC56D77850912CFA270A68F667BA44D4FF77830`; rollback: `5BBA3696B3D61C83AF688783371F3A0472CC28DD0D01309E778526BD2D27AEAF`.
- No se ejecutaron los scripts SQL completos que incluyen DDL/DML ajeno al alcance. En `sp_mb51_transmitir_folio` se conservó la lógica viva de conflictos y solo se cambió el reloj de proceso. El runtime API/App, despliegue conjunto y UAT no se verificaron.

## Reparacion historica del folio DF04-20261016 (2026-10-16)

- La aplicacion SQL preventiva anterior solo cambió escritores nuevos; dejó el folio histórico intacto (`dataMigrated=false`). Tras autorización del titular para `.40`, se corrigió el evento exacto en una transacción.
- Preflight fresco: `.40:1434/IOELOCAL`, servidor `dd7842d7ba7e`, DB `ONLINE/READ_WRITE`; SQL guarda reloj UTC y la conversión para México dio `-360` minutos. El cierre vivo confirma `FCNM` generado por proceso; el escritor MB51 confirma `FCND` desde el cierre y `FCNC` desde el reloj de proceso.
- Corregido de UTC naive a hora local del 15/10/2026: `PV_CTR_FOL_ASVR` (`FCN` `00:00:26.863`→`18:00:26.863`, `FCNM` `00:06:00.883`→`18:06:00.883`, 1 fila); `PV_CTR_FOL_FORM.FCN` (`00:06:00.883`→`18:06:00.883`, 1); `DAT_MB51.FCND/FCNC` (`00:06:00.883/01.180`→`18:06:00.883/01.180`, 2); `DAT_FOLIOS_CONSEC.FCNM` del CA (`00:06:00.983`→`18:06:00.983`, 1).
- Se conservaron ambos `IDFOL`, estado `MB51PROCES`, importes y movimientos. El contador CA conserva `FECHA=2026-10-16` y `ULTIMO_CONSEC=1`; el contador CP ya está en 8 por folios posteriores y no se reescribió. Esto evita alterar consecutivos existentes.
- Preflight/postflight no encontró registros de devolución, factura, CFDI ni control contable ligados a estos folios (`FAC_SVR_SHAP`, `FACT_TICKET_SHP`, `FACT_IDFOLDEV`, `PV_DEV_DET_TMP`, `DAT_CTRL_CTAS`: 0). `PV_TICKET_LOG.updated_at` (2 filas) quedó sin cambios: Flutter lo envía desde `DateTime.now()` y API acepta el campo por DTO; su zona/semántica requiere traza propia, no resta ciega de seis horas.
- Postflight read-only confirmó los valores del 15/10 en las 4 tablas aplicadas, `IOELOCAL ONLINE/READ_WRITE` y `@@TRANCOUNT=0`. No se tocaron `DAT_ART.STOCK`, `.234`, ni folios/fechas llave. UI/UAT aún sin revalidar visualmente.
- Respaldo/reversa fuera de Git: `C:\Users\DAVID\.codex\backups\ioe\historical_DF04_20261016_CP_0001_20261016`. Incluye `preimage.json`, `apply.sql`, `rollback.sql`, `execution.json` y `manifest.json`; SHA-256 de apply `7EE95C5339EF5A9857B4066EB710386121B042BE4E581EE0AF72D773FEFB8474`, rollback `0BEAC2E5B4C804051C24E285B33780AD11C4953C1CDAF9FB7652099392D2FC1F`, preimage `FB21A503E4AFA62DE5E73E7FB75D7BA27C37A6E28E85F90804EEE6929F6587CA`.

## Barrido adicional de fechas del 15/10 — OPV 5094 (2026-10-16)

- Confirmación viva en `.40`: `GETDATE()` equivale a `SYSUTCDATETIME()`; reloj SQL es UTC y `Central Standard Time (Mexico)` aplica `-360` minutos. El rango UTC sospechoso fue `2026-10-16 00:00` a `06:00`, que corresponde a 15/10 de 18:00 a medianoche en México.
- Preflight por llave y folio vinculó 10 `PV_CTR_ORDS.FCNMOD` y 12 `PV_TICKET_LOG.updated_at` con folios e historial del 15/10. Ambos grupos se corrigieron en transacción SERIALIZABLE con guardas exactas de preimagen/postimagen y reversa. Sumado al lote inicial: 132 timestamps en 110 filas físicas únicas; no se cambiaron importes, IDs de folio, llaves ni estados por esta corrección.
- Postflight final `2026-10-16T16:51:48Z`: PASS. Residual en ventana: `PV_CTR_ORDS.FCNMOD=0`, `PV_TICKET_LOG.updated_at=0`, `PV_CTR_ORDS.FCNS/FCNEN/HR_ENT=0`, folios `FCN/FCNM=0`, staging devolución `FCNR=0`, `DAT_MB51.FCNC=0`; facturación y CFDI, 0 candidatos. Permanecen seis `DAT_MB51.FCND` de tipo fecha, confirmados como operación local del 16/10, y cinco `DAT_RET_CTR_SVR.FCNR` como UTC por contrato; no se convierten.
- Caso DF04: `FCN/FCNM` del folio `DF04-20261016-CA-0001` y `updated_at` de sus dos renglones de ticket corresponden a 15/10 18:00–18:06 local. El ID `DF04-20261016-CP-0001` conserva `20261016` porque forma parte de la llave; no se renumera. MB51 ya estaba en 15/10. La actualización de ORD `FCNMOD=2026-10-16 10:03` local es posterior y válida.
- OPV 5094 en consulta final: FCN `2026-10-15`, estado `CERRADO`, DIF total `-$0.80`. Transferencia: venta `$9,040.40` (13 renglones), retiro `$10,445.40` (12), diferencia `-$1,405.00` registrada en `IMPE`, con `DIFD=0`. Los detalles de retiro no contienen llave de folio; hay dos renglones de `$1,405`, así que el exceso no se reasigna ni borra por fecha. `DAT_FORM_FIN` no fue actualizado por este DML; el estado `CERRADO` apareció durante la verificación.
- Causa futura: la API tenía cuatro escrituras directas con `GETDATE()` en `pvctrords.service.ts` (`FCNMOD` y `updated_at`). La fuente local y README/AGENT se ajustaron a UTC convertido explícitamente a hora México; `npm run build` pasó. Esta fuente no se desplegó: el pase productivo IOE exige API y App juntas; validar la imagen y UAT siguen pendientes.
- Evidencia, preimágenes y reversas privadas fuera de Git: `C:\Users\DAVID\.codex\backups\ioe\historical_event_ts_20261016_1792167449565` (`apply.sql`, `rollback.sql`, `apply_result.json`, `followup_preflight.json`, `followup_apply.sql`, `followup_rollback.sql`, `followup_apply_result.json`, `postflight.json`, `followup_postflight.json`).
