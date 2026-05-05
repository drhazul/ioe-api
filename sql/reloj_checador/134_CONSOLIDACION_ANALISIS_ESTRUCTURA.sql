SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
  134_CONSOLIDACION_ANALISIS_ESTRUCTURA.sql
  Cambios derivados del analisis de estructura de tablas:
  1. ATT_ASISTENCIA_ESTATUS: Eliminar campo PIN (informacion sensible)
  2. FESTIVOS: Crear tabla de control de dias festivos
  3. INCENTIVOS: Crear catalogo de incentivos
  4. HISTORICO_PUESTOS: puesto -> idrol, +id_incent, +estado, -colaborador_id
  5. COLABORADORES: +id_sueldo
*/

----------------------------------------------------------------------
-- 1. ATT_ASISTENCIA_ESTATUS: Eliminar campo PIN
----------------------------------------------------------------------
PRINT '>>> Iniciando: Eliminar PIN de ATT_ASISTENCIA_ESTATUS';

-- Eliminar indice que depende de la columna (no directamente, pero verificamos)
-- Primero validar si la columna existe
IF COL_LENGTH('dbo.ATT_ASISTENCIA_ESTATUS', 'pin') IS NOT NULL
BEGIN
    -- Verificar constraints que dependan de pin
    DECLARE @constraintPin NVARCHAR(200);
    
    SELECT @constraintPin = name 
    FROM sys.default_constraints 
    WHERE parent_object_id = OBJECT_ID('dbo.ATT_ASISTENCIA_ESTATUS')
      AND col_name(parent_object_id, parent_column_id) = 'pin';
    
    IF @constraintPin IS NOT NULL
    BEGIN
        EXEC('ALTER TABLE dbo.ATT_ASISTENCIA_ESTATUS DROP CONSTRAINT ' + @constraintPin);
        PRINT '   - Default constraint de pin eliminado';
    END
    
    -- Si existen datos, se mantienen; solo quitamos la columna del esquema nuevo.
    -- Como la columna no se usara mas, la eliminamos.
    ALTER TABLE dbo.ATT_ASISTENCIA_ESTATUS DROP COLUMN pin;
    PRINT '   - Columna pin eliminada de ATT_ASISTENCIA_ESTATUS';
END
ELSE
BEGIN
    PRINT '   - Columna pin ya no existe en ATT_ASISTENCIA_ESTATUS (omitido)';
END
GO

----------------------------------------------------------------------
-- 2. FESTIVOS: Crear tabla de control de dias festivos
----------------------------------------------------------------------
PRINT '>>> Iniciando: Crear tabla FESTIVOS';

IF OBJECT_ID('dbo.FESTIVOS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.FESTIVOS (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FESTIVOS PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL,
        fecha DATE NOT NULL,
        tipo VARCHAR(30) NOT NULL CONSTRAINT DF_FESTIVOS_tipo DEFAULT ('OFICIAL'),
        aplica_todo_pais BIT NOT NULL CONSTRAINT DF_FESTIVOS_aplica_todo_pais DEFAULT (1),
        descripcion VARCHAR(255) NULL,
        activo BIT NOT NULL CONSTRAINT DF_FESTIVOS_activo DEFAULT (1),
        creado_en DATETIME NOT NULL CONSTRAINT DF_FESTIVOS_creado_en DEFAULT (GETDATE()),
        actualizado_en DATETIME NOT NULL CONSTRAINT DF_FESTIVOS_actualizado_en DEFAULT (GETDATE())
    );
    PRINT '   - Tabla FESTIVOS creada';
END
ELSE
BEGIN
    PRINT '   - Tabla FESTIVOS ya existe (omitido)';
END
GO

-- Indice unico: no duplicar misma fecha
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UQ_FESTIVOS_fecha' AND object_id = OBJECT_ID('dbo.FESTIVOS')
)
BEGIN
    CREATE UNIQUE INDEX UQ_FESTIVOS_fecha ON dbo.FESTIVOS (fecha);
    PRINT '   - Indice UQ_FESTIVOS_fecha creado';
END
GO

-- Constraints CHECK tipo
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_FESTIVOS_tipo' AND parent_object_id = OBJECT_ID('dbo.FESTIVOS')
)
BEGIN
    ALTER TABLE dbo.FESTIVOS
        ADD CONSTRAINT CK_FESTIVOS_tipo
        CHECK (tipo IN ('OFICIAL', 'EMPRESARIAL', 'REGIONAL'));
    PRINT '   - Constraint CK_FESTIVOS_tipo creado';
END
GO

-- Seed basico: dias festivos oficiales Mexico 2025-2026
IF NOT EXISTS (SELECT 1 FROM dbo.FESTIVOS)
BEGIN
    INSERT INTO dbo.FESTIVOS (nombre, fecha, tipo, aplica_todo_pais, descripcion) VALUES
    ('Año Nuevo',          '2025-01-01', 'OFICIAL', 1, 'Descanso obligatorio LFT'),
    ('Dia de la Constitucion', '2025-02-03', 'OFICIAL', 1, 'Primer lunes de febrero'),
    ('Natalicio de Benito Juarez', '2025-03-17', 'OFICIAL', 1, 'Tercer lunes de marzo'),
    ('Dia del Trabajo',    '2025-05-01', 'OFICIAL', 1, 'Descanso obligatorio LFT'),
    ('Independencia de Mexico', '2025-09-16', 'OFICIAL', 1, 'Descanso obligatorio LFT'),
    ('Revolucion Mexicana', '2025-11-17', 'OFICIAL', 1, 'Tercer lunes de noviembre'),
    ('Navidad',            '2025-12-25', 'OFICIAL', 1, 'Descanso obligatorio LFT'),
    ('Año Nuevo',          '2026-01-01', 'OFICIAL', 1, 'Descanso obligatorio LFT'),
    ('Dia de la Constitucion', '2026-02-02', 'OFICIAL', 1, 'Primer lunes de febrero'),
    ('Natalicio de Benito Juarez', '2026-03-16', 'OFICIAL', 1, 'Tercer lunes de marzo'),
    ('Dia del Trabajo',    '2026-05-01', 'OFICIAL', 1, 'Descanso obligatorio LFT');
    PRINT '   - Datos semilla FESTIVOS insertados';
END
GO

----------------------------------------------------------------------
-- 3. INCENTIVOS: Crear catalogo de incentivos
----------------------------------------------------------------------
PRINT '>>> Iniciando: Crear tabla INCENTIVOS';

IF OBJECT_ID('dbo.INCENTIVOS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.INCENTIVOS (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_INCENTIVOS PRIMARY KEY,
        tipo_incentivo VARCHAR(60) NOT NULL,
        porcentaje DECIMAL(6,2) NULL,
        importe DECIMAL(18,2) NULL,
        estado BIT NOT NULL CONSTRAINT DF_INCENTIVOS_estado DEFAULT (1),
        creado_en DATETIME NOT NULL CONSTRAINT DF_INCENTIVOS_creado_en DEFAULT (GETDATE()),
        actualizado_en DATETIME NOT NULL CONSTRAINT DF_INCENTIVOS_actualizado_en DEFAULT (GETDATE())
    );
    PRINT '   - Tabla INCENTIVOS creada';
END
ELSE
BEGIN
    PRINT '   - Tabla INCENTIVOS ya existe (omitido)';
END
GO

-- Check: al menos uno de porcentaje o importe debe tener valor
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_INCENTIVOS_porc_o_importe' AND parent_object_id = OBJECT_ID('dbo.INCENTIVOS')
)
BEGIN
    ALTER TABLE dbo.INCENTIVOS
        ADD CONSTRAINT CK_INCENTIVOS_porc_o_importe
        CHECK (porcentaje IS NOT NULL OR importe IS NOT NULL);
    PRINT '   - Constraint CK_INCENTIVOS_porc_o_importe creado';
END
GO

-- Seed de incentivos ejemplo
IF NOT EXISTS (SELECT 1 FROM dbo.INCENTIVOS)
BEGIN
    INSERT INTO dbo.INCENTIVOS (tipo_incentivo, porcentaje, importe) VALUES
    ('CAPACITACION', 5.00, NULL),
    ('APOYO', NULL, 500.00),
    ('TRANSPORTE', NULL, 300.00),
    ('ALIMENTACION', NULL, 250.00),
    ('PRODUCTIVIDAD', 10.00, NULL),
    ('ASISTENCIA_PERFECTA', NULL, 400.00);
    PRINT '   - Datos semilla INCENTIVOS insertados';
END
GO

----------------------------------------------------------------------
-- 4. HISTORICO_PUESTOS: Reestructuracion
--    puesto VARCHAR -> idrol INT (FK a ROL.IDROL)
--    +id_incent (FK a INCENTIVOS.id)
--    +estado BIT
--    -colaborador_id (la relacion se invierte hacia COLABORADORES.id_sueldo)
----------------------------------------------------------------------
PRINT '>>> Iniciando: Reestructurar HISTORICO_PUESTOS';

-- 4a. Si la tabla no existe, crearla con la nueva estructura
IF OBJECT_ID('dbo.HISTORICO_PUESTOS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.HISTORICO_PUESTOS (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HISTORICO_PUESTOS PRIMARY KEY,
        idrol INT NOT NULL,
        id_incent INT NULL,
        sueldo DECIMAL(18,2) NOT NULL,
        fecha_cambio DATE NOT NULL,
        estado BIT NOT NULL CONSTRAINT DF_HISTORICO_PUESTOS_estado DEFAULT (1),
        creado_en DATETIME NOT NULL CONSTRAINT DF_HISTORICO_PUESTOS_creado_en DEFAULT (GETDATE()),
        actualizado_en DATETIME NOT NULL CONSTRAINT DF_HISTORICO_PUESTOS_actualizado_en DEFAULT (GETDATE())
    );
    PRINT '   - Tabla HISTORICO_PUESTOS creada con nueva estructura';
END
ELSE
BEGIN
    -- La tabla ya existe. Aplicar cambios incrementales.
    
    -- 4a. Eliminar FK constraint que dependa de colaborador_id
    IF EXISTS (
        SELECT 1 FROM sys.foreign_keys
        WHERE name = 'FK_HISTORICO_PUESTOS_COLABORADORES'
          AND parent_object_id = OBJECT_ID('dbo.HISTORICO_PUESTOS')
    )
    BEGIN
        ALTER TABLE dbo.HISTORICO_PUESTOS DROP CONSTRAINT FK_HISTORICO_PUESTOS_COLABORADORES;
        PRINT '   - FK FK_HISTORICO_PUESTOS_COLABORADORES eliminada';
    END

    -- 4b. Eliminar indice que depende de colaborador_id
    IF EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'IX_HISTORICO_PUESTOS_colab_fecha'
          AND object_id = OBJECT_ID('dbo.HISTORICO_PUESTOS')
    )
    BEGIN
        DROP INDEX IX_HISTORICO_PUESTOS_colab_fecha ON dbo.HISTORICO_PUESTOS;
        PRINT '   - Indice IX_HISTORICO_PUESTOS_colab_fecha eliminado';
    END

    -- 4c. Renombrar columna puesto -> idrol (si existe puesto como VARCHAR)
    IF COL_LENGTH('dbo.HISTORICO_PUESTOS', 'puesto') IS NOT NULL
      AND COL_LENGTH('dbo.HISTORICO_PUESTOS', 'idrol') IS NULL
    BEGIN
        -- Si puesto es VARCHAR, debemos cambiar el tipo. 
        -- MSSQL no permite cambiar tipo cuando tiene datos facilmente.
        -- Estrategia: renombrar puesto a puesto_legacy, agregar idrol como nueva columna.
        EXEC sp_rename 'dbo.HISTORICO_PUESTOS.puesto', 'puesto_legacy', 'COLUMN';
        PRINT '   - Columna puesto renombrada a puesto_legacy';
        
        ALTER TABLE dbo.HISTORICO_PUESTOS ADD idrol INT NOT NULL CONSTRAINT DF_HISTORICO_PUESTOS_idrol DEFAULT (1);
        PRINT '   - Columna idrol agregada (INT, default 1)';
    END
    ELSE IF COL_LENGTH('dbo.HISTORICO_PUESTOS', 'idrol') IS NULL
    BEGIN
        ALTER TABLE dbo.HISTORICO_PUESTOS ADD idrol INT NOT NULL CONSTRAINT DF_HISTORICO_PUESTOS_idrol DEFAULT (1);
        PRINT '   - Columna idrol agregada (INT, default 1)';
    END
    ELSE
    BEGIN
        PRINT '   - Columna idrol ya existe (omitido)';
    END

    -- 4d. Agregar id_incent
    IF COL_LENGTH('dbo.HISTORICO_PUESTOS', 'id_incent') IS NULL
    BEGIN
        ALTER TABLE dbo.HISTORICO_PUESTOS ADD id_incent INT NULL;
        PRINT '   - Columna id_incent agregada';
    END
    ELSE
    BEGIN
        PRINT '   - Columna id_incent ya existe (omitido)';
    END

    -- 4e. Agregar estado
    IF COL_LENGTH('dbo.HISTORICO_PUESTOS', 'estado') IS NULL
    BEGIN
        ALTER TABLE dbo.HISTORICO_PUESTOS 
            ADD estado BIT NOT NULL CONSTRAINT DF_HISTORICO_PUESTOS_estado DEFAULT (1);
        PRINT '   - Columna estado agregada';
    END
    ELSE
    BEGIN
        PRINT '   - Columna estado ya existe (omitido)';
    END

    -- 4f. Agregar creado_en
    IF COL_LENGTH('dbo.HISTORICO_PUESTOS', 'creado_en') IS NULL
    BEGIN
        ALTER TABLE dbo.HISTORICO_PUESTOS 
            ADD creado_en DATETIME NOT NULL CONSTRAINT DF_HISTORICO_PUESTOS_creado_en DEFAULT (GETDATE());
        PRINT '   - Columna creado_en agregada';
    END
    ELSE
    BEGIN
        PRINT '   - Columna creado_en ya existe (omitido)';
    END

    -- 4g. Agregar actualizado_en
    IF COL_LENGTH('dbo.HISTORICO_PUESTOS', 'actualizado_en') IS NULL
    BEGIN
        ALTER TABLE dbo.HISTORICO_PUESTOS 
            ADD actualizado_en DATETIME NOT NULL CONSTRAINT DF_HISTORICO_PUESTOS_actualizado_en DEFAULT (GETDATE());
        PRINT '   - Columna actualizado_en agregada';
    END
    ELSE
    BEGIN
        PRINT '   - Columna actualizado_en ya existe (omitido)';
    END

    -- 4h. Eliminar colaborador_id (si existe)
    IF COL_LENGTH('dbo.HISTORICO_PUESTOS', 'colaborador_id') IS NOT NULL
    BEGIN
        -- Verificar default constraint
        DECLARE @constraintColabId NVARCHAR(200);
        SELECT @constraintColabId = name 
        FROM sys.default_constraints 
        WHERE parent_object_id = OBJECT_ID('dbo.HISTORICO_PUESTOS')
          AND col_name(parent_object_id, parent_column_id) = 'colaborador_id';
        
        IF @constraintColabId IS NOT NULL
        BEGIN
            EXEC('ALTER TABLE dbo.HISTORICO_PUESTOS DROP CONSTRAINT ' + @constraintColabId);
        END
        
        ALTER TABLE dbo.HISTORICO_PUESTOS DROP COLUMN colaborador_id;
        PRINT '   - Columna colaborador_id eliminada de HISTORICO_PUESTOS';
    END
    ELSE
    BEGIN
        PRINT '   - Columna colaborador_id ya no existe (omitido)';
    END
END
GO

-- FK: idrol -> ROL.IDROL
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_HISTORICO_PUESTOS_ROL'
      AND parent_object_id = OBJECT_ID('dbo.HISTORICO_PUESTOS')
) AND OBJECT_ID('dbo.ROL', 'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.HISTORICO_PUESTOS
        ADD CONSTRAINT FK_HISTORICO_PUESTOS_ROL
        FOREIGN KEY (idrol)
        REFERENCES dbo.ROL (IDROL);
    PRINT '   - FK FK_HISTORICO_PUESTOS_ROL creada';
END
GO

-- FK: id_incent -> INCENTIVOS.id
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_HISTORICO_PUESTOS_INCENTIVOS'
      AND parent_object_id = OBJECT_ID('dbo.HISTORICO_PUESTOS')
) AND OBJECT_ID('dbo.INCENTIVOS', 'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.HISTORICO_PUESTOS
        ADD CONSTRAINT FK_HISTORICO_PUESTOS_INCENTIVOS
        FOREIGN KEY (id_incent)
        REFERENCES dbo.INCENTIVOS (id);
    PRINT '   - FK FK_HISTORICO_PUESTOS_INCENTIVOS creada';
END
GO

-- Nuevo indice
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_HISTORICO_PUESTOS_fecha'
      AND object_id = OBJECT_ID('dbo.HISTORICO_PUESTOS')
)
BEGIN
    CREATE INDEX IX_HISTORICO_PUESTOS_fecha ON dbo.HISTORICO_PUESTOS (fecha_cambio DESC, idrol);
    PRINT '   - Indice IX_HISTORICO_PUESTOS_fecha creado';
END
GO

----------------------------------------------------------------------
-- 5. COLABORADORES: Agregar id_sueldo (FK -> HISTORICO_PUESTOS.id)
----------------------------------------------------------------------
PRINT '>>> Iniciando: Agregar id_sueldo a COLABORADORES';

IF COL_LENGTH('dbo.COLABORADORES', 'id_sueldo') IS NULL
BEGIN
    ALTER TABLE dbo.COLABORADORES ADD id_sueldo BIGINT NULL;
    PRINT '   - Columna id_sueldo agregada a COLABORADORES';
END
ELSE
BEGIN
    PRINT '   - Columna id_sueldo ya existe en COLABORADORES (omitido)';
END
GO

-- FK: id_sueldo -> HISTORICO_PUESTOS.id
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_COLABORADORES_HISTORICO_PUESTOS'
      AND parent_object_id = OBJECT_ID('dbo.COLABORADORES')
) AND OBJECT_ID('dbo.HISTORICO_PUESTOS', 'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.COLABORADORES
        ADD CONSTRAINT FK_COLABORADORES_HISTORICO_PUESTOS
        FOREIGN KEY (id_sueldo)
        REFERENCES dbo.HISTORICO_PUESTOS (id);
    PRINT '   - FK FK_COLABORADORES_HISTORICO_PUESTOS creada';
END
GO

PRINT '>>> Script 134 completado exitosamente.';
GO
