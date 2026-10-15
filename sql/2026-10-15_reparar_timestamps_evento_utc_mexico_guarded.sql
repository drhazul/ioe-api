/*
  Correccion acotada de timestamps de evento escritos con reloj de sistema.

  VALIDA es modo predeterminado: solo lee metadata/datos y muestra conteos.
  APLICA requiere corte UTC fijado, hash/conteo de una validacion previa,
  reconocimiento de targets sin llave y revision de la reversa. No ejecutar
  en produccion sin autorizacion separada y preflight fresco.

  Regla: asumir UTC para el valor sin zona y convertir con
  Central Standard Time (Mexico). Ventana: > hora Mexico y <= corte UTC.
  Fechas futuras de negocio no se incluyen. AUDIT_LOG.FCNR se excluye porque
  conserva evidencia UTC y su default vivo difiere del SQL versionado.
  PV_CTR_ORDS.FCNM y las fechas de entrega/programacion se excluyen por contrato.
  Whitelist estatica revisada: defaults de reloj actuales y escrituras de reloj
  verificadas. No incorpora automaticamente columnas descubiertas despues.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar bit = 0; -- 0 = VALIDAR; cambiar a 1 solo tras aprobacion fresca.
DECLARE @CorteUtcConfirmado datetime2(7) = NULL; -- copiar de VALIDAR para APLICAR.
DECLARE @CeldasEsperadas bigint = NULL;
DECLARE @HashPlanEsperado varchar(64) = NULL;
DECLARE @BloqueadasReconocidas bigint = NULL; -- DAT_CONT_CTRL.FCNR no tiene llave unica.
DECLARE @ReversaPreparada bit = 0; -- requiere revisar sql/2026-10-15_revertir_timestamps_evento_utc_mexico.sql.
DECLARE @BatchId uniqueidentifier = NULL;

IF DB_NAME() <> N'IOELOCAL'
  THROW 51100, 'Destino rechazado: se esperaba IOELOCAL.', 1;

IF @Aplicar = 1
BEGIN
  IF @CorteUtcConfirmado IS NULL OR @CeldasEsperadas IS NULL OR @HashPlanEsperado IS NULL
    THROW 51101, 'APLICAR requiere corte UTC, conteo esperado y hash de VALIDAR.', 1;
  IF @BloqueadasReconocidas IS NULL
    THROW 51102, 'APLICAR requiere reconocer el conteo de targets sin llave estable.', 1;
  IF @ReversaPreparada <> 1
    THROW 51103, 'APLICAR bloqueado: preparar y revisar reversa antes de DML.', 1;
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  BEGIN TRANSACTION;
  DECLARE @LockResult int;
  EXEC @LockResult = sys.sp_getapplock
    @Resource = N'IOELOCAL:event-timestamp-utc-mexico-repair',
    @LockMode = N'Exclusive',
    @LockOwner = N'Transaction',
    @LockTimeout = 10000;
  IF @LockResult < 0
    THROW 51104, 'No se obtuvo el bloqueo de migracion.', 1;
END;

DECLARE @CorteUtc datetime2(7) = COALESCE(@CorteUtcConfirmado, SYSUTCDATETIME());
DECLARE @HoraMexico datetime2(7) = CONVERT(datetime2(7),
  @CorteUtc AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');

CREATE TABLE #Whitelist
(
  schema_name sysname NOT NULL,
  table_name sysname NOT NULL,
  column_name sysname NOT NULL,
  source_evidence nvarchar(300) NOT NULL,
  CONSTRAINT PK_Whitelist PRIMARY KEY (schema_name, table_name, column_name)
);

-- Defaults de reloj revisados como alta/modificacion de evento. Cada default
-- se vuelve a cotejar contra metadata viva antes de preparar targets.
INSERT INTO #Whitelist (schema_name, table_name, column_name, source_evidence)
VALUES
  (N'dbo', N'DAT_ART_MASIVA_TMP', N'CREADO_EN', N'DEFAULT: (sysutcdatetime()); alta de lote'),
  (N'dbo', N'DAT_CONT_CAPTURA', N'FCNR', N'DEFAULT: (getdate()); alta de captura'),
  (N'dbo', N'DAT_CONT_CTRL', N'FCNR', N'DEFAULT: (sysdatetime()); alta de control; sin llave unica'),
  (N'dbo', N'DAT_CONT_UPLOAD_ITEMS', N'FCNR', N'DEFAULT: (sysdatetime()); alta de item'),
  (N'dbo', N'DAT_FOLIOS_CONSEC', N'FCNM', N'DEFAULT: (getdate()); alta/modificacion de folio'),
  (N'dbo', N'FACT_CFDI_EMAIL_OUTBOX', N'ACTUALIZADO_EN', N'DEFAULT: (sysdatetime()); evento de outbox'),
  (N'dbo', N'FACT_CFDI_EMAIL_OUTBOX', N'CREADO_EN', N'DEFAULT: (sysdatetime()); alta de outbox'),
  (N'dbo', N'FACT_CFDI_FOLIOS_DIARIOS', N'FCNC', N'DEFAULT: (getdate()); alta de folio diario'),
  (N'dbo', N'FACT_CFDI_FOLIOS_DIARIOS', N'FCNM', N'DEFAULT: (getdate()); modificacion de folio diario'),
  (N'dbo', N'PROMO_TICKET_DESC_APLI', N'FCNDES', N'DEFAULT: (getdate()); registro de aplicacion'),
  (N'dbo', N'PV_CTR_ORDS_ENTREGA', N'FCN_ALTA', N'DEFAULT: (getdate()); alta de evento de entrega'),
  (N'dbo', N'PV_CTR_ORDS_ENTREGA_DET', N'FCN_ALTA', N'DEFAULT: (getdate()); alta de detalle de entrega'),
  (N'dbo', N'PV_CTR_ORDS_FLUJO_HIST', N'FCNR', N'DEFAULT: (sysdatetime()); evento de flujo'),
  (N'dbo', N'PV_DEV_DET_TMP', N'FCNR', N'DEFAULT: (sysutcdatetime()); API escribe GETDATE() en alta de devolucion'),
  (N'dbo', N'PV_ORD_CAMBIO_MERMA_PRECIO', N'FCN_ALT', N'DEFAULT: (getdate()); alta de cambio'),
  (N'dbo', N'PV_ORD_CAMBIO_MERMA_TMP', N'FCN_ALT', N'DEFAULT: (getdate()); alta de cambio'),
  (N'dbo', N'PV_ORD_CAMBIO_MERMA_TMP', N'FCN_MOD', N'DEFAULT: (getdate()); modificacion de cambio'),
  (N'dbo', N'REC_BORRADOR_REC', N'FCNM', N'DEFAULT: (sysdatetime()); alta/modificacion de borrador'),
  (N'dbo', N'REC_GUIA_PED', N'FCNR', N'DEFAULT: (sysdatetime()); alta de guia'),
  (N'dbo', N'TRAN_EVID', N'FCN', N'DEFAULT: (getdate()); alta de evidencia'),
  (N'dbo', N'TRAN_PAQ_ENV', N'FCN', N'DEFAULT: (getdate()); alta de paquete');

IF EXISTS
(
  SELECT 1
  FROM #Whitelist AS w
  CROSS APPLY
  (
    SELECT LOWER(REPLACE(REPLACE(REPLACE(REPLACE(dc.definition, N' ', N''), N'(', N''), N')', N''), N'[', N'')) AS normalized
    FROM sys.schemas AS s
    JOIN sys.tables AS t ON t.schema_id = s.schema_id
    JOIN sys.columns AS c ON c.object_id = t.object_id
    JOIN sys.default_constraints AS dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    WHERE s.name = w.schema_name AND t.name = w.table_name AND c.name = w.column_name
  ) AS live_default
  WHERE w.source_evidence LIKE N'DEFAULT:%'
    AND live_default.normalized NOT IN (N'getdate', N'sysdatetime', N'sysutcdatetime', N'current_timestamp')
)
  THROW 51110, 'Un default de la whitelist cambio o dejo de ser reloj de sistema.', 1;

IF EXISTS
(
  SELECT 1 FROM #Whitelist AS w
  WHERE w.source_evidence LIKE N'DEFAULT:%'
    AND NOT EXISTS
    (
      SELECT 1 FROM sys.schemas AS s
      JOIN sys.tables AS t ON t.schema_id = s.schema_id
      JOIN sys.columns AS c ON c.object_id = t.object_id
      JOIN sys.default_constraints AS dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
      WHERE s.name = w.schema_name AND t.name = w.table_name AND c.name = w.column_name
    )
)
  THROW 51111, 'Falta default vivo esperado para un target de la whitelist.', 1;

IF EXISTS
(
  SELECT 1 FROM #Whitelist AS w
  LEFT JOIN sys.schemas AS s ON s.name=w.schema_name
  LEFT JOIN sys.tables AS t ON t.schema_id=s.schema_id AND t.name=w.table_name
  LEFT JOIN sys.columns AS c ON c.object_id=t.object_id AND c.name=w.column_name
  WHERE c.column_id IS NULL OR c.system_type_id NOT IN (42,61)
)
  THROW 51114, 'Target de whitelist ausente o ya no es datetime/datetime2; revisar plan.', 1;

-- Asignaciones explicitas de reloj verificadas en modulos SQL/API desplegados.
-- Fechas de entrega/programacion, FCNM de ORD y fechas de negocio quedan fuera.
INSERT INTO #Whitelist (schema_name, table_name, column_name, source_evidence)
SELECT N'dbo', v.table_name, v.column_name, v.evidence
FROM (VALUES
  (N'DAT_ART_MASIVA_TMP', N'PROCESADO_EN', N'sp_datart_massive_apply: evento de proceso'),
  (N'DAT_MB51', N'FCNC', N'sp_merma_contabilizar: hora de alta del movimiento'),
  (N'DOC_CTRL_MERMA', N'FCNM', N'SP de flujo de merma: hora de modificacion'),
  (N'FAC_SVR_SHAP', N'FCNF', N'facturacion.service.ts: GETDATE al timbrar'),
  (N'FAC_SVR_SHAP', N'CFDI_F_TIMBRADO', N'facturacion.service.ts: GETDATE al timbrar'),
  (N'FACT_CFDI_FOLIOS_DIARIOS', N'FCN_TIMBRADO', N'SP de folios CFDI: evento de timbrado'),
  (N'PV_CTR_FOL_ASVR', N'FCNM', N'SP de punto de venta: evento de modificacion'),
  (N'PV_CTR_ORDS', N'FCNRT', N'SP de ordenes: evento de recepcion'),
  (N'PV_CTR_ORDS', N'FCNAS', N'SP de ordenes: evento de asignacion'),
  (N'PV_CTR_ORDS', N'FCNTD', N'SP de ordenes: evento de trabajo terminado'),
  (N'PV_CTR_ORDS', N'FCNMOD', N'SP/API de ordenes: evento de modificacion'),
  (N'PV_CTR_ORDS', N'FCN_AUT_CYM', N'ordenes-trabajo.service.ts: GETDATE al autorizar'),
  (N'PV_TICKET_LOG', N'updated_at', N'SP de tickets: evento de actualizacion'),
  (N'PV_DEV_DET_TMP', N'FCNR', N'pv-devoluciones.service.ts: GETDATE() AS FCNR'),
  (N'REC_CTRL_DOC_REC', N'FCN_AUTORIZA', N'SP de recepcion: evento de autorizacion/rechazo'),
  (N'TRAN_CTR_DOCPRE', N'FCNM', N'SP de transferencias: evento de transicion'),
  (N'TRAN_DET_ART', N'FCN_CONT', N'sp_trans_contabilizar: evento de contabilizacion')
) AS v(table_name, column_name, evidence)
WHERE NOT EXISTS
(
  SELECT 1 FROM #Whitelist w
  WHERE w.schema_name = N'dbo'
    AND w.table_name = v.table_name
    AND w.column_name = v.column_name
);

-- Auditoria se conserva en UTC. No desplazar ni alterar la evidencia historica.
DELETE FROM #Whitelist WHERE schema_name = N'dbo' AND table_name = N'AUDIT_LOG' AND column_name = N'FCNR';

CREATE TABLE #Targets
(
  schema_name sysname NOT NULL,
  table_name sysname NOT NULL,
  column_name sysname NOT NULL,
  source_evidence nvarchar(300) NOT NULL,
  sql_type sysname NOT NULL,
  key_name sysname NULL,
  key_select nvarchar(max) NULL,
  CONSTRAINT PK_Targets PRIMARY KEY (schema_name, table_name, column_name)
);

INSERT INTO #Targets (schema_name, table_name, column_name, source_evidence, sql_type)
SELECT w.schema_name, w.table_name, w.column_name, w.source_evidence, ty.name
FROM #Whitelist AS w
JOIN sys.schemas AS s ON s.name = w.schema_name
JOIN sys.tables AS t ON t.schema_id = s.schema_id AND t.name = w.table_name
JOIN sys.columns AS c ON c.object_id = t.object_id AND c.name = w.column_name
JOIN sys.types AS ty ON ty.user_type_id = c.user_type_id
WHERE c.system_type_id IN (42, 61);

DECLARE @Schema sysname, @Table sysname, @Column sysname;
DECLARE @IndexName sysname, @KeySelect nvarchar(max);
DECLARE target_keys CURSOR LOCAL FAST_FORWARD FOR
  SELECT schema_name, table_name, column_name FROM #Targets;
OPEN target_keys;
FETCH NEXT FROM target_keys INTO @Schema, @Table, @Column;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @IndexName = NULL;
  SET @KeySelect = NULL;
  SELECT TOP (1)
    @IndexName = i.name,
    @KeySelect = STRING_AGG(
      CONVERT(nvarchar(max), N't.' + QUOTENAME(kc.name) + N' AS ' + QUOTENAME(kc.name)), N',')
      WITHIN GROUP (ORDER BY ic.key_ordinal)
  FROM sys.tables AS t
  JOIN sys.schemas AS s ON s.schema_id = t.schema_id
  JOIN sys.indexes AS i ON i.object_id = t.object_id
  JOIN sys.index_columns AS ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
  JOIN sys.columns AS kc ON kc.object_id = ic.object_id AND kc.column_id = ic.column_id
  WHERE s.name = @Schema
    AND t.name = @Table
    AND (i.is_primary_key = 1 OR (i.is_unique = 1 AND i.has_filter = 0 AND i.is_disabled = 0 AND i.is_hypothetical = 0))
    AND NOT EXISTS
    (
      SELECT 1
      FROM sys.index_columns AS ix
      JOIN sys.columns AS cx ON cx.object_id = ix.object_id AND cx.column_id = ix.column_id
      WHERE ix.object_id = i.object_id AND ix.index_id = i.index_id
        AND ix.key_ordinal > 0 AND cx.is_nullable = 1
    )
  GROUP BY i.index_id, i.name, i.is_primary_key
  ORDER BY i.is_primary_key DESC, i.index_id;

  UPDATE #Targets
  SET key_name = @IndexName, key_select = @KeySelect
  WHERE schema_name = @Schema AND table_name = @Table AND column_name = @Column;

  FETCH NEXT FROM target_keys INTO @Schema, @Table, @Column;
END;
CLOSE target_keys;
DEALLOCATE target_keys;

CREATE TABLE #Preview
(
  schema_name sysname NOT NULL,
  table_name sysname NOT NULL,
  column_name sysname NOT NULL,
  source_evidence nvarchar(300) NOT NULL,
  key_name sysname NULL,
  row_count bigint NOT NULL,
  min_value datetime2(7) NULL,
  max_value datetime2(7) NULL
);

CREATE TABLE #PlanRows
(
  schema_name sysname NOT NULL,
  table_name sysname NOT NULL,
  column_name sysname NOT NULL,
  key_name sysname NOT NULL,
  key_json nvarchar(max) NOT NULL,
  old_value datetime2(7) NOT NULL
);

DECLARE @Qualified nvarchar(520), @Sql nvarchar(max), @Count bigint, @Min datetime2(7), @Max datetime2(7);
DECLARE @Inserted bigint, @Type sysname;
DECLARE target_preview CURSOR LOCAL FAST_FORWARD FOR
  SELECT schema_name, table_name, column_name FROM #Targets;
OPEN target_preview;
FETCH NEXT FROM target_preview INTO @Schema, @Table, @Column;
WHILE @@FETCH_STATUS = 0
BEGIN
  SET @Qualified = QUOTENAME(@Schema) + N'.' + QUOTENAME(@Table);
  SELECT @IndexName = key_name, @KeySelect = key_select, @Type = sql_type
  FROM #Targets WHERE schema_name = @Schema AND table_name = @Table AND column_name = @Column;
  SET @Count = 0; SET @Min = NULL; SET @Max = NULL; SET @Inserted = 0;
  IF @IndexName IS NOT NULL
  BEGIN
    SET @Sql = N'INSERT INTO #PlanRows(schema_name,table_name,column_name,key_name,key_json,old_value)
      SELECT @schema,@table,@column,@keyname,
        (SELECT ' + @KeySelect + N' FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        CONVERT(datetime2(7),t.' + QUOTENAME(@Column) + N')
      FROM ' + @Qualified + CASE WHEN @Aplicar = 1 THEN N' AS t WITH (UPDLOCK,HOLDLOCK)' ELSE N' AS t WITH (NOLOCK)' END + N'
      WHERE t.' + QUOTENAME(@Column) + N' > @mx AND t.' + QUOTENAME(@Column) + N' <= @utc;
      SET @inserted=@@ROWCOUNT;';
    EXEC sys.sp_executesql @Sql,
      N'@schema sysname,@table sysname,@column sysname,@keyname sysname,@mx datetime2(7),@utc datetime2(7),@inserted bigint OUTPUT',
      @schema=@Schema,@table=@Table,@column=@Column,@keyname=@IndexName,@mx=@HoraMexico,@utc=@CorteUtc,@inserted=@Inserted OUTPUT;
    SELECT @Count = COUNT_BIG(1), @Min = MIN(old_value), @Max = MAX(old_value)
    FROM #PlanRows WHERE schema_name=@Schema AND table_name=@Table AND column_name=@Column;
    IF @Inserted <> @Count THROW 51112, 'Conteo de llaves capturadas no coincide con el preflight.', 1;
  END
  ELSE
  BEGIN
    SET @Sql = N'SELECT @cnt = COUNT_BIG(1), @lo = MIN(CONVERT(datetime2(7), ' + QUOTENAME(@Column) + N')),
        @hi = MAX(CONVERT(datetime2(7), ' + QUOTENAME(@Column) + N'))
      FROM ' + @Qualified + CASE WHEN @Aplicar = 1 THEN N' WITH (UPDLOCK, HOLDLOCK)' ELSE N' WITH (NOLOCK)' END + N'
      WHERE ' + QUOTENAME(@Column) + N' > @mx AND ' + QUOTENAME(@Column) + N' <= @utc;';
    EXEC sys.sp_executesql @Sql,
      N'@mx datetime2(7), @utc datetime2(7), @cnt bigint OUTPUT, @lo datetime2(7) OUTPUT, @hi datetime2(7) OUTPUT',
      @mx = @HoraMexico, @utc = @CorteUtc, @cnt = @Count OUTPUT, @lo = @Min OUTPUT, @hi = @Max OUTPUT;
  END;
  IF @Count > 0
    INSERT INTO #Preview
      SELECT schema_name, table_name, column_name, source_evidence, key_name, @Count, @Min, @Max
      FROM #Targets WHERE schema_name = @Schema AND table_name = @Table AND column_name = @Column;
  FETCH NEXT FROM target_preview INTO @Schema, @Table, @Column;
END;
CLOSE target_preview;
DEALLOCATE target_preview;

DECLARE @CeldasListas bigint = COALESCE((SELECT SUM(row_count) FROM #Preview WHERE key_name IS NOT NULL), 0);
DECLARE @CeldasBloqueadas bigint = COALESCE((SELECT SUM(row_count) FROM #Preview WHERE key_name IS NULL), 0);
DECLARE @DigestText nvarchar(max), @HashPlan varchar(64);
CREATE TABLE #Fingerprint
(
  schema_name sysname NOT NULL,
  table_name sysname NOT NULL,
  column_name sysname NOT NULL,
  sort_value nvarchar(max) NOT NULL,
  digest_entry nvarchar(max) NOT NULL
);
INSERT INTO #Fingerprint(schema_name,table_name,column_name,sort_value,digest_entry)
SELECT schema_name,table_name,column_name,key_json,
  CONCAT(schema_name,N'.',table_name,N'.',column_name,N'|',key_json,N'|',CONVERT(varchar(33),old_value,126))
FROM #PlanRows;
INSERT INTO #Fingerprint(schema_name,table_name,column_name,sort_value,digest_entry)
SELECT t.schema_name,t.table_name,t.column_name,N'TARGET',
  CONCAT(N'target|',t.schema_name,N'.',t.table_name,N'.',t.column_name,N'|',t.source_evidence,N'|',
    COALESCE(t.key_name,N'SIN_LLAVE'),N'|',COALESCE(p.row_count,0))
FROM #Targets AS t
LEFT JOIN #Preview AS p ON p.schema_name=t.schema_name AND p.table_name=t.table_name AND p.column_name=t.column_name;
INSERT INTO #Fingerprint(schema_name,table_name,column_name,sort_value,digest_entry)
SELECT schema_name,table_name,column_name,N'BLOCKED',
  CONCAT(schema_name,N'.',table_name,N'.',column_name,N'|BLOCKED|',row_count,N'|',
    CONVERT(varchar(33),min_value,126),N'|',CONVERT(varchar(33),max_value,126))
FROM #Preview WHERE key_name IS NULL;
INSERT INTO #Fingerprint(schema_name,table_name,column_name,sort_value,digest_entry)
VALUES (N'0',N'WINDOW',N'UTC_TO_MEXICO',N'0',CONCAT(N'window|',CONVERT(varchar(33),@HoraMexico,126),N'|',CONVERT(varchar(33),@CorteUtc,126)));
SELECT @DigestText = STRING_AGG(CONVERT(nvarchar(max),digest_entry),N';')
  WITHIN GROUP (ORDER BY schema_name,table_name,column_name,sort_value)
FROM #Fingerprint;
SET @HashPlan = CONVERT(varchar(64), HASHBYTES('SHA2_256', COALESCE(@DigestText, N'')), 2);

SELECT
  DB_NAME() AS database_name,
  @CorteUtc AS corte_utc,
  @HoraMexico AS hora_mexico,
  @CeldasListas AS celdas_lista_con_llave,
  @CeldasBloqueadas AS celdas_bloqueadas_sin_llave,
  @HashPlan AS hash_plan,
  @Aplicar AS modo_aplicar;

SELECT schema_name, table_name, column_name, source_evidence, key_name, row_count, min_value, max_value,
  CASE WHEN key_name IS NULL THEN N'BLOQUEADO: falta llave unica no nullable' ELSE N'LISTO PARA REVISION' END AS estado
FROM #Preview
ORDER BY schema_name, table_name, column_name;

IF @Aplicar = 0 RETURN;

IF @CeldasEsperadas <> @CeldasListas OR @HashPlanEsperado <> @HashPlan
BEGIN
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW 51105, 'El corte actual no coincide con conteo/hash aprobado; no se modifica nada.', 1;
END;
IF @BloqueadasReconocidas <> @CeldasBloqueadas
BEGIN
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW 51106, 'El conteo de columnas sin llave no coincide con el reconocido.', 1;
END;
IF @CeldasListas = 0
BEGIN
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW 51107, 'No hay celdas elegibles en la ventana UTC/Mexico.', 1;
END;

BEGIN TRY
  IF OBJECT_ID(N'dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER
    (
      id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_IOELOCAL_EVENT_TS_REPAIR_LEDGER PRIMARY KEY,
      batch_id uniqueidentifier NOT NULL,
      schema_name sysname NOT NULL,
      table_name sysname NOT NULL,
      column_name sysname NOT NULL,
      key_name sysname NOT NULL,
      key_json nvarchar(max) NOT NULL,
      old_value datetime2(7) NOT NULL,
      new_value datetime2(7) NOT NULL,
      captured_utc datetime2(7) NOT NULL,
      reversed_utc datetime2(7) NULL
    );
  END;
  ELSE IF COL_LENGTH(N'dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER', N'key_name') IS NULL
       OR COL_LENGTH(N'dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER', N'reversed_utc') IS NULL
    THROW 51113, 'Ledger existente tiene esquema distinto; revisar antes de aplicar.', 1;

  SET @BatchId = NEWID();
  DECLARE @RowsChanged bigint = 0, @RowsThisTarget bigint, @RowsSaved bigint, @KeyJsonSelect nvarchar(max), @KeyName sysname;
  DECLARE target_apply CURSOR LOCAL FAST_FORWARD FOR
    SELECT schema_name, table_name, column_name, key_name, key_select
    FROM #Targets WHERE key_name IS NOT NULL
      AND EXISTS (SELECT 1 FROM #Preview p WHERE p.schema_name=#Targets.schema_name AND p.table_name=#Targets.table_name AND p.column_name=#Targets.column_name AND p.row_count>0);
  OPEN target_apply;
  FETCH NEXT FROM target_apply INTO @Schema, @Table, @Column, @KeyName, @KeyJsonSelect;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @Qualified = QUOTENAME(@Schema) + N'.' + QUOTENAME(@Table);
    SELECT @Type = sql_type FROM #Targets WHERE schema_name=@Schema AND table_name=@Table AND column_name=@Column;
    SET @Sql = N'INSERT INTO dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER
        (batch_id,schema_name,table_name,column_name,key_name,key_json,old_value,new_value,captured_utc)
      SELECT @batch,@schema,@table,@column,@keyname,
        (SELECT ' + @KeyJsonSelect + N' FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        CONVERT(datetime2(7),t.' + QUOTENAME(@Column) + N'),
        CONVERT(datetime2(7),CONVERT(' + @Type + N',t.' + QUOTENAME(@Column) + N' AT TIME ZONE ''UTC'' AT TIME ZONE ''Central Standard Time (Mexico)'')),
        @utc
      FROM ' + @Qualified + N' AS t WITH (UPDLOCK,HOLDLOCK)
      WHERE t.' + QUOTENAME(@Column) + N' > @mx AND t.' + QUOTENAME(@Column) + N' <= @utc;
      SET @saved=@@ROWCOUNT;
      UPDATE t WITH (UPDLOCK,HOLDLOCK)
      SET ' + QUOTENAME(@Column) + N' = CONVERT(' + @Type + N',
        t.' + QUOTENAME(@Column) + N' AT TIME ZONE ''UTC'' AT TIME ZONE ''Central Standard Time (Mexico)'')
      FROM ' + @Qualified + N' AS t
      WHERE t.' + QUOTENAME(@Column) + N' > @mx AND t.' + QUOTENAME(@Column) + N' <= @utc;
      SET @changed=@@ROWCOUNT;';
    SET @RowsThisTarget = 0; SET @RowsSaved = 0;
    EXEC sys.sp_executesql @Sql,
      N'@batch uniqueidentifier,@schema sysname,@table sysname,@column sysname,@keyname sysname,@utc datetime2(7),@mx datetime2(7),@saved bigint OUTPUT,@changed bigint OUTPUT',
      @batch=@BatchId,@schema=@Schema,@table=@Table,@column=@Column,@keyname=@KeyName,@utc=@CorteUtc,@mx=@HoraMexico,@saved=@RowsSaved OUTPUT,@changed=@RowsThisTarget OUTPUT;
    IF @RowsSaved <> @RowsThisTarget
      THROW 51109, 'Snapshot y UPDATE tienen distinto conteo; se revierte la transaccion.', 1;
    SET @RowsChanged += @RowsThisTarget;
    FETCH NEXT FROM target_apply INTO @Schema, @Table, @Column, @KeyName, @KeyJsonSelect;
  END;
  CLOSE target_apply;
  DEALLOCATE target_apply;

  IF @RowsChanged <> @CeldasListas
    THROW 51108, 'El total aplicado no coincide con el preflight; se revierte la transaccion.', 1;

  COMMIT TRANSACTION;
  SELECT @BatchId AS batch_id, @RowsChanged AS celdas_actualizadas,
    N'Ledger conservado; sql/2026-10-15_revertir_timestamps_evento_utc_mexico.sql permite reversa con validacion de valor actual.' AS resultado;
END TRY
BEGIN CATCH
  IF CURSOR_STATUS('local', 'target_apply') >= 0 CLOSE target_apply;
  IF CURSOR_STATUS('local', 'target_apply') >= -1 DEALLOCATE target_apply;
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
