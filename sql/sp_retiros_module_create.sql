SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/*
  Retiros parciales - soporte SQL Server
  - Vista limpia de formas de pago sin duplicados
  - FKs e índices recomendados (idempotentes)
  - Stored procedures de negocio (sp_ret_*)
*/

CREATE OR ALTER VIEW dbo.VW_PV_FORM_TIPOTRAN_DISTINCT
AS
SELECT
  UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))) AS FORM,
  UPPER(LTRIM(RTRIM(ISNULL(TIPOTRAN, '')))) AS TIPOTRAN,
  MIN(ISNULL(TRY_CONVERT(SMALLINT, BLOQ), 0)) AS BLOQ
FROM dbo.PV_FORM_TIPOTRAN
WHERE NULLIF(LTRIM(RTRIM(ISNULL(FORM, ''))), '') IS NOT NULL
GROUP BY
  UPPER(LTRIM(RTRIM(ISNULL(FORM, '')))),
  UPPER(LTRIM(RTRIM(ISNULL(TIPOTRAN, ''))));
GO

IF OBJECT_ID('dbo.DAT_RET_CTR_SVR', 'U') IS NULL
BEGIN
  RAISERROR('56001: No existe dbo.DAT_RET_CTR_SVR', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.DAT_RET_DET_SVR', 'U') IS NULL
BEGIN
  RAISERROR('56002: No existe dbo.DAT_RET_DET_SVR', 16, 1);
  RETURN;
END;
IF OBJECT_ID('dbo.DAT_RET_DET_EFEC_SVR', 'U') IS NULL
BEGIN
  RAISERROR('56003: No existe dbo.DAT_RET_DET_EFEC_SVR', 16, 1);
  RETURN;
END;
GO

DECLARE @fkDetName SYSNAME;
DECLARE @fkDetHasOrphans BIT = 0;

SELECT TOP (1)
  @fkDetName = fk.name
FROM sys.foreign_keys fk
WHERE fk.parent_object_id = OBJECT_ID('dbo.DAT_RET_DET_SVR')
  AND fk.referenced_object_id = OBJECT_ID('dbo.DAT_RET_CTR_SVR');

IF EXISTS (
  SELECT 1
  FROM dbo.DAT_RET_DET_SVR d
  LEFT JOIN dbo.DAT_RET_CTR_SVR c
    ON c.IDRET = d.IDRET
  WHERE NULLIF(LTRIM(RTRIM(ISNULL(d.IDRET, ''))), '') IS NOT NULL
    AND c.IDRET IS NULL
)
  SET @fkDetHasOrphans = 1;

IF @fkDetName IS NULL
BEGIN
  IF @fkDetHasOrphans = 1
  BEGIN
    PRINT 'WARN: DAT_RET_DET_SVR contiene IDRET huerfanos. FK_DAT_RET_DET_SVR_IDRET se crea WITH NOCHECK.';

    ALTER TABLE dbo.DAT_RET_DET_SVR
    WITH NOCHECK ADD CONSTRAINT FK_DAT_RET_DET_SVR_IDRET
    FOREIGN KEY (IDRET)
    REFERENCES dbo.DAT_RET_CTR_SVR (IDRET);
  END
  ELSE
  BEGIN
    ALTER TABLE dbo.DAT_RET_DET_SVR
    WITH CHECK ADD CONSTRAINT FK_DAT_RET_DET_SVR_IDRET
    FOREIGN KEY (IDRET)
    REFERENCES dbo.DAT_RET_CTR_SVR (IDRET);

    ALTER TABLE dbo.DAT_RET_DET_SVR
    CHECK CONSTRAINT FK_DAT_RET_DET_SVR_IDRET;
  END;
END;
GO

DECLARE @fkEfecName SYSNAME;
DECLARE @fkEfecDeleteAction INT;
DECLARE @fkEfecHasOrphans BIT = 0;

SELECT TOP (1)
  @fkEfecName = fk.name,
  @fkEfecDeleteAction = fk.delete_referential_action
FROM sys.foreign_keys fk
WHERE fk.parent_object_id = OBJECT_ID('dbo.DAT_RET_DET_EFEC_SVR')
  AND fk.referenced_object_id = OBJECT_ID('dbo.DAT_RET_DET_SVR');

IF EXISTS (
  SELECT 1
  FROM dbo.DAT_RET_DET_EFEC_SVR e
  LEFT JOIN dbo.DAT_RET_DET_SVR d
    ON d.ID = e.IDFOR
  WHERE NULLIF(LTRIM(RTRIM(ISNULL(e.IDFOR, ''))), '') IS NOT NULL
    AND d.ID IS NULL
)
  SET @fkEfecHasOrphans = 1;

IF @fkEfecName IS NULL
BEGIN
  IF @fkEfecHasOrphans = 1
  BEGIN
    PRINT 'WARN: DAT_RET_DET_EFEC_SVR contiene IDFOR huerfanos. FK_DAT_RET_DET_EFEC_SVR_IDFOR se crea WITH NOCHECK.';

    ALTER TABLE dbo.DAT_RET_DET_EFEC_SVR
    WITH NOCHECK ADD CONSTRAINT FK_DAT_RET_DET_EFEC_SVR_IDFOR
    FOREIGN KEY (IDFOR)
    REFERENCES dbo.DAT_RET_DET_SVR (ID)
    ON DELETE CASCADE;
  END
  ELSE
  BEGIN
    ALTER TABLE dbo.DAT_RET_DET_EFEC_SVR
    WITH CHECK ADD CONSTRAINT FK_DAT_RET_DET_EFEC_SVR_IDFOR
    FOREIGN KEY (IDFOR)
    REFERENCES dbo.DAT_RET_DET_SVR (ID)
    ON DELETE CASCADE;

    ALTER TABLE dbo.DAT_RET_DET_EFEC_SVR
    CHECK CONSTRAINT FK_DAT_RET_DET_EFEC_SVR_IDFOR;
  END;
END
ELSE IF @fkEfecDeleteAction <> 1
BEGIN
  DECLARE @dropFkEfecSql NVARCHAR(1000) =
    N'ALTER TABLE dbo.DAT_RET_DET_EFEC_SVR DROP CONSTRAINT [' + @fkEfecName + N'];';
  EXEC(@dropFkEfecSql);

  IF @fkEfecHasOrphans = 1
  BEGIN
    PRINT 'WARN: DAT_RET_DET_EFEC_SVR contiene IDFOR huerfanos. FK_DAT_RET_DET_EFEC_SVR_IDFOR se recrea WITH NOCHECK.';

    ALTER TABLE dbo.DAT_RET_DET_EFEC_SVR
    WITH NOCHECK ADD CONSTRAINT FK_DAT_RET_DET_EFEC_SVR_IDFOR
    FOREIGN KEY (IDFOR)
    REFERENCES dbo.DAT_RET_DET_SVR (ID)
    ON DELETE CASCADE;
  END
  ELSE
  BEGIN
    ALTER TABLE dbo.DAT_RET_DET_EFEC_SVR
    WITH CHECK ADD CONSTRAINT FK_DAT_RET_DET_EFEC_SVR_IDFOR
    FOREIGN KEY (IDFOR)
    REFERENCES dbo.DAT_RET_DET_SVR (ID)
    ON DELETE CASCADE;

    ALTER TABLE dbo.DAT_RET_DET_EFEC_SVR
    CHECK CONSTRAINT FK_DAT_RET_DET_EFEC_SVR_IDFOR;
  END;
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.DAT_RET_CTR_SVR')
    AND name = 'IX_DAT_RET_CTR_SVR_FCNR_OPV_TER_ESTA'
)
BEGIN
  CREATE INDEX IX_DAT_RET_CTR_SVR_FCNR_OPV_TER_ESTA
  ON dbo.DAT_RET_CTR_SVR (FCNR, OPV, TER, ESTA);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.DAT_RET_DET_SVR')
    AND name = 'IX_DAT_RET_DET_SVR_IDRET'
)
BEGIN
  CREATE INDEX IX_DAT_RET_DET_SVR_IDRET
  ON dbo.DAT_RET_DET_SVR (IDRET);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.DAT_RET_DET_EFEC_SVR')
    AND name = 'IX_DAT_RET_DET_EFEC_SVR_IDFOR'
)
BEGIN
  CREATE INDEX IX_DAT_RET_DET_EFEC_SVR_IDFOR
  ON dbo.DAT_RET_DET_EFEC_SVR (IDFOR);
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ret_create
  @OPV NVARCHAR(255),
  @TER NVARCHAR(255) = NULL,
  @IDRET NVARCHAR(255) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @terNorm NVARCHAR(255) = NULLIF(UPPER(LTRIM(RTRIM(ISNULL(@TER, '')))), '');
  DECLARE @terCmp NVARCHAR(255) = ISNULL(@terNorm, '');

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56101: OPV es requerido', 16, 1);
    RETURN;
  END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    IF EXISTS (
      SELECT 1
      FROM dbo.DAT_RET_CTR_SVR WITH (UPDLOCK, HOLDLOCK)
      WHERE CONVERT(DATE, FCNR) = CONVERT(DATE, GETDATE())
        AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm
        AND UPPER(LTRIM(RTRIM(ISNULL(TER, '')))) = @terCmp
        AND UPPER(LTRIM(RTRIM(ISNULL(ESTA, '')))) = 'ABIERTO'
    )
    BEGIN
      RAISERROR('56102: Ya existe un retiro ABIERTO hoy para el OPV y terminal indicados', 16, 1);
    END;

    SET @IDRET = CONVERT(NVARCHAR(36), NEWID());

    INSERT INTO dbo.DAT_RET_CTR_SVR (
      IDRET,
      TER,
      OPV,
      FCNR,
      IMPR,
      ESTA
    )
    VALUES (
      @IDRET,
      @terNorm,
      @opvNorm,
      GETDATE(),
      0,
      'ABIERTO'
    );

    SELECT TOP (1)
      IDRET,
      TER,
      OPV,
      FCNR,
      IMPR,
      ESTA
    FROM dbo.DAT_RET_CTR_SVR
    WHERE IDRET = @IDRET;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ret_list_today
  @OPV NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56201: OPV es requerido', 16, 1);
    RETURN;
  END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT
      r.IDRET,
      r.TER,
      r.OPV,
      r.FCNR,
      r.IMPR,
      r.ESTA,
      ISNULL(d.DET_COUNT, 0) AS DET_COUNT,
      ISNULL(d.DET_TOTAL, 0) AS DET_TOTAL
    FROM dbo.DAT_RET_CTR_SVR r
    OUTER APPLY (
      SELECT
        COUNT(1) AS DET_COUNT,
        ROUND(SUM(ISNULL(IMPF, 0)), 2) AS DET_TOTAL
      FROM dbo.DAT_RET_DET_SVR
      WHERE IDRET = r.IDRET
    ) d
    WHERE CONVERT(DATE, r.FCNR) = CONVERT(DATE, GETDATE())
      AND UPPER(LTRIM(RTRIM(ISNULL(r.OPV, '')))) = @opvNorm
    ORDER BY r.FCNR DESC;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ret_get
  @IDRET NVARCHAR(255),
  @OPV NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idretNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDRET, '')));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));

  IF @idretNorm = ''
  BEGIN
    RAISERROR('56301: IDRET es requerido', 16, 1);
    RETURN;
  END;

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56302: OPV es requerido', 16, 1);
    RETURN;
  END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM dbo.DAT_RET_CTR_SVR
      WHERE IDRET = @idretNorm
        AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm
    )
      RAISERROR('56303: El retiro no existe o no pertenece al OPV', 16, 1);

    SELECT TOP (1)
      r.IDRET,
      r.TER,
      r.OPV,
      r.FCNR,
      r.IMPR,
      r.ESTA,
      ISNULL(
        (
          SELECT
            d.ID,
            d.IDRET,
            d.FORMA,
            CAST(ISNULL(d.IMPF, 0) AS FLOAT) AS IMPF
          FROM dbo.DAT_RET_DET_SVR d
          WHERE d.IDRET = r.IDRET
          ORDER BY d.ID
          FOR JSON PATH
        ),
        '[]'
      ) AS DETALLES_JSON,
      ISNULL(
        (
          SELECT
            e.ID,
            e.IDFOR,
            CAST(ISNULL(e.DENO, 0) AS FLOAT) AS DENO,
            CAST(ISNULL(e.CTDA, 0) AS FLOAT) AS CTDA,
            CAST(ISNULL(e.TOTAL, 0) AS FLOAT) AS TOTAL
          FROM dbo.DAT_RET_DET_EFEC_SVR e
          INNER JOIN dbo.DAT_RET_DET_SVR d
            ON d.ID = e.IDFOR
          WHERE d.IDRET = r.IDRET
          ORDER BY e.IDFOR, e.DENO DESC
          FOR JSON PATH
        ),
        '[]'
      ) AS EFECTIVO_JSON
    FROM dbo.DAT_RET_CTR_SVR r
    WHERE r.IDRET = @idretNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(r.OPV, '')))) = @opvNorm;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ret_add_det
  @IDRET NVARCHAR(255),
  @OPV NVARCHAR(255),
  @FORMA NVARCHAR(255),
  @IMPF MONEY = NULL,
  @IDFOR NVARCHAR(255) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idretNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDRET, '')));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @formaNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@FORMA, ''))));
  DECLARE @esta NVARCHAR(255);
  DECLARE @isEfectivo BIT = 0;

  IF @idretNorm = ''
  BEGIN
    RAISERROR('56401: IDRET es requerido', 16, 1);
    RETURN;
  END;

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56402: OPV es requerido', 16, 1);
    RETURN;
  END;

  IF @formaNorm = ''
  BEGIN
    RAISERROR('56403: FORMA es requerida', 16, 1);
    RETURN;
  END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM dbo.VW_PV_FORM_TIPOTRAN_DISTINCT
      WHERE FORM = @formaNorm
    )
      RAISERROR('56404: FORMA no existe en catalogo de retiros', 16, 1);

    SELECT TOP (1)
      @esta = UPPER(LTRIM(RTRIM(ISNULL(ESTA, ''))))
    FROM dbo.DAT_RET_CTR_SVR WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    WHERE IDRET = @idretNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm;

    IF @esta IS NULL
      RAISERROR('56405: El retiro no existe o no pertenece al OPV', 16, 1);

    IF @esta <> 'ABIERTO'
      RAISERROR('56406: Solo se pueden agregar detalles a retiros ABIERTO', 16, 1);

    SET @isEfectivo = CASE WHEN @formaNorm = 'EFECTIVO' THEN 1 ELSE 0 END;

    IF @isEfectivo = 0 AND (ISNULL(@IMPF, 0) <= 0)
      RAISERROR('56407: IMPF debe ser mayor a 0 para formas distintas de EFECTIVO', 16, 1);

    SET @IDFOR = CONVERT(NVARCHAR(36), NEWID());

    INSERT INTO dbo.DAT_RET_DET_SVR (
      ID,
      IDRET,
      FORMA,
      IMPF
    )
    VALUES (
      @IDFOR,
      @idretNorm,
      @formaNorm,
      CASE WHEN @isEfectivo = 1 THEN 0 ELSE ROUND(ISNULL(@IMPF, 0), 2) END
    );

    IF @isEfectivo = 1
    BEGIN
      INSERT INTO dbo.DAT_RET_DET_EFEC_SVR (
        ID,
        IDFOR,
        DENO,
        CTDA
      )
      SELECT
        CONVERT(NVARCHAR(36), NEWID()),
        @IDFOR,
        denos.DENO,
        0
      FROM (
        VALUES
          (CAST(1000 AS MONEY)),
          (CAST(500 AS MONEY)),
          (CAST(200 AS MONEY)),
          (CAST(100 AS MONEY)),
          (CAST(50 AS MONEY)),
          (CAST(20 AS MONEY)),
          (CAST(10 AS MONEY)),
          (CAST(5 AS MONEY)),
          (CAST(2 AS MONEY)),
          (CAST(1 AS MONEY))
      ) denos (DENO);

      UPDATE dbo.DAT_RET_DET_SVR
      SET IMPF = ROUND(
        ISNULL(
          (
            SELECT SUM(ISNULL(TOTAL, 0))
            FROM dbo.DAT_RET_DET_EFEC_SVR
            WHERE IDFOR = @IDFOR
          ),
          0
        ),
        2
      )
      WHERE ID = @IDFOR;
    END;

    SELECT TOP (1)
      d.ID AS IDFOR,
      d.IDRET,
      d.FORMA,
      CAST(ISNULL(d.IMPF, 0) AS FLOAT) AS IMPF
    FROM dbo.DAT_RET_DET_SVR d
    WHERE d.ID = @IDFOR;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ret_set_efectivo
  @IDFOR NVARCHAR(255),
  @OPV NVARCHAR(255),
  @DENO MONEY,
  @CTDA FLOAT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idforNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOR, '')));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @idret NVARCHAR(255);
  DECLARE @esta NVARCHAR(255);

  IF @idforNorm = ''
  BEGIN
    RAISERROR('56501: IDFOR es requerido', 16, 1);
    RETURN;
  END;

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56502: OPV es requerido', 16, 1);
    RETURN;
  END;

  IF @DENO IS NULL
  BEGIN
    RAISERROR('56503: DENO es requerido', 16, 1);
    RETURN;
  END;

  IF @CTDA IS NULL OR @CTDA < 0
  BEGIN
    RAISERROR('56504: CTDA debe ser mayor o igual a 0', 16, 1);
    RETURN;
  END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP (1)
      @idret = h.IDRET,
      @esta = UPPER(LTRIM(RTRIM(ISNULL(h.ESTA, ''))))
    FROM dbo.DAT_RET_DET_SVR d
    INNER JOIN dbo.DAT_RET_CTR_SVR h
      ON h.IDRET = d.IDRET
    WHERE d.ID = @idforNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(h.OPV, '')))) = @opvNorm;

    IF @idret IS NULL
      RAISERROR('56505: El detalle no existe o no pertenece al OPV', 16, 1);

    IF @esta <> 'ABIERTO'
      RAISERROR('56506: Solo se puede editar efectivo en retiros ABIERTO', 16, 1);

    UPDATE dbo.DAT_RET_DET_EFEC_SVR
    SET CTDA = @CTDA
    WHERE IDFOR = @idforNorm
      AND DENO = @DENO;

    IF @@ROWCOUNT = 0
      RAISERROR('56507: No existe la denominacion indicada para el detalle EFECTIVO', 16, 1);

    UPDATE dbo.DAT_RET_DET_SVR
    SET IMPF = ROUND(
      ISNULL(
        (
          SELECT SUM(ISNULL(TOTAL, 0))
          FROM dbo.DAT_RET_DET_EFEC_SVR
          WHERE IDFOR = @idforNorm
        ),
        0
      ),
      2
    )
    WHERE ID = @idforNorm;

    SELECT TOP (1)
      d.ID AS IDFOR,
      d.IDRET,
      CAST(ISNULL(d.IMPF, 0) AS FLOAT) AS IMPF
    FROM dbo.DAT_RET_DET_SVR d
    WHERE d.ID = @idforNorm;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ret_set_efectivo_batch
  @IDFOR NVARCHAR(255),
  @OPV NVARCHAR(255),
  @JsonDenos NVARCHAR(MAX)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idforNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOR, '')));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @idret NVARCHAR(255);
  DECLARE @esta NVARCHAR(255);

  IF @idforNorm = ''
  BEGIN
    RAISERROR('56601: IDFOR es requerido', 16, 1);
    RETURN;
  END;

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56602: OPV es requerido', 16, 1);
    RETURN;
  END;

  IF ISNULL(@JsonDenos, '') = '' OR ISJSON(@JsonDenos) <> 1
  BEGIN
    RAISERROR('56603: JsonDenos debe ser un JSON valido', 16, 1);
    RETURN;
  END;

  DECLARE @denos TABLE (
    DENO MONEY NOT NULL,
    CTDA FLOAT NOT NULL
  );

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP (1)
      @idret = h.IDRET,
      @esta = UPPER(LTRIM(RTRIM(ISNULL(h.ESTA, ''))))
    FROM dbo.DAT_RET_DET_SVR d
    INNER JOIN dbo.DAT_RET_CTR_SVR h
      ON h.IDRET = d.IDRET
    WHERE d.ID = @idforNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(h.OPV, '')))) = @opvNorm;

    IF @idret IS NULL
      RAISERROR('56604: El detalle no existe o no pertenece al OPV', 16, 1);

    IF @esta <> 'ABIERTO'
      RAISERROR('56605: Solo se puede editar efectivo en retiros ABIERTO', 16, 1);

    INSERT INTO @denos (DENO, CTDA)
    SELECT
      TRY_CONVERT(MONEY, JSON_VALUE(value, '$.DENO')),
      TRY_CONVERT(FLOAT, JSON_VALUE(value, '$.CTDA'))
    FROM OPENJSON(@JsonDenos)
    WHERE TRY_CONVERT(MONEY, JSON_VALUE(value, '$.DENO')) IS NOT NULL
      AND TRY_CONVERT(FLOAT, JSON_VALUE(value, '$.CTDA')) IS NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM @denos)
      RAISERROR('56606: JsonDenos no contiene elementos validos {DENO,CTDA}', 16, 1);

    IF EXISTS (SELECT 1 FROM @denos WHERE CTDA < 0)
      RAISERROR('56607: CTDA debe ser mayor o igual a 0 en todas las denominaciones', 16, 1);

    IF EXISTS (
      SELECT 1
      FROM @denos d
      WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.DAT_RET_DET_EFEC_SVR e
        WHERE e.IDFOR = @idforNorm
          AND e.DENO = d.DENO
      )
    )
      RAISERROR('56608: JsonDenos contiene denominaciones no registradas para el detalle', 16, 1);

    UPDATE e
    SET e.CTDA = d.CTDA
    FROM dbo.DAT_RET_DET_EFEC_SVR e
    INNER JOIN @denos d
      ON d.DENO = e.DENO
    WHERE e.IDFOR = @idforNorm;

    UPDATE dbo.DAT_RET_DET_SVR
    SET IMPF = ROUND(
      ISNULL(
        (
          SELECT SUM(ISNULL(TOTAL, 0))
          FROM dbo.DAT_RET_DET_EFEC_SVR
          WHERE IDFOR = @idforNorm
        ),
        0
      ),
      2
    )
    WHERE ID = @idforNorm;

    SELECT TOP (1)
      d.ID AS IDFOR,
      d.IDRET,
      CAST(ISNULL(d.IMPF, 0) AS FLOAT) AS IMPF
    FROM dbo.DAT_RET_DET_SVR d
    WHERE d.ID = @idforNorm;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ret_delete_det
  @IDFOR NVARCHAR(255),
  @OPV NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idforNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOR, '')));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @esta NVARCHAR(255);

  IF @idforNorm = ''
  BEGIN
    RAISERROR('56701: IDFOR es requerido', 16, 1);
    RETURN;
  END;

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56702: OPV es requerido', 16, 1);
    RETURN;
  END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP (1)
      @esta = UPPER(LTRIM(RTRIM(ISNULL(h.ESTA, ''))))
    FROM dbo.DAT_RET_DET_SVR d
    INNER JOIN dbo.DAT_RET_CTR_SVR h
      ON h.IDRET = d.IDRET
    WHERE d.ID = @idforNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(h.OPV, '')))) = @opvNorm;

    IF @esta IS NULL
      RAISERROR('56703: El detalle no existe o no pertenece al OPV', 16, 1);

    IF @esta <> 'ABIERTO'
      RAISERROR('56704: Solo se pueden eliminar detalles de retiros ABIERTO', 16, 1);

    DELETE FROM dbo.DAT_RET_DET_SVR
    WHERE ID = @idforNorm;

    IF @@ROWCOUNT = 0
      RAISERROR('56705: No se pudo eliminar el detalle', 16, 1);

    SELECT @idforNorm AS IDFOR, CAST(1 AS BIT) AS DELETED;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ret_finalize
  @IDRET NVARCHAR(255),
  @OPV NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idretNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDRET, '')));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @esta NVARCHAR(255);
  DECLARE @impr MONEY = 0;
  DECLARE @detCount INT = 0;

  IF @idretNorm = ''
  BEGIN
    RAISERROR('56801: IDRET es requerido', 16, 1);
    RETURN;
  END;

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56802: OPV es requerido', 16, 1);
    RETURN;
  END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP (1)
      @esta = UPPER(LTRIM(RTRIM(ISNULL(ESTA, ''))))
    FROM dbo.DAT_RET_CTR_SVR WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    WHERE IDRET = @idretNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm;

    IF @esta IS NULL
      RAISERROR('56803: El retiro no existe o no pertenece al OPV', 16, 1);

    IF @esta <> 'ABIERTO'
      RAISERROR('56804: Solo se puede finalizar un retiro ABIERTO', 16, 1);

    SELECT
      @detCount = COUNT(1),
      @impr = ROUND(SUM(ISNULL(IMPF, 0)), 2)
    FROM dbo.DAT_RET_DET_SVR
    WHERE IDRET = @idretNorm;

    IF ISNULL(@detCount, 0) <= 0
      RAISERROR('56805: No se puede finalizar un retiro sin detalles', 16, 1);

    IF ISNULL(@impr, 0) <= 0
      RAISERROR('56806: No se puede finalizar un retiro con importe total menor o igual a 0', 16, 1);

    UPDATE dbo.DAT_RET_CTR_SVR
    SET
      ESTA = 'FINALIZADO',
      IMPR = @impr
    WHERE IDRET = @idretNorm;

    SELECT TOP (1)
      IDRET,
      TER,
      OPV,
      FCNR,
      IMPR,
      ESTA
    FROM dbo.DAT_RET_CTR_SVR
    WHERE IDRET = @idretNorm;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.sp_ret_cancel
  @IDRET NVARCHAR(255),
  @OPV NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @startedTran BIT = 0;
  DECLARE @idretNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDRET, '')));
  DECLARE @opvNorm NVARCHAR(255) = UPPER(LTRIM(RTRIM(ISNULL(@OPV, ''))));
  DECLARE @esta NVARCHAR(255);

  IF @idretNorm = ''
  BEGIN
    RAISERROR('56901: IDRET es requerido', 16, 1);
    RETURN;
  END;

  IF @opvNorm = ''
  BEGIN
    RAISERROR('56902: OPV es requerido', 16, 1);
    RETURN;
  END;

  BEGIN TRY
    IF @@TRANCOUNT = 0
    BEGIN
      SET @startedTran = 1;
      BEGIN TRANSACTION;
    END;

    SELECT TOP (1)
      @esta = UPPER(LTRIM(RTRIM(ISNULL(ESTA, ''))))
    FROM dbo.DAT_RET_CTR_SVR WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
    WHERE IDRET = @idretNorm
      AND UPPER(LTRIM(RTRIM(ISNULL(OPV, '')))) = @opvNorm;

    IF @esta IS NULL
      RAISERROR('56903: El retiro no existe o no pertenece al OPV', 16, 1);

    IF @esta = 'CANCELADO'
      RAISERROR('56904: El retiro ya se encuentra CANCELADO', 16, 1);

    IF @esta NOT IN ('ABIERTO', 'FINALIZADO')
      RAISERROR('56905: Solo se puede cancelar un retiro ABIERTO o FINALIZADO', 16, 1);

    UPDATE dbo.DAT_RET_CTR_SVR
    SET ESTA = 'CANCELADO'
    WHERE IDRET = @idretNorm;

    SELECT TOP (1)
      IDRET,
      TER,
      OPV,
      FCNR,
      IMPR,
      ESTA
    FROM dbo.DAT_RET_CTR_SVR
    WHERE IDRET = @idretNorm;

    IF @startedTran = 1 COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @startedTran = 1 AND @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;

    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
    RAISERROR(@ErrMsg, 16, 1);
  END CATCH;
END;
GO
