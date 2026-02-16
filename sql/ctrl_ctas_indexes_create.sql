SET NOCOUNT ON;

/* DAT_CTRL_CTAS: (SUC, FCND) */
IF COL_LENGTH('dbo.DAT_CTRL_CTAS', 'SUC') IS NOT NULL
   AND COL_LENGTH('dbo.DAT_CTRL_CTAS', 'FCND') IS NOT NULL
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT
        i.object_id,
        i.index_id,
        STRING_AGG(CASE WHEN ic.is_included_column = 0 THEN c.name END, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_cols,
        STRING_AGG(CASE WHEN ic.is_included_column = 1 THEN c.name END, ',') WITHIN GROUP (ORDER BY ic.index_column_id) AS include_cols
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id
       AND ic.index_id = i.index_id
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id
       AND c.column_id = ic.column_id
      WHERE i.object_id = OBJECT_ID('dbo.DAT_CTRL_CTAS')
        AND i.index_id > 0
        AND i.is_hypothetical = 0
      GROUP BY i.object_id, i.index_id
    ) x
    WHERE x.key_cols = 'SUC,FCND'
      AND ISNULL(x.include_cols, '') =
        CASE
          WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL
            THEN 'CLIENT,CTA,IDFOL,CLSD,IMPT,RTXT,NDOC'
          ELSE 'CLIENT,CTA,IDFOL,CLSD,IMPT,RTXT,NDOC,IDOPV'
        END
  )
  BEGIN
    IF COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL
    BEGIN
      CREATE INDEX IX_DAT_CTRL_CTAS_SUC_FCND
        ON dbo.DAT_CTRL_CTAS (SUC, FCND)
        INCLUDE (CLIENT, CTA, IDFOL, CLSD, IMPT, RTXT, NDOC);
    END
    ELSE
    BEGIN
      CREATE INDEX IX_DAT_CTRL_CTAS_SUC_FCND
        ON dbo.DAT_CTRL_CTAS (SUC, FCND)
        INCLUDE (CLIENT, CTA, IDFOL, CLSD, IMPT, RTXT, NDOC, IDOPV);
    END
  END;
END;
GO

/* DAT_CTRL_CTAS: (SUC, CLIENT) */
IF COL_LENGTH('dbo.DAT_CTRL_CTAS', 'SUC') IS NOT NULL
   AND COL_LENGTH('dbo.DAT_CTRL_CTAS', 'CLIENT') IS NOT NULL
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT
        i.object_id,
        i.index_id,
        STRING_AGG(CASE WHEN ic.is_included_column = 0 THEN c.name END, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_cols,
        STRING_AGG(CASE WHEN ic.is_included_column = 1 THEN c.name END, ',') WITHIN GROUP (ORDER BY ic.index_column_id) AS include_cols
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id
       AND ic.index_id = i.index_id
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id
       AND c.column_id = ic.column_id
      WHERE i.object_id = OBJECT_ID('dbo.DAT_CTRL_CTAS')
        AND i.index_id > 0
        AND i.is_hypothetical = 0
      GROUP BY i.object_id, i.index_id
    ) x
    WHERE x.key_cols = 'SUC,CLIENT'
      AND ISNULL(x.include_cols, '') =
        CASE
          WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL
            THEN 'FCND,CTA,IDFOL,CLSD,IMPT,RTXT,NDOC'
          ELSE 'FCND,CTA,IDFOL,CLSD,IMPT,RTXT,NDOC,IDOPV'
        END
  )
  BEGIN
    IF COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL
    BEGIN
      CREATE INDEX IX_DAT_CTRL_CTAS_SUC_CLIENT
        ON dbo.DAT_CTRL_CTAS (SUC, CLIENT)
        INCLUDE (FCND, CTA, IDFOL, CLSD, IMPT, RTXT, NDOC);
    END
    ELSE
    BEGIN
      CREATE INDEX IX_DAT_CTRL_CTAS_SUC_CLIENT
        ON dbo.DAT_CTRL_CTAS (SUC, CLIENT)
        INCLUDE (FCND, CTA, IDFOL, CLSD, IMPT, RTXT, NDOC, IDOPV);
    END
  END;
END;
GO

/* DAT_CTRL_CTAS: (SUC, IDFOL) */
IF COL_LENGTH('dbo.DAT_CTRL_CTAS', 'SUC') IS NOT NULL
   AND COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDFOL') IS NOT NULL
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT
        i.object_id,
        i.index_id,
        STRING_AGG(CASE WHEN ic.is_included_column = 0 THEN c.name END, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_cols,
        STRING_AGG(CASE WHEN ic.is_included_column = 1 THEN c.name END, ',') WITHIN GROUP (ORDER BY ic.index_column_id) AS include_cols
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id
       AND ic.index_id = i.index_id
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id
       AND c.column_id = ic.column_id
      WHERE i.object_id = OBJECT_ID('dbo.DAT_CTRL_CTAS')
        AND i.index_id > 0
        AND i.is_hypothetical = 0
      GROUP BY i.object_id, i.index_id
    ) x
    WHERE x.key_cols = 'SUC,IDFOL'
      AND ISNULL(x.include_cols, '') =
        CASE
          WHEN COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL
            THEN 'CLIENT,CTA,FCND,CLSD,IMPT,RTXT,NDOC'
          ELSE 'CLIENT,CTA,FCND,CLSD,IMPT,RTXT,NDOC,IDOPV'
        END
  )
  BEGIN
    IF COL_LENGTH('dbo.DAT_CTRL_CTAS', 'IDOPV') IS NULL
    BEGIN
      CREATE INDEX IX_DAT_CTRL_CTAS_SUC_IDFOL
        ON dbo.DAT_CTRL_CTAS (SUC, IDFOL)
        INCLUDE (CLIENT, CTA, FCND, CLSD, IMPT, RTXT, NDOC);
    END
    ELSE
    BEGIN
      CREATE INDEX IX_DAT_CTRL_CTAS_SUC_IDFOL
        ON dbo.DAT_CTRL_CTAS (SUC, IDFOL)
        INCLUDE (CLIENT, CTA, FCND, CLSD, IMPT, RTXT, NDOC, IDOPV);
    END
  END;
END;
GO

/* DAT_CAT_CTAS: (SUC, CTA) */
IF COL_LENGTH('dbo.DAT_CAT_CTAS', 'SUC') IS NOT NULL
   AND COL_LENGTH('dbo.DAT_CAT_CTAS', 'CTA') IS NOT NULL
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT
        i.object_id,
        i.index_id,
        STRING_AGG(CASE WHEN ic.is_included_column = 0 THEN c.name END, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_cols,
        STRING_AGG(CASE WHEN ic.is_included_column = 1 THEN c.name END, ',') WITHIN GROUP (ORDER BY ic.index_column_id) AS include_cols
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id
       AND ic.index_id = i.index_id
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id
       AND c.column_id = ic.column_id
      WHERE i.object_id = OBJECT_ID('dbo.DAT_CAT_CTAS')
        AND i.index_id > 0
        AND i.is_hypothetical = 0
      GROUP BY i.object_id, i.index_id
    ) x
    WHERE x.key_cols = 'SUC,CTA'
      AND ISNULL(x.include_cols, '') = 'DCTA,RELACION'
  )
  BEGIN
    CREATE INDEX IX_DAT_CAT_CTAS_SUC_CTA
      ON dbo.DAT_CAT_CTAS (SUC, CTA)
      INCLUDE (DCTA, RELACION);
  END;
END;
GO
