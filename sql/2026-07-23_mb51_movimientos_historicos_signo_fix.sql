SET XACT_ABORT ON;
GO

/*
  Correccion historica acotada a movimientos oficiales de salida generados
  por los modulos de merma y transferencias.

  No modifica DAT_ART.STOCK: los procedimientos originales ya aplicaron
  correctamente el descuento de existencias.
*/
BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @corregidos TABLE (
    TIPO NVARCHAR(30),
    IDPD NVARCHAR(255),
    DOCP NVARCHAR(255),
    SUC NVARCHAR(50),
    ART NVARCHAR(255),
    CLSM FLOAT,
    CTDA_ANTES FLOAT,
    CTDA_DESPUES FLOAT,
    CTOT_ANTES FLOAT,
    CTOT_DESPUES FLOAT
  );

  UPDATE m WITH (UPDLOCK, HOLDLOCK)
  SET
    CTDA = -ABS(ISNULL(m.CTDA, 0)),
    CTOT = -ABS(ISNULL(m.CTOT, 0))
  OUTPUT
    CASE
      WHEN inserted.CLSM = 121 THEN 'TRANSFERENCIA_121'
      WHEN inserted.CLSM = 124 THEN 'TRANSFERENCIA_124'
      ELSE 'MERMA'
    END,
    CONVERT(NVARCHAR(255), inserted.IDPD),
    CONVERT(NVARCHAR(255), inserted.DOCP),
    CONVERT(NVARCHAR(50), inserted.SUC),
    CONVERT(NVARCHAR(255), inserted.ART),
    inserted.CLSM,
    deleted.CTDA,
    inserted.CTDA,
    deleted.CTOT,
    inserted.CTOT
  INTO @corregidos (
    TIPO, IDPD, DOCP, SUC, ART, CLSM,
    CTDA_ANTES, CTDA_DESPUES, CTOT_ANTES, CTOT_DESPUES
  )
  FROM dbo.DAT_MB51 m
  WHERE m.CTDA > 0
    AND (
      (
        m.CLSM = 121
        AND UPPER(LTRIM(RTRIM(ISNULL(m.TXT, '')))) LIKE 'TRANSFERENCIA SALIDA DOC %'
      )
      OR (
        m.CLSM = 124
        AND UPPER(LTRIM(RTRIM(ISNULL(m.TXT, '')))) LIKE 'TRANSFERENCIA SOBRANTE DOC %'
      )
      OR UPPER(LTRIM(RTRIM(ISNULL(m.TXT, '')))) LIKE 'MERMA DOC %'
    );

  IF EXISTS (
    SELECT 1
    FROM dbo.DAT_MB51 m
    WHERE m.CTDA > 0
      AND (
        (
          m.CLSM = 121
          AND UPPER(LTRIM(RTRIM(ISNULL(m.TXT, '')))) LIKE 'TRANSFERENCIA SALIDA DOC %'
        )
        OR (
          m.CLSM = 124
          AND UPPER(LTRIM(RTRIM(ISNULL(m.TXT, '')))) LIKE 'TRANSFERENCIA SOBRANTE DOC %'
        )
        OR UPPER(LTRIM(RTRIM(ISNULL(m.TXT, '')))) LIKE 'MERMA DOC %'
      )
  )
    THROW 59201, 'Persisten movimientos de salida con CTDA positiva.', 1;

  COMMIT TRANSACTION;

  SELECT
    TIPO,
    DOCUMENTOS = COUNT(DISTINCT DOCP),
    RENGLONES = COUNT_BIG(1),
    CTDA_ANTES = SUM(CTDA_ANTES),
    CTDA_DESPUES = SUM(CTDA_DESPUES),
    CTOT_ANTES = SUM(CTOT_ANTES),
    CTOT_DESPUES = SUM(CTOT_DESPUES)
  FROM @corregidos
  GROUP BY TIPO
  ORDER BY TIPO;

  SELECT
    TIPO, IDPD, DOCP, SUC, ART, CLSM,
    CTDA_ANTES, CTDA_DESPUES, CTOT_ANTES, CTOT_DESPUES
  FROM @corregidos
  ORDER BY TIPO, DOCP, ART, IDPD;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
