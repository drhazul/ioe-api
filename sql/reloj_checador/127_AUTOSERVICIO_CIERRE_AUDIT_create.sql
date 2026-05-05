SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  127_AUTOSERVICIO_CIERRE_AUDIT_create.sql
  - Auditoría de ediciones de asistencia
  - Cierre de periodo (bloqueo de edición)
  - Extensión de estatus para "ERROR_MARCAJE"
*/

IF OBJECT_ID('dbo.AUDIT_LOGS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AUDIT_LOGS (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AUDIT_LOGS PRIMARY KEY,
    admin_id INT NULL,
    accion VARCHAR(80) NOT NULL,
    entidad VARCHAR(80) NOT NULL,
    entidad_id BIGINT NULL,
    valor_anterior NVARCHAR(MAX) NULL,
    valor_nuevo NVARCHAR(MAX) NULL,
    fecha DATETIME NOT NULL CONSTRAINT DF_AUDIT_LOGS_fecha DEFAULT (GETDATE())
  );
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_AUDIT_LOGS_fecha'
    AND object_id = OBJECT_ID('dbo.AUDIT_LOGS')
)
BEGIN
  CREATE INDEX IX_AUDIT_LOGS_fecha
    ON dbo.AUDIT_LOGS (fecha DESC, admin_id, entidad);
END;
GO

IF OBJECT_ID('dbo.PERIODOS_CIERRE', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PERIODOS_CIERRE (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PERIODOS_CIERRE PRIMARY KEY,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estatus VARCHAR(20) NOT NULL CONSTRAINT DF_PERIODOS_CIERRE_estatus DEFAULT ('ABIERTO'),
    motivo VARCHAR(250) NULL,
    created_by INT NULL,
    updated_by INT NULL,
    created_at DATETIME NOT NULL CONSTRAINT DF_PERIODOS_CIERRE_created DEFAULT (GETDATE()),
    updated_at DATETIME NOT NULL CONSTRAINT DF_PERIODOS_CIERRE_updated DEFAULT (GETDATE())
  );
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'UQ_PERIODOS_CIERRE_rango'
    AND object_id = OBJECT_ID('dbo.PERIODOS_CIERRE')
)
BEGIN
  CREATE UNIQUE INDEX UQ_PERIODOS_CIERRE_rango
    ON dbo.PERIODOS_CIERRE (fecha_inicio, fecha_fin);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_PERIODOS_CIERRE_rango'
    AND parent_object_id = OBJECT_ID('dbo.PERIODOS_CIERRE')
)
BEGIN
  ALTER TABLE dbo.PERIODOS_CIERRE
    ADD CONSTRAINT CK_PERIODOS_CIERRE_rango
    CHECK (fecha_inicio <= fecha_fin);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_PERIODOS_CIERRE_estatus'
    AND parent_object_id = OBJECT_ID('dbo.PERIODOS_CIERRE')
)
BEGIN
  ALTER TABLE dbo.PERIODOS_CIERRE
    ADD CONSTRAINT CK_PERIODOS_CIERRE_estatus
    CHECK (UPPER(LTRIM(RTRIM(ISNULL(estatus, '')))) IN ('ABIERTO', 'CERRADO'));
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_PERIODOS_CIERRE_estatus_fecha'
    AND object_id = OBJECT_ID('dbo.PERIODOS_CIERRE')
)
BEGIN
  CREATE INDEX IX_PERIODOS_CIERRE_estatus_fecha
    ON dbo.PERIODOS_CIERRE (estatus, fecha_inicio, fecha_fin);
END;
GO

IF OBJECT_ID('dbo.ATT_PERIODOS_CIERRE', 'U') IS NOT NULL
BEGIN
  INSERT INTO dbo.PERIODOS_CIERRE (
    fecha_inicio,
    fecha_fin,
    estatus,
    motivo,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  SELECT
    oldp.fecha_inicio,
    oldp.fecha_fin,
    CASE WHEN ISNULL(oldp.cerrado, 0) = 1 THEN 'CERRADO' ELSE 'ABIERTO' END AS estatus,
    oldp.motivo,
    oldp.created_by,
    oldp.updated_by,
    ISNULL(oldp.created_at, GETDATE()),
    ISNULL(oldp.updated_at, GETDATE())
  FROM dbo.ATT_PERIODOS_CIERRE oldp
  WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.PERIODOS_CIERRE p
    WHERE p.fecha_inicio = oldp.fecha_inicio
      AND p.fecha_fin = oldp.fecha_fin
  );
END;
GO

IF OBJECT_ID('dbo.ATT_TIME_LOG', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.ATT_TIME_LOG', 'REQUIERE_REVISION') IS NULL
BEGIN
  ALTER TABLE dbo.ATT_TIME_LOG
    ADD REQUIERE_REVISION BIT NOT NULL
      CONSTRAINT DF_ATT_TIME_LOG_REQUIERE_REVISION DEFAULT (0);
END;
GO

IF OBJECT_ID('dbo.ATT_TIME_LOG', 'U') IS NOT NULL
   AND NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_ATT_TIME_LOG_REQUIERE_REVISION'
    AND object_id = OBJECT_ID('dbo.ATT_TIME_LOG')
)
BEGIN
  CREATE INDEX IX_ATT_TIME_LOG_REQUIERE_REVISION
    ON dbo.ATT_TIME_LOG (REQUIERE_REVISION, FCNR DESC);
END;
GO

IF OBJECT_ID('dbo.ATT_ASISTENCIA_ESTATUS', 'U') IS NOT NULL
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_ATT_ASISTENCIA_ESTATUS_estatus'
      AND parent_object_id = OBJECT_ID('dbo.ATT_ASISTENCIA_ESTATUS')
  )
  BEGIN
    ALTER TABLE dbo.ATT_ASISTENCIA_ESTATUS
      DROP CONSTRAINT CK_ATT_ASISTENCIA_ESTATUS_estatus;
  END;

  ALTER TABLE dbo.ATT_ASISTENCIA_ESTATUS
    ADD CONSTRAINT CK_ATT_ASISTENCIA_ESTATUS_estatus
    CHECK (
      estatus IN (
        'ASISTIO',
        'FALTA',
        'RETARDO',
        'SALIDA_TEMPRANA',
        'ERROR_MARCAJE'
      )
    );
END;
GO
