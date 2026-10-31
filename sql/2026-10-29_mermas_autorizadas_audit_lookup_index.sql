/*
  Acelera la detección de anulaciones directas de ORDs en Mermas Autorizadas.
  Ejecutar como migración controlada en cada base de datos de la aplicación.
  El índice filtrado conserva solo los eventos que este módulo consulta.
*/
IF OBJECT_ID('dbo.AUDIT_LOG', 'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
     FROM sys.indexes
     WHERE object_id = OBJECT_ID('dbo.AUDIT_LOG')
       AND name = 'IX_AUDIT_LOG_ORD_ANULAR_LOTE'
   )
BEGIN
  CREATE NONCLUSTERED INDEX IX_AUDIT_LOG_ORD_ANULAR_LOTE
    ON dbo.AUDIT_LOG (MODULO, ENTIDAD, IDLOG)
    WHERE ACTION = N'ORD_ANULAR_LOTE';
END;
GO
