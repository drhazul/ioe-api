/*
  Consulta Estado de ORDs:
  - aplica la visibilidad por rol/flujo antes de calcular el total y paginar;
  - para un flujo histórico, valida la visibilidad del flujo seleccionado;
  - conserva el comportamiento de los demás paneles.
  Requiere el historial de flujos y DAT_JAO_ORD_FLUJO_VIS.
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @panel nvarchar(max) = OBJECT_DEFINITION(
  OBJECT_ID('dbo.sp_ordenes_trabajo_panel')
);

IF @panel IS NULL
  THROW 59301, 'No existe dbo.sp_ordenes_trabajo_panel', 1;

DECLARE @statusAntes nvarchar(max) = N'      AND (
        EXISTS (
          SELECT 1
          FROM @allowedStatus a
          WHERE a.ESTSEGU = TRY_CONVERT(FLOAT, o.ESTSEGU)
        )
        OR (
          @ALLOW_NULL_ESTSEGU = 1
          AND TRY_CONVERT(FLOAT, o.ESTSEGU) IS NULL
        )
      )';
DECLARE @statusDespues nvarchar(max) = N'      AND (
        (
          @PANEL_MODE = ''estado''
          AND @ESTSEGU IS NOT NULL
          AND (
            (
              UPPER(LTRIM(RTRIM(ISNULL(@ESTSEGU, '''')))) = ''NULL''
              AND @ALLOW_NULL_ESTSEGU = 1
            )
            OR (
              UPPER(LTRIM(RTRIM(ISNULL(@ESTSEGU, '''')))) <> ''NULL''
              AND (
                EXISTS (
                  SELECT 1
                  FROM @allowedStatus a
                  WHERE a.ESTSEGU = TRY_CONVERT(FLOAT, @ESTSEGU)
                )
                OR EXISTS (
                  SELECT 1
                  FROM dbo.DAT_JAO_ORD_FLUJO_VIS v
                  WHERE UPPER(LTRIM(RTRIM(ISNULL(v.MODULO, '''')))) = ''DAT_JAO_ORD''
                    AND UPPER(LTRIM(RTRIM(ISNULL(v.PANEL_MODE, '''')))) = ''ESTADO''
                    AND UPPER(LTRIM(RTRIM(ISNULL(v.ROLE_CODE, '''')))) =
                      CASE WHEN @IS_ADMIN = 1 THEN ''ADMIN'' ELSE @ROLE_CODE END
                    AND ISNULL(v.ACTIVO, 1) = 1
                    AND TRY_CONVERT(FLOAT, v.ESTA) = TRY_CONVERT(FLOAT, @ESTSEGU)
                )
              )
            )
          )
        )
        OR (
          (@PANEL_MODE <> ''estado'' OR @ESTSEGU IS NULL)
          AND (
            EXISTS (
              SELECT 1
              FROM @allowedStatus a
              WHERE a.ESTSEGU = TRY_CONVERT(FLOAT, o.ESTSEGU)
            )
            OR (
              @ALLOW_NULL_ESTSEGU = 1
              AND TRY_CONVERT(FLOAT, o.ESTSEGU) IS NULL
            )
          )
        )
      )
      AND (
        @PANEL_MODE <> ''estado''
        OR NOT EXISTS (
          SELECT 1
          FROM dbo.DAT_JAO_ORD_FLUJO_VIS v
          WHERE UPPER(LTRIM(RTRIM(ISNULL(v.MODULO, '''')))) = ''DAT_JAO_ORD''
            AND UPPER(LTRIM(RTRIM(ISNULL(v.PANEL_MODE, '''')))) = ''ESTADO''
            AND ISNULL(v.ACTIVO, 1) = 1
        )
        OR (
          (
            (
              @ESTSEGU IS NULL
              AND TRY_CONVERT(FLOAT, o.ESTSEGU) IS NULL
            )
            OR (
              UPPER(LTRIM(RTRIM(ISNULL(@ESTSEGU, '''')))) = ''NULL''
              AND @ALLOW_NULL_ESTSEGU = 1
            )
          )
          OR EXISTS (
            SELECT 1
            FROM dbo.DAT_JAO_ORD_FLUJO_VIS v
            WHERE UPPER(LTRIM(RTRIM(ISNULL(v.MODULO, '''')))) = ''DAT_JAO_ORD''
              AND UPPER(LTRIM(RTRIM(ISNULL(v.PANEL_MODE, '''')))) = ''ESTADO''
              AND UPPER(LTRIM(RTRIM(ISNULL(v.ROLE_CODE, '''')))) =
                CASE WHEN @IS_ADMIN = 1 THEN ''ADMIN'' ELSE @ROLE_CODE END
              AND ISNULL(v.ACTIVO, 1) = 1
              AND TRY_CONVERT(FLOAT, v.ESTA) = CASE
                WHEN @ESTSEGU IS NOT NULL
                  AND UPPER(LTRIM(RTRIM(ISNULL(@ESTSEGU, '''')))) <> ''NULL''
                  THEN TRY_CONVERT(FLOAT, @ESTSEGU)
                ELSE TRY_CONVERT(FLOAT, o.ESTSEGU)
              END
              AND (
                ISNULL(v.SOLO_EXTERNO, 0) = 0
                OR UPPER(LTRIM(RTRIM(ISNULL(lab.UBILAB, '''')))) LIKE ''%EXTER%''
                OR UPPER(LTRIM(RTRIM(ISNULL(lab.TIPOLAB, '''')))) LIKE ''%EXTER%''
                OR UPPER(LTRIM(RTRIM(ISNULL(lab.LAB, '''')))) LIKE ''%EXTER%''
                OR (
                  UPPER(LTRIM(RTRIM(ISNULL(lab.UBILAB, '''')))) NOT LIKE ''%LOCAL%''
                  AND NULLIF(LTRIM(RTRIM(ISNULL(lab.SUC, ''''))), '''') IS NULL
                )
              )
          )
        )
      )';

IF CHARINDEX(@statusAntes, @panel) > 0
  SET @panel = REPLACE(@panel, @statusAntes, @statusDespues);
ELSE IF CHARINDEX(@statusDespues, @panel) = 0
  THROW 59302, 'No se encontro el bloque esperado de permisos por flujo en sp_ordenes_trabajo_panel', 1;

DECLARE @createPos int = CHARINDEX('CREATE', UPPER(@panel));
IF UPPER(SUBSTRING(@panel, @createPos, LEN('CREATE OR ALTER'))) <> 'CREATE OR ALTER'
BEGIN
  SET @panel = STUFF(
    @panel,
    @createPos,
    LEN('CREATE'),
    'CREATE OR ALTER'
  );
END;
EXEC sp_executesql @panel;
GO
