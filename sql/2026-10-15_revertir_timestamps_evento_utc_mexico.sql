/*
  Reversa exacta del lote creado por
  2026-10-15_reparar_timestamps_evento_utc_mexico_guarded.sql.

  VALIDAR predeterminado. Para revertir, copiar el batch_id y revisar todas las
  filas antes de cambiar @Aplicar a 1. Rechaza filas ausentes, duplicadas o cuyo
  valor actual ya no coincide con el valor aplicado. No usa fechas globales.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Aplicar bit = 0; -- 0 = VALIDAR; 1 = revertir el batch revisado.
DECLARE @BatchId uniqueidentifier = NULL; -- batch_id devuelto por el script forward.

IF DB_NAME() <> N'IOELOCAL'
  THROW 51200, 'Destino rechazado: se esperaba IOELOCAL.', 1;
IF @BatchId IS NULL
  THROW 51201, 'Se requiere batch_id del ledger.', 1;
IF OBJECT_ID(N'dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER', N'U') IS NULL
  THROW 51202, 'No existe ledger de correccion para revertir.', 1;

CREATE TABLE #AllowedTargets
(
  schema_name sysname NOT NULL,
  table_name sysname NOT NULL,
  column_name sysname NOT NULL,
  CONSTRAINT PK_AllowedTargets PRIMARY KEY(schema_name,table_name,column_name)
);
INSERT INTO #AllowedTargets(schema_name,table_name,column_name)
VALUES
  (N'dbo',N'DAT_ART_MASIVA_TMP',N'CREADO_EN'),
  (N'dbo',N'DAT_ART_MASIVA_TMP',N'PROCESADO_EN'),
  (N'dbo',N'DAT_CONT_CAPTURA',N'FCNR'),
  (N'dbo',N'DAT_CONT_CTRL',N'FCNR'),
  (N'dbo',N'DAT_CONT_UPLOAD_ITEMS',N'FCNR'),
  (N'dbo',N'DAT_FOLIOS_CONSEC',N'FCNM'),
  (N'dbo',N'DOC_CTRL_MERMA',N'FCNM'),
  (N'dbo',N'FAC_SVR_SHAP',N'FCNF'),
  (N'dbo',N'FAC_SVR_SHAP',N'CFDI_F_TIMBRADO'),
  (N'dbo',N'FACT_CFDI_EMAIL_OUTBOX',N'ACTUALIZADO_EN'),
  (N'dbo',N'FACT_CFDI_EMAIL_OUTBOX',N'CREADO_EN'),
  (N'dbo',N'FACT_CFDI_FOLIOS_DIARIOS',N'FCN_TIMBRADO'),
  (N'dbo',N'FACT_CFDI_FOLIOS_DIARIOS',N'FCNC'),
  (N'dbo',N'FACT_CFDI_FOLIOS_DIARIOS',N'FCNM'),
  (N'dbo',N'PROMO_TICKET_DESC_APLI',N'FCNDES'),
  (N'dbo',N'PV_CTR_ORDS',N'FCN_AUT_CYM'),
  (N'dbo',N'PV_CTR_ORDS_ENTREGA',N'FCN_ALTA'),
  (N'dbo',N'PV_CTR_ORDS_ENTREGA_DET',N'FCN_ALTA'),
  (N'dbo',N'PV_CTR_ORDS_FLUJO_HIST',N'FCNR'),
  (N'dbo',N'PV_DEV_DET_TMP',N'FCNR'),
  (N'dbo',N'PV_ORD_CAMBIO_MERMA_PRECIO',N'FCN_ALT'),
  (N'dbo',N'PV_ORD_CAMBIO_MERMA_TMP',N'FCN_ALT'),
  (N'dbo',N'PV_ORD_CAMBIO_MERMA_TMP',N'FCN_MOD'),
  (N'dbo',N'PV_TICKET_LOG',N'updated_at'),
  (N'dbo',N'REC_BORRADOR_REC',N'FCNM'),
  (N'dbo',N'REC_CTRL_DOC_REC',N'FCN_AUTORIZA'),
  (N'dbo',N'REC_GUIA_PED',N'FCNR'),
  (N'dbo',N'TRAN_CTR_DOCPRE',N'FCNM'),
  (N'dbo',N'TRAN_DET_ART',N'FCN_CONT'),
  (N'dbo',N'TRAN_EVID',N'FCN'),
  (N'dbo',N'TRAN_PAQ_ENV',N'FCN');

IF EXISTS
(
  SELECT 1 FROM dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER AS l
  WHERE l.batch_id=@BatchId
    AND NOT EXISTS
    (
      SELECT 1 FROM #AllowedTargets AS a
      WHERE a.schema_name=l.schema_name AND a.table_name=l.table_name AND a.column_name=l.column_name
    )
)
  THROW 51210, 'Ledger contiene target fuera de whitelist estatica; reversa bloqueada.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER WHERE batch_id=@BatchId)
  THROW 51203, 'batch_id no existe en el ledger.', 1;
IF EXISTS (SELECT 1 FROM dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER WHERE batch_id=@BatchId AND reversed_utc IS NOT NULL)
  THROW 51204, 'El batch ya fue revertido; no se permite repetir la reversa.', 1;

IF @Aplicar=1
BEGIN
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  BEGIN TRANSACTION;
  DECLARE @LockResult int;
  DECLARE @LockResource nvarchar(255)=N'IOELOCAL:event-timestamp-utc-mexico-reverse:'+CONVERT(nvarchar(36),@BatchId);
  EXEC @LockResult = sys.sp_getapplock
    @Resource = @LockResource,
    @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 10000;
  IF @LockResult < 0
    THROW 51205, 'No se obtuvo bloqueo de reversa.', 1;
END;

CREATE TABLE #ReverseTargets
(
  schema_name sysname NOT NULL,
  table_name sysname NOT NULL,
  column_name sysname NOT NULL,
  key_name sysname NOT NULL,
  ledger_rows bigint NOT NULL DEFAULT(0),
  matched_rows bigint NOT NULL DEFAULT(0),
  invalid_rows bigint NOT NULL DEFAULT(0),
  CONSTRAINT PK_ReverseTargets PRIMARY KEY(schema_name,table_name,column_name,key_name)
);

INSERT INTO #ReverseTargets(schema_name,table_name,column_name,key_name,ledger_rows)
SELECT schema_name,table_name,column_name,key_name,COUNT_BIG(1)
FROM dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER
WHERE batch_id=@BatchId
GROUP BY schema_name,table_name,column_name,key_name;

DECLARE @Schema sysname,@Table sysname,@Column sysname,@KeyName sysname;
DECLARE @JoinPredicate nvarchar(max),@KeyFirst sysname,@ColumnType nvarchar(256);
DECLARE @Qualified nvarchar(520),@Sql nvarchar(max),@Ledger bigint,@Matched bigint,@Invalid bigint;
DECLARE @ReverseCursor cursor;
SET @ReverseCursor=CURSOR LOCAL FAST_FORWARD FOR
  SELECT schema_name,table_name,column_name,key_name FROM #ReverseTargets;
OPEN @ReverseCursor;
FETCH NEXT FROM @ReverseCursor INTO @Schema,@Table,@Column,@KeyName;
WHILE @@FETCH_STATUS=0
BEGIN
  SET @JoinPredicate=NULL; SET @KeyFirst=NULL; SET @ColumnType=NULL;
  SELECT @ColumnType =
    CASE
      WHEN ty.name IN (N'varchar',N'char',N'varbinary',N'binary')
        THEN ty.name+N'('+CASE WHEN c.max_length=-1 THEN N'max' ELSE CONVERT(nvarchar(10),c.max_length) END+N')'
      WHEN ty.name IN (N'nvarchar',N'nchar')
        THEN ty.name+N'('+CASE WHEN c.max_length=-1 THEN N'max' ELSE CONVERT(nvarchar(10),c.max_length/2) END+N')'
      WHEN ty.name IN (N'decimal',N'numeric')
        THEN ty.name+N'('+CONVERT(nvarchar(10),c.precision)+N','+CONVERT(nvarchar(10),c.scale)+N')'
      WHEN ty.name IN (N'datetime2',N'datetimeoffset',N'time')
        THEN ty.name+N'('+CONVERT(nvarchar(10),c.scale)+N')'
      ELSE ty.name
    END
  FROM sys.schemas s
  JOIN sys.tables t ON t.schema_id=s.schema_id
  JOIN sys.columns c ON c.object_id=t.object_id
  JOIN sys.types ty ON ty.user_type_id=c.user_type_id
  WHERE s.name=@Schema AND t.name=@Table AND c.name=@Column;

  SELECT @KeyFirst=MIN(CASE WHEN ic.key_ordinal=1 THEN kc.name END),
    @JoinPredicate=STRING_AGG(CONVERT(nvarchar(max),
      N't.'+QUOTENAME(kc.name)+N'=TRY_CONVERT('+CASE
        WHEN ty.name IN (N'varchar',N'char',N'varbinary',N'binary')
          THEN ty.name+N'('+CASE WHEN kc.max_length=-1 THEN N'max' ELSE CONVERT(nvarchar(10),kc.max_length) END+N')'
        WHEN ty.name IN (N'nvarchar',N'nchar')
          THEN ty.name+N'('+CASE WHEN kc.max_length=-1 THEN N'max' ELSE CONVERT(nvarchar(10),kc.max_length/2) END+N')'
        WHEN ty.name IN (N'decimal',N'numeric')
          THEN ty.name+N'('+CONVERT(nvarchar(10),kc.precision)+N','+CONVERT(nvarchar(10),kc.scale)+N')'
        WHEN ty.name IN (N'datetime2',N'datetimeoffset',N'time')
          THEN ty.name+N'('+CONVERT(nvarchar(10),kc.scale)+N')'
        ELSE ty.name END+
      N',JSON_VALUE(l.key_json,N''$.'+N'"'+STRING_ESCAPE(kc.name,'json')+N'"''))'),N' AND')
      WITHIN GROUP(ORDER BY ic.key_ordinal)
  FROM sys.schemas s
  JOIN sys.tables t ON t.schema_id=s.schema_id
  JOIN sys.indexes i ON i.object_id=t.object_id
  JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0
  JOIN sys.columns kc ON kc.object_id=ic.object_id AND kc.column_id=ic.column_id
  JOIN sys.types ty ON ty.user_type_id=kc.user_type_id
  WHERE s.name=@Schema AND t.name=@Table AND i.name=@KeyName
    AND i.is_unique=1 AND i.has_filter=0 AND i.is_disabled=0 AND i.is_hypothetical=0;

  IF @JoinPredicate IS NULL OR @KeyFirst IS NULL OR @ColumnType IS NULL
    THROW 51206, 'No se pudo reconstruir llave unica y tipo actual; reversa bloqueada.', 1;
  IF EXISTS
  (
    SELECT 1 FROM sys.schemas s JOIN sys.tables t ON t.schema_id=s.schema_id
    JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
    WHERE s.name=@Schema AND t.name=@Table AND c.name=@Column
      AND ty.name IN (N'timestamp',N'rowversion',N'text',N'ntext',N'image',N'xml',N'sql_variant')
  )
    THROW 51207, 'Tipo de llave/columna no soportado por reversa generica.', 1;

  SET @Qualified=QUOTENAME(@Schema)+N'.'+QUOTENAME(@Table);
  SET @Sql=N'SELECT @ledger=COUNT_BIG(DISTINCT l.id),
      @matched=SUM(CASE WHEN t.'+QUOTENAME(@KeyFirst)+N' IS NOT NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END),
      @invalid=SUM(CASE WHEN t.'+QUOTENAME(@KeyFirst)+N' IS NULL OR t.'+QUOTENAME(@Column)+N' IS NULL
        OR CONVERT(datetime2(7),t.'+QUOTENAME(@Column)+N')<>l.new_value THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END)
    FROM dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER l
    LEFT JOIN '+@Qualified+N' AS t WITH (UPDLOCK,HOLDLOCK) ON '+@JoinPredicate+N'
    WHERE l.batch_id=@batch AND l.schema_name=@schema AND l.table_name=@table AND l.column_name=@column AND l.key_name=@keyname AND l.reversed_utc IS NULL;';
  SET @Ledger=0;SET @Matched=0;SET @Invalid=0;
  EXEC sys.sp_executesql @Sql,
    N'@batch uniqueidentifier,@schema sysname,@table sysname,@column sysname,@keyname sysname,@ledger bigint OUTPUT,@matched bigint OUTPUT,@invalid bigint OUTPUT',
    @batch=@BatchId,@schema=@Schema,@table=@Table,@column=@Column,@keyname=@KeyName,
    @ledger=@Ledger OUTPUT,@matched=@Matched OUTPUT,@invalid=@Invalid OUTPUT;
  UPDATE #ReverseTargets SET ledger_rows=@Ledger,matched_rows=COALESCE(@Matched,0),invalid_rows=COALESCE(@Invalid,0)
  WHERE schema_name=@Schema AND table_name=@Table AND column_name=@Column AND key_name=@KeyName;

  FETCH NEXT FROM @ReverseCursor INTO @Schema,@Table,@Column,@KeyName;
END;
CLOSE @ReverseCursor;
DEALLOCATE @ReverseCursor;

SELECT schema_name,table_name,column_name,key_name,ledger_rows,matched_rows,invalid_rows,
  CASE WHEN ledger_rows=matched_rows AND invalid_rows=0 THEN N'LISTO PARA REVISION' ELSE N'BLOQUEADO: llave ausente/duplicada o valor divergente' END AS estado
FROM #ReverseTargets ORDER BY schema_name,table_name,column_name;

IF EXISTS(SELECT 1 FROM #ReverseTargets WHERE ledger_rows<>matched_rows OR invalid_rows<>0)
BEGIN
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW 51208, 'Reversa bloqueada: al menos una fila ya no coincide exactamente con el valor aplicado.', 1;
END;
IF @Aplicar=0 RETURN;

DECLARE @Changed bigint,@LedgerChanged bigint,@Utc datetime2(7)=SYSUTCDATETIME();
DECLARE @ApplyCursor cursor;
SET @ApplyCursor=CURSOR LOCAL FAST_FORWARD FOR
  SELECT schema_name,table_name,column_name,key_name FROM #ReverseTargets;
OPEN @ApplyCursor;
FETCH NEXT FROM @ApplyCursor INTO @Schema,@Table,@Column,@KeyName;
WHILE @@FETCH_STATUS=0
BEGIN
  SET @Qualified=QUOTENAME(@Schema)+N'.'+QUOTENAME(@Table);
  SELECT @ColumnType=
    CASE
      WHEN ty.name IN (N'varchar',N'char',N'varbinary',N'binary') THEN ty.name+N'('+CASE WHEN c.max_length=-1 THEN N'max' ELSE CONVERT(nvarchar(10),c.max_length) END+N')'
      WHEN ty.name IN (N'nvarchar',N'nchar') THEN ty.name+N'('+CASE WHEN c.max_length=-1 THEN N'max' ELSE CONVERT(nvarchar(10),c.max_length/2) END+N')'
      WHEN ty.name IN (N'decimal',N'numeric') THEN ty.name+N'('+CONVERT(nvarchar(10),c.precision)+N','+CONVERT(nvarchar(10),c.scale)+N')'
      WHEN ty.name IN (N'datetime2',N'datetimeoffset',N'time') THEN ty.name+N'('+CONVERT(nvarchar(10),c.scale)+N')'
      ELSE ty.name END
  FROM sys.schemas s JOIN sys.tables t ON t.schema_id=s.schema_id JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
  WHERE s.name=@Schema AND t.name=@Table AND c.name=@Column;
  SELECT @KeyFirst=MIN(CASE WHEN ic.key_ordinal=1 THEN kc.name END),
    @JoinPredicate=STRING_AGG(CONVERT(nvarchar(max),N't.'+QUOTENAME(kc.name)+N'=TRY_CONVERT('+CASE
      WHEN ty.name IN (N'varchar',N'char',N'varbinary',N'binary') THEN ty.name+N'('+CASE WHEN kc.max_length=-1 THEN N'max' ELSE CONVERT(nvarchar(10),kc.max_length) END+N')'
      WHEN ty.name IN (N'nvarchar',N'nchar') THEN ty.name+N'('+CASE WHEN kc.max_length=-1 THEN N'max' ELSE CONVERT(nvarchar(10),kc.max_length/2) END+N')'
      WHEN ty.name IN (N'decimal',N'numeric') THEN ty.name+N'('+CONVERT(nvarchar(10),kc.precision)+N','+CONVERT(nvarchar(10),kc.scale)+N')'
      WHEN ty.name IN (N'datetime2',N'datetimeoffset',N'time') THEN ty.name+N'('+CONVERT(nvarchar(10),kc.scale)+N')'
      ELSE ty.name END+N',JSON_VALUE(l.key_json,N''$.'+N'"'+STRING_ESCAPE(kc.name,'json')+N'"''))'),N' AND') WITHIN GROUP(ORDER BY ic.key_ordinal)
  FROM sys.schemas s JOIN sys.tables t ON t.schema_id=s.schema_id JOIN sys.indexes i ON i.object_id=t.object_id
  JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0
  JOIN sys.columns kc ON kc.object_id=ic.object_id AND kc.column_id=ic.column_id JOIN sys.types ty ON ty.user_type_id=kc.user_type_id
  WHERE s.name=@Schema AND t.name=@Table AND i.name=@KeyName AND i.is_unique=1 AND i.has_filter=0 AND i.is_disabled=0 AND i.is_hypothetical=0;
  SET @Sql=N'UPDATE t WITH (UPDLOCK,HOLDLOCK) SET '+QUOTENAME(@Column)+N'=CONVERT('+@ColumnType+N',l.old_value)
    FROM '+@Qualified+N' AS t JOIN dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER l ON '+@JoinPredicate+N'
    WHERE l.batch_id=@batch AND l.schema_name=@schema AND l.table_name=@table AND l.column_name=@column AND l.key_name=@keyname AND l.reversed_utc IS NULL
      AND CONVERT(datetime2(7),t.'+QUOTENAME(@Column)+N')=l.new_value;
    SET @changed=@@ROWCOUNT;
    UPDATE dbo.IOELOCAL_EVENT_TS_REPAIR_LEDGER SET reversed_utc=@utc
    WHERE batch_id=@batch AND schema_name=@schema AND table_name=@table AND column_name=@column AND key_name=@keyname AND reversed_utc IS NULL;
    SET @ledgerchanged=@@ROWCOUNT;';
  SET @Changed=0;SET @LedgerChanged=0;
  EXEC sys.sp_executesql @Sql,
    N'@batch uniqueidentifier,@schema sysname,@table sysname,@column sysname,@keyname sysname,@utc datetime2(7),@changed bigint OUTPUT,@ledgerchanged bigint OUTPUT',
    @batch=@BatchId,@schema=@Schema,@table=@Table,@column=@Column,@keyname=@KeyName,@utc=@Utc,@changed=@Changed OUTPUT,@ledgerchanged=@LedgerChanged OUTPUT;
  IF @Changed<>@LedgerChanged THROW 51209,'Conteo de filas revertidas no coincide con ledger.',1;
  FETCH NEXT FROM @ApplyCursor INTO @Schema,@Table,@Column,@KeyName;
END;
CLOSE @ApplyCursor;
DEALLOCATE @ApplyCursor;

COMMIT TRANSACTION;
SELECT @BatchId AS batch_revertido,@Utc AS reverted_utc,N'Reversa aplicada y registrada en ledger.' AS resultado;
