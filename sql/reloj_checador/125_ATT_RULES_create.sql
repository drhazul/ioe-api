SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  125_ATT_RULES_create.sql
  Motor de Reglas de Asistencia (base)
  - Tabla de reglas por sucursal y/o horario
  - Campos clave para retardo, horas extra, festivos y descanso
*/

IF OBJECT_ID('dbo.ATT_RULES', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ATT_RULES (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ATT_RULES PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    sucursal_id INT NULL,
    horario_id INT NULL,
    tolerancia_retardo_minutos INT NOT NULL CONSTRAINT DF_ATT_RULES_tolerancia DEFAULT (0),
    horas_jornada_minutos INT NOT NULL CONSTRAINT DF_ATT_RULES_jornada DEFAULT (480),
    horas_extra_minimo_minutos INT NOT NULL CONSTRAINT DF_ATT_RULES_ot_min DEFAULT (0),
    horas_extra_requiere_autorizacion BIT NOT NULL CONSTRAINT DF_ATT_RULES_ot_auth DEFAULT (0),
    aplicar_dias_festivos BIT NOT NULL CONSTRAINT DF_ATT_RULES_festivos DEFAULT (1),
    aplicar_descanso BIT NOT NULL CONSTRAINT DF_ATT_RULES_descanso DEFAULT (1),
    activo BIT NOT NULL CONSTRAINT DF_ATT_RULES_activo DEFAULT (1),
    creado_en DATETIME NOT NULL CONSTRAINT DF_ATT_RULES_creado DEFAULT (GETDATE()),
    actualizado_en DATETIME NOT NULL CONSTRAINT DF_ATT_RULES_actualizado DEFAULT (GETDATE())
  );
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_ATT_RULES_scope'
    AND object_id = OBJECT_ID('dbo.ATT_RULES')
)
BEGIN
  CREATE INDEX IX_ATT_RULES_scope
    ON dbo.ATT_RULES (activo, sucursal_id, horario_id, id DESC);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys
  WHERE name = 'FK_ATT_RULES_SUCURSALES'
    AND parent_object_id = OBJECT_ID('dbo.ATT_RULES')
)
  AND OBJECT_ID('dbo.SUCURSALES', 'U') IS NOT NULL
BEGIN
  ALTER TABLE dbo.ATT_RULES
    ADD CONSTRAINT FK_ATT_RULES_SUCURSALES
    FOREIGN KEY (sucursal_id)
    REFERENCES dbo.SUCURSALES (id);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys
  WHERE name = 'FK_ATT_RULES_HORARIOS'
    AND parent_object_id = OBJECT_ID('dbo.ATT_RULES')
)
  AND OBJECT_ID('dbo.ATT_RULES_HORARIOS', 'U') IS NOT NULL
BEGIN
  ALTER TABLE dbo.ATT_RULES
    ADD CONSTRAINT FK_ATT_RULES_HORARIOS
    FOREIGN KEY (horario_id)
    REFERENCES dbo.ATT_RULES_HORARIOS (id);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_ATT_RULES_tolerancia'
    AND parent_object_id = OBJECT_ID('dbo.ATT_RULES')
)
BEGIN
  ALTER TABLE dbo.ATT_RULES
    ADD CONSTRAINT CK_ATT_RULES_tolerancia
    CHECK (tolerancia_retardo_minutos >= 0 AND tolerancia_retardo_minutos <= 240);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_ATT_RULES_jornada'
    AND parent_object_id = OBJECT_ID('dbo.ATT_RULES')
)
BEGIN
  ALTER TABLE dbo.ATT_RULES
    ADD CONSTRAINT CK_ATT_RULES_jornada
    CHECK (horas_jornada_minutos >= 60 AND horas_jornada_minutos <= 1440);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_ATT_RULES_ot_min'
    AND parent_object_id = OBJECT_ID('dbo.ATT_RULES')
)
BEGIN
  ALTER TABLE dbo.ATT_RULES
    ADD CONSTRAINT CK_ATT_RULES_ot_min
    CHECK (horas_extra_minimo_minutos >= 0 AND horas_extra_minimo_minutos <= 720);
END;
GO
