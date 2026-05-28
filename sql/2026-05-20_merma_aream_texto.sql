IF EXISTS (
  SELECT 1
  FROM sys.columns c
  JOIN sys.objects o ON o.object_id = c.object_id
  JOIN sys.types t ON t.user_type_id = c.user_type_id
  WHERE o.name = 'DOC_CTRL_MERMA'
    AND c.name = 'AREAM'
    AND t.name <> 'nvarchar'
)
BEGIN
  ALTER TABLE dbo.DOC_CTRL_MERMA
  ALTER COLUMN AREAM NVARCHAR(120) NULL;
END;
