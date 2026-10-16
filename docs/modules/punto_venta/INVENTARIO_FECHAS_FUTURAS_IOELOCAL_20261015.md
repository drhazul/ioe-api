# Inventario vivo de timestamps futuros — IOELOCAL

- Corte del inventario amplio (consulta inicial): 2026-10-15T23:11:09.0149211 UTC (2026-10-15T17:11:09.0149211 hora México). La consulta filtrada más reciente se documenta debajo; el inventario amplio no se volvió a ejecutar.
- Destino SQL: `DB_HOST:DB_PORT` del `.env` primario = `172.16.100.40:1434`, base `IOELOCAL`, servidor `dd7842d7ba7e`; estado `ONLINE`, recuperación `FULL`, multiusuario y lectura/escritura habilitada.
- 69 columnas en 42 tablas con algún valor posterior al reloj México; suma de celdas candidatas: 40751. También hay 24459 posteriores a UTC. Una fila puede contarse en varias columnas.
- Exploración usa `NOLOCK`; RCSI=false; aislamiento snapshot=OFF. Conteos son preliminares y pueden variar con actividad concurrente.
- Regla del titular: UTC→México solo para timestamps de evento alimentados por reloj de sistema al crear/insertar el registro. Fechas de negocio futuras, entrega ORD, vigencias y expiraciones se preservan.
- Conteo amplio clasifica todas las columnas temporales futuras; no significa que todas sean corruptas ni elegibles para DML.

## Ajuste de alcance tras aclaración del titular

Solo considerar campos asignados por reloj del sistema y no editables por el usuario. La revisión de DTO/servicios detectó seis campos editables en la whitelist del primer preflight: `DAT_MB51.FCNC`, `PV_CTR_FOL_ASVR.FCNM` y `PV_CTR_ORDS.FCNRT`, `FCNAS`, `FCNTD`, `FCNMOD`. Se excluyeron del script de avance y de su whitelist de reversa, aunque algunos también reciban `GETDATE()` en flujos automáticos.

Whitelist estática de código: 31 campos/25 tablas. El `VALIDAR` exacto más reciente antes de aplicar contó 5,324 celdas con llave en 28 campos/22 tablas; 0 bloqueadas. Corte UTC `2026-10-15T23:30:07.5491579Z`, hora México `2026-10-15T17:30:07.5491579`, hash `3AB920E319390C93A46AF41331F6B220B517DADB67F648F462F1AD2A3ED550B2`. Dos intentos con aprobaciones exactas anteriores (`B515D2DB...53D0E`, después `06E61570...786C4E`) detectaron deriva de conteo/hash dentro del guard y abortaron con rollback, sin DML ni ledger. Diferencias entre snapshots: `DAT_FOLIOS_CONSEC.FCNM` 15→7, `REC_BORRADOR_REC.FCNM` 1→0 y `PV_TICKET_LOG.updated_at` 711→710. Este preflight queda como histórico; la autorización posterior cubrió alcance dinámico acotado con la misma whitelist y regla.

Destino confirmado por el titular: corregir solo `IOELOCAL` en `172.16.100.40:1434`. `192.168.10.234` es espejo en `RESTORING`; no es destino de esta corrección ni se modificó. La conexión a `.40` se verificó en solo lectura.

### Resultado del APLICAR dinámico en `.40`

- Lote confirmado: `01B98172-A8AB-4897-9270-8FF063686682`. Se actualizaron **5,094 celdas** en **28 campos / 22 tablas**; 0 bloqueadas. La transacción guardó los valores anteriores en `dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER` antes del cambio; quedan 5,094 entradas reversibles y ninguna marcada como revertida.
- Corte capturado dentro de la transacción: UTC `2026-10-15T23:52:00.7518211`; México `2026-10-15T17:52:00.7518211-06:00`.
- El postflight con el mismo corte encontró **0 celdas elegibles con llave y 0 bloqueadas**, hash `8879D4F43C6364557039D6B69109547ED45D537C3A78BC972547224F029C4501`.
- El hash del plan aplicado no llegó al reporte del wrapper local porque falló después de terminar la consulta de aplicación, al consultar el ledger. La aplicación y el commit se confirmaron por el ledger y postflight; el hash se reconstruyó en solo lectura desde el ledger y whitelist: `74E2EDE1A93C1C630FA7A59E2D94C9786BE59776B6458551E00A2991CE70548E`. No se repitió DML.
- `.234` no se consultó ni modificó para esta corrección. No se hizo backup separado fuera de la base; el ledger es la fuente de reversa del lote.

### Reloj actual y riesgo de recurrencia (2026-10-16)

- Windows: `2026-10-16T08:46:22-06:00`; UTC `2026-10-16T14:46:22Z`; zona `Central Standard Time (Mexico)`.
- SQL `.40`: `GETDATE()`/`SYSDATETIMEOFFSET()` indican reloj UTC (`+00:00`). La expresión usada por devoluciones convirtió UTC a hora México y devolvió offset `-360`, esperado por el guard de `loadSqlProcessNow`.
- Checkout API tiene cambios aún sin commit que sustituyen `GETDATE()` por conversión UTC→México en el folio fallback y `PV_DEV_DET_TMP.FCNR`. El API sigue en `HEAD=40eb010`, siete commits delante de `origin/master`; esos dos reemplazos están solo en working tree.
- El daemon Docker local no respondió; no se verificó la imagen activa de Coolify. Hasta desplegar/confirmar el código que corrige esos escritores, nuevas filas pueden volver a guardar UTC como hora naive. La reparación de datos fue puntual; no garantiza prevención.
- Causa del HTTP 409 original sigue sin confirmar y no se demuestra relacionada con la zona horaria.

### Inventario amplio por campo (corte 17:11 hora México)

Conteo amplio de campos temporales; incluye fechas válidas de negocio, editables y timestamps que no califican para corrección. No equivale al alcance DML.

| Tabla.campo | > México | > UTC |
|---|---:|---:|
| `AUDIT_LOG.FCNR` | 6649 | 0 |
| `CTROL_TRAMISIONES.FNCT` | 257 | 0 |
| `DAT_ART_MASIVA_TMP.CREADO_EN` | 1455 | 0 |
| `DAT_ART_MASIVA_TMP.PROCESADO_EN` | 1455 | 0 |
| `DAT_CONT_AJUSTE_LOG.FCNR` | 1 | 0 |
| `DAT_CONT_CAPTURA.FCNR` | 5 | 0 |
| `DAT_CONT_CTRL.FCNC` | 1 | 0 |
| `DAT_CTR_DOC.FCND` | 3 | 0 |
| `DAT_CTRL_CTAS.FCND` | 9 | 0 |
| `DAT_FOLIOS_CONSEC.FCNM` | 15 | 0 |
| `DAT_MB51.FCNC` | 1066 | 0 |
| `DAT_MB51.FCND` | 1005 | 0 |
| `DAT_RET_CTR_SVR.FCNR` | 7 | 0 |
| `DOC_CTRL_MERMA.FCND` | 1 | 0 |
| `DOC_CTRL_MERMA.FCNM` | 1 | 0 |
| `FAC_CTRL_GRUP_MASV.FCNCREA` | 7 | 0 |
| `FAC_SVR_SHAP.CFDI_F_TIMBRADO` | 12 | 0 |
| `FAC_SVR_SHAP.FCN` | 51 | 0 |
| `FAC_SVR_SHAP.FCNF` | 12 | 0 |
| `FACT_CFDI_EMAIL_OUTBOX.ACTUALIZADO_EN` | 11 | 0 |
| `FACT_CFDI_EMAIL_OUTBOX.CREADO_EN` | 11 | 0 |
| `FACT_CFDI_EMAIL_OUTBOX.ENVIADO_EN` | 11 | 0 |
| `FACT_CFDI_FOLIOS_DIARIOS.FCN_TIMBRADO` | 12 | 0 |
| `FACT_CFDI_FOLIOS_DIARIOS.FCNC` | 11 | 0 |
| `FACT_CFDI_FOLIOS_DIARIOS.FCNM` | 12 | 0 |
| `FACT_CLIENT_SHP.FCNR` | 1 | 0 |
| `FACT_CSD.VIGENCIA_HASTA` | 4 | 4 |
| `PROMO_CAB.FCN_TER` | 3 | 3 |
| `PROMO_TICKET_DESC_APLI.FCNDES` | 71 | 0 |
| `PV_CTR_FOL_ASVR.FCN` | 232 | 0 |
| `PV_CTR_FOL_ASVR.FCNM` | 243 | 0 |
| `PV_CTR_FOL_FORM.FCN` | 205 | 0 |
| `PV_CTR_ORDS.FCN_AUT_CYM` | 9 | 0 |
| `PV_CTR_ORDS.FCNAS` | 145 | 0 |
| `PV_CTR_ORDS.FCNEN` | 85 | 0 |
| `PV_CTR_ORDS.FCNM` | 101 | 92 |
| `PV_CTR_ORDS.FCNMOD` | 279 | 0 |
| `PV_CTR_ORDS.FCNRT` | 134 | 0 |
| `PV_CTR_ORDS.FCNS` | 167 | 0 |
| `PV_CTR_ORDS.FCNTD` | 144 | 0 |
| `PV_CTR_ORDS.HR_ENT` | 85 | 0 |
| `PV_CTR_ORDS_ENTREGA.FCN_ALTA` | 36 | 0 |
| `PV_CTR_ORDS_ENTREGA_DET.FCN_ALTA` | 84 | 0 |
| `PV_CTR_ORDS_FLUJO_HIST.FCNR` | 1254 | 0 |
| `PV_DEV_DET_TMP.FCNR` | 44 | 0 |
| `PV_OPV.FCNR` | 1 | 1 |
| `PV_ORD_CAMBIO_MERMA_PRECIO.FCN_ALT` | 9 | 0 |
| `PV_ORD_CAMBIO_MERMA_PRECIO.FCN_MOD` | 9 | 0 |
| `PV_ORD_CAMBIO_MERMA_TMP.FCN_ALT` | 10 | 0 |
| `PV_ORD_CAMBIO_MERMA_TMP.FCN_MOD` | 10 | 0 |
| `PV_TICKET_LOG.updated_at` | 729 | 0 |
| `REC_BORRADOR_REC.FCNM` | 2 | 0 |
| `REC_CAB_PED.FCNC` | 2 | 0 |
| `REC_CAB_PED.FCNP` | 1 | 0 |
| `REC_CAB_PED.FCNR` | 2 | 0 |
| `REC_CTO_HIST.FCN` | 19 | 0 |
| `REC_CTRL_DOC_REC.FCN_AUTORIZA` | 2 | 0 |
| `REC_CTRL_DOC_REC.FCN_FISICA` | 2 | 0 |
| `REC_CTRL_DOC_REC.FCNC` | 2 | 0 |
| `REC_GUIA_PED.FCNR` | 2 | 0 |
| `REF_DETALLE.FCNR` | 67 | 0 |
| `TRAN_CTR_DOCPRE.FCNC` | 2 | 0 |
| `TRAN_CTR_DOCPRE.FCND` | 1 | 0 |
| `TRAN_CTR_DOCPRE.FCNM` | 2 | 0 |
| `TRAN_DET_ART.FCN_CONT` | 4 | 0 |
| `TRAN_EVID.FCN` | 1 | 0 |
| `TRAN_PAQ_ENV.FCN` | 1 | 0 |
| `TRAN_PAQ_ENV.FENV` | 1 | 0 |
| `USUARIO_TOKEN.EXPIRES_AT` | 24464 | 24359 |

### Targets activos del VALIDAR exacto previo (histórico; corte 17:30 hora México)

| Tabla.campo | Celdas | Estado |
|---|---:|---|
| `DAT_ART_MASIVA_TMP.CREADO_EN` | 1455 | LISTO PARA REVISION |
| `DAT_ART_MASIVA_TMP.PROCESADO_EN` | 1455 | LISTO PARA REVISION |
| `DAT_CONT_CAPTURA.FCNR` | 5 | LISTO PARA REVISION |
| `DAT_FOLIOS_CONSEC.FCNM` | 7 | LISTO PARA REVISION |
| `DOC_CTRL_MERMA.FCNM` | 1 | LISTO PARA REVISION |
| `FAC_SVR_SHAP.CFDI_F_TIMBRADO` | 15 | LISTO PARA REVISION |
| `FAC_SVR_SHAP.FCNF` | 15 | LISTO PARA REVISION |
| `FACT_CFDI_EMAIL_OUTBOX.ACTUALIZADO_EN` | 14 | LISTO PARA REVISION |
| `FACT_CFDI_EMAIL_OUTBOX.CREADO_EN` | 14 | LISTO PARA REVISION |
| `FACT_CFDI_FOLIOS_DIARIOS.FCN_TIMBRADO` | 15 | LISTO PARA REVISION |
| `FACT_CFDI_FOLIOS_DIARIOS.FCNC` | 14 | LISTO PARA REVISION |
| `FACT_CFDI_FOLIOS_DIARIOS.FCNM` | 15 | LISTO PARA REVISION |
| `PROMO_TICKET_DESC_APLI.FCNDES` | 68 | LISTO PARA REVISION |
| `PV_CTR_ORDS.FCN_AUT_CYM` | 10 | LISTO PARA REVISION |
| `PV_CTR_ORDS_ENTREGA.FCN_ALTA` | 39 | LISTO PARA REVISION |
| `PV_CTR_ORDS_ENTREGA_DET.FCN_ALTA` | 93 | LISTO PARA REVISION |
| `PV_CTR_ORDS_FLUJO_HIST.FCNR` | 1288 | LISTO PARA REVISION |
| `PV_DEV_DET_TMP.FCNR` | 49 | LISTO PARA REVISION |
| `PV_ORD_CAMBIO_MERMA_PRECIO.FCN_ALT` | 10 | LISTO PARA REVISION |
| `PV_ORD_CAMBIO_MERMA_TMP.FCN_ALT` | 10 | LISTO PARA REVISION |
| `PV_ORD_CAMBIO_MERMA_TMP.FCN_MOD` | 10 | LISTO PARA REVISION |
| `PV_TICKET_LOG.updated_at` | 710 | LISTO PARA REVISION |
| `REC_CTRL_DOC_REC.FCN_AUTORIZA` | 2 | LISTO PARA REVISION |
| `REC_GUIA_PED.FCNR` | 2 | LISTO PARA REVISION |
| `TRAN_CTR_DOCPRE.FCNM` | 2 | LISTO PARA REVISION |
| `TRAN_DET_ART.FCN_CONT` | 4 | LISTO PARA REVISION |
| `TRAN_EVID.FCN` | 1 | LISTO PARA REVISION |
| `TRAN_PAQ_ENV.FCN` | 1 | LISTO PARA REVISION |

No incluir `DAT_MB51.FCNC`, `PV_CTR_FOL_ASVR.FCNM` ni fechas editables de `PV_CTR_ORDS`. Fechas futuras de entrega, vigencias, promociones, tokens y otros valores sin fuente autoritativa permanecen fuera del DML. La tabla anterior es snapshot exacto previo y no representa el conteo aplicado, que quedó registrado arriba.

Chequeo read-only previo: el login permitía actualizar las tablas activas y crear tabla. El ledger ahora existe por el lote aplicado; no reutilizar conteos/hash históricos como autorización para nuevas ejecuciones.

## Valores posteriores al reloj UTC (corte histórico, supersedido)

- `FACT_CSD.VIGENCIA_HASTA`: 4 valor(es) posteriores a UTC
- `PROMO_CAB.FCN_TER`: 3 valor(es) posteriores a UTC
- `PV_CTR_ORDS.FCNM`: 75 valor(es) posteriores a UTC
- `PV_OPV.FCNR`: 1 valor(es) posteriores a UTC
- `USUARIO_TOKEN.EXPIRES_AT`: 24153 valor(es) posteriores a UTC

## Preflight histórico del script (VALIDAR, solo lectura; supersedido)

- Corte UTC: `2026-10-15T21:03:11.063Z`; hora México: `2026-10-15T15:03:11.063`.
- Celdas elegibles con llave: 7715; bloqueadas sin llave: 1; hash por whitelist, llaves y valores: `8FEBBD1DCDA796038CA9E9A5C1F73FE276E3ACA4AE04DD5F1D8AB8D769F57211`.
- Targets: 37 columnas en 27 tablas. El modo fue `VALIDAR` (APLICAR=false); no hubo DML.
- Alcance de whitelist revisada:

- `DAT_ART_MASIVA_TMP`: CREADO_EN (1455), PROCESADO_EN (1455)
- `DAT_CONT_CAPTURA`: FCNR (296)
- `DAT_CONT_CTRL`: FCNR (1)
- `DAT_CONT_UPLOAD_ITEMS`: FCNR (2)
- `DAT_FOLIOS_CONSEC`: FCNM (16)
- `DAT_MB51`: FCNC (980)
- `DOC_CTRL_MERMA`: FCNM (1)
- `FAC_SVR_SHAP`: CFDI_F_TIMBRADO (9), FCNF (9)
- `FACT_CFDI_EMAIL_OUTBOX`: ACTUALIZADO_EN (9), CREADO_EN (9)
- `FACT_CFDI_FOLIOS_DIARIOS`: FCN_TIMBRADO (9), FCNC (9), FCNM (9)
- `PROMO_TICKET_DESC_APLI`: FCNDES (86)
- `PV_CTR_FOL_ASVR`: FCNM (280)
- `PV_CTR_ORDS`: FCN_AUT_CYM (8), FCNAS (143), FCNMOD (278), FCNRT (101), FCNTD (130)
- `PV_CTR_ORDS_ENTREGA`: FCN_ALTA (37)
- `PV_CTR_ORDS_ENTREGA_DET`: FCN_ALTA (80)
- `PV_CTR_ORDS_FLUJO_HIST`: FCNR (1350)
- `PV_DEV_DET_TMP`: FCNR (18)
- `PV_ORD_CAMBIO_MERMA_PRECIO`: FCN_ALT (8)
- `PV_ORD_CAMBIO_MERMA_TMP`: FCN_ALT (9), FCN_MOD (9)
- `PV_TICKET_LOG`: updated_at (891)
- `REC_BORRADOR_REC`: FCNM (1)
- `REC_CTRL_DOC_REC`: FCN_AUTORIZA (3)
- `REC_GUIA_PED`: FCNR (5)
- `TRAN_CTR_DOCPRE`: FCNM (3)
- `TRAN_DET_ART`: FCN_CONT (5)
- `TRAN_EVID`: FCN (1)
- `TRAN_PAQ_ENV`: FCN (1)
- `DAT_CONT_CTRL.FCNR` queda bloqueada: fila con default de reloj, pero sin llave única para reversa exacta.
- Repetir `VALIDAR` antes de cualquier ejecución; hash/corte corresponden solo a este preflight y caducan si cambian filas o whitelist.

## Inventario histórico con clasificación de origen (conteos supersedidos)

| Tabla.campo | Tipo | > México | > UTC | Mínimo | Máximo | Default | Llave estable | Escritor localizado | Decisión preliminar |
|---|---|---:|---:|---|---|---|---|---|---|
| `AUDIT_LOG.FCNR` | datetime2 | 7679 | 0 | 2026-10-15T15:03:12 | 2026-10-15T21:03:08 | (sysdatetime()) | PK PK__AUDIT_LO__95D716204DF06EFE([IDLOG]) |  | EXCLUIR/BLOQUEAR: Auditoría: preservar contrato UTC; fuente repo y default vivo difieren |
| `CTROL_TRAMISIONES.FNCT` | datetime | 310 | 0 | 2026-10-15T15:05:26.250 | 2026-10-15T21:02:55.093 |  | PK PK__CTROL_TR__3214EC275B04046B([ID]) |  | PENDIENTE: trazar escritor/semántica |
| `DAT_ART_MASIVA_TMP.CREADO_EN` | datetime2 | 1455 | 0 | 2026-10-15T17:50:18 | 2026-10-15T19:36:07 | (sysutcdatetime()) | PK PK_DAT_ART_MASIVA_TMP([ID]) |  | CANDIDATO: default de reloj de sistema |
| `DAT_ART_MASIVA_TMP.PROCESADO_EN` | datetime2 | 1455 | 0 | 2026-10-15T17:50:18 | 2026-10-15T19:36:07 |  | PK PK_DAT_ART_MASIVA_TMP([ID]) | sp_datart_massive_apply | CANDIDATO: el SP fija `@AHORA=SYSUTCDATETIME()`; no es entrada del DTO |
| `DAT_CONT_CAPTURA.FCNR` | datetime | 296 | 0 | 2026-10-15T15:35:55.587 | 2026-10-15T18:37:00.353 | (getdate()) | PK PK__DAT_CONT__3214EC27486843B4([ID]) |  | CANDIDATO: default de reloj de sistema |
| `DAT_CONT_CTRL.FCNR` | datetime2 | 1 | 0 | 2026-10-15T15:23:27.1028072 | 2026-10-15T15:23:27.1028072 | (sysdatetime()) | SIN_LLAVE_UNICA |  | CANDIDATO: default de reloj de sistema |
| `DAT_CONT_UPLOAD_ITEMS.FCNR` | datetime2 | 2 | 0 | 2026-10-15T15:23:33.5518017 | 2026-10-15T15:23:33.5518017 | (sysdatetime()) | PK PK_DAT_CONT_UPLOAD_ITEMS([ID]) |  | CANDIDATO: default de reloj de sistema |
| `DAT_CTR_DOC.FCND` | datetime | 5 | 0 | 2026-10-15T15:14:33.393 | 2026-10-15T19:03:06.830 |  | PK PK_DATCTRDOC([DOC]) |  | PENDIENTE: trazar escritor/semántica |
| `DAT_CTRL_CTAS.FCND` | datetime | 10 | 0 | 2026-10-15T15:14:33.397 | 2026-10-15T20:20:54.573 |  | PK PK_DATCTRCTAS([NDOC]) |  | PENDIENTE: trazar escritor/semántica |
| `DAT_FOLIOS_CONSEC.FCNM` | datetime | 16 | 0 | 2026-10-15T15:28:18.010 | 2026-10-15T21:02:54.833 | (getdate()) | UQ UX_DAT_FOLIOS_CONSEC_SUC_FECHA_TIPO([SUC],[FECHA],[TIPO_FOLIO]) | sp_pv_next_visible_folio | CANDIDATO: default de reloj de sistema |
| `DAT_MB51.FCNC` | datetime | 980 | 0 | 2026-10-15T15:05:26.250 | 2026-10-15T21:02:55.093 |  | PK PK_DATMB51([IDPD]) | sp_merma_contabilizar; API genérica | EXCLUIR: `dto.FCNC` se acepta en alta/actualización |
| `DAT_MB51.FCND` | datetime | 948 | 0 | 2026-10-15T15:05:26.013 | 2026-10-15T21:02:54.730 |  | PK PK_DATMB51([IDPD]) |  | PENDIENTE: trazar escritor/semántica |
| `DAT_RET_CTR_SVR.FCNR` | datetime | 3 | 0 | 2026-10-15T19:46:13.457 | 2026-10-15T20:18:14.320 |  | PK PK_DATRETCTRSVR([IDRET]) |  | PENDIENTE: trazar escritor/semántica |
| `DOC_CTRL_MERMA.FCND` | datetime | 1 | 0 | 2026-10-15T19:20:44.443 | 2026-10-15T19:20:44.443 |  | PK PK_DOCMER([DOCMER]) |  | PENDIENTE: trazar escritor/semántica |
| `DOC_CTRL_MERMA.FCNM` | datetime | 1 | 0 | 2026-10-15T19:29:29.730 | 2026-10-15T19:29:29.730 |  | PK PK_DOCMER([DOCMER]) | sp_merma_agregar_articulo, sp_merma_solicitar_autorizacion, sp_merma_revisar, sp_merma_contabilizar, sp_merma_anular, sp_merma_auditar | CANDIDATO: escritor usa reloj de sistema |
| `FAC_CTRL_GRUP_MASV.FCNCREA` | datetime | 5 | 0 | 2026-10-15T16:31:22.987 | 2026-10-15T20:44:11.020 |  | PK PK_GRUPMAS([GRUPMAS]) |  | PENDIENTE: trazar escritor/semántica |
| `FAC_SVR_SHAP.CFDI_F_TIMBRADO` | datetime | 9 | 0 | 2026-10-15T18:57:07.443 | 2026-10-15T20:44:44.197 |  | PK PK_IDFOL([IDFOL]) | facturacion.service.ts: GETDATE() | CANDIDATO: escritor usa reloj de sistema |
| `FAC_SVR_SHAP.FCN` | datetime | 68 | 0 | 2026-10-15T15:12:55.653 | 2026-10-15T21:02:54.730 |  | PK PK_IDFOL([IDFOL]) |  | PENDIENTE: trazar escritor/semántica |
| `FAC_SVR_SHAP.FCNF` | datetime | 9 | 0 | 2026-10-15T18:57:07.443 | 2026-10-15T20:44:44.197 |  | PK PK_IDFOL([IDFOL]) | facturacion.service.ts: GETDATE() | CANDIDATO: escritor usa reloj de sistema |
| `FACT_CFDI_EMAIL_OUTBOX.ACTUALIZADO_EN` | datetime2 | 9 | 0 | 2026-10-15T18:58:02 | 2026-10-15T20:45:01 | (sysdatetime()) | PK PK_FACT_CFDI_EMAIL_OUTBOX([ID]) |  | CANDIDATO: default de reloj de sistema |
| `FACT_CFDI_EMAIL_OUTBOX.CREADO_EN` | datetime2 | 9 | 0 | 2026-10-15T18:57:08 | 2026-10-15T20:44:44 | (sysdatetime()) | PK PK_FACT_CFDI_EMAIL_OUTBOX([ID]) |  | CANDIDATO: default de reloj de sistema |
| `FACT_CFDI_EMAIL_OUTBOX.ENVIADO_EN` | datetime2 | 9 | 0 | 2026-10-15T18:58:02 | 2026-10-15T20:45:01 |  | PK PK_FACT_CFDI_EMAIL_OUTBOX([ID]) |  | PENDIENTE: trazar escritor/semántica |
| `FACT_CFDI_FOLIOS_DIARIOS.FCN_TIMBRADO` | datetime | 9 | 0 | 2026-10-15T18:57:07.447 | 2026-10-15T20:44:44.203 |  | PK PK_FACT_CFDI_FOLIOS_DIARIOS([ID]) | sp_fact_cfdi_serie_update_status | CANDIDATO: el SP asigna `GETDATE()` al cambiar a TIMBRADO; no acepta fecha del DTO |
| `FACT_CFDI_FOLIOS_DIARIOS.FCNC` | datetime | 9 | 0 | 2026-10-15T16:44:28.407 | 2026-10-15T20:44:41.813 | (getdate()) | PK PK_FACT_CFDI_FOLIOS_DIARIOS([ID]) |  | CANDIDATO: default de reloj de sistema |
| `FACT_CFDI_FOLIOS_DIARIOS.FCNM` | datetime | 9 | 0 | 2026-10-15T18:57:07.447 | 2026-10-15T20:44:44.203 | (getdate()) | PK PK_FACT_CFDI_FOLIOS_DIARIOS([ID]) | sp_fact_cfdi_serie_reserve, sp_fact_cfdi_serie_update_status | CANDIDATO: default de reloj de sistema |
| `FACT_CLIENT_SHP.FCNR` | datetime | 1 | 0 | 2026-10-15T20:27:19.263 | 2026-10-15T20:27:19.263 |  | PK PK_IDC([IDC]) |  | PENDIENTE: trazar escritor/semántica |
| `FACT_CSD.VIGENCIA_HASTA` | datetime2 | 4 | 4 | 2027-05-15T11:02:34 | 2029-10-18T09:35:10 |  | PK PK_FACT_CSD([ID]) |  | EXCLUIR/BLOQUEAR: Vigencia CSD válida a futuro |
| `PROMO_CAB.FCN_TER` | datetime | 3 | 3 | 2026-12-31T00:00:00 | 2027-01-01T00:00:00 |  | PK PK_IDPROMCAB([ID_PROM]) |  | EXCLUIR/BLOQUEAR: Fin de promoción válida a futuro |
| `PROMO_TICKET_DESC_APLI.FCNDES` | datetime | 86 | 0 | 2026-10-15T15:24:56.457 | 2026-10-15T20:52:44.450 | (getdate()) | PK PK_PROMO_TICKET_DESC_APLI([ID_APLI]) |  | CANDIDATO: default de reloj de sistema |
| `PV_CTR_FOL_ASVR.FCN` | datetime | 253 | 0 | 2026-10-15T15:10:48.887 | 2026-10-15T21:02:36.030 |  | PK PK_CTR_FOL([IDFOL]) |  | PENDIENTE: trazar escritor/semántica |
| `PV_CTR_FOL_ASVR.FCNM` | datetime | 280 | 0 | 2026-10-15T15:05:26.013 | 2026-10-15T21:02:54.730 |  | PK PK_CTR_FOL([IDFOL]) | API create/update | EXCLUIR: `dto.FCNM` se acepta en alta/actualización |
| `PV_CTR_FOL_FORM.FCN` | datetime | 245 | 0 | 2026-10-15T15:05:26.013 | 2026-10-15T21:02:54.730 |  | PK PK_PVCTRFOLFORM([IDF]) |  | PENDIENTE: trazar escritor/semántica |
| `PV_CTR_ORDS.FCN_AUT_CYM` | datetime | 8 | 0 | 2026-10-15T15:14:33.580 | 2026-10-15T20:06:46.440 |  | PK PK_PVCTRORDS([IORD]) | ordenes-trabajo.service.ts | CANDIDATO: servicio fija `GETDATE()` al autorizar cambio/merma; no acepta fecha en DTO |
| `PV_CTR_ORDS.FCNAS` | datetime | 143 | 0 | 2026-10-15T15:04:00.133 | 2026-10-15T20:57:23.793 |  | PK PK_PVCTRORDS([IORD]) | API update DTO; SP de asignación | EXCLUIR: `dto.FCNAS` se acepta en actualización |
| `PV_CTR_ORDS.FCNEN` | datetime | 81 | 0 | 2026-10-15T15:04:25.143 | 2026-10-15T20:27:51.297 |  | PK PK_PVCTRORDS([IORD]) | sp_ordenes_trabajo_entregar_lote | CANDIDATO: escritor usa reloj de sistema |
| `PV_CTR_ORDS.FCNM` | datetime | 82 | 75 | 2026-10-15T18:00:00 | 2026-10-22T00:00:00 |  | PK PK_PVCTRORDS([IORD]) |  | EXCLUIR/BLOQUEAR: Fecha operativa/entrega futura, no timestamp de alta |
| `PV_CTR_ORDS.FCNMOD` | datetime | 278 | 0 | 2026-10-15T15:04:25.143 | 2026-10-15T21:01:36.950 |  | PK PK_PVCTRORDS([IORD]) | API update DTO; SP de órdenes | EXCLUIR: `dto.FCNMOD` se acepta en actualización |
| `PV_CTR_ORDS.FCNRT` | datetime | 101 | 0 | 2026-10-15T15:04:18.073 | 2026-10-15T20:57:31.807 |  | PK PK_PVCTRORDS([IORD]) | API update DTO; SP de recepción | EXCLUIR: `dto.FCNRT` se acepta en actualización |
| `PV_CTR_ORDS.FCNS` | datetime | 217 | 0 | 2026-10-15T15:05:36.843 | 2026-10-15T21:01:47.140 |  | PK PK_PVCTRORDS([IORD]) |  | PENDIENTE: trazar escritor/semántica |
| `PV_CTR_ORDS.FCNTD` | datetime | 130 | 0 | 2026-10-15T15:50:39.623 | 2026-10-15T20:48:03.177 |  | PK PK_PVCTRORDS([IORD]) | API update DTO; SP trabajo terminado | EXCLUIR: `dto.FCNTD` se acepta en actualización |
| `PV_CTR_ORDS.HR_ENT` | datetime | 81 | 0 | 2026-10-15T15:04:25.143 | 2026-10-15T20:27:51.297 |  | PK PK_PVCTRORDS([IORD]) | sp_ordenes_trabajo_entregar_lote | CANDIDATO: escritor usa reloj de sistema |
| `PV_CTR_ORDS_ENTREGA.FCN_ALTA` | datetime | 37 | 0 | 2026-10-15T15:04:25.120 | 2026-10-15T20:27:51.293 | (getdate()) | PK PK_PV_CTR_ORDS_ENTREGA([ID_ENTREGA]) |  | CANDIDATO: default de reloj de sistema |
| `PV_CTR_ORDS_ENTREGA_DET.FCN_ALTA` | datetime | 80 | 0 | 2026-10-15T15:04:25.130 | 2026-10-15T20:27:51.297 | (getdate()) | PK PK_PV_CTR_ORDS_ENTREGA_DET([ID_ENTREGA_DET]) |  | CANDIDATO: default de reloj de sistema |
| `PV_CTR_ORDS_FLUJO_HIST.FCNR` | datetime2 | 1350 | 0 | 2026-10-15T15:04:00 | 2026-10-15T21:01:48 | (sysdatetime()) | PK PK_PV_CTR_ORDS_FLUJO_HIST([ID]) |  | CANDIDATO: default de reloj de sistema |
| `PV_DEV_DET_TMP.FCNR` | datetime2 | 18 | 0 | 2026-10-15T18:25:48 | 2026-10-15T21:02:36 | (sysutcdatetime()) | PK PK_PV_DEV_DET_TMP([ID]) | pv-devoluciones.service.ts: GETDATE() AS FCNR (API) | CANDIDATO: default de reloj de sistema |
| `PV_OPV.FCNR` | datetime | 1 | 1 | 2027-03-28T00:00:00 | 2027-03-28T00:00:00 |  | PK PK_PVOPV([IDOPV]) |  | EXCLUIR/BLOQUEAR: Valor 2027 fuera de desfase UTC/México; falta origen autoritativo |
| `PV_ORD_CAMBIO_MERMA_PRECIO.FCN_ALT` | datetime | 8 | 0 | 2026-10-15T15:14:33.543 | 2026-10-15T20:06:46.430 | (getdate()) | PK PK_PV_ORD_CAMBIO_MERMA_PRECIO([IORD]) |  | CANDIDATO: default de reloj de sistema |
| `PV_ORD_CAMBIO_MERMA_PRECIO.FCN_MOD` | datetime | 8 | 0 | 2026-10-15T15:14:33.543 | 2026-10-15T20:06:46.430 |  | PK PK_PV_ORD_CAMBIO_MERMA_PRECIO([IORD]) |  | PENDIENTE: trazar escritor/semántica |
| `PV_ORD_CAMBIO_MERMA_TMP.FCN_ALT` | datetime | 9 | 0 | 2026-10-15T15:04:28.340 | 2026-10-15T20:57:40.483 | (getdate()) | PK PK_PV_ORD_CAMBIO_MERMA_TMP([IORD],[TIPOM]) |  | CANDIDATO: default de reloj de sistema |
| `PV_ORD_CAMBIO_MERMA_TMP.FCN_MOD` | datetime | 9 | 0 | 2026-10-15T15:14:33.640 | 2026-10-15T20:57:54.623 | (getdate()) | PK PK_PV_ORD_CAMBIO_MERMA_TMP([IORD],[TIPOM]) |  | CANDIDATO: default de reloj de sistema |
| `PV_TICKET_LOG.updated_at` | datetime | 891 | 0 | 2026-10-15T15:03:11.570 | 2026-10-15T21:02:59.997 |  | PK PK_PVTICKETLOG([ID]) | sp_ps_ticket_update_pvta | CANDIDATO: escritor usa reloj de sistema |
| `REC_BORRADOR_REC.FCNM` | datetime2 | 1 | 0 | 2026-10-15T15:33:20 | 2026-10-15T15:33:20 | (sysdatetime()) | PK PK_REC_BORRADOR_REC([NPED]) | sp_rec_recepcion_borrador_guardar, sp_rec_recepcion_devolver_sucursal | CANDIDATO: default de reloj de sistema |
| `REC_CAB_PED.FCNC` | datetime | 3 | 0 | 2026-10-15T16:13:52.297 | 2026-10-15T19:00:52.173 |  | PK PK_NPED([NPED]) |  | PENDIENTE: trazar escritor/semántica |
| `REC_CAB_PED.FCNP` | datetime | 4 | 0 | 2026-10-15T16:13:35.077 | 2026-10-15T19:00:02.607 |  | PK PK_NPED([NPED]) |  | PENDIENTE: trazar escritor/semántica |
| `REC_CAB_PED.FCNR` | datetime | 3 | 0 | 2026-10-15T16:16:23.260 | 2026-10-15T19:03:06.993 |  | PK PK_NPED([NPED]) |  | PENDIENTE: trazar escritor/semántica |
| `REC_CTO_HIST.FCN` | datetime | 40 | 0 | 2026-10-15T15:32:38.440 | 2026-10-15T19:02:31.617 |  | PK PK_IDREC([IDREC]) |  | PENDIENTE: trazar escritor/semántica |
| `REC_CTRL_DOC_REC.FCN_AUTORIZA` | datetime2 | 3 | 0 | 2026-10-15T16:16:23 | 2026-10-15T19:03:07 |  | PK PK_DOCREC([DOCREC]) | sp_rec_recepcion_autorizar, sp_rec_recepcion_rechazar | CANDIDATO: escritor usa reloj de sistema |
| `REC_CTRL_DOC_REC.FCN_FISICA` | datetime2 | 6 | 0 | 2026-10-15T15:32:38 | 2026-10-15T19:02:32 |  | PK PK_DOCREC([DOCREC]) |  | PENDIENTE: trazar escritor/semántica |
| `REC_CTRL_DOC_REC.FCNC` | datetime | 6 | 0 | 2026-10-15T15:32:38.433 | 2026-10-15T19:02:31.617 |  | PK PK_DOCREC([DOCREC]) |  | PENDIENTE: trazar escritor/semántica |
| `REC_GUIA_PED.FCNR` | datetime2 | 5 | 0 | 2026-10-15T15:32:38 | 2026-10-15T19:02:32 | (sysdatetime()) | PK PK_REC_GUIA_PED([IDGUIA]) |  | CANDIDATO: default de reloj de sistema |
| `REF_DETALLE.FCNR` | datetime | 84 | 0 | 2026-10-15T15:06:24.540 | 2026-10-15T21:02:48.227 |  | PK PK_IDREF([IDREF]) |  | PENDIENTE: trazar escritor/semántica |
| `TRAN_CTR_DOCPRE.FCNC` | datetime | 3 | 0 | 2026-10-15T15:10:10.883 | 2026-10-15T15:17:18.163 |  | PK PK_TRAN_CTR_DOCPRE([DOC]) |  | PENDIENTE: trazar escritor/semántica |
| `TRAN_CTR_DOCPRE.FCND` | datetime | 3 | 0 | 2026-10-15T15:06:42.103 | 2026-10-15T15:09:56.730 |  | PK PK_TRAN_CTR_DOCPRE([DOC]) |  | PENDIENTE: trazar escritor/semántica |
| `TRAN_CTR_DOCPRE.FCNM` | datetime | 3 | 0 | 2026-10-15T15:12:00.770 | 2026-10-15T15:17:18.163 |  | PK PK_TRAN_CTR_DOCPRE([DOC]) | sp_trans_recalcular, sp_trans_enviar, sp_trans_liberar, sp_trans_rechazar, sp_trans_preparar, sp_trans_transito, sp_trans_recibir, sp_trans_contabilizar | CANDIDATO: escritor usa reloj de sistema |
| `TRAN_DET_ART.FCN_CONT` | datetime | 5 | 0 | 2026-10-15T15:16:07.630 | 2026-10-15T15:17:18.163 |  | PK PK_TRAN_DET_ART([IDPD]) | sp_trans_contabilizar | CANDIDATO: escritor usa reloj de sistema |
| `TRAN_EVID.FCN` | datetime | 1 | 0 | 2026-10-15T15:11:52.673 | 2026-10-15T15:11:52.673 | (getdate()) | PK PK_TRAN_EVID([ID]) |  | CANDIDATO: default de reloj de sistema |
| `TRAN_PAQ_ENV.FCN` | datetime | 1 | 0 | 2026-10-15T15:12:00.770 | 2026-10-15T15:12:00.770 | (getdate()) | PK PK_TRAN_PAQ_ENV([ID]) |  | CANDIDATO: default de reloj de sistema |
| `TRAN_PAQ_ENV.FENV` | datetime | 1 | 0 | 2026-10-15T15:12:00.770 | 2026-10-15T15:12:00.770 |  | PK PK_TRAN_PAQ_ENV([ID]) |  | PENDIENTE: trazar escritor/semántica |
| `USUARIO_TOKEN.EXPIRES_AT` | datetime2 | 24464 | 24153 | 2026-10-15T15:03:11 | 2026-11-14T15:03:08 |  | PK PK__USUARIO___BC34FD030381B864([IDTOKEN]) |  | EXCLUIR/BLOQUEAR: Expiración de token válida a futuro |

## Hallazgos que afectan DML

- `PV_OPV.FCNR` mantiene valor `2027-03-28`, fuera del desfase UTC/México; sin origen autoritativo no se sustituye ni se convierte.
- `PV_CTR_ORDS.FCNM` contiene fecha operativa futura de ORD; se excluye. Fechas de entrega/promesa no se convierten por ser futuras.
- `FACT_CSD.VIGENCIA_HASTA`, `PROMO_CAB.FCN_TER` y `USUARIO_TOKEN.EXPIRES_AT` son vigencias/expiraciones válidas; se excluyen.
- `AUDIT_LOG.FCNR`: fuente versionada usa `SYSUTCDATETIME()` y metadata viva reporta `(sysdatetime())`; preservar auditoría hasta resolver contrato.
- `PV_DEV_DET_TMP.FCNR`: API inserta `GETDATE()` y la tabla tiene default `SYSUTCDATETIME()`; SQL vivo opera UTC. Diez celdas caen en ventana actual; eso demuestra desfase de representación, no causa confirmada del HTTP 409.
- `DAT_CONT_CTRL.FCNR` carece de llave única no nullable y no entra a actualización automática.
- Campos sin default o escritura actual del reloj localizada quedan pendientes de trazabilidad; no se infieren por tipo/nombre solamente.

## Evidencia y límites

- Inventario: `ioe-api/sql/2026-10-15_inventario_fechas_futuras_readonly.sql`; whitelist y modo VALIDAR: `ioe-api/sql/2026-10-15_reparar_timestamps_evento_utc_mexico_guarded.sql`.
- Script reversa: `ioe-api/sql/2026-10-15_revertir_timestamps_evento_utc_mexico.sql`; requiere batch_id de ejecución y valida que cada valor siga intacto antes de restaurar.
- Consulta live fue solo lectura. No se ejecutaron UPDATE, DDL, backup ni UAT.
