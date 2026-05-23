/*
  ORD panel - fix visibilidad por sucursal explícita
  Fecha: 2026-05-22

  Problema:
  - Para roles con @USE_HOME_LAB_SCOPE=1 (analista/encargados), el panel aplicaba
    filtro extra por @HOME_SUC aunque el usuario seleccionara otra sucursal válida
    en @SUC y tuviera acceso en USR_MOD_SUC.
  - Ejemplo: home DF04 + selección DF14 => solo registros históricos ligados a LAB DF04.

  Solución:
  - Si @SUC viene explícita, omitir el recorte @HOME_SUC/@LAB.SUC.
  - Se conserva validación de acceso por @ALLOWED_SUCS y resto de reglas de flujo.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @sp NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ordenes_trabajo_panel'));
IF @sp IS NULL
  THROW 59101, 'No existe dbo.sp_ordenes_trabajo_panel', 1;

SET @sp = REPLACE(@sp, 'CREATE   PROCEDURE', 'CREATE OR ALTER PROCEDURE');
SET @sp = REPLACE(@sp, 'CREATE PROCEDURE', 'CREATE OR ALTER PROCEDURE');

DECLARE @oldBlock NVARCHAR(MAX) = N'      AND (
        @USE_HOME_LAB_SCOPE = 0
        OR (
          @HOME_SUC IS NOT NULL
          AND (
            UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '''')))) = @HOME_SUC
            OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '''')))) = @HOME_SUC
          )
        )
      )';

DECLARE @newBlock NVARCHAR(MAX) = N'      AND (
        @USE_HOME_LAB_SCOPE = 0
        OR @SUC IS NOT NULL
        OR (
          @HOME_SUC IS NOT NULL
          AND (
            UPPER(LTRIM(RTRIM(ISNULL(o.SUC, '''')))) = @HOME_SUC
            OR UPPER(LTRIM(RTRIM(ISNULL(lab.SUC, '''')))) = @HOME_SUC
          )
        )
      )';

IF CHARINDEX(@oldBlock, @sp) = 0
  THROW 59102, 'No se encontró bloque esperado de home scope en sp_ordenes_trabajo_panel', 1;

SET @sp = REPLACE(@sp, @oldBlock, @newBlock);
EXEC sp_executesql @sp;
GO

SELECT
  'sp_ordenes_trabajo_panel_home_scope' AS CHECK_NAME,
  CASE
    WHEN CHARINDEX('OR @SUC IS NOT NULL', OBJECT_DEFINITION(OBJECT_ID('dbo.sp_ordenes_trabajo_panel'))) > 0
      THEN 'OK'
    ELSE 'FAIL'
  END AS RESULT;
GO
