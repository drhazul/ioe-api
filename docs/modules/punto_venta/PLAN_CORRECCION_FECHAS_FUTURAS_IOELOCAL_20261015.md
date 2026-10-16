# Plan de corrección de timestamps de evento — IOELOCAL

Inventario amplio inicial: `2026-10-15T23:11:09.0149211Z` (`17:11:09` hora México). `VALIDAR` renovado en solo lectura: `2026-10-15T23:30:07.5491579Z` (`17:30:07.5491579` hora México). Destino: `.40` (`172.16.100.40:1434`), `IOELOCAL` en `dd7842d7ba7e`, `ONLINE` y `FULL`. `.234` es espejo en `RESTORING`; queda fuera de esta corrección.

**Estado:** corrección dinámica autorizada y aplicada en `.40`; resultado y límites abajo. La causa del HTTP 409 de preparación de devolución continúa sin confirmar y no se presume vinculada a estas fechas.

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
- El código puede emitir 409 al faltar una línea seleccionada con `CTDD > 0`, por conflictos de validación/estado, o por offset operativo distinto de `-360`. Falta el cuerpo JSON de respuesta o el log asociado a la solicitud para discriminar.
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
3. Para resolver el 409 original, reproducir preparar devolución con sesión autenticada y conservar respuesta JSON, correlation ID y logs de API/Coolify del mismo minuto. Validar elegibilidad de líneas, estado y offset; solo entonces corregir la condición identificada.
4. Ejecutar UAT autenticada de preparar/editar/finalizar devolución después de investigar el 409. Ninguna evidencia disponible confirma aún que ese flujo quedó reparado.
5. Activar la prevención de timestamps: revisar/commitear cambios pendientes de API y App sin descartar trabajo, reconstruir imagen conjunta y validar ambas imágenes, health y web en Coolify. El estado vigente de despliegue marca build/corte/UAT pendientes; no afirmar despliegue activo hasta postflight.

## Verificación del reloj — 2026-10-16

- Equipo Windows: `2026-10-16T08:46:22-06:00`; UTC `2026-10-16T14:46:22Z`; zona `Central Standard Time (Mexico)`.
- SQL `.40:1434/IOELOCAL`: `GETDATE()`/`SYSDATETIMEOFFSET()` reflejan reloj UTC, offset `+00:00`. La expresión `SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)'` devuelve hora México cerca de `08:45` con offset `-360`, igual al esperado por la validación del API.
- En el checkout API, modificaciones sin commit reemplazan `GETDATE()` por conversión UTC→México para el folio fallback y `PV_DEV_DET_TMP.FCNR`. `HEAD=40eb010`, `master` siete commits delante de `origin/master`; esos cambios no están en un commit publicado.
- Docker Desktop local no conectó al daemon. No se leyó runtime/imagen Coolify, por lo que no se confirma qué versión genera nuevas escrituras en producción. La migración del ledger corrige filas existentes solamente; sin desplegar y verificar el escritor, el problema puede reaparecer.
- Este hallazgo no prueba que el timestamp causara el 409 de `detalle/preparar`; la causa del 409 y el UAT siguen pendientes.

## Estado y límites

- El wrapper local falló al consultar el ledger después de recibir la respuesta de aplicación; no capturó el resultset final. No se repitió DML. Consulta independiente confirmó el ledger/batch; postflight read-only confirmó cero elegibles. Hash del plan se reconstruyó desde ledger y whitelist y quedó explícitamente identificado como reconstruido.
- El ledger conserva los valores anteriores; no se generó backup separado fuera de la base. El script de reversa no se ha ejecutado sobre este batch.
- `.234` no se consultó ni recibió escrituras. DML dirigido solo a `172.16.100.40:1434/IOELOCAL`.
- La causa del 409 original sigue **sin confirmar**. Auditoría consultada no tenía `PV_DEV_PREPARE_ERROR` de ese evento y no se recuperó log histórico del contenedor previo.
- UAT de preparar/editar/finalizar devolución sigue pendiente. El estado vigente de `docs/COOLIFY_SEGUIMIENTO.md` y `docs/COOLIFY_PLAN.md` deja build/corte/UAT de la reconstrucción conjunta pendientes. El daemon local no permitió verificar runtime; no se hizo un despliegue nuevo.
- El modo predeterminado del script sigue `VALIDAR`; otros lotes requieren nueva autorización, corte/hash o autorización dinámica nueva, revisión de whitelist y ledger/postflight.
