CREATE OR ALTER PROCEDURE dbo.sp_art_masiva_commit_batch
  @BatchId UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;

  IF @BatchId IS NULL
  BEGIN
    THROW 51020, 'BatchId es obligatorio.', 1;
  END;

  IF NOT EXISTS (SELECT 1 FROM dbo.JA_NVO_ART_CON WHERE BatchId = @BatchId)
  BEGIN
    THROW 51021, 'No existen registros para el batch indicado.', 1;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM sys.sequences
    WHERE name = 'SEQ_DAT_ART' AND SCHEMA_NAME(schema_id) = 'dbo'
  )
  BEGIN
    THROW 51022, 'No existe la SEQUENCE dbo.SEQ_DAT_ART. Ejecuta el script de secuencia.', 1;
  END;

  IF EXISTS (
    SELECT 1 FROM dbo.JA_NVO_ART_CON WHERE BatchId=@BatchId AND Status='PENDING'
  )
  BEGIN
    THROW 51025, 'El batch debe validarse antes de procesar.', 1;
  END;

  BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (
      SELECT 1 FROM dbo.JA_NVO_ART_CON WHERE BatchId=@BatchId AND Status='ERROR'
    )
    BEGIN
      THROW 51023, 'Existen errores de validación en el batch.', 1;
    END;

    -- Generar ART faltantes
    UPDATE T
    SET ART = CAST(8000000 + NEXT VALUE FOR dbo.SEQ_DAT_ART AS NVARCHAR(10))
    FROM dbo.JA_NVO_ART_CON T
    WHERE T.BatchId=@BatchId
      AND T.Status='VALID'
      AND NULLIF(LTRIM(RTRIM(T.ART)),'') IS NULL;

    -- Generar UPC faltantes
    UPDATE T
    SET UPC = CONCAT('70000', T.ART)
    FROM dbo.JA_NVO_ART_CON T
    WHERE T.BatchId=@BatchId
      AND T.Status='VALID'
      AND NULLIF(LTRIM(RTRIM(T.UPC)),'') IS NULL;

    -- ART duplicado en DAT_ART
    UPDATE T SET Status='ERROR', ErrorMsg='ART ya existe en DAT_ART'
    FROM dbo.JA_NVO_ART_CON T
    INNER JOIN dbo.DAT_ART A ON A.ART = T.ART AND A.SUC = T.SUC
    WHERE T.BatchId=@BatchId AND T.Status='VALID';

    -- UPC duplicado en DAT_ART
    UPDATE T SET Status='ERROR', ErrorMsg='UPC ya existe en DAT_ART'
    FROM dbo.JA_NVO_ART_CON T
    INNER JOIN dbo.DAT_ART A ON A.UPC = T.UPC AND A.SUC = T.SUC
    WHERE T.BatchId=@BatchId AND T.Status='VALID';

    -- ART duplicado dentro del batch
    -- ART duplicado dentro del batch
    ;WITH DUPS_ART AS (
      SELECT SUC, ART
      FROM dbo.JA_NVO_ART_CON
      WHERE BatchId=@BatchId AND Status='VALID'
        AND NULLIF(LTRIM(RTRIM(SUC)),'') IS NOT NULL
        AND NULLIF(LTRIM(RTRIM(ART)),'') IS NOT NULL
      GROUP BY SUC, ART
      HAVING COUNT(1) > 1
    )
    UPDATE T SET Status='ERROR', ErrorMsg='ART duplicado en batch'
    FROM dbo.JA_NVO_ART_CON T
    INNER JOIN DUPS_ART D ON D.ART = T.ART AND D.SUC = T.SUC
    WHERE T.BatchId=@BatchId AND T.Status='VALID';

    -- UPC duplicado dentro del batch
    ;WITH DUPS_UPC AS (
      SELECT SUC, UPC
      FROM dbo.JA_NVO_ART_CON
      WHERE BatchId=@BatchId AND Status='VALID'
        AND NULLIF(LTRIM(RTRIM(SUC)),'') IS NOT NULL
        AND NULLIF(LTRIM(RTRIM(UPC)),'') IS NOT NULL
      GROUP BY SUC, UPC
      HAVING COUNT(1) > 1
    )
    UPDATE T SET Status='ERROR', ErrorMsg='UPC duplicado en batch'
    FROM dbo.JA_NVO_ART_CON T
    INNER JOIN DUPS_UPC D ON D.UPC = T.UPC AND D.SUC = T.SUC
    WHERE T.BatchId=@BatchId AND T.Status='VALID';

    IF EXISTS (
      SELECT 1 FROM dbo.JA_NVO_ART_CON WHERE BatchId=@BatchId AND Status='ERROR'
    )
    BEGIN
      THROW 51024, 'Existen errores de validación en el batch.', 1;
    END;

    DECLARE @Inserted TABLE (
      ART NVARCHAR(10),
      UPC NVARCHAR(15),
      SUC NVARCHAR(5),
      DES NVARCHAR(255),
      TIPO NVARCHAR(255)
    );

    INSERT INTO dbo.DAT_ART (
      SUC,
      TIPO,
      ART,
      UPC,
      CLAVESAT,
      UNIMEDSAT,
      DES,
      STOCK,
      STOCK_MIN,
      ESTATUS,
      DIA_REABASTO,
      PVTA,
      CTOP,
      PROV_1,
      CTO_PROV1,
      PROV_2,
      CTO_PROV2,
      PROV_3,
      CTO_PROV3,
      UN_COMP,
      FACT_COMP,
      UN_VTA,
      FACT_VTA,
      BASE,
      SPH,
      CYL,
      ADIC,
      DEPA,
      SUBD,
      CLAS,
      SCLA,
      SCLA2,
      UMUE,
      UTRA,
      UNIV,
      UFRE,
      BLOQ,
      MARCA,
      MODELO
    )
    OUTPUT inserted.ART, inserted.UPC, inserted.SUC, inserted.DES, inserted.TIPO
    INTO @Inserted (ART, UPC, SUC, DES, TIPO)
    SELECT
      T.SUC,
      T.TIPO,
      T.ART,
      T.UPC,
      TRY_CONVERT(FLOAT, T.CLAVESAT),
      T.UNIMEDSAT,
      T.DES,
      0,
      TRY_CONVERT(FLOAT, T.STOCK_MIN),
      T.ESTATUS,
      TRY_CONVERT(FLOAT, T.DIA_REABASTO),
      TRY_CONVERT(MONEY, T.PVTA),
      TRY_CONVERT(MONEY, T.CTOP),
      TRY_CONVERT(FLOAT, T.PROV_1),
      TRY_CONVERT(MONEY, T.CTO_PROV1),
      TRY_CONVERT(FLOAT, T.PROV_2),
      TRY_CONVERT(MONEY, T.CTO_PROV2),
      TRY_CONVERT(FLOAT, T.PROV_3),
      TRY_CONVERT(MONEY, T.CTO_PROV3),
      T.UN_COMP,
      TRY_CONVERT(FLOAT, T.FACT_COMP),
      T.UN_VTA,
      TRY_CONVERT(FLOAT, T.FACT_VTA),
      T.BASE,
      TRY_CONVERT(FLOAT, T.SPH),
      TRY_CONVERT(FLOAT, T.CYL),
      TRY_CONVERT(FLOAT, T.ADIC),
      TRY_CONVERT(FLOAT, T.DEPA),
      TRY_CONVERT(FLOAT, T.SUBD),
      TRY_CONVERT(FLOAT, T.CLAS),
      TRY_CONVERT(FLOAT, T.SCLA),
      TRY_CONVERT(FLOAT, T.SCLA2),
      TRY_CONVERT(FLOAT, T.UMUE),
      TRY_CONVERT(FLOAT, T.UTRA),
      TRY_CONVERT(FLOAT, T.UNIV),
      TRY_CONVERT(FLOAT, T.UFRE),
      ISNULL(TRY_CONVERT(INT, T.BLOQ), 0),
      T.MARCA,
      T.MODELO
    FROM dbo.JA_NVO_ART_CON T
    WHERE T.BatchId=@BatchId AND T.Status='VALID';

    UPDATE T
    SET Status='COMMITTED', ErrorMsg=NULL
    FROM dbo.JA_NVO_ART_CON T
    WHERE T.BatchId=@BatchId AND T.Status='VALID';

    COMMIT TRANSACTION;

    SELECT ART, UPC, SUC, DES, TIPO FROM @Inserted;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH;
END;
GO
