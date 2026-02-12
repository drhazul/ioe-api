USE [IOELOCAL];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_cont_sync_captura_art]
  @SUC  NVARCHAR(5),
  @CONT NVARCHAR(255),
  @ART  NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @artKey NVARCHAR(50) = UPPER(LTRIM(RTRIM(@ART)));
  DECLARE @artValue NVARCHAR(50) = NULLIF(LTRIM(RTRIM(@ART)), '');
  IF @artKey IS NULL OR @artKey = ''
  BEGIN
    THROW 50051, 'ART inválido para sincronización de captura.', 1;
  END;

  DECLARE @cap001 FLOAT = 0,
          @cap002 FLOAT = 0,
          @capM1  FLOAT = 0,
          @capT1  FLOAT = 0;

  SELECT
    @cap001 = SUM(CASE WHEN c.ALMACEN = '001'  THEN c.CANT ELSE 0 END),
    @cap002 = SUM(CASE WHEN c.ALMACEN = '002'  THEN c.CANT ELSE 0 END),
    @capM1  = SUM(CASE WHEN c.ALMACEN = 'M001' THEN c.CANT ELSE 0 END),
    @capT1  = SUM(CASE WHEN c.ALMACEN = 'T001' THEN c.CANT ELSE 0 END)
  FROM dbo.DAT_CONT_CAPTURA c
  WHERE c.SUC = @SUC
    AND c.CONT = @CONT
    AND UPPER(LTRIM(RTRIM(c.ART))) = @artKey;

  SET @cap001 = ISNULL(@cap001, 0);
  SET @cap002 = ISNULL(@cap002, 0);
  SET @capM1  = ISNULL(@capM1, 0);
  SET @capT1  = ISNULL(@capT1, 0);

  DECLARE @capTotal FLOAT = @cap001 + @cap002 + @capM1 + @capT1;

  UPDATE det
     SET
      [001] = @cap001,
      [002] = @cap002,
      M001 = @capM1,
      T001 = @capT1,
      TOTAL = @capTotal,
      DIF_01 = @cap001 - ISNULL(det.MB52_01, 0),
      DIF_02 = @cap002 - ISNULL(det.MB52_02, 0),
      DIF_M1 = @capM1 - ISNULL(det.MB52_M1, 0),
      DIF_T1 = @capT1 - ISNULL(det.MB52_T1, 0),
      DIF_T = @capTotal - ISNULL(det.MB52_T, 0),
      DIF_CTOP = (@capTotal - ISNULL(det.MB52_T, 0)) * ISNULL(det.CTOP, 0)
  FROM dbo.DAT_DET_SVR det
  WHERE det.SUC = @SUC
    AND det.CONT = @CONT
    AND UPPER(LTRIM(RTRIM(det.ART))) = @artKey;

  IF @@ROWCOUNT = 0
  BEGIN
    DECLARE @refUpc NVARCHAR(15) = NULL,
            @refDes NVARCHAR(255) = NULL,
            @refCtop MONEY = 0;

    SELECT TOP (1)
      @refUpc = a.UPC,
      @refDes = a.DES,
      @refCtop = ISNULL(a.CTOP, 0),
      @artValue = COALESCE(NULLIF(LTRIM(RTRIM(a.ART)), ''), @artValue)
    FROM dbo.DAT_ART a
    WHERE a.SUC = @SUC
      AND UPPER(LTRIM(RTRIM(a.ART))) = @artKey
    ORDER BY a.UPC ASC;

    SET @artValue = COALESCE(@artValue, @ART);

    INSERT INTO dbo.DAT_DET_SVR (
      SUC, CONT, ART, UPC, DES, CTOP, TOTAL, MB52_T, DIF_T, DIF_CTOP,
      [001], [002], M001, T001, MB52_01, MB52_02, MB52_M1, MB52_T1, DIF_01, DIF_02, DIF_M1, DIF_T1
    )
    VALUES (
      @SUC, @CONT, @artValue, @refUpc, @refDes, ISNULL(@refCtop, 0), @capTotal, 0, @capTotal, 0,
      @cap001, @cap002, @capM1, @capT1, 0, 0, 0, 0, @cap001, @cap002, @capM1, @capT1
    );
  END;
END;
GO
